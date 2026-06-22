from src.infrastructure.tts.elevenlabs import ElevenLabsTTS


class SynthesizeSpeech:
    def __init__(self, tts: ElevenLabsTTS) -> None:
        self._tts = tts

    async def execute(self, text: str) -> bytes:
        return await self._tts.synthesize(text)
