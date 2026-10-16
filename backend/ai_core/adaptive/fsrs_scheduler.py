"""
NEUROVAULT — FSRS Scheduler v2 (White-Box)
Priority-based flashcard scheduling layer on top of FSRSv6.

This module DOES NOT replace FSRSv6 — it wraps it with:
- Due card computation (which cards need review today?)
- Priority queue ordering (most urgent → least urgent)
- Session management (daily review sessions)
- Review statistics and streak tracking
- Retrievability-based urgency scoring
"""

import math
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Import the core FSRS algorithm
try:
    from adaptive.spaced_repetition import FSRSv6, AGAIN, HARD, GOOD, EASY, NEW, LEARNING, REVIEW, RELEARNING
except ImportError:
    # Fallback for testing
    FSRSv6 = None
    AGAIN, HARD, GOOD, EASY = 1, 2, 3, 4
    NEW, LEARNING, REVIEW, RELEARNING = 0, 1, 2, 3


@dataclass
class CardSchedule:
    """Scheduling state for a single flashcard."""
    card_id: str
    stability: float = 0.0
    difficulty: float = 5.0
    state: int = NEW           # NEW, LEARNING, REVIEW, RELEARNING
    review_count: int = 0
    last_review: Optional[str] = None  # ISO datetime
    next_review: Optional[str] = None  # ISO datetime
    interval_days: int = 0
    rating_history: List[int] = None

    def __post_init__(self):
        if self.rating_history is None:
            self.rating_history = []


