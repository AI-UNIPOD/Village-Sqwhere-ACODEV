"""Made-up content for the read-only demo ("Try the demo").

Run it where the demo should be on (DEMO_ENABLED=true), against that server's DATABASE_URL:

    uv run --directory apps/api python -m app.demo_seed

Every person here is made up, and every account is a demo account (users.is_demo), so the wall
in app/api/deps.py keeps all of it away from real developers. Times are set relative to when
the script runs, so the feed reads "2 hours ago". Running it again rewrites the posts and
comments with fresh times, sets the bios and countries again, adds the roles, technologies,
sectors, people and open ideas that are missing and leaves the rest, except that it puts the
visitor's own hub in build if it has no phase yet and gives it its brainstorm notes and its
design sketch if it has none, then claims on four pieces and a repository address for each that
is missing, and writes its eight commits again with fresh times. It also gives a hub that still
has the old template description its own, a chat to each of the two hubs with an empty one, and
the review case the evidence, interview and report it lacks.
docs/decisions/2026-11-13-read-only-demo.md, docs/decisions/2026-11-15-demo-world-reads-as-real.md
"""

import asyncio
import hashlib
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app import demo_review_case as review_case
from app.api.v1.auth import DEMO_ACCOUNT_ID
from app.models import (
    AgreementSignature,
    AuthProvider,
    Comment,
    CommentLike,
    DeletionReason,
    Hub,
    HubCommit,
    HubMember,
    HubMemberRole,
    HubMemberStatus,
    HubMessage,
    HubNote,
    HubPhase,
    HubPhaseMove,
    HubPiece,
    HubPieceLink,
    Idea,
    IdeaRoleNeed,
    IdeaStage,
    IdeaStatus,
    InterviewStatus,
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
    VerificationInterview,
    VerificationInterviewTurn,
    VerificationSession,
    VerificationStatus,
)
from app.services.hubs import current_agreement_template

# Usernames use "_", which GitHub logins never have, so a real developer signing up later never
# meets one of these names. The first person is the account visitors sign in as.
PEOPLE = {
    "you": (
        "olaoluwa_adebayo",
        "Ọláolúwa Adébáyọ̀",
        "Backend engineer in Lagos, building payments.",
    ),
    "aminata": (
        "aminata_ndiaye",
        "Aminata Ndiaye",
        "Développeuse mobile et frontend à Dakar. Paiements mobiles pour les coopératives et "
        "les tontines, avec reçus par SMS.",
    ),
    "kwabena": ("kwabena_owusu", "Kwabena Ɔwusu", "Frontend and design systems, Kumasi."),
    "danladi": ("danladi_kabir", "Ɗanladi Ƙabir", "Embedded and IoT for farms in Kano."),
    "wanjiru": ("wanjiru_kamau", "Wanjiru Kamau", "ML engineer in Nairobi, mostly Swahili NLP."),
    "tendai": (
        "tendai_moyo",
        "Tendai Moyo",
        "DevOps in Harare. Keeps payment services running, with audit logs a co-operative can "
        "trust.",
    ),
    "uwase": ("uwase_mutoni", "Uwase Mutoni", "Développeuse frontend à Kigali, pour les écoles."),
}
# where each person lives, from their bio
COUNTRIES = {
    "you": "NG",
    "aminata": "SN",
    "kwabena": "GH",
    "danladi": "NG",
    "wanjiru": "KE",
    "tendai": "ZW",
    "uwase": "RW",
}
# role slugs each person is verified in; the first is their main role
VERIFIED = {
    "you": ["backend-engineer"],
    "aminata": ["mobile-engineer", "frontend-engineer"],
    "kwabena": ["frontend-engineer"],
    "danladi": ["embedded-iot-engineer"],
    "wanjiru": ["ai-ml-engineer"],
    "tendai": ["devops-cloud-engineer"],
    "uwase": ["frontend-engineer"],
}
# What each stack and sector list shares with the visitor, and how close each bio reads to the
# visitor's idea, decide the match scores on the demo's screens: on the visitor's idea Aminata
# scores Strong, Tendai Possible and Uwase Weak, before the model has compared anything (94, 74
# and 56) and after (85, 68 and 44 when measured). Why these lists and bios:
# docs/decisions/2026-11-15-demo-scores-with-meaning.md
STACKS = {
    "you": ["python", "nodejs", "postgresql", "docker", "ci-cd"],
    "aminata": ["flutter", "react-native", "react", "nodejs", "ci-cd", "docker", "postgresql"],
    "kwabena": ["react", "nodejs"],
    "danladi": ["rust", "go"],
    "wanjiru": ["python", "pytorch"],
    "tendai": ["docker", "kubernetes", "terraform", "ci-cd", "postgresql"],
    "uwase": ["react", "vue", "nodejs"],
}
SECTORS = {
    "you": ["fintech", "agritech"],
    "aminata": ["fintech", "agritech"],
    "kwabena": ["agritech", "commerce"],
    "danladi": ["agritech", "climate-energy"],
    "wanjiru": ["education", "civic"],
    "tendai": ["fintech", "developer-tools", "agritech"],
    "uwase": ["education", "agritech"],
}
# Open ideas by others that need the visitor's role and have no hub, so "For you" has matches,
# as (who, title, summary, days since published)
FOR_YOU_IDEAS = [
    (
        "tendai",
        "Uptime watch for mobile money agents",
        "A small service that checks each wallet API every minute and texts mobile money "
        "agents in Harare when payments are down.",
        6,
    ),
    (
        "uwase",
        "Carnet de notes pour les écoles de Kigali",
        "Un carnet de notes qui marche hors ligne et envoie chaque semaine un résumé par SMS "
        "aux parents.",
        9,
    ),
]


