import base64
from dataclasses import dataclass

from src.application.auth.identifier import IdentifierType, classify_identifier
from src.application.auth.tokens import hash_password
from src.domain.companion.entity import Companion
from src.domain.companion.repository import ICompanionRepository
from src.domain.profile.entity import UserProfile
from src.domain.profile.repository import IUserProfileRepository
from src.domain.user.entity import User, UserKey
from src.domain.user.repository import IUserKeyRepository, IUserRepository


class EmailAlreadyExistsError(Exception):
    pass


class PhoneAlreadyExistsError(Exception):
    pass


@dataclass
class RegisterResult:
    user_id: str


class RegisterByEmail:
    def __init__(
        self,
        user_repo: IUserRepository,
        key_repo: IUserKeyRepository,
        companion_repo: ICompanionRepository,
        profile_repo: IUserProfileRepository,
    ) -> None:
        self._users = user_repo
        self._keys = key_repo
        self._companions = companion_repo
        self._profiles = profile_repo

    async def execute(self, email: str, password: str, key_salt: str, encrypted_key: str, pbkdf2_c: int = 10_000) -> RegisterResult:
        if await self._users.get_by_email(email):
            raise EmailAlreadyExistsError

        salt_bytes = base64.b64decode(key_salt)
        enc_key_bytes = base64.b64decode(encrypted_key)
        user_key = UserKey.create(encrypted_key=enc_key_bytes, salt=salt_bytes, pbkdf2_c=pbkdf2_c)
        await self._keys.save(user_key)

        user = User.create(
            email=email,
            phone=None,
            password_hash=hash_password(password),
            encryption_key_id=user_key.id,
        )
        await self._users.save(user)
        await self._create_companion_and_profile(user)

        return RegisterResult(user_id=str(user.id))

    async def _create_companion_and_profile(self, user: User) -> None:
        companion = Companion.create(user_id=user.id, name="Eon")
        # No authenticated session exists yet at registration — never encrypt
        # with whatever raw_key happens to be on the request, it can only be
        # a leftover from an unrelated account and would be undecryptable.
        await self._companions.save(companion, encrypt=False)
        profile = UserProfile.create(user_id=user.id)
        await self._profiles.save(profile)


class RegisterByPhone:
    def __init__(
        self,
        user_repo: IUserRepository,
        key_repo: IUserKeyRepository,
        companion_repo: ICompanionRepository,
        profile_repo: IUserProfileRepository,
    ) -> None:
        self._users = user_repo
        self._keys = key_repo
        self._companions = companion_repo
        self._profiles = profile_repo

    async def execute(self, phone: str, password: str, key_salt: str, encrypted_key: str, pbkdf2_c: int = 10_000) -> RegisterResult:
        if await self._users.get_by_phone(phone):
            raise PhoneAlreadyExistsError

        salt_bytes = base64.b64decode(key_salt)
        enc_key_bytes = base64.b64decode(encrypted_key)
        user_key = UserKey.create(encrypted_key=enc_key_bytes, salt=salt_bytes, pbkdf2_c=pbkdf2_c)
        await self._keys.save(user_key)

        user = User.create(
            email=None,
            phone=phone,
            password_hash=hash_password(password),
            encryption_key_id=user_key.id,
        )
        await self._users.save(user)

        companion = Companion.create(user_id=user.id, name="Eon")
        # See RegisterByEmail._create_companion_and_profile — no session yet,
        # so any raw_key on this request can't belong to this new account.
        await self._companions.save(companion, encrypt=False)
        profile = UserProfile.create(user_id=user.id)
        await self._profiles.save(profile)

        return RegisterResult(user_id=str(user.id))


class RegisterUser:
    """Single entry point for the unified login/register field — classifies
    `identifier` as email or phone and routes to the matching flow, so the
    client never has to know or ask which one the user typed."""

    def __init__(self, register_by_email: RegisterByEmail, register_by_phone: RegisterByPhone) -> None:
        self._by_email = register_by_email
        self._by_phone = register_by_phone

    async def execute(
        self, identifier: str, password: str, key_salt: str, encrypted_key: str, pbkdf2_c: int = 10_000
    ) -> tuple[RegisterResult, IdentifierType, str]:
        """Returns (result, identifier_type, normalized_identifier)."""
        kind, normalized = classify_identifier(identifier)
        if kind == IdentifierType.EMAIL:
            result = await self._by_email.execute(normalized, password, key_salt, encrypted_key, pbkdf2_c)
        else:
            result = await self._by_phone.execute(normalized, password, key_salt, encrypted_key, pbkdf2_c)
        return result, kind, normalized
