from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

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


@dataclass
class ProfileStepData:
    """Extracted facts from one onboarding step, ready to merge into profile."""
    basic_info: dict | None = None
    life_context: dict | None = None
    positive_moments: dict | None = None
    struggles: dict | None = None
    key_events: list[dict] | None = None
    companion_preferences: dict | None = None


class SaveProfileStep:
    def __init__(self, profile_repo: IUserProfileRepository) -> None:
        self._profiles = profile_repo

    async def execute(self, user_id: UUID, data: ProfileStepData) -> None:
        profile = await self._profiles.get_by_user_id(user_id)
        if not profile:
            profile = UserProfile.create(user_id)

        if data.basic_info:
            profile.basic_info = _merge_basic_info(profile.basic_info, data.basic_info)

        if data.life_context:
            profile.life_context = _merge_life_context(profile.life_context, data.life_context)

        if data.positive_moments:
            profile.positive_moments = _merge_positive(
                profile.positive_moments, data.positive_moments
            )

        if data.struggles:
            profile.struggles = _merge_struggles(profile.struggles, data.struggles)

        if data.key_events:
            for ev in data.key_events:
                profile.key_events.append(
                    KeyEvent(
                        description=ev["description"],
                        emotional_weight=float(ev.get("emotional_weight", 0.5)),
                        approximate_date=ev.get("approximate_date"),
                        type=KeyEventType(ev.get("type", "change")),
                    )
                )

        if data.companion_preferences:
            prefs = data.companion_preferences
            if "tone" in prefs:
                profile.companion_preferences.tone = CompanionTone(prefs["tone"])
            if "directiveness" in prefs:
                profile.companion_preferences.directiveness = CompanionDirectiveness(
                    prefs["directiveness"]
                )
            if "forbidden_topics" in prefs:
                profile.companion_preferences.forbidden_topics.extend(
                    prefs["forbidden_topics"]
                )

        profile.updated_at = datetime.utcnow()
        await self._profiles.save(profile)


def _merge_basic_info(existing: BasicInfo, patch: dict) -> BasicInfo:
    return BasicInfo(
        preferred_name=patch.get("preferred_name") or existing.preferred_name,
        age=patch.get("age") or existing.age,
        location=patch.get("location") or existing.location,
    )


def _merge_life_context(existing: LifeContext, patch: dict) -> LifeContext:
    return LifeContext(
        occupation=patch.get("occupation") or existing.occupation,
        family_status=patch.get("family_status") or existing.family_status,
        close_people=list({*existing.close_people, *patch.get("close_people", [])}),
        values=list({*existing.values, *patch.get("values", [])}),
    )


def _merge_positive(existing: PositiveMoments, patch: dict) -> PositiveMoments:
    return PositiveMoments(
        joyful_memories=list({*existing.joyful_memories, *patch.get("joyful_memories", [])}),
        sources_of_energy=list(
            {*existing.sources_of_energy, *patch.get("sources_of_energy", [])}
        ),
        dreams=list({*existing.dreams, *patch.get("dreams", [])}),
    )


def _merge_struggles(existing: Struggles, patch: dict) -> Struggles:
    return Struggles(
        anxiety_topics=list({*existing.anxiety_topics, *patch.get("anxiety_topics", [])}),
        difficult_periods=list(
            {*existing.difficult_periods, *patch.get("difficult_periods", [])}
        ),
        coping_mechanisms=list(
            {*existing.coping_mechanisms, *patch.get("coping_mechanisms", [])}
        ),
    )
