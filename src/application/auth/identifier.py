import re
from enum import StrEnum

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+\d{7,15}$")
_PHONE_FORMATTING_RE = re.compile(r"[\s\-()]")


class IdentifierType(StrEnum):
    EMAIL = "email"
    PHONE = "phone"


class InvalidIdentifierError(Exception):
    pass


def classify_identifier(raw: str) -> tuple[IdentifierType, str]:
    """One login/register field, server decides whether it's an email or a
    phone number. Returns (type, normalized_value) — email lowercased, phone
    stripped of spaces/dashes/parens with a leading '+' enforced (E.164)."""
    value = raw.strip()
    if not value:
        raise InvalidIdentifierError(raw)

    if "@" in value:
        if not _EMAIL_RE.match(value):
            raise InvalidIdentifierError(raw)
        return IdentifierType.EMAIL, value.lower()

    digits = _PHONE_FORMATTING_RE.sub("", value)
    if not digits.startswith("+"):
        digits = "+" + digits.lstrip("+")
    if not _PHONE_RE.match(digits):
        raise InvalidIdentifierError(raw)
    return IdentifierType.PHONE, digits
