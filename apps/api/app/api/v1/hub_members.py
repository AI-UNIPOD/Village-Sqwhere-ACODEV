"""Joining a hub: the owner invites, the invitee signs the hub's agreement or declines.

The idea's confidential details are shown only to active members, who have signed. Every
change to memberships locks the hub row first, so an invitation cannot be withdrawn while it
is being accepted, and two invitations to one person cannot both be saved.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.api.deps import CurrentUser, DbSession
from app.api.v1.hubs import client_ip, hub_error
from app.models import (
    AgreementSignature,
    Hub,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    HubStatus,
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
)
from app.services.hubs import hub_card, load_hub

router = APIRouter()

# what the owner sees beyond the team itself: people who were asked and their answer
OWNER_ONLY_STATUSES = (HubMemberStatus.INVITED, HubMemberStatus.DECLINED)


async def find_hub(db: AsyncSession, hub_id: UUID, *, lock: bool = False) -> Hub:
    query = select(Hub).where(Hub.id == hub_id).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    hub = (await db.execute(query)).scalar_one_or_none()
    if hub is None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Hub not found.")
    return hub


async def find_membership(db: AsyncSession, hub_id: UUID, user_id: UUID) -> HubMember | None:
    result = await db.execute(
        select(HubMember)
        .where(HubMember.hub_id == hub_id, HubMember.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def require_active_member(db: AsyncSession, hub_id: UUID, user_id: UUID) -> Hub:
    """The hub, if this person signed its agreement and is an active member."""
    hub = await find_hub(db, hub_id)
    membership = await find_membership(db, hub_id, user_id)
    if membership is None or membership.status != HubMemberStatus.ACTIVE:
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_HUB_MEMBER",
            "Only active members who signed the hub agreement can see this.",
        )
    return hub


def require_owner(hub: Hub, user_id: UUID) -> None:
    if hub.owner_id != user_id:
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_HUB_OWNER",
            "Only the hub's owner can manage invitations.",
        )


def require_active_hub(hub: Hub) -> None:
    if hub.status != HubStatus.ACTIVE:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "HUB_ARCHIVED",
            "This hub is archived, so nobody can join it.",
        )


def member_card(member: HubMember, user: User) -> HubMemberCard:
    return HubMemberCard(
        user=HubOwner.model_validate(user),
        member_role=member.member_role,
        status=member.status,
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
    hub = await find_hub(db, hub_id)
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
    hub = await require_active_member(db, hub_id, current_user.id)
    if hub.idea.deleted_at is not None:
        raise hub_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Idea not found.")
    return HubIdeaBriefResponse(data=HubIdeaBrief.model_validate(hub.idea))


@router.get("/hubs/{hub_id}/members", response_model=HubMembersResponse)
async def list_hub_members(
    hub_id: UUID, current_user: CurrentUser, db: DbSession
) -> HubMembersResponse:
    hub = await require_active_member(db, hub_id, current_user.id)
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
    hub = await find_hub(db, hub_id, lock=True)
    require_owner(hub, current_user.id)
    require_active_hub(hub)
    invitee = (
        await db.execute(
            select(User)
            .options(raiseload("*"))
            .where(
                func.lower(User.username) == payload.username.lower(),
                User.deleted_at.is_(None),
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
        member.status = HubMemberStatus.INVITED
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
    hub = await find_hub(db, hub_id, lock=True)
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
    hub = await find_hub(db, hub_id, lock=True)
    member = await pending_invitation(db, hub, current_user.id)
    require_active_hub(hub)
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
    # the database checks the signature belongs to this hub and person, and saves both or neither
    await db.commit()

    joined = await load_hub(db, hub.id)
    assert joined is not None
    return HubResponse(data=await hub_card(db, joined, current_user.id))


@router.post("/hubs/{hub_id}/invitation/decline", response_model=HubResponse)
async def decline_invitation(hub_id: UUID, current_user: CurrentUser, db: DbSession) -> HubResponse:
    hub = await find_hub(db, hub_id, lock=True)
    member = await pending_invitation(db, hub, current_user.id)
    member.status = HubMemberStatus.DECLINED
    await db.commit()

    declined = await load_hub(db, hub.id)
    assert declined is not None
    return HubResponse(data=await hub_card(db, declined, current_user.id))
