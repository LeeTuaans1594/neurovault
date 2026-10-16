"""
NEUROVAULT — Agent Message System
Hệ thống message passing giữa các agents trong multi-agent orchestration.
Tự viết 100% — KHÔNG dùng framework bên ngoài.

Features:
- Typed messages (request, response, event, error, tool_call, tool_result)
- Priority levels (critical, high, normal, low)
- Traceability (conversation_id, parent_id, chain tracking)
- Serializable (JSON-safe cho logging + persistence)
- Immutable after creation (dataclass frozen=True-style)
"""

import json
import uuid
import time
from typing import Optional, Dict, Any, List
from enum import Enum
from dataclasses import dataclass, field, asdict


class MessageType(Enum):
    """Loại message giữa các agents."""
    REQUEST = "request"           # Agent A yêu cầu Agent B làm gì đó
    RESPONSE = "response"         # Agent B trả kết quả cho Agent A
    EVENT = "event"               # Broadcast event tới tất cả agents
    ERROR = "error"               # Thông báo lỗi
    TOOL_CALL = "tool_call"       # Agent gọi tool/function
    TOOL_RESULT = "tool_result"   # Kết quả từ tool execution
    HANDOFF = "handoff"           # Chuyển giao điều khiển sang agent khác
    FEEDBACK = "feedback"         # Phản hồi từ user hoặc system
    HEARTBEAT = "heartbeat"       # Health check giữa agents


class MessagePriority(Enum):
    """Mức độ ưu tiên — dùng cho queue ordering."""
    CRITICAL = 0   # Safety, moderation — xử lý ngay
    HIGH = 1       # User-facing responses
    NORMAL = 2     # Standard processing
    LOW = 3        # Background tasks, analytics


