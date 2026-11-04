import os

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://village:village@localhost:5432/village_sqwhere"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
