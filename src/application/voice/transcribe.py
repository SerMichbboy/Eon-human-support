from src.infrastructure.stt.whisper import WhisperSTT


class TranscribeAudio:
    def __init__(self, stt: WhisperSTT) -> None:
        self._stt = stt

    async def execute(self, audio_bytes: bytes) -> str:
        return await self._stt.transcribe(audio_bytes)