# the hub the visitor owns, which the seed puts in the build phase
# The private brief of every demo idea. It reads as a real one: the demo bar's line is the only
# place that says the demo is made up.
BRIEF = (
    "Milestones for the first three months, a budget in naira and CFA, "
    "and the partners to approach first."
)
OWN_HUB = "Payouts Hub"
TONTINE_HUB = "Tontine Hub"
COCOA_HUB = "Cocoa Ledger Hub"
# What each hub's team builds first, in the language its owner writes. A world seeded earlier
# holds "Building <idea title> together." and a rerun replaces that.
HUB_DESCRIPTIONS = {
    OWN_HUB: (
        "We build a payout service for co-operatives. The first version lets one treasurer "
        "approve a batch and pays every member exactly once, even when the network drops. "
        "The audit trail and the SMS receipts come right after."
    ),
    TONTINE_HUB: (
        "Nous construisons une tontine sur mobile pour les quartiers de Dakar. La première "
        "version tient un registre partagé des cotisations et envoie un rappel par SMS avant "
        "chaque tour. Le tirage de l'ordre des bénéficiaires viendra ensuite."
    ),
    COCOA_HUB: (
        "We build an offline ledger for cocoa co-operatives in Ashanti. The first version "
        "records each weighing on a phone without signal and syncs it when the phone finds a "
        "network. The buyer's receipt comes next."
    ),
}
# what its two active members wrote on the brainstorm board, as (who, days ago, text)
OWN_HUB_NOTES = [
    ("you", 8.8, "One co-op treasurer approves the batch, then the app pays every member."),
    ("kwabena", 8.4, "Members want an SMS receipt after every payment."),
    ("you", 8.0, "An idempotency key on every transfer, so a retry never pays twice."),
    ("kwabena", 7.3, "Show the audit trail as a plain timeline, not a table."),
    ("you", 6.9, "Failed payment: retry without paying again anyone who already got paid."),
    ("kwabena", 6.2, "Question: naira and CFA from the first version, or naira only?"),
]
# the two notes that worlds seeded earlier hold in French: a rerun writes them in English
OLD_OWN_HUB_NOTES = {
    "Les membres veulent un reçu par SMS après chaque paiement.": OWN_HUB_NOTES[1][2],
    "Paiement échoué\u202f: on réessaie sans repayer ceux qui ont déjà reçu.": OWN_HUB_NOTES[4][2],
}
# what the same two members sketched in its design phase, as (who, days ago, name, summary)
OWN_HUB_PIECES = [
    ("kwabena", 5.9, "Mobile app", "Where the treasurer approves a batch and members see payouts."),
    ("you", 5.7, "Payouts API", "Takes an approved batch and refuses a transfer with no key."),
    ("you", 5.3, "Payouts worker", "Pays each member's wallet and retries a failure once."),
    ("you", 5.0, "Ledger database", "PostgreSQL tables with every payout and its audit trail."),
    ("kwabena", 4.6, "SMS gateway", "Texts each member a receipt in English or French."),
]
# and the arrows between them, as (who, days ago, from piece, to piece, label)
OWN_HUB_LINKS = [
    ("kwabena", 5.5, "Mobile app", "Payouts API", "approves a batch"),
    ("you", 4.8, "Payouts API", "Ledger database", "records the batch"),
    ("you", 4.7, "Payouts API", "Payouts worker", "queues transfers"),
    ("you", 4.5, "Payouts worker", "Ledger database", "writes each result"),
    ("kwabena", 4.2, "Payouts worker", "SMS gateway", "asks for a receipt"),
    ("you", 3.9, "Payouts API", "Mobile app", "returns the status"),
]
# Who builds which piece in the build phase, as (who, hours ago, piece). Each of the two active
# members holds two, and "Ledger database" stays free. The build phase began 72 hours ago, and
# each claim is older than its holder's first commit. A claim is dated from the moment the hub
# moved to build (72 minus these hours after it), so one written again gets the time it had and
# the chat that mentions the claims still follows them.
BUILD_BEGAN_HOURS_AGO = 72
OWN_HUB_CLAIMS = [
    ("you", 71, "Payouts API"),
    ("kwabena", 70, "Mobile app"),
    ("you", 69, "Payouts worker"),
    ("kwabena", 66, "SMS gateway"),
]
# A GitHub owner name cannot hold an underscore, so this address can never be a real repository
# and the demo can never show a stranger's code.
OWN_HUB_REPOSITORY = "https://github.com/naira_payouts/payouts"
# what worlds seeded earlier hold: a rerun gives them today's address
OLD_OWN_HUB_REPOSITORY = "https://github.com/payouts_demo/payouts"
# its latest commits, newest first, as (who, hours ago, first line of the message)
OWN_HUB_COMMITS = [
    ("kwabena", 3, "Show the payout status on the home screen"),
    ("you", 9, "Retry a failed transfer once with the same key"),
    ("you", 16, "Refuse a transfer that has no idempotency key"),
    ("kwabena", 24, "Add the screen where the treasurer approves a batch"),
    ("you", 33, "Return the time of each payout in the batch status"),
    ("kwabena", 45, "Send the SMS receipt in English or French"),
    ("you", 58, "Pay a batch of wallets from the worker queue"),
    ("you", 64, "Start the payouts API with the batch endpoint"),
]
# What the team of each of two hubs wrote in its chat, as (who, when, hours, text). The time is
# counted from a moment in the hub's own history, read from the hub when the chat is written: the
# moment its members joined, the move to design, the move to build, the last claim on a piece, or
# now (a negative number of hours, for what the commits above show). So a chat written on a
# rerun days later still fits the hub's history.
HUB_CHATS = {
    OWN_HUB: [
        (
            "kwabena",
            "joined",
            26,
            "Hi, glad to be on this. Should I start with the screens or the API?",
        ),
        ("you", "joined", 27, "Notes board first. We decide the API shape once we have the notes."),
        (
            "you",
            "design",
            -2,
            "The notes look complete to me. Okay to move the hub to design today?",
        ),
        ("kwabena", "design", -1, "Yes, go ahead. I will sketch the mobile app first."),
        (
            "you",
            "build",
            0.5,
            "We are in build now. I take the API and the worker, you the app and SMS?",
        ),
        ("kwabena", "claimed", 0.1, "Works for me. I have claimed the app and the SMS gateway."),
        (
            "you",
            "now",
            -8,
            "A failed transfer now retries with the same key. Can you check the status screen?",
        ),
        ("kwabena", "now", -2.5, "Status is on the home screen now: pending, paid or failed."),
    ],
    TONTINE_HUB: [
        (
            "aminata",
            "joined",
            12,
            "Bienvenue à tous les deux. Je commence par le registre des cotisations.",
        ),
        (
            "you",
            "joined",
            14,
            "Thanks, glad to join. I can take the ledger tables and the reminder job.",
        ),
        ("tendai", "joined", 72, "Staging is up, and every merge to main deploys there."),
        (
            "aminata",
            "joined",
            140,
            "Les rappels SMS partent avant chaque tour. Vous pouvez relire le registre\u202f?",
        ),
        (
            "you",
            "joined",
            142,
            "Reading it now. A contribution sent twice must not count twice, so I add a reference.",
        ),
    ],
}


