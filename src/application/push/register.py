from uuid import UUID

from src.domain.push.repository import IPushTokenRepository


class RegisterPushToken:
    def __init__(self, repo: IPushTokenRepository) -> None:
        self._repo = repo

    async def execute(self, user_id: UUID, token: str) -> None:
        await self._repo.upsert(user_id, token)
