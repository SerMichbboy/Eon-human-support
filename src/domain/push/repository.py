from abc import ABC, abstractmethod
from uuid import UUID

from src.domain.push.entity import PushToken


class IPushTokenRepository(ABC):
    @abstractmethod
    async def upsert(self, user_id: UUID, token: str) -> None: ...

    @abstractmethod
    async def get_by_user_id(self, user_id: UUID) -> PushToken | None: ...
