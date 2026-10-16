"""
NEUROVAULT — Agent Context
Shared context giữa các agents trong một session/conversation.
Lưu trữ thông tin về learner, document, conversation history,
và tool results để agents có thể chia sẻ state.

Tự viết 100% — KHÔNG dùng framework bên ngoài.

Features:
- Per-conversation context isolation
- Short-term memory (current session)
- Working memory (active reasoning state)
- Tool results cache
- Learner profile access
"""

import time
import uuid
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from collections import OrderedDict


@dataclass
class LearnerProfile:
    """Thông tin learner trong context — được truyền giữa agents."""
    learner_id: str
    display_name: str = ""
    language: str = "en"
    mastery_snapshot: Dict[str, float] = field(default_factory=dict)
    weak_concepts: List[str] = field(default_factory=list)
    learning_velocity: float = 0.0
    study_streak: int = 0
    total_interactions: int = 0
    preferred_difficulty: float = 0.5

    def to_dict(self) -> Dict[str, Any]:
        return {
            "learner_id": self.learner_id,
            "display_name": self.display_name,
            "language": self.language,
            "mastery_snapshot": self.mastery_snapshot,
            "weak_concepts": self.weak_concepts,
            "learning_velocity": self.learning_velocity,
            "study_streak": self.study_streak,
            "total_interactions": self.total_interactions,
            "preferred_difficulty": self.preferred_difficulty,
        }


@dataclass
class DocumentContext:
    """Thông tin document đang được làm việc."""
    document_id: str
    title: str = ""
    language: str = "en"
    total_chunks: int = 0
    total_concepts: int = 0
    key_concepts: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "title": self.title,
            "language": self.language,
            "total_chunks": self.total_chunks,
            "total_concepts": self.total_concepts,
            "key_concepts": self.key_concepts,
        }


