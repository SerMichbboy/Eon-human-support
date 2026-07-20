import secrets

from redis.asyncio import Redis

from src.main.settings import Settings

_CODE_PREFIX = "verify_code:"
_COOLDOWN_PREFIX = "verify_cooldown:"
_RATE_PREFIX = "verify_rl:"


class VerificationCodeService:
    """4-digit codes cached in Redis, not the DB — they're short-lived and
    high-churn, exactly what Redis TTLs are for. A separate cooldown key
    throttles /resend-code independently of the code's own expiry, so a user
    can't spam the send button and rack up SMS costs."""

    def __init__(self, redis: Redis, settings: Settings) -> None:
        self._redis = redis
        self._ttl = settings.verification_code_ttl_seconds
        self._cooldown = settings.verification_resend_cooldown_seconds

    async def can_send(self, identifier: str) -> bool:
        return not await self._redis.exists(_COOLDOWN_PREFIX + identifier)

    async def within_rate_limit(self, scope: str, key: str, limit: int, window: int) -> bool:
        """Fixed-window counter: at most ``limit`` sends per ``window`` seconds
        for a given (scope, key), e.g. per-identifier or per-IP. Returns False
        once the limit is exceeded. Separate from ``can_send`` — that's a short
        per-send cooldown; this caps the total over a longer abuse window."""
        bucket = f"{_RATE_PREFIX}{scope}:{key}"
        count = await self._redis.incr(bucket)
        if count == 1:
            await self._redis.expire(bucket, window)
        return count <= limit

    async def issue(self, identifier: str) -> str:
        code = f"{secrets.randbelow(10_000):04d}"
        await self._redis.set(_CODE_PREFIX + identifier, code, ex=self._ttl)
        await self._redis.set(_COOLDOWN_PREFIX + identifier, "1", ex=self._cooldown)
        return code

    async def verify(self, identifier: str, code: str) -> bool:
        stored = await self._redis.get(_CODE_PREFIX + identifier)
        if stored is None or stored != code:
            return False
        await self._redis.delete(_CODE_PREFIX + identifier)
        return True
