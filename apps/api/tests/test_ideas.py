"""The idea lifecycle, including the privacy boundary before a team forms."""

from datetime import datetime
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Idea, IdeaRoleNeed, IdeaStatus
from tests.hub_support import auth, bad_auth_headers, make_user, run

MY_IDEAS = "/v1/me/ideas"
OPEN_IDEAS = "/v1/ideas"


def body(**changes: Any) -> dict[str, Any]:
    payload = {
        "title": "Offline farm ledger for co-operatives",
        "summary": "A shared ledger that works offline for farming co-operatives in Kano.",
        "details": "Private notes about partner onboarding and the first release plan.",
        "stage": "concept",
        "roles_needed": ["backend-engineer", "ui-ux-engineer"],
    }
    payload.update(changes)
    return payload


def create(client: TestClient, owner: Any, **changes: Any) -> dict[str, Any]:
    response = client.post(MY_IDEAS, headers=auth(owner), json=body(**changes))
    assert response.status_code == 201, response.text
    return response.json()["data"]


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def assert_aware(value: str | None) -> None:
    assert value is not None
    assert datetime.fromisoformat(value).tzinfo is not None


def stored_idea(idea_id: str) -> Idea:
    async def work(session):
        result = await session.execute(
            select(Idea)
            .options(selectinload(Idea.roles_needed).selectinload(IdeaRoleNeed.role))
            .where(Idea.id == UUID(idea_id))
        )
        return result.scalar_one()

    return run(work)


def test_creates_a_private_draft_with_role_requirements(client: TestClient) -> None:
    owner = make_user()

    response = client.post(MY_IDEAS, headers=auth(owner), json=body())

    assert response.status_code == 201, response.text
    idea = response.json()["data"]
    assert set(idea) == {
        "id",
        "title",
        "summary",
        "details",
        "stage",
        "status",
        "roles_needed",
        "published_at",
        "created_at",
        "updated_at",
    }
    assert idea["status"] == "draft"
    assert idea["details"] == body()["details"]
    assert idea["published_at"] is None
    assert idea["roles_needed"] == [
        {"slug": "backend-engineer", "name": "Backend & Systems Engineer"},
        {"slug": "ui-ux-engineer", "name": "UI/UX Engineer & Product Architect"},
    ]
    assert_aware(idea["created_at"])

    saved = stored_idea(idea["id"])
    assert saved.author_id == owner.id
    assert saved.status == IdeaStatus.DRAFT
    assert [needed.role.slug for needed in saved.roles_needed] == [
        "backend-engineer",
        "ui-ux-engineer",
    ]


def test_drafts_are_invisible_to_other_developers(client: TestClient) -> None:
    owner = make_user()
    viewer = make_user()
    draft = create(client, owner)

    response = client.get(f"{OPEN_IDEAS}/{draft['id']}", headers=auth(viewer))

    assert_error(response, 404, "NOT_FOUND")
    listing = client.get(OPEN_IDEAS, headers=auth(viewer))
    assert listing.status_code == 200, listing.text
    assert str(draft["id"]) not in listing.text


def test_owner_can_update_details_stage_and_roles(client: TestClient) -> None:
    owner = make_user()
    draft = create(client, owner)

    response = client.patch(
        f"{MY_IDEAS}/{draft['id']}",
        headers=auth(owner),
        json={
            "details": None,
            "stage": "prototype",
            "roles_needed": ["mobile-engineer"],
        },
    )

    assert response.status_code == 200, response.text
    updated = response.json()["data"]
    assert updated["details"] is None
    assert updated["stage"] == "prototype"
    assert updated["roles_needed"] == [{"slug": "mobile-engineer", "name": "Mobile Engineer"}]
    assert stored_idea(updated["id"]).details is None


def test_only_the_owner_can_read_or_change_an_idea(client: TestClient) -> None:
    owner = make_user()
    other = make_user()
    draft = create(client, owner)

    for method, url, json in (
        ("get", f"{MY_IDEAS}/{draft['id']}", None),
        ("patch", f"{MY_IDEAS}/{draft['id']}", {"stage": "building"}),
        ("post", f"{MY_IDEAS}/{draft['id']}/publish", None),
        ("post", f"{MY_IDEAS}/{draft['id']}/close", None),
    ):
        response = client.request(method.upper(), url, headers=auth(other), json=json)
        assert_error(response, 404, "NOT_FOUND")


