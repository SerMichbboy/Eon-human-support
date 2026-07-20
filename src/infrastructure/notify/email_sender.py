import asyncio
import logging
import smtplib
from email.mime.text import MIMEText

import httpx

from src.main.settings import Settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """A provider rejected an email send. Callers get this instead of a raw
    httpx object / SMTP error, so nothing leaks the transport (or, worse, the
    email body) up the stack."""


def _mask(address: str) -> str:
    """Log-safe recipient: keep the first char and the domain, hide the rest of
    the local part. We never log the full address of a verification email."""
    local, sep, domain = address.partition("@")
    if not sep:
        return "***"
    return f"{local[:1]}***@{domain}"


class EmailSender:
    """Port for one-time-code email delivery. Concrete implementations:
    ``ResendEmailSender`` (HTTP API, production) and ``SmtpEmailSender`` (plain
    SMTP, or a logging stub when SMTP isn't configured). Callers depend only on
    ``send_code(to, code)`` — see ``SendVerificationCode``."""

    async def send_code(self, to: str, code: str) -> None:  # pragma: no cover
        raise NotImplementedError


class ResendEmailSender(EmailSender):
    """Sends verification codes through Resend's HTTP API
    (https://resend.com/docs/api-reference/emails/send-email).

    The ``from`` address is built on the SPF/DKIM-verified sending domain — a
    mismatched domain would fail authentication and land the mail in spam. The
    code is put in the *subject* (so it's visible in a push preview without
    opening the mail) as well as the plain-text body. No HTML, images, tracking
    pixels or links — a bare code mail has the best deliverability and nothing
    to leak.
    """

    _ENDPOINT = "https://api.resend.com/emails"

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._api_key = settings.resend_api_key
        self._sender = (
            f"{settings.resend_from_name} "
            f"<{settings.resend_from_local}@{settings.resend_email_domain}>"
        )
        self._timeout = settings.resend_timeout_seconds
        self._ttl_minutes = max(1, settings.verification_code_ttl_seconds // 60)
        # Injectable client is for tests (MockTransport). In production we open a
        # short-lived client per send — OTP volume is tiny (Resend free tier caps
        # at 100/day) so there's nothing to gain from pooling, and it sidesteps
        # any client-lifecycle coupling to the DI container's shutdown.
        self._client = client

    async def send_code(self, to: str, code: str) -> None:
        payload = {
            "from": self._sender,
            "to": to,
            "subject": f"{code} — код для входа",
            "text": (
                f"Ваш код для входа: {code}\n\n"
                f"Код действует {self._ttl_minutes} мин. Если вы не запрашивали "
                "вход — просто проигнорируйте это письмо."
            ),
        }
        try:
            resp = await self._post(payload)
        except httpx.ConnectError:
            # The connection never got established, so nothing was sent — a single
            # retry here cannot duplicate the code. We deliberately do NOT retry
            # once any response (or a post-connect timeout) has occurred, since
            # the send may already have gone through and a retry would email a
            # second, conflicting code.
            logger.warning("Resend connect error to %s, retrying once", _mask(to))
            try:
                resp = await self._post(payload)
            except httpx.ConnectError as retry_exc:
                raise EmailDeliveryError("Resend unreachable") from retry_exc
        except httpx.HTTPError as exc:
            raise EmailDeliveryError("Resend request failed") from exc

        if resp.status_code >= 400:
            # Log status only — never the body (may echo recipient/content) or key.
            logger.error("Resend rejected send to %s: HTTP %s", _mask(to), resp.status_code)
            raise EmailDeliveryError(f"Resend returned HTTP {resp.status_code}")

        email_id = None
        try:
            email_id = resp.json().get("id")
        except (ValueError, AttributeError):
            pass
        logger.info("Verification email sent to %s (resend id=%s)", _mask(to), email_id)

    async def _post(self, payload: dict) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._client is not None:
            return await self._client.post(self._ENDPOINT, headers=headers, json=payload)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.post(self._ENDPOINT, headers=headers, json=payload)


class SmtpEmailSender(EmailSender):
    """Plain SMTP — works with any provider (Gmail, Yandex, a corporate relay,
    a transactional service's SMTP endpoint, ...) via .env credentials, no
    vendor lock-in. Falls back to logging the code when SMTP isn't configured,
    same stub convention as VsegptClient when its API key is a placeholder.
    Kept as the fallback for when RESEND_API_KEY isn't set."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._stub = not settings.smtp_host

    async def send_code(self, to: str, code: str) -> None:
        if self._stub:
            logger.warning("[SmtpEmailSender STUB] verification code for %s: %s", _mask(to), code)
            return
        await asyncio.to_thread(self._send_sync, to, code)

    def _send_sync(self, to: str, code: str) -> None:
        s = self._settings
        minutes = s.verification_code_ttl_seconds // 60
        msg = MIMEText(f"Код подтверждения: {code}\nОн действует {minutes} минуты.")
        msg["Subject"] = "Код подтверждения Eon"
        msg["From"] = s.smtp_from or s.smtp_user
        msg["To"] = to

        with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
            server.starttls()
            if s.smtp_user:
                server.login(s.smtp_user, s.smtp_password)
            server.send_message(msg)
