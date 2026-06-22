from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class Companion:
    id: UUID
    user_id: UUID
    name: str
    created_at: datetime

    @staticmethod
    def create(user_id: UUID, name: str) -> "Companion":
        return Companion(id=uuid4(), user_id=user_id, name=name, created_at=datetime.utcnow())