class FSRSScheduler:
    """
    High-level scheduler wrapping FSRSv6 for practical flashcard review.

    Responsibilities:
    - Determine which cards are DUE for review
    - Prioritize cards by urgency (retrievability decay)
    - Process reviews and update scheduling
    - Track review session stats
    - Compute optimal daily review load

    Usage:
        scheduler = FSRSScheduler()
        due = scheduler.get_due_cards(all_cards, document_id)
        for card in due:
            # Show to user, get rating...
            result = scheduler.review_card(card['card_id'], rating=3, all_cards=all_cards)
    """

    def __init__(self, desired_retention: float = 0.9):
        self.fsrs = FSRSv6(desired_retention=desired_retention) if FSRSv6 else None
        self.desired_retention = desired_retention

    def get_due_cards(
        self,
        cards: List[Dict],
        now: Optional[datetime] = None,
        max_new: int = 10,
        max_review: int = 50,
    ) -> List[Dict]:
        """
        Get cards due for review, prioritized by urgency.

        Priority order:
        1. RELEARNING cards (failed recently, need immediate review)
        2. LEARNING cards (in initial learning phase)
        3. REVIEW cards (scheduled review is due/overdue)
        4. NEW cards (never seen before)

        Each card gets an urgency score based on:
        - How overdue it is
        - Current retrievability (lower = more urgent)
        - Difficulty (harder cards need more attention)

        Args:
            cards: List of card dicts with schedule info
            now: Current time (for testing)
            max_new: Max new cards per session
            max_review: Max review cards per session

        Returns:
            Prioritized list of due cards with urgency info
        """
        if not self.fsrs:
            return cards[:max_review]

        now = now or datetime.utcnow()
        relearning = []
        learning = []
        due_review = []
        new_cards = []

        for card in cards:
            schedule = card.get("fsrs", {})
            state = schedule.get("state", NEW)
            review_count = schedule.get("review_count", 0)

            if review_count == 0:
                # New card
                new_cards.append(self._with_urgency(card, urgency=0.1, reason="new"))
                continue

            # Check if due
            next_review_str = schedule.get("next_review")
            if next_review_str:
                try:
                    next_review = datetime.fromisoformat(next_review_str.replace("Z", "+00:00").replace("+00:00", ""))
                except (ValueError, TypeError):
                    next_review = now  # If parse fails, consider it due

                if next_review > now:
                    continue  # Not due yet

                # Calculate how overdue
                overdue_days = (now - next_review).total_seconds() / 86400.0
            else:
                overdue_days = 0.0

            # Calculate current retrievability
            stability = schedule.get("stability", 1.0)
            elapsed = schedule.get("interval_days", 1) + overdue_days
            retrievability = self.fsrs.get_retrievability(elapsed, stability)

            urgency = self._compute_urgency(
                retrievability=retrievability,
                overdue_days=overdue_days,
                difficulty=schedule.get("difficulty", 5.0),
                state=state,
            )

            entry = self._with_urgency(
                card,
                urgency=urgency,
                reason=f"R={retrievability:.2f}, overdue={overdue_days:.1f}d",
                retrievability=retrievability,
            )

            if state == RELEARNING:
                relearning.append(entry)
            elif state == LEARNING:
                learning.append(entry)
            else:
                due_review.append(entry)

        # Sort each group by urgency (highest first)
        relearning.sort(key=lambda x: x["_urgency"], reverse=True)
        learning.sort(key=lambda x: x["_urgency"], reverse=True)
        due_review.sort(key=lambda x: x["_urgency"], reverse=True)
        new_cards = new_cards[:max_new]

        # Combine in priority order
        result = relearning + learning + due_review[:max_review] + new_cards

        logger.info(
            f"[FSRSScheduler] Due cards: "
            f"{len(relearning)} relearn, {len(learning)} learn, "
            f"{len(due_review)} review, {len(new_cards)} new → {len(result)} total"
        )

        return result

    def review_card(
        self,
        card_id: str,
        rating: int,
        cards: List[Dict],
    ) -> Optional[Dict]:
        """
        Process a card review and update its schedule.

        Args:
            card_id: ID of the card being reviewed
            rating: 1=Again, 2=Hard, 3=Good, 4=Easy
            cards: Full card list (modified in-place)

        Returns:
            Updated schedule info, or None if card not found
        """
        if not self.fsrs:
            return None

        # Find the card
        card = None
        for c in cards:
            if c.get("card_id") == card_id:
                card = c
                break

        if not card:
            logger.warning(f"[FSRSScheduler] Card {card_id} not found")
            return None

        schedule = card.get("fsrs", {})
        review_count = schedule.get("review_count", 0)

        if review_count == 0:
            # First review
            result = self.fsrs.initial_review(rating)
        else:
            # Calculate elapsed days
            last_review_str = schedule.get("last_review")
            if last_review_str:
                try:
                    last_review = datetime.fromisoformat(last_review_str.replace("Z", "+00:00").replace("+00:00", ""))
                    elapsed = (datetime.utcnow() - last_review).total_seconds() / 86400.0
                except (ValueError, TypeError):
                    elapsed = schedule.get("interval_days", 1.0)
            else:
                elapsed = schedule.get("interval_days", 1.0)

            result = self.fsrs.review(
                rating=rating,
                stability=schedule.get("stability", 1.0),
                difficulty=schedule.get("difficulty", 5.0),
                elapsed_days=max(0.01, elapsed),
                review_count=review_count,
                state=schedule.get("state", REVIEW),
            )

        # Update card's schedule in-place
        card["fsrs"] = {
            "stability": result["stability"],
            "difficulty": result["difficulty"],
            "state": result["state"],
            "review_count": result["review_count"],
            "interval_days": result["interval_days"],
            "next_review": result["next_review"],
            "last_review": datetime.utcnow().isoformat(),
            "retrievability": result.get("retrievability", 1.0),
        }

        # Track rating history
        history = schedule.get("rating_history", [])
        history.append(rating)
        card["fsrs"]["rating_history"] = history[-20:]  # Keep last 20

        logger.info(
            f"[FSRSScheduler] Reviewed {card_id}: "
            f"rating={rating}, S={result['stability']:.2f}, "
            f"D={result['difficulty']:.2f}, next={result['interval_days']}d"
        )

        return card["fsrs"]

    def get_session_stats(self, cards: List[Dict]) -> Dict:
        """
        Get statistics for a review session / deck overview.

        Returns:
            Dict with counts, retention estimate, streak info
        """
        now = datetime.utcnow()
        total = len(cards)
        new = 0
        learning = 0
        due = 0
        not_due = 0
        total_retrievability = 0.0
        reviewed_cards = 0

        for card in cards:
            schedule = card.get("fsrs", {})
            state = schedule.get("state", NEW)
            review_count = schedule.get("review_count", 0)

            if review_count == 0:
                new += 1
                continue

            reviewed_cards += 1
            stability = schedule.get("stability", 1.0)
            elapsed = schedule.get("interval_days", 1)
            if self.fsrs:
                r = self.fsrs.get_retrievability(elapsed, stability)
                total_retrievability += r

            if state in (LEARNING, RELEARNING):
                learning += 1
            else:
                next_str = schedule.get("next_review")
                if next_str:
                    try:
                        next_dt = datetime.fromisoformat(next_str.replace("Z", "+00:00").replace("+00:00", ""))
                        if next_dt <= now:
                            due += 1
                        else:
                            not_due += 1
                    except (ValueError, TypeError):
                        due += 1
                else:
                    due += 1

        avg_retention = total_retrievability / max(reviewed_cards, 1)

        return {
            "total_cards": total,
            "new": new,
            "learning": learning,
            "due_today": due,
            "not_due": not_due,
            "reviewed": reviewed_cards,
            "average_retention": round(avg_retention, 3),
            "retention_target": self.desired_retention,
        }

    def get_optimal_daily_load(self, cards: List[Dict]) -> Dict:
        """
        Recommend daily review load to maintain target retention.

        Returns:
            Recommended new cards/day and review cards/day
        """
        stats = self.get_session_stats(cards)
        total = stats["total_cards"]
        new = stats["new"]
        due = stats["due_today"]

        # Heuristic: aim for ~20 min/day review session
        # ~15 seconds per card = ~80 cards per session max
        max_per_session = 80

        # New cards: introduce gradually
        recommended_new = min(
            new,
            max(3, min(15, total // 10))  # 10% of deck but min 3, max 15
        )

        # Review cards: all due cards should be reviewed
        recommended_review = min(due, max_per_session - recommended_new)

        return {
            "recommended_new": recommended_new,
            "recommended_review": recommended_review,
            "total_today": recommended_new + recommended_review,
            "estimated_minutes": round((recommended_new + recommended_review) * 0.25, 1),
            "due_backlog": max(0, due - recommended_review),
        }

    # ──── Internal ────

    def _compute_urgency(
        self,
        retrievability: float,
        overdue_days: float,
        difficulty: float,
        state: int,
    ) -> float:
        """
        Compute urgency score for prioritization.
        Higher = more urgent = should be reviewed first.
        """
        # Base: inverse of retrievability (lower recall = more urgent)
        base = 1.0 - retrievability

        # Overdue bonus (more overdue = more urgent)
        overdue_factor = min(2.0, 1.0 + overdue_days * 0.1)

        # State bonus (relearning > learning > review)
        state_bonus = {RELEARNING: 1.5, LEARNING: 1.3, REVIEW: 1.0, NEW: 0.5}
        s_factor = state_bonus.get(state, 1.0)

        # Difficulty factor (harder cards need more attention)
        d_factor = 1.0 + (difficulty / 10.0) * 0.3

        return round(base * overdue_factor * s_factor * d_factor, 4)

    def _with_urgency(self, card: Dict, urgency: float, reason: str = "", retrievability: float = 1.0) -> Dict:
        """Add urgency metadata to a card dict (non-destructive copy)."""
        result = card.copy()
        result["_urgency"] = urgency
        result["_urgency_reason"] = reason
        result["_retrievability"] = round(retrievability, 3)
        return result
