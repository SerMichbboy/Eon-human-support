from datetime import date, timedelta
from uuid import UUID

from src.domain.memory.entity import WeeklySummary
from src.domain.memory.repository import IDailySummaryRepository, IWeeklySummaryRepository
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService


class GenerateWeeklySummary:
    def __init__(
        self,
        daily_repo: IDailySummaryRepository,
        weekly_repo: IWeeklySummaryRepository,
        claude: ClaudeClient,
        crypto: CryptoService,
    ) -> None:
        self._daily = daily_repo
        self._weekly = weekly_repo
        self._claude = claude
        self._crypto = crypto

    async def execute(self, companion_id: UUID, week_start: date, raw_key: bytes) -> WeeklySummary:
        week_end = week_start + timedelta(days=6)
        daily_summaries = await self._daily.get_range(companion_id, week_start, week_end)

        if not daily_summaries:
            summary_text = "На этой неделе общения не было."
        else:
            days_text = "\n\n".join(
                f"[{s.date}] {self._crypto.decrypt_field(s.summary, raw_key)}"
                for s in daily_summaries
            )
            summary_text = await self._claude.chat(
                system=(
                    "Ты анализируешь недельные записи диалогов между пользователем и AI-компаньоном. "
                    "Напиши краткое резюме недели: общий эмоциональный фон, ключевые темы и события. "
                    "Максимум 7 предложений. Без оценок."
                ),
                messages=[{"role": "user", "content": days_text}],
                max_tokens=512,
            )

        encrypted_summary = self._crypto.encrypt_field(summary_text, raw_key)
        summary = WeeklySummary.create(companion_id, week_start, encrypted_summary)
        await self._weekly.save(summary)
        return summary
