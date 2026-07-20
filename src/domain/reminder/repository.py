from abc import ABC, abstractmethod
from uuid import UUID

from src.domain.reminder.entity import Reminder


class IReminderRepository(ABC):
    @abstractmethod
    async def save(self, reminder: Reminder) -> None: ...

    @abstractmethod
    async def get_by_id(self, reminder_id: UUID) -> Reminder | None: ...

    @abstractmethod
    async def mark_status(self, reminder_id: UUID, status: str) -> None: ...
