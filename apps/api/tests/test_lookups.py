from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_roles() -> None:
    response = client.get("/v1/roles")
    assert response.status_code == 200
    payload = response.json()
    assert "data" in payload
    assert isinstance(payload["data"], list)
    assert len(payload["data"]) >= 9
    slugs = [role["slug"] for role in payload["data"]]
    assert "backend-engineer" in slugs


def test_search_technologies() -> None:
    response = client.get("/v1/technologies?q=py")
    assert response.status_code == 200
    payload = response.json()
    assert "data" in payload
    assert isinstance(payload["data"], list)
    slugs = [tech["slug"] for tech in payload["data"]]
    assert any("py" in slug for slug in slugs)
