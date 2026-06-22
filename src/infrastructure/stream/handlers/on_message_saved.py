from dataclasses import dataclass
from datetime import date
from uuid import UUID

from faststream.redis import RedisBroker

from src.infrastructure.tasks.broker import task_broker
from src.infrastructure.tasks.daily_summary import generate_daily_summary_task


@dataclass
class MessageSavedEvent:
    companion_id: str
    user_id: str
    day: str  # ISO format: "2026-06-22"


def register_handlers(broker: RedisBroker) -> None:
    @broker.subscriber("message_saved")
    async def handle_message_saved(event: MessageSavedEvent) -> None:
        await generate_daily_summary_task.kiq(
            companion_id=event.companion_id,
            user_id=event.user_id,
            day=event.day,
        )
