"""
NEUROVAULT — Agent Orchestrator
Supervisor-Worker pattern quản lý multi-agent system.
Tự viết 100% — KHÔNG dùng framework bên ngoài (LangGraph, CrewAI...).

Architecture:
- Orchestrator là "manager" — nhận request từ user, route tới đúng agent
- Agents là "workers" — xử lý chuyên biệt (Tutor, Assessment, Feedback...)
- Communication qua AgentMessage — typed, traceable
- Context sharing qua AgentContext — memory layers

Flow:
1. User request → Orchestrator.process()
2. Orchestrator phân loại intent → chọn agent phù hợp
3. Agent xử lý → trả kết quả
4. Orchestrator kiểm tra → có cần gọi thêm agent không?
5. Final response → User

Features:
- Intent classification (rule-based + LLM fallback)
- Multi-agent chaining (agent A → agent B → agent C)
- Safety guardrails (Safety Agent chạy song song)
- Handoff protocol (chuyển giao giữa agents)
- Conversation context management
- Comprehensive logging & metrics
- Graceful degradation (fallback khi agent lỗi)
"""

import time
import json
import traceback
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field

from agents.base_agent import BaseAgent, AgentCapability, AgentResult
from agents.agent_message import (
    AgentMessage,
    MessageType,
    MessagePriority,
    MessageChain,
)
from agents.agent_context import AgentContext, LearnerProfile, DocumentContext
from agents.registry import AgentRegistry
from agents.agent_memory import MemoryManager


# ──── Intent Classification ────

class UserIntent:
    """Phân loại ý định của user."""
    # Chat / hỏi đáp
    CHAT = "chat"
    # Yêu cầu giải thích / dạy học
    EXPLAIN = "explain"
    TUTOR = "tutor"
    # Assessment
    QUIZ = "quiz"
    FLASHCARD = "flashcard"
    # Learning path
    WHAT_NEXT = "what_next"
    STUDY_PLAN = "study_plan"
    # Feedback / analytics
    PROGRESS = "progress"
    FEEDBACK = "feedback"
    # Content
    SUMMARIZE = "summarize"
    CONCEPTS = "concepts"
    # System
    HELP = "help"
    UNKNOWN = "unknown"


# Mapping: intent → capability cần thiết
INTENT_TO_CAPABILITY: Dict[str, AgentCapability] = {
    UserIntent.CHAT: AgentCapability.CHAT,
    UserIntent.EXPLAIN: AgentCapability.TUTORING,
    UserIntent.TUTOR: AgentCapability.TUTORING,
    UserIntent.QUIZ: AgentCapability.ASSESSMENT,
    UserIntent.FLASHCARD: AgentCapability.CONTENT_GENERATION,
    UserIntent.WHAT_NEXT: AgentCapability.PATH_PLANNING,
    UserIntent.STUDY_PLAN: AgentCapability.PATH_PLANNING,
    UserIntent.PROGRESS: AgentCapability.ANALYTICS,
    UserIntent.FEEDBACK: AgentCapability.FEEDBACK,
    UserIntent.SUMMARIZE: AgentCapability.SUMMARIZATION,
    UserIntent.CONCEPTS: AgentCapability.CONCEPT_EXTRACTION,
}

# Keywords cho rule-based intent detection (EN + VI)
INTENT_KEYWORDS: Dict[str, List[str]] = {
    UserIntent.QUIZ: [
        "quiz", "test", "kiểm tra", "câu hỏi", "trắc nghiệm", "question",
        "exam", "bài kiểm", "đánh giá", "assessment",
    ],
    UserIntent.FLASHCARD: [
        "flashcard", "flash card", "thẻ nhớ", "thẻ ghi nhớ", "card",
        "tạo thẻ", "make card", "create card",
    ],
    UserIntent.EXPLAIN: [
        "giải thích", "explain", "tại sao", "why", "how does", "làm thế nào",
        "nghĩa là gì", "what is", "what does", "define", "definition",
        "teach me", "dạy tôi", "hướng dẫn", "guide",
    ],
    UserIntent.TUTOR: [
        "tutor", "gia sư", "dạy", "teach", "help me understand",
        "giúp tôi hiểu", "socratic", "step by step", "từng bước",
    ],
    UserIntent.WHAT_NEXT: [
        "what next", "next topic", "nên học gì", "tiếp theo", "recommend",
        "gợi ý", "suggest", "what should i study", "lộ trình",
    ],
    UserIntent.STUDY_PLAN: [
        "study plan", "kế hoạch học", "lịch học", "schedule",
        "plan", "daily plan", "weekly plan", "kế hoạch",
    ],
    UserIntent.PROGRESS: [
        "progress", "tiến độ", "statistics", "thống kê", "how am i doing",
        "performance", "kết quả", "mastery", "analytics", "phân tích",
    ],
    UserIntent.FEEDBACK: [
        "feedback", "nhận xét", "đánh giá", "review my", "phản hồi",
        "what am i doing wrong", "sai ở đâu", "improve", "cải thiện",
    ],
    UserIntent.SUMMARIZE: [
        "summarize", "summary", "tóm tắt", "tổng kết", "overview",
        "brief", "key points", "main ideas", "ý chính",
    ],
    UserIntent.CONCEPTS: [
        "concepts", "khái niệm", "key terms", "thuật ngữ",
        "extract concepts", "trích xuất", "keywords", "từ khoá",
    ],
    UserIntent.HELP: [
        "help", "giúp", "trợ giúp", "hỗ trợ", "how to use",
        "cách dùng", "features", "tính năng", "what can you do",
    ],
}


