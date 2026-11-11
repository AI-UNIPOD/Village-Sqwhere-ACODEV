from pathlib import Path

from app.main import app

ARCHITECTURE = Path(__file__).resolve().parents[3] / "docs" / "architecture.md"


def test_architecture_doc_lists_every_api_route() -> None:
    """docs/architecture.md is where the web team looks up routes, so a new route without a
    line there fails here instead of going unnoticed."""
    doc = ARCHITECTURE.read_text(encoding="utf-8")
    # the OpenAPI schema lists every public route, however the routers are nested
    routes = [
        f"{method.upper()} {path}"
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    ]
    assert "GET /v1/health" in routes
    missing = [route for route in routes if f"`{route}`" not in doc]
    assert missing == [], f"add these routes to docs/architecture.md: {missing}"
