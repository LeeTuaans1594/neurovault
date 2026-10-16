"""
NEUROVAULT — Agent Memory System
Hệ thống quản lý bộ nhớ 4 tầng cho agents: Working, Short-term, Episodic, Long-term.
Sử dụng lưu trữ cục bộ (JSON/local file system) để đảm bảo 100% offline, data sovereignty.
"""

import os
import json
import time
from typing import Dict, Any, List, Optional
from collections import OrderedDict
from datetime import datetime

# Thư mục lưu trữ bộ nhớ
MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "memory")


class WorkingMemory:
    """
    Tầng 1: Bộ nhớ làm việc (Working Memory)
    - Tuổi thọ ngắn nhất (chỉ trong 1 agent turn).
    - Lưu trữ trạng thái reasoning, variables tạm thời.
    """
    def __init__(self):
        self.state: Dict[str, Any] = {}
        
    def set(self, key: str, value: Any) -> None:
        self.state[key] = value
        
    def get(self, key: str, default: Any = None) -> Any:
        return self.state.get(key, default)
        
    def clear(self) -> None:
        self.state.clear()


class ShortTermMemory:
    """
    Tầng 2: Bộ nhớ ngắn hạn (Short-term Memory)
    - Tuổi thọ trong 1 session / conversation.
    - Lưu trữ lịch sử chat gần đây, tool cache.
    """
    def __init__(self, max_turns: int = 50):
        self.max_turns = max_turns
        self.turns: List[Dict[str, Any]] = []
        self.scratchpad: OrderedDict[str, Any] = OrderedDict()
        self.max_scratch = 100
        
    def add_turn(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Thêm một turn vào lịch sử hội thoại."""
        if len(self.turns) >= self.max_turns:
            # Giữ lại system prompt nếu có
            if self.turns and self.turns[0].get("role") == "system":
                self.turns = [self.turns[0]] + self.turns[-(self.max_turns - 2):]
            else:
                self.turns = self.turns[-(self.max_turns - 1):]
                
        self.turns.append({
            "role": role,
            "content": content,
            "timestamp": time.time(),
            "metadata": metadata or {}
        })
        
    def get_recent_turns(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Lấy các turns gần đây nhất."""
        return self.turns[-limit:] if limit > 0 else self.turns
        
    def set_scratch(self, key: str, value: Any) -> None:
        """Lưu trữ dữ liệu tạm thời (ví dụ: tool result cache)."""
        if len(self.scratchpad) >= self.max_scratch:
            self.scratchpad.popitem(last=False)
        self.scratchpad[key] = value
        
    def get_scratch(self, key: str, default: Any = None) -> Any:
        """Lấy dữ liệu tạm thời."""
        return self.scratchpad.get(key, default)


class EpisodicMemory:
    """
    Tầng 3: Ký ức sự kiện (Episodic Memory)
    - Lưu trữ các sự kiện, tóm tắt các phiên học (sessions) trong quá khứ.
    - Giúp AI nhớ lại: "Lần trước mình đã dạy tới đâu?"
    """
    def __init__(self, learner_id: str):
        self.learner_id = learner_id
        self.file_path = os.path.join(MEMORY_DIR, f"episodic_{self.learner_id}.json")
        self.episodes: List[Dict[str, Any]] = self._load()
        
    def _load(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
        return []
        
    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as f:
            # Giữ lại tối đa 100 episodes gần nhất để tránh file quá lớn
            json.dump(self.episodes[-100:], f, ensure_ascii=False, indent=2)
            
    def record_episode(self, event_type: str, details: Dict[str, Any]) -> None:
        """Ghi lại một sự kiện/kết thúc session."""
        self.episodes.append({
            "id": f"ep_{int(time.time()*1000)}",
            "type": event_type,
            "details": details,
            "timestamp": time.time(),
            "date": datetime.now().isoformat()
        })
        self._save()
        
    def retrieve_recent_episodes(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Lấy các episodes gần đây nhất."""
        return self.episodes[-limit:] if limit > 0 else self.episodes


class LongTermMemory:
    """
    Tầng 4: Bộ nhớ dài hạn (Long-term / Semantic Memory)
    - Lưu trữ facts, preferences, knowledge graph liên quan đến learner.
    - Ví dụ: "Học sinh học tốt môn Toán", "Học sinh thích giải thích qua ví dụ thực tế".
    """
    def __init__(self, learner_id: str):
        self.learner_id = learner_id
        self.file_path = os.path.join(MEMORY_DIR, f"semantic_{self.learner_id}.json")
        self.facts: Dict[str, Any] = self._load()
        
    def _load(self) -> Dict[str, Any]:
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}
        
    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(self.facts, f, ensure_ascii=False, indent=2)
            
    def update_fact(self, category: str, fact_key: str, fact_value: Any) -> None:
        """Cập nhật một fact về learner vào category tương ứng."""
        if category not in self.facts:
            self.facts[category] = {}
        self.facts[category][fact_key] = {
            "value": fact_value,
            "last_updated": time.time()
        }
        self._save()
        
    def get_fact(self, category: str, fact_key: str, default: Any = None) -> Any:
        """Lấy giá trị của một fact."""
        return self.facts.get(category, {}).get(fact_key, {}).get("value", default)

    def get_category(self, category: str) -> Dict[str, Any]:
        """Trả về toàn bộ category dưới dạng dict {key: value}."""
        cat_data = self.facts.get(category, {})
        return {k: v["value"] for k, v in cat_data.items()}


class MemoryManager:
    """
    Facade class quản lý thống nhất tất cả 4 tầng memory cho một learner.
    Cung cấp API đơn giản cho Agents thao tác với bộ nhớ.
    """
    def __init__(self, learner_id: str = "default_learner"):
        self.learner_id = learner_id
        self.working = WorkingMemory()
        self.short_term = ShortTermMemory()
        self.episodic = EpisodicMemory(learner_id)
        self.long_term = LongTermMemory(learner_id)
        
    def archive_session(self, session_summary: str, extra_details: Optional[Dict[str, Any]] = None) -> None:
        """
        Gói gọn session hiện tại, tạo tóm tắt và lưu vào Episodic Memory.
        Thông thường được gọi khi kết thúc 1 phiên học (AgentOrchestrator).
        """
        details = {
            "summary": session_summary,
            "turns_count": len(self.short_term.turns),
        }
        if extra_details:
            details.update(extra_details)
            
        self.episodic.record_episode("session_archive", details)
        
    def learn_fact(self, fact_str: str, category: str = "general") -> None:
        """
        Trích xuất và lưu trữ kiến thức mới vào Long-term Memory.
        Sử dụng một key đơn giản dựa trên timestamp (hoặc có thể được override).
        """
        fact_key = f"fact_{int(time.time()*1000)}"
        self.long_term.update_fact(category, fact_key, fact_str)
        
    def retrieve_context(self) -> Dict[str, Any]:
        """
        Trả về ngữ cảnh tổng hợp từ cả 4 tầng bộ nhớ, 
        dùng để tiêm vào prompt cho LLM.
        """
        return {
            "working_memory_keys": list(self.working.state.keys()),
            "recent_turns_count": len(self.short_term.turns),
            "recent_episodes": self.episodic.retrieve_recent_episodes(limit=3),
            "learner_preferences": self.long_term.get_category("preferences"),
            "learner_facts": self.long_term.get_category("general")
        }
