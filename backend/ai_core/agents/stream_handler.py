"""
NEUROVAULT — Agent Stream Handler
Xử lý thống nhất streaming cho cả SSE (HTTP) và WebSocket.
Extract shared logic từ ai_server.py để tránh DRY violation.

Tự viết 100% — KHÔNG dùng framework bên ngoài.

Flow:
1. Chuẩn bị context (qua Orchestrator)
2. Classify intent → select agent
3. Build messages (system prompt, RAG, session note, history)
4. Stream tokens từ LLM
5. Post-process (encouragement)
6. Generate suggestions
7. Yield structured events (meta, token, done, error)
"""

import json
import traceback
from typing import Any, Dict, Generator, Optional


class StreamEvent:
    """Structured event cho streaming output."""
    META = "meta"
    TOKEN = "token"
    DONE = "done"
    ERROR = "error"


def generate_stream_events(
    query: str,
    learner_id: str,
    document_id: str,
    conversation_id: str,
    language: str,
    orchestrator: Any,
    llm_engine: Any,
    fallback_agent: Any,
) -> Generator[Dict[str, Any], None, None]:
    """
    Generator thống nhất cho Agent streaming.
    Yield các dict events — caller (SSE/WS) tự format output.

    Yields:
        {"type": "meta", "intent": str, "agent_id": str, "conversation_id": str}
        {"type": "token", "content": str}
        {"type": "done", "data": dict, "suggestions": list, "conversation_id": str}
        {"type": "error", "error": str}
    """
    try:
        # ── Step 1: Validate ──
        if not query or not query.strip():
            yield {"type": StreamEvent.ERROR, "error": "Query is required."}
            return

        # ── Step 2: Chuẩn bị context qua Orchestrator ──
        context = orchestrator._get_or_create_context(
            conversation_id=conversation_id,
            learner_id=learner_id,
            document_id=document_id,
            language=language,
        )
        context.add_turn(role="user", content=query)

        # ── Step 3: Classify intent + Safety check ──
        intent = orchestrator._classify_intent(query, context)

        if orchestrator.enable_safety:
            safety_ok, safety_msg = orchestrator._run_safety_check(query, context)
            if not safety_ok:
                yield {"type": StreamEvent.TOKEN, "content": safety_msg}
                yield {
                    "type": StreamEvent.DONE,
                    "data": {"blocked": True, "reason": "safety"},
                    "suggestions": [],
                    "conversation_id": context.conversation_id,
                }
                return

        # ── Step 4: Select agent ──
        agent = orchestrator._select_agent(intent, context)
        if not agent:
            agent = fallback_agent

        lang = language or orchestrator._detect_language(query)

        # Yield meta event
        yield {
            "type": StreamEvent.META,
            "intent": intent,
            "agent_id": agent.agent_id,
            "conversation_id": context.conversation_id,
        }

        # ── Step 5: Session tracking ──
        turn_count = context.get_scratch(agent.agent_id, "turn_count", 0) + 1
        context.set_scratch(agent.agent_id, "turn_count", turn_count)

        # ── Step 6: Frustration detection ──
        frustration = 0.0
        if hasattr(agent, '_detect_frustration'):
            frustration = agent._detect_frustration(query, context)
            context.set_scratch(agent.agent_id, "frustration_level", frustration)

        # ── Step 7: Effort gate check ──
        if hasattr(agent, '_is_direct_answer_request') and hasattr(agent, '_effort_gate_response'):
            if turn_count <= 2 and agent._is_direct_answer_request(query) and frustration < 0.6:
                gate = agent._effort_gate_response(query, lang)
                yield {"type": StreamEvent.TOKEN, "content": gate.content}
                yield {
                    "type": StreamEvent.DONE,
                    "data": gate.data,
                    "suggestions": [],
                    "conversation_id": context.conversation_id,
                }
                return

        # ── Step 8: Detect Socratic phase ──
        phase = "eliciting"
        if hasattr(agent, '_detect_socratic_phase'):
            phase = agent._detect_socratic_phase(query, context)
            if frustration >= 0.7:
                phase = "encouraging"
            context.set_scratch(agent.agent_id, "socratic_phase", phase)

        # ── Step 9: Get RAG context ──
        rag_context = ""
        if hasattr(agent, '_get_rag_context'):
            rag_context = agent._get_rag_context(query, context)

        # ── Step 10: Extract concepts ──
        concepts = []
        if hasattr(agent, '_extract_query_concepts'):
            concepts = agent._extract_query_concepts(query)

        # ── Step 11: Build LLM messages ──
        system_prompt = agent.get_system_prompt(context)
        messages = [{"role": "system", "content": system_prompt}]

        if rag_context:
            rag_header = "Tài liệu tham khảo" if lang == "vi" else "Reference material"
            messages.append({"role": "system", "content": f"{rag_header}:\n{rag_context}"})

        # Session note
        if hasattr(agent, '_build_session_note'):
            session_note = agent._build_session_note(context, frustration, lang)
            if session_note:
                messages.append({"role": "system", "content": session_note})

        # Conversation history
        history = context.get_llm_messages(last_n=8)
        messages.extend(history)
        if not history or history[-1].get("content") != query:
            messages.append({"role": "user", "content": query})

        # ── Step 12: Get scaffolding level ──
        scaffolding_level = "intermediate"
        if hasattr(agent, '_get_scaffolding_level'):
            scaffolding_level = agent._get_scaffolding_level(context)

        # ── Step 13: Stream from LLM ──
        if llm_engine.is_available():
            full_response = ""
            for token in llm_engine.chat_stream(messages):
                full_response += token
                yield {"type": StreamEvent.TOKEN, "content": token}

            # Post-process: encouragement
            if hasattr(agent, '_maybe_add_encouragement'):
                try:
                    from agents.tutor_agent import SCAFFOLDING_CONFIG
                    config = SCAFFOLDING_CONFIG.get(
                        scaffolding_level,
                        SCAFFOLDING_CONFIG["intermediate"],
                    )
                    processed = agent._maybe_add_encouragement(full_response, context, config)
                    if processed != full_response:
                        extra = processed[: len(processed) - len(full_response)]
                        if extra:
                            yield {"type": StreamEvent.TOKEN, "content": extra}
                        full_response = processed
                except Exception:
                    pass  # Non-critical — skip encouragement on error

            # Update conversation context
            context.add_turn(
                role="assistant",
                content=full_response,
                agent_id=agent.agent_id,
            )
        else:
            # Offline fallback
            if hasattr(agent, '_generate_offline_response'):
                offline = agent._generate_offline_response(query, context, phase)
                full_response = offline.content
            else:
                full_response = (
                    "AI đang offline. Khởi động Ollama để sử dụng."
                    if lang == "vi"
                    else "AI is offline. Start Ollama to use."
                )
            yield {"type": StreamEvent.TOKEN, "content": full_response}

        # ── Step 14: Generate suggestions ──
        suggestions = []
        if hasattr(agent, '_generate_suggestions'):
            suggestions = agent._generate_suggestions(query, phase, lang)

        # ── Step 15: Done event ──
        yield {
            "type": StreamEvent.DONE,
            "data": {
                "socratic_phase": phase,
                "scaffolding_level": scaffolding_level,
                "active_concepts": concepts[:5] if concepts else [],
                "has_rag_context": bool(rag_context),
                "turn_count": turn_count,
                "frustration_level": round(frustration, 2),
            },
            "suggestions": suggestions,
            "conversation_id": context.conversation_id,
        }

    except Exception as e:
        traceback.print_exc()
        yield {"type": StreamEvent.ERROR, "error": str(e)}
