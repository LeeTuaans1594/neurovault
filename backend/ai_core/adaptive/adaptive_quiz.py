"""
NEUROVAULT — Adaptive Quiz Engine (White-Box)
IRT-based (Item Response Theory) adaptive quiz that adjusts difficulty in realtime.

Core Algorithm: 1-Parameter Logistic IRT (Rasch Model)
    P(correct | θ, b) = 1 / (1 + exp(-(θ - b)))
    θ = learner ability (estimated via MLE after each response)
    b = item difficulty (pre-calibrated per question)

Features:
- Realtime ability estimation via Maximum Likelihood
- Adaptive question selection (maximize information)
- Question bank management (pre-generated pools)
- Stopping criteria (SE < threshold OR max questions)
- DKT integration for prior ability estimation
- Bilingual support (EN/VI)
"""

import math
import random
import hashlib
import logging
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════
# IRT MODEL — 1PL Rasch Model (White-Box)
# ══════════════════════════════════════════════════════════


def irt_probability(theta: float, difficulty: float) -> float:
    """
    1PL IRT: probability of correct response.
    P(correct) = 1 / (1 + exp(-(θ - b)))
    """
    z = theta - difficulty
    z = max(-10, min(10, z))  # Prevent overflow
    return 1.0 / (1.0 + math.exp(-z))


def irt_information(theta: float, difficulty: float) -> float:
    """
    Fisher information at θ for a given item.
    I(θ) = P(θ) * (1 - P(θ))
    Maximal when θ ≈ b (item matches ability).
    """
    p = irt_probability(theta, difficulty)
    return p * (1 - p)


def mle_ability(
    responses: List[Dict],
    prior_theta: float = 0.0,
    max_iter: int = 30,
    tol: float = 0.001,
) -> Tuple[float, float]:
    """
    Maximum Likelihood Estimation of ability θ.

    Uses Newton-Raphson iteration:
        θ_{n+1} = θ_n + Σ(x_i - P_i) / Σ(P_i * Q_i)

    Args:
        responses: [{difficulty: float, is_correct: bool}, ...]
        prior_theta: Starting estimate
        max_iter: Max Newton-Raphson iterations
        tol: Convergence tolerance

    Returns:
        (theta_estimate, standard_error)
    """
    if not responses:
        return prior_theta, 999.0  # No data yet

    # Edge case: all correct or all wrong → use bounded estimate
    all_correct = all(r["is_correct"] for r in responses)
    all_wrong = all(not r["is_correct"] for r in responses)
    if all_correct:
        # Ability is higher than hardest item
        max_b = max(r["difficulty"] for r in responses)
        return max_b + 1.0, _se_from_responses(responses, max_b + 1.0)
    if all_wrong:
        min_b = min(r["difficulty"] for r in responses)
        return min_b - 1.0, _se_from_responses(responses, min_b - 1.0)

    # Newton-Raphson
    theta = prior_theta
    for _ in range(max_iter):
        numerator = 0.0
        denominator = 0.0
        for r in responses:
            p = irt_probability(theta, r["difficulty"])
            q = 1.0 - p
            x = 1.0 if r["is_correct"] else 0.0
            numerator += (x - p)
            denominator += p * q

        if abs(denominator) < 1e-10:
            break

        delta = numerator / denominator
        theta += delta

        if abs(delta) < tol:
            break

    # Constrain to reasonable range
    theta = max(-4.0, min(4.0, theta))
    se = _se_from_responses(responses, theta)
    return theta, se


def _se_from_responses(responses: List[Dict], theta: float) -> float:
    """Standard Error of θ: SE = 1 / sqrt(Σ I(θ))."""
    total_info = sum(irt_information(theta, r["difficulty"]) for r in responses)
    if total_info <= 0:
        return 999.0
    return 1.0 / math.sqrt(total_info)


# ══════════════════════════════════════════════════════════
# ADAPTIVE QUIZ ENGINE
# ══════════════════════════════════════════════════════════


