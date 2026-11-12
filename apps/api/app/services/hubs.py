"""Rules the hub endpoints share, kept in one place."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgreementTemplate


async def current_agreement_template(db: AsyncSession) -> AgreementTemplate | None:
    """The agreement every new hub is created on: the highest published version.

    Never a fixed version, so publishing the real text as a new version replaces the test
    one without a code change.
    """
    result = await db.execute(
        select(AgreementTemplate)
        .where(AgreementTemplate.published_at.is_not(None))
        .order_by(AgreementTemplate.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
