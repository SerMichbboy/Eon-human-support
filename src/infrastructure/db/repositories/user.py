from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.user.entity import User, UserKey
from src.domain.user.repository import IUserKeyRepository, IUserRepository
from src.infrastructure.db.models import UserKeyModel, UserModel



class UserRepository(IUserRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self._session.execute(select(UserModel).where(UserModel.id == user_id))
        model = result.scalar_one_or_none()
        return _to_entity(model) if model else None

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.email == email)
        )
        model = result.scalar_one_or_none()
        return _to_entity(model) if model else None

    async def get_by_phone(self, phone: str) -> User | None:
        result = await self._session.execute(
            select(UserModel).where(UserModel.phone == phone)
        )
        model = result.scalar_one_or_none()
        return _to_entity(model) if model else None

    async def save(self, user: User) -> None:
        model = await self._session.get(UserModel, user.id)
        if model is None:
            model = UserModel()
            self._session.add(model)
        model.id = user.id
        model.email = user.email
        model.phone = user.phone
        model.password_hash = user.password_hash
        model.is_email_verified = user.is_email_verified
        model.is_phone_verified = user.is_phone_verified
        model.encryption_key_id = user.encryption_key_id
        model.created_at = user.created_at
        await self._session.flush()

    async def delete(self, user_id: UUID) -> None:
        model = await self._session.get(UserModel, user_id)
        if model:
            await self._session.delete(model)
            await self._session.flush()


class UserKeyRepository(IUserKeyRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, key: UserKey) -> None:
        model = await self._session.get(UserKeyModel, key.id)
        if model is None:
            model = UserKeyModel()
            self._session.add(model)
        model.id = key.id
        model.encrypted_key = key.encrypted_key
        model.salt = key.salt
        model.created_at = key.created_at
        await self._session.flush()

    async def get_by_id(self, key_id: UUID) -> UserKey | None:
        model = await self._session.get(UserKeyModel, key_id)
        if not model:
            return None
        return UserKey(id=model.id, encrypted_key=model.encrypted_key, salt=model.salt, created_at=model.created_at)

    async def get_by_user_id(self, user_id: UUID) -> UserKey | None:
        result = await self._session.execute(
            select(UserKeyModel)
            .join(UserModel, UserModel.encryption_key_id == UserKeyModel.id)
            .where(UserModel.id == user_id)
        )
        model = result.scalar_one_or_none()
        if not model:
            return None
        return UserKey(id=model.id, encrypted_key=model.encrypted_key, salt=model.salt, created_at=model.created_at)

    async def delete(self, key_id: UUID) -> None:
        model = await self._session.get(UserKeyModel, key_id)
        if model:
            await self._session.delete(model)
            await self._session.flush()


def _to_entity(model: UserModel) -> User:
    return User(
        id=model.id,
        email=model.email,
        phone=model.phone,
        password_hash=model.password_hash,
        is_email_verified=model.is_email_verified,
        is_phone_verified=model.is_phone_verified,
        encryption_key_id=model.encryption_key_id,
        created_at=model.created_at,
    )
