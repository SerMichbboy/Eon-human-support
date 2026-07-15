from abc import ABC, abstractmethod
from datetime import date
from uuid import UUID

from src.domain.memory.entity import DailySummary, Message, MemoryEmbedding, WeeklySummary


class IMessageRepository(ABC):
    @abstractmethod
    async def save(self, message: Message) -> None: ...

    @abstractmethod
    async def get_by_companion_since(
        self, companion_id: UUID, since: date
    ) -> list[Message]: ...

    @abstractmethod
    async def get_recent(
        self, companion_id: UUID, limit: int = 30, before_id: UUID | None = None
    ) -> list[Message]: ...


class IDailySummaryRepository(ABC):
    @abstractmethod
    async def save(self, summary: DailySummary) -> None: ...

    @abstractmethod
    async def get_by_companion_and_date(
        self, companion_id: UUID, day: date
    ) -> DailySummary | None: ...

    @abstractmethod
    async def get_range(
        self, companion_id: UUID, date_from: date, date_to: date
    ) -> list[DailySummary]: ...

    @abstractmethod
    async def get_companion_ids_needing_summary(self, day: date) -> list[UUID]:
        """Companions with messages on `day` but no daily summary for it yet."""
        ...


class IWeeklySummaryRepository(ABC):
    @abstractmethod
    async def save(self, summary: WeeklySummary) -> None: ...

    @abstractmethod
    async def get_range(
        self, companion_id: UUID, date_from: date, date_to: date
    ) -> list[WeeklySummary]: ...

    @abstractmethod
    async def get_companion_ids_needing_summary(
        self, week_start: date, week_end: date
    ) -> list[UUID]:
        """Companions with daily summaries in [week_start, week_end] but no weekly summary yet."""
        ...


class IMemoryEmbeddingRepository(ABC):
    @abstractmethod
    async def save(self, embedding: MemoryEmbedding) -> None: ...

    @abstractmethod
    async def search(
        self, companion_id: UUID, query_embedding: list[float], limit: int = 5
    ) -> list[MemoryEmbedding]: ...
