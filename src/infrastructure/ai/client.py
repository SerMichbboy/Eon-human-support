import hashlib
import json
import re

from openai import AsyncOpenAI

from src.infrastructure.ai.prompts import (
    EXTRACTION_SCHEMAS,
    STUB_CHAT_RESPONSES,
    build_extract_facts_prompt,
    build_extract_reminder_prompt,
)
from src.main.settings import Settings

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_EMBEDDING_MODEL = "emb-openai/text-embedding-3-small"
_EMBEDDING_DIM = 1536  # must match Vector(1536) in MemoryEmbeddingModel

_stub_index = 0


class VsegptClient:
    """Thin wrapper around vsegpt.ru's OpenAI-compatible proxy — one client for
    chat completions, embeddings, and JSON-mode extraction. Named after the
    provider (matches VsegptTTS/WhisperSTT's naming), not a specific model
    family: the model string is picked per call, currently openai/gpt-4.1-mini
    everywhere (see CLAUDE.md for the upgrade path to a Claude model)."""

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.openai_api_key
        self._stub = self._api_key in ("placeholder", "", None)
        if not self._stub:
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=settings.vsegpt_base_url or None,
            )

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 1024) -> str:
        if self._stub:
            global _stub_index
            reply = STUB_CHAT_RESPONSES[_stub_index % len(STUB_CHAT_RESPONSES)]
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
        schema = EXTRACTION_SCHEMAS.get(step)
        if schema is None:
            return {}
        prompt = build_extract_facts_prompt(transcript, schema)
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
        which `SendMessage` then parses directly with `datetime.fromisoformat`.

        Vague-but-not-meaningless expressions ("попозже", "на следующей
        неделе") get an explicit fallback convention below rather than being
        treated the same as genuinely time-free requests.

        Returns one of three shapes, which `SendMessage._maybe_schedule_reminder`
        reacts to differently:
        - `{"message": ..., "due_at": ...}` — resolved, schedule it.
        - `{"unclear": True}` — *is* a reminder request (the keyword gate was
          right), but no time could be pinned down even with the fallback
          conventions — Eon should ask what time, not silently do nothing.
        - `{}` — not actually a reminder request at all (a false positive from
          the keyword gate, e.g. "не забудь, что обещал" with no time
          attached) — nothing to react to, the normal reply proceeds untouched.
        Conflating the last two into one falsy value would make Eon ask "во
        сколько напомнить?" in reply to messages that were never asking for a
        time-based reminder in the first place.
        """
        if self._stub:
            return None
        prompt = build_extract_reminder_prompt(text, client_time_iso)
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
        if data.get("unclear"):
            return {"unclear": True}
        if not data.get("due_at") or not data.get("message"):
            return None
        return data
