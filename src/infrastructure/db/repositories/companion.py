from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.companion.entity import Companion
from src.domain.companion.repository import ICompanionRepository
from src.infrastructure.db.models import CompanionModel


class CompanionRepository(ICompanionRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user_id(self, user_id: UUID) -> Companion | None:
        result = await self._session.execute(
            select(CompanionModel).where(CompanionModel.user_id == user_id)
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        return Companion(
            id=model.id, user_id=model.user_id, name=model.name, created_at=model.created_at
        )

    async def save(self, companion: Companion) -> None:
        model = await self._session.get(CompanionModel, companion.id)
        if model is None:
            model = CompanionModel()
            self._session.add(model)
        model.id = companion.id
        model.user_id = companion.user_id
        model.name = companion.name
        model.created_at = companion.created_at
        await self._session.flush()
