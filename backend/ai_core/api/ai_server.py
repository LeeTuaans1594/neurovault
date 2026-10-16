"""
NEUROVAULT — AI Core API Server (FastAPI)
Nhận requests từ Node.js API Gateway → xử lý bằng AI pipeline → trả kết quả.
Chạy 100% local, KHÔNG gọi API bên ngoài nào.

v4.0 — Gemma 4 E4B, Streaming SSE, Thinking Mode
"""

import os
import sys
import io
import json
import traceback
import pickle
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# ──── Windows Encoding Fix ────
# Tránh UnicodeEncodeError khi print ký tự đặc biệt trên Windows console
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from preprocessing.pdf_parser import PDFParser, parse_text_file, parse_docx_file
from preprocessing.text_cleaner import TextCleaner
from preprocessing.sentence_splitter import SentenceSplitter
from preprocessing.language_detector import LanguageDetector
from preprocessing.semantic_chunker import SemanticChunker
from embedding.embedding_engine import EmbeddingEngine
from retrieval.bm25 import BM25
from retrieval.vector_store import VectorStore
from retrieval.hybrid_ranker import HybridRanker
from inference.llm_engine import LLMEngine
from inference.rag_pipeline import RAGPipeline
from inference.topic_tracker import TopicTracker
from knowledge.concept_extractor import ConceptExtractor
from knowledge.graph_builder import KnowledgeGraphBuilder
from generation.quiz_generator import QuizGenerator
from generation.flashcard_generator import FlashcardGenerator
from adaptive.spaced_repetition import FSRSv6
from adaptive.deep_knowledge_tracer import DeepKnowledgeTracer
from adaptive.adaptive_quiz import AdaptiveQuizEngine
from adaptive.fsrs_scheduler import FSRSScheduler
from retrieval.cross_encoder_reranker import CrossEncoderReranker
from generation.summary_generator import SummaryGenerator
from learning.path_optimizer import LearningPathOptimizer
from knowledge.cross_document import CrossDocumentEngine
from learning.smart_notifications import SmartNotificationEngine
from nlp.vietnamese import VietnameseNLP

