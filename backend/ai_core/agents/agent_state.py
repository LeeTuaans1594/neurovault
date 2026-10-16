"""
NEUROVAULT — Agent State Machine
Quản lý lifecycle và trạng thái của agent thông qua state machine pattern.
Tự viết 100% — KHÔNG dùng framework bên ngoài.

States:
    IDLE → THINKING → ACTING → RESPONDING → IDLE
         → ERROR → IDLE (recovery)
         → WAITING_TOOL → ACTING (tool result received)
         → WAITING_HANDOFF → IDLE (handoff complete)

Features:
- Deterministic state transitions với validation
- Transition history tracking (audit trail)
- Timeout handling cho mỗi state
- State-specific metadata
"""

import time
from typing import Optional, Dict, Any, List, Set
from enum import Enum
from dataclasses import dataclass, field


class AgentPhase(Enum):
    """
    Các trạng thái trong lifecycle của một agent.
    
    Flow chính:
    IDLE → THINKING → ACTING → RESPONDING → IDLE
    
    Flow phụ:
    THINKING → WAITING_TOOL → ACTING (khi cần gọi tool)
    ACTING → WAITING_HANDOFF → IDLE (khi chuyển giao)
    * → ERROR → IDLE (khi có lỗi)
    """
    IDLE = "idle"                       # Sẵn sàng nhận request mới
    THINKING = "thinking"               # Đang phân tích, reasoning
    ACTING = "acting"                   # Đang thực thi hành động (gọi AI, query DB...)
    RESPONDING = "responding"           # Đang tạo response
    WAITING_TOOL = "waiting_tool"       # Chờ kết quả từ tool execution
    WAITING_HANDOFF = "waiting_handoff" # Chờ agent khác hoàn thành
    ERROR = "error"                     # Gặp lỗi, cần recovery
    SHUTDOWN = "shutdown"               # Agent đã dừng hoạt động


# Bảng chuyển trạng thái hợp lệ
VALID_TRANSITIONS: Dict[AgentPhase, Set[AgentPhase]] = {
    AgentPhase.IDLE: {
        AgentPhase.THINKING,      # Nhận request mới
        AgentPhase.SHUTDOWN,      # Dừng agent
        AgentPhase.ERROR,         # Lỗi ngay từ đầu
    },
    AgentPhase.THINKING: {
        AgentPhase.ACTING,        # Đã phân tích xong, bắt đầu hành động
        AgentPhase.RESPONDING,    # Trả lời ngay (không cần action)
        AgentPhase.WAITING_TOOL,  # Cần gọi tool
        AgentPhase.ERROR,         # Lỗi khi thinking
        AgentPhase.IDLE,          # Cancel/abort
    },
    AgentPhase.ACTING: {
        AgentPhase.RESPONDING,    # Hành động xong, tạo response
        AgentPhase.THINKING,      # Cần suy nghĩ thêm (iteration)
        AgentPhase.WAITING_TOOL,  # Cần thêm tool call
        AgentPhase.WAITING_HANDOFF,  # Chuyển giao
        AgentPhase.ERROR,         # Lỗi khi acting
        AgentPhase.IDLE,          # Cancel/abort
    },
    AgentPhase.RESPONDING: {
        AgentPhase.IDLE,          # Trả lời xong
        AgentPhase.THINKING,      # Cần refine (multi-turn)
        AgentPhase.ERROR,         # Lỗi khi responding
    },
    AgentPhase.WAITING_TOOL: {
        AgentPhase.ACTING,        # Tool result received
        AgentPhase.THINKING,      # Re-think after tool
        AgentPhase.ERROR,         # Tool timeout/error
        AgentPhase.IDLE,          # Cancel
    },
    AgentPhase.WAITING_HANDOFF: {
        AgentPhase.RESPONDING,    # Handoff result received
        AgentPhase.IDLE,          # Handoff complete (no response needed)
        AgentPhase.ERROR,         # Handoff failed
    },
    AgentPhase.ERROR: {
        AgentPhase.IDLE,          # Recovery
        AgentPhase.SHUTDOWN,      # Fatal error
    },
    AgentPhase.SHUTDOWN: set(),   # Terminal state — không chuyển đi đâu
}

