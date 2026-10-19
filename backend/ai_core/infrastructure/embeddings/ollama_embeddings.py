"""Ollama embeddings (bge-m3 by default — multilingual, good for Vietnamese + English)."""

from __future__ import annotations

from typing import Sequence

import httpx


class OllamaEmbeddingProvider:
    def __init__(self, base_url: str, model: str, timeout_s: float = 120.0, batch_size: int = 16) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self.batch_size = batch_size

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        out: list[list[float]] = []
        with httpx.Client(timeout=self.timeout_s) as client:
            for i in range(0, len(texts), self.batch_size):
                batch = [t if t.strip() else " " for t in texts[i:i + self.batch_size]]
                r = client.post(f"{self.base_url}/api/embed", json={"model": self.model, "input": batch})
                r.raise_for_status()
                out.extend(r.json()["embeddings"])
        return out

    def is_available(self) -> bool:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=3)
            names = {m.get("name", "").split(":")[0] for m in r.json().get("models", [])}
            return self.model.split(":")[0] in names
        except Exception:
            return False
