from typing import Annotated

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.auth.login import InvalidCredentialsError, LoginByEmail, LoginByPhone, RefreshToken
from src.application.auth.register import EmailAlreadyExistsError, PhoneAlreadyExistsError, RegisterByEmail, RegisterByPhone
from src.domain.companion.repository import ICompanionRepository
from src.domain.profile.repository import IUserProfileRepository
from src.domain.user.repository import IUserKeyRepository, IUserRepository
from src.presentation.schemas.auth import (
    LoginEmailRequest, LoginPhoneRequest, RefreshTokenRequest,
    RegisterEmailRequest, RegisterPhoneRequest, RegisterResponse, TokenResponse,
)
from src.main.settings import Settings

router = APIRouter()


@router.post("/register/email", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@inject
async def register_email(
    body: RegisterEmailRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    key_repo: Annotated[IUserKeyRepository, FromDishka()],
    companion_repo: Annotated[ICompanionRepository, FromDishka()],
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
):
    try:
        result = await RegisterByEmail(user_repo, key_repo, companion_repo, profile_repo).execute(
            body.email, body.password, body.key_salt, body.encrypted_key
        )
        await session.commit()
    except EmailAlreadyExistsError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    return RegisterResponse(user_id=result.user_id)


@router.post("/register/phone", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@inject
async def register_phone(
    body: RegisterPhoneRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    key_repo: Annotated[IUserKeyRepository, FromDishka()],
    companion_repo: Annotated[ICompanionRepository, FromDishka()],
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
):
    try:
        result = await RegisterByPhone(user_repo, key_repo, companion_repo, profile_repo).execute(
            body.phone, body.password, body.key_salt, body.encrypted_key
        )
        await session.commit()
    except PhoneAlreadyExistsError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already registered")
    return RegisterResponse(user_id=result.user_id)


@router.post("/login/email", response_model=TokenResponse)
@inject
async def login_email(
    body: LoginEmailRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    key_repo: Annotated[IUserKeyRepository, FromDishka()],
    settings: Annotated[Settings, FromDishka()],
):
    try:
        tokens = await LoginByEmail(user_repo, key_repo, settings).execute(body.email, body.password)
    except InvalidCredentialsError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        key_salt=tokens.key_salt,
        encrypted_key=tokens.encrypted_key,
    )


@router.post("/login/phone", response_model=TokenResponse)
@inject
async def login_phone(
    body: LoginPhoneRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    key_repo: Annotated[IUserKeyRepository, FromDishka()],
    settings: Annotated[Settings, FromDishka()],
):
    try:
        tokens = await LoginByPhone(user_repo, key_repo, settings).execute(body.phone, body.password)
    except InvalidCredentialsError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        key_salt=tokens.key_salt,
        encrypted_key=tokens.encrypted_key,
    )


@router.post("/refresh", response_model=TokenResponse)
@inject
async def refresh(
    body: RefreshTokenRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    settings: Annotated[Settings, FromDishka()],
):
    try:
        tokens = await RefreshToken(user_repo, settings).execute(body.refresh_token)
    except InvalidCredentialsError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return TokenResponse(access_token=tokens.access_token, refresh_token=tokens.refresh_token)
