from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import (
    GEMINI_API_KEY,
    GEMINI_INTERVIEW_MODEL,
    GROQ_API_KEY,
    GROQ_GUARD_MODEL,
    GROQ_INTERVIEW_MODEL,
    VERIFICATION_INTERVIEW_MAX_TURNS,
)
from app.core.security import decode_access_token
from app.database import async_session
from app.models.users import (
    InterviewStatus,
    User,
    UserRole,
    VerificationInterview,
    VerificationInterviewTurn,
    VerificationPhase,
    VerificationSession,
    VerificationStatus,
)
from app.services.gemini_interview import GeminiInterviewAgent
from app.services.groq_interview import (
    GroqInterviewAgent,
    GroqPromptGuard,
    GroqWhisperTranscriber,
)
from app.services.interview import (
    AnswerGuard,
    DefaultInterviewAgent,
    FallbackInterviewAgent,
    InterviewAgent,
    InterviewHistoryItem,
    InterviewUnavailable,
    UnconfiguredAnswerGuard,
    UnconfiguredAudioTranscriber,
    interview_completed_at,
    parse_interview_message,
)

router = APIRouter()
MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_ANSWER_CHARS = 10_000


async def websocket_user(token: str | None, db) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    try:
        user_id = UUID(str(payload["sub"]))
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


async def load_interview_session(session_id: UUID, user_id: UUID, db) -> VerificationSession | None:
    result = await db.execute(
        select(VerificationSession)
        .options(
            selectinload(VerificationSession.user_role).selectinload(UserRole.role),
            selectinload(VerificationSession.interview).selectinload(VerificationInterview.turns),
        )
        .where(VerificationSession.id == session_id, VerificationSession.user_id == user_id)
    )
    return result.scalar_one_or_none()


def interview_agent() -> InterviewAgent:
    agent: InterviewAgent = DefaultInterviewAgent()
    if GEMINI_API_KEY and GEMINI_INTERVIEW_MODEL:
        agent = FallbackInterviewAgent(GeminiInterviewAgent(), agent)
    if GROQ_API_KEY and GROQ_INTERVIEW_MODEL:
        agent = FallbackInterviewAgent(GroqInterviewAgent(), agent)
    return agent


def interview_history(interview: VerificationInterview) -> list[InterviewHistoryItem]:
    return [
        InterviewHistoryItem(
            sequence=turn.sequence,
            question=turn.question,
            answer=turn.answer_text,
        )
        for turn in interview.turns
        if turn.answer_text
    ]


def mark_interview_incomplete(
    interview: VerificationInterview, session: VerificationSession
) -> None:
    interview.status = InterviewStatus.INCOMPLETE
    interview.completed_at = interview_completed_at()
    session.status = VerificationStatus.ABANDONED
    session.current_phase = None


def complete_interview(interview: VerificationInterview, session: VerificationSession) -> None:
    interview.status = InterviewStatus.COMPLETED
    interview.completed_at = interview_completed_at()
    session.current_phase = VerificationPhase.REPORT_GENERATION


async def send_assistant_message(websocket: WebSocket, kind: str, text: str) -> None:
    await websocket.send_json({"type": "assistant_message", "kind": kind, "text": text})


async def send_question(websocket: WebSocket, turn: VerificationInterviewTurn) -> None:
    await websocket.send_json(
        {
            "type": "question",
            "turn_id": str(turn.id),
            "sequence": turn.sequence,
            "text": turn.question,
        }
    )


