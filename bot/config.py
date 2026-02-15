"""
Configuration management using pydantic-settings.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""
    
    # Telegram Bot
    bot_token: str
    
    # Database
    database_url: str
    
    # Logging
    log_level: str = "INFO"
    
    # Monitoring
    check_interval_minutes: int = 5
    
    # Playwright
    playwright_timeout: int = 30000
    playwright_navigation_timeout: int = 30000
    playwright_element_timeout: int = 10000
    playwright_address_timeout: int = 60000
    
    # Retry
    max_retries: int = 3
    retry_backoff_base: int = 1
    
    # Timezone
    tz: str = "Europe/Kyiv"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )


# Global settings instance
settings = Settings()
