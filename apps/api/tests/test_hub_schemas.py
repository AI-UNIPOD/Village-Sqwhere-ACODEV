"""What the hub request schemas accept and refuse, and what the responses show.

The limits match the CHECK constraints in infra/db/init, so a bad request gets a 422 that
names the field instead of a database error.
"""

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import Idea
from app.schemas.hubs import (
    MAX_HUB_TERMS_JSON_CHARS,
    AgreementAcceptance,
    CreateHubRequest,
    Hub,
    HubIdea,
    HubListResponse,
    UpdateHubRequest,
)

SHA = "a" * 64


def valid_create(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "idea_id": str(uuid4()),
        "name": "Farm Ledger Hub",
        "description": "Building an offline ledger for farmers in Kano.",
        "terms": {"ownership_model": "equal_split"},
        "agreement": {
            "template_id": str(uuid4()),
            "template_sha256": SHA,
            "signed_legal_name": "Amina Bello",
        },
    }
    body.update(changes)
    return body


def error_fields(error: pytest.ExceptionInfo[ValidationError]) -> list[tuple]:
    return [tuple(str(part) for part in item["loc"]) for item in error.value.errors()]


def test_a_valid_create_request_is_accepted_and_trimmed() -> None:
    request = CreateHubRequest.model_validate(valid_create(name="  Farm Ledger Hub  "))
    assert request.name == "Farm Ledger Hub"
    assert request.terms.stored() == {"ownership_model": "equal_split"}
    assert request.agreement.signed_legal_name == "Amina Bello"


def test_description_and_terms_are_optional() -> None:
    body = valid_create()
    del body["description"], body["terms"]
    request = CreateHubRequest.model_validate(body)
    assert request.description is None
    # missing terms mean an equal split
    assert request.terms.stored() == {"ownership_model": "equal_split"}


@pytest.mark.parametrize("name", ["", "   ", "x" * 121])
def test_a_hub_name_must_be_1_to_120_characters(name: str) -> None:
    with pytest.raises(ValidationError) as error:
        CreateHubRequest.model_validate(valid_create(name=name))
    assert error_fields(error) == [("name",)]


def test_a_hub_name_of_120_characters_is_accepted() -> None:
    assert CreateHubRequest.model_validate(valid_create(name="x" * 120)).name == "x" * 120


def test_a_description_over_2000_characters_is_refused() -> None:
    with pytest.raises(ValidationError) as error:
        CreateHubRequest.model_validate(valid_create(description="x" * 2001))
    assert error_fields(error) == [("description",)]


@pytest.mark.parametrize("sha", ["a" * 63, "a" * 65, "A" * 64, "g" * 64, ""])
def test_template_sha256_must_be_64_lowercase_hex_characters(sha: str) -> None:
    with pytest.raises(ValidationError) as error:
        AgreementAcceptance.model_validate(
            {"template_id": str(uuid4()), "template_sha256": sha, "signed_legal_name": "Amina"}
        )
    assert error_fields(error) == [("template_sha256",)]


@pytest.mark.parametrize("legal_name", ["A", "  A  ", "x" * 201])
def test_a_legal_name_must_be_2_to_200_characters(legal_name: str) -> None:
    with pytest.raises(ValidationError) as error:
        AgreementAcceptance.model_validate(
            {"template_id": str(uuid4()), "template_sha256": SHA, "signed_legal_name": legal_name}
        )
    assert error_fields(error) == [("signed_legal_name",)]


@pytest.mark.parametrize("terms", [["equal_split"], "equal_split", 42, None, True])
def test_terms_must_be_a_json_object(terms: object) -> None:
    with pytest.raises(ValidationError) as error:
        CreateHubRequest.model_validate(valid_create(terms=terms))
    assert error_fields(error) == [("terms",)]


def test_terms_over_the_size_limit_are_refused() -> None:
    # notes fit in 1000 characters, but each control character is 6 characters as JSON
    prefix = {"ownership_model": "custom", "notes": ""}
    room = MAX_HUB_TERMS_JSON_CHARS - len(json.dumps(prefix, separators=(",", ":")))
    at_limit = {"ownership_model": "custom", "notes": "\u0001" * 650 + "x" * (room - 6 * 650)}
    assert len(json.dumps(at_limit, separators=(",", ":"))) == MAX_HUB_TERMS_JSON_CHARS
    request = CreateHubRequest.model_validate(valid_create(terms=at_limit))
    assert request.terms.stored() == at_limit

    over = at_limit | {"notes": at_limit["notes"] + "x"}
    with pytest.raises(ValidationError) as error:
        CreateHubRequest.model_validate(valid_create(terms=over))
    assert error_fields(error) == [("terms",)]


