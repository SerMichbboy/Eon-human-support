import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.main.settings import Settings


class CryptoService:
    """AES-256-GCM encryption. Each user has their own data key."""

    def __init__(self, settings: Settings) -> None:
        raw = base64.b64decode(settings.master_encryption_key)
        self._master_key = AESGCM(raw)

    # --- Master key: protect/unprotect user data keys ---

    def generate_user_key(self) -> bytes:
        return os.urandom(32)

    def encrypt_user_key(self, raw_key: bytes) -> bytes:
        nonce = os.urandom(12)
        ct = self._master_key.encrypt(nonce, raw_key, None)
        return nonce + ct

    def decrypt_user_key(self, encrypted_key: bytes) -> bytes:
        nonce, ct = encrypted_key[:12], encrypted_key[12:]
        return self._master_key.decrypt(nonce, ct, None)

    # --- User data key: encrypt/decrypt fields ---

    def encrypt_field(self, value: str, user_key: bytes) -> str:
        """Returns base64-encoded nonce+ciphertext."""
        aes = AESGCM(user_key)
        nonce = os.urandom(12)
        ct = aes.encrypt(nonce, value.encode(), None)
        return base64.b64encode(nonce + ct).decode()

    def decrypt_field(self, encrypted: str, user_key: bytes) -> str:
        aes = AESGCM(user_key)
        raw = base64.b64decode(encrypted)
        nonce, ct = raw[:12], raw[12:]
        return aes.decrypt(nonce, ct, None).decode()

    def encrypt_json(self, data: dict | list, user_key: bytes) -> str:
        return self.encrypt_field(json.dumps(data, ensure_ascii=False), user_key)

    def decrypt_json(self, encrypted: str, user_key: bytes) -> dict | list:
        return json.loads(self.decrypt_field(encrypted, user_key))
