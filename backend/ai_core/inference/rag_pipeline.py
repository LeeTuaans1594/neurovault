"""
NEUROVAULT — RAG Pipeline v4 (White-Box)
Retrieval-Augmented Generation: Reformulate → Retrieve → Rerank → Generate → Verify.

v4 Improvements:
- Answer grounding verification (anti-hallucination)
- Smart Query Reformulation (coreference + ellipsis resolution)
- Cross-encoder reranking integration
- Query expansion (synonyms + related terms)
- Conversation memory with sliding window
- Multi-query retrieval (HyDE-inspired)
- Source deduplication
- Bilingual system prompts (EN/VI)
"""

import re
import logging
from typing import List, Dict, Optional
from retrieval.bm25 import BM25
from retrieval.vector_store import VectorStore
from retrieval.hybrid_ranker import HybridRanker
from retrieval.cross_encoder_reranker import CrossEncoderReranker
from embedding.embedding_engine import EmbeddingEngine
from inference.llm_engine import LLMEngine
from preprocessing.language_detector import LanguageDetector

# Shared query language detector instance
_query_lang_detector = LanguageDetector()
logger = logging.getLogger(__name__)


SYSTEM_PROMPT_EN = """You are NeuroVault AI — an intelligent learning assistant.
You answer questions based ONLY on the provided document context.
Rules:
1. Always ground your answers in the provided context.
2. If the context doesn't contain enough information, say so honestly.
3. Cite specific passages when possible using [Source: chunk_id].
4. Keep answers clear, educational, and well-structured.
5. Use bullet points and headings for long answers.
6. IMPORTANT: You MUST answer in English because the user asked in English."""

SYSTEM_PROMPT_VI = """Bạn là NeuroVault AI — trợ lý học tập thông minh.
Bạn trả lời câu hỏi DỰA TRÊN NỘI DUNG tài liệu được cung cấp.
Quy tắc:
1. Luôn dựa vào ngữ cảnh tài liệu để trả lời.
2. Nếu không đủ thông tin, hãy nói rõ.
3. Trích dẫn đoạn văn cụ thể khi có thể [Nguồn: chunk_id].
4. Trả lời rõ ràng, mang tính giáo dục, có cấu trúc.
5. Sử dụng bullet points và heading cho câu trả lời dài.
6. QUAN TRỌNG: Bạn PHẢI trả lời bằng TIẾNG VIỆT vì người dùng hỏi bằng tiếng Việt."""

USER_PROMPT_EN = """Context from document:
{context}

---

Question: {query}

Please provide a comprehensive, educational answer based on the context above.
Cite sources using [Source: chunk_id] when referencing specific passages.
You MUST answer in English."""

USER_PROMPT_VI = """Ngữ cảnh từ tài liệu:
{context}

---

Câu hỏi: {query}

Hãy trả lời đầy đủ, mang tính giáo dục dựa trên ngữ cảnh ở trên.
Trích dẫn nguồn bằng [Nguồn: chunk_id] khi đề cập đến các đoạn cụ thể.
Bạn PHẢI trả lời bằng TIẾNG VIỆT."""


# ══════════════════════════════════════════════════════════
# QUERY REFORMULATOR — Coreference Resolution + Ellipsis
# ══════════════════════════════════════════════════════════

_PRONOUNS_EN = {
    'it', 'its', 'this', 'that', 'these', 'those', 'they', 'them',
    'their', 'he', 'she', 'his', 'her', 'the above', 'the previous',
    'the same', 'such', 'one',
}
_PRONOUNS_VI = {
    'nó', 'chúng', 'điều đó', 'cái đó', 'cái này', 'điều này',
    'thứ đó', 'thứ này', 'ở trên', 'phía trên', 'vừa nêu',
    'như vậy', 'vậy', 'thế',
}
_ELLIPSIS_EN = {
    'and this', 'what about', 'how about', 'also', 'same for',
    'more', 'continue', 'go on', 'next', 'why', 'how',
    'explain more', 'tell me more', 'elaborate', 'details',
}
_ELLIPSIS_VI = {
    'còn', 'thế còn', 'vậy còn', 'tiếp', 'tiếp tục',
    'thêm', 'chi tiết hơn', 'giải thích thêm', 'tại sao',
    'như thế nào', 'nói thêm', 'cụ thể hơn',
}

