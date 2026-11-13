from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.lookups import Role, Sector, Technology
from app.schemas.lookups import RolesListResponse, SectorsListResponse, TechnologiesListResponse

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/roles", response_model=RolesListResponse)
async def list_roles(db: DbSession) -> RolesListResponse:
    query = select(Role).where(Role.is_active.is_(True)).order_by(Role.id.asc())
    result = await db.execute(query)
    roles: Sequence[Role] = result.scalars().all()
    return RolesListResponse(data=list(roles))


@router.get("/sectors", response_model=SectorsListResponse)
async def list_sectors(db: DbSession) -> SectorsListResponse:
    sectors = await db.scalars(select(Sector).where(Sector.is_active.is_(True)).order_by(Sector.id))
    return SectorsListResponse(data=list(sectors))


@router.get("/technologies", response_model=TechnologiesListResponse)
async def search_technologies(
    db: DbSession,
    q: Annotated[str | None, Query(min_length=1, max_length=40)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> TechnologiesListResponse:
    query = select(Technology).where(Technology.is_active.is_(True))
    if q:
        prefix = q.strip()
        query = query.where(
            or_(
                Technology.name.ilike(f"{prefix}%"),
                Technology.slug.ilike(f"{prefix}%"),
            )
        )
    query = query.order_by(Technology.name.asc()).limit(limit)
    result = await db.execute(query)
    technologies: Sequence[Technology] = result.scalars().all()
    return TechnologiesListResponse(data=list(technologies))
