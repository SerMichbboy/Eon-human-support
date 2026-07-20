import hashlib
import json
import re

from openai import AsyncOpenAI

from src.main.settings import Settings

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_EMBEDDING_MODEL = "emb-openai/text-embedding-3-small"
_EMBEDDING_DIM = 1536  # must match Vector(1536) in MemoryEmbeddingModel

# One schema per onboarding step, using the exact field names the profile merge logic expects
# (src/application/onboarding/save_profile_step.py). Keeping this step-scoped instead of asking
# the model to freely map facts across all categories avoids ambiguous guesses like "location"
# under the wrong category, or invented field names (e.g. "name" instead of "preferred_name")
# that silently fail to merge.
_STEP_SCHEMAS: dict[str, str] = {
    "intro": (
        '{"basic_info": {"preferred_name": string|null, "age": integer|null, "location": string|null}}'
    ),
    "life_context": (
        '{"life_context": {"occupation": string|null, "family_status": string|null, '
        '"close_people": string[], "values": string[]}}'
    ),
    "positive_moments": (
        '{"positive_moments": {"joyful_memories": string[], "sources_of_energy": string[], "dreams": string[]}}'
    ),
    "struggles": (
        '{"struggles": {"coping_mechanisms": string[], "difficult_periods": string[], "anxiety_topics": string[]}}'
    ),
    "companion_preferences": (
        '{"companion_preferences": {"tone": "warm"|"neutral"|"direct", '
        '"directiveness": "listener"|"advisor", '
        '"communication_style": "listener"|"friend"|"mentor"|"mirror"|"debater"}}'
    ),
    # Nightly re-read of one day's summary (src/infrastructure/tasks/update_profile.py).
    # key_events is what powers "Eon remembers this months later" — surfaced on every
    # single message via BuildContext._format_profile, not just when semantic search
    # happens to hit it. Deliberately conservative: most days should yield nothing, or
    # key_events fills up with routine chit-chat and drowns out what's actually memorable.
    "daily_review": (
        "Only include a key_events entry for something significant enough that a close "
        "friend would still remember it months or years later — a real loss, an "
        "achievement, a relationship change, a big life shift. An ordinary day should "
        "produce an empty key_events list. Do not manufacture significance.\n"
        '{"key_events": [{"description": string, "emotional_weight": number between 0 and 1, '
        '"approximate_date": string|null, "type": "joy"|"loss"|"change"}], '
        '"life_context": {"occupation": string|null, "family_status": string|null, '
        '"close_people": string[], "values": string[]}|null}'
    ),
}

_STUB_RESPONSES = [
    "Я здесь. Слушаю тебя внимательно.",
    "Расскажи мне больше — я никуда не тороплюсь.",
    "Понимаю. Это важно.",
]
_stub_index = 0


class ClaudeClient:
    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.anthropic_api_key
        self._stub = self._api_key in ("placeholder", "", None)
        if not self._stub:
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=settings.vsegpt_base_url or None,
            )

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 1024) -> str:
        if self._stub:
            global _stub_index
            reply = _STUB_RESPONSES[_stub_index % len(_STUB_RESPONSES)]
            _stub_index += 1
            return reply
        response = await self._client.chat.completions.create(
            model="openai/gpt-4.1-mini",
            messages=[{"role": "system", "content": system}] + messages,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def embed(self, text: str) -> list[float]:
        if self._stub:
            # Deterministic pseudo-embedding so semantic search stays exercisable
            # end-to-end (ordering by cosine distance still "works") without a live key.
            digest = hashlib.sha256(text.encode()).digest()
            repeated = (digest * ((_EMBEDDING_DIM // len(digest)) + 1))[:_EMBEDDING_DIM]
            return [(b - 128) / 128 for b in repeated]
        response = await self._client.embeddings.create(model=_EMBEDDING_MODEL, input=text)
        return response.data[0].embedding

    async def extract_facts(self, transcript: str, step: str) -> dict:
        if self._stub:
            return {}
        schema = _STEP_SCHEMAS.get(step)
        if schema is None:
            return {}
        prompt = (
            f'The user (speaking Russian) said: "{transcript}"\n\n'
            f"Extract only facts explicitly stated above into exactly this JSON shape:\n{schema}\n\n"
            "Use exactly these field names. If a field wasn't mentioned, use null (or an empty "
            "array for list fields) — never invent, guess, or infer values that weren't said. "
            "Return only the JSON object, no explanation."
        )
        try:
            response = await self._client.chat.completions.create(
                model="openai/gpt-4.1-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1024,
                response_format={"type": "json_object"},
            )
        except Exception:
            # Provider hiccup (e.g. upstream 500) — better to extract nothing
            # than to crash the whole onboarding voice-step request.
            return {}
        content = response.choices[0].message.content or ""
        content = _JSON_FENCE_RE.sub("", content.strip()).strip()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return {}

    async def extract_reminder(self, text: str, client_time_iso: str) -> dict | None:
        """`client_time_iso` is the user's current wall-clock time as an
        offset-aware ISO string (e.g. "2026-07-19T18:30:00+03:00") — computed
        from the client-supplied IANA timezone name, not assumed to be UTC.
        The model resolves relative expressions ("через 2 часа", "в 18:00",
        "завтра утром") against it and is asked to echo back the same offset,
        which `SendMessage` then parses directly with `datetime.fromisoformat`."""
        if self._stub:
            return None
        prompt = (
            f"Текущее время пользователя: {client_time_iso}\n\n"
            f'Сообщение пользователя: "{text}"\n\n'
            "Просит ли пользователь напомнить о чём-то в конкретное время (сегодня, завтра, "
            'через X минут/часов, в HH:MM и т.п.)? Если да, верни JSON {"message": string — '
            "короткая формулировка того, о чём напомнить, от первого лица единственного числа "
            '(как будто сам пользователь себе напоминает), "due_at": string — точные дата и '
            "время в формате ISO 8601 с тем же смещением часового пояса, что в текущем времени "
            "выше}. Если явного времени не указано или это не просьба напомнить — верни {}. "
            "Возвращай только JSON, без пояснений."
        )
        try:
            response = await self._client.chat.completions.create(
                model="openai/gpt-4.1-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                response_format={"type": "json_object"},
            )
        except Exception:
            return None
        content = response.choices[0].message.content or ""
        content = _JSON_FENCE_RE.sub("", content.strip()).strip()
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return None
        if not data.get("due_at") or not data.get("message"):
            return None
        return data
