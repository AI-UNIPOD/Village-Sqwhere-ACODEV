import json

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.config import CORS_ORIGINS

app = FastAPI(title="Village Sqwhere API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router)


class _AsciiJSONResponse(JSONResponse):
    def render(self, content: object) -> bytes:
        return json.dumps(content, allow_nan=False, separators=(",", ":")).encode("ascii")


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's own handler, but the 422 echoes the input, and a lone surrogate in it (sent as
    # "\ud800" in the JSON) cannot be encoded as UTF-8. Escaping to ASCII keeps it a 422.
    return _AsciiJSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})


@app.get("/health")
def root_health() -> dict[str, str]:
    return {"status": "ok"}
