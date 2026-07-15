from uuid import UUID

from src.domain.user.repository import IUserKeyRepository
from src.infrastructure.crypto.aes import CryptoService


class CaptureServerKey:
    """Opportunistically persists a server-decryptable copy of the user's raw E2E key.

    Called with the raw_key a live request already has (WS chat connect). Wrapping with
    the master key (instead of storing raw) means only a MASTER_ENCRYPTION_KEY compromise
    — not just a DB dump — exposes message content. No-ops once already captured.
    """

    def __init__(self, key_repo: IUserKeyRepository, crypto: CryptoService) -> None:
        self._keys = key_repo
        self._crypto = crypto

    async def execute(self, user_id: UUID, raw_key: bytes) -> None:
        key = await self._keys.get_by_user_id(user_id)
        if not key or key.server_wrapped_key is not None:
            return
        key.server_wrapped_key = self._crypto.encrypt_user_key(raw_key)
        await self._keys.save(key)
