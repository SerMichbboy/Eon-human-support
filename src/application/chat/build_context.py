from datetime import date, timedelta
from uuid import UUID

from src.application.chat.prompts import render_compact_system_prompt, render_system_prompt
from src.domain.memory.entity import Message, SummarySourceType
from src.domain.memory.repository import (
    IDailySummaryRepository,
    IMemoryEmbeddingRepository,
    IMessageRepository,
    IWeeklySummaryRepository,
)
from src.domain.profile.entity import UserProfile
from src.infrastructure.ai.client import VsegptClient
from src.infrastructure.crypto.aes import CryptoService
from src.main.settings import Settings

_ACTIVE_WINDOW_DAYS = 7
_MAX_RECENT_MESSAGES = 20
_MAX_RECENT_MESSAGES_TEST = 4
_DAILY_ARCHIVE_DAYS = 30
_WEEKLY_ARCHIVE_DAYS = 180


class BuildContext:
    def __init__(
        self,
        message_repo: IMessageRepository,
        daily_repo: IDailySummaryRepository,
        weekly_repo: IWeeklySummaryRepository,
        embedding_repo: IMemoryEmbeddingRepository,
        claude: VsegptClient,
        crypto: CryptoService,
        settings: Settings,
    ) -> None:
        self._messages = message_repo
        self._daily = daily_repo
        self._weekly = weekly_repo
        self._embeddings = embedding_repo
        self._claude = claude
        self._crypto = crypto
        self._test_mode = settings.mode.lower() == "test"

    async def build_system_prompt(self, profile: UserProfile, companion_name: str) -> str:
        name = profile.basic_info.preferred_name or "друг"
        forbidden = profile.companion_preferences.forbidden_topics
        style = profile.companion_preferences.communication_style.value

        if self._test_mode:
            facts = _format_profile_compact(profile)
            return render_compact_system_prompt(companion_name, name, style, facts, forbidden)

        profile_text = _format_profile(profile)
        return render_system_prompt(companion_name, name, style, forbidden, profile_text)

    async def get_recent_messages(
        self, companion_id: UUID
    ) -> list[dict]:
        since = date.today() - timedelta(days=_ACTIVE_WINDOW_DAYS)
        messages = await self._messages.get_by_companion_since(companion_id, since)
        limit = _MAX_RECENT_MESSAGES_TEST if self._test_mode else _MAX_RECENT_MESSAGES
        messages = messages[-limit:]
        return [{"role": m.role.value, "content": m.content} for m in messages]

    async def get_relevant_archive(
        self, companion_id: UUID, query_embedding: list[float], raw_key: bytes | None
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
                text = s.summary
                if raw_key:
                    try:
                        text = self._crypto.decrypt_field(text, raw_key)
                    except Exception:
                        continue
                parts.append(f"[{period}] {text}")

        if not parts:
            return ""
        return "\n\n## Из более раннего общения\n" + "\n".join(parts)

    async def get_relevant_archive_for_text(
        self, companion_id: UUID, text: str, raw_key: bytes | None
    ) -> str:
        """Embeds `text` and pulls semantically relevant archive — skipped in test
        mode to keep the minimal cost-optimized prompt from CLAUDE.md intact."""
        if self._test_mode:
            return ""
        query_embedding = await self._claude.embed(text)
        return await self.get_relevant_archive(companion_id, query_embedding, raw_key)


def _format_profile_compact(profile: UserProfile) -> str:
    """One short clause of the highest-signal facts — occupation and the single
    most emotionally significant key event, if any. Used only in MODE=test; full
    detail (values, close people, dreams, top-5 key_events, ...) is prod-only."""
    bits = []
    if profile.life_context.occupation:
        bits.append(profile.life_context.occupation)
    if profile.key_events:
        top = max(profile.key_events, key=lambda e: e.emotional_weight)
        bits.append(top.description)
    return ", ".join(bits)


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
