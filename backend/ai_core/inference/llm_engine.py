"""
NEUROVAULT — LLM Inference Engine v3.0 (Production-Grade)
Kết nối Ollama (local) để chạy Gemma 4 E4B.
100% local inference, KHÔNG gọi API bên ngoài.

v3.0 Upgrades:
- Exponential backoff retry with jitter
- Circuit breaker pattern (auto-disable after N failures)
- Streaming with thinking-mode token separation
- Optimized connection pooling (keep-alive)
- Request/response metrics tracking
- Graceful degradation (fallback responses)
- Enhanced function calling with validation
- Concurrent request throttling
- Token count estimation
"""

import json
import re
import os
import time
import math
import random
import threading
import httpx
from typing import Optional, Dict, List, Any, Generator, Tuple
from dataclasses import dataclass, field
from enum import Enum

# BPE Tokenizer — white-box token counting
try:
    from tokenizer.bpe_tokenizer import BPETokenizer
    _BPE_AVAILABLE = True
except ImportError:
    _BPE_AVAILABLE = False


class CircuitState(Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class InferenceMetrics:
    """Track inference performance metrics."""
    total_requests: int = 0
    successful: int = 0
    failed: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_latency_ms: float = 0
    last_error: str = ""
    last_request_time: float = 0

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / max(self.successful, 1)

    @property
    def success_rate(self) -> float:
        return self.successful / max(self.total_requests, 1)

    def to_dict(self) -> Dict:
        return {
            "total_requests": self.total_requests,
            "successful": self.successful,
            "failed": self.failed,
            "success_rate": round(self.success_rate, 4),
            "avg_latency_ms": round(self.avg_latency_ms, 1),
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "last_error": self.last_error,
        }


class LLMEngine:
    """
    Production-grade local LLM inference via Ollama HTTP API.
    Features: retry, circuit breaker, streaming, thinking mode,
    function calling, JSON mode, metrics, connection pooling.
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        model: str = "",
        timeout: float = 120.0,
        max_retries: int = 3,
        circuit_breaker_threshold: int = 5,
        circuit_breaker_timeout: float = 60.0,
        max_concurrent: int = 4,
    ):
        self.base_url = os.getenv("OLLAMA_URL", base_url).rstrip("/")
        # Model priority: explicit param → env var → default (qwen3:1.7b)
        # qwen3:1.7b chosen for RTX 3050 4GB VRAM — fast, Apache 2.0
        self.model = model or os.getenv("LLM_MODEL", "qwen3:1.7b")
        self.timeout = timeout
        self.max_retries = max_retries

        # Connection pooling with keep-alive
        self._client = httpx.Client(
            timeout=httpx.Timeout(timeout, connect=10.0),
            limits=httpx.Limits(
                max_keepalive_connections=5,
                max_connections=10,
                keepalive_expiry=30.0,
            ),
        )

        # Circuit breaker
        self._cb_threshold = circuit_breaker_threshold
        self._cb_timeout = circuit_breaker_timeout
        self._cb_state = CircuitState.CLOSED
        self._cb_failure_count = 0
        self._cb_last_failure_time = 0.0
        self._cb_lock = threading.Lock()

        # Concurrency throttle
        self._semaphore = threading.Semaphore(max_concurrent)

        # Metrics
        self.metrics = InferenceMetrics()

        # BPE Tokenizer — accurate token counting (white-box)
        self._tokenizer = None
        if _BPE_AVAILABLE:
            try:
                vocab_path = os.path.join(
                    os.path.dirname(os.path.dirname(__file__)),
                    "data", "bpe_vocab.json"
                )
                if os.path.exists(vocab_path):
                    self._tokenizer = BPETokenizer.load(vocab_path)
                    print(f"[LLMEngine] BPE tokenizer loaded (vocab={self._tokenizer.vocab_size_actual()})")
                else:
                    # Tạo tokenizer cơ bản — sẽ dùng char-level fallback
                    self._tokenizer = BPETokenizer(vocab_size=8192)
                    print("[LLMEngine] BPE tokenizer initialized (untrained, char-level fallback)")
            except Exception as e:
                print(f"[LLMEngine] BPE tokenizer init failed: {e}")
                self._tokenizer = None

    # ══════════════════════════════════════════════
    # CIRCUIT BREAKER
    # ══════════════════════════════════════════════

    def _cb_check(self) -> bool:
        """Check if circuit allows request. Returns True if allowed."""
        with self._cb_lock:
            if self._cb_state == CircuitState.CLOSED:
                return True
            if self._cb_state == CircuitState.OPEN:
                if time.time() - self._cb_last_failure_time > self._cb_timeout:
                    self._cb_state = CircuitState.HALF_OPEN
                    return True
                return False
            # HALF_OPEN: allow one test request
            return True

    def _cb_record_success(self):
        with self._cb_lock:
            self._cb_failure_count = 0
            self._cb_state = CircuitState.CLOSED

    def _cb_record_failure(self):
        with self._cb_lock:
            self._cb_failure_count += 1
            self._cb_last_failure_time = time.time()
            if self._cb_failure_count >= self._cb_threshold:
                self._cb_state = CircuitState.OPEN

    # ══════════════════════════════════════════════
    # RETRY WITH EXPONENTIAL BACKOFF
    # ══════════════════════════════════════════════

    def _retry_request(self, func, *args, **kwargs):
        """Execute func with exponential backoff retry + jitter."""
        last_error = None
        for attempt in range(self.max_retries):
            if not self._cb_check():
                return None, "[ERROR] Circuit breaker OPEN — Ollama seems down. Auto-retry in 60s."

            try:
                result = func(*args, **kwargs)
                self._cb_record_success()
                return result, None
            except httpx.ConnectError:
                last_error = "[ERROR] Ollama server not running. Start with: ollama serve"
                self._cb_record_failure()
            except httpx.TimeoutException:
                last_error = "[ERROR] LLM inference timeout. Model may be loading."
                self._cb_record_failure()
            except httpx.HTTPStatusError as e:
                last_error = f"[ERROR] HTTP {e.response.status_code}: {e.response.text[:200]}"
                if e.response.status_code < 500:
                    break  # Don't retry client errors
                self._cb_record_failure()
            except Exception as e:
                last_error = f"[ERROR] Inference failed: {str(e)}"
                self._cb_record_failure()

            if attempt < self.max_retries - 1:
                delay = min(30, (2 ** attempt) + random.uniform(0, 1))
                time.sleep(delay)

        return None, last_error

    # ══════════════════════════════════════════════
    # CORE: GENERATE
    # ══════════════════════════════════════════════

    def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        thinking: bool = False,
        json_mode: bool = False,
        top_p: float = 0.9,
        top_k: int = 40,
        repeat_penalty: float = 1.1,
    ) -> str:
        """
        Generate response with retry + circuit breaker.

        Args:
            prompt: User prompt
            system: System prompt
            temperature: Creativity (0-2)
            max_tokens: Max output tokens
            thinking: Enable Gemma 4 Thinking Mode
            json_mode: Force JSON output
            top_p: Nucleus sampling threshold
            top_k: Top-K sampling
            repeat_penalty: Repetition penalty

        Returns:
            Generated text (thinking blocks stripped if thinking=True)
        """
        if thinking:
            prompt = f"<|think|>\n{prompt}"

        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "top_p": top_p,
                "top_k": top_k,
                "repeat_penalty": repeat_penalty,
            },
            "stream": False,
        }
        if json_mode:
            payload["format"] = "json"

        self._semaphore.acquire()
        start = time.time()
        try:
            def _do():
                resp = self._client.post(f"{self.base_url}/api/generate", json=payload)
                resp.raise_for_status()
                return resp.json()

            self.metrics.total_requests += 1
            data, error = self._retry_request(_do)

            if error:
                self.metrics.failed += 1
                self.metrics.last_error = error
                return error

            self.metrics.successful += 1
            self.metrics.total_latency_ms += (time.time() - start) * 1000
            self.metrics.total_tokens_out += data.get("eval_count", 0)
            self.metrics.total_tokens_in += data.get("prompt_eval_count", 0)

            raw = data.get("response", "")
            return self._strip_thinking(raw) if thinking else raw

        finally:
            self._semaphore.release()

    # ══════════════════════════════════════════════
    # CORE: CHAT
    # ══════════════════════════════════════════════

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        thinking: bool = False,
        json_mode: bool = False,
        tools: Optional[List[Dict]] = None,
        top_p: float = 0.9,
        repeat_penalty: float = 1.1,
    ) -> str:
        """Multi-turn chat with retry + circuit breaker."""
        payload = {
            "model": self.model,
            "messages": messages,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "top_p": top_p,
                "repeat_penalty": repeat_penalty,
            },
            "stream": False,
        }
        if json_mode:
            payload["format"] = "json"
        if tools:
            payload["tools"] = tools

        self._semaphore.acquire()
        start = time.time()
        try:
            def _do():
                resp = self._client.post(f"{self.base_url}/api/chat", json=payload)
                resp.raise_for_status()
                return resp.json()

            self.metrics.total_requests += 1
            data, error = self._retry_request(_do)

            if error:
                self.metrics.failed += 1
                self.metrics.last_error = error
                return error

            self.metrics.successful += 1
            self.metrics.total_latency_ms += (time.time() - start) * 1000
            self.metrics.total_tokens_out += data.get("eval_count", 0)
            self.metrics.total_tokens_in += data.get("prompt_eval_count", 0)

            message = data.get("message", {})

            # Function call response
            if message.get("tool_calls"):
                return json.dumps({
                    "type": "tool_calls",
                    "tool_calls": message["tool_calls"],
                    "content": message.get("content", ""),
                })

            raw = message.get("content", "")
            return self._strip_thinking(raw) if thinking else raw

        finally:
            self._semaphore.release()

    # ══════════════════════════════════════════════
    # STREAMING
    # ══════════════════════════════════════════════

    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        thinking: bool = False,
    ) -> Generator[str, None, None]:
        """
        Streaming chat — yield tokens one by one.
        If thinking=True, yields dict-like tokens: {"type":"thinking"|"answer","content":"..."}
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "stream": True,
        }

        if not self._cb_check():
            yield "[ERROR] Circuit breaker OPEN — Ollama seems down."
            return

        try:
            with self._client.stream(
                "POST", f"{self.base_url}/api/chat",
                json=payload, timeout=self.timeout,
            ) as response:
                response.raise_for_status()
                self._cb_record_success()

                in_thinking = False
                buffer = ""

                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")
                        if not token:
                            if data.get("done"):
                                break
                            continue

                        if thinking:
                            buffer += token
                            # Detect thinking block transitions
                            if "<think>" in buffer and not in_thinking:
                                in_thinking = True
                                # Don't yield the <think> tag itself
                                continue
                            elif "</think>" in buffer and in_thinking:
                                in_thinking = False
                                buffer = ""
                                continue
                            elif in_thinking:
                                # Optionally skip thinking tokens in stream
                                continue

                        yield token

                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

        except httpx.ConnectError:
            self._cb_record_failure()
            yield "[ERROR] Ollama server not running."
        except httpx.TimeoutException:
            self._cb_record_failure()
            yield "[ERROR] Streaming timeout."
        except Exception as e:
            self._cb_record_failure()
            yield f"[ERROR] Stream failed: {str(e)}"

    def generate_stream(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> Generator[str, None, None]:
        """Streaming generate — yield tokens."""
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "stream": True,
        }

        if not self._cb_check():
            yield "[ERROR] Circuit breaker OPEN."
            return

        try:
            with self._client.stream(
                "POST", f"{self.base_url}/api/generate",
                json=payload, timeout=self.timeout,
            ) as response:
                response.raise_for_status()
                self._cb_record_success()
                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("response", "")
                        if token:
                            yield token
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue
        except httpx.ConnectError:
            self._cb_record_failure()
            yield "[ERROR] Ollama server not running."
        except Exception as e:
            self._cb_record_failure()
            yield f"[ERROR] Generate stream failed: {str(e)}"

    def chat_stream_with_thinking(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> Generator[Dict[str, str], None, None]:
        """
        Streaming with thinking separation.
        Yields: {"type": "thinking"|"answer"|"done", "content": "..."}
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "stream": True,
        }

        if not self._cb_check():
            yield {"type": "error", "content": "Circuit breaker OPEN"}
            return

        try:
            with self._client.stream(
                "POST", f"{self.base_url}/api/chat",
                json=payload, timeout=self.timeout,
            ) as response:
                response.raise_for_status()
                self._cb_record_success()

                in_thinking = False
                accumulated = ""

                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")

                        if token:
                            accumulated += token

                            if "<think>" in accumulated and not in_thinking:
                                in_thinking = True
                                # Emit anything before <think> as answer
                                pre = accumulated.split("<think>")[0]
                                if pre.strip():
                                    yield {"type": "answer", "content": pre}
                                accumulated = accumulated.split("<think>", 1)[1] if "<think>" in accumulated else ""
                                continue

                            if "</think>" in accumulated and in_thinking:
                                # Emit thinking content
                                think_content = accumulated.split("</think>")[0]
                                if think_content.strip():
                                    yield {"type": "thinking", "content": think_content}
                                accumulated = accumulated.split("</think>", 1)[1] if "</think>" in accumulated else ""
                                in_thinking = False
                                continue

                            if not in_thinking and len(accumulated) > 2:
                                # Yield answer tokens (keep small buffer for tag detection)
                                safe = accumulated[:-10] if len(accumulated) > 10 else ""
                                if safe:
                                    yield {"type": "answer", "content": safe}
                                    accumulated = accumulated[len(safe):]

                        if data.get("done"):
                            # Flush remaining
                            if accumulated.strip():
                                yield {"type": "thinking" if in_thinking else "answer", "content": accumulated}
                            yield {"type": "done", "content": ""}
                            break
                    except json.JSONDecodeError:
                        continue

        except Exception as e:
            self._cb_record_failure()
            yield {"type": "error", "content": str(e)}

    # ══════════════════════════════════════════════
    # THINKING MODE
    # ══════════════════════════════════════════════

    def think_and_answer(
        self,
        question: str,
        context: str = "",
        system: str = "",
        temperature: float = 0.3,
    ) -> Dict[str, str]:
        """
        Gemma 4 Thinking Mode: step-by-step reasoning then answer.
        Returns: {"thinking": "...", "answer": "...", "full_response": "..."}
        """
        prompt = "<|think|>\n"
        if context:
            prompt += f"Context:\n{context}\n\n"
        prompt += f"Question: {question}"

        raw = self.generate(
            prompt=prompt,
            system=system or "You are a careful, step-by-step reasoning assistant.",
            temperature=temperature,
            max_tokens=4096,
            thinking=False,
        )

        return self._parse_thinking_response(raw)

    def _strip_thinking(self, text: str) -> str:
        """Remove thinking blocks, keep final answer."""
        patterns = [
            r"<think>.*?</think>",
            r"<\|think\|>.*?<\|/think\|>",
            r"\[thinking\].*?\[/thinking\]",
        ]
        result = text
        for pattern in patterns:
            result = re.sub(pattern, "", result, flags=re.DOTALL)
        return result.strip()

    def _parse_thinking_response(self, text: str) -> Dict[str, str]:
        """Parse response with thinking blocks."""
        thinking = ""
        answer = text

        think_patterns = [
            (r"<think>(.*?)</think>", r"<think>.*?</think>"),
            (r"<\|think\|>(.*?)<\|/think\|>", r"<\|think\|>.*?<\|/think\|>"),
        ]

        for extract_pat, strip_pat in think_patterns:
            matches = re.findall(extract_pat, text, re.DOTALL)
            if matches:
                thinking = "\n".join(m.strip() for m in matches)
                answer = re.sub(strip_pat, "", text, flags=re.DOTALL).strip()
                break

        return {"thinking": thinking, "answer": answer, "full_response": text}

    # ══════════════════════════════════════════════
    # JSON MODE
    # ══════════════════════════════════════════════

    def generate_json(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> Optional[Dict]:
        """Generate and parse JSON output."""
        raw = self.generate(
            prompt=prompt, system=system,
            temperature=temperature, max_tokens=max_tokens,
            json_mode=True,
        )
        if raw.startswith("[ERROR]"):
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return None

    # ══════════════════════════════════════════════
    # FUNCTION CALLING (Enhanced)
    # ══════════════════════════════════════════════

    def call_with_tools(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict[str, Any]],
        temperature: float = 0.3,
        auto_execute: bool = False,
        tool_handlers: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Enhanced function calling with optional auto-execution.

        Args:
            messages: Chat messages
            tools: Tool/function definitions
            temperature: Lower = more deterministic
            auto_execute: If True and tool_handlers provided, auto-execute tools
            tool_handlers: Dict of {function_name: callable}

        Returns:
            {"type": "text"|"tool_calls"|"tool_results", ...}
        """
        raw = self.chat(messages=messages, temperature=temperature, tools=tools)

        if raw.startswith("[ERROR]"):
            return {"type": "error", "content": raw, "tool_calls": []}

        try:
            parsed = json.loads(raw)
            if parsed.get("type") == "tool_calls":
                if auto_execute and tool_handlers:
                    results = self._execute_tools(parsed["tool_calls"], tool_handlers)
                    return {
                        "type": "tool_results",
                        "tool_calls": parsed["tool_calls"],
                        "results": results,
                        "content": parsed.get("content", ""),
                    }
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass

        return {"type": "text", "content": raw, "tool_calls": []}

    def _execute_tools(
        self, tool_calls: List[Dict], handlers: Dict[str, Any]
    ) -> List[Dict]:
        """Execute tool calls and collect results."""
        results = []
        for call in tool_calls:
            func_name = call.get("function", {}).get("name", "")
            func_args = call.get("function", {}).get("arguments", {})

            if func_name in handlers:
                try:
                    result = handlers[func_name](**func_args)
                    results.append({
                        "function": func_name,
                        "result": result,
                        "status": "success",
                    })
                except Exception as e:
                    results.append({
                        "function": func_name,
                        "error": str(e),
                        "status": "error",
                    })
            else:
                results.append({
                    "function": func_name,
                    "error": f"No handler for '{func_name}'",
                    "status": "not_found",
                })
        return results

    # ══════════════════════════════════════════════
    # TOKEN ESTIMATION
    # ══════════════════════════════════════════════

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """
        Estimate token count (approximation: ~4 chars/token for English,
        ~2 chars/token for CJK/Vietnamese).
        """
        if not text:
            return 0
        ascii_chars = sum(1 for c in text if ord(c) < 128)
        non_ascii = len(text) - ascii_chars
        return int(ascii_chars / 4 + non_ascii / 2)

    # ══════════════════════════════════════════════
    # STATUS & INFO
    # ══════════════════════════════════════════════

    def is_available(self) -> bool:
        """Check if Ollama server is running."""
        try:
            resp = self._client.get(f"{self.base_url}/api/tags", timeout=5.0)
            return resp.status_code == 200
        except Exception:
            return False

    def is_model_loaded(self) -> bool:
        """Check if model is pulled and ready."""
        try:
            models = self.list_models()
            return any(self.model in m for m in models)
        except Exception:
            return False

    def list_models(self) -> List[str]:
        """List all pulled models."""
        try:
            resp = self._client.get(f"{self.base_url}/api/tags", timeout=10.0)
            if resp.status_code == 200:
                return [m["name"] for m in resp.json().get("models", [])]
        except Exception:
            pass
        return []

    def get_model_info(self) -> Optional[Dict]:
        """Get detailed model information."""
        try:
            resp = self._client.post(
                f"{self.base_url}/api/show",
                json={"name": self.model}, timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                details = data.get("details", {})
                return {
                    "name": self.model,
                    "size": data.get("size", 0),
                    "parameter_size": details.get("parameter_size", "unknown"),
                    "quantization": details.get("quantization_level", "unknown"),
                    "family": details.get("family", "unknown"),
                    "format": details.get("format", "unknown"),
                }
        except Exception:
            pass
        return None

    def pull_model(self, model_name: str) -> bool:
        """Pull model from Ollama registry."""
        try:
            resp = self._client.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name}, timeout=600.0,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def health_check(self) -> Dict[str, Any]:
        """Full health check with metrics."""
        server_ok = self.is_available()
        model_ok = self.is_model_loaded() if server_ok else False
        model_info = self.get_model_info() if model_ok else None

        return {
            "server_running": server_ok,
            "model_available": model_ok,
            "model": self.model,
            "base_url": self.base_url,
            "model_info": model_info,
            "status": "ready" if (server_ok and model_ok) else "offline",
            "circuit_breaker": self._cb_state.value,
            "metrics": self.metrics.to_dict(),
        }

    def get_metrics(self) -> Dict:
        """Get inference metrics."""
        return self.metrics.to_dict()

    def reset_circuit_breaker(self):
        """Manually reset circuit breaker."""
        with self._cb_lock:
            self._cb_state = CircuitState.CLOSED
            self._cb_failure_count = 0

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using BPE tokenizer or heuristic fallback."""
        if self._tokenizer:
            return len(self._tokenizer.encode(text))
        # Heuristic fallback: ~1 token per 4 characters (EN) or 2 chars (VI)
        vi_chars = set("àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ")
        has_vi = any(c in vi_chars for c in text.lower())
        ratio = 2.0 if has_vi else 4.0
        return max(1, int(len(text) / ratio))

    def tokenize(self, text: str) -> list:
        """Tokenize text into subword tokens (strings)."""
        if self._tokenizer:
            return self._tokenizer.tokenize(text)
        # Fallback: simple whitespace split
        return text.split()

    def __del__(self):
        """Cleanup HTTP clients."""
        try:
            self._client.close()
        except Exception:
            pass
