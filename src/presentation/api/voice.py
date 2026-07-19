from typing import Annotated
from uuid import UUID

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import Response

from src.application.voice.synthesize import SynthesizeSpeech
from src.application.voice.transcribe import TranscribeAudio
from src.infrastructure.stt.whisper import WhisperSTT
from src.infrastructure.tts.vsegpt import VsegptTTS
from src.presentation.deps import get_current_user_id

router = APIRouter()


@router.post("/transcribe")
@inject
async def transcribe(
    audio: UploadFile,
    stt: Annotated[WhisperSTT, FromDishka()],
    _: UUID = Depends(get_current_user_id),
):
    audio_bytes = await audio.read()
    text = await TranscribeAudio(stt).execute(audio_bytes)
    return {"text": text}


@router.post("/synthesize")
@inject
async def synthesize(
    text: str,
    tts: Annotated[VsegptTTS, FromDishka()],
    _: UUID = Depends(get_current_user_id),
):
    audio_bytes = await SynthesizeSpeech(tts).execute(text)
    return Response(content=audio_bytes, media_type="audio/mpeg")
