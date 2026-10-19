"""Typed application settings, loaded from environment variables and backend/ai_core/.env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

AI_CORE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(AI_CORE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # Runtime rollback switch
    pipeline_version: Literal["legacy", "v2"] = "legacy"

    # LLM — Gemini (primary, free tier) with Ollama fallback
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    gemini_fallback_model: str = "gemini-flash-lite-latest"
    gemini_timeout_s: float = 60.0

    ollama_url: str = "http://127.0.0.1:11434"
    ollama_llm_model: str = "qwen2.5:3b"
    ollama_embed_model: str = "bge-m3"
    ollama_timeout_s: float = 120.0

    # Storage
    mongo_uri: str = "mongodb://127.0.0.1:27017"
    mongo_db: str = "neurovault_ai"
    ai_core_data_dir: Path = AI_CORE_DIR / "data"
    qdrant_collection: str = "chunks_v2"

    @property
    def qdrant_path(self) -> Path:
        return Path(self.ai_core_data_dir) / "qdrant"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
