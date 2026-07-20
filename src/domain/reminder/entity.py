from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4


class ReminderStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


@dataclass
class Reminder:
    id: UUID
    companion_id: UUID
    message: str  # encrypted at rest, same as Message.content
    due_at: datetime  # UTC
    status: ReminderStatus
    created_at: datetime

    @staticmethod
    def create(companion_id: UUID, message: str, due_at: datetime) -> "Reminder":
        return Reminder(
            id=uuid4(),
            companion_id=companion_id,
            message=message,
            due_at=due_at,
            status=ReminderStatus.PENDING,
            created_at=datetime.utcnow(),
        )
