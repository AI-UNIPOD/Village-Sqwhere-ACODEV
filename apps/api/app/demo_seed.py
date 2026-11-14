"""Made-up content for the read-only demo ("Try the demo").

Run it where the demo should be on (DEMO_ENABLED=true), against that server's DATABASE_URL:

    uv run --directory apps/api python -m app.demo_seed

Every person here is made up, and every account is a demo account (users.is_demo), so the wall
in app/api/deps.py keeps all of it away from real developers. Times are set relative to when
the script runs, so the feed reads "2 hours ago". Running it again rewrites the posts and
comments with fresh times, sets the countries again and leaves the rest, except that it puts
the visitor's own hub in build if it has no phase yet.
docs/decisions/2026-11-13-read-only-demo.md
"""

import asyncio
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.api.v1.auth import DEMO_ACCOUNT_ID
from app.models import (
    AgreementSignature,
    Comment,
    CommentLike,
    DeletionReason,
    Hub,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    HubPhase,
    HubPhaseMove,
    Idea,
    IdeaRoleNeed,
    IdeaStage,
    IdeaStatus,
    Post,
    PostLike,
    PostTopic,
    PostType,
    Role,
    SavedPost,
    Sector,
    Technology,
    User,
    UserRole,
    UserSector,
    UserTechnology,
    VerificationSession,
    VerificationStatus,
)
from app.services.hubs import current_agreement_template

# Usernames use "_", which GitHub logins never have, so a real developer signing up later never
# meets one of these names. The first person is the account visitors sign in as.
PEOPLE = {
    "you": ("olaoluwa_demo", "Ọláolúwa Adébáyọ̀", "Backend engineer in Lagos, building payments."),
    "aminata": ("aminata_ndiaye", "Aminata Ndiaye", "Développeuse mobile à Dakar."),
    "kwabena": ("kwabena_owusu", "Kwabena Ɔwusu", "Frontend and design systems, Kumasi."),
    "danladi": ("danladi_kabir", "Ɗanladi Ƙabir", "Embedded and IoT for farms in Kano."),
    "wanjiru": ("wanjiru_kamau", "Wanjiru Kamau", "ML engineer in Nairobi, mostly Swahili NLP."),
    "tendai": ("tendai_moyo", "Tendai Moyo", "DevOps in Harare. Keeps things running."),
}
# where each person lives, from their bio
COUNTRIES = {
    "you": "NG",
    "aminata": "SN",
    "kwabena": "GH",
    "danladi": "NG",
    "wanjiru": "KE",
    "tendai": "ZW",
}
# role slug each person is verified in; the visitor's is their main role
VERIFIED = {
    "you": "backend-engineer",
    "aminata": "mobile-engineer",
    "kwabena": "frontend-engineer",
    "danladi": "embedded-iot-engineer",
    "wanjiru": "ai-ml-engineer",
    "tendai": "devops-cloud-engineer",
}
STACKS = {
    "you": ["python", "postgresql", "docker"],
    "aminata": ["flutter", "react-native"],
    "kwabena": ["react", "nodejs"],
    "danladi": ["rust", "go"],
    "wanjiru": ["python", "pytorch"],
    "tendai": ["docker", "kubernetes", "terraform"],
}


# the hub the visitor owns, which the seed puts in the build phase
OWN_HUB = "Payouts Hub"


def ago(**delta: float) -> datetime:
    return datetime.now(UTC) - timedelta(**delta)