# ──── Lifespan (startup/shutdown) ────
@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan: load persisted doc stores on startup."""
    load_all_stores()
    yield

# ──── App Setup ────
app = FastAPI(
    title="NEUROVAULT AI Core",
    description="AI Processing Engine — Gemma 4 E4B, 100% Local, White-Box",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──── Initialize Modules ────
pdf_parser = PDFParser()
text_cleaner = TextCleaner()
sentence_splitter = SentenceSplitter()
language_detector = LanguageDetector()
semantic_chunker = SemanticChunker(
    window_size=3, similarity_threshold=0.3,
    min_chunk_words=50, max_chunk_words=500,
)
embedding_engine = EmbeddingEngine(mode="tfidf", dim=128)
concept_extractor = ConceptExtractor()
graph_builder = KnowledgeGraphBuilder()
quiz_generator = QuizGenerator()
flashcard_generator = FlashcardGenerator()
fsrs = FSRSv6()
fsrs_scheduler = FSRSScheduler()
dkt = DeepKnowledgeTracer()
cross_encoder = CrossEncoderReranker()
summary_generator = SummaryGenerator()
path_optimizer = LearningPathOptimizer()
vi_nlp = VietnameseNLP()
topic_trackers: Dict[str, TopicTracker] = {}  # doc_id → TopicTracker
cross_doc_engine = CrossDocumentEngine(similarity_threshold=0.85)
smart_notif_engine = SmartNotificationEngine()

# LLM Engine (connects to local Ollama)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3:1.7b")
llm_engine = LLMEngine(base_url=OLLAMA_URL, model=LLM_MODEL)

# ──── Persistence Layer ────
DATA_DIR = Path(os.path.dirname(os.path.abspath(__file__))) / ".." / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
STORES_DIR = DATA_DIR / "doc_stores"
STORES_DIR.mkdir(parents=True, exist_ok=True)

# In-memory cache backed by disk
doc_stores: Dict[str, Dict] = {}


def save_doc_store(doc_id: str, store: Dict):
    """Persist a document store to disk as pickle (includes numpy arrays + BM25 objects)."""
    try:
        store_path = STORES_DIR / f"{doc_id}.pkl"
        serializable = {
            "chunks": store["chunks"],
            "language": store["language"],
            "bm25_data": {
                "docs": store["bm25"].documents if hasattr(store["bm25"], "documents") else [],
                "doc_count": store["bm25"].doc_count if hasattr(store["bm25"], "doc_count") else 0,
            },
            "vector_data": {
                "vectors": store["vector_store"].vectors if hasattr(store["vector_store"], "vectors") else {},
                "dim": store["vector_store"].dim if hasattr(store["vector_store"], "dim") else 128,
            },
        }
        with open(store_path, "wb") as f:
            pickle.dump(serializable, f)
        print(f"[Persist] Saved store for {doc_id}")
    except Exception as e:
        print(f"[Persist] Failed to save {doc_id}: {e}")


def load_doc_store(doc_id: str) -> Optional[Dict]:
    """Load a document store from disk."""
    store_path = STORES_DIR / f"{doc_id}.pkl"
    if not store_path.exists():
        return None
    try:
        with open(store_path, "rb") as f:
            data = pickle.load(f)

        # Rebuild BM25 index
        bm25 = BM25()
        chunk_texts = [c["text"] for c in data["chunks"]]
        bm25.index(chunk_texts)

        # Rebuild Vector Store
        local_embedding = EmbeddingEngine(mode="tfidf", dim=128)
        local_embedding.fit(chunk_texts)
        vector_store = VectorStore(dim=128)
        for chunk in data["chunks"]:
            vec = local_embedding.embed(chunk["text"])
            vector_store.add(id=chunk["chunk_id"], vector=vec, metadata={"position": chunk["position"]})

        store = {
            "chunks": data["chunks"],
            "bm25": bm25,
            "vector_store": vector_store,
            "embedding_engine": local_embedding,
            "language": data["language"],
        }
        print(f"[Persist] Loaded store for {doc_id}")
        return store
    except Exception as e:
        print(f"[Persist] Failed to load {doc_id}: {e}")
        return None


def get_doc_store(doc_id: str) -> Optional[Dict]:
    """Get store from memory cache, falling back to disk."""
    if doc_id in doc_stores:
        return doc_stores[doc_id]
    store = load_doc_store(doc_id)
    if store:
        doc_stores[doc_id] = store
    return store


def load_all_stores():
    """Load all persisted stores at startup."""
    count = 0
    for pkl_file in STORES_DIR.glob("*.pkl"):
        doc_id = pkl_file.stem
        store = load_doc_store(doc_id)
        if store:
            doc_stores[doc_id] = store
            count += 1
    if count:
        print(f"[Persist] Loaded {count} document stores from disk")




# ──── Request/Response Models ────
class ProcessRequest(BaseModel):
    document_id: str
    file_path: str

class ChatRequest(BaseModel):
    document_id: str
    query: str
    chat_history: List[Dict[str, str]] = []

class QuizRequest(BaseModel):
    document_id: str
    num_questions: int = 10
    difficulty: float = 0.5

class FlashcardRequest(BaseModel):
    document_id: str
    max_cards: int = 20

class ReviewRequest(BaseModel):
    rating: int  # 1-4
    stability: float
    difficulty: float
    elapsed_days: float
    review_count: int

class AdaptiveQuizStartRequest(BaseModel):
    document_id: str
    learner_id: str = "default"
    max_questions: int = 15

class AdaptiveQuizAnswerRequest(BaseModel):
    session_id: str
    answer: str
    response_time_ms: Optional[int] = None

class FlashcardReviewRequest(BaseModel):
    document_id: str
    card_id: str
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy

class FlashcardDueRequest(BaseModel):
    document_id: str
    max_new: int = 10
    max_review: int = 50

class ProcessResponse(BaseModel):
    document_id: str
    raw_text: str
    language: str
    chunks: List[Dict[str, Any]]
    word_count: int
    page_count: int
    char_count: int
    title: str


# ──── Endpoints ────

@app.get("/health")
def health_check():
    llm_health = llm_engine.health_check()
    return {
        "status": "ok",
        "service": "NEUROVAULT AI Core v4.0",
        "llm": llm_health,
        "persisted_docs": len(list(STORES_DIR.glob("*.pkl"))),
        "cached_docs": len(doc_stores),
        "modules": {
            "pdf_parser": "ready",
            "text_cleaner": "ready",
            "sentence_splitter": "ready",
            "language_detector": "ready",
            "semantic_chunker": "ready",
            "embedding_engine": "ready",
            "bm25": "ready",
            "vector_store": "ready",
            "cross_encoder": "ready",
            "concept_extractor": "ready",
            "knowledge_graph": "ready",
            "quiz_generator": "ready",
            "flashcard_generator": "ready",
            "fsrs_scheduler": "ready",
            "dkt": "ready",
            "persistence": "ready",
            "llm_engine": llm_health["status"],
        }
    }


@app.get("/api/stats")
def get_stats():
    """Global stats for dashboard."""
    total_docs = len(doc_stores)
    total_chunks = sum(len(s["chunks"]) for s in doc_stores.values())
    all_concepts = set()
    for s in doc_stores.values():
        for c in s["chunks"]:
            all_concepts.update(c.get("concepts", []))
    return {
        "total_documents": total_docs,
        "total_chunks": total_chunks,
        "total_concepts": len(all_concepts),
        "persisted_on_disk": len(list(STORES_DIR.glob("*.pkl"))),
        "llm_available": llm_engine.is_available(),
        "llm_model": LLM_MODEL,
    }


@app.post("/api/process", response_model=ProcessResponse)
def process_document(request: ProcessRequest):
    """
    Full processing pipeline:
    File → Parse → Clean → Detect → Split → Chunk → Embed → Index → Persist
    """
    try:
        file_path = request.file_path

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Step 1: Parse
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pdf':
            parsed = pdf_parser.parse(file_path)
        elif ext == '.docx':
            parsed = parse_docx_file(file_path)
        else:
            parsed = parse_text_file(file_path)

        raw_text = parsed.text
        if not raw_text or len(raw_text.strip()) < 10:
            raise HTTPException(status_code=422, detail="Could not extract meaningful text.")

        # Step 2: Clean
        cleaned_text = text_cleaner.clean(raw_text)

        # Step 3: Detect Language
        language = language_detector.detect(cleaned_text)

        # Step 4: Split Sentences
        sentences = sentence_splitter.split(cleaned_text)

        # Step 5: Semantic Chunking
        if len(sentences) >= 5:
            chunks = semantic_chunker.chunk(sentences, cleaned_text)
        else:
            chunks = semantic_chunker.chunk_by_size(sentences, cleaned_text, target_size=200)

        # Step 6: Build embeddings + BM25 index
        chunk_dicts = []
        chunk_texts = [c.text for c in chunks]
        
        local_embedding = EmbeddingEngine(mode="tfidf", dim=128)
        local_embedding.fit(chunk_texts)
        bm25 = BM25()
        bm25.index(chunk_texts)
        vector_store = VectorStore(dim=128)

        for chunk in chunks:
            vec = local_embedding.embed(chunk.text)
            vector_store.add(id=chunk.chunk_id, vector=vec, metadata={"position": chunk.position})

            # Extract concepts for this chunk
            local_concepts = concept_extractor.extract(chunk.text)
            concept_names = [c["concept"] for c in local_concepts[:5]]

            chunk_dicts.append({
                "chunk_id": chunk.chunk_id,
                "text": chunk.text,
                "position": chunk.position,
                "char_start": chunk.char_start,
                "char_end": chunk.char_end,
                "sentence_count": chunk.sentence_count,
                "word_count": chunk.word_count,
                "embedding_vector": vec,
                "sparse_vector": {},
                "concepts": concept_names,
            })

        # Store for RAG retrieval + persist to disk
        store = {
            "chunks": chunk_dicts,
            "bm25": bm25,
            "vector_store": vector_store,
            "embedding_engine": local_embedding,
            "language": language,
        }
        doc_stores[request.document_id] = store
        save_doc_store(request.document_id, store)

        word_count = text_cleaner.count_words(cleaned_text)
        char_count = len(cleaned_text)

        print(f"[AI Core] Processed doc {request.document_id}: "
              f"{word_count} words, {len(chunks)} chunks, lang={language}, "
              f"vectors={vector_store.size()} — PERSISTED ✓")

        return ProcessResponse(
            document_id=request.document_id,
            raw_text=cleaned_text,
            language=language,
            chunks=chunk_dicts,
            word_count=word_count,
            page_count=parsed.page_count,
            char_count=char_count,
            title=parsed.title,
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/chat")
def chat_with_document(request: ChatRequest):
    """RAG-powered chat: retrieve relevant chunks -> generate answer."""
    doc_id = request.document_id

    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed. Process it first.")

    # Build RAG pipeline
    rag = RAGPipeline(
        embedding_engine=store["embedding_engine"],
        vector_store=store["vector_store"],
        bm25=store["bm25"],
        llm_engine=llm_engine,
        language=store["language"],
    )
    rag.chunk_texts = {c["chunk_id"]: c["text"] for c in store["chunks"]}

    # Generate answer
    result = rag.generate_answer(
        query=request.query,
        top_k=5,
        chat_history=request.chat_history,
    )

    # Track topic for context-awareness (Phase 2 — Task 2.3)
    if doc_id not in topic_trackers:
        topic_trackers[doc_id] = TopicTracker()
    topic_info = topic_trackers[doc_id].update(request.query, result.get("answer", ""))

    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "query": result["query"],
        "reformulated_query": result.get("reformulated_query"),
        "grounding": result.get("grounding"),
        "topic": topic_info,
        "document_id": doc_id,
    }


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest):
    """Streaming RAG chat via SSE — real-time token-by-token response."""
    doc_id = request.document_id

    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed. Process it first.")

    # Build RAG pipeline for retrieval
    rag = RAGPipeline(
        embedding_engine=store["embedding_engine"],
        vector_store=store["vector_store"],
        bm25=store["bm25"],
        llm_engine=llm_engine,
        language=store["language"],
    )
    rag.chunk_texts = {c["chunk_id"]: c["text"] for c in store["chunks"]}

    # Smart Query Reformulation — resolve pronouns/references
    query_lang = rag.detect_query_language(request.query)
    refined_query = rag.reformulator.reformulate(
        query=request.query,
        chat_history=request.chat_history or [],
        language=query_lang,
    )
    retrieved = rag.retrieve(refined_query, top_k=5)
    context_parts = []
    for i, r in enumerate(retrieved):
        context_parts.append(f"[Passage {i+1} | {r['chunk_id']}]\n{r['text']}")
    context = "\n\n---\n\n".join(context_parts)

    # query_lang already detected above for reformulation

    # Build messages for LLM — match query language
    if query_lang == "vi":
        system = (
            "Bạn là NeuroVault AI — trợ lý học tập thông minh. "
            "Trả lời dựa trên nội dung tài liệu được cung cấp. "
            "QUAN TRỌNG: Bạn PHẢI trả lời bằng TIẾNG VIỆT vì người dùng hỏi bằng tiếng Việt."
        )
        user_prompt = f"Ngữ cảnh từ tài liệu:\n{context}\n\n---\nCâu hỏi: {request.query}\nHãy trả lời đầy đủ bằng TIẾNG VIỆT."
    else:
        system = (
            "You are NeuroVault AI — an intelligent learning assistant. "
            "Answer based on document context. "
            "IMPORTANT: You MUST answer in English because the user asked in English."
        )
        user_prompt = f"Context:\n{context}\n\n---\nQuestion: {request.query}\nProvide a comprehensive answer in English."

    messages = [{"role": "system", "content": system}]
    if request.chat_history:
        for msg in request.chat_history[-6:]:
            messages.append(msg)
    messages.append({"role": "user", "content": user_prompt})

    def event_stream():
        # Send sources first
        sources_event = json.dumps({"type": "sources", "sources": retrieved})
        yield f"data: {sources_event}\n\n"
        # Stream tokens
        for token in llm_engine.chat_stream(messages):
            token_event = json.dumps({"type": "token", "content": token})
            yield f"data: {token_event}\n\n"
        # Done
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/knowledge-graph")
def build_knowledge_graph(request: ProcessRequest):
    """Build knowledge graph from document chunks (v3: LLM-verified + communities)."""
    doc_id = request.document_id
    
    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")
    
    chunks = store["chunks"]
    # Disable LLM for Knowledge Graph Builder to prevent extreme slowdowns
    kg_builder = KnowledgeGraphBuilder(
        llm_engine=None 
    )
    graph = kg_builder.build(chunks, doc_id, user_id="system")
    
    return {
        "document_id": doc_id,
        "graph": graph,
    }


@app.post("/api/quiz")
def generate_quiz(request: QuizRequest):
    """Generate quiz questions from document content."""
    doc_id = request.document_id
    
    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")
    
    chunks = store["chunks"]
    language = store.get("language", "en")
    all_text = " ".join(c["text"] for c in chunks)
    chunk_texts = [c["text"] for c in chunks]
    
    # Use LLM-enhanced concept extraction for quiz generation
    llm_avail = llm_engine.is_available()
    quiz_concept_extractor = ConceptExtractor(
        llm_engine=llm_engine if llm_avail else None
    )
    concepts = quiz_concept_extractor.extract(all_text, chunks=chunk_texts)
    
    qgen = QuizGenerator(llm_engine=llm_engine if llm_avail else None)
    questions = qgen.generate_from_concepts(
        concepts=concepts,
        chunks=chunks,
        num_questions=request.num_questions,
        difficulty=request.difficulty,
        language=language,
    )
    
    return {
        "document_id": doc_id,
        "questions": questions,
        "total": len(questions),
    }


@app.post("/api/flashcards")
def generate_flashcards(request: FlashcardRequest):
    """Generate flashcards from document content."""
    doc_id = request.document_id
    
    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")
    
    chunks = store["chunks"]
    language = store.get("language", "en")
    all_text = " ".join(c["text"] for c in chunks)
    concepts = concept_extractor.extract(all_text)
    
    fgen = FlashcardGenerator(llm_engine=llm_engine if llm_engine.is_available() else None)
    cards = fgen.generate(
        concepts=concepts,
        chunks=chunks,
        max_cards=request.max_cards,
        language=language,
    )
    
    return {
        "document_id": doc_id,
        "flashcards": cards,
        "total": len(cards),
    }


@app.post("/api/spaced-repetition/review")
def schedule_review(request: ReviewRequest):
    """Calculate next review schedule using FSRS algorithm."""
    if request.review_count <= 1:
        result = fsrs.initial_review(request.rating)
    else:
        result = fsrs.review(
            rating=request.rating,
            stability=request.stability,
            difficulty=request.difficulty,
            elapsed_days=request.elapsed_days,
            review_count=request.review_count,
        )
    return result


# ──── Adaptive Quiz API (Phase 2 — Task 2.1) ────

# Lazy-init: create engine when first needed (after llm_engine is ready)
_adaptive_engine: Optional[AdaptiveQuizEngine] = None

def _get_adaptive_engine() -> AdaptiveQuizEngine:
    global _adaptive_engine
    if _adaptive_engine is None:
        qgen = QuizGenerator(llm_engine=llm_engine if llm_engine.is_available() else None)
        _adaptive_engine = AdaptiveQuizEngine(quiz_generator=qgen, dkt=dkt)
    return _adaptive_engine


@app.post("/api/adaptive-quiz/start")
def adaptive_quiz_start(request: AdaptiveQuizStartRequest):
    """Start an adaptive quiz session with IRT-based difficulty adjustment."""
    store = get_doc_store(request.document_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    language = store.get("language", "en")
    all_text = " ".join(c["text"] for c in chunks)
    chunk_texts = [c["text"] for c in chunks]
    # Use LLM-enhanced concept extraction for adaptive quiz
    adaptive_concept_extractor = ConceptExtractor(
        llm_engine=llm_engine if llm_engine.is_available() else None
    )
    concepts = adaptive_concept_extractor.extract(all_text, chunks=chunk_texts)

    engine = _get_adaptive_engine()
    import uuid
    session_id = str(uuid.uuid4())[:8]

    result = engine.create_session(
        session_id=session_id,
        document_id=request.document_id,
        concepts=concepts,
        chunks=chunks,
        learner_id=request.learner_id,
        language=language,
        max_questions=request.max_questions,
    )

    return result


@app.post("/api/adaptive-quiz/answer")
def adaptive_quiz_answer(request: AdaptiveQuizAnswerRequest):
    """Submit an answer to adaptive quiz and get next question or results."""
    engine = _get_adaptive_engine()
    result = engine.submit_answer(
        session_id=request.session_id,
        answer=request.answer,
        response_time_ms=request.response_time_ms,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/adaptive-quiz/status/{session_id}")
def adaptive_quiz_status(session_id: str):
    """Get adaptive quiz session status."""
    engine = _get_adaptive_engine()
    status = engine.get_session_status(session_id)
    if not status:
        raise HTTPException(status_code=404, detail="Session not found")
    return status


# ──── FSRS Scheduler API (Phase 2 — Task 2.2) ────

@app.post("/api/flashcards/due")
def get_due_flashcards(request: FlashcardDueRequest):
    """Get flashcards due for review, prioritized by urgency."""
    store = get_doc_store(request.document_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    language = store.get("language", "en")
    all_text = " ".join(c["text"] for c in chunks)
    concepts = concept_extractor.extract(all_text)

    # Generate flashcards (or get cached ones)
    fgen = FlashcardGenerator(llm_engine=llm_engine if llm_engine.is_available() else None)
    cards = fgen.generate(concepts=concepts, chunks=chunks, language=language)

    # Get due cards via scheduler
    due = fsrs_scheduler.get_due_cards(
        cards=cards,
        max_new=request.max_new,
        max_review=request.max_review,
    )

    return {
        "document_id": request.document_id,
        "due_cards": due,
        "total_due": len(due),
        "stats": fsrs_scheduler.get_session_stats(cards),
    }


@app.post("/api/flashcards/review")
def review_flashcard(request: FlashcardReviewRequest):
    """Process a flashcard review and update its schedule."""
    store = get_doc_store(request.document_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    language = store.get("language", "en")
    all_text = " ".join(c["text"] for c in chunks)
    concepts = concept_extractor.extract(all_text)

    fgen = FlashcardGenerator(llm_engine=llm_engine if llm_engine.is_available() else None)
    cards = fgen.generate(concepts=concepts, chunks=chunks, language=language)

    result = fsrs_scheduler.review_card(
        card_id=request.card_id,
        rating=request.rating,
        cards=cards,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Card not found")

    return {
        "card_id": request.card_id,
        "schedule": result,
        "daily_recommendation": fsrs_scheduler.get_optimal_daily_load(cards),
    }


@app.get("/api/flashcards/stats/{document_id}")
def flashcard_stats(document_id: str):
    """Get flashcard deck statistics and daily recommendations."""
    store = get_doc_store(document_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    language = store.get("language", "en")
    all_text = " ".join(c["text"] for c in chunks)
    concepts = concept_extractor.extract(all_text)

    fgen = FlashcardGenerator(llm_engine=llm_engine if llm_engine.is_available() else None)
    cards = fgen.generate(concepts=concepts, chunks=chunks, language=language)

    return {
        "document_id": document_id,
        "stats": fsrs_scheduler.get_session_stats(cards),
        "daily_recommendation": fsrs_scheduler.get_optimal_daily_load(cards),
    }


@app.get("/api/concepts/{document_id}")
def get_concepts(document_id: str):
    """Extract key concepts from a document."""
    store = get_doc_store(document_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")
    
    chunks = store["chunks"]
    all_text = " ".join(c["text"] for c in chunks)
    concepts = concept_extractor.extract(all_text)
    
    return {
        "document_id": document_id,
        "concepts": concepts,
        "total": len(concepts),
    }

# ──── Deep Knowledge Tracing Endpoints ────

class KTUpdateRequest(BaseModel):
    learner_id: str
    concept: str
    is_correct: bool
    related_concepts: List[str] = []

class KTQueryRequest(BaseModel):
    learner_id: str
    concepts: List[str] = []


@app.post("/api/knowledge-trace/update")
def kt_update(request: KTUpdateRequest):
    """Update learner mastery after a quiz/flashcard interaction."""
    result = dkt.update(
        learner_id=request.learner_id,
        concept=request.concept,
        is_correct=request.is_correct,
        related_concepts=request.related_concepts,
    )
    return result


@app.post("/api/knowledge-trace/predict")
def kt_predict(request: KTQueryRequest):
    """Get current mastery predictions for concepts."""
    predictions = {}
    for concept in request.concepts:
        predictions[concept] = round(dkt.predict_mastery(request.learner_id, concept), 4)
    
    weak = dkt.get_weak_concepts(request.learner_id)
    summary = dkt.get_learner_summary(request.learner_id)
    
    return {
        "learner_id": request.learner_id,
        "predictions": predictions,
        "weak_concepts": weak[:10],
        "summary": summary,
    }


@app.post("/api/adaptive-difficulty")
def adaptive_difficulty(request: KTQueryRequest):
    """Get recommended quiz difficulty based on learner state."""
    difficulty = dkt.get_recommended_difficulty(request.learner_id, request.concepts)
    weak = dkt.get_weak_concepts(request.learner_id, threshold=0.5)
    
    return {
        "learner_id": request.learner_id,
        "recommended_difficulty": difficulty,
        "weak_concepts": [w["concept"] for w in weak[:5]],
        "total_concepts_tracked": len(request.concepts),
    }


# ──── Summary Endpoint ────

class SummaryRequest(BaseModel):
    document_id: str
    num_sentences: int = 5
    use_mmr: bool = True


@app.post("/api/summary")
def generate_summary(request: SummaryRequest):
    """Generate extractive summary of a document."""
    doc_id = request.document_id

    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    full_text = " ".join(c["text"] for c in chunks)

    result = summary_generator.summarize(
        text=full_text,
        num_sentences=request.num_sentences,
        use_mmr=request.use_mmr,
    )

    return {
        "document_id": doc_id,
        **result,
    }


# ──── Learning Path Endpoints ────

class LearningPathRequest(BaseModel):
    document_id: str
    learner_id: str
    num_recommendations: int = 5


@app.post("/api/learning-path")
def get_learning_path(request: LearningPathRequest):
    """Get optimized learning path for a document."""
    doc_id = request.document_id

    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    all_text = " ".join(c["text"] for c in chunks)
    concepts = concept_extractor.extract(all_text)
    graph = graph_builder.build(chunks, doc_id, request.learner_id)

    # Get current mastery from DKT
    mastery = {}
    for node in graph["nodes"]:
        mastery[node["concept"]] = dkt.predict_mastery(
            request.learner_id, node["concept"]
        )

    # Get recommendations
    recs = path_optimizer.get_next_concepts(
        concepts=graph["nodes"],
        edges=graph["edges"],
        mastery=mastery,
        n=request.num_recommendations,
    )

    return {
        "document_id": doc_id,
        "learner_id": request.learner_id,
        "recommendations": recs,
        "total_concepts": len(graph["nodes"]),
    }


class StudyPlanRequest(BaseModel):
    document_id: str
    learner_id: str
    days: int = 7


@app.post("/api/study-plan")
def generate_study_plan(request: StudyPlanRequest):
    """Generate daily study plan."""
    doc_id = request.document_id

    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    graph = graph_builder.build(chunks, doc_id, request.learner_id)

    mastery = {}
    for node in graph["nodes"]:
        mastery[node["concept"]] = dkt.predict_mastery(
            request.learner_id, node["concept"]
        )

    plan = path_optimizer.generate_study_plan(
        concepts=graph["nodes"],
        edges=graph["edges"],
        mastery=mastery,
        days=request.days,
    )

    return {
        "document_id": doc_id,
        "learner_id": request.learner_id,
        "plan": plan,
    }


# ──── Agentic AI: Tutor Agent ────

from agents.tutor_agent import TutorAgent
from agents.assessment_agent import AssessmentAgent
from agents.feedback_agent import FeedbackAgent
from agents.path_planning_agent import PathPlanningAgent
from agents.safety_agent import SafetyAgent
from agents.registry import AgentRegistry
from agents.orchestrator import AgentOrchestrator

# RAG pipeline factory — tạo RAG pipeline cho document cụ thể
def _rag_pipeline_factory(doc_id: str):
    """Factory tạo RAG pipeline từ doc_stores cho TutorAgent."""
    store = get_doc_store(doc_id)
    if not store:
        return None
    rag = RAGPipeline(
        embedding_engine=store["embedding_engine"],
        vector_store=store["vector_store"],
        bm25=store["bm25"],
        llm_engine=llm_engine,
        language=store["language"],
    )
    rag.chunk_texts = {c["chunk_id"]: c["text"] for c in store["chunks"]}
    return rag

# Khởi tạo Agent system
agent_registry = AgentRegistry()
tutor_agent = TutorAgent(
    llm_engine=llm_engine,
    dkt=dkt,
    concept_extractor=concept_extractor,
    rag_pipeline_factory=_rag_pipeline_factory,
)
agent_registry.register(tutor_agent)

assessment_agent = AssessmentAgent(
    llm_engine=llm_engine,
    dkt=dkt,
    quiz_generator=quiz_generator,
    doc_store_func=get_doc_store,
)
agent_registry.register(assessment_agent)

feedback_agent = FeedbackAgent(
    llm_engine=llm_engine,
    dkt=dkt,
)
agent_registry.register(feedback_agent)

path_planning_agent = PathPlanningAgent(
    llm_engine=llm_engine,
    path_optimizer=path_optimizer,
    dkt=dkt,
    graph_builder=graph_builder,
    doc_store_func=get_doc_store,
)
agent_registry.register(path_planning_agent)

safety_agent = SafetyAgent(
    llm_engine=llm_engine,
)
agent_registry.register(safety_agent)

agent_orchestrator = AgentOrchestrator(
    registry=agent_registry,
    llm_engine=llm_engine,
    enable_safety=True,
)


class AgentAskRequest(BaseModel):
    query: str
    learner_id: str = "anonymous"
    document_id: str = ""
    conversation_id: str = ""
    language: str = ""


@app.post("/api/agent/ask")
def agent_ask(request: AgentAskRequest):
    """Unified Agent Ask endpoint — Orchestrator tự động chọn agent."""
    result = agent_orchestrator.process_user_request(
        query=request.query,
        learner_id=request.learner_id,
        document_id=request.document_id,
        conversation_id=request.conversation_id,
        language=request.language,
    )
    return result


@app.post("/api/agent/ask/stream")
def agent_ask_stream(request: AgentAskRequest):
    """
    Unified Agent Ask — SSE streaming mode.
    Stream response token-by-token cho real-time UX.
    Sử dụng shared stream_handler để tránh duplicate code.
    
    SSE Events:
    - {type: "meta", ...}     → metadata trước khi stream bắt đầu
    - {type: "token", content} → từng token
    - {type: "done", ...}     → kết thúc + metadata đầy đủ
    - {type: "error", error}  → lỗi
    """
    from agents.stream_handler import generate_stream_events

    # Validate query
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query is required.")

    def event_stream():
        for event in generate_stream_events(
            query=request.query,
            learner_id=request.learner_id,
            document_id=request.document_id,
            conversation_id=request.conversation_id,
            language=request.language,
            orchestrator=agent_orchestrator,
            llm_engine=llm_engine,
            fallback_agent=tutor_agent,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.websocket("/api/agent/ws")
async def agent_websocket(websocket: WebSocket):
    """
    WebSocket endpoint cho real-time chat với Agent Orchestrator.
    Nhận message dạng JSON: { query, learner_id, document_id, conversation_id, language }
    Sử dụng shared stream_handler để đảm bảo logic nhất quán với SSE.
    """
    from agents.stream_handler import generate_stream_events

    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("query")
            if not query or not query.strip():
                await websocket.send_json({"type": "error", "error": "Query is required."})
                continue

            try:
                for event in generate_stream_events(
                    query=query,
                    learner_id=data.get("learner_id", "anonymous"),
                    document_id=data.get("document_id", ""),
                    conversation_id=data.get("conversation_id", ""),
                    language=data.get("language", ""),
                    orchestrator=agent_orchestrator,
                    llm_engine=llm_engine,
                    fallback_agent=tutor_agent,
                ):
                    await websocket.send_json(event)

            except Exception as e:
                traceback.print_exc()
                await websocket.send_json({"type": "error", "error": str(e)})

    except WebSocketDisconnect:
        print("[AI Core] Agent WebSocket disconnected")


@app.get("/api/agent/status")
def agent_status():
    """Trạng thái Agent system."""
    return agent_orchestrator.get_status()


# ──── Phase 5: Cross-Document Knowledge ────

class CrossDocRequest(BaseModel):
    document_ids: List[str]


@app.post("/api/cross-document/merge")
def merge_document_graphs(request: CrossDocRequest):
    """Merge knowledge graphs from multiple documents into unified graph."""
    engine = CrossDocumentEngine(similarity_threshold=0.85)
    added_docs = 0

    for doc_id in request.document_ids:
        store = get_doc_store(doc_id)
        if not store:
            continue

        chunks = store["chunks"]
        kg_builder = KnowledgeGraphBuilder(
            llm_engine=llm_engine if llm_engine.is_available() else None
        )
        graph = kg_builder.build(chunks, doc_id, user_id="system")
        engine.add_document_graph(doc_id, graph)
        added_docs += 1

    unified = engine.get_unified_graph()
    cross_concepts = engine.get_cross_document_concepts()

    return {
        "documents_merged": added_docs,
        "graph": unified,
        "cross_document_concepts": cross_concepts,
    }


@app.post("/api/cross-document/related")
def find_related_documents(request: ProcessRequest):
    """Find documents related to a given document by concept overlap."""
    doc_id = request.document_id

    # Ensure this doc's graph is indexed
    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    graph = graph_builder.build(chunks, doc_id, user_id="system")
    cross_doc_engine.add_document_graph(doc_id, graph)

    # Also index all other loaded documents
    for other_id, other_store in doc_stores.items():
        if other_id != doc_id and other_id not in cross_doc_engine.doc_graphs:
            other_chunks = other_store["chunks"]
            other_graph = graph_builder.build(other_chunks, other_id, user_id="system")
            cross_doc_engine.add_document_graph(other_id, other_graph)

    related = cross_doc_engine.get_related_documents(doc_id)

    return {
        "document_id": doc_id,
        "related_documents": related,
    }


# ──── Phase 5: Smart Notifications ────

class NotificationCheckRequest(BaseModel):
    user_id: str
    flashcard_states: Optional[List[Dict]] = None
    concept_mastery: Optional[List[Dict]] = None
    streak: Optional[Dict] = None
    recent_sessions: Optional[List[Dict]] = None
    stats: Optional[Dict] = None


@app.post("/api/smart-notifications/check")
def check_smart_notifications(request: NotificationCheckRequest):
    """Check learner state and generate contextual notifications."""
    learner_state = {
        "user_id": request.user_id,
        "flashcard_states": request.flashcard_states or [],
        "concept_mastery": request.concept_mastery or [],
        "streak": request.streak or {},
        "recent_sessions": request.recent_sessions or [],
        "stats": request.stats or {},
    }

    notifications = smart_notif_engine.check_and_generate(learner_state)
    digest = smart_notif_engine.generate_weekly_digest(learner_state)

    return {
        "notifications": notifications,
        "weekly_digest": digest,
    }


# ──── Phase 5: Learning Path API ────

class NextConceptsRequest(BaseModel):
    document_id: str
    learner_id: str = "default"
    top_n: int = 5


@app.post("/api/learning-path/next")
def get_next_concepts(request: NextConceptsRequest):
    """Get recommended next concepts to study."""
    doc_id = request.document_id

    store = get_doc_store(doc_id)
    if not store:
        raise HTTPException(status_code=404, detail="Document not indexed.")

    chunks = store["chunks"]
    graph = graph_builder.build(chunks, doc_id, request.learner_id)

    mastery = {}
    for node in graph["nodes"]:
        mastery[node["concept"]] = dkt.predict_mastery(
            request.learner_id, node["concept"]
        )

    recommendations = path_optimizer.get_next_concepts(
        concepts=graph["nodes"],
        edges=graph["edges"],
        mastery=mastery,
        n=request.top_n,
    )

    return {
        "document_id": doc_id,
        "learner_id": request.learner_id,
        "recommendations": recommendations,
    }


# ──── Run ────
if __name__ == "__main__":
    import uvicorn
    print(f"""
