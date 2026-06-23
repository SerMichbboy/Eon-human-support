from pydantic import BaseModel


class BasicInfoSchema(BaseModel):
    preferred_name: str | None = None
    age: int | None = None
    location: str | None = None


class LifeContextSchema(BaseModel):
    occupation: str | None = None
    family_status: str | None = None
    close_people: list[str] = []
    values: list[str] = []


class PositiveMomentsSchema(BaseModel):
    joyful_memories: list[str] = []
    sources_of_energy: list[str] = []
    dreams: list[str] = []


class StrugglesSchema(BaseModel):
    anxiety_topics: list[str] = []
    difficult_periods: list[str] = []
    coping_mechanisms: list[str] = []


class KeyEventSchema(BaseModel):
    description: str
    emotional_weight: float
    approximate_date: str | None = None
    type: str


class CompanionPreferencesSchema(BaseModel):
    tone: str = "warm"
    directiveness: str = "listener"
    forbidden_topics: list[str] = []
    communication_style: str = "friend"


class ProfileResponse(BaseModel):
    basic_info: BasicInfoSchema
    life_context: LifeContextSchema
    positive_moments: PositiveMomentsSchema
    struggles: StrugglesSchema
    key_events: list[KeyEventSchema]
    companion_preferences: CompanionPreferencesSchema
