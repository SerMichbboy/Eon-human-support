from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class UserKey:
    id: UUID
    encrypted_key: bytes  # client-encrypted: AES-GCM(raw_key, PBKDF2(password, salt))
    salt: bytes           # PBKDF2 salt, 16 bytes
    created_at: datetime

    @staticmethod
    def create(encrypted_key: bytes, salt: bytes) -> "UserKey":
        return UserKey(id=uuid4(), encrypted_key=encrypted_key, salt=salt, created_at=datetime.utcnow())


@dataclass
class User:
    id: UUID
    email: str | None
    phone: str | None
    password_hash: str
    is_email_verified: bool
    is_phone_verified: bool
    encryption_key_id: UUID
    created_at: datetime

    @staticmethod
    def create(
        email: str | None,
        phone: str | None,
        password_hash: str,
        encryption_key_id: UUID,
    ) -> "User":
        return User(
            id=uuid4(),
            email=email,
            phone=phone,
            password_hash=password_hash,
            is_email_verified=False,
            is_phone_verified=False,
            encryption_key_id=encryption_key_id,
            created_at=datetime.utcnow(),
        )

    @property
    def is_verified(self) -> bool:
        return self.is_email_verified or self.is_phone_verified
