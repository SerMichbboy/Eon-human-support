from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.companion.entity import Companion
from src.domain.companion.repository import ICompanionRepository
from src.domain.user.repository import IUserKeyRepository
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.db.models import CompanionModel


class CompanionRepository(ICompanionRepository):
    def __init__(
        self,
        session: AsyncSession,
        crypto: CryptoService,
        key_repo: IUserKeyRepository,
    ) -> None:
        self._session = session
        self._crypto = crypto
        self._key_repo = key_repo

    async def _raw_key(self, user_id: UUID) -> bytes | None:
        user_key = await self._key_repo.get_by_user_id(user_id)
        return self._crypto.decrypt_user_key(user_key.encrypted_key) if user_key else None

    async def get_by_user_id(self, user_id: UUID) -> Companion | None:
        result = await self._session.execute(
            select(CompanionModel).where(CompanionModel.user_id == user_id)
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        raw_key = await self._raw_key(user_id)
        name = _decrypt_name(model.name, raw_key, self._crypto)
        return Companion(id=model.id, user_id=model.user_id, name=name, created_at=model.created_at)

    async def save(self, companion: Companion) -> None:
        raw_key = await self._raw_key(companion.user_id)
        model = await self._session.get(CompanionModel, companion.id)
        if model is None:
            model = CompanionModel()
            self._session.add(model)
        model.id = companion.id
        model.user_id = companion.user_id
        model.name = (
            self._crypto.encrypt_field(companion.name, raw_key) if raw_key else companion.name
        )
        model.created_at = companion.created_at
        await self._session.flush()


def _decrypt_name(encrypted: str, raw_key: bytes | None, crypto: CryptoService) -> str:
    if not raw_key:
        return encrypted
    try:
        return crypto.decrypt_field(encrypted, raw_key)
    except Exception:
        return encrypted  # fallback for plaintext existing data
