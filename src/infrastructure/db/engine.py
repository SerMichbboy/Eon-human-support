from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.main.settings import Settings


def build_engine(settings: Settings):
    return create_async_engine(
        settings.database_url,
        echo=settings.app_env == "development",
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=True,  # detects stale/dropped connections before handing them out
        pool_recycle=settings.db_pool_recycle_seconds,
    )


def build_session_factory(settings: Settings) -> async_sessionmaker[AsyncSession]:
    engine = build_engine(settings)
    return async_sessionmaker(engine, expire_on_commit=False)
