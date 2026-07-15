from uuid import UUID

from src.infrastructure.tasks.broker import task_broker


@task_broker.task
async def update_profile_from_dialogue_task(companion_id: str, user_id: str, day: str) -> None:
    """
    After each day's summary is generated, re-analyse it and patch the UserProfile
    with any new facts Claude extracts (occupation change, new life event, etc.).
    """
    from src.infrastructure.db.repositories.memory import DailySummaryRepository
    from src.infrastructure.crypto.context import UserRawKey
    from src.infrastructure.db.repositories.profile import UserProfileRepository
    from src.infrastructure.db.repositories.user import UserKeyRepository
    from src.application.onboarding.save_profile_step import ProfileStepData, SaveProfileStep
    from src.infrastructure.tasks.worker_context import claude, crypto, session_factory
    from datetime import date

    async with session_factory() as session:
        key_repo = UserKeyRepository(session)
        daily_repo = DailySummaryRepository(session)

        user_key = await key_repo.get_by_user_id(UUID(user_id))
        if not user_key or not user_key.server_wrapped_key:
            return
        try:
            raw_key = crypto.decrypt_user_key(user_key.server_wrapped_key)
        except Exception:
            return

        summary = await daily_repo.get_by_companion_and_date(
            UUID(companion_id), date.fromisoformat(day)
        )
        if not summary:
            return

        summary_text = crypto.decrypt_field(summary.summary, raw_key)

        raw = await claude.extract_facts(summary_text, step="daily_review")
        step_data = ProfileStepData(
            basic_info=raw.get("basic_info"),
            life_context=raw.get("life_context"),
            positive_moments=raw.get("positive_moments"),
            struggles=raw.get("struggles"),
            key_events=raw.get("key_events"),
            companion_preferences=raw.get("companion_preferences"),
        )

        profile_repo = UserProfileRepository(session, crypto, UserRawKey(raw_key))
        save = SaveProfileStep(profile_repo)
        await save.execute(UUID(user_id), step_data)
        await session.commit()
