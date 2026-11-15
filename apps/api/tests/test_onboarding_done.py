"""PATCH /v1/me onboarding_completed: docs/decisions/2026-11-15-onboarding-done.md"""

from fastapi.testclient import TestClient

from tests.hub_support import auth, make_user


def test_onboarding_is_recorded_once_and_kept(client: TestClient) -> None:
    user = make_user()
    me = client.get("/v1/me", headers=auth(user)).json()["data"]
    assert me["onboarding_completed_at"] is None

    first = client.patch("/v1/me", headers=auth(user), json={"onboarding_completed": True})
    assert first.status_code == 200, first.text
    done_at = first.json()["data"]["onboarding_completed_at"]
    assert done_at is not None

    again = client.patch("/v1/me", headers=auth(user), json={"onboarding_completed": True})
    assert again.json()["data"]["onboarding_completed_at"] == done_at
    assert client.get("/v1/me", headers=auth(user)).json()["data"]["onboarding_completed_at"] == (
        done_at
    )


def test_onboarding_can_be_recorded_with_other_fields(client: TestClient) -> None:
    user = make_user()
    response = client.patch(
        "/v1/me",
        headers=auth(user),
        json={"onboarding_completed": True, "country_code": "SN", "bio": "Building in Dakar."},
    )

    data = response.json()["data"]
    assert data["onboarding_completed_at"] is not None
    assert (data["country_code"], data["bio"]) == ("SN", "Building in Dakar.")


def test_only_true_is_accepted(client: TestClient) -> None:
    user = make_user()
    for value in (False, None, "yes", 1):
        response = client.patch("/v1/me", headers=auth(user), json={"onboarding_completed": value})
        assert response.status_code == 422, (value, response.text)
    assert (
        client.get("/v1/me", headers=auth(user)).json()["data"]["onboarding_completed_at"] is None
    )


def test_leaving_it_out_changes_nothing(client: TestClient) -> None:
    user = make_user()
    client.patch("/v1/me", headers=auth(user), json={"onboarding_completed": True})
    done_at = client.get("/v1/me", headers=auth(user)).json()["data"]["onboarding_completed_at"]

    client.patch("/v1/me", headers=auth(user), json={"bio": "Still here."})

    assert client.get("/v1/me", headers=auth(user)).json()["data"]["onboarding_completed_at"] == (
        done_at
    )
