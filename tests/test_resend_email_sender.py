import json

import httpx
import pytest

from src.infrastructure.notify.email_sender import EmailDeliveryError, ResendEmailSender, _mask
from src.main.settings import Settings


def _settings(**overrides) -> Settings:
    """A Settings instance without running validation (so it needs no DB/secret
    env vars, and doesn't try to read the resend_key file)."""
    fields = dict(
        resend_api_key="re_test_key",
        resend_email_domain="auth.qseawd.ru",
        resend_from_local="noreply",
        resend_from_name="Eon",
        resend_timeout_seconds=10.0,
        verification_code_ttl_seconds=120,
    )
    fields.update(overrides)
    return Settings.model_construct(**fields)


def _sender(handler) -> tuple[ResendEmailSender, httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return ResendEmailSender(_settings(), client=client), client


async def test_send_code_builds_correct_request():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "email_abc123"})

    sender, client = _sender(handler)
    try:
        await sender.send_code("user@example.com", "4821")
    finally:
        await client.aclose()

    assert captured["method"] == "POST"
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["auth"] == "Bearer re_test_key"

    body = captured["body"]
    # From must be on the verified sending domain, or SPF/DKIM won't line up.
    assert body["from"] == "Eon <noreply@auth.qseawd.ru>"
    assert body["to"] == "user@example.com"
    # Code visible in the subject (push preview) and in the plain-text body.
    assert "4821" in body["subject"]
    assert "4821" in body["text"]
    # No tracking / HTML / links smuggled in.
    assert "html" not in body
    assert "http" not in body["text"].lower()


async def test_resend_error_maps_to_domain_exception():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"message": "invalid from address"})

    sender, client = _sender(handler)
    try:
        with pytest.raises(EmailDeliveryError):
            await sender.send_code("user@example.com", "0001")
    finally:
        await client.aclose()


async def test_connect_error_is_wrapped_not_leaked():
    # A pre-send connection failure is wrapped in the domain exception. It also
    # exercises the single idempotent retry (the handler always fails, so we end
    # up raising EmailDeliveryError rather than a raw httpx error).
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    sender, client = _sender(handler)
    try:
        with pytest.raises(EmailDeliveryError):
            await sender.send_code("user@example.com", "1234")
    finally:
        await client.aclose()


def test_mask_hides_local_part():
    assert _mask("someone@example.com") == "s***@example.com"
    assert _mask("not-an-email") == "***"
