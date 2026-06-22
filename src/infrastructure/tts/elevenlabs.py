import httpx

from src.main.settings import Settings


class ElevenLabsTTS:
    _BASE_URL = "https://api.elevenlabs.io/v1"

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.elevenlabs_api_key
        self._voice_id = settings.elevenlabs_voice_id

    async def synthesize(self, text: str) -> bytes:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._BASE_URL}/text-to-speech/{self._voice_id}",
                headers={"xi-api-key": self._api_key},
                json={"text": text, "model_id": "eleven_multilingual_v2"},
            )
            response.raise_for_status()
            return response.content
