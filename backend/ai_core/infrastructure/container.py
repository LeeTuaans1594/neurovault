"""Composition root: builds and caches infrastructure singletons from Settings.

Use cases receive their dependencies from here (or from fakes in tests). Nothing heavy is
created at import time — each getter builds lazily on first use.
"""

from __future__ import annotations

from functools import lru_cache

from infrastructure.config import Settings, get_settings


@lru_cache(maxsize=1)
def get_repository():
    from infrastructure.persistence.repositories import MongoDocumentRepository

    s: Settings = get_settings()
    return MongoDocumentRepository(s.mongo_uri, s.mongo_db)


@lru_cache(maxsize=1)
def get_vector_store():
    from infrastructure.vector.qdrant_store import QdrantVectorStore

    s = get_settings()
    return QdrantVectorStore(s.qdrant_path, s.qdrant_collection)


@lru_cache(maxsize=1)
def get_embedder():
    from infrastructure.embeddings.ollama_embeddings import OllamaEmbeddingProvider

    s = get_settings()
    return OllamaEmbeddingProvider(s.ollama_url, s.ollama_embed_model, s.ollama_timeout_s)


@lru_cache(maxsize=1)
def get_llm():
    from infrastructure.llm.providers import FallbackLLM, GeminiLLM, OllamaLLM

    s = get_settings()
    chain = []
    if s.gemini_api_key:
        chain.append(GeminiLLM(s.gemini_api_key, s.gemini_model, s.gemini_timeout_s))
        if s.gemini_fallback_model and s.gemini_fallback_model != s.gemini_model:
            chain.append(GeminiLLM(s.gemini_api_key, s.gemini_fallback_model, s.gemini_timeout_s))
    chain.append(OllamaLLM(s.ollama_url, s.ollama_llm_model, s.ollama_timeout_s))
    return FallbackLLM(chain)


def reset() -> None:
    """Drop cached singletons (tests, config reload)."""
    for fn in (get_repository, get_vector_store, get_embedder, get_llm):
        fn.cache_clear()
    get_settings.cache_clear()
