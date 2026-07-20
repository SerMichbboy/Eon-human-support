from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListQueueBroker, RedisScheduleSource

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

# Two schedule sources, for two different needs:
# - LabelScheduleSource: cron schedules declared as `schedule=[{"cron": ...}]`
#   labels on the tasks themselves (see memory_compression.py) — fixed set,
#   read at scheduler startup.
# - RedisScheduleSource: dynamic, one-off schedules added at *runtime* (see
#   reminders.py / `send_reminder_task.schedule_by_time(...)`) — e.g. "remind
#   me at 18:00" needs a schedule created the moment that request comes in,
#   not one known in advance. The scheduler CLI checks *readiness* of already-
#   fetched schedules every second, but only re-*fetches* the schedule list
#   from sources (i.e. notices something new was added to Redis) on a separate,
#   much coarser `--update-interval` (taskiq's own default: 60s) — tuned down
#   to 5s in docker-compose.yml's scheduler command specifically because that
#   default is too slow for a reminder due a couple minutes out.
reminder_schedule_source = RedisScheduleSource(_settings.redis_url)
scheduler = TaskiqScheduler(
    broker=task_broker,
    sources=[LabelScheduleSource(task_broker), reminder_schedule_source],
)
