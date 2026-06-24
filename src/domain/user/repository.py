from abc import ABC, abstractmethod
from uuid import UUID

from src.domain.user.entity import User, UserKey


class IUserRepository(ABC):
    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> User | None: ...

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None: ...

    @abstractmethod
    async def get_by_phone(self, phone: str) -> User | None: ...

    @abstractmethod
    async def save(self, user: User) -> None: ...

    @abstractmethod
    async def delete(self, user_id: UUID) -> None: ...


class IUserKeyRepository(ABC):
    @abstractmethod
    async def save(self, key: UserKey) -> None: ...

    @abstractmethod
    async def get_by_id(self, key_id: UUID) -> UserKey | None: ...

    @abstractmethod
    async def get_by_user_id(self, user_id: UUID) -> UserKey | None: ...

    @abstractmethod
    async def delete(self, key_id: UUID) -> None: ...