# Timeout mặc định cho mỗi phase (giây)
DEFAULT_PHASE_TIMEOUTS: Dict[AgentPhase, float] = {
    AgentPhase.IDLE: 0,              # Không timeout
    AgentPhase.THINKING: 30.0,       # 30s để suy nghĩ
    AgentPhase.ACTING: 120.0,        # 2 phút cho LLM inference
    AgentPhase.RESPONDING: 30.0,     # 30s để tạo response
    AgentPhase.WAITING_TOOL: 60.0,   # 1 phút chờ tool
    AgentPhase.WAITING_HANDOFF: 120.0,  # 2 phút chờ handoff
    AgentPhase.ERROR: 10.0,          # 10s để handle error
    AgentPhase.SHUTDOWN: 0,          # Không timeout
}


@dataclass
class TransitionRecord:
    """Ghi lại một lần chuyển trạng thái."""
    from_phase: AgentPhase
    to_phase: AgentPhase
    timestamp: float
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    duration_in_prev_ms: float = 0.0  # Thời gian ở trạng thái trước (ms)


class AgentState:
    """
    State machine quản lý lifecycle của agent.
    
    Features:
    - Validate transitions theo bảng hợp lệ
    - Tracking history cho audit trail
    - Timeout detection cho mỗi phase
    - Phase-specific metadata
    """

    def __init__(
        self,
        agent_id: str,
        initial_phase: AgentPhase = AgentPhase.IDLE,
        custom_timeouts: Optional[Dict[AgentPhase, float]] = None,
    ):
        self.agent_id = agent_id
        self._phase = initial_phase
        self._phase_entered_at = time.time()
        self._phase_metadata: Dict[str, Any] = {}
        self._history: List[TransitionRecord] = []
        self._error_count = 0
        self._total_transitions = 0

        # Merge custom timeouts với defaults
        self._timeouts = dict(DEFAULT_PHASE_TIMEOUTS)
        if custom_timeouts:
            self._timeouts.update(custom_timeouts)

    @property
    def phase(self) -> AgentPhase:
        """Trạng thái hiện tại."""
        return self._phase

    @property
    def is_busy(self) -> bool:
        """Agent đang xử lý (không phải IDLE hoặc SHUTDOWN)."""
        return self._phase not in (AgentPhase.IDLE, AgentPhase.SHUTDOWN)

    @property
    def is_available(self) -> bool:
        """Agent sẵn sàng nhận request mới."""
        return self._phase == AgentPhase.IDLE

    @property
    def is_shutdown(self) -> bool:
        """Agent đã shutdown."""
        return self._phase == AgentPhase.SHUTDOWN

    @property
    def time_in_current_phase_ms(self) -> float:
        """Thời gian đã ở trạng thái hiện tại (ms)."""
        return (time.time() - self._phase_entered_at) * 1000

    @property
    def is_timed_out(self) -> bool:
        """Kiểm tra xem phase hiện tại có bị timeout không."""
        timeout = self._timeouts.get(self._phase, 0)
        if timeout <= 0:
            return False
        elapsed_sec = time.time() - self._phase_entered_at
        return elapsed_sec > timeout

    def can_transition(self, target: AgentPhase) -> bool:
        """Kiểm tra xem có thể chuyển sang trạng thái target không."""
        return target in VALID_TRANSITIONS.get(self._phase, set())

    def transition(
        self,
        target: AgentPhase,
        reason: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TransitionRecord:
        """
        Chuyển sang trạng thái mới.
        
        Args:
            target: Trạng thái đích
            reason: Lý do chuyển
            metadata: Thông tin bổ sung
            
        Returns:
            TransitionRecord ghi lại transition
            
        Raises:
            InvalidTransitionError: Nếu transition không hợp lệ
        """
        if not self.can_transition(target):
            valid = [p.value for p in VALID_TRANSITIONS.get(self._phase, set())]
            raise InvalidTransitionError(
                f"Agent '{self.agent_id}': Không thể chuyển từ "
                f"{self._phase.value} → {target.value}. "
                f"Các trạng thái hợp lệ: {valid}"
            )

        now = time.time()
        duration_ms = (now - self._phase_entered_at) * 1000

        record = TransitionRecord(
            from_phase=self._phase,
            to_phase=target,
            timestamp=now,
            reason=reason,
            metadata=metadata or {},
            duration_in_prev_ms=round(duration_ms, 2),
        )
        self._history.append(record)

        # Cập nhật state
        self._phase = target
        self._phase_entered_at = now
        self._phase_metadata = metadata or {}
        self._total_transitions += 1

        if target == AgentPhase.ERROR:
            self._error_count += 1

        return record

    def force_transition(
        self,
        target: AgentPhase,
        reason: str = "force_override",
    ) -> TransitionRecord:
        """
        Chuyển trạng thái BẤT CHẤP validation.
        Chỉ dùng cho recovery/emergency.
        """
        now = time.time()
        duration_ms = (now - self._phase_entered_at) * 1000

        record = TransitionRecord(
            from_phase=self._phase,
            to_phase=target,
            timestamp=now,
            reason=f"[FORCED] {reason}",
            metadata={"forced": True},
            duration_in_prev_ms=round(duration_ms, 2),
        )
        self._history.append(record)

        self._phase = target
        self._phase_entered_at = now
        self._phase_metadata = {}
        self._total_transitions += 1

        return record

    def check_timeout(self) -> Optional[TransitionRecord]:
        """
        Kiểm tra timeout và tự động chuyển sang ERROR nếu cần.
        Returns TransitionRecord nếu có timeout, None nếu OK.
        """
        if not self.is_timed_out:
            return None

        timeout_sec = self._timeouts.get(self._phase, 0)
        return self.transition(
            AgentPhase.ERROR,
            reason=f"Timeout sau {timeout_sec}s ở phase {self._phase.value}",
            metadata={"timeout_phase": self._phase.value, "timeout_sec": timeout_sec},
        )

    def reset(self) -> TransitionRecord:
        """Reset về IDLE (recovery)."""
        if self._phase == AgentPhase.IDLE:
            # Đã IDLE rồi, trả về record giả
            return TransitionRecord(
                from_phase=AgentPhase.IDLE,
                to_phase=AgentPhase.IDLE,
                timestamp=time.time(),
                reason="already_idle",
            )
        return self.force_transition(AgentPhase.IDLE, reason="manual_reset")

    def get_history(self, last_n: int = 50) -> List[Dict[str, Any]]:
        """Lấy transition history (serialized)."""
        records = self._history[-last_n:] if last_n > 0 else self._history
        return [
            {
                "from": r.from_phase.value,
                "to": r.to_phase.value,
                "reason": r.reason,
                "duration_ms": r.duration_in_prev_ms,
                "metadata": r.metadata,
                "timestamp": r.timestamp,
            }
            for r in records
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Thống kê state machine."""
        return {
            "agent_id": self.agent_id,
            "current_phase": self._phase.value,
            "is_busy": self.is_busy,
            "is_available": self.is_available,
            "total_transitions": self._total_transitions,
            "error_count": self._error_count,
            "time_in_current_phase_ms": round(self.time_in_current_phase_ms, 1),
            "is_timed_out": self.is_timed_out,
        }

    def __repr__(self) -> str:
        return (
            f"AgentState(agent={self.agent_id}, "
            f"phase={self._phase.value}, "
            f"transitions={self._total_transitions})"
        )


class InvalidTransitionError(Exception):
    """Raised khi agent cố chuyển trạng thái không hợp lệ."""
    pass
