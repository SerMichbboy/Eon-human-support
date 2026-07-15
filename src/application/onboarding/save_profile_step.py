from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from src.domain.profile.entity import (
    BasicInfo,
    CompanionPreferences,
    CompanionTone,
    CompanionDirectiveness,
    CommunicationStyle,
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
            existing_descriptions = {e.description for e in profile.key_events}
            for ev in data.key_events:
                # Guards against duplicate entries on task redelivery/retry — the
                # same day's summary re-analysed twice would otherwise append twice.
                if ev["description"] in existing_descriptions:
                    continue
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
            if "communication_style" in prefs:
                profile.companion_preferences.communication_style = CommunicationStyle(
                    prefs["communication_style"]
                )

        profile.updated_at = datetime.utcnow()
        await self._profiles.save(profile)


def _pick(patch: dict, key: str, fallback):
    """Use patch value if key is present and not None, else fallback."""
    return patch[key] if key in patch and patch[key] is not None else fallback


def _merge_basic_info(existing: BasicInfo, patch: dict) -> BasicInfo:
    return BasicInfo(
        preferred_name=_pick(patch, "preferred_name", existing.preferred_name),
        age=_pick(patch, "age", existing.age),
        location=_pick(patch, "location", existing.location),
    )


def _merge_life_context(existing: LifeContext, patch: dict) -> LifeContext:
    return LifeContext(
        occupation=_pick(patch, "occupation", existing.occupation),
        family_status=_pick(patch, "family_status", existing.family_status),
        close_people=_pick(patch, "close_people", existing.close_people),
        values=_pick(patch, "values", existing.values),
    )


def _merge_positive(existing: PositiveMoments, patch: dict) -> PositiveMoments:
    return PositiveMoments(
        joyful_memories=_pick(patch, "joyful_memories", existing.joyful_memories),
        sources_of_energy=_pick(patch, "sources_of_energy", existing.sources_of_energy),
        dreams=_pick(patch, "dreams", existing.dreams),
    )


def _merge_struggles(existing: Struggles, patch: dict) -> Struggles:
    return Struggles(
        anxiety_topics=_pick(patch, "anxiety_topics", existing.anxiety_topics),
        difficult_periods=_pick(patch, "difficult_periods", existing.difficult_periods),
        coping_mechanisms=_pick(patch, "coping_mechanisms", existing.coping_mechanisms),
    )
