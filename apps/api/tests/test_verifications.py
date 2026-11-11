import asyncio
from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update

from app.main import app
from app.models.lookups import Role
from app.models.users import UserRole, VerificationSession, VerificationStatus
from tests.conftest import test_async_session as db_session

client = TestClient(app)


def bearer(data: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {data['access_token']}"}


def cleanup_user(user_id: UUID) -> None:
    async def _clean() -> None:
        async with db_session() as session:
            await session.execute(
                delete(VerificationSession).where(VerificationSession.user_id == user_id)
            )
            await session.execute(delete(UserRole).where(UserRole.user_id == user_id))
            await session.commit()

    asyncio.run(_clean())


def mark_role_verified(user_id: UUID, role_slug: str) -> None:
    async def _mark() -> None:
        async with db_session() as session:
            role_result = await session.execute(select(Role).where(Role.slug == role_slug))
            role = role_result.scalar_one()
            await session.execute(
                update(UserRole)
                .where(
                    UserRole.user_id == user_id,
                    UserRole.role_id == role.id,
                )
                .values(verified_at=datetime(2026, 11, 10, tzinfo=UTC))
            )
            await session.commit()

    asyncio.run(_mark())


def claim_role(data: dict, role: str = "backend-engineer") -> None:
    response = client.post(
        "/v1/me/roles",
        headers=bearer(data),
        json={"role": role, "is_primary": True},
    )
    assert response.status_code == 201, response.text


def test_applicant_can_start_list_and_abandon_verification(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)

    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )

    assert started.status_code == 201, started.text
    session = started.json()["data"]
    assert session["role"] == "backend-engineer"
    assert session["attempt_number"] == 1
    assert session["status"] == "pending"
    assert session["evidence"] == [{"repository_url": "https://github.com/example/project"}]

    listed = client.get("/v1/me/verifications", headers=bearer(data))
    assert listed.status_code == 200
    assert listed.json()["data"][0]["id"] == session["id"]

    detail = client.get(f"/v1/me/verifications/{session['id']}", headers=bearer(data))
    assert detail.status_code == 200

    abandoned = client.post(
        f"/v1/me/verifications/{session['id']}/abandon",
        headers=bearer(data),
    )
    assert abandoned.status_code == 200
    assert abandoned.json()["data"]["status"] == "abandoned"
    cleanup_user(user_id)


def test_start_verification_requires_claimed_role(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)

    response = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(data),
        json={"repositories": ["https://github.com/example/project"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ROLE_NOT_CLAIMED"
    cleanup_user(user_id)


def test_verified_peer_can_review_and_pass_attempt(sign_in) -> None:
    applicant = sign_in("github-code-ada")
    reviewer = sign_in("github-code-moussa")
    applicant_id = UUID(applicant["user"]["id"])
    reviewer_id = UUID(reviewer["user"]["id"])
    cleanup_user(applicant_id)
    cleanup_user(reviewer_id)
    claim_role(applicant)
    claim_role(reviewer)
    mark_role_verified(reviewer_id, "backend-engineer")

    started = client.post(
        "/v1/me/verifications/backend-engineer",
        headers=bearer(applicant),
        json={"repositories": ["https://github.com/example/project"]},
    )
    session_id = started.json()["data"]["id"]

    async def _queue() -> None:
        async with db_session() as session:
            await session.execute(
                update(VerificationSession)
                .where(VerificationSession.id == UUID(session_id))
                .values(status=VerificationStatus.AWAITING_REVIEW)
            )
            await session.commit()

    asyncio.run(_queue())

    queue = client.get("/v1/reviews/verifications", headers=bearer(reviewer))
    assert queue.status_code == 200
    assert queue.json()["data"][0]["id"] == session_id

    decision = client.post(
        f"/v1/reviews/verifications/{session_id}/decision",
        headers=bearer(reviewer),
        json={"decision": "passed", "notes": "Evidence reviewed."},
    )
    assert decision.status_code == 200
    assert decision.json()["data"]["status"] == "passed"

    cleanup_user(applicant_id)
    cleanup_user(reviewer_id)


def test_unverified_user_cannot_review(sign_in) -> None:
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)

    response = client.get("/v1/reviews/verifications", headers=bearer(data))

    assert response.status_code == 200
    assert response.json()["data"] == []
    cleanup_user(user_id)


def test_each_new_attempt_reports_its_own_number(sign_in) -> None:
    # the database numbers attempts; the API must report that number, not one it guessed
    data = sign_in("github-code-ada")
    user_id = UUID(data["user"]["id"])
    cleanup_user(user_id)
    claim_role(data)

    for attempt in (1, 2, 3):
        started = client.post(
            "/v1/me/verifications/backend-engineer",
            headers=bearer(data),
            json={"repositories": ["https://github.com/example/project"]},
        )
        assert started.status_code == 201, started.text
        session = started.json()["data"]
        assert session["attempt_number"] == attempt
        detail = client.get(f"/v1/me/verifications/{session['id']}", headers=bearer(data))
        assert detail.json()["data"]["attempt_number"] == attempt
        abandoned = client.post(
            f"/v1/me/verifications/{session['id']}/abandon", headers=bearer(data)
        )
        assert abandoned.status_code == 200

    cleanup_user(user_id)
