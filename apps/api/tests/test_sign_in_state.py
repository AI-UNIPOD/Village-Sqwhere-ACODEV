"""Sign-in state lives in the database, so any API instance can finish what another started.

"Another instance" is played by writing a row straight into the database: this process never
saw the state, the code or the revocation, exactly like a second instance on Vercel.
The test database is shared and never cleaned, so every state, code and token here is new.
Why: docs/decisions/2026-11-19-sign-in-state-in-postgres.md
"""

import hashlib
import secrets
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api.v1 import auth
from app.core.security import create_refresh_token, generate_code_challenge_s256
from app.database import get_db
from app.main import app
from tests.conftest import REDIRECT_URI, VERIFIER, callback_result, start_sign_in
from tests.hub_support import make_user, run
from tests.test_auth import token_request

SCRIPT = Path(__file__).resolve().parents[3] / "infra" / "db" / "init" / "029-sign-in-state.sql"
TABLES = ("login_codes", "oauth_states", "revoked_refresh_tokens")


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def sql(statement: str, **values: Any) -> list[tuple[Any, ...]]:
    async def work(session: Any) -> list[tuple[Any, ...]]:
        result = await session.execute(text(statement), values)
        rows = [tuple(row) for row in result] if result.returns_rows else []
        await session.commit()
        return rows

    return run(work)


def stored(table: str, column: str, value: str) -> list[str]:
    """The rows kept for a state, a code or a token, found by its hash, each as JSON text."""
    rows = sql(
        f"SELECT to_jsonb(t)::text FROM {table} t WHERE {column} = :hash", hash=sha256(value)
    )
    return [row[0] for row in rows]


def expire(table: str, column: str, value: str) -> None:
    sql(
        f"UPDATE {table} SET expires_at = now() - interval '1 second' WHERE {column} = :hash",
        hash=sha256(value),
    )


def state_from_another_instance() -> str:
    state = secrets.token_urlsafe(32)
    sql(
        "INSERT INTO oauth_states (state_sha256, provider, code_challenge, redirect_uri, "
        "expires_at) VALUES (:hash, 'github', :challenge, :uri, now() + interval '10 minutes')",
        hash=sha256(state),
        challenge=generate_code_challenge_s256(VERIFIER),
        uri=REDIRECT_URI,
    )
    return state


def refresh(client: TestClient, refresh_token: str) -> Any:
    return client.post(
        "/v1/auth/token", json={"grant_type": "refresh_token", "refresh_token": refresh_token}
    )


def race[T](request: Callable[[TestClient], T], times: int = 8) -> list[T]:
    """Send the same request from several threads at the same moment, each with its own client,
    as several instances would get it."""
    barrier = Barrier(times)

    def go(_: int) -> T:
        barrier.wait()
        return request(TestClient(app))

    with ThreadPoolExecutor(times) as pool:
        return list(pool.map(go, range(times)))


def test_the_api_keeps_no_sign_in_state_in_memory() -> None:
    kept = [
        name
        for name, value in vars(auth).items()
        if not name.startswith("__") and isinstance(value, dict | set | list)
    ]

    assert kept == []


