from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from src.application.chat.build_context import BuildContext
from src.application.chat.prompts import (
    REMINDER_UNCLEAR_NOTE,
    VOICE_MODE_SUFFIX,
    build_reminder_confirmed_note,
)
from src.domain.companion.repository import ICompanionRepository
from src.domain.memory.entity import Message, MessageRole
from src.domain.memory.repository import IMessageRepository
from src.domain.profile.repository import IUserProfileRepository
from src.domain.reminder.entity import Reminder
from src.domain.reminder.repository import IReminderRepository
from src.infrastructure.ai.client import VsegptClient
from src.infrastructure.crypto.aes import CryptoService

# Cheap keyword gate before spending an extra LLM call on every message —
# most messages obviously aren't reminder requests, and this extraction is on
# top of the main chat completion, not instead of it (see _maybe_schedule_reminder).
# Grouped by the underlying request, not just conjugations of one verb — people
# ask for the same thing ("ping me at time X") in several genuinely different
# ways, not just different tenses of "напомнить":
_REMINDER_KEYWORDS = (
    # напомнить (perfective) / напоминать (imperfective) — two different verb
    # stems in Russian, not spelling variants of each other (напомн- vs
    # напомин-), so both need listing; substring matching still catches every
    # conjugation of each (напомни/напомнить/напомните/напомнишь, напоминай/
    # напоминать/напоминаю) since they all contain one stem or the other.
    "напомн", "напомин",
    # "so I don't forget" — the same request framed negatively instead of as
    # an imperative to remind. "забудь" (imperative) isn't a spelling variant
    # of "забыть"/"забыл" (irregular conjugation), hence both stems.
    "не забудь", "не забы",
    # warn/wake/let-know at a specific time — same underlying request as
    # "напомни", different verb entirely.
    "предупреди", "разбуди", "сообщи мне", "дай знать",
    # alarm/timer — functionally the same "notify me at/after time X"
    # mechanism from this feature's point of view, just phrased as a device
    # metaphor rather than a verb aimed at Eon.
    "будильник", "таймер",
    # colloquial "nudge me" — same request, informal register.
    "пни меня", "толкани меня",
)


def _looks_like_reminder(text: str) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in _REMINDER_KEYWORDS)


def _client_local_iso(client_time: str | None, client_tz: str | None) -> str | None:
    """`client_time` is the device's current instant (ISO, any offset — in
    practice UTC via `toISOString()`), `client_tz` its IANA zone name (e.g.
    "Europe/Moscow", from `Intl.DateTimeFormat().resolvedOptions().timeZone`).
    Needed because the server has no other way to know the user's local wall-clock
    time — "напомни в 18:00" is meaningless without it."""
    if not client_time:
        return None
    try:
        instant = datetime.fromisoformat(client_time.replace("Z", "+00:00"))
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=timezone.utc)
        if client_tz:
            instant = instant.astimezone(ZoneInfo(client_tz))
        return instant.isoformat()
    except Exception:
        return None


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
        reminder_repo: IReminderRepository,
        context_builder: BuildContext,
        claude: VsegptClient,
        crypto: CryptoService,
    ) -> None:
        self._companions = companion_repo
        self._profiles = profile_repo
        self._messages = message_repo
        self._reminders = reminder_repo
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
        client_time: str | None = None,
        client_tz: str | None = None,
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
            system_prompt += VOICE_MODE_SUFFIX

        # Runs *before* the reply, not after (a change from the original
        # version) — the reply itself needs to know whether a reminder was
        # actually resolvable, so it can ask "when exactly?" instead of
        # confidently confirming a reminder that `extract_reminder` couldn't
        # actually pin to a time (see _maybe_schedule_reminder). This does add
        # the extraction call to the critical path for messages that match
        # the keyword gate — acceptable since those are rare, and getting the
        # reply right here matters more than shaving that latency.
        if raw_key and _looks_like_reminder(text):
            try:
                clarify_note = await self._maybe_schedule_reminder(
                    companion_id=companion.id,
                    text=text,
                    raw_key=raw_key,
                    client_time=client_time,
                    client_tz=client_tz,
                )
                if clarify_note:
                    system_prompt += clarify_note
            except Exception:
                # Never let a reminder-scheduling hiccup take down the chat
                # reply itself.
                pass

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

    async def _maybe_schedule_reminder(
        self,
        companion_id: UUID,
        text: str,
        raw_key: bytes,
        client_time: str | None,
        client_tz: str | None,
    ) -> str | None:
        """Returns a system-prompt note in both directions this needs to
        correct the model's *own* assumption about what it can do — not just
        the "couldn't resolve a time" failure case, but also success: without
        an explicit "a reminder actually got scheduled" note, the model has
        no way to know this backend capability exists at all, and (correctly,
        for a plain LLM with no tool integration) defaults to telling the
        user it can't set reminders — even though one was just silently
        created and scheduled underneath it. Returns `None` only when there's
        genuinely nothing to react to (not a reminder request at all)."""
        local_iso = _client_local_iso(client_time, client_tz)
        if not local_iso:
            return None

        # extract_reminder returns one of three shapes — see its own
        # docstring. `None` (genuinely not a reminder request, e.g. a keyword
        # gate false positive like "не забудь, что обещал" with no time
        # attached) is deliberately left alone here, not treated the same as
        # "unclear" — otherwise Eon would ask "во сколько напомнить?" in
        # reply to messages that were never asking for a time-based reminder.
        extracted = await self._claude.extract_reminder(text, local_iso)
        if extracted is None:
            return None

        if extracted.get("unclear"):
            return REMINDER_UNCLEAR_NOTE

        try:
            due_at = datetime.fromisoformat(extracted["due_at"])
        except (KeyError, ValueError):
            return REMINDER_UNCLEAR_NOTE
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        due_at_utc = due_at.astimezone(timezone.utc)

        now = datetime.now(timezone.utc)
        if due_at_utc <= now:
            return REMINDER_UNCLEAR_NOTE

        message = str(extracted.get("message") or text)
        encrypted_message = self._crypto.encrypt_field(message, raw_key)
        reminder = Reminder.create(companion_id, encrypted_message, due_at_utc)
        await self._reminders.save(reminder)

        # Imported lazily — same reasoning as the task-module imports in
        # src/infrastructure/tasks/*.py: keeps TaskIQ/Redis scheduling wiring
        # out of this use case's module-level import graph.
        from src.infrastructure.tasks.broker import reminder_schedule_source
        from src.infrastructure.tasks.reminders import send_reminder_task

        await send_reminder_task.schedule_by_time(
            reminder_schedule_source, due_at_utc, reminder_id=str(reminder.id)
        )

        # Local time for the confirmation, not UTC — "напоминание в 20:00"
        # would be wrong from the user's own point of view.
        local_due_at = due_at_utc.astimezone(ZoneInfo(client_tz)) if client_tz else due_at
        return build_reminder_confirmed_note(local_due_at.strftime("%d.%m %H:%M"))
