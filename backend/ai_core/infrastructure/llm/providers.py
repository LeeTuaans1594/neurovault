"""LLM adapters: Gemini (REST, free tier), Ollama (local) and an ordered fallback chain."""

from __future__ import annotations

import logging
from typing import Optional, Sequence

import httpx

from domain.ports import LLMProvider, LLMResult, LLMUnavailableError

log = logging.getLogger(__name__)
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiLLM:
    """Gemini via REST. Retryable failures (429 quota, 5xx, 404 model) raise LLMUnavailableError."""

    def __init__(self, api_key: str, model: str, timeout_s: float = 60.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_s = timeout_s
        self.name = f"gemini:{model}"

    def generate(self, prompt: str, *, system: Optional[str] = None, json_mode: bool = False,
                 temperature: float = 0.2, max_tokens: int = 2048) -> LLMResult:
        if not self.api_key:
            raise LLMUnavailableError("GEMINI_API_KEY not configured")
        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        try:
            r = httpx.post(f"{GEMINI_BASE}/{self.model}:generateContent", json=body,
                           headers={"x-goog-api-key": self.api_key}, timeout=self.timeout_s)
        except httpx.HTTPError as e:
            raise LLMUnavailableError(f"{self.name} network error: {e}") from e
        if r.status_code in (404, 429) or r.status_code >= 500:
            raise LLMUnavailableError(f"{self.name} HTTP {r.status_code}")
        r.raise_for_status()
        data = r.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        except (KeyError, IndexError) as e:
            raise LLMUnavailableError(f"{self.name} empty/blocked response") from e
        return LLMResult(text=text, provider="gemini", model=self.model)

    def is_available(self) -> bool:
        return bool(self.api_key)


class OllamaLLM:
    def __init__(self, base_url: str, model: str, timeout_s: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s
        self.name = f"ollama:{model}"

    def generate(self, prompt: str, *, system: Optional[str] = None, json_mode: bool = False,
                 temperature: float = 0.2, max_tokens: int = 2048) -> LLMResult:
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}]
        body: dict = {"model": self.model, "messages": messages, "stream": False,
                      "options": {"temperature": temperature, "num_predict": max_tokens}}
        if json_mode:
            body["format"] = "json"
        try:
            r = httpx.post(f"{self.base_url}/api/chat", json=body, timeout=self.timeout_s)
        except httpx.HTTPError as e:
            raise LLMUnavailableError(f"{self.name} network error: {e}") from e
        if r.status_code >= 400:
            raise LLMUnavailableError(f"{self.name} HTTP {r.status_code}")
        return LLMResult(text=r.json()["message"]["content"], provider="ollama", model=self.model)

    def is_available(self) -> bool:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=3)
            return any(m.get("name") == self.model or m.get("model") == self.model
                       for m in r.json().get("models", []))
        except Exception:
            return False


class FallbackLLM:
    """Try providers in order; move to the next one only on LLMUnavailableError."""

    def __init__(self, providers: Sequence[LLMProvider]) -> None:
        if not providers:
            raise ValueError("at least one provider required")
        self.providers = list(providers)
        self.name = " > ".join(p.name for p in self.providers)

    def generate(self, prompt: str, **kw) -> LLMResult:
        errors = []
        for p in self.providers:
            try:
                return p.generate(prompt, **kw)
            except LLMUnavailableError as e:
                log.warning("LLM fallback: %s", e)
                errors.append(str(e))
        raise LLMUnavailableError("all LLM providers failed: " + " | ".join(errors))

    def is_available(self) -> bool:
        return any(p.is_available() for p in self.providers)
