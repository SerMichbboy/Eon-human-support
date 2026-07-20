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

    # Resend transactional email (verification codes). The API key comes from the
    # RESEND_API_KEY env var / .env, same as every other secret here. It's a
    # secret and must never be logged. When resend_api_key is empty the DI
    # container falls back to SmtpEmailSender.
    resend_api_key: str = ""
    resend_email_domain: str = "auth.qseawd.ru"  # sending domain (SPF/DKIM verified)
    resend_from_local: str = "noreply"           # local-part of the From address
    resend_from_name: str = "Eon"                # display name of the From address
    resend_timeout_seconds: float = 10.0
    # Svix signing secret for the Resend bounce/complaint webhook. Copied from the
    # Resend dashboard after the webhook endpoint is created; empty disables the route.
    resend_webhook_secret: str = ""

    verification_code_ttl_seconds: int = 120
    verification_resend_cooldown_seconds: int = 30

    # Windowed abuse limits on verification-code issuance, on top of the short
    # per-send resend cooldown above. Without these the send endpoints are a free
    # spam relay, which gets the email provider's account suspended. Counted in
    # Redis, see VerificationCodeService.within_rate_limit.
    verification_max_per_identifier: int = 3
    verification_identifier_window_seconds: int = 900  # 15 minutes
    verification_max_per_ip: int = 10
    verification_ip_window_seconds: int = 3600  # 1 hour