def test_a_state_issued_by_another_instance_finishes_sign_in_here(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    state = state_from_another_instance()

    login_code = callback_result(client, github_account(), state)["login_code"]

    assert client.post("/v1/auth/token", json=token_request(login_code)).status_code == 200
    assert stored("oauth_states", "state_sha256", state) == []
    assert stored("login_codes", "code_sha256", login_code) == []


def test_a_login_code_issued_by_another_instance_is_exchanged_here(client: TestClient) -> None:
    user = make_user()
    login_code = f"lc_{secrets.token_urlsafe(32)}"
    sql(
        "INSERT INTO login_codes (code_sha256, user_id, is_new_user, code_challenge, expires_at) "
        "VALUES (:hash, :user, true, :challenge, now() + interval '5 minutes')",
        hash=sha256(login_code),
        user=user.id,
        challenge=generate_code_challenge_s256(VERIFIER),
    )

    resp = client.post("/v1/auth/token", json=token_request(login_code))

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["user"]["id"] == str(user.id)
    assert resp.json()["data"]["is_new_user"] is True


def test_a_token_revoked_by_another_instance_is_refused_here(client: TestClient) -> None:
    refresh_token, expires_at = create_refresh_token(make_user().id)
    sql(
        "INSERT INTO revoked_refresh_tokens (token_sha256, expires_at) VALUES (:hash, :expires)",
        hash=sha256(refresh_token),
        expires=expires_at,
    )

    resp = refresh(client, refresh_token)

    assert resp.status_code == 401
    assert resp.json()["detail"] == {
        "code": "REFRESH_TOKEN_INVALID",
        "message": "Refresh token has been revoked",
    }


def test_logout_is_kept_where_every_instance_reads_it(client: TestClient) -> None:
    refresh_token, expires_at = create_refresh_token(make_user().id)

    assert client.post("/v1/auth/logout", json={"refresh_token": refresh_token}).status_code == 204

    # kept until the token would have expired anyway (a token's expiry has no microseconds)
    assert sql(
        "SELECT expires_at FROM revoked_refresh_tokens WHERE token_sha256 = :hash",
        hash=sha256(refresh_token),
    ) == [(expires_at.replace(microsecond=0),)]
    assert refresh(client, refresh_token).status_code == 401
    # signing out twice is not an error
    assert client.post("/v1/auth/logout", json={"refresh_token": refresh_token}).status_code == 204


def test_a_refreshed_token_is_revoked_for_every_instance(client: TestClient) -> None:
    refresh_token, _ = create_refresh_token(make_user().id)

    assert refresh(client, refresh_token).status_code == 200

    assert len(stored("revoked_refresh_tokens", "token_sha256", refresh_token)) == 1
    assert refresh(client, refresh_token).status_code == 401


def test_logout_of_something_that_is_not_a_token_stores_nothing(client: TestClient) -> None:
    made_up = f"rt_{secrets.token_urlsafe(40)}"

    assert client.post("/v1/auth/logout", json={"refresh_token": made_up}).status_code == 204

    assert stored("revoked_refresh_tokens", "token_sha256", made_up) == []


def test_only_hashes_are_stored(client: TestClient, github_account: Callable[..., str]) -> None:
    state = start_sign_in(client)
    [state_row] = stored("oauth_states", "state_sha256", state)
    assert state not in state_row

    login_code = callback_result(client, github_account(), state)["login_code"]
    [code_row] = stored("login_codes", "code_sha256", login_code)
    assert login_code.removeprefix("lc_") not in code_row

    tokens = client.post("/v1/auth/token", json=token_request(login_code)).json()["data"]
    client.post("/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    [token_row] = stored("revoked_refresh_tokens", "token_sha256", tokens["refresh_token"])
    assert tokens["refresh_token"].removeprefix("rt_") not in token_row


def test_a_state_raced_by_several_instances_signs_in_once(
    github_account: Callable[..., str],
) -> None:
    state, code = state_from_another_instance(), github_account()

    results = race(lambda client: callback_result(client, code, state))

    assert len([result for result in results if "login_code" in result]) == 1
    assert [result for result in results if "login_code" not in result] == [
        {"error": "INVALID_STATE"}
    ] * 7


def test_a_login_code_raced_by_several_instances_is_exchanged_once(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    login_code = callback_result(client, github_account(), start_sign_in(client))["login_code"]

    statuses = race(
        lambda client: client.post("/v1/auth/token", json=token_request(login_code)).status_code
    )

    assert sorted(statuses) == [200] + [401] * 7


def test_a_refresh_token_raced_by_several_instances_is_rotated_once() -> None:
    refresh_token, _ = create_refresh_token(make_user().id)

    statuses = race(lambda client: refresh(client, refresh_token).status_code)

    assert sorted(statuses) == [200] + [401] * 7


def test_callback_sends_the_person_back_when_the_database_cannot_be_reached(
    client: TestClient, github: list[str]
) -> None:
    class DatabaseDown:
        async def execute(self, *args: Any, **kwargs: Any) -> None:
            raise ConnectionError("the database is down")

    app.dependency_overrides[get_db] = DatabaseDown

    # a redirect to the web app, which can say so, and not a bare 500 on the API's address
    assert callback_result(client, "github-code-ada", secrets.token_urlsafe(32)) == {
        "error": "OAUTH_EXCHANGE_FAILED"
    }
    assert github == []


def test_an_expired_state_is_refused_then_removed(client: TestClient, github: list[str]) -> None:
    state = start_sign_in(client)
    expire("oauth_states", "state_sha256", state)

    assert callback_result(client, "github-code-ada", state) == {"error": "INVALID_STATE"}
    assert github == []

    # the next state written takes the expired ones out
    start_sign_in(client)
    assert stored("oauth_states", "state_sha256", state) == []


def test_an_expired_login_code_is_refused_then_removed(
    client: TestClient, github_account: Callable[..., str]
) -> None:
    login_code = callback_result(client, github_account(), start_sign_in(client))["login_code"]
    expire("login_codes", "code_sha256", login_code)

    resp = client.post("/v1/auth/token", json=token_request(login_code))

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "LOGIN_CODE_INVALID"
    # the next code written takes the expired ones out
    callback_result(client, github_account(), start_sign_in(client))
    assert stored("login_codes", "code_sha256", login_code) == []


def test_a_revoked_token_is_forgotten_once_it_would_have_expired(client: TestClient) -> None:
    long_gone, _ = create_refresh_token(make_user().id)
    sql(
        "INSERT INTO revoked_refresh_tokens (token_sha256, expires_at) "
        "VALUES (:hash, now() - interval '1 second')",
        hash=sha256(long_gone),
    )
    refresh_token, _ = create_refresh_token(make_user().id)

    client.post("/v1/auth/logout", json={"refresh_token": refresh_token})

    assert stored("revoked_refresh_tokens", "token_sha256", long_gone) == []
    assert len(stored("revoked_refresh_tokens", "token_sha256", refresh_token)) == 1


SCHEMA_QUERIES = (
    """SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
              pg_get_expr(d.adbin, d.adrelid), a.attnotnull
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE c.relname = ANY($1) AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY 1, a.attnum""",
    """SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid)
       FROM pg_constraint WHERE conrelid::regclass::text = ANY($1) ORDER BY 1, 2""",
    "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE tablename = ANY($1) ORDER BY 1, 2",
)


def test_the_script_runs_twice_and_leaves_the_tables_as_they_were() -> None:
    script = SCRIPT.read_text(encoding="utf-8")

    async def work(session: Any) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]]]:
        database = (await (await session.connection()).get_raw_connection()).driver_connection

        async def schema() -> list[tuple[Any, ...]]:
            return [
                tuple(row)
                for query in SCHEMA_QUERIES
                for row in await database.fetch(query, list(TABLES))
            ]

        before = await schema()
        await database.execute(script)
        await database.execute(script)
        return before, await schema()

    before, after = run(work)

    assert after == before
    assert {
        "oauth_states_pkey",
        "oauth_states_sha256_format",
        "oauth_states_expires_at_idx",
        "login_codes_pkey",
        "login_codes_sha256_format",
        "login_codes_user_id_fkey",
        "login_codes_expires_at_idx",
        "login_codes_user_idx",
        "revoked_refresh_tokens_pkey",
        "revoked_refresh_tokens_sha256_format",
        "revoked_refresh_tokens_expires_at_idx",
    } <= {row[1] for row in before}
