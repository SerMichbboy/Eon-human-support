import dataclasses
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.profile.entity import (
    BasicInfo,
    CompanionPreferences,
    CompanionTone,
    CompanionDirectiveness,
    KeyEvent,
    KeyEventType,
    LifeContext,
    PositiveMoments,
    Struggles,
    UserProfile,
)
from src.domain.profile.repository import IUserProfileRepository
from src.infrastructure.db.models import UserProfileModel


class UserProfileRepository(IUserProfileRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user_id(self, user_id: UUID) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfileModel).where(UserProfileModel.user_id == user_id)
        )
        model = result.scalar_one_or_none()
        return _to_entity(model) if model else None

    async def save(self, profile: UserProfile) -> None:
        model = await self._session.get(UserProfileModel, profile.id)
        if model is None:
            model = UserProfileModel()
            self._session.add(model)
        model.id = profile.id
        model.user_id = profile.user_id
        model.basic_info = dataclasses.asdict(profile.basic_info)
        model.life_context = dataclasses.asdict(profile.life_context)
        model.positive_moments = dataclasses.asdict(profile.positive_moments)
        model.struggles = dataclasses.asdict(profile.struggles)
        model.key_events = [dataclasses.asdict(e) for e in profile.key_events]
        model.companion_preferences = dataclasses.asdict(profile.companion_preferences)
        model.updated_at = profile.updated_at
        await self._session.flush()


def _to_entity(m: UserProfileModel) -> UserProfile:
    prefs = m.companion_preferences or {}
    return UserProfile(
        id=m.id,
        user_id=m.user_id,
        basic_info=BasicInfo(**m.basic_info) if m.basic_info else BasicInfo(),
        life_context=LifeContext(**m.life_context) if m.life_context else LifeContext(),
        positive_moments=PositiveMoments(**m.positive_moments) if m.positive_moments else PositiveMoments(),
        struggles=Struggles(**m.struggles) if m.struggles else Struggles(),
        key_events=[
            KeyEvent(
                description=e["description"],
                emotional_weight=e["emotional_weight"],
                approximate_date=e.get("approximate_date"),
                type=KeyEventType(e["type"]),
            )
            for e in (m.key_events or [])
        ],
        companion_preferences=CompanionPreferences(
            tone=CompanionTone(prefs.get("tone", "warm")),
            directiveness=CompanionDirectiveness(prefs.get("directiveness", "listener")),
            forbidden_topics=prefs.get("forbidden_topics", []),
        ),
        updated_at=m.updated_at,
    )
