"""
NEUROVAULT — Path Planning Agent
Đưa ra gợi ý lộ trình học và kế hoạch học tập.
"""

from typing import Any, List, Dict
from agents.base_agent import BaseAgent, AgentCapability, ToolDefinition, AgentResult
from agents.agent_message import AgentMessage
from agents.agent_context import AgentContext

class PathPlanningAgent(BaseAgent):
    """
    Path Planning Agent — lập lộ trình học tập cá nhân hóa.
    
    Features:
    - Gợi ý khái niệm tiếp theo dựa trên ZPD (Zone of Proximal Development)
    - Tạo kế hoạch học tập (study plan) hàng ngày
    """

    def __init__(
        self,
        llm_engine: Any = None,
        path_optimizer: Any = None,
        dkt: Any = None,
        graph_builder: Any = None,
        doc_store_func: Any = None,
    ):
        self.path_optimizer = path_optimizer
        self.dkt = dkt
        self.graph_builder = graph_builder
        self.doc_store_func = doc_store_func

        super().__init__(
            agent_id="path_planning_agent",
            name="Path Planning Agent",
            description="Tư vấn lộ trình học tập và gợi ý bài học tiếp theo",
            capabilities=[AgentCapability.PATH_PLANNING, AgentCapability.CHAT],
            llm_engine=llm_engine,
            max_retries=2,
            thinking_mode=True,  # Bắt buộc bật để pass state machine (idle -> thinking -> waiting_tool)
            default_temperature=0.5,
            default_max_tokens=2048,
        )

    def get_tools(self) -> List[ToolDefinition]:
        tools = []
        if self.path_optimizer and self.doc_store_func and self.graph_builder and self.dkt:
            tools.append(ToolDefinition(
                name="get_next_concepts",
                description="Get the most optimal concepts to study next based on current knowledge",
                parameters={
                    "learner_id": {"type": "string"},
                    "document_id": {"type": "string"},
                    "num_recommendations": {"type": "integer"},
                },
                required_params=["learner_id", "document_id"],
                handler=self._tool_get_next_concepts,
            ))
            tools.append(ToolDefinition(
                name="generate_study_plan",
                description="Generate a daily study plan for the learner",
                parameters={
                    "learner_id": {"type": "string"},
                    "document_id": {"type": "string"},
                    "days": {"type": "integer"},
                },
                required_params=["learner_id", "document_id", "days"],
                handler=self._tool_generate_study_plan,
            ))
        return tools

    def get_system_prompt(self, context: AgentContext) -> str:
        lang = context.learner.language if context.learner else "en"
        doc_id = context.document.document_id if context.document else "Không có tài liệu"
        
        if lang == "vi":
            return f"""Bạn là NeuroVault Path Planner — Cố vấn lộ trình học tập AI.

## TÀI LIỆU HIỆN TẠI:
{doc_id}

## NHIỆM VỤ:
1. Gợi ý các chủ đề/khái niệm nên học tiếp theo dựa trên kiến thức hiện tại.
2. Lập kế hoạch học tập chi tiết (theo ngày) nếu được yêu cầu.

## QUY TẮC:
- Nếu người học hỏi "nên học gì tiếp theo" hoặc "tạo lịch học", BẮT BUỘC sử dụng tool `get_next_concepts` hoặc `generate_study_plan` để lấy dữ liệu thực tế. Không tự bịa ra lộ trình.
- Truyền tham số `document_id` chính xác (bạn đã biết tài liệu đang mở là gì).
- Trình bày lộ trình rõ ràng (dùng Markdown, bullet points).
- Ngôn ngữ: Tiếng Việt, khích lệ và mang tính định hướng cao."""
        else:
            return f"""You are NeuroVault Path Planner — an AI learning path advisor.

## CURRENT DOCUMENT:
{doc_id}

## TASKS:
1. Recommend the next topics/concepts to study based on current knowledge.
2. Generate detailed daily study plans if requested.

## RULES:
- If the learner asks "what to study next" or "create a study plan", you MUST use the `get_next_concepts` or `generate_study_plan` tools to get factual data. Do not make up a path.
- Pass the correct `document_id` parameter (you know which document is currently open).
- Present the path clearly (use Markdown, bullet points).
- Language: English, encouraging and highly directive."""

    def process(self, message: AgentMessage, context: AgentContext) -> AgentResult:
        query = message.content.get("query", "")
        lang = message.content.get("language", context.learner.language if context.learner else "en")
        
        # Xử lý khi input rỗng
        if not query.strip():
            return AgentResult(
                success=False,
                content="Vui lòng cho tôi biết bạn cần lập lộ trình học tập như thế nào." if lang == "vi" else "Please tell me how you want to plan your study path.",
                data={"error": "empty_query"}
            )
            
        system_prompt = self.get_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        
        history = context.get_llm_messages(last_n=4)
        messages.extend(history)
        
        if not history or history[-1].get("content") != query:
            messages.append({"role": "user", "content": query})
            
        try:
            # Fallback khi LLM offline
            if not self.llm_engine:
                return self._generate_offline_response(query, context, lang)
                
            result = self._call_llm_with_tools(messages, context)
            
            # Ghi nhận hoạt động vào context
            context.set_scratch("path_planning_agent", "last_interaction", "path_planned")
            
            return result
        except Exception as e:
            fallback = self._generate_offline_response(query, context, lang)
            fallback.data["error"] = str(e)
            return fallback

    def _generate_offline_response(self, query: str, context: AgentContext, lang: str) -> AgentResult:
        """Fallback khi LLM không hoạt động."""
        if lang == "vi":
            content = "Hệ thống AI lập lộ trình học tập đang ngoại tuyến (Ollama chưa chạy). Vui lòng kiểm tra lại kết nối LLM."
        else:
            content = "The path planning AI system is currently offline (Ollama is not running). Please check the LLM connection."
            
        return AgentResult(
            success=True,
            content=content,
            data={"offline": True, "fallback": True}
        )

    def _build_graph_and_mastery(self, document_id: str, learner_id: str) -> Dict:
        """Helper để build graph và lấy mastery."""
        store = self.doc_store_func(document_id)
        if not store:
            return None
            
        chunks = store["chunks"]
        graph = self.graph_builder.build(chunks, document_id, learner_id)
        
        mastery = {}
        for node in graph["nodes"]:
            mastery[node["concept"]] = self.dkt.predict_mastery(learner_id, node["concept"])
            
        return {"graph": graph, "mastery": mastery}

    def _tool_get_next_concepts(self, learner_id: str, document_id: str, num_recommendations: int = 5) -> Dict:
        """Lấy danh sách các khái niệm tối ưu nhất để học tiếp theo."""
        data = self._build_graph_and_mastery(document_id, learner_id)
        if not data:
            return {"status": "document_not_found"}
            
        recs = self.path_optimizer.get_next_concepts(
            concepts=data["graph"]["nodes"],
            edges=data["graph"]["edges"],
            mastery=data["mastery"],
            n=num_recommendations,
        )
        return {"recommendations": recs}

    def _tool_generate_study_plan(self, learner_id: str, document_id: str, days: int) -> Dict:
        """Tạo kế hoạch học tập theo ngày."""
        data = self._build_graph_and_mastery(document_id, learner_id)
        if not data:
            return {"status": "document_not_found"}
            
        plan = self.path_optimizer.generate_study_plan(
            concepts=data["graph"]["nodes"],
            edges=data["graph"]["edges"],
            mastery=data["mastery"],
            days=days,
        )
        return {"study_plan": plan}
