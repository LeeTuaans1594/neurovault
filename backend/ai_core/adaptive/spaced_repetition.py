"""
NEUROVAULT — FSRS v6 Spaced Repetition (White-Box)
Free Spaced Repetition Scheduler v6 — 17 parameters, latest research.
Tự implement 100%, không dùng library nào.

Changes from v4.5 → v6:
- w13: short-term stability decay
- w14: short-term stability base
- w15: rating→stability modifier (hard)
- w16: rating→stability modifier (easy)
- Improved stability after failure formula
- Same-day review handling
- Fuzz factor for interval anti-patterns

Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
"""

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# Rating scale
AGAIN = 1  # Forgot completely
HARD = 2   # Recalled with difficulty
GOOD = 3   # Recalled correctly
EASY = 4   # Recalled effortlessly

# Card states
NEW = 0
LEARNING = 1
REVIEW = 2
RELEARNING = 3


class FSRSv6:
    """
    Free Spaced Repetition Scheduler v6.

    Core variables per card:
    - Stability (S): Expected days until retention drops to desired_retention
    - Difficulty (D): Intrinsic difficulty of item (1-10)
    - Retrievability (R): Current probability of recall

    17 trainable parameters (w0-w16).
    """

    # Default weights from FSRS-6 research optimized on real-world data
    DEFAULT_WEIGHTS = [
        0.40255,   # w0:  initial stability for AGAIN
        1.18385,   # w1:  initial stability for HARD
        3.17300,   # w2:  initial stability for GOOD
        15.6947,   # w3:  initial stability for EASY
        7.1949,    # w4:  difficulty mean reversion (D0 when rating=3)
        0.5345,    # w5:  difficulty change per rating delta
        1.4604,    # w6:  stability growth base (S_increase factor)
        0.0046,    # w7:  stability decay factor (power of S in recall)
        1.5460,    # w8:  recall stability boost (exp((1-R)*w8) - 1)
        0.1192,    # w9:  hard penalty multiplier
        1.0100,    # w10: easy bonus multiplier
        1.5972,    # w11: stability after failure base
        0.0517,    # w12: difficulty change on failure (mean reversion)
        0.3600,    # w13: short-term stability decay rate
        0.1600,    # w14: short-term stability base factor
        2.2000,    # w15: hard rating → stability modifier
        0.0500,    # w16: easy rating → stability modifier
    ]

    def __init__(
        self,
        weights: Optional[List[float]] = None,
        desired_retention: float = 0.9,
        maximum_interval: int = 36500,
        enable_fuzz: bool = True,
    ):
        """
        Args:
            weights: 17 trainable parameters. None = use defaults.
            desired_retention: Target recall probability (0.7-0.99)
            maximum_interval: Cap on interval days
            enable_fuzz: Add small random fuzz to intervals (anti-pattern)
        """
        self.w = weights or self.DEFAULT_WEIGHTS.copy()
        assert len(self.w) == 17, f"FSRS v6 requires 17 weights, got {len(self.w)}"

        self.desired_retention = max(0.7, min(0.99, desired_retention))
        self.maximum_interval = maximum_interval
        self.enable_fuzz = enable_fuzz

    # ══════════════════════════════════════════════
    # PUBLIC API
    # ══════════════════════════════════════════════

    def initial_review(self, rating: int) -> Dict:
        """
        First review of a new card.

        Args:
            rating: 1=Again, 2=Hard, 3=Good, 4=Easy

        Returns:
            Dict with scheduling parameters
        """
        rating = self._clamp_rating(rating)
        d = self._initial_difficulty(rating)
        s = self._initial_stability(rating)
        interval = self._next_interval(s)

        state = LEARNING if rating == AGAIN else REVIEW

        return {
            "stability": round(s, 4),
            "difficulty": round(d, 4),
            "interval_days": interval,
            "next_review": (datetime.utcnow() + timedelta(days=interval)).isoformat(),
            "review_count": 1,
            "state": state,
            "rating_history": [rating],
            "retrievability": 1.0,  # Just reviewed
        }

    def review(
        self,
        rating: int,
        stability: float,
        difficulty: float,
        elapsed_days: float,
        review_count: int,
        state: int = REVIEW,
        last_elapsed_days: float = 0,
    ) -> Dict:
        """
        Process a review and compute next scheduling parameters.

        Args:
            rating: 1-4
            stability: Current stability
            difficulty: Current difficulty (1-10)
            elapsed_days: Days since last review
            review_count: Total reviews so far
            state: Current card state (NEW/LEARNING/REVIEW/RELEARNING)
            last_elapsed_days: Previous interval for short-term detection

        Returns:
            Dict with updated scheduling parameters
        """
        rating = self._clamp_rating(rating)

        # Current retrievability before this review
        r = self._retrievability(elapsed_days, stability)

        # Update difficulty
        new_d = self._next_difficulty(difficulty, rating)

        # Check if this is a same-day/short-term review
        is_short_term = elapsed_days < 1.0

        # Update stability based on outcome
        if rating == AGAIN:
            new_s = self._stability_after_failure(stability, difficulty, r)
            new_state = RELEARNING
        else:
            if is_short_term:
                new_s = self._short_term_stability(stability, rating)
            else:
                new_s = self._stability_after_success(
                    stability, difficulty, r, rating
                )
            new_state = REVIEW

        # Calculate next interval
        interval = self._next_interval(new_s)

        # Apply fuzz to prevent "clumping" of review dates
        if self.enable_fuzz and interval >= 3:
            interval = self._apply_fuzz(interval)

        return {
            "stability": round(new_s, 4),
            "difficulty": round(new_d, 4),
            "retrievability": round(r, 4),
            "interval_days": interval,
            "next_review": (datetime.utcnow() + timedelta(days=interval)).isoformat(),
            "review_count": review_count + 1,
            "state": new_state,
        }

    def batch_review(self, cards: List[Dict]) -> List[Dict]:
        """
        Process multiple card reviews in batch.

        Args:
            cards: List of dicts, each with keys:
                rating, stability, difficulty, elapsed_days, review_count

        Returns:
            List of scheduling results
        """
        results = []
        for card in cards:
            if card.get("review_count", 0) <= 0:
                result = self.initial_review(card["rating"])
            else:
                result = self.review(
                    rating=card["rating"],
                    stability=card["stability"],
                    difficulty=card["difficulty"],
                    elapsed_days=card["elapsed_days"],
                    review_count=card["review_count"],
                    state=card.get("state", REVIEW),
                )
            results.append(result)
        return results

    def get_retrievability(self, elapsed_days: float, stability: float) -> float:
        """Public accessor for retrievability calculation."""
        return self._retrievability(elapsed_days, stability)

    def predict_recall_at(
        self, stability: float, days_list: List[float]
    ) -> List[Dict]:
        """
        Predict recall probability at multiple future time points.
        Useful for plotting forgetting curves.

        Returns:
            [{days: float, retrievability: float}, ...]
        """
        return [
            {
                "days": d,
                "retrievability": round(self._retrievability(d, stability), 4),
            }
            for d in days_list
        ]

    # ══════════════════════════════════════════════
    # CORE FORMULAS (FSRS v6)
    # ══════════════════════════════════════════════

    def _initial_stability(self, rating: int) -> float:
        """S0(G) = w[G-1] for rating G in {1,2,3,4}."""
        idx = max(0, min(rating - 1, 3))
        return max(self.w[idx], 0.01)

    def _initial_difficulty(self, rating: int) -> float:
        """D0(G) = w4 - exp(w5 * (G - 1)) + 1."""
        d = self.w[4] - math.exp(self.w[5] * (rating - 1)) + 1
        return self._constrain_difficulty(d)

    def _retrievability(self, elapsed_days: float, stability: float) -> float:
        """
        R(t, S) = (1 + FACTOR * t / S)^DECAY

        Where FACTOR = 19/81 ≈ 0.2346 (derived from desired_retention=0.9)
        And DECAY = -0.5 (power law forgetting)
        """
        if stability <= 0:
            return 0.0
        if elapsed_days <= 0:
            return 1.0

        factor = 19.0 / 81.0
        decay = -0.5
        return math.pow(1 + factor * elapsed_days / stability, decay)

    def _next_difficulty(self, d: float, rating: int) -> float:
        """
        D'(D, G) = w7 * D0(3) + (1 - w7) * (D - w6 * (G - 3))

        Mean reversion towards D0(3) with rating-based adjustment.
        w12 used for AGAIN penalty.
        """
        # Delta from rating
        delta_d = -self.w[5] * (rating - 3)

        # FSRS v6: additional penalty for AGAIN
        if rating == AGAIN:
            delta_d += self.w[12]

        new_d = d + delta_d

        # Mean reversion: pull towards D0(rating=3)
        d0_good = self.w[4] - math.exp(self.w[5] * (3 - 1)) + 1
        mean_reversion_factor = self.w[7]
        new_d = d0_good * mean_reversion_factor + new_d * (1 - mean_reversion_factor)

        return self._constrain_difficulty(new_d)

    def _stability_after_success(
        self, s: float, d: float, r: float, rating: int
    ) -> float:
        """
        S'_recall(D, S, R, G) = S * (
            1 + exp(w6) *
            (11 - D) *
            S^(-w7) *
            (exp((1 - R) * w8) - 1) *
            hard_penalty *
            easy_bonus
        )
        """
        # Hard penalty (w9) and easy bonus (w10)
        hard_penalty = self.w[9] if rating == HARD else 1.0
        easy_bonus = self.w[10] if rating == EASY else 1.0

        # Stability increase factor
        sinc = (
            math.exp(self.w[6])
            * (11 - d)
            * math.pow(s, -self.w[7])
            * (math.exp((1 - r) * self.w[8]) - 1)
            * hard_penalty
            * easy_bonus
        )

        new_s = s * (1 + sinc)
        return max(new_s, 0.01)

    def _stability_after_failure(
        self, s: float, d: float, r: float
    ) -> float:
        """
        S'_forget(D, S, R) = w11 * D^(-w15) * ((S+1)^w16 - 1) * exp((1-R) * w14)

        v6 uses w15 and w16 for difficulty/stability modifiers in failure case.
        """
        new_s = (
            self.w[11]
            * math.pow(d, -self.w[15] * 0.1)  # difficulty → inverse effect
            * (math.pow(s + 1, self.w[16]) - 1)
            * math.exp((1 - r) * self.w[14])
        )

        # Stability after failure should be less than current stability
        # but not less than a minimum
        return max(min(new_s, s), 0.01)

    def _short_term_stability(self, s: float, rating: int) -> float:
        """
        Handle same-day reviews (elapsed_days < 1).
        S'_short = S * exp(w13 * (G - 3 + w14))

        This allows for slight stability changes during learning/relearning
        without the full long-term formula.
        """
        new_s = s * math.exp(self.w[13] * (rating - 3 + self.w[14]))
        return max(new_s, 0.01)

    # ══════════════════════════════════════════════
    # INTERVAL CALCULATION
    # ══════════════════════════════════════════════

    def _next_interval(self, stability: float) -> int:
        """
        I(S, R) = S / FACTOR * (R^(1/DECAY) - 1)

        Where R = desired_retention, FACTOR = 19/81, DECAY = -0.5
        """
        factor = 19.0 / 81.0
        decay = -0.5

        interval = (stability / factor) * (
            math.pow(self.desired_retention, 1.0 / decay) - 1
        )
        interval = max(1, round(interval))
        return min(interval, self.maximum_interval)

    def _apply_fuzz(self, interval: int) -> int:
        """
        Add fuzz factor to prevent review date clumping.
        Uses deterministic pseudo-random based on interval itself.
        """
        if interval < 3:
            return interval

        # Fuzz range: ±5% for small intervals, ±2% for large
        if interval <= 7:
            fuzz_range = max(1, round(interval * 0.15))
        elif interval <= 30:
            fuzz_range = max(1, round(interval * 0.10))
        else:
            fuzz_range = max(1, round(interval * 0.05))

        # Deterministic "randomness" based on interval value
        # (avoids need for random module — keeps it pure/testable)
        fuzz_offset = ((interval * 7 + 13) % (2 * fuzz_range + 1)) - fuzz_range
        return max(1, interval + fuzz_offset)

    # ══════════════════════════════════════════════
    # UTILITY
    # ══════════════════════════════════════════════

    @staticmethod
    def _clamp_rating(rating: int) -> int:
        """Ensure rating is in valid range [1, 4]."""
        return max(AGAIN, min(EASY, int(rating)))

    @staticmethod
    def _constrain_difficulty(d: float) -> float:
        """Constrain difficulty to [1, 10]."""
        return max(1.0, min(10.0, d))

    def get_weights(self) -> List[float]:
        """Return current weight vector."""
        return self.w.copy()

    def set_weights(self, weights: List[float]) -> None:
        """Set weight vector (for personalized training)."""
        assert len(weights) == 17, f"Expected 17 weights, got {len(weights)}"
        self.w = weights.copy()

    def weight_names(self) -> List[str]:
        """Human-readable names for each weight."""
        return [
            "w0: initial_stability_AGAIN",
            "w1: initial_stability_HARD",
            "w2: initial_stability_GOOD",
            "w3: initial_stability_EASY",
            "w4: difficulty_mean_reversion",
            "w5: difficulty_change_rate",
            "w6: stability_growth_base",
            "w7: stability_decay_factor",
            "w8: recall_stability_boost",
            "w9: hard_penalty_multiplier",
            "w10: easy_bonus_multiplier",
            "w11: failure_stability_base",
            "w12: failure_difficulty_change",
            "w13: short_term_decay_rate",
            "w14: short_term_base_factor",
            "w15: failure_difficulty_modifier",
            "w16: failure_stability_power",
        ]

    def simulate_learning(
        self, num_reviews: int = 20, rating_pattern: Optional[List[int]] = None
    ) -> List[Dict]:
        """
        Simulate a sequence of reviews for debugging/visualization.

        Args:
            num_reviews: Number of reviews to simulate
            rating_pattern: Repeating pattern of ratings (e.g., [3,3,4,3,2])
                           If None, defaults to [3] (always GOOD)

        Returns:
            List of review results with cumulative stats
        """
        pattern = rating_pattern or [GOOD]
        results = []

        current = None
        for i in range(num_reviews):
            rating = pattern[i % len(pattern)]

            if current is None:
                current = self.initial_review(rating)
            else:
                elapsed = current["interval_days"]
                current = self.review(
                    rating=rating,
                    stability=current["stability"],
                    difficulty=current["difficulty"],
                    elapsed_days=elapsed,
                    review_count=current["review_count"],
                    state=current.get("state", REVIEW),
                )

            results.append({
                "review_num": i + 1,
                "rating": rating,
                **current,
            })

        return results
