import base64
from collections.abc import AsyncIterable

from dishka import Provider, Scope, from_context, make_async_container, provide
from fastapi import Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.domain.companion.repository import ICompanionRepository
from src.domain.memory.repository import (
    IDailySummaryRepository,
    IMemoryEmbeddingRepository,
    IMessageRepository,
    IWeeklySummaryRepository,
)
from src.domain.profile.repository import IUserProfileRepository
from src.domain.user.repository import IUserKeyRepository, IUserRepository
from src.infrastructure.cache.redis_client import build_redis_client
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.crypto.context import UserRawKey
from src.infrastructure.db.engine import build_session_factory
from src.infrastructure.db.repositories.companion import CompanionRepository
from src.infrastructure.db.repositories.memory import (
    DailySummaryRepository,
    MemoryEmbeddingRepository,
    MessageRepository,
    WeeklySummaryRepository,
)
from src.infrastructure.db.repositories.profile import UserProfileRepository
from src.infrastructure.db.repositories.user import UserKeyRepository, UserRepository
from src.infrastructure.notify.email_sender import EmailSender
from src.infrastructure.notify.sms_sender import SmsSender
from src.infrastructure.stt.whisper import WhisperSTT
from src.infrastructure.tts.elevenlabs import ElevenLabsTTS
from src.infrastructure.verification.code_service import VerificationCodeService
from src.main.settings import Settings


class AppProvider(Provider):
    settings = from_context(provides=Settings, scope=Scope.APP)
    request = from_context(provides=Request, scope=Scope.REQUEST)

    @provide(scope=Scope.REQUEST)
    def user_raw_key(self, request: Request) -> UserRawKey:
        header = request.headers.get("x-user-key")
        if header:
            try:
                return UserRawKey(base64.b64decode(header))
            except Exception:
                pass
        return UserRawKey(None)

    @provide(scope=Scope.APP)
    def crypto(self, settings: Settings) -> CryptoService:
        return CryptoService(settings)

    @provide(scope=Scope.APP)
    def session_factory(self, settings: Settings) -> async_sessionmaker[AsyncSession]:
        return build_session_factory(settings)

    @provide(scope=Scope.REQUEST)
    async def session(self, factory: async_sessionmaker[AsyncSession]) -> AsyncIterable[AsyncSession]:
        async with factory() as session:
            yield session

    @provide(scope=Scope.APP)
    def claude(self, settings: Settings) -> ClaudeClient:
        return ClaudeClient(settings)

    @provide(scope=Scope.APP)
    def stt(self, settings: Settings) -> WhisperSTT:
        return WhisperSTT(settings)

    @provide(scope=Scope.APP)
    def tts(self, settings: Settings) -> ElevenLabsTTS:
        return ElevenLabsTTS(settings)

    @provide(scope=Scope.APP)
    def redis_client(self, settings: Settings) -> Redis:
        return build_redis_client(settings)

    @provide(scope=Scope.APP)
    def verification_code_service(self, redis: Redis, settings: Settings) -> VerificationCodeService:
        return VerificationCodeService(redis, settings)

    @provide(scope=Scope.APP)
    def email_sender(self, settings: Settings) -> EmailSender:
        return EmailSender(settings)

    @provide(scope=Scope.APP)
    def sms_sender(self) -> SmsSender:
        return SmsSender()

    # Repositories
    user_repo = provide(UserRepository, scope=Scope.REQUEST, provides=IUserRepository)
    user_key_repo = provide(UserKeyRepository, scope=Scope.REQUEST, provides=IUserKeyRepository)
    companion_repo = provide(
        CompanionRepository, scope=Scope.REQUEST, provides=ICompanionRepository
    )
    profile_repo = provide(
        UserProfileRepository, scope=Scope.REQUEST, provides=IUserProfileRepository
    )
    message_repo = provide(MessageRepository, scope=Scope.REQUEST, provides=IMessageRepository)
    daily_summary_repo = provide(
        DailySummaryRepository, scope=Scope.REQUEST, provides=IDailySummaryRepository
    )
    weekly_summary_repo = provide(
        WeeklySummaryRepository, scope=Scope.REQUEST, provides=IWeeklySummaryRepository
    )
    embedding_repo = provide(
        MemoryEmbeddingRepository, scope=Scope.REQUEST, provides=IMemoryEmbeddingRepository
    )


def create_container(settings: Settings):
    return make_async_container(AppProvider(), context={Settings: settings})
