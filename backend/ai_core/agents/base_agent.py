"""
NEUROVAULT — Base Agent (Abstract)
Abstract base class cho tất cả AI agents trong hệ thống.
Tự viết 100% — KHÔNG dùng framework bên ngoài (LangChain, CrewAI, AutoGen...).

Mỗi agent kế thừa BaseAgent và implement:
- process(): Logic xử lý chính
- get_system_prompt(): System prompt cho LLM
- get_tools(): Danh sách tools agent có thể sử dụng

Design patterns:
- Template Method: BaseAgent định nghĩa workflow, subclass implement steps
- Strategy: Mỗi agent có chiến lược xử lý riêng
- Observer: Agents nhận events qua message bus
- State Machine: Lifecycle quản lý bởi AgentState

Features:
- Automatic state management (IDLE → THINKING → ACTING → RESPONDING → IDLE)
- Built-in LLM integration (Gemma 4 via Ollama)
- Tool execution with validation
- Error recovery with configurable retries
- Bilingual support (EN/VI)
- Conversation memory access
- Performance metrics
"""

import time
import traceback
import hashlib
import json
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Callable, Type
from enum import Enum
from dataclasses import dataclass, field

from agents.agent_message import AgentMessage, MessageType, MessagePriority
from agents.agent_state import AgentState, AgentPhase, InvalidTransitionError
from agents.agent_context import AgentContext


class AgentCapability(Enum):
    """Khả năng của agent — dùng cho routing trong Orchestrator."""
    CHAT = "chat"                       # Trả lời câu hỏi
    TUTORING = "tutoring"               # Dạy học Socratic
    ASSESSMENT = "assessment"           # Tạo quiz/test
    FEEDBACK = "feedback"               # Phân tích kết quả, đưa gợi ý
    PATH_PLANNING = "path_planning"     # Lộ trình học
    SUMMARIZATION = "summarization"     # Tóm tắt tài liệu
    CONCEPT_EXTRACTION = "concept_extraction"  # Trích xuất concepts
    SAFETY = "safety"                   # Content moderation
    CONTENT_GENERATION = "content_generation"  # Tạo flashcards, notes
    ANALYTICS = "analytics"             # Phân tích learning data


