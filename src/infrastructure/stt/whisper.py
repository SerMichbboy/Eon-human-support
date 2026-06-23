from openai import AsyncOpenAI

from src.main.settings import Settings


class WhisperSTT:
    def __init__(self, settings: Settings) -> None:
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.vsegpt_base_url or None,
        )

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        import io
        response = await self._client.audio.transcriptions.create(
            model="stt-openai/gpt-4o-mini-transcribe",
            file=(filename, io.BytesIO(audio_bytes)),
            language="ru",
        )
        return response.text
