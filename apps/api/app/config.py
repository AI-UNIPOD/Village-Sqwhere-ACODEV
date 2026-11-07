import os
from pathlib import Path

# Load .env file if available (checks current working dir and project root)
for env_path in [
    Path(".env"),
    Path(__file__).resolve().parent.parent.parent / ".env",
    Path(__file__).resolve().parent.parent.parent.parent / ".env",
]:
    if env_path.is_file():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_path)
            break
        except ImportError:
            pass

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://village:village@localhost:5432/village_sqwhere"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY", "acodev-insecure-dev-secret-key-change-in-production-12345"
)
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_SECONDS = int(os.getenv("ACCESS_TOKEN_EXPIRE_SECONDS", 900))  # 15 minutes
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30))  # 30 days

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
BITBUCKET_CLIENT_ID = os.getenv("BITBUCKET_CLIENT_ID")
BITBUCKET_CLIENT_SECRET = os.getenv("BITBUCKET_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
