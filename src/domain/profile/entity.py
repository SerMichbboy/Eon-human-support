from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4


class CompanionTone(StrEnum):
    WARM = "warm"
    NEUTRAL = "neutral"
    DIRECT = "direct"


class CompanionDirectiveness(StrEnum):
    LISTENER = "listener"
    ADVISOR = "advisor"


class CommunicationStyle(StrEnum):
    LISTENER = "listener"   # слушает, не советует
    FRIEND = "friend"       # тёплый, советует когда просят
    MENTOR = "mentor"       # прямой, конкретный, ориентирован на рост
    MIRROR = "mirror"       # задаёт вопросы, помогает прийти к ответу самому
    DEBATER = "debater"     # держит позицию, любит подискутировать


class KeyEventType(StrEnum):
    JOY = "joy"
    LOSS = "loss"
    CHANGE = "change"


@dataclass
class KeyEvent:
    description: str
    emotional_weight: float          # 0.0 – 1.0
    approximate_date: str | None     # "2020", "early 2023", etc.
    type: KeyEventType


@dataclass
class BasicInfo:
    preferred_name: str | None = None
    age: int | None = None
    location: str | None = None


@dataclass
class LifeContext:
    occupation: str | None = None
    family_status: str | None = None
    close_people: list[str] = field(default_factory=list)
    values: list[str] = field(default_factory=list)


@dataclass
class PositiveMoments:
    joyful_memories: list[str] = field(default_factory=list)
    sources_of_energy: list[str] = field(default_factory=list)
    dreams: list[str] = field(default_factory=list)


@dataclass
class Struggles:
    anxiety_topics: list[str] = field(default_factory=list)
    difficult_periods: list[str] = field(default_factory=list)
    coping_mechanisms: list[str] = field(default_factory=list)


@dataclass
class CompanionPreferences:
    tone: CompanionTone = CompanionTone.WARM
    directiveness: CompanionDirectiveness = CompanionDirectiveness.LISTENER
    forbidden_topics: list[str] = field(default_factory=list)
    communication_style: CommunicationStyle = CommunicationStyle.FRIEND


@dataclass
class UserProfile:
    id: UUID
    user_id: UUID
    basic_info: BasicInfo
    life_context: LifeContext
    positive_moments: PositiveMoments
    struggles: Struggles
    key_events: list[KeyEvent]
    companion_preferences: CompanionPreferences
    updated_at: datetime

    @staticmethod
    def create(user_id: UUID) -> "UserProfile":
        return UserProfile(
            id=uuid4(),
            user_id=user_id,
            basic_info=BasicInfo(),
            life_context=LifeContext(),
            positive_moments=PositiveMoments(),
            struggles=Struggles(),
            key_events=[],
            companion_preferences=CompanionPreferences(),
            updated_at=datetime.utcnow(),
        )