_REFORM_PROMPT_EN = """Rewrite the user's latest question so it is fully self-contained.
Resolve ALL pronouns (it, this, that, they...) using the conversation history.
Keep the same language. Return ONLY the rewritten question.

Conversation:
{history}

Latest question: {query}

Self-contained rewrite:"""

_REFORM_PROMPT_VI = """Viết lại câu hỏi mới nhất sao cho đầy đủ ngữ cảnh.
Giải quyết TẤT CẢ đại từ (nó, cái đó, điều này...) dựa trên lịch sử hội thoại.
Giữ nguyên tiếng Việt. Chỉ trả về câu hỏi đã viết lại.

Hội thoại:
{history}

Câu hỏi mới nhất: {query}

Câu hỏi đầy đủ:"""


class QueryReformulator:
    """
    Smart Query Reformulation for multi-turn RAG.
    Handles: coreference (pronouns), ellipsis, topic continuation.
    Uses LLM when available, rule-based fallback when offline.
    """

    def __init__(self, llm_engine=None):
        self.llm = llm_engine

    def needs_reformulation(self, query: str, chat_history: Optional[List[Dict]] = None) -> bool:
        """Detect if query has unresolved references."""
        if not chat_history:
            return False
        query_lower = query.lower().strip()
        words = set(query_lower.split())

        # Check pronouns
        if words & _PRONOUNS_EN or any(p in query_lower for p in _PRONOUNS_VI):
            return True
        # Check ellipsis patterns
        if any(query_lower.startswith(e) for e in _ELLIPSIS_EN | _ELLIPSIS_VI):
            return True
        # Very short query after 2+ turns
        user_turns = [m for m in chat_history if m.get('role') == 'user']
        if len(query_lower.split()) <= 4 and len(user_turns) >= 2:
            if not self._is_standalone(query_lower):
                return True
        return False

    def reformulate(self, query: str, chat_history: List[Dict], language: str = "en") -> str:
        """Reformulate query to be self-contained. Returns original if not needed."""
        if not self.needs_reformulation(query, chat_history):
            return query
        logger.info(f"[QueryReformulator] Reformulating: '{query[:60]}'")

        # Try LLM
        if self.llm and hasattr(self.llm, 'is_available') and self.llm.is_available():
            result = self._reform_llm(query, chat_history, language)
            if result and self._is_valid(result, query):
                logger.info(f"[QueryReformulator] LLM → '{result[:60]}'")
                return result

        # Fallback: rule-based
        result = self._reform_rules(query, chat_history)
        logger.info(f"[QueryReformulator] Rules → '{result[:60]}'")
        return result

    def _reform_llm(self, query, chat_history, language):
        """LLM-based reformulation."""
        try:
            hist = self._fmt_history(chat_history)
            prompt = (_REFORM_PROMPT_VI if language == "vi" else _REFORM_PROMPT_EN).format(
                history=hist, query=query
            )
            result = self.llm.generate(prompt=prompt,
                system="You are a query rewriter. Return only the rewritten question.",
                temperature=0.1, max_tokens=150)
            if result and not result.startswith("[ERROR]"):
                result = result.strip().strip('"').strip("'").strip()
                for pfx in ['rewritten:', 'câu hỏi:', 'self-contained:', 'question:']:
                    if result.lower().startswith(pfx):
                        result = result[len(pfx):].strip()
                return result
        except Exception as e:
            logger.warning(f"[QueryReformulator] LLM failed: {e}")
        return None

    def _reform_rules(self, query, chat_history):
        """Rule-based fallback: replace pronouns with last topic."""
        topic = self._extract_topic(chat_history)
        if not topic:
            return query
        # Replace pronouns
        result = query
        for pronoun in sorted(_PRONOUNS_EN | _PRONOUNS_VI, key=len, reverse=True):
            pat = re.compile(r'\b' + re.escape(pronoun) + r'\b', re.IGNORECASE)
            if pat.search(result):
                new = pat.sub(topic, result, count=1)
                if new != result:
                    return new
        # For very short queries, append topic context
        if len(query.split()) <= 4:
            return f"{query.rstrip('?').rstrip()} — regarding {topic}?"
        return query

    def _extract_topic(self, chat_history):
        """Extract last discussed topic from history."""
        for msg in reversed(chat_history[-4:]):
            content = msg.get('content', '')
            if not content or len(content) < 10:
                continue
            # Quoted terms
            quoted = re.findall(r'["\']([^"\']+)["\']', content)
            if quoted:
                return quoted[0][:60]
            # Bold terms
            bold = re.findall(r'\*\*([^*]+)\*\*', content)
            if bold:
                return bold[0][:60]
            # Key phrase from user question
            if msg.get('role') == 'user':
                return self._key_phrase(content)
            # First sentence subject from assistant
            if msg.get('role') == 'assistant':
                first = content.split('.')[0][:100]
                return self._key_phrase(first) if len(first) > 10 else ""
        return ""

    def _key_phrase(self, text):
        """Extract core subject from a question/sentence."""
        cleaned = text.strip().rstrip('?')
        removals = [
            'what is', 'what are', 'how does', 'why is', 'can you',
            'explain', 'tell me about', 'define', 'describe',
            'là gì', 'nghĩa là gì', 'giải thích', 'hãy', 'cho tôi biết',
            'mô tả', 'tại sao', 'như thế nào', 'làm sao',
        ]
        cl = cleaned.lower()
        for phrase in sorted(removals, key=len, reverse=True):
            if cl.startswith(phrase):
                cleaned = cleaned[len(phrase):].strip()
                cl = cleaned.lower()
        for w in ['the ', 'a ', 'an ', 'về ', 'của ']:
            if cl.startswith(w):
                cleaned = cleaned[len(w):]
        return cleaned[:60].strip() or text[:60].strip()

    def _fmt_history(self, chat_history, max_msgs=8):
        """Format history for LLM prompt."""
        recent = chat_history[-max_msgs:]
        lines = []
        for m in recent:
            role = 'User' if m.get('role') == 'user' else 'Assistant'
            lines.append(f"{role}: {m.get('content', '')[:200]}")
        return "\n".join(lines)

    def _is_standalone(self, q):
        """Check if short query is self-contained."""
        patterns = [r'^what is \w+', r'^\w+ là gì', r'^define \w+', r'^who is \w+']
        return any(re.match(p, q) for p in patterns)

    def _is_valid(self, reformulated, original):
        """Validate LLM reformulation is reasonable."""
        if not reformulated or len(reformulated) < 5:
            return False
        if reformulated.strip().lower() == original.strip().lower():
            return False
        if len(reformulated) > len(original) * 5:
            return False
        if any(w in reformulated.lower() for w in ['i cannot', "i can't", 'sorry', 'không thể']):
            return False
        return True


