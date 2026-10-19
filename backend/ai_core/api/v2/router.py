"""/api/v2 router. Additive — legacy endpoints in ai_server.py are untouched.

Stage 3 exposes only infrastructure health; Stage 4 adds processing, tree, graph,
generation and export endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.v2.schemas import ok
from infrastructure import container
from infrastructure.config import get_settings

router = APIRouter(prefix="/api/v2", tags=["v2"])


def _check(fn) -> dict:
    try:
        return {"ok": bool(fn())}
    except Exception as e:  # health must never raise
        return {"ok": False, "error": type(e).__name__}


@router.get("/health")
def health_v2():
    s = get_settings()
    checks = {
        "mongo": _check(lambda: container.get_repository().ping()),
        "vector_store": _check(lambda: container.get_vector_store() is not None),
        "embeddings": _check(lambda: container.get_embedder().is_available()),
        "llm": _check(lambda: container.get_llm().is_available()),
    }
    return ok(
        {
            "pipeline_version": s.pipeline_version,
            "checks": checks,
            "models": {
                "llm_chain": container.get_llm().name,
                "embeddings": s.ollama_embed_model,
            },
        },
        ready=all(c["ok"] for c in checks.values()),
    )
