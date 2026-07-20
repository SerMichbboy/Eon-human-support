from typing import Annotated

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.auth.identifier import InvalidIdentifierError
from src.application.auth.login import (
    InvalidCredentialsError, LoginByEmail, LoginByPhone, LoginUser, RefreshToken, UserNotVerifiedError,
)
from src.application.auth.register import (
    EmailAlreadyExistsError, PhoneAlreadyExistsError, RegisterByEmail, RegisterByPhone, RegisterUser,
)
from src.application.auth.verify import (
    InvalidCodeError, ResendTooSoonError, SendVerificationCode, VerifyIdentifier,
)
from src.domain.companion.repository import ICompanionRepository
from src.domain.profile.repository import IUserProfileRepository
from src.domain.user.repository import IUserKeyRepository, IUserRepository
from src.infrastructure.notify.email_sender import EmailSender
from src.infrastructure.notify.sms_sender import SmsSender
from src.infrastructure.verification.code_service import VerificationCodeService
from src.presentation.schemas.auth import (
    LoginRequest, RefreshTokenRequest, RegisterRequest, RegisterResponse,
    ResendCodeRequest, TokenResponse, VerifyCodeRequest,
)
from src.main.settings import Settings

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@inject
async def register(
    body: RegisterRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    key_repo: Annotated[IUserKeyRepository, FromDishka()],
    companion_repo: Annotated[ICompanionRepository, FromDishka()],
    profile_repo: Annotated[IUserProfileRepository, FromDishka()],
    code_service: Annotated[VerificationCodeService, FromDishka()],
    email_sender: Annotated[EmailSender, FromDishka()],
    sms_sender: Annotated[SmsSender, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
):
    register_by_email = RegisterByEmail(user_repo, key_repo, companion_repo, profile_repo)
    register_by_phone = RegisterByPhone(user_repo, key_repo, companion_repo, profile_repo)
    try:
        result, _kind, normalized = await RegisterUser(register_by_email, register_by_phone).execute(
            body.identifier, body.password, body.key_salt, body.encrypted_key, body.pbkdf2_c
        )
        await session.commit()
    except InvalidIdentifierError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email or phone number")
    except EmailAlreadyExistsError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    except PhoneAlreadyExistsError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already registered")

    # Account exists even if sending the code hiccups — SendVerificationCode
    # swallows notify failures so registration itself doesn't 500 over it.
    await SendVerificationCode(code_service, email_sender, sms_sender).execute(
        normalized, enforce_cooldown=False
    )
    return RegisterResponse(user_id=result.user_id)


@router.post("/verify")
@inject
async def verify(
    body: VerifyCodeRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    code_service: Annotated[VerificationCodeService, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
):
    try:
        await VerifyIdentifier(user_repo, code_service).execute(body.identifier, body.code)
        await session.commit()
    except InvalidIdentifierError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email or phone number")
    except InvalidCodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")
    return {"status": "verified"}


@router.post("/resend-code")
@inject
async def resend_code(
    body: ResendCodeRequest,
    code_service: Annotated[VerificationCodeService, FromDishka()],
    email_sender: Annotated[EmailSender, FromDishka()],
    sms_sender: Annotated[SmsSender, FromDishka()],
):
    try:
        await SendVerificationCode(code_service, email_sender, sms_sender).execute(body.identifier)
    except InvalidIdentifierError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email or phone number")
    except ResendTooSoonError:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Code already sent, try again shortly")
    return {"status": "sent"}


@router.post("/login", response_model=TokenResponse)
@inject
async def login(
    body: LoginRequest,
    user_repo: Annotated[IUserRepository, FromDishka()],
    key_repo: Annotated[IUserKeyRepository, FromDishka()],
    settings: Annotated[Settings, FromDishka()],
):
    login_by_email = LoginByEmail(user_repo, key_repo, settings)
    login_by_phone = LoginByPhone(user_repo, key_repo, settings)
    try:
        tokens = await LoginUser(login_by_email, login_by_phone).execute(body.identifier, body.password)
    except InvalidIdentifierError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email or phone number")
    except InvalidCredentialsError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    except UserNotVerifiedError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account not verified")
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        key_salt=tokens.key_salt,
        encrypted_key=tokens.encrypted_key,
        pbkdf2_c=tokens.pbkdf2_c,
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
