from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class PushToken:
    """Kept as its own aggregate rather than a column on `User` — same
    reasoning as `UserKey` being separate from `User` (src/domain/user/entity.py):
    a device push token is infrastructure/device metadata, not a fact about
    the account itself, and one user could plausibly register a new device
    later without that being a "change" to their User entity."""

    user_id: UUID
    token: str  # Expo push token, e.g. "ExponentPushToken[...]"
    updated_at: datetime