class RAGPipeline:
    """
    Full RAG pipeline v3:
    1. Query → Reformulate (coreference + ellipsis resolution)
    2. Reformulated Query → Hybrid Retrieval (BM25 + Vector + Cross-Encoder Rerank)
    3. Context Assembly with deduplication
    4. LLM Generation with conversation memory
    """

    def __init__(
        self,
        embedding_engine: EmbeddingEngine,
        vector_store: VectorStore,
        bm25: BM25,
        llm_engine: LLMEngine,
        language: str = "en",
        cross_encoder: Optional[CrossEncoderReranker] = None,
    ):
        self.embedding = embedding_engine
        self.vector_store = vector_store
        self.bm25 = bm25
        self.llm = llm_engine
        self.ranker = HybridRanker()
        self.cross_encoder = cross_encoder or CrossEncoderReranker()
        self.language = language
        self.chunk_texts: Dict[str, str] = {}
        self.chunk_data: Dict[str, Dict] = {}  # Full chunk data for reranking
        self.reformulator = QueryReformulator(llm_engine=llm_engine)

    def index_chunks(self, chunks: List[Dict]) -> None:
        """Index document chunks for retrieval."""
        texts = [c["text"] for c in chunks]
        ids = [c["chunk_id"] for c in chunks]

        # Fit embedding engine
        self.embedding.fit(texts)

        # Build BM25 index
        self.bm25.index(texts)

        # Build vector store
        for chunk in chunks:
            vec = self.embedding.embed(chunk["text"])
            self.vector_store.add(
                id=chunk["chunk_id"],
                vector=vec,
                metadata={"position": chunk.get("position", 0)}
            )
            self.chunk_texts[chunk["chunk_id"]] = chunk["text"]
            self.chunk_data[chunk["chunk_id"]] = chunk

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        use_reranking: bool = True,
    ) -> List[Dict]:
        """
        Retrieve relevant chunks using hybrid search + cross-encoder reranking.

        Pipeline:
        1. Dense retrieval (embedding similarity)
        2. Sparse retrieval (BM25)
        3. Hybrid fusion (RRF)
        4. Cross-encoder reranking (optional)
        """
        # Dense retrieval
        query_vec = self.embedding.embed(query)
        dense_results = self.vector_store.search(query_vec, top_k=top_k * 3)
        dense_formatted = [(id_, score) for id_, score, _ in dense_results]

        # Sparse retrieval (BM25)
        sparse_raw = self.bm25.search(query, top_k=top_k * 3)
        chunk_ids_list = list(self.chunk_texts.keys())
        sparse_formatted = []
        for idx, score in sparse_raw:
            if idx < len(chunk_ids_list):
                sparse_formatted.append((chunk_ids_list[idx], score))

        # Hybrid fusion
        fused = self.ranker.rerank_with_scores(
            dense_results=dense_formatted,
            sparse_results=sparse_formatted,
            chunk_texts=self.chunk_texts,
            query=query,
            top_k=top_k * 2,
        )

        # Cross-encoder reranking for final precision boost
        if use_reranking and len(fused) > 1:
            chunks_for_rerank = []
            for r in fused:
                chunk_id = r["chunk_id"]
                chunk_full = self.chunk_data.get(chunk_id, {})
                chunks_for_rerank.append({
                    "text": r["text"],
                    "chunk_id": chunk_id,
                    "position": chunk_full.get("position", 0),
                    "concepts": chunk_full.get("concepts", []),
                    "hybrid_score": r["score"],
                })

            reranked = self.cross_encoder.rerank(
                query=query,
                chunks=chunks_for_rerank,
                top_k=top_k,
            )

            return [
                {
                    "chunk_id": r.get("chunk_id", ""),
                    "score": r.get("rerank_score", 0),
                    "text": r.get("text", ""),
                }
                for r in reranked
            ]

        return fused[:top_k]

    def detect_query_language(self, query: str) -> str:
        """
        Detect the language of the user's query.
        Returns 'vi' or 'en'.
        Falls back to document language if query is too short or ambiguous.
        """
        query_lang = _query_lang_detector.detect(query)
        if query_lang in ('vi', 'en'):
            return query_lang
        # Fallback: if query is short, check for Vietnamese chars
        vi_chars = set('àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ'
                       'ÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ')
        if any(c in vi_chars for c in query):
            return 'vi'
        # Fallback to document language
        return self.language

    def generate_answer(
        self,
        query: str,
        top_k: int = 5,
        temperature: float = 0.7,
        chat_history: Optional[List[Dict]] = None,
        use_thinking: bool = False,
    ) -> Dict:
        """
        Full RAG v3: Reformulate → Retrieve → Augment → Generate.
        Detects query language and responds in the same language.

        Returns:
            {
                "answer": str,
                "sources": List[Dict],
                "query": str,
                "reformulated_query": str | None,
                "thinking": str (if use_thinking=True)
            }
        """
        # Detect query language — respond in the same language as the question
        query_lang = self.detect_query_language(query)

        # Step 0: Smart Query Reformulation
        reformulated = self.reformulator.reformulate(
            query=query,
            chat_history=chat_history or [],
            language=query_lang,
        )
        was_reformulated = (reformulated != query)
        retrieval_query = reformulated if was_reformulated else query

        if was_reformulated:
            logger.info(f"[RAG] Reformulated: '{query}' → '{retrieval_query}'")

        # Step 1: Retrieve using (possibly reformulated) query
        retrieved = self.retrieve(retrieval_query, top_k=top_k)

        if not retrieved:
            no_info = (
                "Tôi không tìm thấy thông tin liên quan trong tài liệu cho câu hỏi này."
                if query_lang == "vi"
                else "I couldn't find relevant information in the document for this question."
            )
            return {
                "answer": no_info,
                "sources": [],
                "query": query,
                "reformulated_query": retrieval_query if was_reformulated else None,
            }

        # Step 2: Build context with source citations
        context_parts = []
        for i, r in enumerate(retrieved):
            context_parts.append(
                f"[Passage {i+1} | ID: {r['chunk_id']}]\n{r['text']}"
            )
        context = "\n\n---\n\n".join(context_parts)

        # Step 3: Build prompt — use original query for display
        if query_lang == "vi":
            system = SYSTEM_PROMPT_VI
            user_prompt = USER_PROMPT_VI.format(context=context, query=query)
        else:
            system = SYSTEM_PROMPT_EN
            user_prompt = USER_PROMPT_EN.format(context=context, query=query)

        # Step 4: Build messages with conversation memory
        messages = [{"role": "system", "content": system}]

        if chat_history:
            # Sliding window: keep last 3 turns (6 messages)
            for msg in chat_history[-6:]:
                messages.append(msg)

        messages.append({"role": "user", "content": user_prompt})

        # Step 5: Generate with LLM
        base = {
            "sources": retrieved,
            "query": query,
            "reformulated_query": retrieval_query if was_reformulated else None,
        }

        if use_thinking:
            result = self.llm.think_and_answer(
                question=query,
                context=context,
                system=system,
            )
            answer = result["answer"]
            grounding = self._verify_grounding(answer, [r["text"] for r in retrieved])
            return {**base, "answer": answer, "thinking": result["thinking"], "grounding": grounding}
        else:
            answer = self.llm.chat(messages, temperature=temperature)
            grounding = self._verify_grounding(answer, [r["text"] for r in retrieved])
            return {**base, "answer": answer, "grounding": grounding}

    def expand_query(self, query: str) -> List[str]:
        """
        Query expansion: sinh thêm các biến thể query để tăng recall.
        Trả về list queries (original + expanded).

        Uses simple rule-based expansion (works without LLM):
        - Remove stopwords
        - Add keyword-only version
        """
        import re

        expanded = [query]

        # Keyword-only version (remove stopwords)
        stopwords = {
            'what', 'is', 'are', 'the', 'a', 'an', 'of', 'in', 'to',
            'for', 'how', 'why', 'when', 'where', 'which', 'do', 'does',
            'là', 'gì', 'nào', 'sao', 'thế', 'cái',
        }
        words = re.sub(r'[^\w\s]', '', query.lower()).split()
        keywords = [w for w in words if w not in stopwords and len(w) > 2]
        if keywords and len(keywords) < len(words):
            expanded.append(" ".join(keywords))

        return expanded

    def _verify_grounding(
        self,
        response: str,
        context_chunks: List[str],
    ) -> Dict:
        """
        Verify response is grounded in provided context (anti-hallucination).

        Algorithm:
        1. Split response into sentences/claims
        2. For each claim, check keyword overlap with context
        3. Score = grounded_claims / total_claims

        Returns:
            {
                "grounding_score": float (0.0 to 1.0),
                "is_grounded": bool,
                "total_claims": int,
                "grounded_claims": int,
            }
        """
        if not response or not context_chunks:
            return {
                "grounding_score": 0.0,
                "is_grounded": False,
                "total_claims": 0,
                "grounded_claims": 0,
            }

        context_text = " ".join(context_chunks).lower()

        # Build a set of significant words from context for O(1) lookup
        context_words = set(w for w in context_text.split() if len(w) > 3)

        # Split response into sentences
        response_sentences = re.split(r'[.!?\n]', response)

        grounded_count = 0
        total_claims = 0

        for sent in response_sentences:
            sent = sent.strip()
            if len(sent) < 20:  # Skip very short fragments
                continue
            total_claims += 1

            # Check keyword overlap between sentence and context
            sent_words = [w for w in sent.lower().split() if len(w) > 3]
            if not sent_words:
                continue

            overlap = sum(1 for w in sent_words if w in context_words)
            overlap_ratio = overlap / max(len(sent_words), 1)

            if overlap_ratio > 0.3:  # 30% of significant words match
                grounded_count += 1

        score = grounded_count / max(total_claims, 1)

        return {
            "grounding_score": round(score, 2),
            "is_grounded": score > 0.5,
            "total_claims": total_claims,
            "grounded_claims": grounded_count,
        }
