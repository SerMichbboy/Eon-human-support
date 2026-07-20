from src.infrastructure.tts.vsegpt import VsegptTTS


class SynthesizeSpeech:
    def __init__(self, tts: VsegptTTS) -> None:
        self._tts = tts

    async def execute(self, text: str) -> bytes:
        return await self._tts.synthesize(text)