class AgentContext:
    """
    Shared context cho một conversation session.
    
    Mỗi conversation có 1 AgentContext instance, được truyền
    giữa các agents khi chúng xử lý request.
    
    Memory layers:
    1. Working memory: Trạng thái reasoning hiện tại (bị xoá mỗi turn)
    2. Short-term memory: Lịch sử conversation hiện tại
    3. Tool cache: Kết quả tool calls (tránh duplicate)
    """

    # Giới hạn memory để tránh memory leak
    MAX_SHORT_TERM_ENTRIES = 100
    MAX_TOOL_CACHE_ENTRIES = 50
    MAX_CONVERSATION_TURNS = 50

    def __init__(
        self,
        conversation_id: str = "",
        learner: Optional[LearnerProfile] = None,
        document: Optional[DocumentContext] = None,
    ):
        self.conversation_id = conversation_id or str(uuid.uuid4())
        self.created_at = time.time()
        self.last_activity = time.time()

        # Learner và document context
        self.learner = learner
        self.document = document

        # Working memory — reset mỗi agent turn
        self._working_memory: Dict[str, Any] = {}

        # Short-term memory — lịch sử trong session hiện tại
        self._short_term: OrderedDict[str, Any] = OrderedDict()

        # Conversation history — danh sách messages user↔agent
        self._conversation_turns: List[Dict[str, Any]] = []

        # Tool results cache — tránh gọi tool trùng lặp
        self._tool_cache: OrderedDict[str, Any] = OrderedDict()

        # Agent-specific scratchpad — mỗi agent có vùng riêng
        self._agent_scratch: Dict[str, Dict[str, Any]] = {}

        # Global metadata
        self._metadata: Dict[str, Any] = {}

    # ──── Working Memory ────
    def set_working(self, key: str, value: Any) -> None:
        """Lưu vào working memory (active reasoning state)."""
        self._working_memory[key] = value
        self.last_activity = time.time()

    def get_working(self, key: str, default: Any = None) -> Any:
        """Đọc từ working memory."""
        return self._working_memory.get(key, default)

    def clear_working(self) -> None:
        """Xoá working memory (gọi khi bắt đầu turn mới)."""
        self._working_memory.clear()

    # ──── Short-term Memory ────
    def remember(self, key: str, value: Any) -> None:
        """Lưu vào short-term memory."""
        if len(self._short_term) >= self.MAX_SHORT_TERM_ENTRIES:
            # Xoá entry cũ nhất (FIFO)
            self._short_term.popitem(last=False)
        self._short_term[key] = {
            "value": value,
            "timestamp": time.time(),
        }
        self.last_activity = time.time()

    def recall(self, key: str, default: Any = None) -> Any:
        """Đọc từ short-term memory."""
        entry = self._short_term.get(key)
        return entry["value"] if entry else default

    def forget(self, key: str) -> None:
        """Xoá một entry khỏi short-term memory."""
        self._short_term.pop(key, None)

    # ──── Conversation Turns ────
    def add_turn(
        self,
        role: str,
        content: str,
        agent_id: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Thêm một turn vào conversation history.
        
        Args:
            role: "user", "assistant", "system"
            content: Nội dung
            agent_id: ID agent xử lý (nếu role=assistant)
            metadata: Thông tin bổ sung
        """
        if len(self._conversation_turns) >= self.MAX_CONVERSATION_TURNS:
            # Giữ lại turn đầu tiên (system prompt) + xoá cũ nhất
            if self._conversation_turns and self._conversation_turns[0].get("role") == "system":
                self._conversation_turns = [self._conversation_turns[0]] + \
                    self._conversation_turns[-(self.MAX_CONVERSATION_TURNS - 2):]
            else:
                self._conversation_turns = self._conversation_turns[-(self.MAX_CONVERSATION_TURNS - 1):]

        self._conversation_turns.append({
            "role": role,
            "content": content,
            "agent_id": agent_id,
            "timestamp": time.time(),
            "metadata": metadata or {},
        })
        self.last_activity = time.time()

    def get_conversation_history(
        self,
        last_n: int = 10,
        role_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lấy conversation history gần đây."""
        turns = self._conversation_turns
        if role_filter:
            turns = [t for t in turns if t["role"] == role_filter]
        return turns[-last_n:] if last_n > 0 else turns

    def get_llm_messages(self, last_n: int = 10) -> List[Dict[str, str]]:
        """
        Chuyển conversation history thành format cho LLM (role + content).
        Phù hợp với Ollama /api/chat format.
        """
        turns = self._conversation_turns[-last_n:] if last_n > 0 else self._conversation_turns
        return [
            {"role": t["role"], "content": t["content"]}
            for t in turns
            if t["role"] in ("user", "assistant", "system")
        ]

    # ──── Tool Cache ────
    def cache_tool_result(
        self,
        tool_name: str,
        args_hash: str,
        result: Any,
        ttl_seconds: float = 300.0,
    ) -> None:
        """
        Cache kết quả tool call — tránh gọi lại trùng.
        
        Args:
            tool_name: Tên tool
            args_hash: Hash của arguments (để identify duplicate calls)
            result: Kết quả
            ttl_seconds: Time-to-live (giây)
        """
        cache_key = f"{tool_name}:{args_hash}"
        if len(self._tool_cache) >= self.MAX_TOOL_CACHE_ENTRIES:
            self._tool_cache.popitem(last=False)

        self._tool_cache[cache_key] = {
            "result": result,
            "cached_at": time.time(),
            "ttl": ttl_seconds,
        }

    def get_cached_tool_result(
        self,
        tool_name: str,
        args_hash: str,
    ) -> Optional[Any]:
        """Lấy cached tool result (trả về None nếu expired hoặc không tồn tại)."""
        cache_key = f"{tool_name}:{args_hash}"
        entry = self._tool_cache.get(cache_key)
        if not entry:
            return None

        # Kiểm tra TTL
        elapsed = time.time() - entry["cached_at"]
        if elapsed > entry["ttl"]:
            del self._tool_cache[cache_key]
            return None

        return entry["result"]

    # ──── Agent Scratchpad ────
    def set_scratch(self, agent_id: str, key: str, value: Any) -> None:
        """Lưu vào scratchpad riêng của agent."""
        if agent_id not in self._agent_scratch:
            self._agent_scratch[agent_id] = {}
        self._agent_scratch[agent_id][key] = value

    def get_scratch(self, agent_id: str, key: str, default: Any = None) -> Any:
        """Đọc từ scratchpad riêng của agent."""
        return self._agent_scratch.get(agent_id, {}).get(key, default)

    def clear_scratch(self, agent_id: str) -> None:
        """Xoá scratchpad của agent."""
        self._agent_scratch.pop(agent_id, None)

    # ──── Metadata ────
    def set_metadata(self, key: str, value: Any) -> None:
        """Set global metadata."""
        self._metadata[key] = value

    def get_metadata(self, key: str, default: Any = None) -> Any:
        """Get global metadata."""
        return self._metadata.get(key, default)

    # ──── Utilities ────
    def to_summary(self) -> Dict[str, Any]:
        """Tóm tắt context cho debugging/logging."""
        return {
            "conversation_id": self.conversation_id,
            "created_at": self.created_at,
            "last_activity": self.last_activity,
            "learner": self.learner.to_dict() if self.learner else None,
            "document": self.document.to_dict() if self.document else None,
            "working_memory_keys": list(self._working_memory.keys()),
            "short_term_entries": len(self._short_term),
            "conversation_turns": len(self._conversation_turns),
            "tool_cache_entries": len(self._tool_cache),
            "active_agent_scratches": list(self._agent_scratch.keys()),
            "metadata": self._metadata,
        }

    @property
    def session_duration_sec(self) -> float:
        """Thời gian session hiện tại (giây)."""
        return time.time() - self.created_at