@dataclass
class QuizSession:
    """Active adaptive quiz session state."""
    session_id: str
    document_id: str
    ability_theta: float = 0.0       # Current ability estimate
    ability_se: float = 999.0        # Standard error of ability
    responses: List[Dict] = field(default_factory=list)
    asked_question_ids: set = field(default_factory=set)
    current_question: Optional[Dict] = None
    is_complete: bool = False
    max_questions: int = 15
    se_threshold: float = 0.4        # Stop when SE < this


class AdaptiveQuizEngine:
    """
    Adaptive quiz engine using IRT for realtime difficulty adjustment.

    Flow:
    1. Initialize session with prior ability (from DKT or default)
    2. Select next question that maximizes Fisher Information
    3. After each response: update θ via MLE
    4. Stop when SE(θ) < threshold or max questions reached
    5. Return final ability estimate + concept-level mastery

    Question Bank:
    - Pre-generated from QuizGenerator at multiple difficulty levels
    - Each question has calibrated difficulty (b parameter)
    - Question pool is per-document
    """

    def __init__(self, quiz_generator=None, dkt=None):
        """
        Args:
            quiz_generator: QuizGenerator instance for creating question banks
            dkt: DeepKnowledgeTracer for prior ability estimation
        """
        self.quiz_gen = quiz_generator
        self.dkt = dkt
        self.sessions: Dict[str, QuizSession] = {}
        self.question_banks: Dict[str, List[Dict]] = {}  # doc_id → questions

    def create_session(
        self,
        session_id: str,
        document_id: str,
        concepts: List[Dict],
        chunks: List[Dict],
        learner_id: Optional[str] = None,
        language: str = "en",
        max_questions: int = 15,
    ) -> Dict:
        """
        Start a new adaptive quiz session.

        Args:
            session_id: Unique session identifier
            document_id: Document being quizzed on
            concepts: Extracted concepts from document
            chunks: Document chunks for context
            learner_id: For DKT-based prior ability
            language: 'en' or 'vi'
            max_questions: Maximum questions in session

        Returns:
            Session info + first question
        """
        # Step 1: Estimate prior ability from DKT (if available)
        prior_theta = 0.0
        if self.dkt and learner_id:
            concept_names = [c.get("concept", "") for c in concepts[:10]]
            try:
                recommended = self.dkt.get_recommended_difficulty(learner_id, concept_names)
                # Convert 0-1 difficulty to IRT θ scale (-3 to +3)
                prior_theta = (recommended - 0.5) * 4.0
                logger.info(f"[AdaptiveQuiz] DKT prior θ={prior_theta:.2f} for {learner_id}")
            except Exception:
                pass

        # Step 2: Build or reuse question bank
        bank = self._get_or_build_bank(document_id, concepts, chunks, language)
        if not bank:
            return {"error": "Could not generate question bank"}

        # Step 3: Create session
        session = QuizSession(
            session_id=session_id,
            document_id=document_id,
            ability_theta=prior_theta,
            max_questions=max_questions,
        )
        self.sessions[session_id] = session

        # Step 4: Select first question
        first_question = self._select_next_question(session, bank)
        if not first_question:
            return {"error": "No suitable questions available"}

        session.current_question = first_question

        return {
            "session_id": session_id,
            "question": self._format_question(first_question),
            "question_number": 1,
            "total_questions": session.max_questions,
            "current_ability": round(session.ability_theta, 2),
            "current_se": round(session.ability_se, 2),
            "is_complete": False,
        }

    def submit_answer(
        self,
        session_id: str,
        answer: str,
        response_time_ms: Optional[int] = None,
    ) -> Dict:
        """
        Submit an answer and get the next question (or final results).

        Returns:
            Next question OR final results if session complete
        """
        session = self.sessions.get(session_id)
        if not session:
            return {"error": "Session not found"}
        if session.is_complete:
            return {"error": "Session already complete"}
        if not session.current_question:
            return {"error": "No current question"}

        question = session.current_question
        is_correct = self._check_answer(question, answer)

        # Record response
        response = {
            "question_id": question.get("question_id", ""),
            "difficulty": question.get("irt_difficulty", 0.0),
            "is_correct": is_correct,
            "response_time_ms": response_time_ms,
            "concept": question.get("source_concept", ""),
        }
        session.responses.append(response)
        session.asked_question_ids.add(question.get("question_id", ""))

        # Update ability estimate via MLE
        old_theta = session.ability_theta
        session.ability_theta, session.ability_se = mle_ability(
            session.responses, prior_theta=session.ability_theta
        )

        logger.info(
            f"[AdaptiveQuiz] Q{len(session.responses)}: "
            f"{'✓' if is_correct else '✗'} | "
            f"θ: {old_theta:.2f} → {session.ability_theta:.2f} | "
            f"SE: {session.ability_se:.2f}"
        )

        # Check stopping criteria
        should_stop = (
            len(session.responses) >= session.max_questions
            or (session.ability_se < session.se_threshold and len(session.responses) >= 5)
        )

        feedback = {
            "is_correct": is_correct,
            "correct_answer": question.get("correct_answer", ""),
            "explanation": question.get("explanation", ""),
            "ability_change": round(session.ability_theta - old_theta, 3),
            "current_ability": round(session.ability_theta, 2),
            "current_se": round(session.ability_se, 2),
        }

        if should_stop:
            session.is_complete = True
            return {
                **feedback,
                "is_complete": True,
                "question_number": len(session.responses),
                "final_results": self._compute_final_results(session),
            }

        # Select next question
        bank = self.question_banks.get(session.document_id, [])
        next_q = self._select_next_question(session, bank)
        if not next_q:
            session.is_complete = True
            return {
                **feedback,
                "is_complete": True,
                "question_number": len(session.responses),
                "final_results": self._compute_final_results(session),
            }

        session.current_question = next_q

        return {
            **feedback,
            "is_complete": False,
            "question_number": len(session.responses) + 1,
            "total_questions": session.max_questions,
            "next_question": self._format_question(next_q),
        }

    def get_session_status(self, session_id: str) -> Optional[Dict]:
        """Get current session state."""
        session = self.sessions.get(session_id)
        if not session:
            return None
        return {
            "session_id": session_id,
            "questions_answered": len(session.responses),
            "max_questions": session.max_questions,
            "current_ability": round(session.ability_theta, 2),
            "current_se": round(session.ability_se, 2),
            "is_complete": session.is_complete,
            "accuracy": round(
                sum(1 for r in session.responses if r["is_correct"]) / max(len(session.responses), 1), 2
            ),
        }

    # ──── Question Selection ────

    def _select_next_question(self, session: QuizSession, bank: List[Dict]) -> Optional[Dict]:
        """
        Select the question that maximizes Fisher Information at current θ.
        This means choosing the question whose difficulty is closest to θ.
        """
        available = [
            q for q in bank
            if q.get("question_id", "") not in session.asked_question_ids
        ]
        if not available:
            return None

        # Score each question by information value
        theta = session.ability_theta
        scored = []
        for q in available:
            b = q.get("irt_difficulty", 0.0)
            info = irt_information(theta, b)
            scored.append((info, q))

        # Sort by information (highest first)
        scored.sort(key=lambda x: x[0], reverse=True)

        # Add slight randomness: pick from top 3 to avoid predictability
        top_n = min(3, len(scored))
        selected = random.choice(scored[:top_n])
        return selected[1]

    # ──── Question Bank ────

    def _get_or_build_bank(
        self, document_id: str, concepts: List[Dict], chunks: List[Dict], language: str
    ) -> List[Dict]:
        """Get existing bank or build a new one."""
        if document_id in self.question_banks:
            return self.question_banks[document_id]

        if not self.quiz_gen:
            return []

        # Generate questions at multiple difficulty levels
        bank = []
        difficulty_levels = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]

        for diff in difficulty_levels:
            questions = self.quiz_gen.generate_from_concepts(
                concepts=concepts,
                chunks=chunks,
                num_questions=5,
                difficulty=diff,
                language=language,
            )
            for q in questions:
                # Assign IRT difficulty (map 0-1 to -3 to +3 logit scale)
                q["irt_difficulty"] = (diff - 0.5) * 6.0
                q["question_id"] = hashlib.md5(
                    q["question_text"][:50].encode()
                ).hexdigest()[:12]
            bank.extend(questions)

        # Deduplicate
        seen = set()
        deduped = []
        for q in bank:
            qid = q["question_id"]
            if qid not in seen:
                seen.add(qid)
                deduped.append(q)

        self.question_banks[document_id] = deduped
        logger.info(f"[AdaptiveQuiz] Built question bank: {len(deduped)} questions for {document_id}")
        return deduped

    # ──── Answer Checking ────

    def _check_answer(self, question: Dict, answer: str) -> bool:
        """Check if answer is correct."""
        q_type = question.get("question_type", "mcq")
        correct = question.get("correct_answer", "")

        if q_type == "true_false":
            return answer.strip().lower() == correct.strip().lower()
        elif q_type == "fill_blank":
            return answer.strip().lower() == correct.strip().lower()
        elif q_type == "mcq":
            # Allow matching by text content or index
            return answer.strip().lower() == correct.strip().lower()
        return False

    # ──── Results ────

    def _compute_final_results(self, session: QuizSession) -> Dict:
        """Compute final quiz results with concept-level analysis."""
        responses = session.responses
        total = len(responses)
        correct = sum(1 for r in responses if r["is_correct"])

        # Concept-level mastery
        concept_stats = {}
        for r in responses:
            concept = r.get("concept", "unknown")
            if concept not in concept_stats:
                concept_stats[concept] = {"correct": 0, "total": 0}
            concept_stats[concept]["total"] += 1
            if r["is_correct"]:
                concept_stats[concept]["correct"] += 1

        concept_mastery = {
            concept: {
                "mastery": round(s["correct"] / s["total"], 2),
                "questions": s["total"],
            }
            for concept, s in concept_stats.items()
        }

        # Classify ability level
        theta = session.ability_theta
        if theta < -1.5:
            level = "beginner"
        elif theta < -0.5:
            level = "developing"
        elif theta < 0.5:
            level = "intermediate"
        elif theta < 1.5:
            level = "advanced"
        else:
            level = "expert"

        # Weak concepts (< 50% correct)
        weak = [c for c, s in concept_mastery.items() if s["mastery"] < 0.5]

        return {
            "total_questions": total,
            "correct": correct,
            "accuracy": round(correct / total, 2) if total > 0 else 0,
            "final_ability": round(session.ability_theta, 2),
            "ability_se": round(session.ability_se, 2),
            "level": level,
            "concept_mastery": concept_mastery,
            "weak_concepts": weak,
            "strong_concepts": [c for c, s in concept_mastery.items() if s["mastery"] >= 0.8],
        }

    def _format_question(self, question: Dict) -> Dict:
        """Format question for frontend (hide internal fields)."""
        formatted = {
            "question_id": question.get("question_id", ""),
            "question_text": question.get("question_text", ""),
            "question_type": question.get("question_type", "mcq"),
            "difficulty": question.get("difficulty", 0.5),
            "bloom_level": question.get("bloom_level", ""),
            "source_concept": question.get("source_concept", ""),
        }
        if question.get("question_type") == "mcq":
            # Shuffle distractors + correct answer
            options = question.get("distractors", [])[:3] + [question.get("correct_answer", "")]
            random.shuffle(options)
            formatted["options"] = options
        return formatted
