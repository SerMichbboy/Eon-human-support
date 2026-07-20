from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Depends

from src.application.push.register import RegisterPushToken
from src.domain.push.repository import IPushTokenRepository
from src.presentation.deps import get_current_user_id
from src.presentation.schemas.push import RegisterPushTokenRequest

router = APIRouter()


@router.post("/register")
@inject
async def register(
    body: RegisterPushTokenRequest,
    repo: Annotated[IPushTokenRepository, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    await RegisterPushToken(repo).execute(user_id, body.token)
    return {"ok": True}
