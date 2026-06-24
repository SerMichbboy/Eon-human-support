import dataclasses
import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.crypto.context import UserRawKey
from src.infrastructure.db.models import UserProfileModel


class UserProfileRepository(IUserProfileRepository):
    def __init__(
        self,
        session: AsyncSession,
        crypto: CryptoService,
        user_raw_key: UserRawKey,
    ) -> None:
        self._session = session
        self._crypto = crypto
        self._raw_key = user_raw_key.value

    async def get_by_user_id(self, user_id: UUID) -> UserProfile | None:
        result = await self._session.execute(
            select(UserProfileModel).where(UserProfileModel.user_id == user_id)
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        return _to_entity(model, self._crypto, self._raw_key)

    async def save(self, profile: UserProfile) -> None:
        raw_key = self._raw_key
        model = await self._session.get(UserProfileModel, profile.id)
        if model is None:
            model = UserProfileModel()
            self._session.add(model)
        model.id = profile.id
        model.user_id = profile.user_id
        model.basic_info = _enc_json(dataclasses.asdict(profile.basic_info), raw_key, self._crypto)
        model.life_context = _enc_json(dataclasses.asdict(profile.life_context), raw_key, self._crypto)
        model.positive_moments = _enc_json(dataclasses.asdict(profile.positive_moments), raw_key, self._crypto)
        model.struggles = _enc_json(dataclasses.asdict(profile.struggles), raw_key, self._crypto)
        model.key_events = _enc_json([dataclasses.asdict(e) for e in profile.key_events], raw_key, self._crypto)
        model.companion_preferences = _enc_json(dataclasses.asdict(profile.companion_preferences), raw_key, self._crypto)
        model.updated_at = profile.updated_at
        await self._session.flush()


def _enc_json(data: dict | list, raw_key: bytes | None, crypto: CryptoService) -> str:
    if not raw_key:
        return json.dumps(data, ensure_ascii=False)
    return crypto.encrypt_json(data, raw_key)


def _dec_json(field: str, raw_key: bytes | None, crypto: CryptoService, default):
    if not field:
        return default
    if not raw_key:
        try:
            return json.loads(field)
        except Exception:
            return default
    try:
        return crypto.decrypt_json(field, raw_key)
    except Exception:
        try:
            return json.loads(field)
        except Exception:
            return default


def _to_entity(m: UserProfileModel, crypto: CryptoService, raw_key: bytes | None) -> UserProfile:
    basic_info_data = _dec_json(m.basic_info, raw_key, crypto, {})
    life_context_data = _dec_json(m.life_context, raw_key, crypto, {})
    positive_moments_data = _dec_json(m.positive_moments, raw_key, crypto, {})
    struggles_data = _dec_json(m.struggles, raw_key, crypto, {})
    key_events_data = _dec_json(m.key_events, raw_key, crypto, [])
    prefs_data = _dec_json(m.companion_preferences, raw_key, crypto, {})

    return UserProfile(
        id=m.id,
        user_id=m.user_id,
        basic_info=BasicInfo(**basic_info_data) if basic_info_data else BasicInfo(),
        life_context=LifeContext(**life_context_data) if life_context_data else LifeContext(),
        positive_moments=PositiveMoments(**positive_moments_data) if positive_moments_data else PositiveMoments(),
        struggles=Struggles(**struggles_data) if struggles_data else Struggles(),
        key_events=[
            KeyEvent(
                description=e["description"],
                emotional_weight=e["emotional_weight"],
                approximate_date=e.get("approximate_date"),
                type=KeyEventType(e["type"]),
            )
            for e in (key_events_data or [])
        ],
        companion_preferences=CompanionPreferences(
            tone=CompanionTone(prefs_data.get("tone", "warm")),
            directiveness=CompanionDirectiveness(prefs_data.get("directiveness", "listener")),
            forbidden_topics=prefs_data.get("forbidden_topics", []),
            communication_style=CommunicationStyle(prefs_data.get("communication_style", "friend")),
        ),
        updated_at=m.updated_at,
    )
