"""Nightly cron entry points that discover which companions need memory compression
and fan out to the per-companion tasks in daily_summary.py / weekly_summary.py.

Scheduled via TaskIQ's LabelScheduleSource (see broker.py:scheduler) — the `schedule`
label below is read by the separate `taskiq scheduler` process, not the worker.
"""
from datetime import date, timedelta

from src.infrastructure.tasks.broker import task_broker

# A day falls out of BuildContext's raw 7-day window on day 8 — that's when it's
# safe to compress it into a summary (src/application/chat/build_context.py:_ACTIVE_WINDOW_DAYS).
_DAILY_ARCHIVE_TRIGGER_DAYS = 8
# Weekly compression targets the week that just crossed the 30-day daily-archive
# threshold (src/application/chat/build_context.py:_DAILY_ARCHIVE_DAYS).
_WEEKLY_ARCHIVE_TRIGGER_DAYS = 31


@task_broker.task(schedule=[{"cron": "30 3 * * *"}])
async def compress_daily_memories_task() -> None:
    """Runs nightly at 03:30. Finds every companion with un-summarized messages
    from _DAILY_ARCHIVE_TRIGGER_DAYS ago and enqueues generate_daily_summary_task
    for each."""
    from sqlalchemy import select

    from src.infrastructure.db.models import CompanionModel
    from src.infrastructure.db.repositories.memory import DailySummaryRepository
    from src.infrastructure.tasks.daily_summary import generate_daily_summary_task
    from src.infrastructure.tasks.worker_context import session_factory

    target_day = date.today() - timedelta(days=_DAILY_ARCHIVE_TRIGGER_DAYS)

    async with session_factory() as session:
        daily_repo = DailySummaryRepository(session)
        companion_ids = await daily_repo.get_companion_ids_needing_summary(target_day)
        if not companion_ids:
            return

        result = await session.execute(
            select(CompanionModel.id, CompanionModel.user_id).where(
                CompanionModel.id.in_(companion_ids)
            )
        )
        user_id_by_companion = {row.id: row.user_id for row in result}

    for companion_id in companion_ids:
        user_id = user_id_by_companion.get(companion_id)
        if not user_id:
            continue
        await generate_daily_summary_task.kiq(
            companion_id=str(companion_id),
            user_id=str(user_id),
            day=target_day.isoformat(),
        )


@task_broker.task(schedule=[{"cron": "0 4 * * 1"}])
async def compress_weekly_memories_task() -> None:
    """Runs every Monday at 04:00. Finds every companion with daily summaries
    covering a fully-aged week and enqueues generate_weekly_summary_task for each."""
    from sqlalchemy import select

    from src.infrastructure.db.models import CompanionModel
    from src.infrastructure.db.repositories.memory import WeeklySummaryRepository
    from src.infrastructure.tasks.weekly_summary import generate_weekly_summary_task
    from src.infrastructure.tasks.worker_context import session_factory

    reference_day = date.today() - timedelta(days=_WEEKLY_ARCHIVE_TRIGGER_DAYS)
    week_start = reference_day - timedelta(days=reference_day.weekday())
    week_end = week_start + timedelta(days=6)

    async with session_factory() as session:
        weekly_repo = WeeklySummaryRepository(session)
        companion_ids = await weekly_repo.get_companion_ids_needing_summary(week_start, week_end)
        if not companion_ids:
            return

        result = await session.execute(
            select(CompanionModel.id, CompanionModel.user_id).where(
                CompanionModel.id.in_(companion_ids)
            )
        )
        user_id_by_companion = {row.id: row.user_id for row in result}

    for companion_id in companion_ids:
        user_id = user_id_by_companion.get(companion_id)
        if not user_id:
            continue
        await generate_weekly_summary_task.kiq(
            companion_id=str(companion_id),
            user_id=str(user_id),
            week_start=week_start.isoformat(),
        )
