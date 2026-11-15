import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
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
from app.schemas.verification import InterviewTicket, InterviewTicketResponse
from app.services.gemini_interview import GeminiAudioTranscriber, GeminiInterviewAgent
from app.services.groq_interview import (
    GroqInterviewAgent,
    GroqPromptGuard,
    GroqWhisperTranscriber,
)
from app.services.interview import (
    AnswerGuard,
    AudioTranscriber,
    DefaultInterviewAgent,
    FallbackAudioTranscriber,
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

# One-use tickets to open the interview socket, so the access token never goes in a URL, where
# servers and proxies log it. Kept in memory like the sign-in codes in auth.py: the API runs
# as one process. ticket -> (user id, session id, expires at)
TICKET_LIFETIME = timedelta(seconds=60)
_TICKETS: dict[str, tuple[UUID, UUID, datetime]] = {}


def issue_ticket(user_id: UUID, session_id: UUID) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    for key in [key for key, value in _TICKETS.items() if value[2] <= now]:
        del _TICKETS[key]
    ticket = secrets.token_urlsafe(32)
    expires_at = now + TICKET_LIFETIME
    _TICKETS[ticket] = (user_id, session_id, expires_at)
    return ticket, expires_at


def redeem_ticket(ticket: str, session_id: UUID) -> UUID | None:
    """The user a ticket was issued to, once, while it lasts and only for its own session."""
    found = _TICKETS.pop(ticket, None)
    if found is None:
        return None
    user_id, ticket_session_id, expires_at = found
    if ticket_session_id != session_id or expires_at <= datetime.now(UTC):
        return None
    return user_id


MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_ANSWER_CHARS = 10_000
# The audio type comes from the client and ends up in a request header, so only these exact
# values are accepted, and only a value from this set is ever sent on.
DEFAULT_AUDIO_TYPE = "audio/webm"
ALLOWED_AUDIO_TYPES = frozenset(
    {
        "audio/webm",
        "audio/webm;codecs=opus",
        "audio/ogg",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/flac",
    }
)


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


async def ticket_user(ticket: str, session_id: UUID, db) -> User | None:
    user_id = redeem_ticket(ticket, session_id)
    if user_id is None:
        return None
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    return result.scalar_one_or_none()


def interview_open(session: VerificationSession | None) -> bool:
    return (
        session is not None
        and session.status == VerificationStatus.IN_PROGRESS
        and session.current_phase == VerificationPhase.TECHNICAL_DEFENCE
    )


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


@router.post(
    "/me/verifications/{session_id}/interview-ticket",
    response_model=InterviewTicketResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview_ticket(
    session_id: UUID, current_user: CurrentUser, db: DbSession
) -> InterviewTicketResponse:
    session = await load_interview_session(session_id, current_user.id, db)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Verification attempt not found."},
        )
    if not interview_open(session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INTERVIEW_NOT_AVAILABLE",
                "message": "This attempt is not at its interview. Check its status and try again.",
            },
        )
    ticket, expires_at = issue_ticket(current_user.id, session_id)
    return InterviewTicketResponse(data=InterviewTicket(ticket=ticket, expires_at=expires_at))


@router.websocket("/me/verifications/{session_id}/interview")
async def interview_stream(websocket: WebSocket, session_id: UUID) -> None:
    async with async_session() as db:
        ticket = websocket.query_params.get("ticket")
        if ticket is not None:
            user = await ticket_user(ticket, session_id, db)
        else:
            # deprecated: a token in the URL ends up in logs; removed once the web sends tickets
            user = await websocket_user(websocket.query_params.get("token"), db)
        if not user:
            await websocket.close(code=1008, reason="Authentication required.")
            return
        if user.is_demo:
            # An interview writes answers, and the demo account may only read (see deps.py).
            await websocket.close(code=1008, reason="The demo cannot take an interview.")
            return

        session = await load_interview_session(session_id, user.id, db)
        if not interview_open(session):
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
        transcriber: AudioTranscriber = UnconfiguredAudioTranscriber()
        if GEMINI_API_KEY and GEMINI_INTERVIEW_MODEL:
            transcriber = FallbackAudioTranscriber(
                transcriber,
                GeminiAudioTranscriber(),
            )
        if GROQ_API_KEY:
            transcriber = FallbackAudioTranscriber(
                GroqWhisperTranscriber(),
                transcriber,
            )
        guard: AnswerGuard = (
            GroqPromptGuard() if GROQ_API_KEY and GROQ_GUARD_MODEL else UnconfiguredAnswerGuard()
        )
        role_slug = session.user_role.role.slug
        if not interview.turns:
            opening = await agent.opening(role_slug, session.ai_result, session.language)
            interview.welcome_message = opening.welcome
            interview.turns.append(
                VerificationInterviewTurn(
                    sequence=interview.turn_number,
                    question=opening.question,
                )
            )
        elif not interview.welcome_message:
            opening = await DefaultInterviewAgent().opening(
                role_slug, session.ai_result, session.language
            )
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
                    audio_type = websocket.query_params.get(
                        "audio_content_type", DEFAULT_AUDIO_TYPE
                    ).lower()
                    if audio_type not in ALLOWED_AUDIO_TYPES:
                        await websocket.send_json(
                            {"type": "error", "code": "AUDIO_TYPE_NOT_ALLOWED"}
                        )
                        audio_buffer.clear()
                        continue
                    try:
                        answer = await transcriber.transcribe(bytes(audio_buffer), audio_type)
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
                    closing = await agent.closing(
                        role_slug, session.ai_result, history, session.language
                    )
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
                        session.language,
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
