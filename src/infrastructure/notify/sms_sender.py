import logging

logger = logging.getLogger(__name__)


class SmsSender:
    """Stub — logs the code instead of sending a real SMS (no provider chosen
    yet). Swap the body of send_code() for a real provider's HTTP call
    (SMSC.ru, SMS Aero, ...) when one is picked; callers only depend on
    send_code(phone, code), so nothing else needs to change."""

    async def send_code(self, to: str, code: str) -> None:
        logger.warning("[SmsSender STUB] verification code for %s: %s", to, code)
