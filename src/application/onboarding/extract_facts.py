from src.application.onboarding.save_profile_step import ProfileStepData
from src.infrastructure.ai.client import VsegptClient
from src.infrastructure.stt.whisper import WhisperSTT


class ExtractFactsFromText:
    """Runs one free-text onboarding answer through the LLM to split it across
    the right profile fields (e.g. "работаю программистом, живу с женой" ->
    occupation + family_status separately), instead of the caller having to
    guess which single field a broad answer belongs under."""

    def __init__(self, claude: VsegptClient) -> None:
        self._claude = claude

    async def execute(self, text: str, step: str) -> tuple[ProfileStepData, list[str]]:
        """
        Returns extracted ProfileStepData and a list of fields needing confirmation.
        """
        raw = await self._claude.extract_facts(text, step)

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


class ExtractFactsFromVoice:
    def __init__(self, stt: WhisperSTT, claude: VsegptClient) -> None:
        self._stt = stt
        self._text_extractor = ExtractFactsFromText(claude)

    async def execute(self, audio_bytes: bytes, step: str) -> tuple[ProfileStepData, list[str]]:
        transcript = await self._stt.transcribe(audio_bytes)
        return await self._text_extractor.execute(transcript, step)