@router.websocket("/me/verifications/{session_id}/interview")
async def interview_stream(websocket: WebSocket, session_id: UUID) -> None:
    async with async_session() as db:
        user = await websocket_user(websocket.query_params.get("token"), db)
        if not user:
            await websocket.close(code=1008, reason="Authentication required.")
            return

        session = await load_interview_session(session_id, user.id, db)
        if (
            not session
            or session.status != VerificationStatus.IN_PROGRESS
            or session.current_phase != VerificationPhase.TECHNICAL_DEFENCE
        ):
            await websocket.close(code=1008, reason="Interview is not available.")
            return

        interview = session.interview
        if interview is None:
            interview = VerificationInterview(verification_session_id=session.id)
            interview.turns = []
            session.interview = interview
            db.add(interview)
            await db.flush()

        agent = interview_agent()
        transcriber = GroqWhisperTranscriber() if GROQ_API_KEY else UnconfiguredAudioTranscriber()
        guard: AnswerGuard = (
            GroqPromptGuard() if GROQ_API_KEY and GROQ_GUARD_MODEL else UnconfiguredAnswerGuard()
        )
        role_slug = session.user_role.role.slug
        if not interview.turns:
            opening = await agent.opening(role_slug, session.ai_result)
            interview.welcome_message = opening.welcome
            interview.turns.append(
                VerificationInterviewTurn(
                    sequence=interview.turn_number,
                    question=opening.question,
                )
            )
        elif not interview.welcome_message:
            opening = await DefaultInterviewAgent().opening(role_slug, session.ai_result)
            interview.welcome_message = opening.welcome
        await db.commit()
        await websocket.accept()

        current_turn = interview.turns[-1]
        await send_assistant_message(websocket, "welcome", interview.welcome_message)
        await send_question(websocket, current_turn)
        audio_buffer = bytearray()

        try:
            while True:
                message = await websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    if interview.status == InterviewStatus.ACTIVE:
                        mark_interview_incomplete(interview, session)
                        await db.commit()
                    return
                if message.get("bytes") is not None:
                    audio_buffer.extend(message["bytes"])
                    if len(audio_buffer) > MAX_AUDIO_BYTES:
                        await websocket.send_json({"type": "error", "code": "AUDIO_TOO_LARGE"})
                        audio_buffer.clear()
                    else:
                        await websocket.send_json(
                            {"type": "audio_buffered", "bytes": len(audio_buffer)}
                        )
                    continue

                raw_text = message.get("text")
                if raw_text is None:
                    continue
                try:
                    event = parse_interview_message(raw_text)
                except InterviewUnavailable as error:
                    await websocket.send_json(
                        {"type": "error", "code": "INVALID_MESSAGE", "message": str(error)}
                    )
                    continue

                event_type = event["type"]
                if event_type == "answer_end":
                    if not audio_buffer:
                        await websocket.send_json({"type": "error", "code": "AUDIO_MISSING"})
                        continue
                    try:
                        answer = await transcriber.transcribe(
                            bytes(audio_buffer),
                            websocket.query_params.get("audio_content_type", "audio/webm"),
                        )
                    except InterviewUnavailable as error:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "code": "TRANSCRIPTION_UNAVAILABLE",
                                "message": str(error),
                            }
                        )
                        continue
                    audio_buffer.clear()
                elif event_type == "answer":
                    answer = event.get("text")
                    if not isinstance(answer, str) or not answer.strip():
                        await websocket.send_json({"type": "error", "code": "ANSWER_REQUIRED"})
                        continue
                    if len(answer) > MAX_ANSWER_CHARS:
                        await websocket.send_json({"type": "error", "code": "ANSWER_TOO_LONG"})
                        continue
                elif event_type == "abandon":
                    mark_interview_incomplete(interview, session)
                    await db.commit()
                    await websocket.send_json({"type": "interview_incomplete"})
                    break
                else:
                    await websocket.send_json({"type": "error", "code": "UNKNOWN_MESSAGE_TYPE"})
                    continue

                answered_turn = current_turn
                answered_turn.answer_text = answer.strip()
                answered_turn.security_flags = await guard.inspect(answered_turn.answer_text)
                history = interview_history(interview)
                if answered_turn.sequence >= VERIFICATION_INTERVIEW_MAX_TURNS:
                    closing = await agent.closing(role_slug, session.ai_result, history)
                    answered_turn.acknowledgement = closing.acknowledgement
                    interview.closing_message = closing.closing
                    complete_interview(interview, session)
                    await db.commit()
                else:
                    next_turn = answered_turn.sequence + 1
                    continuation = await agent.continuation(
                        role_slug,
                        next_turn,
                        session.ai_result,
                        history,
                    )
                    answered_turn.acknowledgement = continuation.acknowledgement
                    interview.turn_number = next_turn
                    current_turn = VerificationInterviewTurn(
                        sequence=next_turn,
                        question=continuation.question,
                    )
                    interview.turns.append(current_turn)
                    await db.commit()

                for flag in answered_turn.security_flags:
                    await websocket.send_json(
                        {"type": "security_signal", "severity": "warning", "code": flag}
                    )
                await websocket.send_json(
                    {"type": "answer_saved", "turn_id": str(answered_turn.id)}
                )
                await send_assistant_message(
                    websocket,
                    "acknowledgement",
                    answered_turn.acknowledgement,
                )
                if interview.status == InterviewStatus.COMPLETED:
                    await send_assistant_message(websocket, "closing", interview.closing_message)
                    await websocket.send_json(
                        {"type": "interview_complete", "status": "processing"}
                    )
                    break
                await send_question(websocket, current_turn)
        except WebSocketDisconnect:
            if interview.status == InterviewStatus.ACTIVE:
                mark_interview_incomplete(interview, session)
                await db.commit()
            return
