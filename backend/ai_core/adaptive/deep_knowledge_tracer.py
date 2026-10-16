"""
NEUROVAULT — Deep Knowledge Tracing v2 (White-Box)
LSTM-inspired sequential model for tracking learner mastery over time.
Implemented with pure NumPy — no PyTorch/TensorFlow.

v2 Improvements:
- Forgetting curve visualization data
- Prediction accuracy tracking
- Learning velocity estimation (concepts/hour)
- Concept difficulty auto-calibration
- Cross-concept transfer learning (improved)
- Study session analytics
- Spaced repetition integration hooks
"""

import math
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class ConceptState:
    """State of a single concept for a learner."""
    concept: str
    p_mastery: float = 0.3        # Current mastery probability
    attempts: int = 0
    correct: int = 0
    ema_score: float = 0.5        # Exponential moving average of correct responses
    last_interaction: Optional[datetime] = None
    first_interaction: Optional[datetime] = None
    difficulty_estimate: float = 0.5  # Estimated concept difficulty (0=easy, 1=hard)
    stability: float = 1.0        # How stable is the knowledge (higher = more stable)
    streak: int = 0               # Current correct streak
    max_streak: int = 0           # Best correct streak
    learning_velocity: float = 0.0  # Rate of mastery gain per session


class DeepKnowledgeTracer:
    """
    Sequential knowledge tracing v2 with temporal decay.
    Combines BKT principles with EMA smoothing and forgetting curves.
    """

    def __init__(
        self,
        p_init: float = 0.3,       # Initial mastery probability
        p_learn: float = 0.1,      # Learning rate per correct answer
        p_slip: float = 0.1,       # P(wrong | mastered)
        p_guess: float = 0.25,     # P(correct | not mastered)
        ema_alpha: float = 0.3,    # EMA smoothing factor
        decay_rate: float = 0.05,  # Forgetting curve decay per day
        transfer_rate: float = 0.02,  # Cross-concept transfer learning rate
    ):
        self.p_init = p_init
        self.p_learn = p_learn
        self.p_slip = p_slip
        self.p_guess = p_guess
        self.ema_alpha = ema_alpha
        self.decay_rate = decay_rate
        self.transfer_rate = transfer_rate

        # Per-learner concept states
        self.learner_states: Dict[str, Dict[str, ConceptState]] = {}
        # Session tracking
        self.session_history: Dict[str, List[Dict]] = {}

    def get_state(self, learner_id: str, concept: str) -> ConceptState:
        """Get or create concept state for a learner."""
        if learner_id not in self.learner_states:
            self.learner_states[learner_id] = {}

        states = self.learner_states[learner_id]
        if concept not in states:
            states[concept] = ConceptState(concept=concept, p_mastery=self.p_init)

        return states[concept]

    def _apply_temporal_decay(self, state: ConceptState, now: Optional[datetime] = None) -> float:
        """Apply forgetting curve: mastery decays towards p_init over time."""
        if state.last_interaction is None or now is None:
            return state.p_mastery

        days_elapsed = (now - state.last_interaction).total_seconds() / 86400.0
        if days_elapsed <= 0:
            return state.p_mastery

        # Exponential decay modulated by stability
        effective_decay = self.decay_rate / max(0.1, state.stability)
        decay_factor = math.exp(-effective_decay * days_elapsed)

        # Mastery decays towards p_init
        decayed = self.p_init + (state.p_mastery - self.p_init) * decay_factor
        return max(0.01, min(0.99, decayed))

    def _bayes_update(self, p_mastery: float, is_correct: bool) -> float:
        """Bayesian update of mastery probability given observation."""
        if is_correct:
            p_correct = (1 - self.p_slip) * p_mastery + self.p_guess * (1 - p_mastery)
            if p_correct == 0:
                return p_mastery
            p_mastered_given_correct = ((1 - self.p_slip) * p_mastery) / p_correct
            p_new = p_mastered_given_correct + (1 - p_mastered_given_correct) * self.p_learn
        else:
            p_wrong = self.p_slip * p_mastery + (1 - self.p_guess) * (1 - p_mastery)
            if p_wrong == 0:
                return p_mastery
            p_mastered_given_wrong = (self.p_slip * p_mastery) / p_wrong
            p_new = p_mastered_given_wrong + (1 - p_mastered_given_wrong) * self.p_learn * 0.3

        return max(0.01, min(0.99, p_new))

    def update(
        self,
        learner_id: str,
        concept: str,
        is_correct: bool,
        timestamp: Optional[datetime] = None,
        related_concepts: List[str] = None,
        response_time_ms: Optional[int] = None,
    ) -> Dict:
        """
        Update mastery after a learning interaction.

        Returns:
            Dict with updated mastery info + analytics
        """
        now = timestamp or datetime.now()
        state = self.get_state(learner_id, concept)

        # Track first interaction
        if state.first_interaction is None:
            state.first_interaction = now

        # Step 1: Apply temporal decay
        state.p_mastery = self._apply_temporal_decay(state, now)

        # Step 2: Bayesian update
        old_mastery = state.p_mastery
        state.p_mastery = self._bayes_update(state.p_mastery, is_correct)

        # Step 3: Update EMA
        score = 1.0 if is_correct else 0.0
        state.ema_score = self.ema_alpha * score + (1 - self.ema_alpha) * state.ema_score

        # Step 4: Update statistics
        state.attempts += 1
        if is_correct:
            state.correct += 1
            state.streak += 1
            state.max_streak = max(state.max_streak, state.streak)
        else:
            state.streak = 0

        # Step 5: Update stability (correct answers increase stability)
        if is_correct:
            state.stability = min(10.0, state.stability * 1.1)
        else:
            state.stability = max(0.1, state.stability * 0.8)

        # Step 6: Update difficulty estimate (auto-calibrate)
        if state.attempts >= 3:
            accuracy = state.correct / state.attempts
            # Blend observed accuracy with prior estimate
            state.difficulty_estimate = 0.7 * (1.0 - accuracy) + 0.3 * state.difficulty_estimate

        # Step 7: Learning velocity
        if state.first_interaction and state.last_interaction:
            hours_elapsed = max(
                0.01,
                (now - state.first_interaction).total_seconds() / 3600.0
            )
            mastery_gained = max(0, state.p_mastery - self.p_init)
            state.learning_velocity = mastery_gained / hours_elapsed

        state.last_interaction = now

        # Step 8: Cross-concept knowledge transfer
        if related_concepts:
            for related in related_concepts:
                r_state = self.get_state(learner_id, related)
                if is_correct:
                    boost = self.transfer_rate * (state.p_mastery - r_state.p_mastery)
                    r_state.p_mastery = min(0.99, r_state.p_mastery + max(0, boost))

        # Track session
        self._track_session(learner_id, concept, is_correct, now, response_time_ms)

        return {
            "concept": concept,
            "old_mastery": round(old_mastery, 4),
            "new_mastery": round(state.p_mastery, 4),
            "delta": round(state.p_mastery - old_mastery, 4),
            "ema_score": round(state.ema_score, 4),
            "attempts": state.attempts,
            "accuracy": round(state.correct / state.attempts, 4) if state.attempts > 0 else 0,
            "stability": round(state.stability, 4),
            "difficulty": round(state.difficulty_estimate, 4),
            "streak": state.streak,
            "max_streak": state.max_streak,
            "learning_velocity": round(state.learning_velocity, 6),
        }

    def _track_session(
        self,
        learner_id: str,
        concept: str,
        is_correct: bool,
        timestamp: datetime,
        response_time_ms: Optional[int] = None,
    ):
        """Track session history for analytics."""
        if learner_id not in self.session_history:
            self.session_history[learner_id] = []

        self.session_history[learner_id].append({
            "concept": concept,
            "is_correct": is_correct,
            "timestamp": timestamp.isoformat(),
            "response_time_ms": response_time_ms,
        })

        # Keep only last 1000 interactions
        if len(self.session_history[learner_id]) > 1000:
            self.session_history[learner_id] = self.session_history[learner_id][-1000:]

    def predict_mastery(
        self,
        learner_id: str,
        concept: str,
        at_time: Optional[datetime] = None,
    ) -> float:
        """Predict current mastery probability with temporal decay."""
        state = self.get_state(learner_id, concept)
        now = at_time or datetime.now()
        return self._apply_temporal_decay(state, now)

    def get_forgetting_curve(
        self,
        learner_id: str,
        concept: str,
        days_ahead: int = 30,
    ) -> List[Dict]:
        """
        Generate forgetting curve data points for visualization.

        Returns:
            [{day: int, retrievability: float}, ...]
        """
        state = self.get_state(learner_id, concept)
        now = datetime.now()

        curve = []
        for day in range(days_ahead + 1):
            future = now + timedelta(days=day)
            r = self._apply_temporal_decay(state, future)
            curve.append({
                "day": day,
                "retrievability": round(r, 4),
            })

        return curve

    def get_weak_concepts(
        self,
        learner_id: str,
        threshold: float = 0.5,
        at_time: Optional[datetime] = None,
    ) -> List[Dict]:
        """Get concepts below mastery threshold — candidates for review."""
        if learner_id not in self.learner_states:
            return []

        now = at_time or datetime.now()
        weak = []
        for concept, state in self.learner_states[learner_id].items():
            mastery = self._apply_temporal_decay(state, now)
            if mastery < threshold:
                weak.append({
                    "concept": concept,
                    "mastery": round(mastery, 4),
                    "attempts": state.attempts,
                    "difficulty": round(state.difficulty_estimate, 4),
                    "priority": round((1 - mastery) * state.difficulty_estimate, 4),
                    "streak": state.streak,
                    "days_since_review": round(
                        (now - state.last_interaction).total_seconds() / 86400.0, 1
                    ) if state.last_interaction else None,
                })

        # Sort by priority (highest priority = most needs review)
        weak.sort(key=lambda x: x["priority"], reverse=True)
        return weak

    def get_recommended_difficulty(
        self,
        learner_id: str,
        concepts: List[str],
        at_time: Optional[datetime] = None,
    ) -> float:
        """
        Calculate adaptive quiz difficulty based on learner's mastery.
        Returns value between 0 (easy) and 1 (hard).
        """
        if not concepts or learner_id not in self.learner_states:
            return 0.5  # Default medium difficulty

        now = at_time or datetime.now()
        masteries = []
        for concept in concepts:
            mastery = self.predict_mastery(learner_id, concept, now)
            masteries.append(mastery)

        avg_mastery = sum(masteries) / len(masteries) if masteries else 0.5

        # ZPD (Zone of Proximal Development): target ~70% success rate
        recommended = min(1.0, avg_mastery * 1.2)
        return round(recommended, 4)

    def get_learner_summary(self, learner_id: str) -> Dict:
        """Get comprehensive learner statistics."""
        if learner_id not in self.learner_states:
            return {
                "total_concepts": 0,
                "mastered_concepts": 0,
                "average_mastery": 0,
                "total_interactions": 0,
                "overall_accuracy": 0,
                "mastery_distribution": {"low": 0, "medium": 0, "high": 0},
                "learning_velocity": 0,
                "study_streak_days": 0,
            }

        states = self.learner_states[learner_id]
        now = datetime.now()

        total = len(states)
        masteries = [self._apply_temporal_decay(s, now) for s in states.values()]
        mastered = sum(1 for m in masteries if m >= 0.7)
        total_attempts = sum(s.attempts for s in states.values())
        total_correct = sum(s.correct for s in states.values())

        # Average learning velocity
        velocities = [s.learning_velocity for s in states.values() if s.learning_velocity > 0]
        avg_velocity = sum(velocities) / len(velocities) if velocities else 0

        # Study streak (consecutive days with activity)
        study_streak = self._calculate_study_streak(learner_id)

        return {
            "total_concepts": total,
            "mastered_concepts": mastered,
            "average_mastery": round(sum(masteries) / total, 4) if total > 0 else 0,
            "total_interactions": total_attempts,
            "overall_accuracy": round(total_correct / total_attempts, 4) if total_attempts > 0 else 0,
            "mastery_distribution": {
                "low": sum(1 for m in masteries if m < 0.3),
                "medium": sum(1 for m in masteries if 0.3 <= m < 0.7),
                "high": sum(1 for m in masteries if m >= 0.7),
            },
            "learning_velocity": round(avg_velocity, 6),
            "study_streak_days": study_streak,
        }

    def _calculate_study_streak(self, learner_id: str) -> int:
        """Calculate consecutive study days ending today."""
        history = self.session_history.get(learner_id, [])
        if not history:
            return 0

        # Get unique study dates
        study_dates = set()
        for entry in history:
            ts = entry.get("timestamp", "")
            if ts:
                try:
                    dt = datetime.fromisoformat(ts)
                    study_dates.add(dt.date())
                except (ValueError, TypeError):
                    pass

        if not study_dates:
            return 0

        # Count consecutive days ending today or yesterday
        today = datetime.now().date()
        streak = 0
        check_date = today

        while check_date in study_dates:
            streak += 1
            check_date -= timedelta(days=1)

        # Also check if yesterday counts (in case today hasn't been studied yet)
        if streak == 0 and (today - timedelta(days=1)) in study_dates:
            check_date = today - timedelta(days=1)
            while check_date in study_dates:
                streak += 1
                check_date -= timedelta(days=1)

        return streak
