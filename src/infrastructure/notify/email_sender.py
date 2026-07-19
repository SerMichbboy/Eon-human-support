import asyncio
import logging
import smtplib
from email.mime.text import MIMEText

from src.main.settings import Settings

logger = logging.getLogger(__name__)


class EmailSender:
    """Plain SMTP — works with any provider (Gmail, Yandex, a corporate relay,
    a transactional service's SMTP endpoint, ...) via .env credentials, no
    vendor lock-in. Falls back to logging the code when SMTP isn't configured,
    same stub convention as ClaudeClient when its API key is a placeholder."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._stub = not settings.smtp_host

    async def send_code(self, to: str, code: str) -> None:
        if self._stub:
            logger.warning("[EmailSender STUB] verification code for %s: %s", to, code)
            return
        await asyncio.to_thread(self._send_sync, to, code)

    def _send_sync(self, to: str, code: str) -> None:
        s = self._settings
        msg = MIMEText(f"Код подтверждения: {code}\nОн действует {s.verification_code_ttl_seconds // 60} минуты.")
        msg["Subject"] = "Код подтверждения Eon"
        msg["From"] = s.smtp_from or s.smtp_user
        msg["To"] = to

        with smtplib.SMTP(s.smtp_host, s.smtp_port) as server:
            server.starttls()
            if s.smtp_user:
                server.login(s.smtp_user, s.smtp_password)
            server.send_message(msg)
