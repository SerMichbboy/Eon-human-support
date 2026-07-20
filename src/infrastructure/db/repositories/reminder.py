from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.reminder.entity import Reminder, ReminderStatus
from src.domain.reminder.repository import IReminderRepository
from src.infrastructure.db.models import ReminderModel


class ReminderRepository(IReminderRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, reminder: Reminder) -> None:
        model = await self._session.get(ReminderModel, reminder.id)
        if model is None:
            model = ReminderModel(id=reminder.id)
            self._session.add(model)
        model.companion_id = reminder.companion_id
        model.message = reminder.message
        model.due_at = reminder.due_at
        model.status = reminder.status.value
        model.created_at = reminder.created_at
        await self._session.flush()

    async def get_by_id(self, reminder_id: UUID) -> Reminder | None:
        model = await self._session.get(ReminderModel, reminder_id)
        if not model:
            return None
        return Reminder(
            id=model.id,
            companion_id=model.companion_id,
            message=model.message,
            due_at=model.due_at,
            status=ReminderStatus(model.status),
            created_at=model.created_at,
        )

    async def mark_status(self, reminder_id: UUID, status: str) -> None:
        model = await self._session.get(ReminderModel, reminder_id)
        if model:
            model.status = status
            await self._session.flush()