async def seed(db: AsyncSession) -> bool:
    """Creates the demo world, or rewrites its posts and comments with fresh times when it is
    already there (hubs and signatures cannot be rewritten, so the rest stays). Returns True
    when it created the world."""
    created = await db.get(User, DEMO_ACCOUNT_ID) is None
    if created:
        people = await _create_world(db)
    else:
        usernames = [username for username, _, _ in PEOPLE.values()]
        found = {
            user.username: user
            for user in await db.scalars(
                select(User).where(User.username.in_(usernames), User.is_demo)
            )
        }
        people = {key: found[username] for key, (username, _, _) in PEOPLE.items()}
        # comments, likes, saves and topics go with their posts
        await db.execute(delete(Post).where(Post.author_id.in_([u.id for u in people.values()])))
    for key, user in people.items():
        # users.is_verified follows verified_at; every person here has a verified role, so the
        # Green Tick shows on their cards. Set on a rerun too, for worlds seeded before this.
        user.verified_at = user.verified_at or ago(days=20)
        user.country_code = COUNTRIES[key]  # also on a rerun, for worlds seeded before countries
    await _start_own_hub(db, people["you"])
    await _write_feed(db, people)
    await db.commit()
    return created


async def _create_world(db: AsyncSession) -> dict[str, User]:
    """The people, their roles and stacks, ideas, hubs and a review case."""
    template = await current_agreement_template(db)
    if template is None:
        raise RuntimeError("Publish an agreement first (infra/db/init/004-test-agreement.sql).")
    roles = {role.slug: role for role in await db.scalars(select(Role))}
    techs = {tech.slug: tech for tech in await db.scalars(select(Technology))}
    sectors = {sector.slug: sector for sector in await db.scalars(select(Sector))}

    people: dict[str, User] = {}
    for days, (key, (username, name, bio)) in enumerate(PEOPLE.items()):
        user = User(username=username, display_name=name, bio=bio, is_demo=True)
        if key == "you":
            user.id = DEMO_ACCOUNT_ID
        user.created_at = ago(days=40 - days)
        db.add(user)
        people[key] = user
    await db.flush()
    for key, user in people.items():
        role = roles[VERIFIED[key]]
        db.add(
            UserRole(user_id=user.id, role_id=role.id, is_primary=True, verified_at=ago(days=20))
        )
        db.add_all(
            UserTechnology(user_id=user.id, technology_id=techs[slug].id)
            for slug in STACKS[key]
            if slug in techs
        )
    db.add_all(
        UserSector(user_id=people["you"].id, sector_id=sectors[slug].id)
        for slug in ("fintech", "agritech")
        if slug in sectors
    )

    # --- ideas and hubs
    def idea(who: str, title: str, summary: str, status: IdeaStatus, days: float, *needs) -> Idea:
        made = Idea(
            author_id=people[who].id,
            title=title,
            summary=summary,
            details="Made-up plan for the demo: milestones, budget in naira and CFA, partners.",
            stage=IdeaStage.PROTOTYPE,
            status=status,
            published_at=None if status == IdeaStatus.DRAFT else ago(days=days),
            created_at=ago(days=days + 1),
        )
        db.add(made)
        made.roles_needed = [IdeaRoleNeed(role_id=roles[slug].id) for slug in needs]
        return made

    idea(
        "you",
        "Payroll for market traders",
        "Weekly payroll for traders' assistants in Balogun market, paid to any mobile wallet.",
        IdeaStatus.DRAFT,
        1,
        "mobile-engineer",
    )
    payouts = idea(
        "you",
        "Naira payouts that never pay twice",
        "A payout service for co-operatives with idempotent transfers and a clear audit trail.",
        IdeaStatus.OPEN,
        12,
        "mobile-engineer",
        "frontend-engineer",
        "devops-cloud-engineer",
    )
    tontine = idea(
        "aminata",
        "Tontine numérique pour Dakar",
        "Une tontine sur mobile, avec rappels par SMS et un registre partagé entre membres.",
        IdeaStatus.OPEN,
        15,
        "backend-engineer",
    )
    ledger = idea(
        "kwabena",
        "Cocoa co-op ledger",
        "An offline ledger for cocoa co-operatives in Ashanti, synced when a phone finds signal.",
        IdeaStatus.OPEN,
        18,
        "backend-engineer",
        "embedded-iot-engineer",
    )
    await db.flush()

    async def hub(on: Idea, name: str, team: dict[str, HubMemberStatus]) -> Hub:
        made = Hub(
            idea_id=on.id,
            owner_id=on.author_id,
            name=name,
            description=f"Building {on.title.lower()} together.",
            agreement_template_id=template.id,
            terms={"ownership_model": "equal_split"},
        )
        db.add(made)
        await db.flush()
        for who, membership in {**{owner_key(on): HubMemberStatus.ACTIVE}, **team}.items():
            user = people[who]
            member = HubMember(
                hub_id=made.id,
                user_id=user.id,
                member_role=HubMemberRole.OWNER
                if user.id == on.author_id
                else HubMemberRole.MEMBER,
                status=membership,
                invited_by=on.author_id if membership == HubMemberStatus.INVITED else None,
                joined_at=ago(days=10) if membership == HubMemberStatus.ACTIVE else None,
            )
            if membership == HubMemberStatus.ACTIVE:
                member.signature = AgreementSignature(
                    hub_id=made.id,
                    user_id=user.id,
                    template_id=template.id,
                    template_sha256=template.body_sha256,
                    signed_legal_name=user.display_name,
                )
            db.add(member)
        await db.flush()
        return made

    def owner_key(on: Idea) -> str:
        return next(key for key, user in people.items() if user.id == on.author_id)

    # yours, with room in the team and a request waiting for your answer
    await hub(
        payouts,
        OWN_HUB,
        {"kwabena": HubMemberStatus.ACTIVE, "danladi": HubMemberStatus.REQUESTED},
    )
    # one you belong to, and one that invited you
    await hub(
        tontine, "Tontine Hub", {"you": HubMemberStatus.ACTIVE, "tendai": HubMemberStatus.ACTIVE}
    )
    await hub(ledger, "Cocoa Ledger Hub", {"you": HubMemberStatus.INVITED})

    # --- something in your peer review queue: Tendai asks to be verified in your role
    db.add(UserRole(user_id=people["tendai"].id, role_id=roles["backend-engineer"].id))
    await db.flush()
    attempt = VerificationSession(user_id=people["tendai"].id, role_id=roles["backend-engineer"].id)
    db.add(attempt)
    await db.flush()
    # a new attempt always starts pending; move it to where a reviewer picks it up
    attempt.status = VerificationStatus.AWAITING_REVIEW

    await db.flush()
    return people


