"""Joining a hub: the owner invites, or a developer asks and the owner approves. Either way
the person then signs the hub's agreement or declines.

The idea's confidential details are shown only to active members, who have signed. Every
change to memberships locks the hub row first, so an invitation cannot be withdrawn while it
is being accepted, and two invitations to one person cannot both be saved.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.api.deps import CurrentUser, DbSession, same_world
from app.api.v1.hubs import client_ip, hub_error
from app.models import (
    AgreementSignature,
    Hub,
    HubDeclineKind,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    HubStatus,
    IdeaStatus,
    User,
)
from app.schemas.hubs import (
    Agreement,
    AgreementAcceptance,
    AgreementResponse,
    HubIdeaBrief,
    HubIdeaBriefResponse,
    HubMemberCard,
    HubMemberResponse,
    HubMembersResponse,
    HubOwner,
    HubResponse,
    InviteRequest,
    MyMembership,
    MyMembershipResponse,
    MySignature,
)
from app.services.hubs import hub_card, in_viewers_world, load_hub

router = APIRouter()

# what the owner sees beyond the team itself: people who asked, people who were asked, and
# the answers
OWNER_ONLY_STATUSES = (
    HubMemberStatus.REQUESTED,
    HubMemberStatus.INVITED,
    HubMemberStatus.DECLINED,
)

# How long a turned-down developer waits before asking the same hub again: a short wait after
# each decline, a long one after a run of them. docs/decisions/2026-11-13-hub-join-requests.md
SHORT_WAIT = timedelta(hours=48)
LONG_WAIT = timedelta(days=30)
DECLINES_BEFORE_LONG_WAIT = 5

# The most active members a hub has, the owner included. The web app shows the same limit
# (TEAM_MAX in apps/web/app/hubs/team.tsx). Why five: docs/decisions/2026-11-13-hub-team-cap.md
MAX_ACTIVE_MEMBERS = 5


def _now() -> datetime:
    return datetime.now(UTC)


async def find_hub(db: AsyncSession, hub_id: UUID, viewer: User, *, lock: bool = False) -> Hub:
    query = select(Hub).where(Hub.id == hub_id).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    hub = (await db.execute(query)).scalar_one_or_none()
    if hub is None or not in_viewers_world(hub, viewer):
        raise hub_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Hub not found.")
    return hub


async def find_membership(db: AsyncSession, hub_id: UUID, user_id: UUID) -> HubMember | None:
    result = await db.execute(
        select(HubMember)
        .where(HubMember.hub_id == hub_id, HubMember.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def require_active_member(
    db: AsyncSession, hub_id: UUID, user: User, *, lock: bool = False
) -> Hub:
    """The hub, if this person signed its agreement and is an active member."""
    hub = await find_hub(db, hub_id, user, lock=lock)
    membership = await find_membership(db, hub_id, user.id)
    if membership is None or membership.status != HubMemberStatus.ACTIVE:
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_HUB_MEMBER",
            "Only active members who signed the hub agreement can see this.",
        )
    return hub


def require_owner(
    hub: Hub, user_id: UUID, message: str = "Only the hub's owner can manage invitations."
) -> None:
    if hub.owner_id != user_id:
        raise hub_error(status.HTTP_403_FORBIDDEN, "NOT_HUB_OWNER", message)


def require_active_hub(
    hub: Hub, message: str = "This hub is archived, so nobody can join it."
) -> None:
    if hub.status != HubStatus.ACTIVE:
        raise hub_error(status.HTTP_409_CONFLICT, "HUB_ARCHIVED", message)


async def require_room(db: AsyncSession, hub: Hub) -> None:
    """Refuse when the team is full. Callers hold the hub row's lock, so two people cannot
    both take the last place."""
    active = await db.execute(
        select(func.count())
        .select_from(HubMember)
        .where(HubMember.hub_id == hub.id, HubMember.status == HubMemberStatus.ACTIVE)
    )
    if active.scalar_one() >= MAX_ACTIVE_MEMBERS:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "TEAM_FULL",
            f"The team is full: a hub takes at most {MAX_ACTIVE_MEMBERS} members.",
        )


def member_card(member: HubMember, user: User) -> HubMemberCard:
    return HubMemberCard(
        user=HubOwner.model_validate(user),
        member_role=member.member_role,
        status=member.status,
        decline_kind=member.decline_kind,
        joined_at=member.joined_at,
        updated_at=member.updated_at,
    )


def invitation_not_found() -> HTTPException:
    return hub_error(
        status.HTTP_404_NOT_FOUND,
        "INVITATION_NOT_FOUND",
        "There is no pending invitation to this hub.",
    )


@router.get("/hubs/{hub_id}/agreement", response_model=AgreementResponse)
async def get_hub_agreement(
    hub_id: UUID, current_user: CurrentUser, db: DbSession
) -> AgreementResponse:
    hub = await find_hub(db, hub_id, current_user)
    template = hub.agreement_template
    if template.published_at is None:
        # the database only lets a hub use a published template
        raise ValueError("A hub's agreement must be published.")
    return AgreementResponse(
        data=Agreement(
            template_id=template.id,
            version=template.version,
            title=template.title,
            body=template.body,
            body_sha256=template.body_sha256,
            published_at=template.published_at,
            hub_terms=hub.terms,
        )
    )


@router.get("/hubs/{hub_id}/idea", response_model=HubIdeaBriefResponse)
async def get_hub_idea(
    hub_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubIdeaBriefResponse:
    hub = await require_active_member(db, hub_id, current_user)
    if hub.idea.deleted_at is not None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Idea not found.")
    return HubIdeaBriefResponse(data=HubIdeaBrief.model_validate(hub.idea))


@router.get("/hubs/{hub_id}/membership", response_model=MyMembershipResponse)
async def get_my_membership(
    hub_id: UUID, current_user: CurrentUser, db: DbSession
) -> MyMembershipResponse:
    hub = await find_hub(db, hub_id, current_user)
    member = await find_membership(db, hub.id, current_user.id)
    if member is None:
        raise hub_error(
            status.HTTP_404_NOT_FOUND,
            "MEMBERSHIP_NOT_FOUND",
            "You have never been invited to this hub or asked to join it.",
        )
    # a member who left or was removed keeps the signature they gave
    signature = member.signature
    return MyMembershipResponse(
        data=MyMembership(
            member_role=member.member_role,
            status=member.status,
            decline_kind=member.decline_kind,
            # shown only while it is ahead, as on the hub card
            can_ask_again_at=wait if (wait := member.can_ask_again_at) and wait > _now() else None,
            created_at=member.created_at,
            joined_at=member.joined_at,
            left_at=member.left_at,
            signature=None
            if signature is None
            else MySignature(
                template_id=signature.template_id,
                # a hub's signatures are all for its one agreement (a database trigger checks)
                version=hub.agreement_template.version,
                template_sha256=signature.template_sha256,
                signed_legal_name=signature.signed_legal_name,
                terms_snapshot=signature.terms_snapshot,
                signed_at=signature.signed_at,
            ),
        )
    )


@router.get("/hubs/{hub_id}/members", response_model=HubMembersResponse)
async def list_hub_members(
    hub_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubMembersResponse:
    hub = await require_active_member(db, hub_id, current_user)
    visible = [HubMemberStatus.ACTIVE]
    if hub.owner_id == current_user.id:
        visible.extend(OWNER_ONLY_STATUSES)
    result = await db.execute(
        select(HubMember, User)
        .join(User, User.id == HubMember.user_id)
        .options(raiseload("*"))
        .where(HubMember.hub_id == hub.id, HubMember.status.in_(visible))
        .order_by(
            (HubMember.member_role == HubMemberRole.OWNER).desc(),
            (HubMember.status == HubMemberStatus.ACTIVE).desc(),
            HubMember.status,
            HubMember.joined_at,
            HubMember.updated_at,
            User.id,
        )
    )
    return HubMembersResponse(data=[member_card(member, user) for member, user in result.all()])


@router.post(
    "/hubs/{hub_id}/invitations",
    response_model=HubMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_to_hub(
    hub_id: UUID, payload: InviteRequest, current_user: CurrentUser, db: DbSession
) -> HubMemberResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    require_owner(hub, current_user.id)
    require_active_hub(hub)
    invitee = (
        await db.execute(
            select(User)
            .options(raiseload("*"))
            .where(
                func.lower(User.username) == payload.username.lower(),
                User.deleted_at.is_(None),
                same_world(User.id, current_user),
            )
        )
    ).scalar_one_or_none()
    if invitee is None:
        raise hub_error(
            status.HTTP_404_NOT_FOUND,
            "USER_NOT_FOUND",
            "No developer has this username. Check the spelling.",
        )

    member = await find_membership(db, hub.id, invitee.id)
    if member is not None and member.status == HubMemberStatus.ACTIVE:
        raise hub_error(
            status.HTTP_409_CONFLICT, "ALREADY_MEMBER", "This developer is already a member."
        )
    if member is not None and member.status == HubMemberStatus.INVITED:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "ALREADY_INVITED",
            "This developer already has a pending invitation.",
        )
    await require_room(db, hub)
    if member is None:
        member = HubMember(
            hub_id=hub.id,
            user_id=invitee.id,
            member_role=HubMemberRole.MEMBER,
            status=HubMemberStatus.INVITED,
            invited_by=current_user.id,
        )
        db.add(member)
    else:
        # asked again after declining, leaving or being removed: a fresh invitation
        member.status, member.decline_kind = HubMemberStatus.INVITED, None
        member.invited_by = current_user.id
        member.created_at = datetime.now(UTC)
        member.joined_at = None
        member.left_at = None
    await db.commit()
    await db.refresh(member)
    return HubMemberResponse(data=member_card(member, invitee))


@router.delete("/hubs/{hub_id}/invitations/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_invitation(
    hub_id: UUID, user_id: UUID, current_user: CurrentUser, db: DbSession
) -> Response:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    require_owner(hub, current_user.id)
    member = await find_membership(db, hub.id, user_id)
    if member is None or member.status != HubMemberStatus.INVITED:
        raise invitation_not_found()
    # An unsigned invitation is not evidence of anything, so it is removed, not kept as
    # "removed", which would say the person had been a member.
    await db.delete(member)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def pending_invitation(db: AsyncSession, hub: Hub, user_id: UUID) -> HubMember:
    member = await find_membership(db, hub.id, user_id)
    if member is not None and member.status == HubMemberStatus.ACTIVE:
        raise hub_error(
            status.HTTP_409_CONFLICT, "ALREADY_MEMBER", "You are already a member of this hub."
        )
    if member is None or member.status != HubMemberStatus.INVITED:
        raise invitation_not_found()
    return member


@router.post("/hubs/{hub_id}/invitation/accept", response_model=HubResponse)
async def accept_invitation(
    hub_id: UUID,
    payload: AgreementAcceptance,
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> HubResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    member = await pending_invitation(db, hub, current_user.id)
    require_active_hub(hub)
    await require_room(db, hub)
    template = hub.agreement_template
    if payload.template_id != template.id or payload.template_sha256 != template.body_sha256:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "AGREEMENT_MISMATCH",
            "This is not this hub's agreement. Fetch GET /v1/hubs/{hub_id}/agreement, "
            "show it again and sign that one.",
        )

    # The database keeps one signature per hub, person and agreement version. Someone who
    # signed this text before and is now invited back is bound by that signature.
    signature = (
        await db.execute(
            select(AgreementSignature).where(
                AgreementSignature.hub_id == hub.id,
                AgreementSignature.user_id == current_user.id,
                AgreementSignature.template_id == template.id,
            )
        )
    ).scalar_one_or_none()
    if signature is None:
        signature = AgreementSignature(
            hub_id=hub.id,
            user_id=current_user.id,
            template_id=template.id,
            template_sha256=template.body_sha256,
            signed_legal_name=payload.signed_legal_name,
            ip_address=client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        db.add(signature)
    member.signature = signature
    member.status = HubMemberStatus.ACTIVE
    member.joined_at = datetime.now(UTC)
    member.declines_in_a_row, member.can_ask_again_at = 0, None
    # the database checks the signature belongs to this hub and person, and saves both or neither
    await db.commit()

    joined = await load_hub(db, hub.id)
    assert joined is not None
    return HubResponse(data=await hub_card(db, joined, current_user.id))


@router.post("/hubs/{hub_id}/invitation/decline", response_model=HubResponse)
async def decline_invitation(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    member = await pending_invitation(db, hub, current_user.id)
    member.status = HubMemberStatus.DECLINED
    member.decline_kind = HubDeclineKind.INVITATION_DECLINED
    await db.commit()

    declined = await load_hub(db, hub.id)
    assert declined is not None
    return HubResponse(data=await hub_card(db, declined, current_user.id))


# --- join requests: docs/decisions/2026-11-13-hub-join-requests.md ---------------------------


@router.post(
    "/hubs/{hub_id}/join-requests", response_model=HubResponse, status_code=status.HTTP_201_CREATED
)
async def request_to_join(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    require_active_hub(hub)
    if hub.idea.status != IdeaStatus.OPEN or hub.idea.deleted_at is not None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "IDEA_CLOSED",
            "This idea is no longer looking for people, so its hub takes no requests.",
        )
    member = await find_membership(db, hub.id, current_user.id)
    if member is not None and member.status == HubMemberStatus.ACTIVE:
        raise hub_error(
            status.HTTP_409_CONFLICT, "ALREADY_MEMBER", "You are already a member of this hub."
        )
    if member is not None and member.status == HubMemberStatus.INVITED:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "ALREADY_INVITED",
            "You already have an invitation to this hub: accept it to join.",
        )
    if member is not None and member.status == HubMemberStatus.REQUESTED:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "ALREADY_REQUESTED",
            "You already asked to join. The owner will answer.",
        )
    if member is not None and member.can_ask_again_at and member.can_ask_again_at > _now():
        when = member.can_ask_again_at
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "REQUEST_COOLING_DOWN",
                "message": f"The owner turned down your last request. You can ask again from "
                f"{when:%d %B %Y, %H:%M} UTC.",
                "can_ask_again_at": when.isoformat(),
            },
        )
    await require_room(db, hub)
    if member is None:
        db.add(
            HubMember(
                hub_id=hub.id,
                user_id=current_user.id,
                member_role=HubMemberRole.MEMBER,
                status=HubMemberStatus.REQUESTED,
            )
        )
    else:
        # asking again after declining, leaving, being removed or being turned down
        member.status, member.decline_kind = HubMemberStatus.REQUESTED, None
        member.invited_by = None
        member.created_at = datetime.now(UTC)
        member.joined_at = None
        member.left_at = None
    await db.commit()

    requested = await load_hub(db, hub.id)
    assert requested is not None
    return HubResponse(data=await hub_card(db, requested, current_user.id))


async def pending_request(db: AsyncSession, hub: Hub, user_id: UUID) -> tuple[HubMember, User]:
    member = await find_membership(db, hub.id, user_id)
    if member is None or member.status != HubMemberStatus.REQUESTED:
        raise hub_error(
            status.HTTP_404_NOT_FOUND,
            "REQUEST_NOT_FOUND",
            "This developer has no pending request to join this hub.",
        )
    requester = await db.scalar(select(User).options(raiseload("*")).where(User.id == user_id))
    assert requester is not None  # the membership's foreign key keeps the user
    return member, requester


@router.post("/hubs/{hub_id}/join-request/withdraw", response_model=HubResponse)
async def withdraw_request(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    member = await find_membership(db, hub.id, current_user.id)
    if member is None or member.status != HubMemberStatus.REQUESTED:
        raise hub_error(
            status.HTTP_404_NOT_FOUND, "REQUEST_NOT_FOUND", "You have no pending request here."
        )
    # Kept as "declined", a request that did not go through, not deleted: the row also holds
    # the count of the owner's earlier declines, which a withdrawal must not wipe. It starts no
    # wait, because the owner said nothing.
    member.status, member.decline_kind = HubMemberStatus.DECLINED, HubDeclineKind.REQUEST_WITHDRAWN
    await db.commit()

    withdrawn = await load_hub(db, hub.id)
    assert withdrawn is not None
    return HubResponse(data=await hub_card(db, withdrawn, current_user.id))


@router.post("/hubs/{hub_id}/members/{user_id}/approve", response_model=HubMemberResponse)
async def approve_request(
    hub_id: UUID, user_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubMemberResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    require_owner(hub, current_user.id)
    require_active_hub(hub)
    member, requester = await pending_request(db, hub, user_id)
    await require_room(db, hub)
    # Approval is an invitation: the person still signs the hub's agreement to join, through
    # POST /v1/hubs/{hub_id}/invitation/accept, the same as anyone the owner invites.
    member.status = HubMemberStatus.INVITED
    member.invited_by = current_user.id
    member.declines_in_a_row, member.can_ask_again_at = 0, None
    await db.commit()
    await db.refresh(member)
    return HubMemberResponse(data=member_card(member, requester))


@router.post("/hubs/{hub_id}/members/{user_id}/decline", response_model=HubMemberResponse)
async def decline_request(
    hub_id: UUID, user_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubMemberResponse:
    hub = await find_hub(db, hub_id, current_user, lock=True)
    require_owner(hub, current_user.id)
    member, requester = await pending_request(db, hub, user_id)
    member.status, member.decline_kind = HubMemberStatus.DECLINED, HubDeclineKind.REQUEST_DECLINED
    member.declines_in_a_row += 1
    if member.declines_in_a_row >= DECLINES_BEFORE_LONG_WAIT:
        # the long wait ends the run, so the next decline after it is a short wait again
        member.declines_in_a_row, member.can_ask_again_at = 0, _now() + LONG_WAIT
    else:
        member.can_ask_again_at = _now() + SHORT_WAIT
    await db.commit()
    await db.refresh(member)
    return HubMemberResponse(data=member_card(member, requester))
