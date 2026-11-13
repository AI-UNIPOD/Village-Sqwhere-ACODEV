"""GET /v1/me/hubs: the hubs the caller belongs to, filtered by their own membership status.

Each hub is the same card GET /v1/hubs/{hub_id} returns. Every test uses new users, so the
list holds only the hubs the test made, even though the test database is shared.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgreementSignature, Hub, HubMember, HubMemberStatus, User
from tests.hub_support import (
    add_member,
    auth,
    bad_auth_headers,
    make_hub,
    make_user,
    run,
)

URL = "/v1/me/hubs"


def ids(resp_json: dict) -> list[str]:
    return [card["id"] for card in resp_json["data"]]


def set_created_at(hub: Hub, when: datetime) -> None:
    async def work(session: AsyncSession) -> None:
        await session.execute(update(Hub).where(Hub.id == hub.id).values(created_at=when))
        await session.commit()

    run(work)


def hubs_of(owner: User, count: int) -> list[Hub]:
    """count hubs owned by one user, oldest first, each a minute apart."""
    start = datetime.now(UTC) - timedelta(days=1)
    hubs = []
    for n in range(count):
        hub = make_hub(owner)
        set_created_at(hub, start + timedelta(minutes=n))
        hubs.append(hub)
    return hubs


def count_hub_rows() -> tuple[int, int, int]:
    async def work(session: AsyncSession) -> tuple[int, int, int]:
        counts = []
        for model in (Hub, AgreementSignature, HubMember):
            result = await session.execute(select(func.count()).select_from(model))
            counts.append(result.scalar_one())
        return counts[0], counts[1], counts[2]

    return run(work)


def is_aware_iso(value: str) -> bool:
    return datetime.fromisoformat(value).tzinfo is not None


# --- success ------------------------------------------------------------------------------


def test_a_new_user_has_no_hubs(client: TestClient) -> None:
    resp = client.get(URL, headers=auth(make_user()))

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"data": [], "next_offset": None}


def test_the_owner_sees_their_hub_as_the_same_card_get_hub_returns(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner, terms={"ownership_model": "custom", "notes": "Partage égal 🤝"})

    resp = client.get(URL, headers=auth(owner))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"data", "next_offset"}
    assert body["next_offset"] is None
    assert len(body["data"]) == 1
    card = body["data"][0]
    assert card == client.get(f"/v1/hubs/{hub.id}", headers=auth(owner)).json()["data"]
    assert card["viewer"] == {"membership_status": "active", "member_role": "owner"}
    assert card["terms"] == {"ownership_model": "custom", "notes": "Partage égal 🤝"}
    for field in ("created_at", "updated_at"):
        assert is_aware_iso(card[field]), field


def test_an_active_member_sees_the_hub_by_default(client: TestClient) -> None:
    hub = make_hub(make_user())
    member = make_user()
    add_member(hub, member, HubMemberStatus.ACTIVE)

    resp = client.get(URL, headers=auth(member))

    assert resp.status_code == 200, resp.text
    assert ids(resp.json()) == [str(hub.id)]
    assert resp.json()["data"][0]["viewer"] == {
        "membership_status": "active",
        "member_role": "member",
    }


def test_status_active_is_the_default(client: TestClient) -> None:
    owner = make_user()
    make_hub(owner)

    default = client.get(URL, headers=auth(owner))
    explicit = client.get(URL, params={"status": "active"}, headers=auth(owner))

    assert default.status_code == explicit.status_code == 200
    assert default.json() == explicit.json()


@pytest.mark.parametrize("wanted", ["requested", "invited"])
def test_the_status_filter_lists_only_hubs_with_that_membership(
    client: TestClient, wanted: str
) -> None:
    user = make_user()
    owned = make_hub(user)
    requested = make_hub(make_user())
    add_member(requested, user, HubMemberStatus.REQUESTED)
    invited = make_hub(make_user())
    add_member(invited, user, HubMemberStatus.INVITED)
    expected = {"requested": requested, "invited": invited}[wanted]

    resp = client.get(URL, params={"status": wanted}, headers=auth(user))

    assert resp.status_code == 200, resp.text
    assert ids(resp.json()) == [str(expected.id)]
    card = resp.json()["data"][0]
    assert card["viewer"] == {"membership_status": wanted, "member_role": "member"}
    active = client.get(URL, headers=auth(user)).json()
    assert ids(active) == [str(owned.id)]


@pytest.mark.parametrize(
    "gone", [HubMemberStatus.DECLINED, HubMemberStatus.LEFT, HubMemberStatus.REMOVED]
)
def test_a_declined_left_or_removed_membership_is_never_listed(
    client: TestClient, gone: HubMemberStatus
) -> None:
    user = make_user()
    add_member(make_hub(make_user()), user, gone)

    for wanted in ("active", "requested", "invited"):
        resp = client.get(URL, params={"status": wanted}, headers=auth(user))
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"data": [], "next_offset": None}, wanted


def test_other_peoples_hubs_are_not_listed(client: TestClient) -> None:
    user = make_user()
    mine = make_hub(user)
    make_hub(make_user())
    someone_elses = make_hub(make_user())
    add_member(someone_elses, make_user(), HubMemberStatus.ACTIVE)

    resp = client.get(URL, headers=auth(user))

    assert ids(resp.json()) == [str(mine.id)]


def test_an_archived_hub_is_still_listed(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner, archived=True)
    member = make_user()
    add_member(hub, member, HubMemberStatus.ACTIVE)

    for user in (owner, member):
        resp = client.get(URL, headers=auth(user))
        assert resp.status_code == 200, resp.text
        assert ids(resp.json()) == [str(hub.id)]
        card = resp.json()["data"][0]
        assert card["status"] == "archived"
        assert is_aware_iso(card["archived_at"])


@pytest.mark.parametrize("wanted", ["active", "requested", "invited"])
def test_nobody_sees_the_idea_details_or_the_signature_evidence(
    client: TestClient, wanted: str
) -> None:
    user = make_user()
    hub = make_hub(user if wanted == "active" else make_user())
    if wanted != "active":
        add_member(hub, user, HubMemberStatus(wanted))

    resp = client.get(URL, params={"status": wanted}, headers=auth(user))

    assert resp.status_code == 200, resp.text
    assert ids(resp.json()) == [str(hub.id)]
    for private in (
        "Confidential plan",
        "Kwame Mensah",
        "details",
        "ip_address",
        "user_agent",
        "terms_snapshot",
        "signed_legal_name",
    ):
        assert private not in resp.text, private


def test_member_count_counts_only_active_members(client: TestClient) -> None:
    owner = make_user()
    hub = make_hub(owner)
    for member_status in HubMemberStatus:
        add_member(hub, make_user(), member_status)

    card = client.get(URL, headers=auth(owner)).json()["data"][0]

    assert card["member_count"] == 2


# --- order and pages ----------------------------------------------------------------------


def test_the_newest_hub_comes_first(client: TestClient) -> None:
    owner = make_user()
    hubs = hubs_of(owner, 3)

    resp = client.get(URL, headers=auth(owner))

    assert ids(resp.json()) == [str(hub.id) for hub in reversed(hubs)]


def test_hubs_made_at_the_same_moment_keep_a_stable_order(client: TestClient) -> None:
    owner = make_user()
    hubs = hubs_of(owner, 4)
    same = datetime.now(UTC) - timedelta(hours=1)
    for hub in hubs:
        set_created_at(hub, same)
    expected = sorted((str(hub.id) for hub in hubs), reverse=True)

    first = client.get(URL, params={"limit": 2}, headers=auth(owner)).json()
    second = client.get(URL, params={"offset": 2, "limit": 2}, headers=auth(owner)).json()

    assert ids(first) + ids(second) == expected


def test_pages_cover_every_hub_once(client: TestClient) -> None:
    owner = make_user()
    hubs = hubs_of(owner, 5)
    newest_first = [str(hub.id) for hub in reversed(hubs)]

    pages = []
    offset: int | None = 0
    while offset is not None:
        body = client.get(URL, params={"offset": offset, "limit": 2}, headers=auth(owner)).json()
        pages.append(ids(body))
        offset = body["next_offset"]

    assert pages == [newest_first[0:2], newest_first[2:4], newest_first[4:5]]


def test_next_offset_is_set_only_when_more_hubs_are_left(client: TestClient) -> None:
    owner = make_user()
    hubs_of(owner, 3)

    def next_offset(**params: int) -> int | None:
        resp = client.get(URL, params=params, headers=auth(owner))
        assert resp.status_code == 200, resp.text
        return resp.json()["next_offset"]

    assert next_offset(limit=2) == 2
    assert next_offset(limit=3) is None
    assert next_offset(limit=4) is None
    assert next_offset(offset=1, limit=1) == 2
    assert next_offset(offset=2, limit=1) is None


def test_an_offset_past_the_end_gives_an_empty_page(client: TestClient) -> None:
    owner = make_user()
    hubs_of(owner, 2)

    for offset in (2, 3, 1000):
        resp = client.get(URL, params={"offset": offset}, headers=auth(owner))
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"data": [], "next_offset": None}


def test_the_default_page_holds_twenty_hubs(client: TestClient) -> None:
    owner = make_user()
    hubs = hubs_of(owner, 21)

    body = client.get(URL, headers=auth(owner)).json()

    assert len(body["data"]) == 20
    assert body["next_offset"] == 20
    assert ids(body) == [str(hub.id) for hub in reversed(hubs)][:20]


@pytest.mark.parametrize("limit", [1, 50])
def test_the_limit_bounds_are_allowed(client: TestClient, limit: int) -> None:
    owner = make_user()
    hubs_of(owner, 2)

    resp = client.get(URL, params={"limit": limit}, headers=auth(owner))

    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]) == min(limit, 2)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("limit", "0"),
        ("limit", "51"),
        ("limit", "-1"),
        ("limit", "ten"),
        ("limit", "2.5"),
        ("offset", "-1"),
        ("offset", "first"),
        ("status", "declined"),
        ("status", "left"),
        ("status", "removed"),
        ("status", "ACTIVE"),
        ("status", "owner"),
        ("status", ""),
    ],
)
def test_bad_query_values_are_refused(client: TestClient, name: str, value: str) -> None:
    resp = client.get(URL, params={name: value}, headers=auth(make_user()))

    assert resp.status_code == 422, resp.text
    assert [error["loc"] for error in resp.json()["detail"]] == [["query", name]]


# --- database effect ----------------------------------------------------------------------


def test_listing_saves_nothing(client: TestClient) -> None:
    owner = make_user()
    make_hub(owner)
    before = count_hub_rows()

    for wanted in ("active", "requested", "invited"):
        assert client.get(URL, params={"status": wanted}, headers=auth(owner)).status_code == 200

    assert count_hub_rows() == before


# --- sign-in ------------------------------------------------------------------------------


@pytest.mark.parametrize("case", list(bad_auth_headers()))
def test_refuses_a_request_that_is_not_signed_in(client: TestClient, case: str) -> None:
    resp = client.get(URL, headers=bad_auth_headers()[case])

    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"]["code"] in {"UNAUTHENTICATED", "TOKEN_EXPIRED"}
    assert resp.headers["www-authenticate"] == "Bearer"
    assert "data" not in resp.json()


def test_refuses_a_deleted_user_with_hubs(client: TestClient) -> None:
    owner = make_user()
    make_hub(owner)
    headers = auth(owner)

    async def delete(session: AsyncSession) -> None:
        await session.execute(
            update(User).where(User.id == owner.id).values(deleted_at=datetime.now(UTC))
        )
        await session.commit()

    run(delete)
    resp = client.get(URL, headers=headers)

    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"]["code"] == "UNAUTHENTICATED"
    assert "Farm Ledger Hub" not in resp.text
