"""Rules the hub endpoints share, kept in one place."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgreementTemplate, Hub, HubMember, HubMemberStatus, HubPhase, User
from app.schemas.hubs import Hub as HubCard
from app.schemas.hubs import HubAgreement, HubIdea, HubOwner, HubPhaseState, HubPhaseStep, HubViewer


async def current_agreement_template(db: AsyncSession) -> AgreementTemplate | None:
    """The agreement every new hub is created on: the highest published version.

    Never a fixed version, so publishing the real text as a new version replaces the test
    one without a code change.
    """
    result = await db.execute(
        select(AgreementTemplate)
        .where(AgreementTemplate.published_at.is_not(None))
        .order_by(AgreementTemplate.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def in_viewers_world(hub: Hub, viewer: User) -> bool:
    """Demo hubs exist only for demo accounts, and demo accounts see only demo hubs.
    docs/decisions/2026-11-13-read-only-demo.md"""
    return hub.owner.is_demo == viewer.is_demo


async def load_hub(db: AsyncSession, hub_id: UUID) -> Hub | None:
    """The hub with its idea, owner and agreement, read fresh from the database."""
    result = await db.execute(
        select(Hub).where(Hub.id == hub_id).execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


def phase_steps(current: HubPhase | None) -> list[HubPhaseStep]:
    """All four phases in order: done before the current one, in progress on it, not started
    after it. Before the team is confirmed nothing has started."""
    order = list(HubPhase)
    steps = []
    for index, phase in enumerate(order):
        if current is None or index > order.index(current):
            state = HubPhaseState.NOT_STARTED
        elif phase == current:
            state = HubPhaseState.IN_PROGRESS
        else:
            state = HubPhaseState.DONE
        steps.append(HubPhaseStep(phase=phase, state=state))
    return steps


async def hub_card(db: AsyncSession, hub: Hub, viewer_id: UUID) -> HubCard:
    """What any signed-in user may see of a hub, plus their own place in it.

    The idea's confidential details are never part of it.
    """
    return (await hub_cards(db, [hub], viewer_id))[0]


async def hub_cards(db: AsyncSession, hubs: list[Hub], viewer_id: UUID) -> list[HubCard]:
    """hub_card for many hubs in two queries, whatever their number. Columns only, so no
    member, hub or user is loaded again with everything that hangs off it."""
    ids = [hub.id for hub in hubs]
    counts = dict(
        (
            await db.execute(
                select(HubMember.hub_id, func.count())
                .where(HubMember.hub_id.in_(ids), HubMember.status == HubMemberStatus.ACTIVE)
                .group_by(HubMember.hub_id)
            )
        ).all()
    )
    places = {
        row.hub_id: row
        for row in await db.execute(
            select(
                HubMember.hub_id,
                HubMember.status,
                HubMember.member_role,
                HubMember.can_ask_again_at,
            ).where(HubMember.hub_id.in_(ids), HubMember.user_id == viewer_id)
        )
    }
    now = datetime.now(UTC)
    cards = []
    for hub in hubs:
        viewer = places.get(hub.id)
        wait = viewer.can_ask_again_at if viewer else None
        cards.append(
            HubCard(
                id=hub.id,
                name=hub.name,
                description=hub.description,
                status=hub.status,
                phase=hub.phase,
                team_confirmed_at=hub.team_confirmed_at,
                finished_at=hub.finished_at,
                phases=phase_steps(hub.phase),
                terms=hub.terms,
                idea=HubIdea.model_validate(hub.idea),
                owner=HubOwner.model_validate(hub.owner),
                member_count=counts.get(hub.id, 0),
                agreement=HubAgreement(
                    template_id=hub.agreement_template.id,
                    version=hub.agreement_template.version,
                ),
                created_at=hub.created_at,
                updated_at=hub.updated_at,
                archived_at=hub.archived_at,
                viewer=HubViewer(
                    membership_status=viewer.status if viewer else None,
                    member_role=viewer.member_role if viewer else None,
                    can_ask_again_at=wait if wait and wait > now else None,
                ),
            )
        )
    return cards
