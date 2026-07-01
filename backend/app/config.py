from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Infrastructure-only settings. API keys are managed via settings_service."""

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/openscribe.db"
    UPLOAD_DIR: str = "./data/uploads"
    PROCESSED_DIR: str = "./data/processed"
    MAX_UPLOAD_SIZE_MB: int = 500

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def ensure_dirs(self) -> None:
        Path(self.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        Path(self.PROCESSED_DIR).mkdir(parents=True, exist_ok=True)


settings = Settings()
