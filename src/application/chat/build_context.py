import dataclasses
from datetime import date, timedelta
from uuid import UUID

from src.domain.memory.entity import Message, SummarySourceType
from src.domain.memory.repository import (
    IDailySummaryRepository,
    IMemoryEmbeddingRepository,
    IMessageRepository,
    IWeeklySummaryRepository,
)
from src.domain.profile.entity import UserProfile
from src.infrastructure.claude.client import ClaudeClient

_ACTIVE_WINDOW_DAYS = 7
_DAILY_ARCHIVE_DAYS = 30
_WEEKLY_ARCHIVE_DAYS = 180


class BuildContext:
    def __init__(
        self,
        message_repo: IMessageRepository,
        daily_repo: IDailySummaryRepository,
        weekly_repo: IWeeklySummaryRepository,
        embedding_repo: IMemoryEmbeddingRepository,
        claude: ClaudeClient,
    ) -> None:
        self._messages = message_repo
        self._daily = daily_repo
        self._weekly = weekly_repo
        self._embeddings = embedding_repo
        self._claude = claude

    async def build_system_prompt(self, profile: UserProfile) -> str:
        name = profile.basic_info.preferred_name or "друг"
        tone = profile.companion_preferences.tone.value
        directiveness = profile.companion_preferences.directiveness.value
        forbidden = profile.companion_preferences.forbidden_topics

        profile_text = _format_profile(profile)

        prompt = (
            f"Ты — Eon, персональный AI-компаньон для {name}. "
            f"Ты поддерживаешь, слушаешь и помогаешь справляться с трудными моментами. "
            f"Ты никогда не осуждаешь, не устаёшь и всегда рядом.\n\n"
            f"Тон общения: {tone}. Стиль: {directiveness}.\n"
        )

        if forbidden:
            prompt += f"Темы, которые не стоит затрагивать: {', '.join(forbidden)}.\n"

        prompt += f"\n## Что ты знаешь о {name}\n{profile_text}"
        return prompt

    async def get_recent_messages(
        self, companion_id: UUID
    ) -> list[dict]:
        since = date.today() - timedelta(days=_ACTIVE_WINDOW_DAYS)
        messages = await self._messages.get_by_companion_since(companion_id, since)
        return [{"role": m.role.value, "content": m.content} for m in messages]

    async def get_relevant_archive(
        self, companion_id: UUID, query_embedding: list[float]
    ) -> str:
        """Find relevant older summaries via semantic search."""
        embeddings = await self._embeddings.search(companion_id, query_embedding, limit=3)
        if not embeddings:
            return ""

        parts = []
        for emb in embeddings:
            if emb.source_type == SummarySourceType.DAILY:
                summaries = await self._daily.get_range(
                    companion_id, emb.period_start, emb.period_end
                )
            else:
                summaries = await self._weekly.get_range(
                    companion_id, emb.period_start, emb.period_end
                )

            for s in summaries:
                period = getattr(s, "date", None) or getattr(s, "week_start", None)
                parts.append(f"[{period}] {s.summary}")

        if not parts:
            return ""
        return "\n\n## Из более раннего общения\n" + "\n".join(parts)


def _format_profile(profile: UserProfile) -> str:
    lines = []
    bi = profile.basic_info
    if bi.age:
        lines.append(f"Возраст: {bi.age}")
    if bi.location:
        lines.append(f"Место: {bi.location}")

    lc = profile.life_context
    if lc.occupation:
        lines.append(f"Занятие: {lc.occupation}")
    if lc.family_status:
        lines.append(f"Семья: {lc.family_status}")
    if lc.close_people:
        lines.append(f"Близкие: {', '.join(lc.close_people)}")
    if lc.values:
        lines.append(f"Ценности: {', '.join(lc.values)}")

    pm = profile.positive_moments
    if pm.sources_of_energy:
        lines.append(f"Что даёт силы: {', '.join(pm.sources_of_energy)}")
    if pm.dreams:
        lines.append(f"Мечты: {', '.join(pm.dreams)}")

    st = profile.struggles
    if st.anxiety_topics:
        lines.append(f"Тревожные темы: {', '.join(st.anxiety_topics)}")
    if st.coping_mechanisms:
        lines.append(f"Как справляется: {', '.join(st.coping_mechanisms)}")

    if profile.key_events:
        lines.append("Значимые события:")
        for ev in sorted(profile.key_events, key=lambda e: e.emotional_weight, reverse=True)[:5]:
            lines.append(f"  — {ev.description} ({ev.type.value})")

    return "\n".join(lines) if lines else "Пока ничего не известно."
