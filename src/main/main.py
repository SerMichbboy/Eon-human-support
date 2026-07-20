from contextlib import asynccontextmanager

from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI

from src.main.ioc.container import create_container
from src.infrastructure.tasks.broker import task_broker
from src.main.settings import Settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings

    task_broker.is_worker_process = False
    await task_broker.startup()

    yield

    await task_broker.shutdown()
    await app.state.dishka_container.close()


def create_app() -> FastAPI:
    settings = Settings()

    app = FastAPI(title="Eon", lifespan=lifespan)
    app.state.settings = settings

    container = create_container(settings)
    setup_dishka(container, app)

    from src.presentation.api.auth import router as auth_router
    from src.presentation.api.companion import router as companion_router
    from src.presentation.api.messages import router as messages_router
    from src.presentation.api.onboarding import router as onboarding_router
    from src.presentation.api.profile import router as profile_router
    from src.presentation.api.voice import router as voice_router
    from src.presentation.api.webhooks import router as webhooks_router
    from src.presentation.ws.chat import router as ws_router

    app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(companion_router, prefix="/api/v1/companion", tags=["companion"])
    app.include_router(messages_router, prefix="/api/v1/messages", tags=["messages"])
    app.include_router(onboarding_router, prefix="/api/v1/onboarding", tags=["onboarding"])
    app.include_router(profile_router, prefix="/api/v1/profile", tags=["profile"])
    app.include_router(voice_router, prefix="/api/v1/voice", tags=["voice"])
    app.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
    app.include_router(ws_router, prefix="/ws", tags=["chat"])

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
