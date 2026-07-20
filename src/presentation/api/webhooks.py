import logging
from typing import Annotated

from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from svix.webhooks import Webhook, WebhookVerificationError

from src.domain.notify.repository import IEmailSuppressionRepository
from src.main.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Resend event type -> the short reason tag we store for the suppressed address.
_SUPPRESS_EVENTS = {
    "email.bounced": "bounced",
    "email.complained": "complained",
}


@router.post("/resend")
@inject
async def resend_webhook(
    request: Request,
    suppression_repo: Annotated[IEmailSuppressionRepository, FromDishka()],
    settings: Annotated[Settings, FromDishka()],
    session: Annotated[AsyncSession, FromDishka()],
):
    """Resend delivery events (Svix-signed). We suppress hard-bounced and
    complained addresses so we stop mailing them. Every request must carry a
    valid Svix signature or it's rejected — this endpoint mutates the
    suppression list, so an unauthenticated caller could otherwise block any
    address at will."""
    if not settings.resend_webhook_secret:
        # No secret configured means we can't verify anything — refuse rather
        # than trust unsigned input.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook not configured"
        )

    body = await request.body()
    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    try:
        event = Webhook(settings.resend_webhook_secret).verify(body, headers)
    except WebhookVerificationError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    reason = _SUPPRESS_EVENTS.get(event.get("type"))
    if reason is None:
        return {"status": "ignored"}

    data = event.get("data") or {}
    recipients = data.get("to") or []
    if isinstance(recipients, str):
        recipients = [recipients]

    for address in recipients:
        if address:
            await suppression_repo.suppress(address, reason)
    await session.commit()

    logger.info("Resend webhook '%s' suppressed %d address(es)", event.get("type"), len(recipients))
    return {"status": "ok"}
