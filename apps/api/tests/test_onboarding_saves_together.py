"""The web saves the five onboarding answers at the same moment (onboarding/save-answers.ts), so
the API must take them in any order, at once, and keep every one."""

import asyncio

import httpx
import pytest
from httpx import ASGITransport

from app.main import app
from tests.hub_support import auth, make_user

ROLE = "backend-engineer"


async def save_everything_at_once(headers: dict[str, str]) -> list[httpx.Response]:
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as api:
        return await asyncio.gather(
            api.post("/v1/me/roles", headers=headers, json={"role": ROLE, "is_primary": True}),
            api.put(
                "/v1/me/technologies", headers=headers, json={"technologies": ["go", "docker"]}
            ),
            api.put("/v1/me/feed-topics", headers=headers, json={"technologies": ["python"]}),
            api.put("/v1/me/sectors", headers=headers, json={"sectors": ["fintech"]}),
            api.patch("/v1/me", headers=headers, json={"country_code": "SN"}),
        )


@pytest.mark.parametrize("round_", range(3))
def test_the_five_onboarding_saves_sent_together_all_succeed_and_are_all_kept(
    client, round_: int
) -> None:
    user = make_user()
    headers = auth(user)

    answers = asyncio.run(save_everything_at_once(headers))
    assert [response.status_code for response in answers] == [201, 200, 200, 200, 200], [
        response.text for response in answers
    ]

    # sending them all again, as Try again does, is safe too
    again = asyncio.run(save_everything_at_once(headers))
    assert [response.status_code for response in again][1:] == [200, 200, 200, 200]
    assert again[0].status_code in (200, 201, 409), again[0].text

    me = client.get("/v1/me", headers=headers).json()["data"]
    assert [role["slug"] for role in me["roles"]] == [ROLE]
    assert me["roles"][0]["is_primary"] is True
    assert {tech["slug"] for tech in me["technologies"]} == {"go", "docker"}
    assert [topic["slug"] for topic in me["feed_topics"]] == ["python"]
    assert [sector["slug"] for sector in me["sectors"]] == ["fintech"]
    assert me["country_code"] == "SN"
