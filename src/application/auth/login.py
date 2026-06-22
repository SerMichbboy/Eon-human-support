from dataclasses import dataclass
from uuid import UUID

from src.application.auth.tokens import create_access_token, create_refresh_token, decode_token, verify_password
from src.domain.user.repository import IUserRepository
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


class LoginByEmail:
    def __init__(self, user_repo: IUserRepository, settings: Settings) -> None:
        self._users = user_repo
        self._settings = settings

    async def execute(self, email: str, password: str) -> TokenPair:
        user = await self._users.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError
        return TokenPair(
            access_token=create_access_token(user.id, self._settings),
            refresh_token=create_refresh_token(user.id, self._settings),
        )


class LoginByPhone:
    def __init__(self, user_repo: IUserRepository, settings: Settings) -> None:
        self._users = user_repo
        self._settings = settings

    async def execute(self, phone: str, password: str) -> TokenPair:
        user = await self._users.get_by_phone(phone)
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError
        return TokenPair(
            access_token=create_access_token(user.id, self._settings),
            refresh_token=create_refresh_token(user.id, self._settings),
        )


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
