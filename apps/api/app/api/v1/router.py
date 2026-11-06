from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.lookups import router as lookups_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(health_router, tags=["System"])
api_v1_router.include_router(lookups_router, tags=["Lookups"])
