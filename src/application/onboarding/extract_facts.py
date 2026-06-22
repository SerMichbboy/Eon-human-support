from src.application.onboarding.save_profile_step import ProfileStepData
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.stt.whisper import WhisperSTT


class ExtractFactsFromVoice:
    def __init__(self, stt: WhisperSTT, claude: ClaudeClient) -> None:
        self._stt = stt
        self._claude = claude

    async def execute(self, audio_bytes: bytes, step: str) -> tuple[ProfileStepData, list[str]]:
        """
        Returns extracted ProfileStepData and a list of fields needing confirmation.
        """
        transcript = await self._stt.transcribe(audio_bytes)
        raw = await self._claude.extract_facts(transcript, step)

        needs_confirmation: list[str] = []
        confirmed: dict = {}

        for category, value in raw.items():
            if category == "needs_confirmation":
                continue
            if isinstance(value, dict) and value.get("needs_confirmation"):
                needs_confirmation.append(category)
            else:
                confirmed[category] = value

        step_data = ProfileStepData(
            basic_info=confirmed.get("basic_info"),
            life_context=confirmed.get("life_context"),
            positive_moments=confirmed.get("positive_moments"),
            struggles=confirmed.get("struggles"),
            key_events=confirmed.get("key_events"),
            companion_preferences=confirmed.get("companion_preferences"),
        )
        return step_data, needs_confirmation
