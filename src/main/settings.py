from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "development"
    mode: str = "production"  # "test" — minimal prompts, cheaper
    app_secret_key: str

    database_url: str
    database_url_sync: str
    redis_url: str = "redis://localhost:6379/0"

    # Postgres max_connections is finite and shared across every process that
    # connects (api, worker, scheduler) — keep pool_size+max_overflow per process
    # comfortably under max_connections / number of processes. See engine.py.
    db_pool_size: int = 10
    db_max_overflow: int = 15
    db_pool_recycle_seconds: int = 1800

    master_encryption_key: str  # base64-encoded 32 bytes

    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    anthropic_api_key: str
    openai_api_key: str
    vsegpt_base_url: str = ""

    # Registration/login verification codes (Redis-cached, see
    # src/infrastructure/verification/code_service.py). SMS sending is a stub
    # (logs the code) until a real provider is wired into SmsSender.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    verification_code_ttl_seconds: int = 120
    verification_resend_cooldown_seconds: int = 30