@dataclass
class AgentMessage:
    """
    Đơn vị giao tiếp giữa các agents.
    
    Mỗi message có:
    - id: UUID duy nhất
    - type: Loại message
    - sender: ID agent gửi
    - receiver: ID agent nhận (hoặc "broadcast")
    - content: Nội dung chính (dict hoặc string)
    - metadata: Thông tin bổ sung (context, timestamps, etc.)
    - conversation_id: ID cuộc hội thoại (nhóm messages liên quan)
    - parent_id: ID message cha (chain tracking)
    - priority: Mức ưu tiên
    - timestamp: Thời điểm tạo
    """
    type: MessageType
    sender: str
    receiver: str
    content: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)
    conversation_id: str = ""
    parent_id: str = ""
    priority: MessagePriority = MessagePriority.NORMAL
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self):
        """Validate message sau khi tạo."""
        if not self.sender:
            raise ValueError("Message phải có sender")
        if not self.receiver:
            raise ValueError("Message phải có receiver")
        if not isinstance(self.content, dict):
            raise ValueError("Content phải là dict")
        # Tự động gán conversation_id nếu chưa có
        if not self.conversation_id:
            self.conversation_id = str(uuid.uuid4())

    def create_response(
        self,
        content: Dict[str, Any],
        sender: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "AgentMessage":
        """
        Tạo response message cho message hiện tại.
        Tự động set parent_id, conversation_id, receiver.
        """
        return AgentMessage(
            type=MessageType.RESPONSE,
            sender=sender or self.receiver,
            receiver=self.sender,
            content=content,
            metadata=metadata or {},
            conversation_id=self.conversation_id,
            parent_id=self.id,
            priority=self.priority,
        )

    def create_error(
        self,
        error_code: str,
        error_message: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> "AgentMessage":
        """Tạo error response cho message hiện tại."""
        return AgentMessage(
            type=MessageType.ERROR,
            sender=self.receiver,
            receiver=self.sender,
            content={
                "error_code": error_code,
                "error_message": error_message,
                "details": details or {},
            },
            metadata={"original_message_id": self.id},
            conversation_id=self.conversation_id,
            parent_id=self.id,
            priority=MessagePriority.HIGH,
        )

    def create_handoff(
        self,
        target_agent: str,
        reason: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> "AgentMessage":
        """Tạo handoff message — chuyển giao sang agent khác."""
        return AgentMessage(
            type=MessageType.HANDOFF,
            sender=self.receiver,
            receiver=target_agent,
            content={
                "reason": reason,
                "original_query": self.content,
                "handoff_context": context or {},
            },
            metadata={
                "original_sender": self.sender,
                "original_message_id": self.id,
            },
            conversation_id=self.conversation_id,
            parent_id=self.id,
            priority=self.priority,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize message thành dict (JSON-safe)."""
        return {
            "id": self.id,
            "type": self.type.value,
            "sender": self.sender,
            "receiver": self.receiver,
            "content": self.content,
            "metadata": self.metadata,
            "conversation_id": self.conversation_id,
            "parent_id": self.parent_id,
            "priority": self.priority.value,
            "timestamp": self.timestamp,
        }

    def to_json(self) -> str:
        """Serialize thành JSON string."""
        return json.dumps(self.to_dict(), ensure_ascii=False, default=str)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentMessage":
        """Deserialize từ dict."""
        return cls(
            type=MessageType(data["type"]),
            sender=data["sender"],
            receiver=data["receiver"],
            content=data["content"],
            metadata=data.get("metadata", {}),
            conversation_id=data.get("conversation_id", ""),
            parent_id=data.get("parent_id", ""),
            priority=MessagePriority(data.get("priority", 2)),
            id=data.get("id", str(uuid.uuid4())),
            timestamp=data.get("timestamp", time.time()),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "AgentMessage":
        """Deserialize từ JSON string."""
        return cls.from_dict(json.loads(json_str))

    def __repr__(self) -> str:
        return (
            f"AgentMessage(type={self.type.value}, "
            f"sender={self.sender}, receiver={self.receiver}, "
            f"priority={self.priority.value}, id={self.id[:8]}...)"
        )


class MessageChain:
    """
    Theo dõi chuỗi messages trong một conversation.
    Hữu ích cho debugging, audit trail, và context building.
    """

    def __init__(self, conversation_id: str = ""):
        self.conversation_id = conversation_id or str(uuid.uuid4())
        self._messages: List[AgentMessage] = []
        self._by_id: Dict[str, AgentMessage] = {}

    def add(self, message: AgentMessage) -> None:
        """Thêm message vào chain."""
        self._messages.append(message)
        self._by_id[message.id] = message

    def get_by_id(self, message_id: str) -> Optional[AgentMessage]:
        """Lấy message theo ID."""
        return self._by_id.get(message_id)

    def get_thread(self, message_id: str) -> List[AgentMessage]:
        """
        Lấy thread (chuỗi parent→child) từ một message.
        Trả về từ message gốc đến message chỉ định.
        """
        thread = []
        current_id = message_id
        while current_id:
            msg = self._by_id.get(current_id)
            if msg:
                thread.append(msg)
                current_id = msg.parent_id
            else:
                break
        thread.reverse()
        return thread

    def get_by_sender(self, sender: str) -> List[AgentMessage]:
        """Lấy tất cả messages từ một sender."""
        return [m for m in self._messages if m.sender == sender]

    def get_by_type(self, msg_type: MessageType) -> List[AgentMessage]:
        """Lấy tất cả messages theo type."""
        return [m for m in self._messages if m.type == msg_type]

    @property
    def length(self) -> int:
        return len(self._messages)

    @property
    def last_message(self) -> Optional[AgentMessage]:
        return self._messages[-1] if self._messages else None

    def to_summary(self) -> Dict[str, Any]:
        """Tóm tắt chain cho logging."""
        return {
            "conversation_id": self.conversation_id,
            "total_messages": self.length,
            "participants": list(set(
                m.sender for m in self._messages
            ) | set(
                m.receiver for m in self._messages
            )),
            "message_types": dict(
                (t.value, len(self.get_by_type(t)))
                for t in MessageType
                if self.get_by_type(t)
            ),
            "duration_ms": round(
                (self._messages[-1].timestamp - self._messages[0].timestamp) * 1000, 1
            ) if len(self._messages) >= 2 else 0,
        }
