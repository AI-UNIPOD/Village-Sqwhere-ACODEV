"""The build tab: who builds which piece of the design sketch, and the latest commits of the
team's public GitHub repository. Why these rules: docs/decisions/2026-11-15-hub-build-tab.md

Active members read it once the hub reaches build, and in review. Claiming and freeing a piece
and setting the repository work only while the hub is active and in build. Refreshing the
commits also works in review, because the team keeps committing fixes then. Every change locks
the hub row first, like the other tools, except that a refresh does not hold the lock while it
waits for GitHub.
"""

import math
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Response, status
from sqlalchemy import Select, and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hub_design import live
from app.api.v1.hub_members import require_active_hub, require_active_member, require_owner
from app.api.v1.hubs import hub_error
from app.models import (
    Hub,
    HubCommit,
    HubMember,
    HubMemberStatus,
    HubPhase,
    HubPiece,
    HubStatus,
    User,
)
from app.schemas.hubs import (
    HubBuild,
    HubBuildPiece,
    HubBuildPieceResponse,
    HubBuildResponse,
    HubCommitCard,
    HubOwner,
    SetRepositoryRequest,
)
from app.services.verification import GitHubRepositoryClient, GitHubRepositoryError

router = APIRouter()

# The least time between two refreshes of one hub, so the team cannot use up the server's
# GitHub allowance. Why: the decision record above.
REFRESH_WAIT = timedelta(seconds=60)
COMMITS_KEPT = 20
GITHUB_TIMEOUT_SECONDS = 10


def writable(hub: Hub) -> bool:
    return hub.status == HubStatus.ACTIVE and hub.phase == HubPhase.BUILD


def refreshable(hub: Hub) -> bool:
    return hub.status == HubStatus.ACTIVE and hub.phase in (HubPhase.BUILD, HubPhase.REVIEW)


def require_started(hub: Hub) -> None:
    if hub.phase is None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_NOT_CONFIRMED",
            "The team is not confirmed yet, so the hub has no build tab. "
            "The owner confirms the team.",
        )
    if hub.phase in (HubPhase.BRAINSTORM, HubPhase.DESIGN):
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_NOT_STARTED",
            f"The hub is still in {hub.phase.value}. "
            "The build tab opens when the owner moves it on.",
        )


def require_writable(hub: Hub) -> None:
    require_started(hub)
    if hub.phase != HubPhase.BUILD:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PHASE_CLOSED",
            "The build phase is over, so pieces can no longer be claimed or freed and the "
            "repository cannot change. They stay readable.",
        )
    require_active_hub(hub, "This hub is archived, so its build tab cannot change.")


def repository_to_refresh(hub: Hub) -> str:
    """The repository whose commits may be refreshed now, or the refusal."""
    require_started(hub)
    require_active_hub(hub, "This hub is archived, so its commits cannot be refreshed.")
    if hub.repository_url is None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "REPOSITORY_NOT_SET",
            "No repository is set. The owner pastes the address of the team's GitHub repository.",
        )
    if hub.commits_refreshed_at is not None:
        wait = REFRESH_WAIT - (datetime.now(UTC) - hub.commits_refreshed_at)
        if wait > timedelta(0):
            seconds = math.ceil(wait.total_seconds())
            raise hub_error(
                status.HTTP_409_CONFLICT,
                "REFRESH_TOO_SOON",
                f"The commits were refreshed a moment ago. Try again in {seconds} "
                f"second{'' if seconds == 1 else 's'}.",
            )
    return hub.repository_url


def pieces_with_holder(hub_id: UUID) -> Select[tuple[HubPiece, User | None]]:
    """Each live piece with its holder. A claim of someone who is no longer an active member
    joins to nothing, so it reads as no claim."""
    return (
        live(HubPiece, hub_id)
        .add_columns(User)
        .select_from(HubPiece)
        .outerjoin(
            HubMember,
            and_(
                HubMember.hub_id == HubPiece.hub_id,
                HubMember.user_id == HubPiece.claimed_by,
                HubMember.status == HubMemberStatus.ACTIVE,
            ),
        )
        .outerjoin(User, User.id == HubMember.user_id)
        .options(raiseload("*"))
        .order_by(HubPiece.created_at, HubPiece.id)
    )


def piece_card(piece: HubPiece, holder: User | None, hub: Hub, viewer: User) -> HubBuildPiece:
    return HubBuildPiece(
        id=piece.id,
        name=piece.name,
        summary=piece.summary,
        claimed_by=HubOwner.model_validate(holder) if holder else None,
        claimed_at=piece.claimed_at if holder else None,
        can_claim=writable(hub) and holder is None,
        can_release=writable(hub) and holder is not None and viewer.id in (holder.id, hub.owner_id),
    )


async def find_piece(db: AsyncSession, hub: Hub, piece_id: UUID) -> tuple[HubPiece, User | None]:
    row = (
        await db.execute(pieces_with_holder(hub.id).where(HubPiece.id == piece_id))
    ).one_or_none()
    if row is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "PIECE_NOT_FOUND", "Piece not found.")
    piece, holder = row
    return piece, holder