def ago(**delta: float) -> datetime:
    return datetime.now(UTC) - timedelta(**delta)


async def seed(db: AsyncSession) -> bool:
    """Creates the demo world, or rewrites its posts and comments with fresh times when it is
    already there (hubs and signatures cannot be rewritten, so the rest stays). Returns True
    when it created the world."""
    created = await db.get(User, DEMO_ACCOUNT_ID) is None
    people = await _find_or_create_people(db)
    for key, user in people.items():
        # users.is_verified follows verified_at; every person here has a verified role, so the
        # Green Tick shows on their cards. Set on a rerun too, for worlds seeded before this.
        user.verified_at = user.verified_at or ago(days=20)
        user.bio = PEOPLE[key][2]  # on a rerun too: Aminata's bio was mobile only
        user.country_code = COUNTRIES[key]  # also on a rerun, for worlds seeded before countries
    await _write_profiles(db, people)
    if created:
        await _create_world(db, people)
    else:
        # comments, likes, saves and topics go with their posts
        await db.execute(delete(Post).where(Post.author_id.in_([u.id for u in people.values()])))
        # a world seeded while the brief still began "Made-up plan for the demo"
        await db.execute(
            update(Idea)
            .where(Idea.author_id.in_([u.id for u in people.values()]), Idea.details != BRIEF)
            .values(details=BRIEF)
        )
    await _write_open_ideas(db, people)
    await _write_hub_descriptions(db, people)
    await _start_own_hub(db, people["you"])
    await _write_own_hub_notes(db, people)
    await _write_own_hub_design(db, people)
    await _write_own_hub_build(db, people)
    await _write_hub_chats(db, people)
    await _write_review_case(db, people)
    await _write_feed(db, people)
    await db.commit()
    return created


