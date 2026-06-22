from faststream.redis import RedisBroker

from src.main.settings import Settings


def create_broker(settings: Settings) -> RedisBroker:
    return RedisBroker(settings.redis_url)
