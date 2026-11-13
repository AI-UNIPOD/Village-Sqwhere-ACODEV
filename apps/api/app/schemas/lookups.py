from pydantic import BaseModel, ConfigDict


class RoleRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class RolesListResponse(BaseModel):
    data: list[RoleRef]


class SectorRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class SectorsListResponse(BaseModel):
    data: list[SectorRef]


class TechnologyRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class TechnologiesListResponse(BaseModel):
    data: list[TechnologyRef]