async def build_answer(db: AsyncSession, hub: Hub, viewer: User) -> HubBuildResponse:
    pieces = (await db.execute(pieces_with_holder(hub.id))).all()
    commits = await db.scalars(
        select(HubCommit).where(HubCommit.hub_id == hub.id).order_by(HubCommit.position)
    )
    return HubBuildResponse(
        data=HubBuild(
            repository_url=hub.repository_url,
            commits_refreshed_at=hub.commits_refreshed_at,
            can_set_repository=writable(hub) and viewer.id == hub.owner_id,
            can_refresh=refreshable(hub) and hub.repository_url is not None,
            pieces=[piece_card(piece, holder, hub, viewer) for piece, holder in pieces],
            commits=[
                HubCommitCard.model_validate(commit, from_attributes=True) for commit in commits
            ],
        )
    )


@router.get("/hubs/{hub_id}/build", response_model=HubBuildResponse)
async def get_build(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubBuildResponse:
    hub = await require_active_member(db, hub_id, current_user)
    require_started(hub)
    return await build_answer(db, hub, current_user)


@router.post("/hubs/{hub_id}/pieces/{piece_id}/claim", response_model=HubBuildPieceResponse)
async def claim_piece(
    hub_id: UUID, piece_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubBuildPieceResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    piece, holder = await find_piece(db, hub, piece_id)
    if holder is None:
        piece.claimed_by, piece.claimed_at = current_user.id, datetime.now(UTC)
        await db.commit()
        holder = current_user
    elif holder.id != current_user.id:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "PIECE_CLAIMED",
            f"{holder.display_name} already builds this piece. Ask them to free it first.",
        )
    return HubBuildPieceResponse(data=piece_card(piece, holder, hub, current_user))


@router.delete("/hubs/{hub_id}/pieces/{piece_id}/claim", status_code=status.HTTP_204_NO_CONTENT)
async def release_piece(
    hub_id: UUID, piece_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_writable(hub)
    piece, holder = await find_piece(db, hub, piece_id)
    if holder is not None:
        if current_user.id not in (holder.id, hub.owner_id):
            raise hub_error(
                status.HTTP_403_FORBIDDEN,
                "NOT_PIECE_HOLDER",
                "Only the member who builds a piece or the hub's owner can free it.",
            )
        piece.claimed_by = piece.claimed_at = None
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/hubs/{hub_id}/repository", response_model=HubBuildResponse)
async def set_repository(
    hub_id: UUID, payload: SetRepositoryRequest, current_user: CurrentUser, db: DbSession
) -> HubBuildResponse:
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    require_owner(hub, current_user.id, "Only the hub's owner can set the repository.")
    require_writable(hub)
    # The stored commits belong to the old address, so a new one drops them. The same address
    # again changes nothing, so it cannot be used to skip the wait between two refreshes.
    if payload.repository_url != hub.repository_url:
        await db.execute(delete(HubCommit).where(HubCommit.hub_id == hub.id))
        hub.repository_url, hub.commits_refreshed_at = payload.repository_url, None
        await db.commit()
    return await build_answer(db, hub, current_user)


@router.post("/hubs/{hub_id}/commits/refresh", response_model=HubBuildResponse)
async def refresh_commits(
    hub_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubBuildResponse:
    hub = await require_active_member(db, hub_id, current_user)
    repository = repository_to_refresh(hub)
    # Nothing is locked while GitHub answers, which can take 10 seconds, and the connection goes
    # back to the pool. (Not rollback: it would expire the signed-in user.)
    await db.commit()
    try:
        commits = await GitHubRepositoryClient(timeout=GITHUB_TIMEOUT_SECONDS).latest_commits(
            repository, COMMITS_KEPT
        )
    except GitHubRepositoryError as error:
        raise hub_error(
            status.HTTP_502_BAD_GATEWAY,
            "REPOSITORY_UNAVAILABLE",
            "GitHub could not give the commits. The repository must be public. "
            "Check the address and try again in a few minutes.",
        ) from error
    # What was true before the wait may not be now: the owner may have moved the hub, changed
    # the address, or another member may have refreshed.
    hub = await require_active_member(db, hub_id, current_user, lock=True)
    if repository_to_refresh(hub) != repository:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "REPOSITORY_CHANGED",
            "The repository changed while the commits were loading. Refresh again.",
        )
    await db.execute(delete(HubCommit).where(HubCommit.hub_id == hub.id))
    db.add_all(
        HubCommit(
            hub_id=hub.id,
            sha=commit.sha,
            message=commit.message,
            author_name=commit.author_name,
            committed_at=commit.committed_at,
            position=position,
        )
        for position, commit in enumerate(commits)
    )
    hub.commits_refreshed_at = datetime.now(UTC)
    await db.commit()
    return await build_answer(db, hub, current_user)
