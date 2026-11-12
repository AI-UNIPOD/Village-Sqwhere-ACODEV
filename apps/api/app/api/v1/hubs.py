from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.hubs import Agreement, AgreementResponse
from app.services.hubs import current_agreement_template

router = APIRouter()


@router.get("/agreements/current", response_model=AgreementResponse)
async def get_current_agreement(current_user: CurrentUser, db: DbSession) -> AgreementResponse:
    template = await current_agreement_template(db)
    if template is None:
        # a setup problem on the server, not something the person can fix
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "AGREEMENT_NOT_PUBLISHED",
                "message": "No hub agreement is published yet, so hubs cannot be created.",
            },
        )
    return AgreementResponse(
        data=Agreement(
            template_id=template.id,
            version=template.version,
            title=template.title,
            body=template.body,
            body_sha256=template.body_sha256,
            published_at=template.published_at,
        )
    )
