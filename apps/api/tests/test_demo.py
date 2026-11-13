import asyncio
import re
from collections.abc import Generator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from starlette.websockets import WebSocketDisconnect

from app import config
from app.api.v1 import auth as auth_api
from app.api.v1 import interviews as interviews_api
from app.main import app
from app.models import User
from tests.conftest import test_async_session as db_session

client = TestClient(app)


def _bearer(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _refresh(refresh_token: str):
    return client.post(
        "/v1/auth/token", json={"grant_type": "refresh_token", "refresh_token": refresh_token}
    )


def _code(resp) -> str:
    return resp.json()["detail"]["code"]


def _mark_demo(user_id: str, is_demo: bool) -> None:
    async def _mark() -> None:
        async with db_session() as session:
            await session.execute(update(User).where(User.id == user_id).values(is_demo=is_demo))
            await session.commit()

    asyncio.run(_mark())


@pytest.fixture
def demo(sign_in, github_account, monkeypatch: pytest.MonkeyPatch) -> Generator[dict]:
    """A new account made the demo account, the demo switched on, and its sign-in tokens."""
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    user_id = sign_in(github_account())["user"]["id"]
    _mark_demo(user_id, True)
    monkeypatch.setattr(auth_api, "DEMO_ACCOUNT_ID", UUID(user_id))
    resp = client.post("/v1/auth/demo")
    assert resp.status_code == 200, resp.text
    yield resp.json()["data"]
    _mark_demo(user_id, False)


def test_the_demo_is_off_unless_switched_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", False)
    resp = client.post("/v1/auth/demo")
    assert (resp.status_code, _code(resp)) == (404, "DEMO_UNAVAILABLE")


def test_the_demo_needs_its_account(
    sign_in, github_account, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Switched on, but no demo account at the fixed id (the seed test may have made one at the
    # real id, so point it somewhere empty).
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    monkeypatch.setattr(auth_api, "DEMO_ACCOUNT_ID", uuid4())
    resp = client.post("/v1/auth/demo")
    assert (resp.status_code, _code(resp)) == (404, "DEMO_UNAVAILABLE")

    # A real account at that id is never the demo, and neither is another demo account.
    real_id = sign_in(github_account())["user"]["id"]
    monkeypatch.setattr(auth_api, "DEMO_ACCOUNT_ID", UUID(real_id))
    resp = client.post("/v1/auth/demo")
    assert (resp.status_code, _code(resp)) == (404, "DEMO_UNAVAILABLE")
    made_up_id = sign_in(github_account())["user"]["id"]
    _mark_demo(made_up_id, True)
    try:
        resp = client.post("/v1/auth/demo")
        assert (resp.status_code, _code(resp)) == (404, "DEMO_UNAVAILABLE")
    finally:
        _mark_demo(made_up_id, False)


def test_the_demo_signs_in_reads_refreshes_and_signs_out(demo: dict) -> None:
    assert demo["user"]["is_demo"] is True
    assert client.get("/v1/me", headers=_bearer(demo)).json()["data"]["is_demo"] is True
    assert client.get("/v1/posts", headers=_bearer(demo)).status_code == 200

    refreshed = _refresh(demo["refresh_token"])
    assert refreshed.status_code == 200
    assert refreshed.json()["data"]["user"]["is_demo"] is True
    signed_out = client.post(
        "/v1/auth/logout", json={"refresh_token": refreshed.json()["data"]["refresh_token"]}
    )
    assert signed_out.status_code == 204


def test_a_real_account_is_not_the_demo(sign_in) -> None:
    data = sign_in("github-code-ada")
    assert data["user"]["is_demo"] is False
    assert client.get("/v1/me", headers=_bearer(data)).json()["data"]["is_demo"] is False


def test_every_write_route_refuses_the_demo(demo: dict) -> None:
    # Walks the whole API, so a write route added later is checked without a test of its own.
    refused, not_refused = 0, []
    for path, operations in app.openapi()["paths"].items():
        if path.startswith("/v1/auth/") or not path.startswith("/v1/"):
            continue
        url = re.sub(r"\{role_slug\}", "backend-engineer", path)
        url = re.sub(r"\{[a-z_]+\}", str(uuid4()), url)
        for method in operations:
            if method in ("get", "head", "options"):
                continue
            resp = client.request(method.upper(), url, headers=_bearer(demo), json={})
            if resp.status_code == 403 and _code(resp) == "DEMO_READ_ONLY":
                refused += 1
            else:
                not_refused.append(f"{method.upper()} {path}: {resp.status_code}")
    assert not_refused == []
    assert refused >= 30


def test_switching_the_demo_off_ends_its_sessions(
    demo: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", False)
    me = client.get("/v1/me", headers=_bearer(demo))
    assert (me.status_code, _code(me)) == (401, "DEMO_UNAVAILABLE")
    refreshed = _refresh(demo["refresh_token"])
    assert (refreshed.status_code, _code(refreshed)) == (401, "DEMO_UNAVAILABLE")


def test_the_demo_cannot_take_an_interview(demo: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(interviews_api, "async_session", db_session)
    url = f"/v1/me/verifications/{uuid4()}/interview?token={demo['access_token']}"
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect(url) as websocket:
            websocket.receive_json()
    assert closed.value.code == 1008
    assert closed.value.reason == "The demo cannot take an interview."