@dataclass
class ToolDefinition:
    """Định nghĩa một tool mà agent có thể sử dụng."""
    name: str
    description: str
    parameters: Dict[str, Any]       # JSON Schema cho parameters
    handler: Optional[Callable] = None  # Function thực thi tool
    required_params: List[str] = field(default_factory=list)

    def to_ollama_format(self) -> Dict[str, Any]:
        """Chuyển sang format Ollama/Gemma 4 function calling."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": self.required_params,
                },
            },
        }


@dataclass
class AgentResult:
    """Kết quả trả về từ agent sau khi xử lý."""
    success: bool
    content: str                      # Response text chính
    data: Dict[str, Any] = field(default_factory=dict)   # Structured data
    agent_id: str = ""
    thinking: str = ""                # Reasoning process (nếu có)
    tool_calls_made: List[Dict] = field(default_factory=list)
    processing_time_ms: float = 0.0
    tokens_used: int = 0
    error: str = ""
    suggestions: List[str] = field(default_factory=list)  # Follow-up suggestions

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "content": self.content,
            "data": self.data,
            "agent_id": self.agent_id,
            "thinking": self.thinking,
            "tool_calls_made": self.tool_calls_made,
            "processing_time_ms": round(self.processing_time_ms, 1),
            "tokens_used": self.tokens_used,
            "error": self.error,
            "suggestions": self.suggestions,
        }


class BaseAgent(ABC):
    """
    Abstract base class cho tất cả NeuroVault AI agents.
    
    Workflow chính (Template Method pattern):
    1. receive_message() → validate + route
    2. _pre_process() → safety check, context preparation
    3. process() → ABSTRACT — logic chính do subclass implement
    4. _post_process() → format response, update metrics
    5. create_response() → tạo AgentMessage response
    
    Subclass BẮT BUỘC implement:
    - process(message, context) → AgentResult
    - get_system_prompt(context) → str
    - get_tools() → List[ToolDefinition]
    
    Subclass CÓ THỂ override:
    - _pre_process(message, context) → bool
    - _post_process(result, context) → AgentResult
    - _handle_error(error, message, context) → AgentResult
    """

    def __init__(
        self,
        agent_id: str,
        name: str,
        description: str,
        capabilities: List[AgentCapability],
        llm_engine: Any = None,
        max_retries: int = 2,
        thinking_mode: bool = False,
        default_temperature: float = 0.7,
        default_max_tokens: int = 2048,
    ):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.capabilities = capabilities
        self.llm_engine = llm_engine
        self.max_retries = max_retries
        self.thinking_mode = thinking_mode
        self.default_temperature = default_temperature
        self.default_max_tokens = default_max_tokens

        # State machine
        self.state = AgentState(agent_id=agent_id)

        # Tools
        self._tools: Dict[str, ToolDefinition] = {}
        self._register_tools()

        # Metrics
        self._metrics = {
            "total_requests": 0,
            "successful": 0,
            "failed": 0,
            "total_processing_ms": 0.0,
            "avg_processing_ms": 0.0,
        }

    def _register_tools(self) -> None:
        """Đăng ký tools từ get_tools() vào registry."""
        for tool in self.get_tools():
            self._tools[tool.name] = tool

    # ════════════════════════════════════════════════
    # ABSTRACT METHODS — Subclass PHẢI implement
    # ════════════════════════════════════════════════

    @abstractmethod
    def process(
        self,
        message: AgentMessage,
        context: AgentContext,
    ) -> AgentResult:
        """
        Logic xử lý chính của agent.
        
        Args:
            message: Message request đến agent
            context: Shared context (conversation, learner, document)
            
        Returns:
            AgentResult chứa response
        """
        ...

    @abstractmethod
    def get_system_prompt(self, context: AgentContext) -> str:
        """
        Tạo system prompt cho LLM dựa trên context.
        Prompt nên bao gồm:
        - Vai trò agent
        - Ngôn ngữ (EN/VI)
        - Context về learner (mastery, weak concepts...)
        - Instructions cụ thể
        """
        ...

    @abstractmethod
    def get_tools(self) -> List[ToolDefinition]:
        """
        Danh sách tools agent có thể sử dụng.
        Trả về list rỗng nếu agent không cần tools.
        """
        ...

    # ════════════════════════════════════════════════
    # MAIN ENTRY POINT
    # ════════════════════════════════════════════════

    def handle_message(
        self,
        message: AgentMessage,
        context: AgentContext,
    ) -> AgentMessage:
        """
        Entry point chính — nhận message, xử lý, trả response.
        Quản lý state machine + error handling tự động.
        
        Args:
            message: Incoming message
            context: Shared context
            
        Returns:
            AgentMessage response
        """
        start_time = time.time()
        self._metrics["total_requests"] += 1

        try:
            # Transition: IDLE → THINKING
            self.state.transition(
                AgentPhase.THINKING,
                reason=f"Nhận message từ {message.sender}",
                metadata={"message_id": message.id},
            )

            # Pre-process: validate, safety check
            if not self._pre_process(message, context):
                result = AgentResult(
                    success=False,
                    content="Request bị từ chối bởi pre-processing filter.",
                    agent_id=self.agent_id,
                    error="PRE_PROCESS_REJECTED",
                )
                self.state.transition(AgentPhase.IDLE, reason="pre_process_rejected")
                return message.create_error("PRE_PROCESS_REJECTED", result.content)

            # Transition: THINKING → ACTING
            self.state.transition(
                AgentPhase.ACTING,
                reason="Pre-process OK, bắt đầu xử lý",
            )

            # Process: gọi logic chính (subclass implementation)
            result = self._process_with_retry(message, context)

            # Post-process: format, validate output
            result = self._post_process(result, context)
            result.agent_id = self.agent_id
            result.processing_time_ms = (time.time() - start_time) * 1000

            # Transition: ACTING → RESPONDING → IDLE
            self.state.transition(AgentPhase.RESPONDING, reason="Xử lý xong")

            # Tạo response message
            response = message.create_response(
                content={
                    "text": result.content,
                    "data": result.data,
                    "thinking": result.thinking,
                    "suggestions": result.suggestions,
                    "processing_time_ms": result.processing_time_ms,
                    "agent_id": self.agent_id,
                },
                sender=self.agent_id,
            )

            # Update conversation context
            context.add_turn(
                role="assistant",
                content=result.content,
                agent_id=self.agent_id,
                metadata={
                    "thinking": result.thinking,
                    "tool_calls": result.tool_calls_made,
                },
            )

            # Transition: RESPONDING → IDLE
            self.state.transition(AgentPhase.IDLE, reason="Response đã gửi")

            # Update metrics
            self._metrics["successful"] += 1
            self._metrics["total_processing_ms"] += result.processing_time_ms
            self._metrics["avg_processing_ms"] = (
                self._metrics["total_processing_ms"] / self._metrics["successful"]
            )

            return response

        except InvalidTransitionError as e:
            # State machine error — force reset
            self.state.force_transition(AgentPhase.IDLE, reason=f"State error: {e}")
            return message.create_error("STATE_ERROR", str(e))

        except Exception as e:
            # Unhandled error — recovery
            self._metrics["failed"] += 1
            error_msg = f"Agent {self.agent_id} error: {str(e)}"
            traceback.print_exc()

            # Try to transition to ERROR then IDLE
            try:
                if self.state.phase != AgentPhase.ERROR:
                    self.state.transition(
                        AgentPhase.ERROR,
                        reason=error_msg,
                        metadata={"traceback": traceback.format_exc()},
                    )
                self.state.transition(AgentPhase.IDLE, reason="Error recovery")
            except Exception:
                self.state.force_transition(AgentPhase.IDLE, reason="Force recovery")

            # Tạo error response
            error_result = self._handle_error(e, message, context)
            return message.create_error(
                "AGENT_ERROR",
                error_result.content,
                details={"agent_id": self.agent_id, "error_type": type(e).__name__},
            )

    # ════════════════════════════════════════════════
    # HOOKS — Subclass CÓ THỂ override
    # ════════════════════════════════════════════════

    def _pre_process(
        self,
        message: AgentMessage,
        context: AgentContext,
    ) -> bool:
        """
        Pre-processing hook — gọi trước process().
        Override để thêm validation, safety checks, etc.
        Returns True nếu OK, False để reject.
        """
        # Default: luôn cho phép
        return True

    def _post_process(
        self,
        result: AgentResult,
        context: AgentContext,
    ) -> AgentResult:
        """
        Post-processing hook — gọi sau process().
        Override để format output, add metadata, etc.
        """
        return result

    def _handle_error(
        self,
        error: Exception,
        message: AgentMessage,
        context: AgentContext,
    ) -> AgentResult:
        """
        Error handler hook.
        Override để custom error response.
        """
        # Detect language from context
        lang = "vi" if (context.learner and context.learner.language == "vi") else "en"

        if lang == "vi":
            error_text = (
                "Xin lỗi, tôi gặp sự cố khi xử lý yêu cầu của bạn. "
                "Vui lòng thử lại sau."
            )
        else:
            error_text = (
                "Sorry, I encountered an issue processing your request. "
                "Please try again."
            )

        return AgentResult(
            success=False,
            content=error_text,
            agent_id=self.agent_id,
            error=str(error),
        )

    # ════════════════════════════════════════════════
    # RETRY LOGIC
    # ════════════════════════════════════════════════

    def _process_with_retry(
        self,
        message: AgentMessage,
        context: AgentContext,
    ) -> AgentResult:
        """Gọi process() với retry logic."""
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                result = self.process(message, context)
                if result.success:
                    return result
                # Process returned failure — retry
                last_error = result.error or "Process returned success=False"
            except Exception as e:
                last_error = str(e)
                if attempt < self.max_retries:
                    # Log retry
                    print(
                        f"[{self.agent_id}] Retry {attempt + 1}/{self.max_retries}: {e}"
                    )
                    time.sleep(0.5 * (attempt + 1))  # Simple backoff

        # All retries failed
        return AgentResult(
            success=False,
            content="Đã thử nhiều lần nhưng không thể xử lý yêu cầu.",
            agent_id=self.agent_id,
            error=f"Max retries ({self.max_retries}) exceeded: {last_error}",
        )

    # ════════════════════════════════════════════════
    # LLM HELPERS — Subclass sử dụng trong process()
    # ════════════════════════════════════════════════

    def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        json_mode: bool = False,
    ) -> str:
        """
        Gọi LLM (Gemma 4 via Ollama) — wrapper với error handling.
        
        Args:
            messages: Chat messages ([{role, content}, ...])
            temperature: Override temperature
            max_tokens: Override max tokens
            json_mode: Force JSON output
            
        Returns:
            LLM response text
        """
        if not self.llm_engine:
            return "[ERROR] LLM engine chưa được cấu hình cho agent này."

        return self.llm_engine.chat(
            messages=messages,
            temperature=temperature or self.default_temperature,
            max_tokens=max_tokens or self.default_max_tokens,
            thinking=self.thinking_mode,
            json_mode=json_mode,
        )

    def _call_llm_json(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.3,
    ) -> Optional[Dict]:
        """Gọi LLM và parse JSON output."""
        if not self.llm_engine:
            return None
        return self.llm_engine.generate_json(
            prompt=prompt,
            system=system,
            temperature=temperature,
        )

    def _call_llm_with_tools(
        self,
        messages: List[Dict[str, str]],
        context: AgentContext,
    ) -> AgentResult:
        """
        Gọi LLM với native function calling (Gemma 4).
        Tự động execute tools và trả kết quả.
        """
        if not self.llm_engine or not self._tools:
            return AgentResult(
                success=False,
                content="LLM hoặc tools chưa sẵn sàng.",
                agent_id=self.agent_id,
                error="NO_LLM_OR_TOOLS",
            )

        # Chuẩn bị tool definitions cho Ollama
        tool_defs = [tool.to_ollama_format() for tool in self._tools.values()]
        tool_handlers = {
            name: tool.handler
            for name, tool in self._tools.items()
            if tool.handler is not None
        }

        # Transition: → WAITING_TOOL
        self.state.transition(
            AgentPhase.WAITING_TOOL,
            reason="Gọi LLM với tools",
        )

        # Gọi LLM với function calling
        result = self.llm_engine.call_with_tools(
            messages=messages,
            tools=tool_defs,
            temperature=self.default_temperature,
            auto_execute=True,
            tool_handlers=tool_handlers,
        )

        # Transition: WAITING_TOOL → ACTING
        self.state.transition(
            AgentPhase.ACTING,
            reason="Tool results received",
        )

        # Process result
        tool_calls_made = result.get("tool_calls", [])
        tool_results = result.get("results", [])

        # Cache tool results
        for i, call in enumerate(tool_calls_made):
            func_name = call.get("function", {}).get("name", "")
            func_args = call.get("function", {}).get("arguments", {})
            args_hash = hashlib.md5(
                json.dumps(func_args, sort_keys=True).encode()
            ).hexdigest()
            if i < len(tool_results):
                context.cache_tool_result(func_name, args_hash, tool_results[i])

        if result["type"] == "tool_results":
            # Gọi LLM lần 2 với tool results để tạo final response
            tool_context = "\n".join(
                f"Tool '{r['function']}': {json.dumps(r.get('result', r.get('error', 'N/A')), ensure_ascii=False)}"
                for r in tool_results
            )
            messages.append({
                "role": "assistant",
                "content": f"Tool results:\n{tool_context}",
            })
            messages.append({
                "role": "user",
                "content": "Dựa trên kết quả từ tools, hãy trả lời hoàn chỉnh.",
            })

            final_response = self._call_llm(messages, temperature=0.5)
            return AgentResult(
                success=True,
                content=final_response,
                agent_id=self.agent_id,
                tool_calls_made=[
                    {"function": c.get("function", {}).get("name", ""), "args": c.get("function", {}).get("arguments", {})}
                    for c in tool_calls_made
                ],
                data={"tool_results": tool_results},
            )

        elif result["type"] == "text":
            return AgentResult(
                success=True,
                content=result.get("content", ""),
                agent_id=self.agent_id,
            )

        else:
            return AgentResult(
                success=False,
                content=result.get("content", "LLM không trả lời."),
                agent_id=self.agent_id,
                error=f"Unexpected result type: {result['type']}",
            )

    # ════════════════════════════════════════════════
    # UTILITY METHODS
    # ════════════════════════════════════════════════

    def _detect_language(self, text: str) -> str:
        """Detect ngôn ngữ đơn giản (EN/VI)."""
        vietnamese_chars = set("àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ")
        vi_count = sum(1 for c in text.lower() if c in vietnamese_chars)
        return "vi" if vi_count > len(text) * 0.02 else "en"

    def _build_context_summary(self, context: AgentContext) -> str:
        """Tạo context summary text cho LLM prompt."""
        parts = []

        if context.learner:
            learner = context.learner
            parts.append(f"Learner: {learner.display_name or learner.learner_id}")
            if learner.weak_concepts:
                parts.append(f"Weak concepts: {', '.join(learner.weak_concepts[:5])}")
            parts.append(f"Study streak: {learner.study_streak} days")
            parts.append(f"Preferred difficulty: {learner.preferred_difficulty}")

        if context.document:
            doc = context.document
            parts.append(f"Document: {doc.title or doc.document_id}")
            if doc.key_concepts:
                parts.append(f"Key concepts: {', '.join(doc.key_concepts[:5])}")

        return "\n".join(parts) if parts else "No additional context."

    def has_capability(self, capability: AgentCapability) -> bool:
        """Kiểm tra agent có khả năng cụ thể không."""
        return capability in self.capabilities

    def get_info(self) -> Dict[str, Any]:
        """Thông tin agent cho registry/debugging."""
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "capabilities": [c.value for c in self.capabilities],
            "tools": [t.name for t in self._tools.values()],
            "state": self.state.get_stats(),
            "metrics": self._metrics,
            "thinking_mode": self.thinking_mode,
            "llm_available": self.llm_engine is not None,
        }

    def __repr__(self) -> str:
        return (
            f"<{self.__class__.__name__}(id={self.agent_id}, "
            f"name={self.name}, "
            f"capabilities={[c.value for c in self.capabilities]}, "
            f"state={self.state.phase.value})>"
        )
