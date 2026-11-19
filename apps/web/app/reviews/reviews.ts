import type { Lang } from "../locales";
import { ROLES } from "../onboarding/options";
import { IdeaError } from "../ideas/ideas-api";
import { apiFetch } from "../session/session";

// An attempt waiting for review, as the API answers it. The AI's result and the evidence are
// loose JSON written by an AI or by the applicant, so they stay `unknown` until readCase.
export type Attempt = {
  id: string;
  role: string;
  role_name: string;
  attempt_number: number;
  language: Lang;
  evidence: unknown;
  ai_result: unknown;
  created_at: string;
  completed_at: string | null;
};

export type Decision = "passed" | "failed";

export function roleName(attempt: Attempt, lang: Lang): string {
  return ROLES.find((role) => role.slug === attempt.role)?.name[lang] ?? attempt.role_name;
}

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const texts = (value: unknown): string[] => list(value).flatMap((item) => text(item) ?? []);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function repositories(attempt: Attempt): string[] {
  return list(attempt.evidence).flatMap((item) => text(obj(item).repository_url) ?? []);
}

// Only addresses on GitHub become links: anything else the applicant sent stays plain text.
export const isGithub = (address: string) => address.startsWith("https://github.com/");

// The parts of the AI's result, each one empty or null when the API left it out.
export function readCase(attempt: Attempt) {
  const result = obj(attempt.ai_result);
  const transcript = obj(result.interview_transcript);
  const analysis = obj(result.codebase_analysis);
  const report = obj(result.final_report);
  return {
    welcome: text(transcript.welcome),
    turns: list(transcript.turns).map((item, index) => {
      const turn = obj(item);
      return {
        number: num(turn.sequence) ?? index + 1,
        question: text(turn.question),
        answer: text(turn.answer),
        flags: texts(turn.security_flags),
      };
    }),
    analysis: {
      summary: text(analysis.summary),
      criteria: list(analysis.criterion_assessments).flatMap((item) => {
        const criterion = obj(item);
        const name = text(criterion.criterion);
        return name
          ? [{ name, score: num(criterion.score), rationale: text(criterion.rationale), files: texts(criterion.evidence) }]
          : [];
      }),
    },
    report: Object.keys(report).length
      ? {
          summary: text(report.summary),
          code: texts(report.codebase_findings),
          interview: texts(report.interview_findings),
          concerns: texts(report.concerns),
          flags: texts(report.security_flags),
          score: num(report.score),
          confidence: num(report.confidence),
        }
      : null,
  };
}

async function readBody(response: Response) {
  return (await response.json().catch(() => null)) as { data?: unknown; next_offset?: unknown } | null;
}

export async function loadQueue(offset: number): Promise<{ items: Attempt[]; next: number | null }> {
  const response = await apiFetch(`/v1/reviews/verifications?offset=${offset}&limit=20`);
  const body = await readBody(response);
  if (!response.ok || !Array.isArray(body?.data)) throw new Error(`GET the review queue answered ${response.status}`);
  return { items: body.data, next: typeof body.next_offset === "number" ? body.next_offset : null };
}

// Null when the case is not in this reviewer's queue any more. An id that is not an attempt id
// at all (a mistyped address) is answered 422: it is as closed as a decided case.
export async function loadCase(id: string): Promise<Attempt | null> {
  const response = await apiFetch(`/v1/reviews/verifications/${encodeURIComponent(id)}`);
  if (response.status === 404 || response.status === 422) return null;
  const body = await readBody(response);
  if (!response.ok || !obj(body?.data).id) throw new Error(`GET a review case answered ${response.status}`);
  return body?.data as Attempt;
}

// "closed" when someone else decided the case first. Any other failure throws, with the API's
// code, so the form can tell the demo's refusal from a failure.
export async function decide(id: string, decision: Decision, notes: string): Promise<"saved" | "closed"> {
  const response = await apiFetch(`/v1/reviews/verifications/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, notes }),
  });
  if (response.status === 404) return "closed";
  if (!response.ok) {
    const code = (await response.json().catch(() => null))?.detail?.code;
    throw new IdeaError(response.status, typeof code === "string" ? code : "UNKNOWN");
  }
  return "saved";
}
