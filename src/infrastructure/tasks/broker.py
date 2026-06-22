from taskiq_redis import ListQueueBroker

from src.main.settings import Settings

_settings = Settings()

task_broker = ListQueueBroker(_settings.redis_url)


def create_task_broker(settings: Settings) -> ListQueueBroker:
    return ListQueueBroker(settings.redis_url)
