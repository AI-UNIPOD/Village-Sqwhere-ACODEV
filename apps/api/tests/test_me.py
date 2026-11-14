import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import delete, func, select, update

from app.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.countries import AFRICAN_COUNTRY_CODES
from app.main import app
from app.models.lookups import Role
from app.models.users import (
    User,
    UserFeedTopic,
    UserRole,
    UserSector,
    UserTechnology,
    VerificationSession,
    VerificationStatus,
)
from tests.conftest import test_async_session as db_session

client = TestClient(app)


def bearer(data: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {data['access_token']}"}


def mark_email_verified(user_id: str) -> None:
    async def _mark() -> None:
        async with db_session() as session:
            await session.execute(
                update(User).where(User.id == UUID(user_id)).values(email_verified_at=func.now())
            )
            await session.commit()

    asyncio.run(_mark())


def cleanup_user(user_id: UUID) -> None:
    async def _clean() -> None:
        async with db_session() as session:
            await session.execute(
                delete(VerificationSession).where(VerificationSession.user_id == user_id)
            )
            await session.execute(delete(UserRole).where(UserRole.user_id == user_id))
            await session.execute(delete(UserTechnology).where(UserTechnology.user_id == user_id))
            await session.execute(delete(UserFeedTopic).where(UserFeedTopic.user_id == user_id))
            await session.execute(delete(UserSector).where(UserSector.user_id == user_id))
            await session.commit()

    asyncio.run(_clean())


def test_get_me_unauthorized() -> None:
    # 1. No auth header
    resp = client.get("/v1/me")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "UNAUTHENTICATED"

    # 2. Malformed token
    resp_bad = client.get("/v1/me", headers={"Authorization": "Bearer not_a_real_jwt"})
    assert resp_bad.status_code == 401
    assert resp_bad.json()["detail"]["code"] == "TOKEN_EXPIRED"


def test_access_token_without_the_access_type_is_rejected() -> None:
    claims = {"sub": "00000000-0000-0000-0000-000000000001", "exp": 4102444800}
    token = jwt.encode(claims, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    resp = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "TOKEN_EXPIRED"


def test_get_and_patch_me_authorized(sign_in) -> None:
    data = sign_in()
    access_token = data["access_token"]
    user_id = data["user"]["id"]

    auth_header = {"Authorization": f"Bearer {access_token}"}

    # 2. GET /v1/me
    me_resp = client.get("/v1/me", headers=auth_header)
    assert me_resp.status_code == 200
    me_data = me_resp.json()["data"]
    assert me_data["id"] == user_id
    assert "username" in me_data
    assert "roles" in me_data
    assert "technologies" in me_data
    assert "identities" in me_data

    # 3. PATCH /v1/me
    patch_resp = client.patch(
        "/v1/me",
        headers=auth_header,
        json={
            "display_name": "Samuel SuperDev",
            "bio": "Full-stack builder and backend specialist",
            "first_name": "Samuel",
            "last_name": "Engineer",
        },
    )
    assert patch_resp.status_code == 200
    updated_data = patch_resp.json()["data"]
    assert updated_data["display_name"] == "Samuel SuperDev"
    assert updated_data["bio"] == "Full-stack builder and backend specialist"
    assert updated_data["first_name"] == "Samuel"
    assert updated_data["last_name"] == "Engineer"

    # 4. Verify persistence with another GET /v1/me
    verify_resp = client.get("/v1/me", headers=auth_header)
    assert verify_resp.status_code == 200
    persisted_data = verify_resp.json()["data"]
    assert persisted_data["display_name"] == "Samuel SuperDev"
    assert persisted_data["bio"] == "Full-stack builder and backend specialist"


def test_patch_me_unauthorized() -> None:
    resp = client.patch(
        "/v1/me",
        json={"display_name": "Hacker Name"},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "change",
    [
        {"display_name": "A" * 81},
        {"display_name": "   "},
        {"first_name": "B" * 101},
        {"last_name": ""},
        {"bio": "C" * 1001},
        {"email": "not-an-email"},
    ],
)
def test_patch_me_rejects_values_the_database_would_refuse(sign_in, change: dict) -> None:
    resp = client.patch("/v1/me", headers=bearer(sign_in()), json=change)

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", next(iter(change))]


def test_patch_me_refuses_an_email_another_account_uses(sign_in) -> None:
    ada = sign_in("github-code-ada")
    moussa = sign_in("github-code-moussa")
    taken = client.patch("/v1/me", headers=bearer(ada), json={"email": "ada@example.test"})
    assert taken.status_code == 200

    resp = client.patch("/v1/me", headers=bearer(moussa), json={"email": "ADA@example.test"})

    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "EMAIL_TAKEN"
    assert client.get("/v1/me", headers=bearer(moussa)).json()["data"]["email"] != (
        "ADA@example.test"
    )


def test_changing_email_clears_its_verification(sign_in) -> None:
    moussa = sign_in("github-code-moussa")
    first = client.patch("/v1/me", headers=bearer(moussa), json={"email": "moussa@example.test"})
    assert first.status_code == 200
    mark_email_verified(moussa["user"]["id"])
    assert client.get("/v1/me", headers=bearer(moussa)).json()["data"]["email_verified"] is True

    resp = client.patch(
        "/v1/me", headers=bearer(moussa), json={"email": "moussa.diop@example.test"}
    )

    assert resp.status_code == 200
    assert resp.json()["data"]["email"] == "moussa.diop@example.test"
    assert resp.json()["data"]["email_verified"] is False


def test_country_is_empty_until_set_then_can_change_and_be_cleared(sign_in) -> None:
    headers = bearer(sign_in("github-code-moussa"))

    def country() -> str | None:
        return client.get("/v1/me", headers=headers).json()["data"]["country_code"]

    def patch(body: dict) -> Response:
        return client.patch("/v1/me", headers=headers, json=body)

    patch({"country_code": None})  # this account keeps its country from earlier test runs
    assert country() is None

    assert patch({"country_code": "SN"}).json()["data"]["country_code"] == "SN"
    assert country() == "SN"
    assert patch({"country_code": "KE"}).json()["data"]["country_code"] == "KE"

    # leaving the key out keeps it, even when other fields change
    assert patch({"bio": "Mobile money in Dakar"}).json()["data"]["country_code"] == "KE"
    assert country() == "KE"

    # an explicit null clears it
    assert patch({"country_code": None}).json()["data"]["country_code"] is None
    assert country() is None


@pytest.mark.parametrize("code", ["XX", "FR", "ng", "NGA", "", "N", " NG"])
def test_patch_me_refuses_a_country_that_is_not_an_african_code(sign_in, code: str) -> None:
    headers = bearer(sign_in("github-code-moussa"))
    client.patch("/v1/me", headers=headers, json={"country_code": "GH"})

    resp = client.patch("/v1/me", headers=headers, json={"country_code": code})

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["body", "country_code"]
    assert client.get("/v1/me", headers=headers).json()["data"]["country_code"] == "GH"


def test_there_are_54_african_country_codes() -> None:
    assert len(AFRICAN_COUNTRY_CODES) == 54
    assert all(len(code) == 2 and code.isupper() for code in AFRICAN_COUNTRY_CODES)
    assert {"NG", "SN", "GH", "KE", "ZW"} <= AFRICAN_COUNTRY_CODES
    assert AFRICAN_COUNTRY_CODES.isdisjoint({"FR", "US", "IN", "BR"})


def test_claim_and_update_and_delete_role(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # 1. Claim a role without primary
    claim1 = client.post(
        "/v1/me/roles",
        headers=headers,
        json={"role": "backend-engineer", "is_primary": False},
    )
    assert claim1.status_code == 201
    d1 = claim1.json()["data"]
    assert d1["slug"] == "backend-engineer"
    assert d1["name"] == "Backend & Systems Engineer"
    assert d1["is_primary"] is False
    assert d1["verification"]["attempts_used"] == 0
    assert d1["verification"]["attempts_remaining"] == 3
    assert d1["verification"]["latest_status"] is None

    # 2. Claim another role with is_primary=True
    claim2 = client.post(
        "/v1/me/roles",
        headers=headers,
        json={"role": "frontend-engineer", "is_primary": True},
    )
    assert claim2.status_code == 201
    d2 = claim2.json()["data"]
    assert d2["slug"] == "frontend-engineer"
    assert d2["is_primary"] is True

    # Check GET /me shows frontend-engineer as primary, backend-engineer as secondary
    me = client.get("/v1/me", headers=headers).json()["data"]
    roles = {r["slug"]: r for r in me["roles"]}
    assert roles["frontend-engineer"]["is_primary"] is True
    assert roles["backend-engineer"]["is_primary"] is False

    # 3. Duplicate claim -> 409 ROLE_ALREADY_CLAIMED
    dup = client.post(
        "/v1/me/roles",
        headers=headers,
        json={"role": "backend-engineer"},
    )
    assert dup.status_code == 409
    assert dup.json()["detail"]["code"] == "ROLE_ALREADY_CLAIMED"

    # 4. Unknown slug -> 422 UNKNOWN_SLUG
    bad_slug = client.post(
        "/v1/me/roles",
        headers=headers,
        json={"role": "quantum-hacker"},
    )
    assert bad_slug.status_code == 422
    assert bad_slug.json()["detail"]["code"] == "UNKNOWN_SLUG"

    # 5. PATCH role to make backend-engineer primary
    patch_role = client.patch(
        "/v1/me/roles/backend-engineer",
        headers=headers,
        json={"is_primary": True},
    )
    assert patch_role.status_code == 200
    assert patch_role.json()["data"]["is_primary"] is True

    # Verify frontend-engineer was demoted
    me = client.get("/v1/me", headers=headers).json()["data"]
    roles = {r["slug"]: r for r in me["roles"]}
    assert roles["backend-engineer"]["is_primary"] is True
    assert roles["frontend-engineer"]["is_primary"] is False

    # PATCH unclaimed role -> 404 NOT_FOUND
    patch_missing = client.patch(
        "/v1/me/roles/mobile-engineer",
        headers=headers,
        json={"is_primary": True},
    )
    assert patch_missing.status_code == 404
    assert patch_missing.json()["detail"]["code"] == "NOT_FOUND"

    # PATCH with is_primary: false -> 422 VALIDATION_FAILED
    patch_invalid = client.patch(
        "/v1/me/roles/backend-engineer",
        headers=headers,
        json={"is_primary": False},
    )
    assert patch_invalid.status_code == 422
    assert patch_invalid.json()["detail"]["code"] == "VALIDATION_FAILED"

    # 6. DELETE a role
    del_resp = client.delete("/v1/me/roles/frontend-engineer", headers=headers)
    assert del_resp.status_code == 204

    # Verify removed in GET /me
    me = client.get("/v1/me", headers=headers).json()["data"]
    assert [r["slug"] for r in me["roles"]] == ["backend-engineer"]

    # DELETE unclaimed role -> 404 NOT_FOUND
    del_missing = client.delete("/v1/me/roles/frontend-engineer", headers=headers)
    assert del_missing.status_code == 404
    assert del_missing.json()["detail"]["code"] == "NOT_FOUND"

    cleanup_user(user_id)


def test_delete_role_with_verification_history_is_blocked(sign_in) -> None:
    data = sign_in("github-code-moussa")
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)

    # Claim mobile-engineer
    claim_resp = client.post(
        "/v1/me/roles",
        headers=headers,
        json={"role": "mobile-engineer", "is_primary": True},
    )
    assert claim_resp.status_code == 201

    # Insert a verification session
    async def _add_verification() -> None:
        async with db_session() as session:
            role_result = await session.execute(select(Role).where(Role.slug == "mobile-engineer"))
            role = role_result.scalar_one()
            session.add(
                VerificationSession(
                    user_id=user_id,
                    role_id=role.id,
                    attempt_number=1,
                    status=VerificationStatus.PENDING,
                )
            )
            await session.commit()

    asyncio.run(_add_verification())

    # Try to delete - must be rejected with 409
    del_resp = client.delete("/v1/me/roles/mobile-engineer", headers=headers)
    assert del_resp.status_code == 409
    assert del_resp.json()["detail"]["code"] == "ROLE_HAS_VERIFICATION_HISTORY"

    # Verify role still exists and shows verification history
    me = client.get("/v1/me", headers=headers).json()["data"]
    roles = {r["slug"]: r for r in me["roles"]}
    assert "mobile-engineer" in roles
    assert roles["mobile-engineer"]["verification"]["attempts_used"] == 1
    assert roles["mobile-engineer"]["verification"]["attempts_remaining"] == 2
    assert roles["mobile-engineer"]["verification"]["latest_status"] == "pending"

    cleanup_user(user_id)


def test_replace_technologies(sign_in) -> None:
    data = sign_in("github-code-ada")
    cleanup_user(UUID(data["user"]["id"]))
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # 1. Replace with 2 valid items
    put_resp = client.put(
        "/v1/me/technologies",
        headers=headers,
        json={"technologies": ["python", "postgresql"]},
    )
    assert put_resp.status_code == 200
    tech_data = put_resp.json()["data"]
    assert [t["slug"] for t in tech_data] == ["python", "postgresql"]

    # Verify via GET /me
    me = client.get("/v1/me", headers=headers).json()["data"]
    assert [t["slug"] for t in me["technologies"]] == ["python", "postgresql"]

    # 2. Replace with duplicate items -> 422 VALIDATION_FAILED
    dup_resp = client.put(
        "/v1/me/technologies",
        headers=headers,
        json={"technologies": ["python", "python"]},
    )
    assert dup_resp.status_code == 422
    assert dup_resp.json()["detail"]["code"] == "VALIDATION_FAILED"

    # 3. Replace with unknown slug -> 422 UNKNOWN_SLUG
    bad_resp = client.put(
        "/v1/me/technologies",
        headers=headers,
        json={"technologies": ["python", "nonexistent-tech"]},
    )
    assert bad_resp.status_code == 422
    assert bad_resp.json()["detail"]["code"] == "UNKNOWN_SLUG"

    # 4. Replace with empty list -> 200
    empty_resp = client.put(
        "/v1/me/technologies",
        headers=headers,
        json={"technologies": []},
    )
    assert empty_resp.status_code == 200
    assert empty_resp.json()["data"] == []

    # Verify via GET /me
    me = client.get("/v1/me", headers=headers).json()["data"]
    assert me["technologies"] == []


def test_replace_feed_topics(sign_in) -> None:
    data = sign_in("github-code-ada")
    cleanup_user(UUID(data["user"]["id"]))
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    # 1. Replace with valid items
    put_resp = client.put(
        "/v1/me/feed-topics",
        headers=headers,
        json={"technologies": ["react", "flutter"]},
    )
    assert put_resp.status_code == 200
    topic_data = put_resp.json()["data"]
    assert [t["slug"] for t in topic_data] == ["react", "flutter"]

    # Verify via GET /me
    me = client.get("/v1/me", headers=headers).json()["data"]
    assert [t["slug"] for t in me["feed_topics"]] == ["react", "flutter"]

    # 2. Duplicate topics -> 422 VALIDATION_FAILED
    dup_resp = client.put(
        "/v1/me/feed-topics",
        headers=headers,
        json={"technologies": ["react", "react"]},
    )
    assert dup_resp.status_code == 422
    assert dup_resp.json()["detail"]["code"] == "VALIDATION_FAILED"

    # 3. Unknown topic -> 422 UNKNOWN_SLUG
    bad_resp = client.put(
        "/v1/me/feed-topics",
        headers=headers,
        json={"technologies": ["fake-topic"]},
    )
    assert bad_resp.status_code == 422
    assert bad_resp.json()["detail"]["code"] == "UNKNOWN_SLUG"

    # 4. Empty list -> 200
    empty_resp = client.put(
        "/v1/me/feed-topics",
        headers=headers,
        json={"technologies": []},
    )
    assert empty_resp.status_code == 200
    assert empty_resp.json()["data"] == []

    # Verify via GET /me
    me = client.get("/v1/me", headers=headers).json()["data"]
    assert me["feed_topics"] == []


def test_replace_sectors(sign_in) -> None:
    data = sign_in("github-code-ada")
    cleanup_user(UUID(data["user"]["id"]))
    assert client.get("/v1/me", headers=bearer(data)).json()["data"]["sectors"] == []

    def put(sectors: list) -> object:
        return client.put("/v1/me/sectors", headers=bearer(data), json={"sectors": sectors})

    saved = put(["health", "fintech"])
    assert saved.status_code == 200
    assert saved.json()["data"] == [
        {"slug": "health", "name": "Health"},
        {"slug": "fintech", "name": "Fintech"},
    ]
    # GET /v1/me lists them in the sector list's order, the same as GET /v1/sectors.
    me = client.get("/v1/me", headers=bearer(data)).json()["data"]
    assert [sector["slug"] for sector in me["sectors"]] == ["fintech", "health"]

    # Sending the same set again is safe, and a new set replaces the old one whole.
    assert put(["health", "fintech"]).status_code == 200
    assert put(["civic"]).status_code == 200
    me = client.get("/v1/me", headers=bearer(data)).json()["data"]
    assert [sector["slug"] for sector in me["sectors"]] == ["civic"]

    duplicate = put(["civic", "civic"])
    assert duplicate.status_code == 422
    assert duplicate.json()["detail"]["code"] == "VALIDATION_FAILED"
    unknown = put(["civic", "space-mining"])
    assert unknown.status_code == 422
    assert unknown.json()["detail"] == {
        "code": "UNKNOWN_SLUG",
        "message": "Unknown sector slugs: space-mining",
    }
    for malformed in (["Fintech"], ["fin\x00tech"], [7], "fintech"):
        assert put(malformed).status_code == 422, malformed
    assert client.get("/v1/me", headers=bearer(data)).json()["data"]["sectors"][0]["slug"] == (
        "civic"
    )

    cleared = put([])
    assert (cleared.status_code, cleared.json()["data"]) == (200, [])
    assert client.get("/v1/me", headers=bearer(data)).json()["data"]["sectors"] == []


def test_profile_skills_unauthorized() -> None:
    assert client.post("/v1/me/roles", json={"role": "backend-engineer"}).status_code == 401
    assert (
        client.patch("/v1/me/roles/backend-engineer", json={"is_primary": True}).status_code == 401
    )
    assert client.delete("/v1/me/roles/backend-engineer").status_code == 401
    assert client.put("/v1/me/technologies", json={"technologies": ["python"]}).status_code == 401
    assert client.put("/v1/me/feed-topics", json={"technologies": ["react"]}).status_code == 401
    assert client.put("/v1/me/sectors", json={"sectors": ["health"]}).status_code == 401


@pytest.mark.parametrize(
    ("path", "field"),
    [("/v1/me/technologies", "technologies"), ("/v1/me/feed-topics", "feed_topics")],
)
def test_replacing_a_list_from_two_tabs_at_once_never_fails(sign_in, path: str, field: str) -> None:
    # Two tabs, or a double click, can send the same replacement at the same moment. Each one
    # used to delete the old rows and insert the new ones, so one failed with a 500.
    data = sign_in("github-code-ada")
    cleanup_user(UUID(data["user"]["id"]))
    lists = [["python", "postgresql"], ["react", "flutter"], ["python"], ["postgresql", "react"]]
    lists = lists * 2
    start = threading.Barrier(len(lists))

    def replace(slugs: list[str]) -> int:
        each = TestClient(app)  # its own event loop, so the requests really overlap
        start.wait()
        return each.put(path, headers=bearer(data), json={"technologies": slugs}).status_code

    with ThreadPoolExecutor(len(lists)) as pool:
        codes = list(pool.map(replace, lists))

    assert codes == [200] * len(lists)
    saved = [t["slug"] for t in client.get("/v1/me", headers=bearer(data)).json()["data"][field]]
    # GET /v1/me lists them in no fixed order, so compare without order. One whole replacement
    # still has to win, never a mix of two.
    assert sorted(saved) in [sorted(sent) for sent in lists]
