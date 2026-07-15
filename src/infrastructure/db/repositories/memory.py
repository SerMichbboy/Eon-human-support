from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.memory.entity import (
    DailySummary,
    MemoryEmbedding,
    Message,
    MessageRole,
    SummarySourceType,
    WeeklySummary,
)
from src.domain.memory.repository import (
    IDailySummaryRepository,
    IMemoryEmbeddingRepository,
    IMessageRepository,
    IWeeklySummaryRepository,
)
from src.infrastructure.db.models import (
    DailySummaryModel,
    MemoryEmbeddingModel,
    MessageModel,
    WeeklySummaryModel,
)


class MessageRepository(IMessageRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, message: Message) -> None:
        model = MessageModel(
            id=message.id,
            companion_id=message.companion_id,
            role=message.role.value,
            content=message.content,
            audio_url=message.audio_url,
            created_at=message.created_at,
        )
        self._session.add(model)
        await self._session.flush()

    async def get_recent(
        self, companion_id: UUID, limit: int = 30, before_id: UUID | None = None
    ) -> list[Message]:
        query = select(MessageModel).where(MessageModel.companion_id == companion_id)
        if before_id:
            subq = (
                select(MessageModel.created_at)
                .where(MessageModel.id == before_id)
                .scalar_subquery()
            )
            query = query.where(MessageModel.created_at < subq)
        query = query.order_by(MessageModel.created_at.desc()).limit(limit)
        result = await self._session.execute(query)
        return list(reversed([
            Message(
                id=m.id,
                companion_id=m.companion_id,
                role=MessageRole(m.role),
                content=m.content,
                audio_url=m.audio_url,
                created_at=m.created_at,
            )
            for m in result.scalars()
        ]))

    async def get_by_companion_since(self, companion_id: UUID, since: date) -> list[Message]:
        since_dt = datetime.combine(since, datetime.min.time())
        result = await self._session.execute(
            select(MessageModel)
            .where(
                MessageModel.companion_id == companion_id,
                MessageModel.created_at >= since_dt,
            )
            .order_by(MessageModel.created_at)
        )
        return [
            Message(
                id=m.id,
                companion_id=m.companion_id,
                role=MessageRole(m.role),
                content=m.content,
                audio_url=m.audio_url,
                created_at=m.created_at,
            )
            for m in result.scalars()
        ]


class DailySummaryRepository(IDailySummaryRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, summary: DailySummary) -> None:
        existing = await self.get_by_companion_and_date(summary.companion_id, summary.date)
        if existing:
            model = await self._session.get(DailySummaryModel, existing.id)
            model.summary = summary.summary
        else:
            self._session.add(
                DailySummaryModel(
                    id=summary.id,
                    companion_id=summary.companion_id,
                    date=summary.date,
                    summary=summary.summary,
                )
            )
        await self._session.flush()

    async def get_by_companion_and_date(
        self, companion_id: UUID, day: date
    ) -> DailySummary | None:
        result = await self._session.execute(
            select(DailySummaryModel).where(
                DailySummaryModel.companion_id == companion_id,
                DailySummaryModel.date == day,
            )
        )
        m = result.scalar_one_or_none()
        if not m:
            return None
        return DailySummary(id=m.id, companion_id=m.companion_id, date=m.date, summary=m.summary)

    async def get_range(
        self, companion_id: UUID, date_from: date, date_to: date
    ) -> list[DailySummary]:
        result = await self._session.execute(
            select(DailySummaryModel)
            .where(
                DailySummaryModel.companion_id == companion_id,
                DailySummaryModel.date >= date_from,
                DailySummaryModel.date <= date_to,
            )
            .order_by(DailySummaryModel.date)
        )
        return [
            DailySummary(id=m.id, companion_id=m.companion_id, date=m.date, summary=m.summary)
            for m in result.scalars()
        ]

    async def get_companion_ids_needing_summary(self, day: date) -> list[UUID]:
        day_start = datetime.combine(day, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        result = await self._session.execute(
            select(MessageModel.companion_id)
            .distinct()
            .outerjoin(
                DailySummaryModel,
                (DailySummaryModel.companion_id == MessageModel.companion_id)
                & (DailySummaryModel.date == day),
            )
            .where(
                MessageModel.created_at >= day_start,
                MessageModel.created_at < day_end,
                DailySummaryModel.id.is_(None),
            )
        )
        return list(result.scalars())


class WeeklySummaryRepository(IWeeklySummaryRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, summary: WeeklySummary) -> None:
        existing_result = await self._session.execute(
            select(WeeklySummaryModel).where(
                WeeklySummaryModel.companion_id == summary.companion_id,
                WeeklySummaryModel.week_start == summary.week_start,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.summary = summary.summary
        else:
            self._session.add(
                WeeklySummaryModel(
                    id=summary.id,
                    companion_id=summary.companion_id,
                    week_start=summary.week_start,
                    summary=summary.summary,
                )
            )
        await self._session.flush()

    async def get_range(
        self, companion_id: UUID, date_from: date, date_to: date
    ) -> list[WeeklySummary]:
        result = await self._session.execute(
            select(WeeklySummaryModel)
            .where(
                WeeklySummaryModel.companion_id == companion_id,
                WeeklySummaryModel.week_start >= date_from,
                WeeklySummaryModel.week_start <= date_to,
            )
            .order_by(WeeklySummaryModel.week_start)
        )
        return [
            WeeklySummary(
                id=m.id,
                companion_id=m.companion_id,
                week_start=m.week_start,
                summary=m.summary,
            )
            for m in result.scalars()
        ]

    async def get_companion_ids_needing_summary(
        self, week_start: date, week_end: date
    ) -> list[UUID]:
        result = await self._session.execute(
            select(DailySummaryModel.companion_id)
            .distinct()
            .outerjoin(
                WeeklySummaryModel,
                (WeeklySummaryModel.companion_id == DailySummaryModel.companion_id)
                & (WeeklySummaryModel.week_start == week_start),
            )
            .where(
                DailySummaryModel.date >= week_start,
                DailySummaryModel.date <= week_end,
                WeeklySummaryModel.id.is_(None),
            )
        )
        return list(result.scalars())


class MemoryEmbeddingRepository(IMemoryEmbeddingRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, embedding: MemoryEmbedding) -> None:
        self._session.add(
            MemoryEmbeddingModel(
                id=embedding.id,
                companion_id=embedding.companion_id,
                source_type=embedding.source_type.value,
                source_id=embedding.source_id,
                embedding=embedding.embedding,
                period_start=embedding.period_start,
                period_end=embedding.period_end,
            )
        )
        await self._session.flush()

    async def search(
        self, companion_id: UUID, query_embedding: list[float], limit: int = 5
    ) -> list[MemoryEmbedding]:
        result = await self._session.execute(
            select(MemoryEmbeddingModel)
            .where(MemoryEmbeddingModel.companion_id == companion_id)
            .order_by(MemoryEmbeddingModel.embedding.cosine_distance(query_embedding))
            .limit(limit)
        )
        return [
            MemoryEmbedding(
                id=m.id,
                companion_id=m.companion_id,
                source_type=SummarySourceType(m.source_type),
                source_id=m.source_id,
                embedding=list(m.embedding),
                period_start=m.period_start,
                period_end=m.period_end,
            )
            for m in result.scalars()
        ]