class AgentOrchestrator:
    """
    Supervisor-Worker orchestrator cho multi-agent system.
    
    Vai trò:
    - Nhận request từ user
    - Phân loại intent
    - Route tới agent phù hợp
    - Quản lý multi-step workflows
    - Safety guardrails
    - Error recovery
    
    Usage:
        orchestrator = AgentOrchestrator(registry, llm_engine)
        result = orchestrator.process_user_request(
            query="Giải thích concept X",
            learner_id="user123",
            document_id="doc456",
        )
    """

    def __init__(
        self,
        registry: AgentRegistry,
        llm_engine: Any = None,
        enable_safety: bool = True,
        enable_thinking: bool = False,
        max_chain_depth: int = 3,
    ):
        self.registry = registry
        self.llm_engine = llm_engine
        self.enable_safety = enable_safety
        self.enable_thinking = enable_thinking
        self.max_chain_depth = max_chain_depth

        # Active conversations
        self._conversations: Dict[str, AgentContext] = {}
        self._message_chains: Dict[str, MessageChain] = {}

        # Memory managers — 1 per learner (4-layer: Working, Short-term, Episodic, Long-term)
        self._memory_managers: Dict[str, MemoryManager] = {}

        # Metrics
        self._metrics = {
            "total_requests": 0,
            "successful": 0,
            "failed": 0,
            "total_latency_ms": 0.0,
            "intent_distribution": {},
            "agent_usage": {},
        }

    # ════════════════════════════════════════════════
    # MAIN ENTRY POINT
    # ════════════════════════════════════════════════

    def process_user_request(
        self,
        query: str,
        learner_id: str = "anonymous",
        document_id: str = "",
        conversation_id: str = "",
        language: str = "",
        extra_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Entry point chính cho user request.
        
        Args:
            query: Câu hỏi/yêu cầu của user
            learner_id: ID người học
            document_id: ID tài liệu (nếu có)
            conversation_id: ID conversation (để continue)
            language: Override ngôn ngữ (en/vi)
            extra_context: Context bổ sung
            
        Returns:
            {
                "success": bool,
                "response": str,
                "intent": str,
                "agent_id": str,
                "data": dict,
                "suggestions": list,
                "conversation_id": str,
                "processing_time_ms": float,
            }
        """
        start_time = time.time()
        self._metrics["total_requests"] += 1

        try:
            # Step 1: Get or create conversation context
            context = self._get_or_create_context(
                conversation_id=conversation_id,
                learner_id=learner_id,
                document_id=document_id,
                language=language,
            )

            # Add user turn
            context.add_turn(role="user", content=query)

            # Step 2: Classify intent
            intent = self._classify_intent(query, context)

            # Track intent distribution
            self._metrics["intent_distribution"][intent] = (
                self._metrics["intent_distribution"].get(intent, 0) + 1
            )

            # Step 3: Safety check (nếu enabled)
            if self.enable_safety:
                safety_ok, safety_msg = self._run_safety_check(query, context)
                if not safety_ok:
                    return self._build_response(
                        success=False,
                        response=safety_msg,
                        intent=intent,
                        agent_id="safety_agent",
                        conversation_id=context.conversation_id,
                        start_time=start_time,
                    )

            # Step 4: Route tới agent phù hợp
            agent = self._select_agent(intent, context)

            if not agent:
                # Fallback: nếu không tìm được agent, dùng LLM trực tiếp
                response = self._fallback_llm_response(query, context)
                return self._build_response(
                    success=True,
                    response=response,
                    intent=intent,
                    agent_id="orchestrator_fallback",
                    conversation_id=context.conversation_id,
                    start_time=start_time,
                )

            # Step 5: Tạo message và gửi tới agent
            message = AgentMessage(
                type=MessageType.REQUEST,
                sender="orchestrator",
                receiver=agent.agent_id,
                content={
                    "query": query,
                    "intent": intent,
                    "language": language or self._detect_language(query),
                    "extra": extra_context or {},
                },
                priority=MessagePriority.HIGH,
                conversation_id=context.conversation_id,
            )

            # Track in message chain
            chain = self._get_message_chain(context.conversation_id)
            chain.add(message)

            # Step 6: Execute agent
            response_msg = agent.handle_message(message, context)
            chain.add(response_msg)

            # Track agent usage
            self._metrics["agent_usage"][agent.agent_id] = (
                self._metrics["agent_usage"].get(agent.agent_id, 0) + 1
            )

            # Step 7: Parse response
            if response_msg.type == MessageType.ERROR:
                error_content = response_msg.content
                return self._build_response(
                    success=False,
                    response=error_content.get("error_message", "Agent error"),
                    intent=intent,
                    agent_id=agent.agent_id,
                    conversation_id=context.conversation_id,
                    start_time=start_time,
                    error=error_content.get("error_code", "UNKNOWN"),
                )

            # Step 8: Check if handoff needed
            response_content = response_msg.content
            if response_content.get("data", {}).get("handoff_to"):
                handoff_result = self._handle_handoff(
                    response_msg, context, depth=0
                )
                if handoff_result:
                    return handoff_result

            # Step 9: Learn from interaction — update long-term memory
            self._learn_from_interaction(
                context=context,
                intent=intent,
                agent_id=agent.agent_id,
                response_data=response_content.get("data", {}),
            )

            # Step 10: Build final response
            self._metrics["successful"] += 1
            return self._build_response(
                success=True,
                response=response_content.get("text", ""),
                intent=intent,
                agent_id=agent.agent_id,
                conversation_id=context.conversation_id,
                start_time=start_time,
                data=response_content.get("data", {}),
                suggestions=response_content.get("suggestions", []),
                thinking=response_content.get("thinking", ""),
            )

        except Exception as e:
            self._metrics["failed"] += 1
            traceback.print_exc()
            return self._build_response(
                success=False,
                response=self._get_error_message(
                    language or self._detect_language(query)
                ),
                intent="unknown",
                agent_id="orchestrator",
                conversation_id=conversation_id,
                start_time=start_time,
                error=str(e),
            )

    # ════════════════════════════════════════════════
    # INTENT CLASSIFICATION
    # ════════════════════════════════════════════════

    def _classify_intent(
        self,
        query: str,
        context: AgentContext,
    ) -> str:
        """
        Phân loại ý định user — 2 tầng:
        1. Rule-based (keyword matching) — nhanh, deterministic
        2. LLM fallback — khi keywords không đủ

        Returns:
            UserIntent string
        """
        query_lower = query.lower().strip()

        # Tầng 1: Keyword matching (nhanh + không cần LLM)
        best_intent = None
        best_score = 0

        for intent, keywords in INTENT_KEYWORDS.items():
            score = 0
            for kw in keywords:
                if kw in query_lower:
                    # Bonus cho exact phrase match
                    score += 2 if f" {kw} " in f" {query_lower} " else 1
            if score > best_score:
                best_score = score
                best_intent = intent

        if best_intent and best_score >= 2:
            return best_intent

        # Tầng 2: LLM classification (khi keywords không rõ ràng)
        if self.llm_engine and self.llm_engine.is_available():
            llm_intent = self._classify_intent_llm(query_lower)
            if llm_intent != UserIntent.UNKNOWN:
                return llm_intent

        # Fallback: nếu keyword score >= 1, dùng keyword result
        if best_intent and best_score >= 1:
            return best_intent

        # Default: CHAT
        return UserIntent.CHAT

    def _classify_intent_llm(self, query: str) -> str:
        """Dùng LLM để phân loại intent khi rule-based không đủ."""
        prompt = f"""Classify the user's intent. Return ONLY the intent label.

Valid intents: chat, explain, tutor, quiz, flashcard, what_next, study_plan, progress, feedback, summarize, concepts, help

User query: "{query}"

Intent:"""

        result = self.llm_engine.generate(
            prompt=prompt,
            system="You are an intent classifier. Return only the intent label, nothing else.",
            temperature=0.1,
            max_tokens=20,
        )

        if result and not result.startswith("[ERROR]"):
            result_clean = result.strip().lower().replace('"', '').replace("'", "")
            # Validate intent
            valid_intents = {
                "chat", "explain", "tutor", "quiz", "flashcard",
                "what_next", "study_plan", "progress", "feedback",
                "summarize", "concepts", "help",
            }
            if result_clean in valid_intents:
                return result_clean

        return UserIntent.UNKNOWN

    # ════════════════════════════════════════════════
    # AGENT SELECTION
    # ════════════════════════════════════════════════

    def _select_agent(
        self,
        intent: str,
        context: AgentContext,
    ) -> Optional[BaseAgent]:
        """
        Chọn agent phù hợp nhất cho intent.
        
        Strategy:
        1. Lookup capability từ intent mapping
        2. Tìm agent available có capability đó
        3. Fallback sang agent có capability CHAT
        """
        capability = INTENT_TO_CAPABILITY.get(intent)

        if capability:
            agent = self.registry.find_best_agent(capability)
            if agent:
                return agent

        # Fallback: tìm chat agent
        chat_agent = self.registry.find_best_agent(AgentCapability.CHAT)
        if chat_agent:
            return chat_agent

        # Fallback: tìm tutor agent
        tutor_agent = self.registry.find_best_agent(AgentCapability.TUTORING)
        if tutor_agent:
            return tutor_agent

        return None

    # ════════════════════════════════════════════════
    # SAFETY
    # ════════════════════════════════════════════════

    def _run_safety_check(
        self,
        query: str,
        context: AgentContext,
    ) -> Tuple[bool, str]:
        """
        Chạy safety check qua Safety Agent (nếu có).
        
        Returns:
            (is_safe, message)
        """
        safety_agent = self.registry.find_best_agent(AgentCapability.SAFETY)
        if not safety_agent:
            # Không có Safety Agent → skip (cho phép mặc định)
            return True, ""

        try:
            message = AgentMessage(
                type=MessageType.REQUEST,
                sender="orchestrator",
                receiver=safety_agent.agent_id,
                content={"query": query, "check_type": "content_moderation"},
                priority=MessagePriority.CRITICAL,
            )
            response = safety_agent.handle_message(message, context)

            if response.type == MessageType.ERROR:
                # Safety agent lỗi → cho phép (fail-open for education)
                return True, ""

            is_safe = response.content.get("data", {}).get("is_safe", True)
            reason = response.content.get("text", "")
            return is_safe, reason

        except Exception as e:
            # Safety check lỗi → cho phép (fail-open)
            print(f"[Orchestrator] Safety check error: {e}")
            return True, ""

    # ════════════════════════════════════════════════
    # HANDOFF
    # ════════════════════════════════════════════════

    def _handle_handoff(
        self,
        response_msg: AgentMessage,
        context: AgentContext,
        depth: int = 0,
    ) -> Optional[Dict[str, Any]]:
        """
        Xử lý handoff — chuyển giao sang agent khác.
        Giới hạn chain depth để tránh infinite loop.
        """
        if depth >= self.max_chain_depth:
            return None

        handoff_to = response_msg.content.get("data", {}).get("handoff_to")
        if not handoff_to:
            return None

        target_agent = self.registry.get(handoff_to)
        if not target_agent:
            return None

        # Tạo handoff message
        handoff_msg = response_msg.create_handoff(
            target_agent=handoff_to,
            reason=response_msg.content.get("data", {}).get("handoff_reason", ""),
            context=response_msg.content.get("data", {}),
        )

        # Execute target agent
        chain = self._get_message_chain(context.conversation_id)
        chain.add(handoff_msg)

        handoff_response = target_agent.handle_message(handoff_msg, context)
        chain.add(handoff_response)

        if handoff_response.type == MessageType.ERROR:
            return None

        # Check for further handoffs (recursive)
        further = self._handle_handoff(handoff_response, context, depth + 1)
        if further:
            return further

        return self._build_response(
            success=True,
            response=handoff_response.content.get("text", ""),
            intent="handoff",
            agent_id=handoff_to,
            conversation_id=context.conversation_id,
            start_time=time.time(),
            data=handoff_response.content.get("data", {}),
        )

    # ════════════════════════════════════════════════
    # CONTEXT MANAGEMENT
    # ════════════════════════════════════════════════

    def _get_or_create_context(
        self,
        conversation_id: str,
        learner_id: str,
        document_id: str,
        language: str,
    ) -> AgentContext:
        """Get existing context hoặc tạo mới."""
        if conversation_id and conversation_id in self._conversations:
            ctx = self._conversations[conversation_id]
            ctx.last_activity = time.time()
            return ctx

        # Tạo context mới
        learner = LearnerProfile(
            learner_id=learner_id,
            language=language or "en",
        )
        document = DocumentContext(document_id=document_id) if document_id else None

        ctx = AgentContext(
            conversation_id=conversation_id,
            learner=learner,
            document=document,
        )

        self._conversations[ctx.conversation_id] = ctx

        # Attach MemoryManager cho learner (tạo mới nếu chưa có)
        memory = self._get_memory_manager(learner_id)
        # Store memory manager reference trên context để agents truy cập được
        ctx.set_metadata("memory_manager", memory)

        # Inject episodic context vào scratch để agents có thể đọc
        recent_episodes = memory.episodic.retrieve_recent_episodes(limit=3)
        if recent_episodes:
            ctx.set_scratch("orchestrator", "recent_episodes", recent_episodes)
        learner_prefs = memory.long_term.get_category("preferences")
        if learner_prefs:
            ctx.set_scratch("orchestrator", "learner_preferences", learner_prefs)
        learner_facts = memory.long_term.get_category("general")
        if learner_facts:
            ctx.set_scratch("orchestrator", "learner_facts", learner_facts)

        # Cleanup old conversations (giữ tối đa 100)
        if len(self._conversations) > 100:
            self._cleanup_old_conversations()

        return ctx

    def _get_memory_manager(self, learner_id: str) -> MemoryManager:
        """Get or create MemoryManager cho learner (4-layer memory)."""
        if learner_id not in self._memory_managers:
            self._memory_managers[learner_id] = MemoryManager(learner_id)
        return self._memory_managers[learner_id]

    def _cleanup_old_conversations(self) -> None:
        """Xoá conversations cũ nhất khi vượt quá giới hạn.
        Trước khi xoá, archive session vào Episodic Memory."""
        if len(self._conversations) <= 100:
            return

        # Sort by last_activity, xoá 20 conversation cũ nhất
        sorted_convs = sorted(
            self._conversations.items(),
            key=lambda x: x[1].last_activity,
        )
        for conv_id, ctx in sorted_convs[:20]:
            # Archive session trước khi xoá
            try:
                learner_id = ctx.learner.learner_id if ctx.learner else "anonymous"
                memory = self._get_memory_manager(learner_id)
                turn_count = len(ctx.conversation_turns) if hasattr(ctx, 'conversation_turns') else 0
                memory.archive_session(
                    session_summary=f"Session {conv_id[:8]}: {turn_count} turns",
                    extra_details={"conversation_id": conv_id},
                )
            except Exception:
                pass  # Không block cleanup nếu archive fail
            del self._conversations[conv_id]
            self._message_chains.pop(conv_id, None)

    def _get_message_chain(self, conversation_id: str) -> MessageChain:
        """Get or create message chain."""
        if conversation_id not in self._message_chains:
            self._message_chains[conversation_id] = MessageChain(conversation_id)
        return self._message_chains[conversation_id]

    def _learn_from_interaction(
        self,
        context: AgentContext,
        intent: str,
        agent_id: str,
        response_data: Dict[str, Any],
    ) -> None:
        """
        Learn from successful interaction — update long-term memory.
        Ghi nhận facts về learner để cải thiện phiên sau.
        """
        try:
            memory = context.get_metadata("memory_manager")
            if not memory:
                return

            # Record session turn vào short-term memory
            memory.short_term.add_turn(
                role="system",
                content=f"Intent: {intent}, Agent: {agent_id}",
                metadata={"intent": intent, "agent_id": agent_id},
            )

            # Learn mastery changes
            active_concepts = response_data.get("active_concepts", [])
            if active_concepts:
                memory.long_term.update_fact(
                    category="recent_topics",
                    fact_key="last_concepts",
                    fact_value=active_concepts[:5],
                )

            # Learn frustration patterns
            frustration = response_data.get("frustration_level", 0)
            if frustration >= 0.6:
                memory.long_term.update_fact(
                    category="learning_patterns",
                    fact_key="frustrated_recently",
                    fact_value=True,
                )

            # Learn scaffolding level preference
            scaffolding = response_data.get("scaffolding_level")
            if scaffolding:
                memory.long_term.update_fact(
                    category="preferences",
                    fact_key="scaffolding_level",
                    fact_value=scaffolding,
                )

            # Track interaction count
            learner_id = context.learner.learner_id if context.learner else "anonymous"
            interaction_count = memory.long_term.get_fact(
                "stats", "total_agent_interactions", 0
            )
            memory.long_term.update_fact(
                category="stats",
                fact_key="total_agent_interactions",
                fact_value=interaction_count + 1,
            )

        except Exception as e:
            # Non-critical — don't break main flow
            print(f"[Orchestrator] Memory learn error: {e}")

    # ════════════════════════════════════════════════
    # FALLBACK
    # ════════════════════════════════════════════════

    def _fallback_llm_response(
        self,
        query: str,
        context: AgentContext,
    ) -> str:
        """Fallback: gọi LLM trực tiếp khi không có agent phù hợp."""
        if not self.llm_engine or not self.llm_engine.is_available():
            lang = context.learner.language if context.learner else "en"
            if lang == "vi":
                return (
                    "Xin lỗi, hệ thống AI chưa sẵn sàng. "
                    "Vui lòng đảm bảo Ollama đang chạy với model Gemma 4."
                )
            return (
                "Sorry, the AI system is not ready. "
                "Please ensure Ollama is running with Gemma 4 model."
            )

        messages = context.get_llm_messages(last_n=6)
        if not messages or messages[-1].get("content") != query:
            messages.append({"role": "user", "content": query})

        # Add system prompt
        lang = context.learner.language if context.learner else "en"
        if lang == "vi":
            system = (
                "Bạn là NeuroVault AI — trợ lý học tập thông minh. "
                "Trả lời chính xác, hữu ích, và khuyến khích người học."
            )
        else:
            system = (
                "You are NeuroVault AI — an intelligent learning assistant. "
                "Provide accurate, helpful answers and encourage the learner."
            )

        messages.insert(0, {"role": "system", "content": system})

        return self.llm_engine.chat(
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
        )

    # ════════════════════════════════════════════════
    # UTILITIES
    # ════════════════════════════════════════════════

    def _build_response(
        self,
        success: bool,
        response: str,
        intent: str,
        agent_id: str,
        conversation_id: str,
        start_time: float,
        data: Optional[Dict] = None,
        suggestions: Optional[List[str]] = None,
        thinking: str = "",
        error: str = "",
    ) -> Dict[str, Any]:
        """Build standardized response dict."""
        processing_time = (time.time() - start_time) * 1000
        self._metrics["total_latency_ms"] += processing_time

        return {
            "success": success,
            "response": response,
            "intent": intent,
            "agent_id": agent_id,
            "data": data or {},
            "suggestions": suggestions or [],
            "thinking": thinking,
            "conversation_id": conversation_id,
            "processing_time_ms": round(processing_time, 1),
            "error": error,
        }

    def _detect_language(self, text: str) -> str:
        """Detect ngôn ngữ đơn giản."""
        vi_chars = set("àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ")
        vi_count = sum(1 for c in text.lower() if c in vi_chars)
        return "vi" if vi_count > len(text) * 0.02 else "en"

    def _get_error_message(self, language: str) -> str:
        """Error message theo ngôn ngữ."""
        if language == "vi":
            return (
                "Xin lỗi, hệ thống gặp sự cố khi xử lý yêu cầu của bạn. "
                "Vui lòng thử lại sau."
            )
        return (
            "Sorry, the system encountered an issue processing your request. "
            "Please try again."
        )

    # ════════════════════════════════════════════════
    # STATUS & METRICS
    # ════════════════════════════════════════════════

    def get_status(self) -> Dict[str, Any]:
        """Trạng thái tổng hợp của orchestrator."""
        return {
            "status": "active",
            "registry": self.registry.health_check(),
            "active_conversations": len(self._conversations),
            "metrics": self._metrics,
            "safety_enabled": self.enable_safety,
            "thinking_enabled": self.enable_thinking,
            "max_chain_depth": self.max_chain_depth,
        }

    def get_conversation_context(
        self,
        conversation_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Lấy context summary cho conversation."""
        ctx = self._conversations.get(conversation_id)
        if ctx:
            return ctx.to_summary()
        return None

    def __repr__(self) -> str:
        return (
            f"AgentOrchestrator("
            f"agents={self.registry.agent_count}, "
            f"conversations={len(self._conversations)}, "
            f"requests={self._metrics['total_requests']})"
        )
