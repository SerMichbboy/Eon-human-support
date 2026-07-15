"""Process-wide singletons for TaskIQ task bodies.

Built once at worker/scheduler process startup (module import), not per task
invocation. TaskIQ workers run outside the FastAPI DI scope, so tasks can't use
Dishka — but rebuilding the engine (and its connection pool) from scratch on
every single task call defeats pooling entirely and leaks connections until the
old engine is garbage-collected. Import from here instead of constructing fresh.
"""
from src.infrastructure.claude.client import ClaudeClient
from src.infrastructure.crypto.aes import CryptoService
from src.infrastructure.db.engine import build_session_factory
from src.main.settings import Settings

settings = Settings()
session_factory = build_session_factory(settings)
crypto = CryptoService(settings)
claude = ClaudeClient(settings)
