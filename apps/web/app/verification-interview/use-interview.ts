import { useEffect, useRef, useState } from "react";

import { API_URL, SignedOutError, apiFetch } from "../session/session";

export const MAX_ANSWER = 10_000;

export type Turn = { id: number; from: "ai" | "you"; text: string; sequence?: number };

// idle: the socket was never opened. asking: a question waits for its answer. reading: our
// answer is with the interviewer. The last four end the attempt, one way or another.
export type Status = "idle" | "connecting" | "asking" | "reading" | "complete" | "left" | "dropped" | "refused";

export type Problem = "required" | "tooLong" | "failed";

type Frame = { type?: string; text?: unknown; sequence?: unknown; code?: unknown };

// The conversation with the interviewer over the attempt's WebSocket. The socket opens only
// when begin() is called, never on render: the API ends the attempt for good if it closes
// before the last answer.
export function useInterview(attemptId: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const alive = useRef(true);
  const received = useRef(false);
  const over = useRef(false);
  const sent = useRef("");
  const nextId = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      socket.current?.close();
    };
  }, []);

  const live = status === "connecting" || status === "asking" || status === "reading";
  useEffect(() => {
    if (!live) return;
    // The browser shows its own words; setting returnValue is what makes it ask.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live]);

  const add = (turn: Omit<Turn, "id">) => setTurns((all) => [...all, { ...turn, id: nextId.current++ }]);

  const handle = (raw: unknown) => {
    let frame: Frame;
    try {
      frame = JSON.parse(String(raw));
    } catch {
      return;
    }
    const text = typeof frame.text === "string" ? frame.text : null;
    if (frame.type === "assistant_message" && text) add({ from: "ai", text });
    else if (frame.type === "question" && text) {
      add({ from: "ai", text, sequence: typeof frame.sequence === "number" ? frame.sequence : undefined });
      setStatus("asking");
    } else if (frame.type === "error") {
      // the question is still open: give the answer back
      setDraft(sent.current);
      setProblem(frame.code === "ANSWER_REQUIRED" ? "required" : frame.code === "ANSWER_TOO_LONG" ? "tooLong" : "failed");
      setStatus("asking");
    } else if (frame.type === "interview_complete") {
      over.current = true;
      setStatus("complete");
    } else if (frame.type === "interview_incomplete") {
      over.current = true;
      setStatus("left");
    }
  };

  const begin = async () => {
    setStatus("connecting");
    const attempt = `/v1/me/verifications/${encodeURIComponent(attemptId)}`;
    // A one-use ticket opens the socket, so the access token never goes in a URL, where
    // servers and proxies log it.
    let ticket: string;
    try {
      const response = await apiFetch(`${attempt}/interview-ticket`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.data?.ticket !== "string") {
        if (alive.current) setStatus("refused");
        return;
      }
      ticket = body.data.ticket;
    } catch (error) {
      // a signed-out person is already being sent to sign-in
      if (!(error instanceof SignedOutError) && alive.current) setStatus("refused");
      return;
    }
    if (!alive.current) return;
    const ws = new WebSocket(`${API_URL.replace(/^http/, "ws")}${attempt}/interview?ticket=${encodeURIComponent(ticket)}`);
    socket.current = ws;
    ws.onmessage = (event) => {
      received.current = true;
      handle(event.data);
    };
    // Never reconnect: a second socket would find the attempt already ended.
    const ended = () => {
      if (over.current) return;
      over.current = true;
      ws.close();
      setStatus(received.current ? "dropped" : "refused");
    };
    ws.onclose = ended;
    ws.onerror = ended;
  };

  const send = () => {
    if (status !== "asking") return;
    const text = draft.trim();
    if (!text || text.length > MAX_ANSWER) {
      setProblem(text ? "tooLong" : "required");
      return;
    }
    sent.current = draft;
    socket.current?.send(JSON.stringify({ type: "answer", text }));
    add({ from: "you", text });
    setDraft("");
    setProblem(null);
    setStatus("reading");
  };

  // The server confirms with interview_incomplete and closes; the screen does not wait for it.
  const leave = () => {
    over.current = true;
    socket.current?.send(JSON.stringify({ type: "abandon" }));
    setStatus("left");
  };

  const edit = (value: string) => {
    setDraft(value);
    setProblem(null);
  };

  return { status, turns, draft, problem, begin, send, leave, edit };
}