async def _find_or_create_people(db: AsyncSession) -> dict[str, User]:
    """The made-up people, creating any that are missing (a world made before Uwase)."""
    account = await db.get(User, DEMO_ACCOUNT_ID)
    if account is not None:
        # the visitor's account keeps its id; worlds seeded earlier gave it another username
        account.username = PEOPLE["you"][0]
        await db.flush()
    found = {
        user.username: user
        for user in await db.scalars(
            select(User).where(
                User.username.in_([username for username, _, _ in PEOPLE.values()]), User.is_demo
            )
        )
    }
    for days, (key, (username, name, bio)) in enumerate(PEOPLE.items()):
        if username in found:
            continue
        user = User(username=username, display_name=name, bio=bio, is_demo=True)
        if key == "you":
            user.id = DEMO_ACCOUNT_ID
        user.created_at = ago(days=40 - days)
        db.add(user)
        found[username] = user
    await db.flush()
    return {key: found[username] for key, (username, _, _) in PEOPLE.items()}


async def _held(db: AsyncSession, link, column, people: dict[str, User]) -> set[tuple]:
    """What the people already have in a link table, as (user id, role, technology or sector id)."""
    rows = await db.execute(
        select(link.user_id, column).where(link.user_id.in_([u.id for u in people.values()]))
    )
    return {tuple(row) for row in rows}


