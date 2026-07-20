from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.companion.entity import Companion
from src.domain.companion.repository import ICompanionRepository
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.crypto.context import UserRawKey
from src.infrastructure.db.models import CompanionModel


class CompanionRepository(ICompanionRepository):
    def __init__(
        self,
        session: AsyncSession,
        crypto: CryptoService,
        user_raw_key: UserRawKey,
    ) -> None:
        self._session = session
        self._crypto = crypto
        self._raw_key = user_raw_key.value

    async def get_by_user_id(self, user_id: UUID) -> Companion | None:
        result = await self._session.execute(
            select(CompanionModel).where(CompanionModel.user_id == user_id)
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        name = _decrypt_name(model.name, self._raw_key, self._crypto)
        return Companion(id=model.id, user_id=model.user_id, name=name, created_at=model.created_at)

    async def save(self, companion: Companion, encrypt: bool = True) -> None:
        model = await self._session.get(CompanionModel, companion.id)
        if model is None:
            model = CompanionModel()
            self._session.add(model)
        model.id = companion.id
        model.user_id = companion.user_id
        model.name = (
            self._crypto.encrypt_field(companion.name, self._raw_key)
            if encrypt and self._raw_key
            else companion.name
        )
        model.created_at = companion.created_at
        await self._session.flush()


def _decrypt_name(encrypted: str, raw_key: bytes | None, crypto: CryptoService) -> str:
    if not raw_key:
        return encrypted
    try:
        return crypto.decrypt_field(encrypted, raw_key)
    except Exception:
        return encrypted
