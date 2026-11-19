import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from app.config import (
    ACCESS_TOKEN_EXPIRE_SECONDS,
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    REFRESH_TOKEN_EXPIRE_DAYS,
)


def create_access_token(user_id: UUID | str) -> str:
    now = datetime.now(UTC)
    expire = now + timedelta(seconds=ACCESS_TOKEN_EXPIRE_SECONDS)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "jti": secrets.token_hex(8),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, object] | None:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.PyJWTError):
        return None


def create_refresh_token(user_id: UUID | str) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        # two tokens made for one account in the same second must not be the same token, or
        # signing out of one session would sign out the other (the shared demo account)
        "jti": secrets.token_hex(8),
        "iat": now,
        "exp": expire,
    }
    encoded = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return "rt_" + encoded, expire


def decode_refresh_token(token: str) -> dict[str, object] | None:
    if not token.startswith("rt_"):
        return None
    raw = token[3:]
    try:
        payload = jwt.decode(raw, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.PyJWTError):
        return None


def generate_code_challenge_s256(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def verify_pkce(code_verifier: str, code_challenge: str) -> bool:
    expected = generate_code_challenge_s256(code_verifier)
    return secrets.compare_digest(expected, code_challenge)
