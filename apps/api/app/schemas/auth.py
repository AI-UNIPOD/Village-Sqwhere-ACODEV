from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.users import UserProfile


class OAuthStartRequest(BaseModel):
    intent: Literal["login", "link"] = "login"
    redirect_uri: str = Field(max_length=200)
    code_challenge: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    code_challenge_method: Literal["S256"] = "S256"


class OAuthStartData(BaseModel):
    authorize_url: str
    expires_at: datetime


class OAuthStartResponse(BaseModel):
    data: OAuthStartData


class TokenRequestLoginCode(BaseModel):
    grant_type: Literal["login_code"] = "login_code"
    login_code: str = Field(min_length=20, max_length=200)
    code_verifier: str = Field(pattern=r"^[A-Za-z0-9._~-]{43,128}$")
    device_name: str | None = Field(default=None, max_length=100)


class TokenRequestRefresh(BaseModel):
    grant_type: Literal["refresh_token"] = "refresh_token"
    refresh_token: str = Field(min_length=32, max_length=512)


class TokenData(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 900
    refresh_token: str
    refresh_expires_at: datetime
    is_new_user: bool = False
    user: UserProfile


class TokenResponse(BaseModel):
    data: TokenData


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)

