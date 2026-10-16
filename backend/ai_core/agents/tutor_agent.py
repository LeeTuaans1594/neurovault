"""
NEUROVAULT — Tutor Agent (Socratic, Adaptive)
Gia sư AI sử dụng phương pháp Socratic — hướng dẫn thông qua câu hỏi,
KHÔNG đưa đáp án trực tiếp. Tự điều chỉnh độ khó theo mastery của learner.

Tự viết 100% — KHÔNG dùng framework bên ngoài.

Socratic Flow:
1. Eliciting: Hỏi learner biết gì về topic
2. Probing: Đào sâu reasoning
3. Clarifying: Làm rõ misconceptions
4. Guiding: Dẫn dắt tới đáp án đúng
5. Reconciling: Tổng kết và kết nối kiến thức

Features:
- Adaptive scaffolding theo mastery level
- Misconception detection
- Encouragement & affective awareness
- Bilingual EN/VI
- RAG-powered (context từ tài liệu)
- Effort-gated (yêu cầu learner thử trước)
"""

import time
import json
import hashlib
from typing import Optional, Dict, Any, List

from agents.base_agent import BaseAgent, AgentCapability, ToolDefinition, AgentResult
from agents.agent_message import AgentMessage, MessageType
from agents.agent_context import AgentContext


class SocraticPhase:
    """Các phase trong Socratic tutoring session."""
    ELICITING = "eliciting"       # Hỏi learner biết gì
    PROBING = "probing"           # Đào sâu reasoning
    CLARIFYING = "clarifying"     # Làm rõ misconceptions
    GUIDING = "guiding"           # Dẫn dắt tới đáp án
    RECONCILING = "reconciling"   # Tổng kết kiến thức
    ENCOURAGING = "encouraging"   # Khuyến khích khi learner gặp khó


# Scaffolding levels theo mastery
SCAFFOLDING_CONFIG = {
    "novice": {         # mastery < 0.3
        "max_hints": 5,
        "hint_detail": "detailed",
        "question_complexity": "simple",
        "encouragement_freq": 0.8,
        "temperature": 0.5,
    },
    "intermediate": {   # 0.3 <= mastery < 0.6
        "max_hints": 3,
        "hint_detail": "moderate",
        "question_complexity": "moderate",
        "encouragement_freq": 0.5,
        "temperature": 0.6,
    },
    "advanced": {       # 0.6 <= mastery < 0.85
        "max_hints": 2,
        "hint_detail": "brief",
        "question_complexity": "challenging",
        "encouragement_freq": 0.3,
        "temperature": 0.7,
    },
    "expert": {         # mastery >= 0.85
        "max_hints": 1,
        "hint_detail": "minimal",
        "question_complexity": "expert",
        "encouragement_freq": 0.1,
        "temperature": 0.8,
    },
}

# Encouragement messages
ENCOURAGEMENT_VI = [
    "Tốt lắm! Bạn đang đi đúng hướng. 👍",
    "Suy nghĩ rất hay! Hãy tiếp tục phát triển ý này.",
    "Bạn đã tiến bộ nhiều rồi đấy! 🌟",
    "Câu trả lời cho thấy bạn đã hiểu phần cốt lõi.",
    "Rất ấn tượng! Bạn đang nắm vững khái niệm này.",
    "Đừng lo nếu chưa rõ — mỗi bước nhỏ đều quan trọng. 💪",
]

ENCOURAGEMENT_EN = [
    "Great thinking! You're on the right track. 👍",
    "Interesting reasoning! Let's build on that idea.",
    "You've made great progress! 🌟",
    "Your answer shows you understand the core concept.",
    "Impressive! You're mastering this topic.",
    "Don't worry if it's unclear — every small step matters. 💪",
]


