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

# Neon on Vercel sets DATABASE_URL to its pooled address, which breaks asyncpg's prepared
# statements, and the direct one as DATABASE_URL_UNPOOLED.
DATABASE_URL = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv(
    "DATABASE_URL", "postgresql://village:village@localhost:5432/village_sqwhere"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]


def require_jwt_secret(value: str | None) -> str:
    # No default: a known fallback secret would let anyone sign their own tokens.
    if not value or len(value) < 32:
        raise RuntimeError(
            "JWT_SECRET_KEY must be set to a random value of at least 32 characters. "
            'Make one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    return value


JWT_SECRET_KEY = require_jwt_secret(os.getenv("JWT_SECRET_KEY"))
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_SECONDS = int(os.getenv("ACCESS_TOKEN_EXPIRE_SECONDS", 900))  # 15 minutes
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30))  # 30 days

# "Try the demo": a shared, read-only account anyone can sign in as. Off unless set to "true".
DEMO_ENABLED = os.getenv("DEMO_ENABLED", "false").strip().lower() == "true"

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_API_TOKEN = os.getenv("GITHUB_API_TOKEN")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_CODEBASE_MODEL = os.getenv("GROQ_CODEBASE_MODEL")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")
GROQ_GUARD_MODEL = os.getenv("GROQ_GUARD_MODEL")
GROQ_INTERVIEW_MODEL = os.getenv("GROQ_INTERVIEW_MODEL")
GROQ_EVALUATION_MODEL = os.getenv("GROQ_EVALUATION_MODEL")
GROQ_INTERVIEW_CONTEXT_BUDGET_TOKENS = int(
    os.getenv("GROQ_INTERVIEW_CONTEXT_BUDGET_TOKENS", 115_000)
)
GROQ_INTERVIEW_MAX_OUTPUT_TOKENS = int(os.getenv("GROQ_INTERVIEW_MAX_OUTPUT_TOKENS", 2_048))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_CODEBASE_MODEL = os.getenv("GEMINI_CODEBASE_MODEL")
GEMINI_INTERVIEW_MODEL = os.getenv("GEMINI_INTERVIEW_MODEL")
GEMINI_EVALUATION_MODEL = os.getenv("GEMINI_EVALUATION_MODEL")
VERIFICATION_MAX_ANALYSIS_ATTEMPTS = int(os.getenv("VERIFICATION_MAX_ANALYSIS_ATTEMPTS", 3))
VERIFICATION_WORKER_INTERVAL_SECONDS = float(os.getenv("VERIFICATION_WORKER_INTERVAL_SECONDS", 5))
VERIFICATION_INTERVIEW_MAX_TURNS = max(1, int(os.getenv("VERIFICATION_INTERVIEW_MAX_TURNS", 5)))
BITBUCKET_CLIENT_ID = os.getenv("BITBUCKET_CLIENT_ID")
BITBUCKET_CLIENT_SECRET = os.getenv("BITBUCKET_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# S3-compatible object storage for post images. These stay optional until a bucket is configured.
UPLOADS_S3_BUCKET = os.getenv("UPLOADS_S3_BUCKET")
UPLOADS_S3_REGION = os.getenv("UPLOADS_S3_REGION", "us-east-1")
UPLOADS_S3_ENDPOINT_URL = os.getenv("UPLOADS_S3_ENDPOINT_URL")
UPLOADS_S3_ACCESS_KEY_ID = os.getenv("UPLOADS_S3_ACCESS_KEY_ID")
UPLOADS_S3_SECRET_ACCESS_KEY = os.getenv("UPLOADS_S3_SECRET_ACCESS_KEY")
UPLOADS_PUBLIC_BASE_URL = os.getenv("UPLOADS_PUBLIC_BASE_URL")
