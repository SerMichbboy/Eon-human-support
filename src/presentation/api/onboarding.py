from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.onboarding.extract_facts import ExtractFactsFromText, ExtractFactsFromVoice
from src.application.onboarding.save_profile_step import ProfileStepData, SaveProfileStep
from src.domain.profile.repository import IUserProfileRepository
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.stt.whisper import WhisperSTT
from src.presentation.deps import get_current_user_id
from src.presentation.schemas.onboarding import ExtractFactsResponse, ProfileStepRequest, TextStepRequest

router = APIRouter()


@router.post("/step")
@inject
async def save_step(
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
    return {"status": "saved"}


@router.post("/text-step", response_model=ExtractFactsResponse)
@inject
async def text_step(
    body: TextStepRequest,
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    claude: Annotated[ClaudeClient, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    """
    For free-text onboarding answers (typed or dictated-then-edited). One broad
    question ("расскажи о себе") can touch several profile fields at once
    (occupation, family_status, close_people, values, ...) — this splits the
    answer across them via the LLM instead of the caller guessing a single field.
    Not used for the companion_preferences step, which is a discrete pick from a
    fixed list, not free text — that one still goes through /step directly.
    """
    import dataclasses
    step_data, needs_confirmation = await ExtractFactsFromText(claude).execute(body.text, body.step)

    if not needs_confirmation:
        await SaveProfileStep(profile_repo).execute(user_id, step_data)
        await session.commit()

    return ExtractFactsResponse(
        step_data={k: v for k, v in dataclasses.asdict(step_data).items() if v is not None},
        needs_confirmation=needs_confirmation,
        transcript=body.text,
    )


@router.post("/voice-step", response_model=ExtractFactsResponse)
@inject
async def voice_step(
    step: str,
    audio: UploadFile,
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    stt: Annotated[WhisperSTT, FromDishka()],
    claude: Annotated[ClaudeClient, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
    user_id: UUID = Depends(get_current_user_id),
):
    import dataclasses
    audio_bytes = await audio.read()
    step_data, needs_confirmation = await ExtractFactsFromVoice(stt, claude).execute(audio_bytes, step)

    if not needs_confirmation:
        await SaveProfileStep(profile_repo).execute(user_id, step_data)
        await session.commit()

    return ExtractFactsResponse(
        step_data={k: v for k, v in dataclasses.asdict(step_data).items() if v is not None},
        needs_confirmation=needs_confirmation,
        transcript="",
    )
