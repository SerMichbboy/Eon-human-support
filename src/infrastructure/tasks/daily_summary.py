from datetime import date
from uuid import UUID

from src.infrastructure.tasks.broker import task_broker


@task_broker.task
async def generate_daily_summary_task(companion_id: str, user_id: str, day: str) -> None:
    """
    Triggered after a message is saved.
    Resolves dependencies manually since TaskIQ workers run outside the FastAPI DI scope.
    """
    from src.main.settings import Settings
    from src.infrastructure.db.engine import build_session_factory
    from src.infrastructure.crypto.aes import CryptoService
    from src.infrastructure.claude.client import ClaudeClient
    from src.infrastructure.db.repositories.memory import (
        DailySummaryRepository,
        MessageRepository,
    )
    from src.infrastructure.db.repositories.user import UserKeyRepository
    from src.application.memory.generate_daily_summary import GenerateDailySummary

    settings = Settings()
    session_factory = build_session_factory(settings)
    crypto = CryptoService(settings)
    claude = ClaudeClient(settings)

    async with session_factory() as session:
        key_repo = UserKeyRepository(session)
        message_repo = MessageRepository(session)
        daily_repo = DailySummaryRepository(session)

        user_key = await key_repo.get_by_id(UUID(user_id))
        if not user_key:
            return
        try:
            raw_key = crypto.decrypt_user_key(user_key.encrypted_key)
        except Exception:
            # E2E keys are client-encrypted; background tasks cannot decrypt them.
            # Daily summary compression is skipped for E2E users.
            return

        use_case = GenerateDailySummary(message_repo, daily_repo, claude, crypto)
        await use_case.execute(
            companion_id=UUID(companion_id),
            day=date.fromisoformat(day),
            raw_key=raw_key,
        )
        await session.commit()
