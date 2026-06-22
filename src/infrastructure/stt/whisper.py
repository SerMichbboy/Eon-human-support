from openai import AsyncOpenAI

from src.main.settings import Settings


class WhisperSTT:
    def __init__(self, settings: Settings) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.webm") -> str:
        import io
        response = await self._client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, io.BytesIO(audio_bytes)),
        )
        return response.text
