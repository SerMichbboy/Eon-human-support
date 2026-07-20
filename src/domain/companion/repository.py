from abc import ABC, abstractmethod
from uuid import UUID

from src.domain.companion.entity import Companion


class ICompanionRepository(ABC):
    @abstractmethod
    async def get_by_user_id(self, user_id: UUID) -> Companion | None: ...

    @abstractmethod
    async def save(self, companion: Companion, encrypt: bool = True) -> None: ...
