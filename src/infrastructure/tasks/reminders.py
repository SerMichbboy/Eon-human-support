import json
from uuid import UUID

from src.infrastructure.tasks.broker import task_broker

# Channel name shared with the WS handler (src/presentation/ws/chat.py),
# which subscribes to this exact pattern for the duration of a connection.
REMINDER_CHANNEL = "reminder:{companion_id}"


@task_broker.task
async def send_reminder_task(reminder_id: str) -> None:
    """Fired by `RedisScheduleSource` at the reminder's `due_at` (see
    `SendMessage._maybe_schedule_reminder`, which calls
    `send_reminder_task.schedule_by_time(reminder_schedule_source, due_at, ...)`).
    Resolves dependencies manually — same reasoning as generate_daily_summary_task:
    TaskIQ workers run outside the FastAPI DI scope.

    A reminder firing is modeled as Eon actually sending a message, not a
    notification bolted on separately: it's saved into the companion's chat
    history exactly like any other assistant `Message` (so opening the app
    later shows it in context, not as an orphaned banner), and *that same
    message* is what gets pushed — the push body is the message content, not
    a separate copy of the reminder text.

    This task runs in a completely different process (`eon-worker`) from any
    open chat WebSocket connection (`eon-api`) — saving the message alone
    doesn't get it in front of someone with the app already open; a normal
    chat reply only ever reaches the client because it's a direct response to
    something the client itself just sent over that same socket. Publishing
    to Redis (`REMINDER_CHANNEL`) is how this reaches an already-open
    connection live instead of only appearing on the next history fetch.
    """
    from sqlalchemy import select

    from src.domain.memory.entity import Message, MessageRole
    from src.infrastructure.db.models import CompanionModel
    from src.infrastructure.db.repositories.memory import MessageRepository
    from src.infrastructure.db.repositories.push_token import PushTokenRepository
    from src.infrastructure.db.repositories.reminder import ReminderRepository
    from src.infrastructure.db.repositories.user import UserKeyRepository
    from src.infrastructure.push.expo_push import ExpoPushClient
    from src.infrastructure.tasks.worker_context import crypto, redis_client, session_factory

    async with session_factory() as session:
        reminder_repo = ReminderRepository(session)
        reminder = await reminder_repo.get_by_id(UUID(reminder_id))
        if not reminder or reminder.status != "pending":
            return

        result = await session.execute(
            select(CompanionModel.user_id, CompanionModel.name)
            .where(CompanionModel.id == reminder.companion_id)
        )
        row = result.first()
        if not row:
            await reminder_repo.mark_status(reminder.id, "failed")
            await session.commit()
            return
        user_id, encrypted_companion_name = row

        key_repo = UserKeyRepository(session)
        push_repo = PushTokenRepository(session)

        user_key = await key_repo.get_by_user_id(user_id)
        push_token = await push_repo.get_by_user_id(user_id)
        if not user_key or not user_key.server_wrapped_key:
            # No captured server key (never opened a chat since it shipped) —
            # can't decrypt the reminder text at all.
            await reminder_repo.mark_status(reminder.id, "failed")
            await session.commit()
            return

        try:
            raw_key = crypto.decrypt_user_key(user_key.server_wrapped_key)
            reminder_text = crypto.decrypt_field(reminder.message, raw_key)
        except Exception:
            # This one's fatal — without the reminder text there's nothing to
            # deliver at all.
            await reminder_repo.mark_status(reminder.id, "failed")
            await session.commit()
            return

        # Same defensive fallback as CompanionRepository._decrypt_name: a
        # companion's name is stored unencrypted until the user's first
        # rename with an active raw_key (e.g. the server-created "Eon"
        # default at registration, before any client encryption context
        # exists) — decrypting that plaintext raises. Kept in its own
        # try/except, separate from the reminder text above: a name-decrypt
        # hiccup used to take the whole reminder down with it (marked
        # "failed" even though the actual reminder text decrypted fine),
        # since both were caught by one shared except block.
        try:
            companion_name = crypto.decrypt_field(encrypted_companion_name, raw_key)
        except Exception:
            companion_name = encrypted_companion_name

        message_text = f"Напоминаю: {reminder_text}"
        message_repo = MessageRepository(session)
        assistant_msg = Message.create(
            companion_id=reminder.companion_id,
            role=MessageRole.ASSISTANT,
            content=crypto.encrypt_field(message_text, raw_key),
        )
        await message_repo.save(assistant_msg)

        try:
            await redis_client.publish(
                REMINDER_CHANNEL.format(companion_id=reminder.companion_id),
                json.dumps({"reply": message_text}),
            )
        except Exception:
            pass  # Live delivery is a bonus — the message is already saved either way.

        if push_token:
            try:
                await ExpoPushClient().send(push_token.token, title=companion_name, body=message_text)
            except Exception:
                pass  # Message is saved either way — worst case, seen next time the app opens.

        await reminder_repo.mark_status(reminder.id, "sent")
        await session.commit()
