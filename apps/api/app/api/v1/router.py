from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router
from app.api.v1.hubs import router as hubs_router
from app.api.v1.ideas import router as ideas_router
from app.api.v1.interviews import router as interviews_router
from app.api.v1.lookups import router as lookups_router
from app.api.v1.me import router as me_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.verifications import router as verifications_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(health_router, tags=["System"])
api_v1_router.include_router(interviews_router, tags=["Interviews"])
api_v1_router.include_router(lookups_router, tags=["Lookups"])
api_v1_router.include_router(auth_router, tags=["Auth"])
api_v1_router.include_router(me_router, tags=["Me"])
api_v1_router.include_router(verifications_router, tags=["Verifications"])
api_v1_router.include_router(reviews_router, tags=["Reviews"])
api_v1_router.include_router(hubs_router, tags=["Hubs"])
api_v1_router.include_router(ideas_router, tags=["Ideas"])
