from datetime import date
from uuid import UUID

from src.domain.memory.entity import DailySummary, MemoryEmbedding, Message, MessageRole, SummarySourceType
from src.domain.memory.repository import (
    IDailySummaryRepository,
    IMemoryEmbeddingRepository,
    IMessageRepository,
)
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService


class GenerateDailySummary:
    def __init__(
        self,
        message_repo: IMessageRepository,
        daily_repo: IDailySummaryRepository,
        embedding_repo: IMemoryEmbeddingRepository,
        claude: ClaudeClient,
        crypto: CryptoService,
    ) -> None:
        self._messages = message_repo
        self._daily = daily_repo
        self._embeddings = embedding_repo
        self._claude = claude
        self._crypto = crypto

    async def execute(self, companion_id: UUID, day: date, raw_key: bytes) -> DailySummary:
        messages = await self._messages.get_by_companion_since(companion_id, day)
        day_messages = [m for m in messages if m.created_at.date() == day]

        if not day_messages:
            summary_text = "В этот день общения не было."
        else:
            dialogue = _format_dialogue(day_messages, raw_key, self._crypto)
            summary_text = await self._claude.chat(
                system=(
                    "Ты анализируешь диалог между пользователем и AI-компаньоном за один день. "
                    "Напиши резюме дня, но сохрани конкретику — имена, цифры, точные события, "
                    "признания, детали, — а не только общую тему и эмоциональный фон. Смысл в том, "
                    "чтобы Эон мог через месяцы напомнить об этом дне и удивить, что помнит именно "
                    "детали, а не общие слова. Не пиши «говорили о работе» — пиши, что именно "
                    "случилось на работе. Максимум 5 предложений. Без оценок и советов."
                ),
                messages=[{"role": "user", "content": dialogue}],
                max_tokens=512,
            )

        encrypted_summary = self._crypto.encrypt_field(summary_text, raw_key)
        summary = DailySummary.create(companion_id, day, encrypted_summary)
        await self._daily.save(summary)

        if day_messages:
            vector = await self._claude.embed(summary_text)
            embedding = MemoryEmbedding.create(
                companion_id=companion_id,
                source_type=SummarySourceType.DAILY,
                source_id=summary.id,
                embedding=vector,
                period_start=day,
                period_end=day,
            )
            await self._embeddings.save(embedding)

        return summary


def _format_dialogue(messages: list[Message], raw_key: bytes, crypto: CryptoService) -> str:
    lines = []
    for m in messages:
        role = "Пользователь" if m.role == MessageRole.USER else "Eon"
        try:
            content = crypto.decrypt_field(m.content, raw_key)
        except Exception:
            content = m.content
        lines.append(f"{role}: {content}")
    return "\n".join(lines)
