"""Deleting an account: the person is anonymised and their content stays, shown as a deleted
account. Why each step: docs/decisions/2026-11-14-account-deletion.md
"""

from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Hub,
    HubDeclineKind,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    HubStatus,
    Idea,
    IdeaStatus,
    User,
    UserEmbedding,
    UserFeedTopic,
    UserIdentity,
    UserSector,
    UserTechnology,
    VerificationSession,
    VerificationStatus,
)

ACTIVE_VERIFICATION = (
    VerificationStatus.PENDING,
    VerificationStatus.IN_PROGRESS,
    VerificationStatus.AWAITING_REVIEW,
)


async def hubs_with_a_team(db: AsyncSession, user: User) -> int:
    """How many active hubs this person owns that have another active member."""
    others = (
        select(HubMember.hub_id)
        .where(HubMember.status == HubMemberStatus.ACTIVE, HubMember.user_id != user.id)
        .scalar_subquery()
    )
    return (
        await db.scalar(
            select(func.count())
            .select_from(Hub)
            .where(Hub.owner_id == user.id, Hub.status == HubStatus.ACTIVE, Hub.id.in_(others))
        )
        or 0
    )


async def lock_hubs(db: AsyncSession, user: User) -> None:
    """Every hub this person has a row in, locked in id order like any membership change, so a
    team cannot change under the deletion and two deletions cannot deadlock."""
    ids = select(HubMember.hub_id).where(HubMember.user_id == user.id).scalar_subquery()
    await db.execute(select(Hub.id).where(Hub.id.in_(ids)).order_by(Hub.id).with_for_update())


async def delete_account(db: AsyncSession, user: User) -> None:
    """Runs in the caller's transaction; the caller commits. The caller has already locked the
    user row and checked hubs_with_a_team is 0."""
    now = datetime.now(UTC)
    # their own hubs have nobody else in them, so they are closed for good
    await db.execute(
        update(Hub)
        .where(Hub.owner_id == user.id, Hub.status == HubStatus.ACTIVE)
        .values(status=HubStatus.ARCHIVED, archived_at=now)
    )
    # elsewhere: a member leaves, an unsigned invitation goes, a request is withdrawn
    others = (HubMember.user_id == user.id, HubMember.member_role == HubMemberRole.MEMBER)
    await db.execute(
        update(HubMember)
        .where(*others, HubMember.status == HubMemberStatus.ACTIVE)
        .values(status=HubMemberStatus.LEFT, left_at=now)
    )
    await db.execute(delete(HubMember).where(*others, HubMember.status == HubMemberStatus.INVITED))
    await db.execute(
        update(HubMember)
        .where(*others, HubMember.status == HubMemberStatus.REQUESTED)
        .values(status=HubMemberStatus.DECLINED, decline_kind=HubDeclineKind.REQUEST_WITHDRAWN)
    )
    # nobody can work with them any more, so their ideas leave discovery
    await db.execute(
        update(Idea)
        .where(Idea.author_id == user.id, Idea.status == IdeaStatus.OPEN)
        .values(status=IdeaStatus.CLOSED)
    )
    # reviewers must not be handed a case nobody will hear back about
    await db.execute(
        update(VerificationSession)
        .where(
            VerificationSession.user_id == user.id,
            VerificationSession.status.in_(ACTIVE_VERIFICATION),
        )
        .values(status=VerificationStatus.ABANDONED)
    )
    for table in (UserIdentity, UserTechnology, UserSector, UserFeedTopic, UserEmbedding):
        await db.execute(delete(table).where(table.user_id == user.id))
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(
            # frees the GitHub name for a new account; the id keeps it unique
            username=f"deleted-{user.id.hex[:12]}",
            display_name="Deleted account",
            first_name=None,
            last_name=None,
            email=None,
            email_verified_at=None,
            avatar_url=None,
            bio=None,
            country_code=None,
            deleted_at=now,
        )
    )
