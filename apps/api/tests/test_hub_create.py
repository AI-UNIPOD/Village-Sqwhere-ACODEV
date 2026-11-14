"""POST /v1/hubs: the idea's author creates a hub, signing the current agreement.

The hub, the owner's signature and the owner's active membership are saved together or not
at all, so every refusal also checks that nothing was saved.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1 import hubs as hubs_api
from app.main import app
from app.models import AgreementTemplate, HubMember, HubMemberRole, HubMemberStatus, IdeaStatus
from app.schemas.hubs import MAX_HUB_TERMS_JSON_CHARS
from tests.hub_support import (
    auth,
    bad_auth_headers,
    count_rows_of_user,
    current_template,
    hub_rows,
    make_idea,
    make_user,
    request_with_no_published_agreement,
    run,
)

URL = "/v1/hubs"

HUB_FIELDS = {
    "id",
    "name",
    "description",
    "status",
    "phase",
    "team_confirmed_at",
    "phases",
    "terms",
    "idea",
    "owner",
    "member_count",
    "agreement",
    "created_at",
    "updated_at",
    "archived_at",
    "viewer",
}


def create_body(idea_id: UUID, template: AgreementTemplate, /, **changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "idea_id": str(idea_id),
        "name": "Farm Ledger Hub",
        "description": "Building the offline ledger MVP in Kano.",
        "terms": {"ownership_model": "equal_split"},
        "agreement": with_agreement(template),
    }
    body.update(changes)
    return body


def with_agreement(template: AgreementTemplate, **changes: Any) -> dict[str, Any]:
    """The agreement part of the body, signed for this template, with any field changed."""
    agreement = {
        "template_id": str(template.id),
        "template_sha256": template.body_sha256,
        "signed_legal_name": "Amina Bello",
    }
    agreement.update(changes)
    return agreement


def assert_nothing_saved(idea_id: UUID, *users: Any) -> None:
    rows = hub_rows(idea_id)
    assert rows == {"hubs": [], "signatures": [], "members": []}
    for user in users:
        assert count_rows_of_user(user) == 0


def assert_error(resp: httpx.Response, status: int, code: str) -> None:
    assert resp.status_code == status, resp.text
    assert resp.json()["detail"]["code"] == code


def is_aware_iso(value: str) -> bool:
    return datetime.fromisoformat(value).tzinfo is not None


# --- success ------------------------------------------------------------------------------


def test_creates_the_hub_and_returns_exactly_the_hub_card(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()

    resp = client.post(URL, json=create_body(idea.id, template), headers=auth(owner))

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert set(body) == {"data"}
    hub = body["data"]
    assert set(hub) == HUB_FIELDS
    assert UUID(hub["id"])
    assert hub["name"] == "Farm Ledger Hub"
    assert hub["description"] == "Building the offline ledger MVP in Kano."
    assert hub["status"] == "active"
    assert hub["terms"] == {"ownership_model": "equal_split"}
    # the public part of the idea only: never the confidential details
    assert hub["idea"] == {"id": str(idea.id), "title": idea.title, "summary": idea.summary}
    assert hub["owner"] == {
        "id": str(owner.id),
        "username": owner.username,
        "display_name": owner.display_name,
        "avatar_url": None,
        "is_verified": False,
    }
    assert hub["member_count"] == 1
    assert hub["agreement"] == {"template_id": str(template.id), "version": template.version}
    assert hub["viewer"] == {
        "membership_status": "active",
        "member_role": "owner",
        "can_ask_again_at": None,
    }
    assert hub["archived_at"] is None
    assert is_aware_iso(hub["created_at"]) and is_aware_iso(hub["updated_at"])
    assert "Confidential" not in resp.text
    assert "ip_address" not in resp.text and "user_agent" not in resp.text


def test_saves_the_hub_the_owners_signature_and_active_membership_together(
    client: TestClient,
) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    terms = {"ownership_model": "custom", "notes": "Owner keeps 40%, the rest split equally."}

    resp = client.post(
        URL,
        json=create_body(idea.id, template, terms=terms),
        headers=auth(owner) | {"User-Agent": "Mozilla/5.0 (Linux; Android 13) Lagos test"},
    )

    assert resp.status_code == 201, resp.text
    rows = hub_rows(idea.id)
    [hub] = rows["hubs"]
    [signature] = rows["signatures"]
    [member] = rows["members"]
    assert str(hub.id) == resp.json()["data"]["id"]
    assert hub.owner_id == owner.id
    assert hub.agreement_template_id == template.id
    assert hub.terms == terms
    assert signature.user_id == owner.id
    assert signature.template_id == template.id
    assert signature.template_sha256 == template.body_sha256
    assert signature.signed_legal_name == "Amina Bello"
    # what the owner signed is exactly the hub's terms
    assert signature.terms_snapshot == terms
    assert signature.user_agent == "Mozilla/5.0 (Linux; Android 13) Lagos test"
    assert member.user_id == owner.id
    assert member.member_role == HubMemberRole.OWNER
    assert member.status == HubMemberStatus.ACTIVE
    assert member.signature_id == signature.id
    assert member.joined_at is not None
    assert member.invited_by is None and member.left_at is None


def test_missing_terms_become_an_equal_split(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    body = create_body(idea.id, current_template())
    del body["terms"], body["description"]

    resp = client.post(URL, json=body, headers=auth(owner))

    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["terms"] == {"ownership_model": "equal_split"}
    assert resp.json()["data"]["description"] is None
    [signature] = hub_rows(idea.id)["signatures"]
    assert signature.terms_snapshot == {"ownership_model": "equal_split"}


@pytest.mark.parametrize("model", ["equal_split", "owner_majority", "custom"])
def test_every_ownership_model_is_accepted(client: TestClient, model: str) -> None:
    owner = make_user()
    idea = make_idea(owner)
    terms = {"ownership_model": model}

    resp = client.post(
        URL, json=create_body(idea.id, current_template(), terms=terms), headers=auth(owner)
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["terms"] == terms


def test_text_is_trimmed_and_unicode_and_sql_looking_text_is_stored_as_it_is(
    client: TestClient,
) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    sql = "Robert'); DROP TABLE hubs;--"
    body = create_body(
        idea.id,
        template,
        name="  Ìdàgbàsókè Hub 🌍  ",
        description=sql,
        terms={"ownership_model": "custom", "notes": "  Partage égal à Dakar 🤝  "},
        agreement=with_agreement(template, signed_legal_name="  Aïssatou N'Diaye  "),
    )

    resp = client.post(URL, json=body, headers=auth(owner))

    assert resp.status_code == 201, resp.text
    hub = resp.json()["data"]
    assert hub["name"] == "Ìdàgbàsókè Hub 🌍"
    assert hub["description"] == sql
    assert hub["terms"] == {"ownership_model": "custom", "notes": "Partage égal à Dakar 🤝"}
    [signature] = hub_rows(idea.id)["signatures"]
    assert signature.signed_legal_name == "Aïssatou N'Diaye"


def test_the_longest_allowed_values_are_accepted(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    body = create_body(
        idea.id,
        template,
        name="n" * 120,
        description="d" * 2000,
        terms={"ownership_model": "custom", "notes": "é" * 1000},
        agreement=with_agreement(template, signed_legal_name="L" * 200),
    )

    resp = client.post(URL, json=body, headers=auth(owner))

    assert resp.status_code == 201, resp.text


def test_the_shortest_allowed_values_are_accepted(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    body = create_body(
        idea.id,
        template,
        name="n",
        description="",
        terms={"ownership_model": "custom", "notes": "n"},
        agreement=with_agreement(template, signed_legal_name="Bo"),
    )

    resp = client.post(URL, json=body, headers=auth(owner))

    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["description"] == ""


# --- where the signature comes from -------------------------------------------------------


@pytest.mark.parametrize("address", ["102.89.12.7", "2001:db8::1"])
def test_the_ip_address_comes_from_the_connection_not_from_headers(address: str) -> None:
    owner = make_user()
    idea = make_idea(owner)
    client = TestClient(app, client=(address, 50000))

    resp = client.post(
        URL,
        json=create_body(idea.id, current_template()),
        headers=auth(owner) | {"X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4"},
    )

    assert resp.status_code == 201, resp.text
    [signature] = hub_rows(idea.id)["signatures"]
    assert str(signature.ip_address) == address
    assert address not in resp.text


def test_a_connection_without_an_ip_address_saves_none(client: TestClient) -> None:
    # the test client's host is the word "testclient", which is not an address
    owner = make_user()
    idea = make_idea(owner)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(owner))

    assert resp.status_code == 201, resp.text
    [signature] = hub_rows(idea.id)["signatures"]
    assert signature.ip_address is None


# --- sign-in ------------------------------------------------------------------------------


@pytest.mark.parametrize("case", list(bad_auth_headers()))
def test_refuses_a_request_that_is_not_signed_in(client: TestClient, case: str) -> None:
    owner = make_user()
    idea = make_idea(owner)

    resp = client.post(
        URL, json=create_body(idea.id, current_template()), headers=bad_auth_headers()[case]
    )

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] in {"UNAUTHENTICATED", "TOKEN_EXPIRED"}
    assert_nothing_saved(idea.id, owner)


def test_refuses_a_deleted_user(client: TestClient) -> None:
    owner = make_user(deleted=True)
    idea = make_idea(owner)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(owner))

    assert_error(resp, 401, "UNAUTHENTICATED")
    assert_nothing_saved(idea.id, owner)


# --- the idea -----------------------------------------------------------------------------


def test_another_users_open_idea_is_refused(client: TestClient) -> None:
    author, other = make_user(), make_user()
    idea = make_idea(author)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(other))

    assert_error(resp, 403, "NOT_IDEA_AUTHOR")
    assert_nothing_saved(idea.id, author, other)


def test_another_users_closed_idea_is_refused_as_not_the_author(client: TestClient) -> None:
    author, other = make_user(), make_user()
    idea = make_idea(author, status=IdeaStatus.CLOSED)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(other))

    assert_error(resp, 403, "NOT_IDEA_AUTHOR")
    assert_nothing_saved(idea.id, author, other)


@pytest.mark.parametrize(
    ("status", "deleted"), [(IdeaStatus.DRAFT, False), (IdeaStatus.OPEN, True)]
)
def test_another_users_draft_or_deleted_idea_looks_like_it_does_not_exist(
    client: TestClient, status: IdeaStatus, deleted: bool
) -> None:
    author, other = make_user(), make_user()
    idea = make_idea(author, status=status, deleted=deleted)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(other))

    assert_error(resp, 404, "NOT_FOUND")
    assert_nothing_saved(idea.id, author, other)


def test_an_idea_that_does_not_exist_is_not_found(client: TestClient) -> None:
    owner = make_user()
    missing = uuid4()

    resp = client.post(URL, json=create_body(missing, current_template()), headers=auth(owner))

    assert_error(resp, 404, "NOT_FOUND")
    assert count_rows_of_user(owner) == 0


def test_the_authors_own_deleted_idea_is_not_found(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner, deleted=True)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(owner))

    assert_error(resp, 404, "NOT_FOUND")
    assert_nothing_saved(idea.id, owner)


@pytest.mark.parametrize("status", [IdeaStatus.DRAFT, IdeaStatus.CLOSED])
def test_the_authors_idea_must_be_open(client: TestClient, status: IdeaStatus) -> None:
    owner = make_user()
    idea = make_idea(owner, status=status)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(owner))

    assert_error(resp, 409, "IDEA_NOT_OPEN")
    assert_nothing_saved(idea.id, owner)


def test_a_second_hub_for_the_same_idea_is_refused(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    first = client.post(URL, json=create_body(idea.id, template), headers=auth(owner))
    assert first.status_code == 201, first.text

    again = client.post(
        URL, json=create_body(idea.id, template, name="Another name"), headers=auth(owner)
    )

    assert_error(again, 409, "HUB_ALREADY_EXISTS")
    rows = hub_rows(idea.id)
    assert [str(hub.id) for hub in rows["hubs"]] == [first.json()["data"]["id"]]
    assert len(rows["signatures"]) == 1 and len(rows["members"]) == 1


def test_two_requests_at_once_for_one_idea_make_exactly_one_hub() -> None:
    owner = make_user()
    idea = make_idea(owner)
    body = create_body(idea.id, current_template())

    async def both() -> list[httpx.Response]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            return list(
                await asyncio.gather(
                    http.post(URL, json=body, headers=auth(owner)),
                    http.post(URL, json=body, headers=auth(owner)),
                )
            )

    responses = asyncio.run(both())

    assert sorted(resp.status_code for resp in responses) == [201, 409]
    [refused] = [resp for resp in responses if resp.status_code == 409]
    assert refused.json()["detail"]["code"] == "HUB_ALREADY_EXISTS"
    rows = hub_rows(idea.id)
    assert len(rows["hubs"]) == 1
    assert len(rows["signatures"]) == 1
    assert len(rows["members"]) == 1


# --- the agreement ------------------------------------------------------------------------


def test_a_wrong_template_hash_is_refused(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    wrong = "0" * 64 if template.body_sha256 != "0" * 64 else "1" * 64
    body = create_body(idea.id, template, agreement=with_agreement(template, template_sha256=wrong))

    resp = client.post(URL, json=body, headers=auth(owner))

    assert_error(resp, 409, "AGREEMENT_MISMATCH")
    assert_nothing_saved(idea.id, owner)


def test_an_unknown_template_is_refused(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    body = create_body(
        idea.id, template, agreement=with_agreement(template, template_id=str(uuid4()))
    )

    resp = client.post(URL, json=body, headers=auth(owner))

    assert_error(resp, 409, "AGREEMENT_MISMATCH")
    assert_nothing_saved(idea.id, owner)


def test_an_older_agreement_version_is_refused(client: TestClient) -> None:
    owner = make_user()
    idea = make_idea(owner)
    old = current_template()

    async def publish_newer(session: Any) -> AgreementTemplate:
        newer = AgreementTemplate(
            version=old.version + 1,
            title="A newer test agreement",
            body=f"Placeholder agreement text for tests only. {uuid4()}",
            published_at=datetime.now(UTC),
        )
        session.add(newer)
        await session.commit()
        return newer

    # it stays afterwards: the hub below uses it, so it cannot be deleted
    newer = run(publish_newer)

    resp = client.post(URL, json=create_body(idea.id, old), headers=auth(owner))
    assert_error(resp, 409, "AGREEMENT_MISMATCH")
    assert "agreements/current" in resp.json()["detail"]["message"]
    assert_nothing_saved(idea.id, owner)

    # signing the new version works
    ok = client.post(URL, json=create_body(idea.id, newer), headers=auth(owner))
    assert ok.status_code == 201, ok.text
    assert ok.json()["data"]["agreement"]["version"] == newer.version


def test_no_published_agreement_means_no_hub() -> None:
    owner = make_user()
    idea = make_idea(owner)

    resp = request_with_no_published_agreement(
        "POST", URL, auth(owner), json=create_body(idea.id, current_template())
    )

    assert_error(resp, 503, "AGREEMENT_NOT_PUBLISHED")
    assert_nothing_saved(idea.id, owner)


# --- validation ---------------------------------------------------------------------------


INVALID_FIELDS: list[tuple[str, Any, tuple[str, ...]]] = [
    ("name", "", ("name",)),
    ("name", "   ", ("name",)),
    ("name", "n" * 121, ("name",)),
    ("name", None, ("name",)),
    ("name", 42, ("name",)),
    ("description", "d" * 2001, ("description",)),
    ("description", 42, ("description",)),
    ("idea_id", "not-a-uuid", ("idea_id",)),
    ("idea_id", None, ("idea_id",)),
    ("terms", None, ("terms",)),
    ("terms", ["equal_split"], ("terms",)),
    ("terms", "equal_split", ("terms",)),
    ("terms", {}, ("terms", "ownership_model")),
    ("terms", {"ownership_model": "winner_takes_all"}, ("terms", "ownership_model")),
    ("terms", {"ownership_model": None}, ("terms", "ownership_model")),
    ("terms", {"ownership_model": "EQUAL_SPLIT"}, ("terms", "ownership_model")),
    ("terms", {"ownership_model": "custom", "split": 50}, ("terms", "split")),
    ("terms", {"ownership_model": "custom", "notes": ""}, ("terms", "notes")),
    ("terms", {"ownership_model": "custom", "notes": "   "}, ("terms", "notes")),
    ("terms", {"ownership_model": "custom", "notes": "n" * 1001}, ("terms", "notes")),
    ("terms", {"ownership_model": "custom", "notes": 42}, ("terms", "notes")),
    ("agreement", None, ("agreement",)),
    ("owner_id", str(uuid4()), ("owner_id",)),
    ("id", str(uuid4()), ("id",)),
    ("status", "archived", ("status",)),
]


@pytest.mark.parametrize(("field", "value", "location"), INVALID_FIELDS)
def test_an_invalid_field_is_refused_and_named(
    client: TestClient, field: str, value: Any, location: tuple[str, ...]
) -> None:
    owner = make_user()
    idea = make_idea(owner)

    resp = client.post(
        URL, json=create_body(idea.id, current_template(), **{field: value}), headers=auth(owner)
    )

    assert resp.status_code == 422, resp.text
    locations = [tuple(error["loc"][1:]) for error in resp.json()["detail"]]
    assert location in locations
    assert_nothing_saved(idea.id, owner)


INVALID_AGREEMENT: list[tuple[str, Any]] = [
    ("signed_legal_name", "A"),
    ("signed_legal_name", "  A  "),
    ("signed_legal_name", "   "),
    ("signed_legal_name", ""),
    ("signed_legal_name", "L" * 201),
    ("signed_legal_name", None),
    ("signed_legal_name", 42),
    ("template_sha256", "a" * 63),
    ("template_sha256", "a" * 65),
    ("template_sha256", "A" * 64),
    ("template_sha256", ""),
    ("template_sha256", None),
    ("template_id", "not-a-uuid"),
    ("template_id", None),
    ("terms_snapshot", {"ownership_model": "custom"}),
]


@pytest.mark.parametrize(("field", "value"), INVALID_AGREEMENT)
def test_an_invalid_agreement_field_is_refused_and_named(
    client: TestClient, field: str, value: Any
) -> None:
    owner = make_user()
    idea = make_idea(owner)
    template = current_template()
    body = create_body(idea.id, template, agreement=with_agreement(template, **{field: value}))

    resp = client.post(URL, json=body, headers=auth(owner))

    assert resp.status_code == 422, resp.text
    locations = [tuple(error["loc"][1:]) for error in resp.json()["detail"]]
    assert ("agreement", field) in locations
    assert_nothing_saved(idea.id, owner)


def test_terms_over_the_size_limit_are_refused(client: TestClient) -> None:
    # notes within 1000 characters, but escaped as JSON they pass the size limit
    owner = make_user()
    idea = make_idea(owner)
    notes = "\u0001" * 1000
    terms = {"ownership_model": "custom", "notes": notes}

    resp = client.post(
        URL, json=create_body(idea.id, current_template(), terms=terms), headers=auth(owner)
    )

    assert resp.status_code == 422, resp.text
    assert str(MAX_HUB_TERMS_JSON_CHARS) in resp.text
    assert_nothing_saved(idea.id, owner)


@pytest.mark.parametrize("raw", ["", "not json", "[]", "null"])
def test_a_body_that_is_not_a_json_object_is_refused(client: TestClient, raw: str) -> None:
    owner = make_user()

    resp = client.post(
        URL,
        content=raw,
        headers=auth(owner) | {"Content-Type": "application/json"},
    )

    assert resp.status_code == 422, resp.text
    assert count_rows_of_user(owner) == 0


# --- all or nothing -----------------------------------------------------------------------


def test_when_the_database_refuses_at_commit_nothing_is_saved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Break the owner's membership so the database refuses the hub at COMMIT, after the
    hub and the signature were already written: both must be gone."""
    owner = make_user()
    idea = make_idea(owner)

    def not_an_owner(**fields: Any) -> HubMember:
        return HubMember(**(fields | {"member_role": HubMemberRole.MEMBER}))

    monkeypatch.setattr(hubs_api, "HubMember", not_an_owner)
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.post(URL, json=create_body(idea.id, current_template()), headers=auth(owner))

    assert resp.status_code == 500
    assert_nothing_saved(idea.id, owner)
