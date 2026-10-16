"""
NEUROVAULT — Feedback Agent
Phân tích kết quả học tập, đưa ra đánh giá và khuyến nghị cá nhân hóa.
"""

from typing import Any, List, Dict
from agents.base_agent import BaseAgent, AgentCapability, ToolDefinition, AgentResult
from agents.agent_message import AgentMessage
from agents.agent_context import AgentContext

class FeedbackAgent(BaseAgent):
    """
    Feedback Agent — phân tích hiệu suất và đưa ra lời khuyên.
    
    Features:
    - Lấy thông tin thống kê tổng quát từ DKT (Learner Summary)
    - Lấy danh sách khái niệm yếu (Weak Concepts)
    - Phân tích và đưa ra lộ trình/khuyến nghị cải thiện
    """

    def __init__(
        self,
        llm_engine: Any = None,
        dkt: Any = None,
    ):
        self.dkt = dkt

        super().__init__(
            agent_id="feedback_agent",
            name="Feedback Agent",
            description="Phân tích kết quả học tập và đưa ra nhận xét, lời khuyên",
            capabilities=[AgentCapability.FEEDBACK, AgentCapability.CHAT],
            llm_engine=llm_engine,
            max_retries=2,
            thinking_mode=True,  # Bắt buộc bật để pass state machine (idle -> thinking -> waiting_tool)
            default_temperature=0.5,
            default_max_tokens=2048,
        )

    def get_tools(self) -> List[ToolDefinition]:
        tools = []
        if self.dkt:
            tools.append(ToolDefinition(
                name="get_learner_summary",
                description="Lấy thông tin thống kê tổng quát về hiệu suất của học viên",
                parameters={"learner_id": {"type": "string"}},
                required_params=["learner_id"],
                handler=self._tool_get_learner_summary,
            ))
            tools.append(ToolDefinition(
                name="get_weak_concepts",
                description="Lấy danh sách các khái niệm học viên chưa nắm vững",
                parameters={"learner_id": {"type": "string"}},
                required_params=["learner_id"],
                handler=self._tool_get_weak_concepts,
            ))
        return tools

    def get_system_prompt(self, context: AgentContext) -> str:
        lang = context.learner.language if context.learner else "en"
        if lang == "vi":
            return """Bạn là NeuroVault Feedback — Cố vấn học tập AI.

## NHIỆM VỤ:
1. Phân tích kết quả học tập của học viên dựa trên dữ liệu thống kê.
2. Ghi nhận sự tiến bộ (strengths) và chỉ ra các điểm yếu (weaknesses).
3. Đưa ra lời khuyên cụ thể, mang tính xây dựng để cải thiện.

## QUY TẮC:
- Luôn ưu tiên gọi tool `get_learner_summary` và `get_weak_concepts` để có số liệu thực tế TRƯỚC KHI nhận xét.
- Động viên học viên, tập trung vào "growth mindset" (tư duy phát triển).
- Phân tích rõ ràng: Tốt ở đâu? Chưa tốt ở đâu? Cần làm gì tiếp theo?
- Trình bày dạng danh sách hoặc gạch đầu dòng cho dễ đọc.
- Ngôn ngữ: Tiếng Việt, thân thiện, rõ ràng, dễ hiểu."""
        else:
            return """You are NeuroVault Feedback — an AI learning advisor.

## TASKS:
1. Analyze the learner's performance based on statistical data.
2. Acknowledge progress (strengths) and point out areas for improvement (weaknesses).
3. Provide specific, constructive advice for improvement.

## RULES:
- Always prioritize calling `get_learner_summary` and `get_weak_concepts` tools to get factual data BEFORE providing feedback.
- Encourage the learner, focusing on a "growth mindset".
- Structure your analysis clearly: What's good? What needs work? What to do next?
- Use bullet points for readability.
- Language: English, friendly, clear, and easy to understand."""

    def process(self, message: AgentMessage, context: AgentContext) -> AgentResult:
        query = message.content.get("query", "")
        lang = message.content.get("language", context.learner.language if context.learner else "en")
        
        # Xử lý khi input rỗng
        if not query.strip():
            return AgentResult(
                success=False,
                content="Vui lòng cho tôi biết bạn cần phân tích điều gì." if lang == "vi" else "Please tell me what you need feedback on.",
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
            context.set_scratch("feedback_agent", "last_interaction", "feedback_provided")
            
            return result
        except Exception as e:
            fallback = self._generate_offline_response(query, context, lang)
            fallback.data["error"] = str(e)
            return fallback

    def _generate_offline_response(self, query: str, context: AgentContext, lang: str) -> AgentResult:
        """Fallback khi LLM không hoạt động."""
        if lang == "vi":
            content = "Hệ thống AI phân tích học tập đang ngoại tuyến (Ollama chưa chạy). Vui lòng kiểm tra lại kết nối LLM."
        else:
            content = "The learning analytics AI system is currently offline (Ollama is not running). Please check the LLM connection."
            
        return AgentResult(
            success=True,
            content=content,
            data={"offline": True, "fallback": True}
        )

    def _tool_get_learner_summary(self, learner_id: str) -> Dict:
        """Lấy thống kê tổng quan của học viên."""
        if not self.dkt:
            return {"status": "dkt_unavailable"}
        summary = self.dkt.get_learner_summary(learner_id)
        return {"status": "success", "summary": summary}

    def _tool_get_weak_concepts(self, learner_id: str) -> Dict:
        """Lấy danh sách khái niệm yếu."""
        if not self.dkt:
            return {"status": "dkt_unavailable"}
        weak = self.dkt.get_weak_concepts(learner_id, threshold=0.7)
        # Limit to top 5
        return {"status": "success", "weak_concepts": [w for w in weak[:5]]}
