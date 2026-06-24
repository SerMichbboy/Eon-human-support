from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from src.domain.companion.repository import ICompanionRepository
from src.domain.memory.repository import IMessageRepository
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.crypto.context import UserRawKey
from src.presentation.deps import get_current_user_id

router = APIRouter()


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


@router.get("/", response_model=list[MessageOut])
@inject
async def get_recent_messages(
    companion_repo: Annotated[ICompanionRepository, FromDishka()],
    message_repo: Annotated[IMessageRepository, FromDishka()],
    crypto: Annotated[CryptoService, FromDishka()],
    user_raw_key: Annotated[UserRawKey, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
    limit: int = Query(default=30, le=100),
    before_id: str | None = Query(default=None),
):
    companion = await companion_repo.get_by_user_id(user_id)
    if not companion:
        return []

    before_uuid = UUID(before_id) if before_id else None
    messages = await message_repo.get_recent(companion.id, limit=limit, before_id=before_uuid)
    if not messages:
        return []

    raw_key = user_raw_key.value
    result = []
    for m in messages:
        content = m.content
        if raw_key:
            try:
                content = crypto.decrypt_field(content, raw_key)
            except Exception:
                pass
        result.append(MessageOut(
            id=str(m.id),
            role=m.role.value,
            content=content,
            created_at=m.created_at.isoformat(),
        ))

    return result
