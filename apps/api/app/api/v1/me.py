from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, user_to_profile
from app.schemas.users import MeResponse, UserProfileUpdate

router = APIRouter()


@router.get("/me", response_model=MeResponse)
async def get_my_profile(current_user: CurrentUser) -> MeResponse:
    return MeResponse(data=user_to_profile(current_user))


@router.patch("/me", response_model=MeResponse)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> MeResponse:
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    if payload.bio is not None:
        current_user.bio = payload.bio
    if payload.email is not None:
        current_user.email = payload.email

    await db.commit()
    await db.refresh(current_user)
    return MeResponse(data=user_to_profile(current_user))

