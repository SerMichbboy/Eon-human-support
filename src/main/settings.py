from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "development"
    mode: str = "production"  # "test" — minimal prompts, cheaper
    app_secret_key: str

    database_url: str
    database_url_sync: str
    redis_url: str = "redis://localhost:6379/0"

    master_encryption_key: str  # base64-encoded 32 bytes

    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    anthropic_api_key: str
    openai_api_key: str
    vsegpt_base_url: str = ""

    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
