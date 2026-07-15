from datetime import date
from uuid import UUID

from src.infrastructure.tasks.broker import task_broker


@task_broker.task
async def generate_weekly_summary_task(companion_id: str, user_id: str, week_start: str) -> None:
    """
    Fanned out per-companion by the nightly compress_weekly_memories_task cron
    (src/infrastructure/tasks/memory_compression.py).
    """
    from src.infrastructure.db.repositories.memory import (
        DailySummaryRepository,
        MemoryEmbeddingRepository,
        WeeklySummaryRepository,
    )
    from src.infrastructure.db.repositories.user import UserKeyRepository
    from src.application.memory.generate_weekly_summary import GenerateWeeklySummary
    from src.infrastructure.tasks.worker_context import claude, crypto, session_factory

    async with session_factory() as session:
        key_repo = UserKeyRepository(session)
        daily_repo = DailySummaryRepository(session)
        weekly_repo = WeeklySummaryRepository(session)
        embedding_repo = MemoryEmbeddingRepository(session)

        user_key = await key_repo.get_by_user_id(UUID(user_id))
        if not user_key or not user_key.server_wrapped_key:
            return
        try:
            raw_key = crypto.decrypt_user_key(user_key.server_wrapped_key)
        except Exception:
            return

        use_case = GenerateWeeklySummary(daily_repo, weekly_repo, embedding_repo, claude, crypto)
        await use_case.execute(
            companion_id=UUID(companion_id),
            week_start=date.fromisoformat(week_start),
            raw_key=raw_key,
        )
        await session.commit()
