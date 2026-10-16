"""Adapters: run a pipeline on a fixture file and return a `PipelineOutput` (see metrics.py)."""

from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

AI_CORE = Path(__file__).resolve().parents[1]


def _legacy_client():
    """Import the legacy FastAPI app in an isolated, offline configuration."""
    os.environ.setdefault("OLLAMA_URL", "http://127.0.0.1:9")  # unreachable → no LLM calls
    os.environ.setdefault("AI_CORE_DATA_DIR", tempfile.mkdtemp(prefix="nv_eval_"))
    for p in (str(AI_CORE), str(AI_CORE / "api")):
        if p not in sys.path:
            sys.path.insert(0, p)
    from fastapi.testclient import TestClient
    import ai_server  # noqa: E402

    return TestClient(ai_server.app)


class LegacyAdapter:
    name = "legacy"

    def __init__(self, client=None):
        self.client = client or _legacy_client()

    def run(self, file_path: Path) -> dict:
        doc_id = f"eval-{uuid.uuid4().hex[:8]}"
        r = self.client.post("/api/process", json={"document_id": doc_id, "file_path": str(file_path)})
        r.raise_for_status()
        proc = r.json()

        concepts = self.client.get(f"/api/concepts/{doc_id}").json().get("concepts", [])
        graph = self.client.post(
            "/api/knowledge-graph", json={"document_id": doc_id, "file_path": str(file_path)}
        ).json().get("graph", {})

        return {
            "raw_text": proc.get("raw_text", ""),
            "headings": [],  # legacy parser exposes no structure
            "chunks": [
                {"text": c.get("text", ""), "page": c.get("page"), "section_path": c.get("section_path")}
                for c in proc.get("chunks", [])
            ],
            "concepts": [c["concept"] if isinstance(c, dict) else str(c) for c in concepts],
            "graph": graph,
        }


ADAPTERS = {"legacy": LegacyAdapter}