async def _start_own_hub(db: AsyncSession, owner: User) -> None:
    """Confirms the visitor's own hub and puts it in build, so its page shows a phase done, one
    in progress and one not started. Also on a rerun, for worlds seeded before hubs had phases;
    a hub already in a phase is left where it is."""
    hub = await db.scalar(select(Hub).where(Hub.owner_id == owner.id, Hub.name == OWN_HUB))
    if hub is None or hub.phase is not None:
        return
    previous = None
    for days, phase in ((9, HubPhase.BRAINSTORM), (6, HubPhase.DESIGN), (3, HubPhase.BUILD)):
        db.add(
            HubPhaseMove(
                hub_id=hub.id,
                moved_by=owner.id,
                from_phase=previous,
                to_phase=phase,
                created_at=ago(days=days),
            )
        )
        previous = phase
    hub.phase, hub.team_confirmed_at = HubPhase.BUILD, ago(days=9)


async def _write_feed(db: AsyncSession, people: dict[str, User]) -> None:
    """Posts, a deep comment thread, likes and saves, timed back from now."""
    techs = {tech.slug: tech for tech in await db.scalars(select(Technology))}
    you = people["you"]

    def post(who: str, body: str, hours: float, **fields) -> Post:
        made = Post(author_id=people[who].id, body=body, created_at=ago(hours=hours), **fields)
        db.add(made)
        return made

    posts = [
        post(
            "kwabena", "Shipped dark mode for our co-op app. Contrast checks caught 11 issues.", 2
        ),
        post(
            "aminata",
            "Qui a déjà utilisé Wave ou Orange Money dans une app Flutter ? "
            "Je cherche un retour sur les webhooks.",
            5,
            type=PostType.QUESTION,
        ),
        post(
            "wanjiru",
            "Proposal: one shared Swahili tokenizer for every team here, instead of five forks.",
            9,
            type=PostType.RFC,
            title="A shared Swahili tokenizer",
        ),
        post(
            "danladi",
            "Our soil sensor firmware is now open source. Runs a full season on two AA cells.",
            20,
            type=PostType.OSS_RELEASE,
            link_url="https://example.com/soil-sensor-firmware",
        ),
        post("tendai", "How do you keep Postgres backups honest? We restore one every Friday.", 26),
        post(
            "aminata",
            "Petit retour d'expérience : le mode hors ligne a doublé nos utilisateurs à Thiès.",
            30,
            type=PostType.RESEARCH_NOTE,
        ),
        post(
            "you",
            "Looking for a review of our idempotency keys for naira payouts. Code in the hub.",
            33,
            type=PostType.CODE_REVIEW_REQUEST,
        ),
        post(
            "kwabena",
            "Architecture challenge: one design system, Twi, Ewe and English. Where do plurals go?",
            48,
            type=PostType.ARCHITECTURE_CHALLENGE,
        ),
        post("wanjiru", "Free GPU hours for Kenyan student teams this month. Ask me.", 60),
        post("danladi", "LoRa range test today: 7 km across open farmland in Kano.", 75),
        post(
            "aminata",
            "Nous recrutons une personne backend pour un projet de tontine numérique.",
            90,
        ),
        post("tendai", "Terraform plan in CI saved us from deleting prod twice this week.", 120),
    ]
    await db.flush()
    for made, slug in zip(
        posts, ("react", "flutter", "python", "rust", "postgresql"), strict=False
    ):
        if slug in techs:
            db.add(PostTopic(post_id=made.id, technology_id=techs[slug].id))

    async def comment(on: Post, who: str, body: str, hours: float, parent=None) -> Comment:
        made = Comment(
            post_id=on.id,
            author_id=people[who].id,
            body=body,
            parent_id=parent.id if parent else None,
            created_at=ago(hours=hours),
        )
        db.add(made)
        await db.flush()
        return made

    # a thread four replies deep, with a deleted comment that still has replies
    rfc = posts[2]
    top = await comment(rfc, "kwabena", "Yes, and put it behind one package name.", 8)
    second = await comment(rfc, "you", "Who maintains it? That is the hard part.", 7, top)
    gone = await comment(rfc, "tendai", "I can host the package registry.", 6, second)
    fourth = await comment(rfc, "wanjiru", "Hosting is easy. Review is the work.", 5, gone)
    await comment(rfc, "danladi", "I will review the C bindings.", 4, fourth)
    await comment(rfc, "aminata", "Je peux aider pour la doc en français.", 3)
    await comment(posts[0], "you", "Which contrast tool did you use?", 1.5)
    await comment(posts[1], "you", "Oui, avec Wave. Les webhooks arrivent parfois deux fois.", 4)
    gone.deleted_at = ago(hours=2)
    gone.deleted_by = gone.author_id
    gone.deletion_reason = DeletionReason.AUTHOR

    db.add_all(PostLike(post_id=made.id, user_id=you.id) for made in posts[:4])
    db.add_all(SavedPost(post_id=made.id, user_id=you.id) for made in (posts[2], posts[3]))
    db.add(CommentLike(comment_id=top.id, user_id=you.id))


async def main() -> int:
    # Made-up developers on a server without the demo would be content nobody can reach, and
    # usually means DATABASE_URL points at the wrong server.
    if not config.DEMO_ENABLED:
        print(
            "The demo is off here (DEMO_ENABLED is not true), so nothing was written.",
            file=sys.stderr,
        )
        return 1
    from app.database import async_session, engine

    engine.echo = False  # the API logs every statement; here that would bury the one result line
    async with async_session() as db:
        made = await seed(db)
    print(
        "Demo content created."
        if made
        else "Demo posts and comments rewritten with fresh times; the rest was already there."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
