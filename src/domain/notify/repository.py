from abc import ABC, abstractmethod


class IEmailSuppressionRepository(ABC):
    """Addresses that must never be emailed again — those that hard-bounced or
    filed a spam complaint (fed in by the Resend webhook). Continuing to send to
    them tanks the sending domain's reputation and can get the account blocked."""

    @abstractmethod
    async def is_suppressed(self, email: str) -> bool: ...

    @abstractmethod
    async def suppress(self, email: str, reason: str) -> None:
        """Idempotently mark ``email`` as suppressed. ``reason`` is a short tag
        such as ``"bounced"`` or ``"complained"``."""
        ...
