from pydantic import BaseModel


class ProfileStepRequest(BaseModel):
    step: str
    basic_info: dict | None = None
    life_context: dict | None = None
    positive_moments: dict | None = None
    struggles: dict | None = None
    key_events: list[dict] | None = None
    companion_preferences: dict | None = None


class ExtractFactsResponse(BaseModel):
    step_data: dict
    needs_confirmation: list[str]
    transcript: str