async def _write_profiles(db: AsyncSession, people: dict[str, User]) -> None:
    """Verified roles, stacks and sectors. Adds only what is missing, so a rerun brings a world
    made before a second role, a longer stack or sectors to the same state."""
    roles = {role.slug: role for role in await db.scalars(select(Role))}
    techs = {tech.slug: tech for tech in await db.scalars(select(Technology))}
    sectors = {sector.slug: sector for sector in await db.scalars(select(Sector))}
    held_roles = await _held(db, UserRole, UserRole.role_id, people)
    held_techs = await _held(db, UserTechnology, UserTechnology.technology_id, people)
    held_sectors = await _held(db, UserSector, UserSector.sector_id, people)

    for key, user in people.items():
        db.add_all(
            UserRole(
                user_id=user.id,
                role_id=roles[slug].id,
                is_primary=place == 0,
                verified_at=ago(days=20),
            )
            for place, slug in enumerate(VERIFIED[key])
            if (user.id, roles[slug].id) not in held_roles
        )
        db.add_all(
            UserTechnology(user_id=user.id, technology_id=techs[slug].id)
            for slug in STACKS[key]
            if slug in techs and (user.id, techs[slug].id) not in held_techs
        )
        db.add_all(
            UserSector(user_id=user.id, sector_id=sectors[slug].id)
            for slug in SECTORS[key]
            if slug in sectors and (user.id, sectors[slug].id) not in held_sectors
        )
    await db.flush()


def _add_idea(
    db: AsyncSession,
    author: User,
    roles: dict[str, Role],
    title: str,
    summary: str,
    status: IdeaStatus,
    days: float,
    *needs: str,
) -> Idea:
    made = Idea(
        author_id=author.id,
        title=title,
        summary=summary,
        details=BRIEF,
        stage=IdeaStage.PROTOTYPE,
        status=status,
        published_at=None if status == IdeaStatus.DRAFT else ago(days=days),
        created_at=ago(days=days + 1),
    )
    db.add(made)
    made.roles_needed = [IdeaRoleNeed(role_id=roles[slug].id) for slug in needs]
    return made


async def _create_world(db: AsyncSession, people: dict[str, User]) -> None:
    """Ideas, hubs and a review case for the people."""
    template = await current_agreement_template(db)
    if template is None:
        raise RuntimeError("Publish an agreement first (infra/db/init/004-test-agreement.sql).")
    roles = {role.slug: role for role in await db.scalars(select(Role))}

    def idea(who: str, title: str, summary: str, status: IdeaStatus, days: float, *needs) -> Idea:
        return _add_idea(db, people[who], roles, title, summary, status, days, *needs)

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
            description=HUB_DESCRIPTIONS[name],
            agreement_template_id=template.id,
            terms={"ownership_model": "equal_split"},
        )
        db.add(made)
        await db.flush()
        for who, membership in {**{owner_key(on): HubMemberStatus.ACTIVE}, **team}.items():
            user = people[who]
            joined = ago(days=10)
            member = HubMember(
                hub_id=made.id,
                user_id=user.id,
                member_role=HubMemberRole.OWNER
                if user.id == on.author_id
                else HubMemberRole.MEMBER,
                status=membership,
                invited_by=on.author_id if membership == HubMemberStatus.INVITED else None,
                joined_at=joined if membership == HubMemberStatus.ACTIVE else None,
            )
            if membership == HubMemberStatus.ACTIVE:
                # signed the moment they joined: the hub page shows both dates, and a signature
                # cannot be changed afterwards (infra/db/init/026-demo-signature-dates.sql)
                member.signature = AgreementSignature(
                    hub_id=made.id,
                    user_id=user.id,
                    template_id=template.id,
                    template_sha256=template.body_sha256,
                    signed_legal_name=user.display_name,
                    signed_at=joined,
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
        tontine, TONTINE_HUB, {"you": HubMemberStatus.ACTIVE, "tendai": HubMemberStatus.ACTIVE}
    )
    await hub(ledger, COCOA_HUB, {"you": HubMemberStatus.INVITED})

    # --- something in your peer review queue: Tendai asks to be verified in your role
    db.add(UserRole(user_id=people["tendai"].id, role_id=roles["backend-engineer"].id))
    await db.flush()
    attempt = VerificationSession(user_id=people["tendai"].id, role_id=roles["backend-engineer"].id)
    db.add(attempt)
    await db.flush()
    # a new attempt always starts pending; move it to where a reviewer picks it up. Its evidence
    # and report come from _write_review_case, which a rerun runs too.
    attempt.status = VerificationStatus.AWAITING_REVIEW

    await db.flush()


