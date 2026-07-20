import logging

from src.application.auth.identifier import IdentifierType, classify_identifier
from src.domain.notify.repository import IEmailSuppressionRepository
from src.domain.user.repository import IUserRepository
from src.infrastructure.notify.email_sender import EmailSender
from src.infrastructure.notify.sms_sender import SmsSender
from src.infrastructure.verification.code_service import VerificationCodeService
from src.main.settings import Settings

logger = logging.getLogger(__name__)


class InvalidCodeError(Exception):
    pass


class ResendTooSoonError(Exception):
    pass


class RateLimitedError(Exception):
    """Too many code sends for this identifier or IP within the abuse window."""


class SendVerificationCode:
    def __init__(
        self,
        code_service: VerificationCodeService,
        email_sender: EmailSender,
        sms_sender: SmsSender,
        settings: Settings,
        suppression_repo: IEmailSuppressionRepository,
    ) -> None:
        self._codes = code_service
        self._email = email_sender
        self._sms = sms_sender
        self._settings = settings
        self._suppression = suppression_repo

    async def execute(
        self, identifier: str, *, ip: str | None = None, enforce_cooldown: bool = True
    ) -> None:
        kind, normalized = classify_identifier(identifier)
        s = self._settings

        # Short per-send cooldown first (no counter increment), then the longer
        # windowed abuse limits — so the windows count real send attempts rather
        # than requests that never got past the cooldown.
        if enforce_cooldown and not await self._codes.can_send(normalized):
            raise ResendTooSoonError
        if not await self._codes.within_rate_limit(
            "id",
            normalized,
            s.verification_max_per_identifier,
            s.verification_identifier_window_seconds,
        ):
            raise RateLimitedError
        if ip and not await self._codes.within_rate_limit(
            "ip", ip, s.verification_max_per_ip, s.verification_ip_window_seconds
        ):
            raise RateLimitedError

        # A hard-bounced / complained address is dead — don't keep mailing it (it
        # would only hurt the sending domain's reputation). The account still
        # exists; the user just can't verify via that address.
        if kind == IdentifierType.EMAIL and await self._suppression.is_suppressed(normalized):
            logger.warning("skipping verification email to suppressed address")
            return

        code = await self._codes.issue(normalized)
        try:
            if kind == IdentifierType.EMAIL:
                await self._email.send_code(normalized, code)
            else:
                await self._sms.send_code(normalized, code)
        except Exception:
            # Code is already cached — the user can still get it via a retried
            # /resend-code once the send path recovers. Don't fail registration
            # over a notify hiccup; the account itself was created fine.
            logger.exception("failed to send verification code")


class VerifyIdentifier:
    def __init__(self, user_repo: IUserRepository, code_service: VerificationCodeService) -> None:
        self._users = user_repo
        self._codes = code_service

    async def execute(self, identifier: str, code: str) -> None:
        kind, normalized = classify_identifier(identifier)
        if not await self._codes.verify(normalized, code):
            raise InvalidCodeError

        user = (
            await self._users.get_by_email(normalized)
            if kind == IdentifierType.EMAIL
            else await self._users.get_by_phone(normalized)
        )
        if not user:
            raise InvalidCodeError

        if kind == IdentifierType.EMAIL:
            user.is_email_verified = True
        else:
            user.is_phone_verified = True
        await self._users.save(user)
