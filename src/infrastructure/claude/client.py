import json
import re

from openai import AsyncOpenAI

from src.main.settings import Settings

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

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
