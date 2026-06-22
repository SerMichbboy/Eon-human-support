from abc import ABC, abstractmethod
from uuid import UUID

from src.domain.profile.entity import UserProfile


class IUserProfileRepository(ABC):
    @abstractmethod
    async def get_by_user_id(self, user_id: UUID) -> UserProfile | None: ...

    @abstractmethod
    async def save(self, profile: UserProfile) -> None: ...
