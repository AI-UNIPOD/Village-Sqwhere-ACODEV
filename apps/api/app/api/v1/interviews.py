from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import (
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
from app.services.groq_interview import (
    GroqInterviewAgent,
    GroqPromptGuard,
    GroqWhisperTranscriber,
)
from app.services.interview import (
    AnswerGuard,
    DefaultInterviewQuestionProvider,
    InterviewUnavailable,
    UnconfiguredAnswerGuard,
    UnconfiguredAudioTranscriber,
    interview_completed_at,
    parse_interview_message,
)

router = APIRouter()
MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_ANSWER_CHARS = 10_000


async def next_question(
    provider, fallback, role_slug: str, turn_number: int, analysis: dict | None
):
    try:
        return await provider.question(role_slug, turn_number, analysis)
    except InterviewUnavailable:
        return await fallback.question(role_slug, turn_number, analysis)


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

        default_questions = DefaultInterviewQuestionProvider()
        question_provider = (
            GroqInterviewAgent() if GROQ_API_KEY and GROQ_INTERVIEW_MODEL else default_questions
        )
        transcriber = GroqWhisperTranscriber() if GROQ_API_KEY else UnconfiguredAudioTranscriber()
        guard: AnswerGuard = (
            GroqPromptGuard() if GROQ_API_KEY and GROQ_GUARD_MODEL else UnconfiguredAnswerGuard()
        )
        if not interview.turns:
            question = await next_question(
                question_provider,
                default_questions,
                session.user_role.role.slug,
                interview.turn_number,
                session.ai_result,
            )
            interview.turns.append(
                VerificationInterviewTurn(sequence=interview.turn_number, question=question.text)
            )
        await db.commit()
        await websocket.accept()

        current_turn = interview.turns[-1]
        await websocket.send_json(
            {
                "type": "question",
                "turn_id": str(current_turn.id),
                "sequence": current_turn.sequence,
                "text": current_turn.question,
            }
        )
        audio_buffer = bytearray()

        try:
            while True:
                message = await websocket.receive()
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
                    interview.status = InterviewStatus.INCOMPLETE
                    interview.completed_at = interview_completed_at()
                    session.status = VerificationStatus.ABANDONED
                    session.current_phase = None
                    await db.commit()
                    await websocket.send_json({"type": "interview_incomplete"})
                    break
                else:
                    await websocket.send_json({"type": "error", "code": "UNKNOWN_MESSAGE_TYPE"})
                    continue

                current_turn.answer_text = answer.strip()
                current_turn.security_flags = await guard.inspect(current_turn.answer_text)
                for flag in current_turn.security_flags:
                    await websocket.send_json(
                        {"type": "security_signal", "severity": "warning", "code": flag}
                    )
                await db.commit()
                await websocket.send_json({"type": "answer_saved", "turn_id": str(current_turn.id)})
                if current_turn.sequence >= VERIFICATION_INTERVIEW_MAX_TURNS:
                    interview.status = InterviewStatus.COMPLETED
                    interview.completed_at = interview_completed_at()
                    session.current_phase = VerificationPhase.REPORT_GENERATION
                    await db.commit()
                    await websocket.send_json(
                        {"type": "interview_complete", "status": "processing"}
                    )
                    break

                interview.turn_number += 1
                question = await next_question(
                    question_provider,
                    default_questions,
                    session.user_role.role.slug,
                    interview.turn_number,
                    session.ai_result,
                )
                current_turn = VerificationInterviewTurn(
                    sequence=interview.turn_number,
                    question=question.text,
                    interview_id=interview.id,
                )
                db.add(current_turn)
                await db.commit()
                await websocket.send_json(
                    {
                        "type": "question",
                        "turn_id": str(current_turn.id),
                        "sequence": current_turn.sequence,
                        "text": current_turn.question,
                    }
                )
        except WebSocketDisconnect:
            if interview.status == InterviewStatus.ACTIVE:
                interview.status = InterviewStatus.INCOMPLETE
                interview.completed_at = interview_completed_at()
                session.status = VerificationStatus.ABANDONED
                session.current_phase = None
                await db.commit()
            return
