from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.notify.repository import IEmailSuppressionRepository
from src.infrastructure.db.models import EmailSuppressionModel


class EmailSuppressionRepository(IEmailSuppressionRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def is_suppressed(self, email: str) -> bool:
        result = await self._session.execute(
            select(EmailSuppressionModel.email).where(
                EmailSuppressionModel.email == email.strip().lower()
            )
        )
        return result.scalar_one_or_none() is not None

    async def suppress(self, email: str, reason: str) -> None:
        # Upsert on the address so a repeated webhook (or a complaint after a
        # bounce) just updates the reason instead of erroring on the PK.
        stmt = (
            pg_insert(EmailSuppressionModel)
            .values(
                email=email.strip().lower(),
                reason=reason,
                created_at=datetime.utcnow(),
            )
            .on_conflict_do_update(
                index_elements=[EmailSuppressionModel.email],
                set_={"reason": reason},
            )
        )
        await self._session.execute(stmt)