======================================================
     NEUROVAULT AI Core v6.0 — Phase 5 Ecosystem
     Running on port 8000
     100% Local — White-Box AI
     Model: {llm_engine.model}

     Modules:
       - Document Processing Pipeline
       - Embedding Engine v2 (Truncated SVD)
       - BM25 + Vector + Cross-Encoder Retrieval
       - RAG Pipeline v4 (Answer Grounding)
       - Streaming SSE Chat
       - Knowledge Graph v3 (LLM-verified + Communities)
       - Quiz Generator v4 (LLM-First + Adaptive IRT)
       - Flashcard Generator v2 (FSRS metadata)
       - Summary Generator v2 (TextRank + MMR)
       - FSRS v6 (17 weights + Priority Scheduler)
       - Deep Knowledge Tracing v2
       - Learning Path Optimizer (ZPD)
       - Cross-Document Knowledge Engine
       - Smart Notification Engine
       - Vietnamese NLP (500+ stopwords)
       - Data Persistence (pickle/disk)
       - BPE Tokenizer (white-box)
       - Agentic AI: Orchestrator + 5 Agents
       - Agent Memory (4-layer)
       - Safety Agent (rule-based + LLM)
======================================================
    """)
    uvicorn.run(app, host="0.0.0.0", port=8000)

