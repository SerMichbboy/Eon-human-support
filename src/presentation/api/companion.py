from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.companion.repository import ICompanionRepository
from src.presentation.deps import get_current_user_id

router = APIRouter()


class CompanionOut(BaseModel):
    name: str


class RenameIn(BaseModel):
    name: str


@router.get("/", response_model=CompanionOut)
@inject
async def get_companion(
    companion_repo: Annotated[ICompanionRepository, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    companion = await companion_repo.get_by_user_id(user_id)
    if not companion:
        raise HTTPException(404, "Companion not found")
    return CompanionOut(name=companion.name)


@router.patch("/name", response_model=CompanionOut)
@inject
async def rename_companion(
    body: RenameIn,
    companion_repo: Annotated[ICompanionRepository, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    companion = await companion_repo.get_by_user_id(user_id)
    if not companion:
        raise HTTPException(404, "Companion not found")
    companion.name = name
    await companion_repo.save(companion)
    await session.commit()
    return CompanionOut(name=companion.name)
