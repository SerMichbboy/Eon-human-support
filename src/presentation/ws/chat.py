import asyncio
import base64
import json
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.auth.capture_server_key import CaptureServerKey
from src.application.auth.tokens import decode_token
from src.application.chat.build_context import BuildContext
from src.application.chat.send_message import SendMessage
from src.domain.memory.repository import (
    IDailySummaryRepository, IMemoryEmbeddingRepository,
    IMessageRepository, IWeeklySummaryRepository,
)
from src.domain.reminder.repository import IReminderRepository
from src.domain.user.repository import IUserKeyRepository
from src.infrastructure.ai.client import VsegptClient
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.crypto.context import UserRawKey
from src.infrastructure.db.repositories.companion import CompanionRepository
from src.infrastructure.db.repositories.profile import UserProfileRepository
from src.infrastructure.tasks.reminders import REMINDER_CHANNEL
from src.main.settings import Settings

router = APIRouter()


async def _forward_reminders(websocket: WebSocket, redis: Redis, companion_id: UUID) -> None:
    """Runs alongside the main receive loop for the lifetime of the
    connection — a reminder firing happens in a completely different process
    (`eon-worker`) with no other way to reach an already-open socket (see
    `send_reminder_task`'s docstring). Cancelled from `chat_ws`'s `finally`
    block when the connection ends."""
    pubsub = redis.pubsub()
    channel = REMINDER_CHANNEL.format(companion_id=companion_id)
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                await websocket.send_json(json.loads(message["data"]))
            except Exception:
                break
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


@router.websocket("/chat")
async def chat_ws(websocket: WebSocket):
    # No DB scope for auth — token decoding is pure JWT, and settings come
    # straight off app state (see src/main/main.py:app.state.settings).
    settings: Settings = websocket.app.state.settings
    token = websocket.query_params.get("token")
    try:
        payload = decode_token(token, settings)
        if payload.get("type") != "access":
            raise ValueError
        user_id = UUID(payload["sub"])
    except Exception:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    # First message must provide the E2E key: {"key": "<base64-raw-key>"}
    try:
        init_data = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4000)
        return

    raw_key_b64 = init_data.get("key")
    raw_key: bytes | None = None
    if raw_key_b64:
        try:
            raw_key = base64.b64decode(raw_key_b64)
        except Exception:
            pass

    container = websocket.app.state.dishka_container

    if raw_key:
        # Own short-lived scope — a pooled connection is checked out only for
        # this one write, not for the rest of the (potentially hours-long) chat.
        try:
            async with container() as key_container:
                crypto = await key_container.get(CryptoService)
                key_repo = await key_container.get(IUserKeyRepository)
                session = await key_container.get(AsyncSession)
                await CaptureServerKey(key_repo, crypto).execute(user_id, raw_key)
                await session.commit()
        except Exception:
            # Best-effort: nightly compression just stays skipped for this user
            # until a future connection captures the key successfully.
            pass

    # Subscribed for the lifetime of the connection so a reminder firing in
    # the separate eon-worker process (see send_reminder_task) can reach this
    # socket immediately instead of only showing up on the next history
    # fetch. Resolved once here, not per-message — companion_id doesn't
    # change mid-connection.
    forward_task: asyncio.Task | None = None
    try:
        async with container() as lookup_container:
            crypto = await lookup_container.get(CryptoService)
            session = await lookup_container.get(AsyncSession)
            companion_repo = CompanionRepository(session, crypto, UserRawKey(raw_key))
            companion = await companion_repo.get_by_user_id(user_id)
        if companion:
            redis = await container.get(Redis)
            forward_task = asyncio.create_task(_forward_reminders(websocket, redis, companion.id))
    except Exception:
        # Best-effort — worst case, reminders still show up on next reopen.
        pass

    try:
        while True:
            data = await websocket.receive_json()
            text = data.get("text", "").strip()
            if not text:
                continue
            voice_mode = bool(data.get("voice_mode", False))
            client_time = data.get("client_time")
            client_tz = data.get("client_tz")

            # A fresh Dishka request-scope (and pooled DB connection) per message,
            # not per connection — the socket can sit open for hours between
            # messages and must not pin a connection out of the pool the whole
            # time.
            async with container() as request_container:
                settings = await request_container.get(Settings)
                session = await request_container.get(AsyncSession)
                crypto = await request_container.get(CryptoService)
                message_repo = await request_container.get(IMessageRepository)
                daily_repo = await request_container.get(IDailySummaryRepository)
                weekly_repo = await request_container.get(IWeeklySummaryRepository)
                embedding_repo = await request_container.get(IMemoryEmbeddingRepository)
                reminder_repo = await request_container.get(IReminderRepository)
                claude = await request_container.get(VsegptClient)

                user_raw_key = UserRawKey(raw_key)
                companion_repo = CompanionRepository(session, crypto, user_raw_key)
                profile_repo = UserProfileRepository(session, crypto, user_raw_key)
                context_builder = BuildContext(
                    message_repo, daily_repo, weekly_repo, embedding_repo,
                    claude, crypto, settings,
                )
                use_case = SendMessage(
                    companion_repo, profile_repo, message_repo, reminder_repo,
                    context_builder, claude, crypto,
                )

                result = await use_case.execute(
                    user_id=user_id, text=text, raw_key=raw_key, voice_mode=voice_mode,
                    client_time=client_time, client_tz=client_tz,
                )
                await session.commit()

            await websocket.send_json({"reply": result.reply})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"error": str(e)})
        await websocket.close(code=4000)
    finally:
        if forward_task:
            forward_task.cancel()
