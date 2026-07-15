from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListQueueBroker

from src.main.settings import Settings

_settings = Settings()

# socket_timeout=None is required: ListQueueBroker.listen() issues BRPOP with no
# command-level timeout (blocks server-side forever), but redis-py defaults every
# connection's client-side socket_timeout to 5s and doesn't exempt blocking list
# commands from it (that opt-out is reserved for PubSub in this redis-py version).
# Without this override, every idle queue period past 5s raises a client-side
# TimeoutError that listen() doesn't catch, killing and restarting the worker
# process in a loop — looks like a Redis outage but isn't one.
task_broker = ListQueueBroker(_settings.redis_url, socket_timeout=None)

# Cron schedules are declared as `schedule=[{"cron": ...}]` labels on the tasks
# themselves (see memory_compression.py) and picked up here at scheduler startup.
scheduler = TaskiqScheduler(broker=task_broker, sources=[LabelScheduleSource(task_broker)])
