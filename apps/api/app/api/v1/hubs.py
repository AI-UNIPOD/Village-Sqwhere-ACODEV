from datetime import UTC, datetime
from ipaddress import ip_address

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import (
    AgreementSignature,
    AgreementTemplate,
    Hub,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    Idea,
    IdeaStatus,
)
from app.schemas.hubs import Agreement, AgreementResponse, CreateHubRequest, HubResponse
from app.services.hubs import current_agreement_template, hub_card

router = APIRouter()


def hub_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def published_agreement(db: DbSession) -> AgreementTemplate:
    template = await current_agreement_template(db)
    if template is None:
        # a setup problem on the server, not something the person can fix
        raise hub_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AGREEMENT_NOT_PUBLISHED",
            "No hub agreement is published yet, so hubs cannot be created.",
        )
    return template


def client_ip(request: Request) -> str | None:
    """The address of the connection itself. Headers such as X-Forwarded-For are ignored,
    because a client can write anything in them."""
    if request.client is None:
        return None
    try:
        return str(ip_address(request.client.host))
    except ValueError:
        return None


@router.get("/agreements/current", response_model=AgreementResponse)
async def get_current_agreement(current_user: CurrentUser, db: DbSession) -> AgreementResponse:
    template = await published_agreement(db)
    return AgreementResponse(
        data=Agreement(
            template_id=template.id,
            version=template.version,
            title=template.title,
            body=template.body,
            body_sha256=template.body_sha256,
            published_at=template.published_at,
        )
    )


@router.post("/hubs", response_model=HubResponse, status_code=status.HTTP_201_CREATED)
async def create_hub(
    payload: CreateHubRequest, request: Request, current_user: CurrentUser, db: DbSession
) -> HubResponse:
    # Locked until the commit, so two requests for one idea cannot both make a hub.
    result = await db.execute(select(Idea).where(Idea.id == payload.idea_id).with_for_update())
    idea = result.scalar_one_or_none()
    is_author = idea is not None and idea.author_id == current_user.id
    # someone else's draft is as private as an idea that does not exist
    if (
        idea is None
        or idea.deleted_at is not None
        or (not is_author and idea.status == IdeaStatus.DRAFT)
    ):
        raise hub_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Idea not found.")
    if not is_author:
        raise hub_error(
            status.HTTP_403_FORBIDDEN,
            "NOT_IDEA_AUTHOR",
            "Only the idea's author can create its hub.",
        )
    if idea.status != IdeaStatus.OPEN:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "IDEA_NOT_OPEN",
            "Open the idea before creating its hub.",
        )
    existing = await db.execute(select(Hub.id).where(Hub.idea_id == idea.id))
    if existing.scalar_one_or_none() is not None:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "HUB_ALREADY_EXISTS",
            "This idea already has a hub.",
        )

    template = await published_agreement(db)
    signed = payload.agreement
    if signed.template_id != template.id or signed.template_sha256 != template.body_sha256:
        raise hub_error(
            status.HTTP_409_CONFLICT,
            "AGREEMENT_MISMATCH",
            "This is not the current agreement. Fetch GET /v1/agreements/current, "
            "show it again and sign that one.",
        )

    hub = Hub(
        idea_id=idea.id,
        owner_id=current_user.id,
        name=payload.name,
        description=payload.description,
        agreement_template_id=template.id,
        terms=payload.terms.stored(),
    )
    signature = AgreementSignature(
        hub=hub,
        user_id=current_user.id,
        template_id=template.id,
        template_sha256=template.body_sha256,
        signed_legal_name=signed.signed_legal_name,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    owner = HubMember(
        hub=hub,
        user_id=current_user.id,
        member_role=HubMemberRole.OWNER,
        status=HubMemberStatus.ACTIVE,
        signature=signature,
        joined_at=datetime.now(UTC),
    )
    db.add_all([hub, signature, owner])
    # the database checks the owner's membership here, and saves all three or nothing
    await db.commit()

    await db.refresh(hub, ["idea", "owner", "agreement_template"])
    return HubResponse(data=await hub_card(db, hub, current_user.id))
