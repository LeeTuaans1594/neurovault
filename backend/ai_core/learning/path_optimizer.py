"""
NEUROVAULT — Learning Path Optimizer (White-Box)
Tối ưu thứ tự học dựa trên knowledge graph + mastery tracking.

Features:
- Topological sort based on prerequisite dependencies
- Zone of Proximal Development (ZPD) filtering
- Spaced repetition integration
- Adaptive difficulty sequencing
- "What next?" recommendation engine
- Study plan generation (daily/weekly)
"""

from typing import List, Dict, Tuple, Optional, Set
from collections import defaultdict, deque
from datetime import datetime, timedelta


class LearningPathOptimizer:
    """
    Optimizes learning path through knowledge graph.

    Algorithm:
    1. Build dependency graph from prerequisites
    2. Topological sort for valid ordering
    3. Filter by ZPD (not too easy, not too hard)
    4. Prioritize by: urgency (forgetting), difficulty match, prerequisites met
    """

    def __init__(
        self,
        zpd_lower: float = 0.3,   # Lower bound of ZPD (too easy below)
        zpd_upper: float = 0.8,   # Upper bound of ZPD (too hard above)
        daily_target: int = 10,    # Target concepts per day
    ):
        self.zpd_lower = zpd_lower
        self.zpd_upper = zpd_upper
        self.daily_target = daily_target

    def optimize_path(
        self,
        concepts: List[Dict],
        edges: List[Dict],
        mastery: Dict[str, float],
        weak_concepts: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Generate optimized learning path.

        Args:
            concepts: Knowledge graph nodes [{concept, centrality_score, ...}]
            edges: Knowledge graph edges [{source, target, relation_type, ...}]
            mastery: Current mastery per concept {concept_name: float}
            weak_concepts: Override list of concepts needing review

        Returns:
            Ordered list of concepts with recommended actions
        """
        concept_names = [c["concept"] for c in concepts]
        concept_map = {c["concept"]: c for c in concepts}

        # Build prerequisite graph
        prereq_graph, reverse_graph = self._build_prereq_graph(
            concept_names, edges
        )

        # Topological sort
        topo_order = self._topological_sort(concept_names, prereq_graph)

        # Score each concept for priority
        scored = []
        for concept in topo_order:
            m = mastery.get(concept, 0.0)
            centrality = concept_map.get(concept, {}).get("centrality_score", 0.5)

            # Prerequisites met?
            prereqs = prereq_graph.get(concept, set())
            prereqs_met = all(
                mastery.get(p, 0.0) >= 0.5 for p in prereqs
            ) if prereqs else True

            # ZPD check
            in_zpd = self.zpd_lower <= m <= self.zpd_upper

            # Priority scoring
            priority = self._compute_priority(
                mastery=m,
                centrality=centrality,
                prereqs_met=prereqs_met,
                in_zpd=in_zpd,
                is_weak=concept in (weak_concepts or []),
            )

            # Determine recommended action
            if m < 0.3:
                action = "learn"       # New/forgotten concept
            elif m < 0.5:
                action = "practice"    # Needs practice
            elif m < 0.7:
                action = "review"      # Ready for review
            elif m < 0.9:
                action = "strengthen"  # Strengthen mastery
            else:
                action = "maintain"    # Already mastered

            scored.append({
                "concept": concept,
                "mastery": round(m, 4),
                "centrality": round(centrality, 4),
                "priority": round(priority, 4),
                "action": action,
                "prerequisites_met": prereqs_met,
                "in_zpd": in_zpd,
                "prerequisites": list(prereqs),
                "dependents": list(reverse_graph.get(concept, set())),
            })

        # Sort by priority (highest first), then by topo order for ties
        topo_index = {c: i for i, c in enumerate(topo_order)}
        scored.sort(key=lambda x: (-x["priority"], topo_index.get(x["concept"], 999)))

        return scored

    def get_next_concepts(
        self,
        concepts: List[Dict],
        edges: List[Dict],
        mastery: Dict[str, float],
        n: int = 5,
    ) -> List[Dict]:
        """
        "What next?" — recommend next N concepts to study.

        Filters out:
        - Already mastered concepts (>0.9)
        - Concepts with unmet prerequisites
        """
        path = self.optimize_path(concepts, edges, mastery)

        recommendations = []
        for item in path:
            if item["action"] == "maintain":
                continue  # Skip mastered
            if not item["prerequisites_met"]:
                continue  # Skip if prerequisites not met
            recommendations.append(item)
            if len(recommendations) >= n:
                break

        return recommendations

    def generate_study_plan(
        self,
        concepts: List[Dict],
        edges: List[Dict],
        mastery: Dict[str, float],
        days: int = 7,
    ) -> List[Dict]:
        """
        Generate a daily study plan for N days.

        Returns:
            [{day: 1, concepts: [...], target_mastery: float}, ...]
        """
        path = self.optimize_path(concepts, edges, mastery)

        # Filter actionable concepts
        actionable = [
            c for c in path
            if c["action"] != "maintain" and c["prerequisites_met"]
        ]

        plan = []
        idx = 0
        for day in range(1, days + 1):
            day_concepts = []
            # New concepts
            new_count = 0
            review_count = 0

            while idx < len(actionable) and len(day_concepts) < self.daily_target:
                item = actionable[idx]
                idx += 1

                if item["action"] in ("learn", "practice"):
                    if new_count < self.daily_target // 2:
                        day_concepts.append(item)
                        new_count += 1
                else:
                    if review_count < self.daily_target // 2:
                        day_concepts.append(item)
                        review_count += 1

            if not day_concepts and idx >= len(actionable):
                # Wrap around for review days
                idx = 0

            plan.append({
                "day": day,
                "date": (datetime.utcnow() + timedelta(days=day - 1)).strftime("%Y-%m-%d"),
                "concepts": day_concepts,
                "new_concepts": new_count,
                "review_concepts": review_count,
                "estimated_time_min": len(day_concepts) * 5,  # ~5 min per concept
            })

        return plan

    def _build_prereq_graph(
        self,
        concepts: List[str],
        edges: List[Dict],
    ) -> Tuple[Dict[str, Set[str]], Dict[str, Set[str]]]:
        """
        Build prerequisite graph from edges.

        Returns:
            (prereq_graph, reverse_graph)
            prereq_graph[X] = {Y, Z} means Y and Z are prerequisites for X
            reverse_graph[Y] = {X} means Y is a prerequisite for X
        """
        prereq: Dict[str, Set[str]] = defaultdict(set)
        reverse: Dict[str, Set[str]] = defaultdict(set)

        for edge in edges:
            if edge.get("relation_type") == "prerequisite":
                src = edge["source"]
                tgt = edge["target"]
                # src is prerequisite for tgt
                prereq[tgt].add(src)
                reverse[src].add(tgt)

        return prereq, reverse

    def _topological_sort(
        self,
        concepts: List[str],
        prereq_graph: Dict[str, Set[str]],
    ) -> List[str]:
        """
        Kahn's algorithm for topological sorting.
        Handles cycles gracefully (breaks them).
        """
        # Compute in-degrees
        in_degree = {c: 0 for c in concepts}
        adj = defaultdict(set)

        for concept, prereqs in prereq_graph.items():
            for prereq in prereqs:
                if prereq in in_degree and concept in in_degree:
                    in_degree[concept] += 1
                    adj[prereq].add(concept)

        # BFS with queue of zero in-degree nodes
        queue = deque([c for c in concepts if in_degree[c] == 0])
        result = []

        while queue:
            node = queue.popleft()
            result.append(node)

            for neighbor in adj[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        # Add remaining (cycle-breaking: just append in original order)
        remaining = [c for c in concepts if c not in result]
        result.extend(remaining)

        return result

    def _compute_priority(
        self,
        mastery: float,
        centrality: float,
        prereqs_met: bool,
        in_zpd: bool,
        is_weak: bool,
    ) -> float:
        """
        Compute learning priority for a concept.

        Higher = should study sooner.
        """
        # Base priority from mastery gap (0 mastery = highest need)
        mastery_gap = max(0, 1.0 - mastery)

        # Centrality bonus (more important concepts first)
        centrality_bonus = centrality * 0.3

        # ZPD bonus (concepts in ZPD are optimal for learning)
        zpd_bonus = 0.2 if in_zpd else 0.0

        # Prerequisite penalty (can't learn without prereqs)
        prereq_penalty = 0.0 if prereqs_met else -0.5

        # Weak concept boost
        weak_bonus = 0.3 if is_weak else 0.0

        priority = (
            mastery_gap * 0.4
            + centrality_bonus
            + zpd_bonus
            + prereq_penalty
            + weak_bonus
        )

        return max(0.0, min(1.0, priority))
