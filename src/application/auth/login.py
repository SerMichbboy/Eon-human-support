import base64
from dataclasses import dataclass, field
from uuid import UUID

from src.application.auth.identifier import IdentifierType, classify_identifier
from src.application.auth.tokens import create_access_token, create_refresh_token, decode_token, verify_password
from src.domain.user.repository import IUserKeyRepository, IUserRepository
from src.main.settings import Settings


class InvalidCredentialsError(Exception):
    pass


class UserNotVerifiedError(Exception):
    pass


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    key_salt: str | None = field(default=None)
    encrypted_key: str | None = field(default=None)
    pbkdf2_c: int | None = field(default=None)


class LoginByEmail:
    def __init__(self, user_repo: IUserRepository, key_repo: IUserKeyRepository, settings: Settings) -> None:
        self._users = user_repo
        self._keys = key_repo
        self._settings = settings

    async def execute(self, email: str, password: str) -> TokenPair:
        user = await self._users.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError
        if not user.is_verified:
            raise UserNotVerifiedError
        user_key = await self._keys.get_by_user_id(user.id)
        return TokenPair(
            access_token=create_access_token(user.id, self._settings),
            refresh_token=create_refresh_token(user.id, self._settings),
            key_salt=base64.b64encode(user_key.salt).decode() if user_key else None,
            encrypted_key=base64.b64encode(user_key.encrypted_key).decode() if user_key else None,
            pbkdf2_c=user_key.pbkdf2_c if user_key else None,
        )


class LoginByPhone:
    def __init__(self, user_repo: IUserRepository, key_repo: IUserKeyRepository, settings: Settings) -> None:
        self._users = user_repo
        self._keys = key_repo
        self._settings = settings

    async def execute(self, phone: str, password: str) -> TokenPair:
        user = await self._users.get_by_phone(phone)
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError
        if not user.is_verified:
            raise UserNotVerifiedError
        user_key = await self._keys.get_by_user_id(user.id)
        return TokenPair(
            access_token=create_access_token(user.id, self._settings),
            refresh_token=create_refresh_token(user.id, self._settings),
            key_salt=base64.b64encode(user_key.salt).decode() if user_key else None,
            encrypted_key=base64.b64encode(user_key.encrypted_key).decode() if user_key else None,
            pbkdf2_c=user_key.pbkdf2_c if user_key else None,
        )


class LoginUser:
    """Unified counterpart to RegisterUser — classifies `identifier` and
    routes to the matching login flow."""

    def __init__(self, login_by_email: LoginByEmail, login_by_phone: LoginByPhone) -> None:
        self._by_email = login_by_email
        self._by_phone = login_by_phone

    async def execute(self, identifier: str, password: str) -> TokenPair:
        kind, normalized = classify_identifier(identifier)
        if kind == IdentifierType.EMAIL:
            return await self._by_email.execute(normalized, password)
        return await self._by_phone.execute(normalized, password)


class RefreshToken:
    def __init__(self, user_repo: IUserRepository, settings: Settings) -> None:
        self._users = user_repo
        self._settings = settings

    async def execute(self, refresh_token: str) -> TokenPair:
        try:
            payload = decode_token(refresh_token, self._settings)
        except ValueError:
            raise InvalidCredentialsError

        if payload.get("type") != "refresh":
            raise InvalidCredentialsError

        user_id = UUID(payload["sub"])
        user = await self._users.get_by_id(user_id)
        if not user:
            raise InvalidCredentialsError

        return TokenPair(
            access_token=create_access_token(user.id, self._settings),
            refresh_token=create_refresh_token(user.id, self._settings),
        )
