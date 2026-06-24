import base64
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.auth.tokens import decode_token
from src.application.chat.build_context import BuildContext
from src.application.chat.send_message import SendMessage
from src.domain.memory.repository import (
    IDailySummaryRepository, IMemoryEmbeddingRepository,
    IMessageRepository, IWeeklySummaryRepository,
)
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.crypto.context import UserRawKey
from src.infrastructure.db.repositories.companion import CompanionRepository
from src.infrastructure.db.repositories.profile import UserProfileRepository
from src.main.settings import Settings

router = APIRouter()


@router.websocket("/chat")
async def chat_ws(websocket: WebSocket):
    container = websocket.app.state.dishka_container

    async with container() as request_container:
        settings = await request_container.get(Settings)
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

        session = await request_container.get(AsyncSession)
        crypto = await request_container.get(CryptoService)
        message_repo = await request_container.get(IMessageRepository)
        daily_repo = await request_container.get(IDailySummaryRepository)
        weekly_repo = await request_container.get(IWeeklySummaryRepository)
        embedding_repo = await request_container.get(IMemoryEmbeddingRepository)
        claude = await request_container.get(ClaudeClient)

        # Construct E2E-aware repos manually with the client-provided key
        user_raw_key = UserRawKey(raw_key)
        companion_repo = CompanionRepository(session, crypto, user_raw_key)
        profile_repo = UserProfileRepository(session, crypto, user_raw_key)

        context_builder = BuildContext(message_repo, daily_repo, weekly_repo, embedding_repo, claude, settings)
        use_case = SendMessage(companion_repo, profile_repo, message_repo, context_builder, claude, crypto)

        try:
            while True:
                data = await websocket.receive_json()
                text = data.get("text", "").strip()
                if not text:
                    continue
                result = await use_case.execute(user_id=user_id, text=text, raw_key=raw_key)
                await session.commit()
                await websocket.send_json({"reply": result.reply})
        except WebSocketDisconnect:
            pass
        except Exception as e:
            await websocket.send_json({"error": str(e)})
            await websocket.close(code=4000)
