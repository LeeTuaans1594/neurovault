"""
NEUROVAULT — Smart Notification Engine (White-Box)
Generates intelligent learning reminders and alerts.

Features:
- FSRS-driven review reminders ("X flashcards due!")
- Mastery drop alerts ("Your understanding of X declined")
- Streak protection warnings ("Keep your streak alive!")
- Study pattern recommendations
- Weekly progress digest
"""

import logging
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)


class SmartNotificationEngine:
    """
    Analyzes learner state and generates contextual notifications.

    Algorithm:
    1. Check FSRS states → due flashcards count
    2. Compare current vs previous mastery → detect drops
    3. Analyze streak status → predict streak break risk
    4. Generate prioritized notification queue
    """

    # Notification priority levels
    PRIORITY_CRITICAL = 3   # Streak about to break
    PRIORITY_HIGH = 2       # Flashcards overdue, mastery dropped
    PRIORITY_NORMAL = 1     # Regular reminders
    PRIORITY_LOW = 0        # Tips, encouragements

    def __init__(
        self,
        due_threshold: int = 5,       # Min due cards to trigger reminder
        mastery_drop_threshold: float = 0.15,  # Min mastery drop to alert
        streak_warning_hour: int = 20,  # Hour (24h) to warn about streak
        max_notifications: int = 3,    # Max notifications per check
    ):
        self.due_threshold = due_threshold
        self.mastery_drop_threshold = mastery_drop_threshold
        self.streak_warning_hour = streak_warning_hour
        self.max_notifications = max_notifications

    def check_and_generate(
        self,
        learner_state: Dict,
    ) -> List[Dict]:
        """
        Main entry point: analyze learner state and generate notifications.

        Args:
            learner_state: {
                "user_id": str,
                "flashcard_states": [{next_review_at, stability, ...}],
                "concept_mastery": [{concept, p_mastery, previous_mastery, ...}],
                "streak": {current, longest, last_study_date, is_active_today},
                "recent_sessions": [{session_type, created_at, ...}],
                "stats": {total_study_time_seconds, ...},
            }

        Returns:
            List of notification dicts, sorted by priority (highest first)
        """
        notifications = []

        # 1. Flashcard due reminders
        due_notifs = self._check_due_flashcards(learner_state)
        notifications.extend(due_notifs)

        # 2. Mastery drop alerts
        mastery_notifs = self._check_mastery_drops(learner_state)
        notifications.extend(mastery_notifs)

        # 3. Streak protection
        streak_notifs = self._check_streak_risk(learner_state)
        notifications.extend(streak_notifs)

        # 4. Study pattern tips
        pattern_notifs = self._check_study_patterns(learner_state)
        notifications.extend(pattern_notifs)

        # Sort by priority (highest first), then deduplicate
        notifications.sort(key=lambda n: n["priority"], reverse=True)

        # Limit notifications to prevent spam
        return notifications[:self.max_notifications]

    def _check_due_flashcards(self, state: Dict) -> List[Dict]:
        """Check for overdue flashcard reviews."""
        cards = state.get("flashcard_states", [])
        if not cards:
            return []

        now = datetime.utcnow()
        due_count = 0
        overdue_count = 0

        for card in cards:
            next_review = card.get("next_review_at")
            if not next_review:
                continue

            if isinstance(next_review, str):
                try:
                    next_review = datetime.fromisoformat(next_review.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue

            if next_review <= now:
                due_count += 1
                # Overdue by more than 1 day
                if (now - next_review).days >= 1:
                    overdue_count += 1

        notifications = []

        if overdue_count >= 10:
            notifications.append({
                "type": "flashcard_overdue",
                "priority": self.PRIORITY_HIGH,
                "title": f"⚠️ {overdue_count} flashcards are overdue!",
                "message": (
                    f"You have {overdue_count} cards that are significantly overdue. "
                    f"Review now to prevent forgetting."
                ),
                "action": "review_flashcards",
                "icon": "🃏",
                "data": {"due_count": due_count, "overdue_count": overdue_count},
            })
        elif due_count >= self.due_threshold:
            notifications.append({
                "type": "flashcard_due",
                "priority": self.PRIORITY_NORMAL,
                "title": f"📚 {due_count} flashcards ready for review",
                "message": "Spaced repetition works best when you review on time!",
                "action": "review_flashcards",
                "icon": "🃏",
                "data": {"due_count": due_count},
            })

        return notifications

    def _check_mastery_drops(self, state: Dict) -> List[Dict]:
        """Detect concepts where mastery has significantly decreased."""
        concepts = state.get("concept_mastery", [])
        if not concepts:
            return []

        dropped_concepts = []
        for concept in concepts:
            current = concept.get("p_mastery", 0)
            previous = concept.get("previous_mastery", current)

            if previous - current >= self.mastery_drop_threshold:
                dropped_concepts.append({
                    "concept": concept.get("concept", "Unknown"),
                    "current": round(current * 100),
                    "previous": round(previous * 100),
                    "drop": round((previous - current) * 100),
                })

        if not dropped_concepts:
            return []

        # Sort by drop magnitude
        dropped_concepts.sort(key=lambda d: d["drop"], reverse=True)
        top_drops = dropped_concepts[:3]

        concept_names = ", ".join(d["concept"] for d in top_drops)
        drop_pct = top_drops[0]["drop"]

        return [{
            "type": "mastery_drop",
            "priority": self.PRIORITY_HIGH,
            "title": f"📉 Mastery dropped for: {concept_names}",
            "message": (
                f"Your understanding of {top_drops[0]['concept']} decreased by {drop_pct}%. "
                f"Review these concepts to maintain your knowledge."
            ),
            "action": "review_concepts",
            "icon": "📉",
            "data": {"dropped_concepts": top_drops},
        }]

    def _check_streak_risk(self, state: Dict) -> List[Dict]:
        """Check if streak is at risk of breaking."""
        streak = state.get("streak", {})
        current_streak = streak.get("current", 0)
        is_active_today = streak.get("is_active_today", False)
        last_study_date = streak.get("last_study_date")

        if current_streak <= 0 or is_active_today:
            return []

        now = datetime.utcnow()

        # Only warn in evening hours
        if now.hour >= self.streak_warning_hour:
            return [{
                "type": "streak_warning",
                "priority": self.PRIORITY_CRITICAL,
                "title": f"🔥 {current_streak}-day streak at risk!",
                "message": (
                    f"You haven't studied today! Do a quick review to keep "
                    f"your {current_streak}-day streak alive."
                ),
                "action": "quick_review",
                "icon": "🔥",
                "data": {"current_streak": current_streak},
            }]

        return []

    def _check_study_patterns(self, state: Dict) -> List[Dict]:
        """Analyze study patterns and suggest improvements."""
        sessions = state.get("recent_sessions", [])
        if len(sessions) < 3:
            return []

        # Check if user hasn't studied in 3+ days
        stats = state.get("stats", {})
        streak = state.get("streak", {})
        last_study = streak.get("last_study_date")

        if last_study:
            try:
                last_date = datetime.strptime(last_study, "%Y-%m-%d")
                days_since = (datetime.utcnow() - last_date).days
                if days_since >= 3:
                    return [{
                        "type": "inactivity",
                        "priority": self.PRIORITY_NORMAL,
                        "title": f"💪 We miss you! {days_since} days since last session",
                        "message": (
                            "Even a short 5-minute review helps maintain your knowledge. "
                            "Start small and build back your routine!"
                        ),
                        "action": "quick_review",
                        "icon": "💪",
                        "data": {"days_inactive": days_since},
                    }]
            except (ValueError, TypeError):
                pass

        return []

    def generate_weekly_digest(self, learner_state: Dict) -> Dict:
        """
        Generate a weekly progress summary.

        Returns:
            {
                "type": "weekly_digest",
                "study_time_minutes": int,
                "concepts_mastered": int,
                "quizzes_taken": int,
                "flashcards_reviewed": int,
                "streak_days": int,
                "highlights": [str],
                "recommendations": [str],
            }
        """
        stats = learner_state.get("stats", {})
        streak = learner_state.get("streak", {})
        concepts = learner_state.get("concept_mastery", [])

        study_minutes = round(stats.get("total_study_time_seconds", 0) / 60)
        mastered = sum(1 for c in concepts if c.get("p_mastery", 0) >= 0.8)

        highlights = []
        recommendations = []

        if streak.get("current", 0) >= 7:
            highlights.append(f"🔥 Amazing {streak['current']}-day streak!")
        if mastered > 0:
            highlights.append(f"🏆 {mastered} concepts mastered")
        if study_minutes >= 60:
            highlights.append(f"⏱️ {study_minutes} minutes of focused study")

        # Recommendations
        due_count = sum(
            1 for c in learner_state.get("flashcard_states", [])
            if c.get("next_review_at")
        )
        if due_count > 0:
            recommendations.append(f"Review {due_count} due flashcards")

        weak = [
            c.get("concept") for c in concepts
            if 0 < c.get("p_mastery", 0) < 0.4
        ][:3]
        if weak:
            recommendations.append(f"Strengthen: {', '.join(weak)}")

        if study_minutes < 30:
            recommendations.append("Try to study at least 30 minutes this week")

        return {
            "type": "weekly_digest",
            "study_time_minutes": study_minutes,
            "concepts_mastered": mastered,
            "quizzes_taken": stats.get("total_quizzes_taken", 0),
            "flashcards_reviewed": stats.get("total_flashcards_reviewed", 0),
            "streak_days": streak.get("current", 0),
            "highlights": highlights,
            "recommendations": recommendations,
        }
