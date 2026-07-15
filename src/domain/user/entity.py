from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


@dataclass
class UserKey:
    id: UUID
    encrypted_key: bytes  # client-encrypted: AES-GCM(raw_key, PBKDF2(password, salt))
    salt: bytes           # PBKDF2 salt, 16 bytes
    pbkdf2_c: int         # PBKDF2 iteration count used at registration
    created_at: datetime
    # Server-encrypted: AES-GCM(raw_key, MASTER_ENCRYPTION_KEY). Captured opportunistically
    # from a live request (see CaptureServerKey) so background jobs can decrypt without the
    # client online. None until the user's first chat connection after this field shipped.
    server_wrapped_key: bytes | None = None

    @staticmethod
    def create(encrypted_key: bytes, salt: bytes, pbkdf2_c: int = 10_000) -> "UserKey":
        return UserKey(id=uuid4(), encrypted_key=encrypted_key, salt=salt, pbkdf2_c=pbkdf2_c, created_at=datetime.utcnow())


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
