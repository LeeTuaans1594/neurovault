"""
NEUROVAULT — Conversation Topic Tracker (White-Box)
Track topics discussed in multi-turn conversations for contextual retrieval.

Features:
- Topic extraction from queries and responses
- Topic stack with temporal ordering
- Topic transition detection (new, return, continuation)
- Related topic suggestion based on co-occurrence
- Context-aware retrieval boost for active topics
- Bilingual support (EN/VI)
"""

import re
import logging
from typing import List, Dict, Optional, Set
from collections import Counter, defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TopicEntry:
    """A tracked topic in the conversation."""
    topic: str
    concepts: List[str]           # Related concepts discussed
    start_turn: int               # Turn number when first discussed
    last_turn: int                # Most recent turn mentioning this
    mention_count: int = 1        # How many turns mentioned this topic
    is_active: bool = True        # Currently being discussed


class TopicTracker:
    """
    Track conversation topics and transitions for context-aware RAG.

    Maintains:
    - topic_stack: Active topics ordered by recency
    - topic_history: Full history of all topics discussed
    - co_occurrence: Which topics appear together (for suggestions)

    Usage in RAG pipeline:
    1. After each Q&A turn, call update(query, response)
    2. Before retrieval, call get_context_boost() for retrieval weighting
    3. When generating follow-ups, call get_related_topics()
    """

    def __init__(self, max_topics: int = 20):
        self.max_topics = max_topics
        self.topic_stack: List[TopicEntry] = []
        self.turn_count: int = 0
        self.co_occurrence: Dict[str, Counter] = defaultdict(Counter)
        # Stopwords for topic extraction (EN + VI)
        self._stopwords = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would',
            'can', 'could', 'should', 'may', 'might', 'shall', 'must',
            'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
            'this', 'that', 'it', 'its', 'what', 'which', 'who', 'how',
            'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than',
            'about', 'more', 'also', 'very', 'just', 'so', 'too',
            'là', 'của', 'và', 'các', 'có', 'được', 'này', 'đó',
            'trong', 'cho', 'với', 'không', 'một', 'những', 'về',
            'như', 'từ', 'đã', 'sẽ', 'để', 'khi', 'thì', 'hay',
            'hãy', 'bạn', 'tôi', 'nó', 'gì', 'nào', 'thế',
        }

    def update(self, query: str, response: str = "") -> Dict:
        """
        Update topic tracker after a Q&A turn.

        Args:
            query: User's question
            response: AI's response (optional, for richer extraction)

        Returns:
            Dict with topic transition info
        """
        self.turn_count += 1

        # Extract key phrases from query (primary) and response (secondary)
        query_topics = self._extract_topics(query)
        response_topics = self._extract_topics(response) if response else []

        # Merge: query topics take priority
        all_topics = query_topics + [t for t in response_topics if t not in query_topics]
        if not all_topics:
            return {"transition": "none", "current_topic": self.get_current_topic()}

        primary_topic = all_topics[0]

        # Detect transition type
        transition = self._detect_transition(primary_topic, all_topics)

        # Update topic stack
        self._update_stack(primary_topic, all_topics)

        # Update co-occurrence matrix
        self._update_co_occurrence(all_topics)

        logger.info(
            f"[TopicTracker] Turn {self.turn_count}: "
            f"{transition} → '{primary_topic}' | "
            f"Stack: {[t.topic for t in self.topic_stack[-3:]]}"
        )

        return {
            "transition": transition,
            "current_topic": primary_topic,
            "topic_concepts": all_topics[:5],
            "stack_depth": len(self.topic_stack),
        }

    def get_current_topic(self) -> str:
        """Get the currently active topic."""
        active = [t for t in self.topic_stack if t.is_active]
        if active:
            return active[-1].topic
        return self.topic_stack[-1].topic if self.topic_stack else ""

    def get_active_topics(self, max_n: int = 3) -> List[str]:
        """Get the N most recently active topics."""
        active = [t for t in reversed(self.topic_stack) if t.is_active]
        return [t.topic for t in active[:max_n]]

    def get_context_boost(self) -> Dict[str, float]:
        """
        Get retrieval boost weights for active topics.
        Recent/active topics get higher boost for hybrid retrieval.

        Returns:
            Dict mapping topic → boost weight (0.0 to 1.0)
        """
        if not self.topic_stack:
            return {}

        boosts = {}
        active = [t for t in self.topic_stack if t.is_active]

        for i, entry in enumerate(reversed(active)):
            # More recent = higher boost, diminishing returns
            recency_weight = 1.0 / (1.0 + i * 0.3)
            # More mentions = slightly higher boost
            mention_weight = min(1.0, entry.mention_count / 5.0)
            boost = 0.5 * recency_weight + 0.3 * mention_weight + 0.2
            boosts[entry.topic] = round(min(1.0, boost), 3)

            # Also boost related concepts
            for concept in entry.concepts[:3]:
                if concept not in boosts:
                    boosts[concept] = round(boost * 0.5, 3)

        return boosts

    def get_related_topics(self, n: int = 5) -> List[Dict]:
        """
        Suggest related topics based on co-occurrence analysis.
        Useful for follow-up suggestions after a conversation.
        """
        current = self.get_current_topic()
        if not current or current not in self.co_occurrence:
            return []

        # Get topics co-occurring with current topic
        candidates = self.co_occurrence[current].most_common(n * 2)

        # Filter out already-discussed topics
        discussed = {t.topic for t in self.topic_stack}
        suggestions = []
        for topic, count in candidates:
            if topic not in discussed and topic != current:
                suggestions.append({
                    "topic": topic,
                    "relevance": round(count / max(sum(self.co_occurrence[current].values()), 1), 2),
                })
            if len(suggestions) >= n:
                break

        return suggestions

    def get_summary(self) -> Dict:
        """Get conversation topic summary."""
        return {
            "total_turns": self.turn_count,
            "topics_discussed": len(self.topic_stack),
            "active_topics": self.get_active_topics(),
            "topic_timeline": [
                {
                    "topic": t.topic,
                    "first_turn": t.start_turn,
                    "last_turn": t.last_turn,
                    "mentions": t.mention_count,
                    "active": t.is_active,
                }
                for t in self.topic_stack[-10:]  # Last 10 topics
            ],
        }

    # ──── Internal Methods ────

    def _extract_topics(self, text: str) -> List[str]:
        """
        Extract key topic phrases from text.
        Uses n-gram frequency with stopword filtering.
        """
        if not text or len(text.strip()) < 5:
            return []

        # Clean text
        text_lower = text.lower().strip()
        # Remove punctuation but keep unicode (Vietnamese)
        cleaned = re.sub(r'[^\w\s]', ' ', text_lower)
        words = cleaned.split()

        # Filter stopwords
        content_words = [w for w in words if w not in self._stopwords and len(w) > 2]
        if not content_words:
            return []

        topics = []

        # Strategy 1: Bigrams (2-word phrases)
        for i in range(len(content_words) - 1):
            bigram = f"{content_words[i]} {content_words[i+1]}"
            if len(bigram) > 5:
                topics.append(bigram)

        # Strategy 2: Significant single words (capitalized or long)
        for w in content_words:
            if len(w) > 4:
                topics.append(w)

        # Strategy 3: Quoted/emphasized terms from original text
        quoted = re.findall(r'["\']([^"\']+)["\']', text)
        for q in quoted:
            if len(q) > 3:
                topics.insert(0, q.lower())  # Quoted terms get priority

        bold = re.findall(r'\*\*([^*]+)\*\*', text)
        for b in bold:
            if len(b) > 3:
                topics.insert(0, b.lower())

        # Deduplicate while preserving order
        seen = set()
        unique = []
        for t in topics:
            if t not in seen:
                seen.add(t)
                unique.append(t)

        return unique[:10]

    def _detect_transition(self, primary: str, all_topics: List[str]) -> str:
        """
        Detect what kind of topic transition occurred.

        Returns:
            'new'         — completely new topic
            'continuation' — same topic as before
            'return'       — returning to a previously discussed topic
            'shift'        — gradual shift (some overlap with previous)
        """
        if not self.topic_stack:
            return "new"

        current_entry = self.topic_stack[-1]
        current_concepts = set(current_entry.concepts)

        # Check if continuing same topic
        if primary == current_entry.topic or primary in current_concepts:
            return "continuation"

        # Check if any new topics overlap with current
        overlap = set(all_topics) & current_concepts
        if overlap:
            return "shift"

        # Check if returning to a previously discussed topic
        for entry in self.topic_stack[:-1]:
            if primary == entry.topic or primary in set(entry.concepts):
                return "return"

        return "new"

    def _update_stack(self, primary: str, all_topics: List[str]):
        """Update the topic stack with new information."""
        # Check if topic already exists in stack
        for entry in self.topic_stack:
            if entry.topic == primary:
                # Update existing entry
                entry.last_turn = self.turn_count
                entry.mention_count += 1
                entry.is_active = True
                # Add new related concepts
                for t in all_topics:
                    if t not in entry.concepts:
                        entry.concepts.append(t)
                        if len(entry.concepts) > 15:
                            entry.concepts = entry.concepts[-15:]
                return

        # New topic entry
        entry = TopicEntry(
            topic=primary,
            concepts=all_topics[:10],
            start_turn=self.turn_count,
            last_turn=self.turn_count,
        )
        self.topic_stack.append(entry)

        # Deactivate old topics if stack too deep
        if len(self.topic_stack) > self.max_topics:
            self.topic_stack = self.topic_stack[-self.max_topics:]

        # Deactivate topics not mentioned in last 5 turns
        for t in self.topic_stack:
            if self.turn_count - t.last_turn > 5:
                t.is_active = False

    def _update_co_occurrence(self, topics: List[str]):
        """Update co-occurrence matrix for topic suggestions."""
        for i, t1 in enumerate(topics):
            for t2 in topics[i+1:]:
                self.co_occurrence[t1][t2] += 1
                self.co_occurrence[t2][t1] += 1
