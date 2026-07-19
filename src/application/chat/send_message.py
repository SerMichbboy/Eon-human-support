from dataclasses import dataclass
from uuid import UUID

from src.application.chat.build_context import BuildContext
from src.domain.companion.repository import ICompanionRepository
from src.domain.memory.entity import Message, MessageRole
from src.domain.memory.repository import IMessageRepository
from src.domain.profile.repository import IUserProfileRepository
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService


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
        context_builder: BuildContext,
        claude: ClaudeClient,
        crypto: CryptoService,
    ) -> None:
        self._companions = companion_repo
        self._profiles = profile_repo
        self._messages = message_repo
        self._context = context_builder
        self._claude = claude
        self._crypto = crypto

    async def execute(
        self,
        user_id: UUID,
        text: str,
        raw_key: bytes | None = None,
        audio_url: str | None = None,
        voice_mode: bool = False,
    ) -> SendMessageResult:
        companion = await self._companions.get_by_user_id(user_id)
        if not companion:
            raise ValueError("Companion not found")

        profile = await self._profiles.get_by_user_id(user_id)

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

        system_prompt = await self._context.build_system_prompt(profile, companion.name)
        try:
            system_prompt += await self._context.get_relevant_archive_for_text(
                companion.id, text, raw_key
            )
        except Exception:
            # Embedding provider hiccup — chat should degrade to "no archive
            # recall this turn", not drop the whole connection.
            pass

        # Conversation Mode (ConversationOverlay.tsx) sends this whole reply
        # through TTS before the user hears anything, and the wait is felt as
        # dead air, not just reading delay — a normal-length text reply (the
        # default 1024-token cap) makes both the chat completion itself and
        # the synthesis step that follows it noticeably slower, on top of
        # reading like a monologue rather than a spoken back-and-forth. There's
        # no streaming available to hide this (vsegpt exposes neither a
        # streaming chat/completions nor a realtime audio endpoint — see
        # CLAUDE.md's Conversation Mode notes), so the only lever left is
        # making the reply itself shorter.
        if voice_mode:
            system_prompt += (
                "\n\nСейчас голосовой разговор — отвечай 1-2 короткими "
                "предложениями, разговорным тоном, без списков и форматирования."
            )
        history = await self._context.get_recent_messages(companion.id)

        if raw_key:
            decrypted = []
            for m in history:
                try:
                    content = self._crypto.decrypt_field(m["content"], raw_key)
                except Exception:
                    content = m["content"]
                decrypted.append({"role": m["role"], "content": content})
            history = decrypted

        try:
            reply = await self._claude.chat(
                system=system_prompt,
                messages=history,
                max_tokens=120 if voice_mode else 1024,
            )
        except Exception:
            # Provider hiccup (e.g. upstream 500) — the user's own message above
            # is already saved; without this, the whole call raises before the
            # WS handler's session.commit(), silently rolling that save back
            # too and just dropping the connection with nothing shown to them.
            reply = (
                "Прости, не получилось ответить — что-то не так со связью. "
                "Попробуй, пожалуйста, ещё раз через минуту."
            )

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
