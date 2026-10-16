"""
NEUROVAULT — Cross-Document Knowledge Engine (White-Box)
Merge, link, and query knowledge across multiple documents.

Features:
- Concept deduplication across documents (fuzzy matching)
- Cross-document edge linking
- Unified concept index with source tracking
- Cross-document quiz generation (multi-source questions)
- Merged flashcard deck per topic
"""

import re
import logging
from typing import List, Dict, Optional, Set, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)


class CrossDocumentEngine:
    """
    Merges knowledge graphs from multiple documents into a unified graph.

    Algorithm:
    1. Collect concepts from all document KGs
    2. Fuzzy-match concepts across documents (normalized string similarity)
    3. Merge matching concepts into unified nodes with source tracking
    4. Aggregate edges, preserving provenance
    5. Recompute centrality on merged graph
    """

    def __init__(self, similarity_threshold: float = 0.85):
        """
        Args:
            similarity_threshold: Min similarity (0-1) to consider two concepts
                                  as the same across documents.
        """
        self.similarity_threshold = similarity_threshold
        # Unified concept store: concept_key → { sources, centrality, ... }
        self.unified_concepts: Dict[str, Dict] = {}
        # Unified edges: (src_key, tgt_key) → { relation, weight, sources }
        self.unified_edges: Dict[Tuple[str, str], Dict] = {}
        # Document graphs cache: doc_id → graph dict
        self.doc_graphs: Dict[str, Dict] = {}

    def add_document_graph(self, doc_id: str, graph: Dict) -> int:
        """
        Add a document's knowledge graph to the unified index.

        Args:
            doc_id: Document identifier
            graph: Knowledge graph dict with 'nodes' and 'edges'

        Returns:
            Number of new unified concepts added
        """
        if not graph or "nodes" not in graph:
            return 0

        self.doc_graphs[doc_id] = graph
        new_count = 0

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        # Process nodes
        for node in nodes:
            concept = node.get("concept", "").strip()
            if not concept:
                continue

            # Find matching unified concept
            matched_key = self._find_match(concept)

            if matched_key:
                # Merge into existing
                self.unified_concepts[matched_key]["sources"].add(doc_id)
                self.unified_concepts[matched_key]["aliases"].add(concept)
                # Average centrality
                existing = self.unified_concepts[matched_key]
                old_centrality = existing.get("centrality_score", 0)
                new_centrality = node.get("centrality_score", 0)
                existing["centrality_score"] = (old_centrality + new_centrality) / 2
                # Track community per document
                if node.get("community") is not None:
                    existing["communities"][doc_id] = node["community"]
            else:
                # New concept
                key = self._normalize(concept)
                self.unified_concepts[key] = {
                    "concept": concept,
                    "key": key,
                    "sources": {doc_id},
                    "aliases": {concept},
                    "centrality_score": node.get("centrality_score", 0),
                    "communities": {},
                    "mastery": node.get("mastery", None),
                }
                if node.get("community") is not None:
                    self.unified_concepts[key]["communities"][doc_id] = node["community"]
                new_count += 1

        # Process edges
        for edge in edges:
            src = edge.get("source", "").strip()
            tgt = edge.get("target", "").strip()
            if not src or not tgt:
                continue

            src_key = self._find_match(src) or self._normalize(src)
            tgt_key = self._find_match(tgt) or self._normalize(tgt)

            if src_key == tgt_key:
                continue  # Skip self-loops

            edge_key = (src_key, tgt_key)

            if edge_key in self.unified_edges:
                self.unified_edges[edge_key]["sources"].add(doc_id)
                self.unified_edges[edge_key]["weight"] += edge.get("weight", 1.0)
            else:
                self.unified_edges[edge_key] = {
                    "source": src_key,
                    "target": tgt_key,
                    "relation_type": edge.get("relation_type", "related"),
                    "weight": edge.get("weight", 1.0),
                    "sources": {doc_id},
                }

        logger.info(
            f"[CrossDoc] Added doc '{doc_id}': {len(nodes)} nodes, {len(edges)} edges → "
            f"{new_count} new unified concepts (total: {len(self.unified_concepts)})"
        )
        return new_count

    def get_unified_graph(self) -> Dict:
        """
        Return the merged cross-document knowledge graph.

        Returns:
            {
                "nodes": [...],
                "edges": [...],
                "stats": { total_concepts, total_edges, total_documents, ... }
            }
        """
        # Build nodes
        nodes = []
        for key, data in self.unified_concepts.items():
            nodes.append({
                "concept": data["concept"],
                "key": key,
                "centrality_score": round(data["centrality_score"], 4),
                "source_count": len(data["sources"]),
                "sources": sorted(data["sources"]),
                "aliases": sorted(data["aliases"]),
                "mastery": data.get("mastery"),
                "is_cross_document": len(data["sources"]) > 1,
            })

        # Sort by centrality (most important first)
        nodes.sort(key=lambda n: n["centrality_score"], reverse=True)

        # Build edges
        edges = []
        for (src_key, tgt_key), data in self.unified_edges.items():
            src_data = self.unified_concepts.get(src_key)
            tgt_data = self.unified_concepts.get(tgt_key)
            if not src_data or not tgt_data:
                continue

            edges.append({
                "source": src_data["concept"],
                "target": tgt_data["concept"],
                "relation_type": data["relation_type"],
                "weight": round(data["weight"], 2),
                "source_count": len(data["sources"]),
                "sources": sorted(data["sources"]),
                "is_cross_document": len(data["sources"]) > 1,
            })

        # Stats
        cross_concepts = sum(1 for n in nodes if n["is_cross_document"])
        cross_edges = sum(1 for e in edges if e["is_cross_document"])

        stats = {
            "total_concepts": len(nodes),
            "total_edges": len(edges),
            "total_documents": len(self.doc_graphs),
            "cross_document_concepts": cross_concepts,
            "cross_document_edges": cross_edges,
            "overlap_ratio": round(cross_concepts / max(len(nodes), 1), 2),
        }

        return {"nodes": nodes, "edges": edges, "stats": stats}

    def get_cross_document_concepts(self) -> List[Dict]:
        """Return concepts that appear in multiple documents."""
        return [
            {
                "concept": data["concept"],
                "source_count": len(data["sources"]),
                "sources": sorted(data["sources"]),
                "centrality_score": round(data["centrality_score"], 4),
            }
            for key, data in self.unified_concepts.items()
            if len(data["sources"]) > 1
        ]

    def get_related_documents(self, doc_id: str) -> List[Dict]:
        """
        Find documents related to a given document by concept overlap.

        Returns:
            Sorted list of related documents with overlap scores.
        """
        if doc_id not in self.doc_graphs:
            return []

        # Get concepts from this document
        my_concepts = set()
        for key, data in self.unified_concepts.items():
            if doc_id in data["sources"]:
                my_concepts.add(key)

        if not my_concepts:
            return []

        # Count overlap with other documents
        overlap_scores: Dict[str, int] = defaultdict(int)
        for key in my_concepts:
            for other_doc in self.unified_concepts[key]["sources"]:
                if other_doc != doc_id:
                    overlap_scores[other_doc] += 1

        # Build results
        results = [
            {
                "document_id": other_doc,
                "shared_concepts": count,
                "overlap_ratio": round(count / max(len(my_concepts), 1), 2),
            }
            for other_doc, count in overlap_scores.items()
        ]

        results.sort(key=lambda r: r["shared_concepts"], reverse=True)
        return results

    def _find_match(self, concept: str) -> Optional[str]:
        """Find a matching unified concept key using normalized string similarity."""
        normalized = self._normalize(concept)

        # Exact match first
        if normalized in self.unified_concepts:
            return normalized

        # Fuzzy match using Jaccard similarity on character n-grams
        for key in self.unified_concepts:
            sim = self._similarity(normalized, key)
            if sim >= self.similarity_threshold:
                return key

        return None

    @staticmethod
    def _normalize(text: str) -> str:
        """Normalize a concept string for matching."""
        text = text.lower().strip()
        text = re.sub(r'[^\w\s]', '', text)
        text = re.sub(r'\s+', ' ', text)
        return text

    @staticmethod
    def _similarity(a: str, b: str) -> float:
        """
        Compute Jaccard similarity on character trigrams.
        Fast, language-agnostic fuzzy matching.
        """
        if a == b:
            return 1.0
        if not a or not b:
            return 0.0

        def trigrams(s):
            s = f"  {s} "
            return set(s[i:i+3] for i in range(len(s) - 2))

        tri_a = trigrams(a)
        tri_b = trigrams(b)

        if not tri_a or not tri_b:
            return 0.0

        intersection = len(tri_a & tri_b)
        union = len(tri_a | tri_b)
        return intersection / union if union > 0 else 0.0