async def _write_open_ideas(db: AsyncSession, people: dict[str, User]) -> None:
    """The open ideas that give the visitor matches on "For you", added when they are missing.
    One that is there keeps its row and gets today's summary."""
    roles = {role.slug: role for role in await db.scalars(select(Role))}
    for who, title, summary, days in FOR_YOU_IDEAS:
        author = people[who]
        held = await db.scalar(
            select(Idea).where(Idea.author_id == author.id, Idea.title == title).limit(1)
        )
        if held is None:
            _add_idea(db, author, roles, title, summary, IdeaStatus.OPEN, days, "backend-engineer")
        elif held.summary != summary:
            held.summary = summary
    await db.flush()


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


async def _write_own_hub_notes(db: AsyncSession, people: dict[str, User]) -> None:
    """The visitor's hub has notes from its brainstorm. Added only when it has none, so a rerun
    does not pile up copies. A note a world seeded earlier wrote in French is found by its text
    and written in English."""
    hub = await db.scalar(select(Hub).where(Hub.owner_id == people["you"].id, Hub.name == OWN_HUB))
    if hub is None:
        return
    for old, new in OLD_OWN_HUB_NOTES.items():
        await db.execute(
            update(HubNote).where(HubNote.hub_id == hub.id, HubNote.body == old).values(body=new)
        )
    if await db.scalar(select(HubNote.id).where(HubNote.hub_id == hub.id).limit(1)):
        return
    db.add_all(
        HubNote(hub_id=hub.id, author_id=people[who].id, body=body, created_at=ago(days=days))
        for who, days, body in OWN_HUB_NOTES
    )


async def _write_own_hub_design(db: AsyncSession, people: dict[str, User]) -> None:
    """The visitor's hub has a sketch from its design phase. Added only when it has no pieces,
    so a rerun does not pile up copies."""
    hub = await db.scalar(select(Hub).where(Hub.owner_id == people["you"].id, Hub.name == OWN_HUB))
    if hub is None or await db.scalar(
        select(HubPiece.id).where(HubPiece.hub_id == hub.id).limit(1)
    ):
        return
    pieces = {
        name: HubPiece(
            hub_id=hub.id,
            name=name,
            summary=summary,
            created_by=people[who].id,
            created_at=ago(days=days),
            updated_at=ago(days=days),
        )
        for who, days, name, summary in OWN_HUB_PIECES
    }
    db.add_all(pieces.values())
    await db.flush()
    db.add_all(
        HubPieceLink(
            hub_id=hub.id,
            from_piece_id=pieces[source].id,
            to_piece_id=pieces[target].id,
            label=label,
            created_by=people[who].id,
            created_at=ago(days=days),
        )
        for who, days, source, target, label in OWN_HUB_LINKS
    )


