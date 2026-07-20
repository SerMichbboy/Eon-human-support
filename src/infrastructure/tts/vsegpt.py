from openai import AsyncOpenAI

from src.main.settings import Settings


class VsegptTTS:
    """Same vsegpt.ru proxy already used for chat (VsegptClient) and STT
    (WhisperSTT) — one provider, one key, already proven to work from Russia,
    instead of a separate ElevenLabs account. `tts-openai/tts-1` is the
    cheapest voice tier (3.2 per 1000 chars); swap to `tts-openai/gpt-4o-mini-tts`
    for higher quality when it matters more than cost.
    """

    def __init__(self, settings: Settings) -> None:
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.vsegpt_base_url or None,
        )

    async def synthesize(self, text: str) -> bytes:
        response = await self._client.audio.speech.create(
            model="tts-openai/tts-1",
            voice="alloy",
            input=text,
            response_format="mp3",
        )
        return await response.aread()
