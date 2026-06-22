from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class SummarySourceType(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"


@dataclass
class Message:
    id: UUID
    companion_id: UUID
    role: MessageRole
    content: str
    audio_url: str | None
    created_at: datetime

    @staticmethod
    def create(
        companion_id: UUID,
        role: MessageRole,
        content: str,
        audio_url: str | None = None,
    ) -> "Message":
        return Message(
            id=uuid4(),
            companion_id=companion_id,
            role=role,
            content=content,
            audio_url=audio_url,
            created_at=datetime.utcnow(),
        )


@dataclass
class DailySummary:
    id: UUID
    companion_id: UUID
    date: date
    summary: str

    @staticmethod
    def create(companion_id: UUID, day: date, summary: str) -> "DailySummary":
        return DailySummary(id=uuid4(), companion_id=companion_id, date=day, summary=summary)


@dataclass
class WeeklySummary:
    id: UUID
    companion_id: UUID
    week_start: date
    summary: str

    @staticmethod
    def create(companion_id: UUID, week_start: date, summary: str) -> "WeeklySummary":
        return WeeklySummary(
            id=uuid4(), companion_id=companion_id, week_start=week_start, summary=summary
        )


@dataclass
class MemoryEmbedding:
    id: UUID
    companion_id: UUID
    source_type: SummarySourceType
    source_id: UUID
    embedding: list[float]
    period_start: date
    period_end: date

    @staticmethod
    def create(
        companion_id: UUID,
        source_type: SummarySourceType,
        source_id: UUID,
        embedding: list[float],
        period_start: date,
        period_end: date,
    ) -> "MemoryEmbedding":
        return MemoryEmbedding(
            id=uuid4(),
            companion_id=companion_id,
            source_type=source_type,
            source_id=source_id,
            embedding=embedding,
            period_start=period_start,
            period_end=period_end,
        )
