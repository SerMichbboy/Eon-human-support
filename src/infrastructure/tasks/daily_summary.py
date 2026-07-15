from datetime import date
from uuid import UUID

from src.infrastructure.tasks.broker import task_broker


@task_broker.task
async def generate_daily_summary_task(companion_id: str, user_id: str, day: str) -> None:
    """
    Fanned out per-companion by the nightly compress_daily_memories_task cron
    (src/infrastructure/tasks/memory_compression.py).
    Resolves dependencies manually since TaskIQ workers run outside the FastAPI DI scope.
    """
    from src.infrastructure.db.repositories.memory import (
        DailySummaryRepository,
        MemoryEmbeddingRepository,
        MessageRepository,
    )
    from src.infrastructure.db.repositories.user import UserKeyRepository
    from src.application.memory.generate_daily_summary import GenerateDailySummary
    from src.infrastructure.tasks.update_profile import update_profile_from_dialogue_task
    from src.infrastructure.tasks.worker_context import claude, crypto, session_factory

    async with session_factory() as session:
        key_repo = UserKeyRepository(session)
        message_repo = MessageRepository(session)
        daily_repo = DailySummaryRepository(session)
        embedding_repo = MemoryEmbeddingRepository(session)

        user_key = await key_repo.get_by_user_id(UUID(user_id))
        if not user_key or not user_key.server_wrapped_key:
            # Server hasn't captured this user's key yet (no chat connection since
            # this field shipped) — compression will pick them up once it has.
            return
        try:
            raw_key = crypto.decrypt_user_key(user_key.server_wrapped_key)
        except Exception:
            return

        use_case = GenerateDailySummary(message_repo, daily_repo, embedding_repo, claude, crypto)
        await use_case.execute(
            companion_id=UUID(companion_id),
            day=date.fromisoformat(day),
            raw_key=raw_key,
        )
        await session.commit()

    await update_profile_from_dialogue_task.kiq(
        companion_id=companion_id, user_id=user_id, day=day
    )
