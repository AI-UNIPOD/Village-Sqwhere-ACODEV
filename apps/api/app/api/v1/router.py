from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.comments import router as comments_router
from app.api.v1.health import router as health_router
from app.api.v1.hub_build import router as hub_build_router
from app.api.v1.hub_chat import router as hub_chat_router
from app.api.v1.hub_design import router as hub_design_router
from app.api.v1.hub_members import router as hub_members_router
from app.api.v1.hub_notes import router as hub_notes_router
from app.api.v1.hub_phases import router as hub_phases_router
from app.api.v1.hub_settings import router as hub_settings_router
from app.api.v1.hubs import router as hubs_router
from app.api.v1.ideas import router as ideas_router
from app.api.v1.interviews import router as interviews_router
from app.api.v1.lookups import router as lookups_router
from app.api.v1.matches import router as matches_router
from app.api.v1.me import router as me_router
from app.api.v1.posts import router as posts_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.users import router as users_router
from app.api.v1.verifications import router as verifications_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(health_router, tags=["System"])
api_v1_router.include_router(interviews_router, tags=["Interviews"])
api_v1_router.include_router(lookups_router, tags=["Lookups"])
api_v1_router.include_router(auth_router, tags=["Auth"])
api_v1_router.include_router(me_router, tags=["Me"])
api_v1_router.include_router(users_router, tags=["Profiles"])
api_v1_router.include_router(posts_router, tags=["Posts"])
api_v1_router.include_router(comments_router, tags=["Comments"])
api_v1_router.include_router(verifications_router, tags=["Verifications"])
api_v1_router.include_router(reviews_router, tags=["Reviews"])
api_v1_router.include_router(hubs_router, tags=["Hubs"])
api_v1_router.include_router(hub_members_router, tags=["Hubs"])
api_v1_router.include_router(hub_phases_router, tags=["Hubs"])
api_v1_router.include_router(hub_settings_router, tags=["Hubs"])
api_v1_router.include_router(hub_notes_router, tags=["Hubs"])
api_v1_router.include_router(hub_chat_router, tags=["Hubs"])
api_v1_router.include_router(hub_design_router, tags=["Hubs"])
api_v1_router.include_router(hub_build_router, tags=["Hubs"])
api_v1_router.include_router(ideas_router, tags=["Ideas"])
api_v1_router.include_router(matches_router, tags=["Matching"])
