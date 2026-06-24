from dataclasses import dataclass
from uuid import UUID

from src.application.chat.build_context import BuildContext
from src.domain.companion.repository import ICompanionRepository
from src.domain.memory.entity import Message, MessageRole
from src.domain.memory.repository import IMessageRepository
from src.domain.profile.repository import IUserProfileRepository
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService
from src.domain.user.repository import IUserKeyRepository


@dataclass
class SendMessageResult:
    reply: str
    companion_id: str


class SendMessage:
    def __init__(
        self,
        companion_repo: ICompanionRepository,
        profile_repo: IUserProfileRepository,
        message_repo: IMessageRepository,
        key_repo: IUserKeyRepository,
        context_builder: BuildContext,
        claude: ClaudeClient,
        crypto: CryptoService,
    ) -> None:
        self._companions = companion_repo
        self._profiles = profile_repo
        self._messages = message_repo
        self._keys = key_repo
        self._context = context_builder
        self._claude = claude
        self._crypto = crypto

    async def execute(self, user_id: UUID, text: str, audio_url: str | None = None) -> SendMessageResult:
        companion = await self._companions.get_by_user_id(user_id)
        if not companion:
            raise ValueError("Companion not found")

        profile = await self._profiles.get_by_user_id(user_id)
        user_key = await self._keys.get_by_user_id(user_id)
        raw_key = self._crypto.decrypt_user_key(user_key.encrypted_key) if user_key else None

        # Encrypt and save user message
        encrypted_content = (
            self._crypto.encrypt_field(text, raw_key) if raw_key else text
        )
        user_msg = Message.create(
            companion_id=companion.id,
            role=MessageRole.USER,
            content=encrypted_content,
            audio_url=audio_url,
        )
        await self._messages.save(user_msg)

        # Build context
        system_prompt = await self._context.build_system_prompt(profile)
        history = await self._context.get_recent_messages(companion.id)

        # Decrypt history for Claude (fallback to raw content for pre-encryption messages)
        if raw_key:
            decrypted = []
            for m in history:
                try:
                    content = self._crypto.decrypt_field(m["content"], raw_key)
                except Exception:
                    content = m["content"]
                decrypted.append({"role": m["role"], "content": content})
            history = decrypted

        # Get reply
        reply = await self._claude.chat(system=system_prompt, messages=history)

        # Encrypt and save assistant reply
        encrypted_reply = (
            self._crypto.encrypt_field(reply, raw_key) if raw_key else reply
        )
        assistant_msg = Message.create(
            companion_id=companion.id,
            role=MessageRole.ASSISTANT,
            content=encrypted_reply,
        )
        await self._messages.save(assistant_msg)

        return SendMessageResult(reply=reply, companion_id=str(companion.id))
