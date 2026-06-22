from datetime import date
from uuid import UUID

from src.infrastructure.tasks.broker import task_broker


@task_broker.task
async def generate_weekly_summary_task(companion_id: str, user_id: str, week_start: str) -> None:
    """Runs every Sunday night to aggregate daily summaries into a weekly one."""
    from src.main.settings import Settings
    from src.infrastructure.db.engine import build_session_factory
    from src.infrastructure.crypto.aes import CryptoService
    from src.infrastructure.claude.client import ClaudeClient
    from src.infrastructure.db.repositories.memory import (
        DailySummaryRepository,
        WeeklySummaryRepository,
    )
    from src.infrastructure.db.repositories.user import UserKeyRepository
    from src.application.memory.generate_weekly_summary import GenerateWeeklySummary

    settings = Settings()
    session_factory = build_session_factory(settings)
    crypto = CryptoService(settings)
    claude = ClaudeClient(settings)

    async with session_factory() as session:
        key_repo = UserKeyRepository(session)
        daily_repo = DailySummaryRepository(session)
        weekly_repo = WeeklySummaryRepository(session)

        user_key = await key_repo.get_by_id(UUID(user_id))
        if not user_key:
            return
        raw_key = crypto.decrypt_user_key(user_key.encrypted_key)

        use_case = GenerateWeeklySummary(daily_repo, weekly_repo, claude, crypto)
        await use_case.execute(
            companion_id=UUID(companion_id),
            week_start=date.fromisoformat(week_start),
            raw_key=raw_key,
        )
        await session.commit()
