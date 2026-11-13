from fastapi.testclient import TestClient


def test_a_lone_surrogate_in_the_body_answers_422(client: TestClient) -> None:
    # The JSON escape decodes to a lone surrogate, which UTF-8 cannot encode. The 422 echoes
    # the input back, and rendering that used to fail with a 500.
    resp = client.post(
        "/v1/auth/token",
        content=b'{"grant_type": "refresh_token", "refresh_token": "\ud800"}',
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 422
    error = resp.json()["detail"][0]
    assert error["loc"][:2] == ["body", "refresh_token"]
    assert error["input"] == "\ud800"


def test_other_validation_errors_keep_their_shape(client: TestClient) -> None:
    resp = client.post("/v1/auth/token", json={"grant_type": "refresh_token"})
    assert resp.status_code == 422
    assert resp.headers["content-type"] == "application/json"
    error = resp.json()["detail"][0]
    assert error["type"] == "missing"
    assert error["loc"][:2] == ["body", "refresh_token"]