async def _write_own_hub_build(db: AsyncSession, people: dict[str, User]) -> None:
    """The visitor's hub has claims on its pieces, a repository and its latest commits. A claim
    and the repository are added when missing, and a claim someone else holds stays theirs. The
    commits and the time they were checked are written again on every run, the way a refresh
    replaces them, so the hub never reads "Checked 3 days ago". A claim a world seeded earlier
    made after its holder's first commit gets a new time, so every claim is older than that."""
    hub = await db.scalar(select(Hub).where(Hub.owner_id == people["you"].id, Hub.name == OWN_HUB))
    if hub is None:
        return
    pieces = {
        piece.name: piece
        for piece in await db.scalars(
            select(HubPiece).where(HubPiece.hub_id == hub.id, HubPiece.deleted_at.is_(None))
        )
    }
    # the list runs newest first, so the last commit of each person is their first
    first_commit = {people[who].id: ago(hours=hours) for who, hours, _ in OWN_HUB_COMMITS}
    build_began = await db.scalar(
        select(func.min(HubPhaseMove.created_at)).where(
            HubPhaseMove.hub_id == hub.id, HubPhaseMove.to_phase == HubPhase.BUILD
        )
    ) or ago(hours=BUILD_BEGAN_HOURS_AGO)
    for who, hours, name in OWN_HUB_CLAIMS:
        piece = pieces.get(name)
        if piece is None:
            continue
        holder = piece.claimed_by or people[who].id
        if piece.claimed_by is None or piece.claimed_at >= first_commit.get(holder, ago()):
            piece.claimed_by = holder
            piece.claimed_at = build_began + timedelta(hours=BUILD_BEGAN_HOURS_AGO - hours)
    if hub.repository_url in (None, OLD_OWN_HUB_REPOSITORY):
        hub.repository_url = OWN_HUB_REPOSITORY
    await db.execute(delete(HubCommit).where(HubCommit.hub_id == hub.id))
    db.add_all(
        HubCommit(
            hub_id=hub.id,
            # shaped like a real one
            sha=hashlib.sha1(message.encode(), usedforsecurity=False).hexdigest(),
            message=message,
            author_name=people[who].display_name,
            committed_at=ago(hours=hours),
            position=position,
        )
        for position, (who, hours, message) in enumerate(OWN_HUB_COMMITS)
    )
    hub.commits_refreshed_at = ago(hours=1)


async def _write_hub_descriptions(db: AsyncSession, people: dict[str, User]) -> None:
    """Gives each hub its own description in a world seeded when every hub held the template
    "Building <idea title> together." A description anyone wrote since is left as it is."""
    for name, description in HUB_DESCRIPTIONS.items():
        await db.execute(
            update(Hub)
            .where(
                Hub.owner_id.in_([user.id for user in people.values()]),
                Hub.name == name,
                Hub.description.like("Building % together."),
            )
            .values(description=description)
        )


async def _hub_history(db: AsyncSession, hub: Hub) -> dict[str, datetime]:
    """The moments of a hub's own history that its chat is counted from, as the hub holds them,
    so a hub seeded days ago gets a chat that fits it. A moment the hub lacks falls back to where
    the seed puts it."""
    joined = await db.scalar(
        select(func.max(HubMember.joined_at)).where(
            HubMember.hub_id == hub.id, HubMember.status == HubMemberStatus.ACTIVE
        )
    )
    # the first move into each phase, as a hub that was moved again holds more than one
    moves = dict(
        (
            await db.execute(
                select(HubPhaseMove.to_phase, func.min(HubPhaseMove.created_at))
                .where(HubPhaseMove.hub_id == hub.id)
                .group_by(HubPhaseMove.to_phase)
            )
        ).all()
    )
    claimed = await db.scalar(
        select(func.max(HubPiece.claimed_at)).where(HubPiece.hub_id == hub.id)
    )
    design = moves.get(HubPhase.DESIGN) or joined + timedelta(hours=96)
    build = moves.get(HubPhase.BUILD) or joined + timedelta(hours=168)
    return {
        "joined": joined,
        "design": design,
        "build": build,
        "claimed": claimed or build + timedelta(hours=6),
        "now": ago(),
    }


