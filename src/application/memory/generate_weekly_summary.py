from datetime import date, timedelta
from uuid import UUID

from src.application.memory.prompts import NO_ACTIVITY_WEEK, WEEKLY_SUMMARY_SYSTEM_PROMPT
from src.domain.memory.entity import MemoryEmbedding, SummarySourceType, WeeklySummary
from src.domain.memory.repository import (
    IDailySummaryRepository,
    IMemoryEmbeddingRepository,
    IWeeklySummaryRepository,
)
from src.infrastructure.ai.client import VsegptClient
from src.infrastructure.crypto.aes import CryptoService


class GenerateWeeklySummary:
    def __init__(
        self,
        daily_repo: IDailySummaryRepository,
        weekly_repo: IWeeklySummaryRepository,
        embedding_repo: IMemoryEmbeddingRepository,
        claude: VsegptClient,
        crypto: CryptoService,
    ) -> None:
        self._daily = daily_repo
        self._weekly = weekly_repo
        self._embeddings = embedding_repo
        self._claude = claude
        self._crypto = crypto

    async def execute(self, companion_id: UUID, week_start: date, raw_key: bytes) -> WeeklySummary:
        week_end = week_start + timedelta(days=6)
        daily_summaries = await self._daily.get_range(companion_id, week_start, week_end)

        if not daily_summaries:
            summary_text = NO_ACTIVITY_WEEK
        else:
            days_text = "\n\n".join(
                f"[{s.date}] {self._crypto.decrypt_field(s.summary, raw_key)}"
                for s in daily_summaries
            )
            summary_text = await self._claude.chat(
                system=WEEKLY_SUMMARY_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": days_text}],
                max_tokens=512,
            )

        encrypted_summary = self._crypto.encrypt_field(summary_text, raw_key)
        summary = WeeklySummary.create(companion_id, week_start, encrypted_summary)
        await self._weekly.save(summary)

        if daily_summaries:
            vector = await self._claude.embed(summary_text)
            embedding = MemoryEmbedding.create(
                companion_id=companion_id,
                source_type=SummarySourceType.WEEKLY,
                source_id=summary.id,
                embedding=vector,
                period_start=week_start,
                period_end=week_end,
            )
            await self._embeddings.save(embedding)

        return summary