class TutorAgent(BaseAgent):
    """
    Socratic Tutor Agent — dạy học thông qua câu hỏi dẫn dắt.
    
    NGUYÊN TẮC VÀNG:
    1. KHÔNG BAO GIỜ đưa đáp án trực tiếp
    2. Luôn hỏi ngược lại để kích thích tư duy
    3. Điều chỉnh scaffolding theo mastery
    4. Khuyến khích khi learner gặp khó khăn
    5. Detect và sửa misconceptions
    """

    def __init__(
        self,
        llm_engine: Any = None,
        dkt: Any = None,
        concept_extractor: Any = None,
        rag_pipeline_factory: Any = None,
    ):
        # Gán TRƯỚC super().__init__() vì _register_tools() cần self.dkt
        self.dkt = dkt
        self.concept_extractor = concept_extractor
        self.rag_pipeline_factory = rag_pipeline_factory

        super().__init__(
            agent_id="tutor_agent",
            name="Socratic Tutor",
            description="Gia sư AI Socratic — hướng dẫn qua câu hỏi, tự điều chỉnh độ khó",
            capabilities=[
                AgentCapability.TUTORING,
                AgentCapability.CHAT,
            ],
            llm_engine=llm_engine,
            max_retries=2,
            thinking_mode=True,
            default_temperature=0.6,
            default_max_tokens=2048,
        )

    def get_tools(self) -> List[ToolDefinition]:
        """Tutor Agent tools — check mastery, get hints from RAG."""
        tools = []

        if self.dkt:
            tools.append(ToolDefinition(
                name="check_mastery",
                description="Check learner's mastery level for a concept",
                parameters={
                    "concept": {"type": "string", "description": "Concept name to check"},
                    "learner_id": {"type": "string", "description": "Learner ID"},
                },
                required_params=["concept", "learner_id"],
                handler=self._tool_check_mastery,
            ))

            tools.append(ToolDefinition(
                name="get_weak_concepts",
                description="Get learner's weak concepts that need review",
                parameters={
                    "learner_id": {"type": "string", "description": "Learner ID"},
                },
                required_params=["learner_id"],
                handler=self._tool_get_weak_concepts,
            ))

        return tools

    def get_system_prompt(self, context: AgentContext) -> str:
        """Tạo system prompt Socratic theo ngôn ngữ và mastery level."""
        lang = context.learner.language if context.learner else "en"
        level = self._get_scaffolding_level(context)
        config = SCAFFOLDING_CONFIG[level]

        if lang == "vi":
            return self._build_vi_prompt(context, level, config)
        return self._build_en_prompt(context, level, config)

    def _build_vi_prompt(self, context: AgentContext, level: str, config: dict) -> str:
        """System prompt tiếng Việt."""
        context_info = self._build_context_summary(context)

        return f"""Bạn là NeuroVault Tutor — gia sư AI sử dụng phương pháp Socratic.

## NGUYÊN TẮC BẤT DI BẤT DỊCH:
1. TUYỆT ĐỐI KHÔNG đưa đáp án trực tiếp
2. Luôn hỏi ngược để kích thích tư duy
3. Dẫn dắt từng bước nhỏ qua câu hỏi
4. Khi learner sai → hỏi "Tại sao bạn nghĩ vậy?" thay vì sửa ngay
5. Khi learner đúng → hỏi "Bạn có thể giải thích thêm không?"

## TRÌNH ĐỘ LEARNER: {level.upper()}
- Mức độ gợi ý: {config['hint_detail']}
- Độ phức tạp câu hỏi: {config['question_complexity']}
- Số gợi ý tối đa: {config['max_hints']}

## CONTEXT:
{context_info}

## QUY TẮC:
- Sử dụng tiếng Việt tự nhiên, thân thiện
- Dùng emoji phù hợp (🤔💡✨) nhưng không quá nhiều
- Nếu learner thất vọng → khuyến khích trước, sau đó dẫn dắt
- Mỗi response nên kết thúc bằng 1 câu hỏi dẫn dắt
- Kết nối kiến thức mới với kiến thức đã biết
- Tóm tắt ngắn gọn khi kết thúc topic"""

    def _build_en_prompt(self, context: AgentContext, level: str, config: dict) -> str:
        """System prompt tiếng Anh."""
        context_info = self._build_context_summary(context)

        return f"""You are NeuroVault Tutor — a Socratic AI tutor.

## GOLDEN RULES:
1. NEVER give direct answers
2. Always ask guiding questions to stimulate thinking
3. Lead step-by-step through questions
4. When learner is wrong → ask "Why do you think so?" instead of correcting
5. When learner is right → ask "Can you explain further?"

## LEARNER LEVEL: {level.upper()}
- Hint detail: {config['hint_detail']}
- Question complexity: {config['question_complexity']}
- Max hints: {config['max_hints']}

## CONTEXT:
{context_info}

## RULES:
- Be friendly and encouraging
- Use appropriate emoji (🤔💡✨) sparingly
- If learner is frustrated → encourage first, then guide
- End each response with a guiding question
- Connect new knowledge to what learner already knows
- Provide brief summary when finishing a topic"""

    def process(
        self,
        message: AgentMessage,
        context: AgentContext,
    ) -> AgentResult:
        """
        Logic chính của Tutor Agent.
        
        Flow:
        1. Update session tracking
        2. Effort-gate check (yêu cầu learner thử trước)
        3. Detect Socratic phase + frustration
        4. Get relevant context (RAG if document available)
        5. Build messages with system prompt
        6. Call LLM
        7. Post-process (add encouragement if needed)
        """
        query = message.content.get("query", "")
        lang = message.content.get("language", "en")
        if not query:
            return AgentResult(
                success=False,
                content="Không có câu hỏi để xử lý." if lang == "vi" else "No query to process.",
                error="EMPTY_QUERY",
            )

        # ── Session tracking ──
        turn_count = context.get_scratch(self.agent_id, "turn_count", 0) + 1
        hint_count = context.get_scratch(self.agent_id, "hint_count", 0)
        context.set_scratch(self.agent_id, "turn_count", turn_count)

        # ── Frustration detection ──
        frustration = self._detect_frustration(query, context)
        context.set_scratch(self.agent_id, "frustration_level", frustration)

        # ── Effort-gate: nếu learner hỏi thẳng đáp án quá sớm ──
        if turn_count <= 2 and self._is_direct_answer_request(query) and frustration < 0.6:
            return self._effort_gate_response(query, lang)

        # ── Detect current Socratic phase ──
        phase = self._detect_socratic_phase(query, context)
        if frustration >= 0.7:
            phase = SocraticPhase.ENCOURAGING
        context.set_scratch(self.agent_id, "socratic_phase", phase)

        # ── Get document context via RAG (if available) ──
        rag_context = self._get_rag_context(query, context)

        # ── Detect concepts in query ──
        concepts = self._extract_query_concepts(query)
        if concepts:
            context.set_scratch(self.agent_id, "active_concepts", concepts)

        # ── Update learner mastery snapshot ──
        self._update_mastery_snapshot(context, concepts)

        # ── Build LLM messages ──
        system_prompt = self.get_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]

        # Add RAG context if available
        if rag_context:
            rag_header = "Tài liệu tham khảo" if lang == "vi" else "Reference material"
            messages.append({
                "role": "system",
                "content": f"{rag_header}:\n{rag_context}",
            })

        # Add session state hint to system
        session_note = self._build_session_note(context, frustration, lang)
        if session_note:
            messages.append({"role": "system", "content": session_note})

        # Add conversation history
        history = context.get_llm_messages(last_n=8)
        messages.extend(history)

        # Add current query (if not already in history)
        if not history or history[-1].get("content") != query:
            messages.append({"role": "user", "content": query})

        # ── Call LLM ──
        level = self._get_scaffolding_level(context)
        config = SCAFFOLDING_CONFIG[level]
        # Giảm temperature khi learner frustrated để response ổn định hơn
        temp = max(0.3, config["temperature"] - 0.15) if frustration >= 0.6 else config["temperature"]
        response = self._call_llm(
            messages=messages,
            temperature=temp,
            max_tokens=1536,
        )

        if response.startswith("[ERROR]"):
            return self._generate_offline_response(query, context, phase)

        # Track hint count
        if phase in (SocraticPhase.GUIDING, SocraticPhase.CLARIFYING):
            context.set_scratch(self.agent_id, "hint_count", hint_count + 1)

        # ── Post-process: maybe add encouragement ──
        response = self._maybe_add_encouragement(response, context, config)

        # ── Generate follow-up suggestions ──
        suggestions = self._generate_suggestions(query, phase, lang)

        return AgentResult(
            success=True,
            content=response,
            data={
                "socratic_phase": phase,
                "scaffolding_level": level,
                "active_concepts": concepts[:5] if concepts else [],
                "has_rag_context": bool(rag_context),
                "turn_count": turn_count,
                "hint_count": hint_count,
                "frustration_level": round(frustration, 2),
            },
            suggestions=suggestions,
        )

    # ──── Socratic Phase Detection ────

    def _detect_socratic_phase(
        self, query: str, context: AgentContext
    ) -> str:
        """Detect giai đoạn Socratic dựa trên conversation history."""
        prev_phase = context.get_scratch(self.agent_id, "socratic_phase", "")
        turns = context.get_conversation_history(last_n=4)
        query_lower = query.lower()

        # Confusion/frustration indicators
        confusion_words = {
            "không hiểu", "don't understand", "confused", "bối rối",
            "khó quá", "too hard", "lost", "stuck", "help",
            "giúp", "không biết", "don't know",
        }
        if any(w in query_lower for w in confusion_words):
            return SocraticPhase.GUIDING

        # First message or new topic
        if len(turns) <= 1 or not prev_phase:
            return SocraticPhase.ELICITING

        # Check if learner is explaining (probing phase)
        explanation_words = {
            "vì", "because", "bởi vì", "do đó", "therefore",
            "tôi nghĩ", "i think", "theo tôi", "in my opinion",
        }
        if any(w in query_lower for w in explanation_words):
            return SocraticPhase.PROBING

        # Question from learner = needs clarification
        if "?" in query or any(w in query_lower for w in ["tại sao", "why", "how", "what"]):
            return SocraticPhase.CLARIFYING

        # Progress through phases
        phase_order = [
            SocraticPhase.ELICITING,
            SocraticPhase.PROBING,
            SocraticPhase.CLARIFYING,
            SocraticPhase.GUIDING,
            SocraticPhase.RECONCILING,
        ]
        if prev_phase in phase_order:
            idx = phase_order.index(prev_phase)
            if idx < len(phase_order) - 1:
                return phase_order[idx + 1]

        return SocraticPhase.GUIDING

    # ──── Scaffolding Level ────

    def _get_scaffolding_level(self, context: AgentContext) -> str:
        """Xác định scaffolding level dựa trên mastery."""
        if not context.learner or not context.learner.mastery_snapshot:
            return "intermediate"

        masteries = list(context.learner.mastery_snapshot.values())
        if not masteries:
            return "intermediate"

        avg_mastery = sum(masteries) / len(masteries)
        if avg_mastery < 0.3:
            return "novice"
        elif avg_mastery < 0.6:
            return "intermediate"
        elif avg_mastery < 0.85:
            return "advanced"
        return "expert"

    # ──── Frustration Detection ────

    def _detect_frustration(self, query: str, context: AgentContext) -> float:
        """Detect mức độ thất vọng của learner (0.0 → 1.0)."""
        score = 0.0
        query_lower = query.lower()

        # Từ khóa frustration (EN + VI)
        frustration_strong = {
            "tôi bỏ cuộc", "i give up", "quá khó", "too hard",
            "không thể", "impossible", "chán", "bored", "hate this",
            "ghét", "tệ quá", "terrible", "stupid",
        }
        frustration_mild = {
            "không hiểu", "don't understand", "confused", "bối rối",
            "khó quá", "stuck", "lost", "help", "giúp",
            "không biết", "don't know", "sai rồi", "wrong again",
        }

        for w in frustration_strong:
            if w in query_lower:
                score += 0.4
        for w in frustration_mild:
            if w in query_lower:
                score += 0.2

        # Repeated wrong answers (nhiều turn liên tục mà vẫn sai)
        prev_frustration = context.get_scratch(self.agent_id, "frustration_level", 0.0)
        if prev_frustration > 0.3:
            score += 0.1  # Tích lũy frustration

        # Tin nhắn ngắn liên tục = dấu hiệu mất kiên nhẫn
        if len(query.strip()) < 15:
            recent = context.get_conversation_history(last_n=3, role_filter="user")
            short_count = sum(1 for t in recent if len(t.get("content", "")) < 15)
            if short_count >= 2:
                score += 0.15

        return min(1.0, score)

    def _is_direct_answer_request(self, query: str) -> bool:
        """Kiểm tra xem learner có đang yêu cầu đáp án trực tiếp không."""
        query_lower = query.lower()
        direct_patterns = [
            "cho tôi đáp án", "give me the answer", "just tell me",
            "đáp án là gì", "what's the answer", "nói luôn đi",
            "trả lời luôn", "answer directly", "skip the questions",
            "bỏ qua", "nói thẳng", "tell me directly",
        ]
        return any(p in query_lower for p in direct_patterns)

    def _effort_gate_response(self, query: str, lang: str) -> AgentResult:
        """Yêu cầu learner thử trước khi cho gợi ý."""
        if lang == "vi":
            content = (
                "🤔 Tôi hiểu bạn muốn biết đáp án nhanh, nhưng việc tự suy nghĩ "
                "sẽ giúp bạn nhớ lâu hơn rất nhiều!\n\n"
                "Hãy thử chia sẻ những gì bạn **đã biết** về chủ đề này trước. "
                "Dù chỉ một ý nhỏ cũng được — tôi sẽ dẫn dắt bạn từ đó. 💪"
            )
        else:
            content = (
                "🤔 I understand you want a quick answer, but thinking through it "
                "yourself will help you remember much better!\n\n"
                "Try sharing what you **already know** about this topic first. "
                "Even a small idea is fine — I'll guide you from there. 💪"
            )
        return AgentResult(
            success=True,
            content=content,
            data={"effort_gated": True, "socratic_phase": SocraticPhase.ELICITING},
        )

    def _build_session_note(self, context: AgentContext, frustration: float, lang: str) -> str:
        """Tạo note ngắn về trạng thái session cho LLM."""
        turn_count = context.get_scratch(self.agent_id, "turn_count", 0)
        hint_count = context.get_scratch(self.agent_id, "hint_count", 0)
        parts = []

        if frustration >= 0.6:
            note = "Learner đang thất vọng — ưu tiên khuyến khích, giảm độ khó." if lang == "vi" \
                else "Learner is frustrated — prioritize encouragement, reduce difficulty."
            parts.append(note)

        if hint_count >= 3:
            note = f"Đã cho {hint_count} gợi ý — có thể cần giải thích trực tiếp hơn." if lang == "vi" \
                else f"Given {hint_count} hints — may need more direct explanation."
            parts.append(note)

        if turn_count >= 8:
            note = "Session dài — cân nhắc tóm tắt và chuyển topic." if lang == "vi" \
                else "Long session — consider summarizing and moving on."
            parts.append(note)

        return "\n".join(parts)

    # ──── RAG Context ────

    def _get_rag_context(self, query: str, context: AgentContext) -> str:
        """Lấy context từ RAG pipeline (nếu có document)."""
        if not context.document or not context.document.document_id:
            return ""

        # Check cache first
        cache_key = hashlib.md5(query.encode()).hexdigest()
        cached = context.get_cached_tool_result("rag_retrieve", cache_key)
        if cached:
            return cached

        # Tích hợp RAG pipeline thực sự
        if self.rag_pipeline_factory:
            try:
                rag = self.rag_pipeline_factory(context.document.document_id)
                if rag:
                    results = rag.retrieve(query, top_k=3)
                    if results:
                        parts = [r.get("text", "") for r in results if r.get("text")]
                        rag_text = "\n---\n".join(parts[:3])
                        # Cache kết quả (5 phút)
                        context.cache_tool_result("rag_retrieve", cache_key, rag_text, ttl_seconds=300)
                        return rag_text
            except Exception as e:
                print(f"[TutorAgent] RAG retrieval error: {e}")

        return ""

    # ──── Concept Extraction ────

    def _extract_query_concepts(self, query: str) -> List[str]:
        """Trích xuất concepts từ query."""
        if self.concept_extractor:
            try:
                concepts = self.concept_extractor.extract(query)
                return [c["concept"] for c in concepts[:5]]
            except Exception:
                pass
        return []

    # ──── Mastery Update ────

    def _update_mastery_snapshot(
        self, context: AgentContext, concepts: List[str]
    ) -> None:
        """Cập nhật mastery snapshot trong learner profile."""
        if not self.dkt or not context.learner:
            return

        for concept in concepts:
            try:
                mastery = self.dkt.predict_mastery(
                    context.learner.learner_id, concept
                )
                context.learner.mastery_snapshot[concept] = mastery
            except Exception:
                pass

    # ──── Encouragement ────

    def _maybe_add_encouragement(
        self, response: str, context: AgentContext, config: dict
    ) -> str:
        """Thêm encouragement nếu cần (theo tần suất trong config)."""
        import random
        if random.random() > config["encouragement_freq"]:
            return response

        lang = context.learner.language if context.learner else "en"
        pool = ENCOURAGEMENT_VI if lang == "vi" else ENCOURAGEMENT_EN
        encouragement = random.choice(pool)

        # Thêm vào đầu response
        return f"{encouragement}\n\n{response}"

    # ──── Follow-up Suggestions ────

    def _generate_suggestions(
        self, query: str, phase: str, lang: str
    ) -> List[str]:
        """Tạo follow-up suggestions cho user."""
        if lang == "vi":
            base = [
                "Giải thích thêm về khái niệm này",
                "Cho tôi một ví dụ cụ thể",
                "Tạo bài quiz để kiểm tra",
            ]
            if phase == SocraticPhase.RECONCILING:
                base.append("Chuyển sang chủ đề tiếp theo")
        else:
            base = [
                "Explain this concept further",
                "Give me a specific example",
                "Create a quiz to test me",
            ]
            if phase == SocraticPhase.RECONCILING:
                base.append("Move to the next topic")

        return base[:3]

    # ──── Offline Fallback ────

    def _generate_offline_response(
        self, query: str, context: AgentContext, phase: str
    ) -> AgentResult:
        """Fallback khi LLM offline — trả response cơ bản."""
        lang = context.learner.language if context.learner else "en"

        if lang == "vi":
            responses = {
                SocraticPhase.ELICITING: (
                    "🤔 Trước khi bắt đầu, bạn đã biết gì về chủ đề này? "
                    "Hãy chia sẻ những gì bạn đã hiểu."
                ),
                SocraticPhase.PROBING: (
                    "💡 Thú vị! Bạn có thể giải thích thêm tại sao bạn nghĩ như vậy không?"
                ),
                SocraticPhase.CLARIFYING: (
                    "Hãy thử nghĩ theo cách khác. Nếu [X] đúng, thì điều gì sẽ xảy ra?"
                ),
                SocraticPhase.GUIDING: (
                    "💪 Đừng lo! Hãy chia nhỏ vấn đề. "
                    "Bước đầu tiên bạn nghĩ nên làm là gì?"
                ),
                SocraticPhase.RECONCILING: (
                    "✨ Tuyệt vời! Hãy tóm tắt lại những gì bạn đã học được."
                ),
            }
        else:
            responses = {
                SocraticPhase.ELICITING: (
                    "🤔 Before we begin, what do you already know about this topic? "
                    "Share what you understand so far."
                ),
                SocraticPhase.PROBING: (
                    "💡 Interesting! Can you explain further why you think that?"
                ),
                SocraticPhase.CLARIFYING: (
                    "Try thinking about it differently. If [X] is true, what would happen?"
                ),
                SocraticPhase.GUIDING: (
                    "💪 Don't worry! Let's break it down. "
                    "What do you think the first step should be?"
                ),
                SocraticPhase.RECONCILING: (
                    "✨ Excellent! Let's summarize what you've learned."
                ),
            }

        content = responses.get(phase, responses[SocraticPhase.ELICITING])
        note = (
            "\n\n*(Lưu ý: AI đang offline. Khởi động Ollama để có trải nghiệm đầy đủ.)*"
            if lang == "vi" else
            "\n\n*(Note: AI is offline. Start Ollama for the full experience.)*"
        )

        return AgentResult(
            success=True,
            content=content + note,
            data={"offline": True, "socratic_phase": phase},
        )

    # ──── Tool Handlers ────

    def _tool_check_mastery(self, concept: str, learner_id: str) -> Dict:
        """Tool: Check mastery của learner cho concept."""
        if not self.dkt:
            return {"mastery": 0.5, "status": "dkt_unavailable"}

        mastery = self.dkt.predict_mastery(learner_id, concept)
        weak = self.dkt.get_weak_concepts(learner_id)
        is_weak = any(w["concept"] == concept for w in weak)

        return {
            "concept": concept,
            "mastery": round(mastery, 4),
            "is_weak": is_weak,
            "status": "ok",
        }

    def _tool_get_weak_concepts(self, learner_id: str) -> Dict:
        """Tool: Lấy danh sách weak concepts."""
        if not self.dkt:
            return {"weak_concepts": [], "status": "dkt_unavailable"}

        weak = self.dkt.get_weak_concepts(learner_id, threshold=0.5)
        return {
            "weak_concepts": weak[:10],
            "total": len(weak),
            "status": "ok",
        }
