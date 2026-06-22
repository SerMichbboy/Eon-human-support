import dataclasses
from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.onboarding.save_profile_step import ProfileStepData, SaveProfileStep
from src.domain.profile.repository import IUserProfileRepository
from src.presentation.deps import get_current_user_id
from src.presentation.schemas.onboarding import ProfileStepRequest
from src.presentation.schemas.profile import (
    BasicInfoSchema, CompanionPreferencesSchema, KeyEventSchema,
    LifeContextSchema, PositiveMomentsSchema, ProfileResponse, StrugglesSchema,
)

router = APIRouter()


def _to_response(profile) -> ProfileResponse:
    return ProfileResponse(
        basic_info=BasicInfoSchema(**dataclasses.asdict(profile.basic_info)),
        life_context=LifeContextSchema(**dataclasses.asdict(profile.life_context)),
        positive_moments=PositiveMomentsSchema(**dataclasses.asdict(profile.positive_moments)),
        struggles=StrugglesSchema(**dataclasses.asdict(profile.struggles)),
        key_events=[KeyEventSchema(**dataclasses.asdict(e)) for e in profile.key_events],
        companion_preferences=CompanionPreferencesSchema(**dataclasses.asdict(profile.companion_preferences)),
    )


@router.get("/", response_model=ProfileResponse)
@inject
async def get_profile(
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    profile = await profile_repo.get_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return _to_response(profile)


@router.patch("/", response_model=ProfileResponse)
@inject
async def update_profile(
    body: ProfileStepRequest,
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    await SaveProfileStep(profile_repo).execute(
        user_id,
        ProfileStepData(
            basic_info=body.basic_info,
            life_context=body.life_context,
            positive_moments=body.positive_moments,
            struggles=body.struggles,
            key_events=body.key_events,
            companion_preferences=body.companion_preferences,
        ),
    )
    await session.commit()
    profile = await profile_repo.get_by_user_id(user_id)
    return _to_response(profile)