async def _write_hub_chats(db: AsyncSession, people: dict[str, User]) -> None:
    """The Payouts and Tontine teams have been talking for ten days. A hub's chat is written
    only when it is empty, so a rerun does not pile up copies or answer a real message. The
    insert trigger lets only active members post, which these are. Each message is dated from
    the hub's own history, not from the moment of the run."""
    for name, lines in HUB_CHATS.items():
        hub = await db.scalar(
            select(Hub).where(Hub.owner_id.in_([u.id for u in people.values()]), Hub.name == name)
        )
        if hub is None or await db.scalar(
            select(HubMessage.id).where(HubMessage.hub_id == hub.id).limit(1)
        ):
            continue
        history = await _hub_history(db, hub)
        for who, since, hours, body in lines:
            said = history[since] + timedelta(hours=hours)
            db.add(
                HubMessage(
                    hub_id=hub.id,
                    author_id=people[who].id,
                    body=body,
                    created_at=said,
                    updated_at=said,
                )
            )


async def _write_review_case(db: AsyncSession, people: dict[str, User]) -> None:
    """Gives the one attempt waiting for the visitor's review what an attempt that reached peer
    review holds: its repositories, the interview and the AI's report, in English. Only an
    attempt that is still empty and still awaiting review is filled, so one that has moved on or
    been filled is left alone."""
    attempt = await db.scalar(
        select(VerificationSession)
        .join(Role, Role.id == VerificationSession.role_id)
        .where(
            VerificationSession.user_id == people["tendai"].id,
            Role.slug == "backend-engineer",
            VerificationSession.status == VerificationStatus.AWAITING_REVIEW,
        )
    )
    if attempt is None or attempt.evidence or attempt.ai_result:
        return
    started = ago(days=2)
    turns = [
        {
            "sequence": number,
            "question": question,
            "answer": answer,
            "acknowledgement": acknowledgement,
            "security_flags": [],
        }
        for number, (question, answer, acknowledgement) in enumerate(review_case.TURNS, start=1)
    ]
    attempt.source = AuthProvider.GITHUB
    attempt.evidence = [{"repository_url": address} for address in review_case.REPOSITORIES]
    attempt.ai_score = review_case.FINAL_REPORT["score"]
    attempt.ai_result = {
        "codebase_analysis": review_case.CODEBASE_ANALYSIS,
        "interview_transcript": {
            "welcome": review_case.WELCOME,
            "turns": turns,
            "closing": review_case.CLOSING,
        },
        "final_report": review_case.FINAL_REPORT,
    }
    attempt.created_at = attempt.started_at = started
    attempt.completed_at = started + timedelta(minutes=45)
    db.add(
        VerificationInterview(
            verification_session_id=attempt.id,
            status=InterviewStatus.COMPLETED,
            turn_number=len(turns),
            welcome_message=review_case.WELCOME,
            closing_message=review_case.CLOSING,
            started_at=started + timedelta(minutes=5),
            completed_at=started + timedelta(minutes=40),
            turns=[
                VerificationInterviewTurn(
                    sequence=turn["sequence"],
                    question=turn["question"],
                    answer_text=turn["answer"],
                    acknowledgement=turn["acknowledgement"],
                    security_flags=[],
                    created_at=started + timedelta(minutes=5 + 8 * turn["sequence"]),
                )
                for turn in turns
            ],
        )
    )


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
            "Qui a déjà utilisé Wave ou Orange Money dans une app Flutter\u202f? "
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
        ),
        post(
            "tendai",
            "How do you keep Postgres backups honest? We restore one every Friday.",
            26,
            # a real page, so the demo's one link leads somewhere
            link_url="https://www.postgresql.org/docs/current/backup.html",
        ),
        post(
            "aminata",
            "Petit retour d'expérience\u202f: le mode hors ligne a doublé nos utilisateurs "
            "à Thiès.",
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
            "Tontine numérique\u202f: les rappels SMS partent maintenant avant chaque tour, "
            "et le registre partagé garde chaque cotisation.",
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
    await comment(posts[1], "you", "Yes, with Wave. The webhooks sometimes arrive twice.", 4)
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
        else "Demo posts, comments and commits rewritten with fresh times; any missing people, "
        "roles, technologies, sectors and ideas added; the rest left as it was."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
