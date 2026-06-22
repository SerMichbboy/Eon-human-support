import anthropic

from src.main.settings import Settings

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
            self._client = anthropic.AsyncAnthropic(api_key=self._api_key)

    async def chat(self, system: str, messages: list[dict], max_tokens: int = 1024) -> str:
        if self._stub:
            global _stub_index
            reply = _STUB_RESPONSES[_stub_index % len(_STUB_RESPONSES)]
            _stub_index += 1
            return reply
        response = await self._client.messages.create(
            model="claude-sonnet-4-6",
            system=system,
            messages=messages,
            max_tokens=max_tokens,
        )
        return response.content[0].text

    async def extract_facts(self, transcript: str, step: str) -> dict:
        if self._stub:
            return {}
        prompt = (
            f"Onboarding step: {step}\n\nUser said: {transcript}\n\n"
            "Extract structured facts from the user's speech relevant to the onboarding step. "
            "Return a JSON object with extracted facts mapped to profile categories: "
            "basic_info, life_context, positive_moments, struggles, key_events, companion_preferences. "
            "Return only JSON, no explanation."
        )
        response = await self._client.messages.create(
            model="claude-sonnet-4-6",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
        )
        import json
        return json.loads(response.content[0].text)