def test_publishing_creates_a_safe_discovery_card(client: TestClient) -> None:
    owner = make_user()
    viewer = make_user()
    draft = create(client, owner)

    published = client.post(f"{MY_IDEAS}/{draft['id']}/publish", headers=auth(owner))

    assert published.status_code == 200, published.text
    assert published.json()["data"]["status"] == "open"
    assert_aware(published.json()["data"]["published_at"])

    detail = client.get(f"{OPEN_IDEAS}/{draft['id']}", headers=auth(viewer))
    assert detail.status_code == 200, detail.text
    card = detail.json()["data"]
    assert set(card) == {
        "id",
        "title",
        "summary",
        "stage",
        "status",
        "roles_needed",
        "author",
        "published_at",
        "created_at",
        "updated_at",
    }
    assert card["author"]["id"] == str(owner.id)
    assert "details" not in card
    assert body()["details"] not in detail.text


def test_closing_stops_discovery_without_losing_the_owners_record(client: TestClient) -> None:
    owner = make_user()
    viewer = make_user()
    draft = create(client, owner)
    assert client.post(f"{MY_IDEAS}/{draft['id']}/publish", headers=auth(owner)).status_code == 200

    closed = client.post(f"{MY_IDEAS}/{draft['id']}/close", headers=auth(owner))

    assert closed.status_code == 200, closed.text
    assert closed.json()["data"]["status"] == "closed"
    assert_error(client.get(f"{OPEN_IDEAS}/{draft['id']}", headers=auth(viewer)), 404, "NOT_FOUND")
    mine = client.get(f"{MY_IDEAS}/{draft['id']}", headers=auth(owner))
    assert mine.status_code == 200
    assert mine.json()["data"]["details"] == body()["details"]


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("post", MY_IDEAS, body()),
        ("get", MY_IDEAS, None),
        ("get", OPEN_IDEAS, None),
    ],
)
def test_idea_endpoints_require_a_signed_in_developer(
    client: TestClient, method: str, path: str, payload: dict[str, Any] | None
) -> None:
    for headers in bad_auth_headers().values():
        response = client.request(method.upper(), path, headers=headers, json=payload)
        assert response.status_code == 401, response.text


def test_invalid_roles_and_invalid_transitions_do_not_change_the_idea(client: TestClient) -> None:
    owner = make_user()
    draft = create(client, owner)

    invalid = client.patch(
        f"{MY_IDEAS}/{draft['id']}",
        headers=auth(owner),
        json={"roles_needed": ["not-a-platform-role"]},
    )
    assert_error(invalid, 422, "UNKNOWN_ROLE")
    assert [
        role["slug"]
        for role in client.get(f"{MY_IDEAS}/{draft['id']}", headers=auth(owner)).json()["data"][
            "roles_needed"
        ]
    ] == [
        "backend-engineer",
        "ui-ux-engineer",
    ]
    assert_error(
        client.post(f"{MY_IDEAS}/{draft['id']}/close", headers=auth(owner)), 409, "IDEA_NOT_OPEN"
    )
    assert client.post(f"{MY_IDEAS}/{draft['id']}/publish", headers=auth(owner)).status_code == 200
    assert_error(
        client.post(f"{MY_IDEAS}/{draft['id']}/publish", headers=auth(owner)), 409, "IDEA_NOT_DRAFT"
    )


def test_list_endpoints_paginate_and_keep_owner_details_out_of_collection(
    client: TestClient,
) -> None:
    owner = make_user()
    viewer = make_user()
    first = create(client, owner, title="Farm sales records for cooperatives")
    second = create(client, owner, title="Market prices for food cooperatives")
    assert client.post(f"{MY_IDEAS}/{first['id']}/publish", headers=auth(owner)).status_code == 200
    assert client.post(f"{MY_IDEAS}/{second['id']}/publish", headers=auth(owner)).status_code == 200

    mine = client.get(MY_IDEAS, headers=auth(owner), params={"limit": 1})
    assert mine.status_code == 200, mine.text
    assert len(mine.json()["data"]) == 1
    assert mine.json()["next_offset"] == 1
    assert "details" not in mine.json()["data"][0]

    public = client.get(OPEN_IDEAS, headers=auth(viewer), params={"limit": 1})
    assert public.status_code == 200, public.text
    assert len(public.json()["data"]) == 1
    assert public.json()["next_offset"] == 1
    assert body()["details"] not in public.text
