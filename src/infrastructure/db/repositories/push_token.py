from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.push.entity import PushToken
from src.domain.push.repository import IPushTokenRepository
from src.infrastructure.db.models import PushTokenModel


class PushTokenRepository(IPushTokenRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, user_id: UUID, token: str) -> None:
        model = await self._session.get(PushTokenModel, user_id)
        if model is None:
            model = PushTokenModel(user_id=user_id)
            self._session.add(model)
        model.token = token
        model.updated_at = datetime.utcnow()
        await self._session.flush()

    async def get_by_user_id(self, user_id: UUID) -> PushToken | None:
        model = await self._session.get(PushTokenModel, user_id)
        if not model:
            return None
        return PushToken(user_id=model.user_id, token=model.token, updated_at=model.updated_at)