def test_accents_count_as_one_character_towards_the_size_limit() -> None:
    notes = "é" * 1000
    request = CreateHubRequest.model_validate(
        valid_create(terms={"ownership_model": "custom", "notes": notes})
    )
    assert request.terms.notes == notes


@pytest.mark.parametrize("field", ["owner_id", "id", "status", "archived_at"])
def test_a_create_request_refuses_unknown_fields(field: str) -> None:
    with pytest.raises(ValidationError) as error:
        CreateHubRequest.model_validate(valid_create(**{field: "x"}))
    assert error_fields(error) == [(field,)]


def test_an_agreement_acceptance_refuses_unknown_fields() -> None:
    agreement = valid_create()["agreement"] | {"terms_snapshot": {"ownership_model": "mine"}}
    with pytest.raises(ValidationError) as error:
        CreateHubRequest.model_validate(valid_create(agreement=agreement))
    assert error_fields(error) == [("agreement", "terms_snapshot")]


# --- updates -----------------------------------------------------------------------------


def test_an_update_with_nothing_is_refused() -> None:
    with pytest.raises(ValidationError):
        UpdateHubRequest.model_validate({})


def test_an_update_cannot_change_terms() -> None:
    with pytest.raises(ValidationError) as error:
        UpdateHubRequest.model_validate({"name": "New name", "terms": {"ownership_model": "x"}})
    assert error_fields(error) == [("terms",)]


def test_an_update_cannot_set_the_name_to_null() -> None:
    with pytest.raises(ValidationError) as error:
        UpdateHubRequest.model_validate({"name": None})
    assert error_fields(error) == [("name",)]


@pytest.mark.parametrize("name", ["", "x" * 121])
def test_an_update_checks_the_name_like_create(name: str) -> None:
    with pytest.raises(ValidationError) as error:
        UpdateHubRequest.model_validate({"name": name})
    assert error_fields(error) == [("name",)]


def test_description_null_clears_it_and_leaving_it_out_keeps_it() -> None:
    cleared = UpdateHubRequest.model_validate({"description": None})
    assert "description" in cleared.model_fields_set
    assert cleared.description is None

    renamed = UpdateHubRequest.model_validate({"name": "  New name  "})
    assert renamed.name == "New name"
    assert "description" not in renamed.model_fields_set
    assert renamed.model_dump(exclude_unset=True) == {"name": "New name"}


# --- responses ---------------------------------------------------------------------------


def test_the_hub_idea_never_includes_the_confidential_details() -> None:
    idea = Idea(
        id=uuid4(),
        author_id=uuid4(),
        title="Offline farm ledger",
        summary="A ledger app for smallholder farmers in Kano that works fully offline.",
        details="Confidential plan, for hub members only.",
    )
    shown = HubIdea.model_validate(idea).model_dump()
    assert set(shown) == {"id", "title", "summary"}
    assert "details" not in Hub.model_fields
    assert "details" not in HubIdea.model_fields


def test_a_hub_list_response_has_data_and_next_offset() -> None:
    now = datetime.now(UTC)
    hub = {
        "id": uuid4(),
        "name": "Farm Ledger Hub",
        "description": None,
        "status": "active",
        "terms": {},
        "idea": {"id": uuid4(), "title": "Offline farm ledger", "summary": "A ledger."},
        "owner": {
            "id": uuid4(),
            "username": "amina-kano",
            "display_name": "Amina Bello",
            "avatar_url": None,
            "is_verified": False,
        },
        "member_count": 1,
        "agreement": {"template_id": uuid4(), "version": 1},
        "created_at": now,
        "updated_at": now,
        "archived_at": None,
        "viewer": {"membership_status": None, "member_role": None},
    }
    page = HubListResponse.model_validate({"data": [hub], "next_offset": None})
    assert page.data[0].viewer.membership_status is None
    assert page.model_dump(mode="json")["data"][0]["status"] == "active"
