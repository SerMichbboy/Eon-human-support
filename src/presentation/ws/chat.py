from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.application.auth.tokens import decode_token
from src.application.chat.build_context import BuildContext
from src.application.chat.send_message import SendMessage
from src.domain.companion.repository import ICompanionRepository
from src.domain.memory.repository import (
    IDailySummaryRepository, IMemoryEmbeddingRepository,
    IMessageRepository, IWeeklySummaryRepository,
)
from src.domain.profile.repository import IUserProfileRepository
from src.domain.user.repository import IUserKeyRepository
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService
from src.main.settings import Settings
from sqlalchemy.ext.asyncio import AsyncSession

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

        companion_repo = await request_container.get(ICompanionRepository)
        profile_repo = await request_container.get(IUserProfileRepository)
        message_repo = await request_container.get(IMessageRepository)
        daily_repo = await request_container.get(IDailySummaryRepository)
        weekly_repo = await request_container.get(IWeeklySummaryRepository)
        embedding_repo = await request_container.get(IMemoryEmbeddingRepository)
        key_repo = await request_container.get(IUserKeyRepository)
        claude = await request_container.get(ClaudeClient)
        crypto = await request_container.get(CryptoService)
        session = await request_container.get(AsyncSession)

        settings = await request_container.get(Settings)
        context_builder = BuildContext(message_repo, daily_repo, weekly_repo, embedding_repo, claude, settings)
        use_case = SendMessage(
            companion_repo, profile_repo, message_repo, key_repo,
            context_builder, claude, crypto,
        )

        try:
            while True:
                data = await websocket.receive_json()
                text = data.get("text", "").strip()
                if not text:
                    continue
                result = await use_case.execute(user_id=user_id, text=text)
                await session.commit()
                await websocket.send_json({"reply": result.reply})
        except WebSocketDisconnect:
            pass
        except Exception as e:
            await websocket.send_json({"error": str(e)})
            await websocket.close(code=4000)
