"""
NEUROVAULT — Assessment Agent
Tự động tạo bài kiểm tra từ weak concepts và chấm điểm bằng rubric.
"""

from typing import Any, List, Dict
from agents.base_agent import BaseAgent, AgentCapability, ToolDefinition, AgentResult
from agents.agent_message import AgentMessage
from agents.agent_context import AgentContext
import json

class AssessmentPhase:
    IDENTIFY = "identify"      # Xác định khái niệm yếu
    GENERATE = "generate"      # Tạo bài kiểm tra
    EVALUATE = "evaluate"      # Đánh giá câu trả lời
    FEEDBACK = "feedback"      # Đưa ra phản hồi

class AssessmentAgent(BaseAgent):
    """
    Assessment Agent — đánh giá kiến thức của học viên.
    
    Features:
    - Auto-generate quizzes từ DKT weak concepts
    - Rubric evaluation cho câu trả lời tự luận
    - Cập nhật mastery sau khi đánh giá
    """

    def __init__(
        self,
        llm_engine: Any = None,
        dkt: Any = None,
        quiz_generator: Any = None,
        doc_store_func: Any = None,
    ):
        self.dkt = dkt
        self.quiz_generator = quiz_generator
        self.doc_store_func = doc_store_func

        super().__init__(
            agent_id="assessment_agent",
            name="Assessment Agent",
            description="Tự động tạo bài kiểm tra từ weak concepts và chấm điểm bằng rubric",
            capabilities=[AgentCapability.ASSESSMENT, AgentCapability.CHAT],
            llm_engine=llm_engine,
            max_retries=2,
            thinking_mode=True,
            default_temperature=0.3,
            default_max_tokens=2048,
        )

    def get_tools(self) -> List[ToolDefinition]:
        tools = []
        if self.dkt:
            tools.append(ToolDefinition(
                name="get_weak_concepts",
                description="Lấy danh sách các khái niệm yếu của học viên để tạo bài kiểm tra",
                parameters={"learner_id": {"type": "string"}},
                required_params=["learner_id"],
                handler=self._tool_get_weak_concepts,
            ))
            tools.append(ToolDefinition(
                name="update_mastery",
                description="Cập nhật năng lực (mastery) của học viên sau khi đánh giá",
                parameters={
                    "learner_id": {"type": "string"},
                    "concept": {"type": "string"},
                    "is_correct": {"type": "boolean"},
                },
                required_params=["learner_id", "concept", "is_correct"],
                handler=self._tool_update_mastery,
            ))
        if self.quiz_generator and self.doc_store_func:
            tools.append(ToolDefinition(
                name="generate_quiz",
                description="Tạo câu hỏi kiểm tra cho các khái niệm",
                parameters={
                    "document_id": {"type": "string"},
                    "concepts": {"type": "array", "items": {"type": "string"}},
                    "num_questions": {"type": "integer"}
                },
                required_params=["document_id", "concepts", "num_questions"],
                handler=self._tool_generate_quiz,
            ))
        return tools

    def get_system_prompt(self, context: AgentContext) -> str:
        lang = context.learner.language if context.learner else "en"
        
        if lang == "vi":
            return """Bạn là NeuroVault Assessment — Giám khảo AI chuyên nghiệp.

NHIỆM VỤ CỦA BẠN:
1. Xác định điểm yếu: Dùng công cụ `get_weak_concepts` để tìm các khái niệm học viên chưa nắm vững.
2. Đặt câu hỏi: Dùng công cụ `generate_quiz` để tạo bài kiểm tra, hoặc tự đặt câu hỏi tự luận ngắn gọn để kiểm tra hiểu biết của học viên.
3. Đánh giá (Rubric): Khi học viên trả lời, bạn PHẢI phân tích câu trả lời theo Rubric sau:
   - Sai (0-30%): Không hiểu hoặc trả lời sai hoàn toàn. -> Bắt buộc dùng `update_mastery(is_correct=false)`
   - Thiếu (31-70%): Hiểu một phần nhưng thiếu chi tiết cốt lõi. -> Bắt buộc dùng `update_mastery(is_correct=false)`
   - Đúng (71-100%): Trả lời chính xác, đủ ý. -> Bắt buộc dùng `update_mastery(is_correct=true)`
4. Phản hồi: Đưa ra nhận xét mang tính xây dựng, giải thích lỗi sai (nếu có).

QUY TẮC NGHIÊM NGẶT:
- LUÔN LUÔN gọi `update_mastery` sau khi học viên trả lời một câu hỏi chuyên môn. Không được quên!
- Không cung cấp đáp án trước khi học viên trả lời.
- Ngôn ngữ giao tiếp: Tiếng Việt, khách quan, rõ ràng, mang tính giáo dục.
"""
        else:
            return """You are NeuroVault Assessment — a professional AI Examiner.

YOUR TASKS:
1. Identify Weaknesses: Use the `get_weak_concepts` tool to find concepts the learner struggles with.
2. Ask Questions: Use the `generate_quiz` tool to create a test, or ask short free-text questions to evaluate understanding.
3. Evaluate (Rubric): When the learner answers, you MUST analyze the answer using this Rubric:
   - Incorrect (0-30%): Completely wrong or misunderstands. -> MUST call `update_mastery(is_correct=false)`
   - Partial (31-70%): Understands partly but misses core details. -> MUST call `update_mastery(is_correct=false)`
   - Correct (71-100%): Accurate and complete. -> MUST call `update_mastery(is_correct=true)`
4. Feedback: Provide constructive feedback and explain any mistakes.

STRICT RULES:
- ALWAYS call `update_mastery` after grading a learner's answer. Do not skip this!
- Do not provide answers before the learner attempts the question.
- Communication Language: English, objective, clear, educational.
"""

    def process(self, message: AgentMessage, context: AgentContext) -> AgentResult:
        query = message.content.get("query", "")
        lang = message.content.get("language", context.learner.language if context.learner else "en")
        
        # Xử lý khi input rỗng
        if not query.strip():
            return AgentResult(
                success=False,
                content="Vui lòng cung cấp câu trả lời hoặc yêu cầu kiểm tra." if lang == "vi" else "Please provide an answer or request a test.",
                data={"error": "empty_query"}
            )
            
        system_prompt = self.get_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]
        
        # Thêm context về document hiện tại nếu có
        if context.document and context.document.document_id:
            doc_info = f"Current Document ID: {context.document.document_id}\n"
            if lang == "vi":
                messages.append({"role": "system", "content": f"Học viên đang học tài liệu này:\n{doc_info}"})
            else:
                messages.append({"role": "system", "content": f"Learner is studying this document:\n{doc_info}"})

        # Load history
        history = context.get_llm_messages(last_n=6)
        messages.extend(history)
        
        if not history or history[-1].get("content") != query:
            messages.append({"role": "user", "content": query})
            
        try:
            # Nếu LLM offline, dùng fallback
            if not self.llm_engine:
                return self._generate_offline_response(query, context, lang)
                
            result = self._call_llm_with_tools(messages, context)
            
            # Ghi nhận activity vào context
            context.set_scratch("assessment_agent", "last_interaction", "evaluated")
            
            return result
            
        except Exception as e:
            fallback = self._generate_offline_response(query, context, lang)
            fallback.data["error"] = str(e)
            return fallback

    def _generate_offline_response(self, query: str, context: AgentContext, lang: str) -> AgentResult:
        """Fallback khi LLM không hoạt động."""
        if lang == "vi":
            content = "Hệ thống AI đánh giá đang ngoại tuyến (Ollama chưa chạy). Vui lòng kiểm tra lại kết nối LLM."
        else:
            content = "The assessment AI system is currently offline (Ollama is not running). Please check the LLM connection."
            
        return AgentResult(
            success=True,
            content=content,
            data={"offline": True, "fallback": True}
        )

    def _tool_get_weak_concepts(self, learner_id: str) -> Dict:
        """Lấy danh sách các khái niệm yếu của học viên."""
        if not self.dkt:
            return {"weak_concepts": [], "status": "dkt_unavailable"}
        weak = self.dkt.get_weak_concepts(learner_id, threshold=0.6)
        return {"weak_concepts": [w["concept"] for w in weak[:3]], "status": "success"}

    def _tool_update_mastery(self, learner_id: str, concept: str, is_correct: bool) -> Dict:
        """Cập nhật mastery cho học viên sau khi trả lời câu hỏi."""
        if not self.dkt:
            return {"status": "dkt_unavailable"}
        res = self.dkt.update(learner_id, concept, is_correct)
        return {"status": "success", "new_mastery": round(res.get("mastery", 0), 4), "concept": concept}

    def _tool_generate_quiz(self, document_id: str, concepts: List[str], num_questions: int = 3) -> Dict:
        """Tạo quiz từ document."""
        if not self.quiz_generator or not self.doc_store_func:
            return {"status": "tools_unavailable"}
            
        store = self.doc_store_func(document_id)
        if not store:
            return {"status": "document_not_found"}
            
        concept_dicts = [{"concept": c} for c in concepts]
        try:
            questions = self.quiz_generator.generate_from_concepts(
                concepts=concept_dicts,
                chunks=store.get("chunks", []),
                num_questions=min(num_questions, 10),
                difficulty=0.5
            )
            return {"questions": questions, "status": "success"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
