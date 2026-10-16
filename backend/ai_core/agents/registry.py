"""
NEUROVAULT — Agent Registry
Quản lý đăng ký, tìm kiếm, và lifecycle của agents.
Tự viết 100% — KHÔNG dùng framework bên ngoài.

Features:
- Dynamic agent registration/deregistration
- Capability-based lookup (tìm agent theo khả năng)
- Health monitoring (kiểm tra state của tất cả agents)
- Singleton pattern (1 registry per application)
"""

import time
from typing import Optional, Dict, Any, List, Set
from agents.base_agent import BaseAgent, AgentCapability


class AgentRegistry:
    """
    Central registry cho tất cả agents trong hệ thống.
    
    Chức năng:
    - Đăng ký/huỷ đăng ký agents
    - Tìm agent theo ID hoặc capability
    - Health check toàn hệ thống
    - Thống kê tổng hợp
    """

    def __init__(self):
        self._agents: Dict[str, BaseAgent] = {}
        self._capability_index: Dict[AgentCapability, Set[str]] = {}
        self._registered_at: Dict[str, float] = {}

    def register(self, agent: BaseAgent) -> None:
        """
        Đăng ký agent vào registry.
        
        Args:
            agent: BaseAgent instance
            
        Raises:
            ValueError: Nếu agent_id đã tồn tại
        """
        if agent.agent_id in self._agents:
            raise ValueError(
                f"Agent '{agent.agent_id}' đã được đăng ký. "
                f"Dùng deregister() trước khi đăng ký lại."
            )

        self._agents[agent.agent_id] = agent
        self._registered_at[agent.agent_id] = time.time()

        # Index capabilities
        for cap in agent.capabilities:
            if cap not in self._capability_index:
                self._capability_index[cap] = set()
            self._capability_index[cap].add(agent.agent_id)

        print(
            f"[Registry] Đăng ký agent: {agent.agent_id} "
            f"({agent.name}) — capabilities: "
            f"{[c.value for c in agent.capabilities]}"
        )

    def deregister(self, agent_id: str) -> Optional[BaseAgent]:
        """
        Huỷ đăng ký agent.
        
        Returns:
            Agent instance đã bị huỷ, hoặc None nếu không tìm thấy
        """
        agent = self._agents.pop(agent_id, None)
        if agent:
            # Xoá khỏi capability index
            for cap in agent.capabilities:
                cap_set = self._capability_index.get(cap)
                if cap_set:
                    cap_set.discard(agent_id)
                    if not cap_set:
                        del self._capability_index[cap]
            self._registered_at.pop(agent_id, None)
            print(f"[Registry] Huỷ đăng ký agent: {agent_id}")
        return agent

    def get(self, agent_id: str) -> Optional[BaseAgent]:
        """Lấy agent theo ID."""
        return self._agents.get(agent_id)

    def get_by_capability(
        self,
        capability: AgentCapability,
        prefer_available: bool = True,
    ) -> List[BaseAgent]:
        """
        Tìm agents có khả năng cụ thể.
        
        Args:
            capability: Khả năng cần tìm
            prefer_available: Nếu True, ưu tiên agents đang IDLE
            
        Returns:
            Danh sách agents, sắp xếp theo availability
        """
        agent_ids = self._capability_index.get(capability, set())
        agents = [self._agents[aid] for aid in agent_ids if aid in self._agents]

        if prefer_available:
            # Sắp xếp: IDLE trước, sau đó theo ít request nhất
            agents.sort(
                key=lambda a: (
                    0 if a.state.is_available else 1,
                    a._metrics.get("total_requests", 0),
                )
            )

        return agents

    def find_best_agent(
        self,
        capability: AgentCapability,
    ) -> Optional[BaseAgent]:
        """
        Tìm agent tốt nhất cho capability.
        Ưu tiên: available > least loaded > highest success rate.
        
        Returns:
            Agent tốt nhất, hoặc None nếu không tìm thấy
        """
        candidates = self.get_by_capability(capability, prefer_available=True)
        if not candidates:
            return None

        # Ưu tiên agent đang available
        available = [a for a in candidates if a.state.is_available]
        if available:
            return available[0]

        # Không có agent nào available — trả về agent có ít request nhất
        return candidates[0]

    def list_agents(self) -> List[Dict[str, Any]]:
        """Liệt kê tất cả agents đã đăng ký."""
        return [agent.get_info() for agent in self._agents.values()]

    def list_capabilities(self) -> Dict[str, List[str]]:
        """Liệt kê capabilities và agents tương ứng."""
        return {
            cap.value: list(agent_ids)
            for cap, agent_ids in self._capability_index.items()
        }

    def health_check(self) -> Dict[str, Any]:
        """Health check toàn bộ registry."""
        total = len(self._agents)
        available = sum(1 for a in self._agents.values() if a.state.is_available)
        busy = sum(1 for a in self._agents.values() if a.state.is_busy)
        errors = sum(1 for a in self._agents.values() if a.state.phase.value == "error")

        agent_health = {}
        for aid, agent in self._agents.items():
            agent_health[aid] = {
                "name": agent.name,
                "state": agent.state.phase.value,
                "available": agent.state.is_available,
                "metrics": agent._metrics,
            }

        return {
            "total_agents": total,
            "available": available,
            "busy": busy,
            "in_error": errors,
            "capabilities": self.list_capabilities(),
            "agents": agent_health,
        }

    def get_stats(self) -> Dict[str, Any]:
        """Thống kê tổng hợp."""
        total_requests = sum(
            a._metrics.get("total_requests", 0) for a in self._agents.values()
        )
        total_successful = sum(
            a._metrics.get("successful", 0) for a in self._agents.values()
        )

        return {
            "total_agents": len(self._agents),
            "total_requests_processed": total_requests,
            "total_successful": total_successful,
            "success_rate": round(
                total_successful / max(total_requests, 1), 4
            ),
            "capabilities_available": len(self._capability_index),
        }

    @property
    def agent_count(self) -> int:
        return len(self._agents)

    def __contains__(self, agent_id: str) -> bool:
        return agent_id in self._agents

    def __repr__(self) -> str:
        return (
            f"AgentRegistry(agents={self.agent_count}, "
            f"capabilities={len(self._capability_index)})"
        )
