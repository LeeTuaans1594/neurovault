"""
NEUROVAULT — Knowledge Graph Builder v3 (White-Box)
Xây dựng đồ thị kiến thức từ chunks + concepts.

v3 Improvements:
- LLM-verified relation classification (is-a, part-of, prerequisite, related, none)
- Label Propagation community detection (white-box)
- Relation extraction (is-a, part-of, related-to, prerequisite)
- PageRank-based node centrality scoring
- Prerequisite detection (topological ordering)
- Definition extraction integration
- Edge weight normalization
- Graph statistics + community coloring
"""

import random
import logging
from typing import List, Dict, Tuple, Set, Optional
from collections import Counter
from knowledge.concept_extractor import ConceptExtractor
from knowledge.topic_clusterer import TopicClusterer
import math
import re

logger = logging.getLogger(__name__)


class KnowledgeGraphBuilder:
    """
    Build knowledge graph v2:
    - concept nodes with definitions + centrality
    - typed edges (related, is-a, part-of, prerequisite)
    - PageRank scoring
    - prerequisite ordering
    """

    def __init__(self, max_concepts: int = 30, llm_engine=None):
        self.extractor = ConceptExtractor(max_concepts=max_concepts)
        self.llm = llm_engine
        self.topic_clusterer = TopicClusterer(stopwords={'và', 'là', 'của', 'các', 'trong', 'để', 'với'})

    def build(
        self,
        chunks: List[Dict],
        document_id: str,
        user_id: str,
    ) -> Dict:
        """
        Build knowledge graph from chunks.

        Returns:
            {
                "nodes": [...],
                "edges": [...],
                "stats": {...},
                "prerequisite_order": [...],
            }
        """
        # Extract concepts from full text
        all_texts = [c["text"] for c in chunks]
        full_text = " ".join(all_texts)

        global_concepts = self.extractor.extract(full_text, all_texts)
        concept_names = [c["concept"] for c in global_concepts]

        # Extract definitions
        definitions = self.extractor.extract_definitions(full_text)
        def_map = {d["concept"].lower(): d["definition"] for d in definitions}

        # Map concepts to chunks
        chunk_concepts: Dict[str, List[str]] = {}
        concept_chunks: Dict[str, List[str]] = {}  # Reverse mapping

        for chunk in chunks:
            chunk_id = chunk["chunk_id"]
            text_lower = chunk["text"].lower()
            found = [c for c in concept_names if c in text_lower]
            chunk_concepts[chunk_id] = found

            for c in found:
                if c not in concept_chunks:
                    concept_chunks[c] = []
                concept_chunks[c].append(chunk_id)

        # Build edges with relation types
        edges, edge_map = self._build_edges(
            chunks, chunk_concepts, concept_names
        )

        # LLM-verified relations (Task 3.2)
        if self.llm and hasattr(self.llm, 'is_available') and self.llm.is_available():
            edge_map = self._verify_relations_llm(edge_map, chunks, chunk_concepts)

        # ── Phase 1 Upgrade: Prune edges with PMI + TopK ──
        # Raw co-occurrence creates near-fully-connected graphs
        # (30 nodes → 435 edges). PMI keeps only statistically
        # significant associations, TopK limits visual noise.
        edge_map = self._prune_edges(
            edge_map, chunks, chunk_concepts, concept_names
        )

        # Build adjacency list for PageRank
        adjacency = self._build_adjacency(concept_names, edge_map)

        # Compute PageRank
        pagerank = self._pagerank(concept_names, adjacency)

        # Detect communities (Louvain modularity optimization)
        communities = self._detect_communities_louvain(adjacency)

        # Auto-name communities by highest-centrality member
        cluster_names = self._name_communities(
            global_concepts, communities, pagerank
        )

        # ── Phase 1 Upgrade Task 1.3: Topic-Aware Clustering ──
        # Semantic clustering based on text context TF-IDF
        semantic_communities = self.topic_clusterer.cluster(
            concept_names, chunk_concepts, chunks
        )

        # Detect prerequisites
        prerequisite_order = self._detect_prerequisites(
            chunks, chunk_concepts, concept_names
        )

        # Build nodes
        nodes = []
        for concept_data in global_concepts:
            name = concept_data["concept"]
            related = concept_chunks.get(name, [])
            pr_score = pagerank.get(name, 0.0)

            # Use PageRank + TF-IDF score for final centrality
            combined_score = 0.6 * pr_score + 0.4 * concept_data["score"]

            nodes.append({
                "user_id": user_id,
                "document_id": document_id,
                "concept": name,
                "definition": def_map.get(name.lower(), ""),
                "related_chunk_ids": related,
                "centrality_score": round(combined_score, 4),
                "pagerank": round(pr_score, 4),
                "tfidf_score": round(concept_data["score"], 4),
                "frequency": concept_data.get("frequency", 0),
                "community": communities.get(name, 0),
                "semantic_cluster": semantic_communities.get(name, 0),
            })

        # Sort nodes by centrality
        nodes.sort(key=lambda n: n["centrality_score"], reverse=True)

        # Count unique communities
        unique_communities = len(set(communities.values())) if communities else 0

        # Prepare edges with frontend-compatible field names
        final_edges = []
        for e in edge_map.values():
            edge_out = dict(e)
            # Frontend checks 'relation', backend uses 'relation_type'
            edge_out["relation"] = e.get("relation_type", "related")
            final_edges.append(edge_out)

        return {
            "nodes": nodes,
            "edges": final_edges,
            "stats": {
                "total_concepts": len(nodes),
                "total_edges": len(final_edges),
                "chunks_analyzed": len(chunks),
                "definitions_found": len(definitions),
                "communities": unique_communities,
                "avg_centrality": round(
                    sum(n["centrality_score"] for n in nodes) / max(len(nodes), 1),
                    4,
                ),
            },
            "cluster_names": cluster_names,
            "prerequisite_order": prerequisite_order,
        }

    def _build_edges(
        self,
        chunks: List[Dict],
        chunk_concepts: Dict[str, List[str]],
        concept_names: List[str],
    ) -> Tuple[List[Dict], Dict[str, Dict]]:
        """Build edges with typed relations."""
        edges = []

        for chunk in chunks:
            chunk_id = chunk["chunk_id"]
            text = chunk["text"]
            text_lower = text.lower()
            concepts = chunk_concepts.get(chunk_id, [])

            for i in range(len(concepts)):
                for j in range(i + 1, len(concepts)):
                    src, tgt = concepts[i], concepts[j]
                    relation = self._detect_relation(
                        src, tgt, text_lower
                    )
                    edges.append({
                        "source": src,
                        "target": tgt,
                        "relation_type": relation,
                        "weight": 1.0,
                        "evidence_chunk": chunk_id,
                    })

        # Deduplicate and weight edges
        edge_map: Dict[str, Dict] = {}
        for edge in edges:
            key = f"{min(edge['source'], edge['target'])}|{max(edge['source'], edge['target'])}"

            if key in edge_map:
                edge_map[key]["weight"] += 0.15
                edge_map[key]["weight"] = min(edge_map[key]["weight"], 1.0)
                # Upgrade relation if more specific found
                if edge["relation_type"] != "related":
                    edge_map[key]["relation_type"] = edge["relation_type"]
            else:
                edge_map[key] = edge

        return edges, edge_map

    def _detect_relation(
        self, concept_a: str, concept_b: str, text: str
    ) -> str:
        """
        Detect relation type between two concepts based on context patterns.

        Types:
        - "is-a": inheritance/taxonomy
        - "part-of": composition
        - "prerequisite": concept_a needed before concept_b
        - "related": general co-occurrence
        """
        # Pattern matching for relation detection
        a_esc = re.escape(concept_a.lower())
        b_esc = re.escape(concept_b.lower())

        # is-a patterns
        is_a_patterns = [
            rf'{a_esc}\s+(?:is|are)\s+(?:a|an)\s+(?:type|kind|form)\s+of\s+.*{b_esc}',
            rf'{a_esc}\s+(?:là)\s+(?:một|loại|dạng)\s+.*{b_esc}',
            rf'{b_esc}\s+(?:such as|including|like)\s+.*{a_esc}',
            rf'{b_esc}\s+(?:bao gồm|như|ví dụ)\s+.*{a_esc}',
        ]
        for p in is_a_patterns:
            if re.search(p, text, re.IGNORECASE):
                return "is-a"

        # part-of patterns
        part_of_patterns = [
            rf'{a_esc}\s+(?:is|are)\s+(?:part|component|element)\s+of\s+.*{b_esc}',
            rf'{a_esc}\s+(?:là|thuộc)\s+(?:phần|thành phần|bộ phận)\s+.*{b_esc}',
            rf'{b_esc}\s+(?:consists|comprises|contains)\s+.*{a_esc}',
        ]
        for p in part_of_patterns:
            if re.search(p, text, re.IGNORECASE):
                return "part-of"

        # prerequisite patterns
        prereq_patterns = [
            rf'(?:before|prior to|requires?|need)\s+.*{a_esc}.*{b_esc}',
            rf'{a_esc}.*(?:before|prior|prerequisite|foundation).*{b_esc}',
            rf'(?:trước khi|cần|yêu cầu)\s+.*{a_esc}.*{b_esc}',
        ]
        for p in prereq_patterns:
            if re.search(p, text, re.IGNORECASE):
                return "prerequisite"

        return "related"

    def _build_adjacency(
        self,
        concepts: List[str],
        edge_map: Dict[str, Dict],
    ) -> Dict[str, List[Tuple[str, float]]]:
        """Build adjacency list from edge map."""
        adj: Dict[str, List[Tuple[str, float]]] = {c: [] for c in concepts}

        for edge in edge_map.values():
            src, tgt = edge["source"], edge["target"]
            w = edge["weight"]
            if src in adj:
                adj[src].append((tgt, w))
            if tgt in adj:
                adj[tgt].append((src, w))

        return adj

    def _pagerank(
        self,
        concepts: List[str],
        adjacency: Dict[str, List[Tuple[str, float]]],
        damping: float = 0.85,
        max_iter: int = 50,
        tol: float = 1e-6,
    ) -> Dict[str, float]:
        """
        PageRank algorithm for concept importance scoring.
        More connected + more important neighbors = higher score.
        """
        n = len(concepts)
        if n == 0:
            return {}

        # Initialize scores uniformly
        scores = {c: 1.0 / n for c in concepts}

        for _ in range(max_iter):
            new_scores = {}
            for concept in concepts:
                incoming_sum = 0.0
                for neighbor, weight in adjacency.get(concept, []):
                    # Outgoing weight from neighbor
                    out_sum = sum(w for _, w in adjacency.get(neighbor, []))
                    if out_sum > 0:
                        incoming_sum += weight / out_sum * scores.get(neighbor, 0)

                new_scores[concept] = (1 - damping) / n + damping * incoming_sum

            # Check convergence
            diff = sum(abs(new_scores[c] - scores[c]) for c in concepts)
            scores = new_scores
            if diff < tol:
                break

        # Normalize to [0, 1]
        max_score = max(scores.values()) if scores else 1.0
        if max_score > 0:
            scores = {c: s / max_score for c, s in scores.items()}

        return scores

    def _detect_prerequisites(
        self,
        chunks: List[Dict],
        chunk_concepts: Dict[str, List[str]],
        concept_names: List[str],
    ) -> List[str]:
        """
        Detect prerequisite ordering based on concept first-appearance order.

        Heuristic: concepts that appear earlier in the document are likely
        prerequisites for concepts that appear later.
        """
        first_appearance: Dict[str, int] = {}

        for chunk in chunks:
            chunk_id = chunk["chunk_id"]
            position = chunk.get("position", 0)
            concepts = chunk_concepts.get(chunk_id, [])

            for concept in concepts:
                if concept not in first_appearance:
                    first_appearance[concept] = position

        # Sort by first appearance
        ordered = sorted(
            first_appearance.keys(),
            key=lambda c: first_appearance[c],
        )

        return ordered

    def _verify_relations_llm(
        self,
        edge_map: Dict[str, Dict],
        chunks: List[Dict],
        chunk_concepts: Dict[str, List[str]],
    ) -> Dict[str, Dict]:
        """
        Use LLM to verify and reclassify relations between concepts.
        Filters out false-positive 'none' relations.
        """
        if not edge_map:
            return edge_map

        # Process in batches of 10 edges
        edges_list = list(edge_map.items())
        verified_map = {}

        for batch_start in range(0, len(edges_list), 10):
            batch = edges_list[batch_start:batch_start + 10]
            pairs_text = "\n".join(
                f"- {e['source']} ↔ {e['target']} (current: {e['relation_type']})"
                for _, e in batch
            )

            # Find context for these concepts
            relevant_concepts = set()
            for _, e in batch:
                relevant_concepts.add(e['source'])
                relevant_concepts.add(e['target'])

            context_parts = []
            for chunk in chunks[:10]:
                chunk_id = chunk['chunk_id']
                cpts = chunk_concepts.get(chunk_id, [])
                if any(c in relevant_concepts for c in cpts):
                    context_parts.append(chunk['text'][:200])
            context = "\n".join(context_parts[:5])

            prompt = (
                f"Given these concept pairs found in the text, classify their relationship.\n\n"
                f"Text excerpt: {context[:800]}\n\n"
                f"Concept pairs:\n{pairs_text}\n\n"
                f"For each pair, return the relationship type:\n"
                f"- \"is-a\" (X is a type of Y)\n"
                f"- \"part-of\" (X is part of Y)\n"
                f"- \"prerequisite\" (must know X before Y)\n"
                f"- \"related\" (general relation)\n"
                f"- \"none\" (no real relation)\n\n"
                f"Return one line per pair: source | target | relation"
            )

            try:
                result = self.llm.generate(
                    prompt=prompt,
                    system="You classify concept relationships. Return one line per pair: source | target | relation",
                    temperature=0.2,
                    max_tokens=400,
                )

                if result and not result.startswith("[ERROR]"):
                    llm_relations = self._parse_relation_output(result)
                    for key, edge in batch:
                        pair_key = f"{edge['source']}|{edge['target']}"
                        reverse_key = f"{edge['target']}|{edge['source']}"
                        llm_rel = llm_relations.get(pair_key) or llm_relations.get(reverse_key)

                        if llm_rel == "none":
                            logger.info(f"[KG] LLM filtered: {edge['source']} ↔ {edge['target']}")
                            continue  # Remove false positive
                        elif llm_rel and llm_rel in ('is-a', 'part-of', 'prerequisite', 'related'):
                            edge['relation_type'] = llm_rel
                            edge['llm_verified'] = True

                        verified_map[key] = edge
                else:
                    # LLM failed, keep original edges
                    for key, edge in batch:
                        verified_map[key] = edge

            except Exception as e:
                logger.warning(f"[KG] LLM relation verification failed: {e}")
                for key, edge in batch:
                    verified_map[key] = edge

        logger.info(f"[KG] LLM verified: {len(verified_map)}/{len(edge_map)} edges kept")
        return verified_map

    def _parse_relation_output(self, raw: str) -> Dict[str, str]:
        """Parse LLM relation classification output."""
        relations = {}
        for line in raw.strip().split('\n'):
            line = line.strip()
            if not line or '|' not in line:
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 3:
                source = parts[0].strip('- ').strip()
                target = parts[1].strip()
                relation = parts[2].strip().lower()
                if relation in ('is-a', 'part-of', 'prerequisite', 'related', 'none'):
                    relations[f"{source}|{target}"] = relation
        return relations

    # ══════════════════════════════════════════════════════════════
    # Phase 1 Upgrade: PMI Edge Pruning
    # ══════════════════════════════════════════════════════════════

    def _prune_edges(
        self,
        edge_map: Dict[str, Dict],
        chunks: List[Dict],
        chunk_concepts: Dict[str, List[str]],
        concept_names: List[str],
        max_edges_per_node: int = 6,
        min_combined_weight: float = 0.15,
    ) -> Dict[str, Dict]:
        """
        Prune edges using NPMI (Normalized Pointwise Mutual Information)
        + TopK filtering per node.

        Problem:
            Raw co-occurrence creates near-fully-connected graphs.
            30 concepts in overlapping chunks → C(30,2) = 435 edges.
            This makes community detection fail and force layout collapse.

        Solution:
            1. Compute NPMI for each concept pair — measures how much
               more often two concepts co-occur than expected by chance.
               NPMI ∈ [-1, 1], where 1 = perfect co-occurrence,
               0 = independent, -1 = never co-occur.
            2. Blend NPMI with raw co-occurrence weight.
            3. Remove edges below threshold.
            4. Keep only top-K edges per node.

        Typical result: 435 edges → 60-90 meaningful edges.
        """
        if not edge_map or not chunks:
            return edge_map

        n_chunks = len(chunks)
        if n_chunks == 0:
            return edge_map

        # ── Step 1: Concept frequency across chunks ──
        concept_chunk_count: Dict[str, int] = Counter()
        for chunk_id, concepts in chunk_concepts.items():
            for c in set(concepts):  # dedupe within chunk
                concept_chunk_count[c] += 1

        # ── Step 2: Co-occurrence frequency ──
        pair_chunk_count: Dict[Tuple[str, str], int] = Counter()
        for chunk_id, concepts in chunk_concepts.items():
            unique = sorted(set(concepts))
            for i in range(len(unique)):
                for j in range(i + 1, len(unique)):
                    pair_chunk_count[(unique[i], unique[j])] += 1

        # ── Step 3: Compute NPMI for each edge ──
        for key, edge in edge_map.items():
            src, tgt = edge["source"], edge["target"]
            pair = tuple(sorted([src, tgt]))

            co_count = pair_chunk_count.get(pair, 0)
            src_count = concept_chunk_count.get(src, 0)
            tgt_count = concept_chunk_count.get(tgt, 0)

            if co_count > 0 and src_count > 0 and tgt_count > 0:
                p_ab = co_count / n_chunks
                p_a = src_count / n_chunks
                p_b = tgt_count / n_chunks

                # PMI = log2(P(A,B) / (P(A) * P(B)))
                pmi = math.log2(p_ab / (p_a * p_b)) if (p_a * p_b) > 0 else 0

                # NPMI = PMI / -log2(P(A,B)) — normalizes to [-1, 1]
                if p_ab < 1.0 and p_ab > 0:
                    npmi = pmi / (-math.log2(p_ab))
                else:
                    npmi = 1.0 if p_ab >= 1.0 else 0.0

                npmi = max(0.0, min(1.0, npmi))  # Clip to [0, 1]
            else:
                npmi = 0.0

            edge["npmi"] = round(npmi, 4)

            # Combined weight: blend co-occurrence + NPMI
            raw_w = edge.get("weight", 0.5)
            # Relation bonus: typed relations (is-a, part-of, prerequisite)
            # are inherently more meaningful than generic "related"
            rel_bonus = 0.2 if edge.get("relation_type", "related") != "related" else 0.0
            edge["weight"] = round(
                0.35 * raw_w + 0.50 * npmi + 0.15 + rel_bonus,
                4,
            )

        # ── Step 4: Remove edges below threshold ──
        edge_map = {
            k: e for k, e in edge_map.items()
            if e["weight"] >= min_combined_weight
        }

        # ── Step 5: TopK edges per node ──
        # For each node, keep only the top-K strongest edges
        node_edges: Dict[str, List[Tuple[str, float]]] = {}
        for key, edge in edge_map.items():
            src, tgt = edge["source"], edge["target"]
            w = edge["weight"]
            node_edges.setdefault(src, []).append((key, w))
            node_edges.setdefault(tgt, []).append((key, w))

        # Collect keys to keep
        keep_keys: Set[str] = set()
        for node, edges_list in node_edges.items():
            # Sort by weight descending, keep top K
            edges_list.sort(key=lambda x: x[1], reverse=True)
            for edge_key, _ in edges_list[:max_edges_per_node]:
                keep_keys.add(edge_key)

        pruned = {k: e for k, e in edge_map.items() if k in keep_keys}

        logger.info(
            f"[KG] Edge pruning: {len(edge_map)} → {len(pruned)} edges "
            f"(max {max_edges_per_node}/node, min_weight={min_combined_weight})"
        )
        return pruned

    # ══════════════════════════════════════════════════════════════
    # Phase 1 Upgrade: Louvain Community Detection
    # ══════════════════════════════════════════════════════════════

    def _detect_communities_louvain(
        self,
        adjacency: Dict[str, List[Tuple[str, float]]],
        resolution: float = 1.0,
        max_iter: int = 50,
    ) -> Dict[str, int]:
        """
        Louvain modularity-based community detection (white-box).

        Why Louvain over Label Propagation:
            Label Propagation converges to 1 cluster on dense graphs
            because every node quickly adopts the same dominant label.
            Louvain optimizes modularity Q, which explicitly measures
            the quality of community structure vs random partition.

        Algorithm:
            Phase 1 (local moves):
                For each node, try moving it to each neighbor's community.
                Accept the move that gives the largest modularity gain ΔQ.
                Repeat until no improvement.

            Phase 2 (aggregation):
                Merge nodes in same community into super-nodes.
                Build new graph of super-nodes. Repeat Phase 1.
                (Simplified: we do Phase 1 only, sufficient for <100 nodes)

        Modularity gain ΔQ for moving node i to community C:
            ΔQ = [Σ_in + k_{i,in}] / 2m - [(Σ_tot + k_i) / 2m]²
                 - [Σ_in / 2m - (Σ_tot / 2m)² - (k_i / 2m)²]

            Where:
                Σ_in  = sum of weights inside community C
                Σ_tot = sum of all edges incident to nodes in C
                k_i   = degree of node i
                k_{i,in} = sum of edges from i to nodes in C
                m     = total edge weight in graph

        Resolution parameter:
            Higher resolution → more, smaller communities.
            Default 1.0 is standard. Use 1.2-1.5 for finer granularity.

        Returns:
            Dict mapping concept → community_id (0-indexed)
        """
        if not adjacency:
            return {}

        nodes = list(adjacency.keys())
        if len(nodes) <= 1:
            return {n: 0 for n in nodes}

        # Build weighted adjacency dict: node → {neighbor: weight}
        adj: Dict[str, Dict[str, float]] = {n: {} for n in nodes}
        total_weight = 0.0
        for node in nodes:
            for neighbor, weight in adjacency.get(node, []):
                if neighbor in adj:
                    adj[node][neighbor] = weight
                    total_weight += weight

        m = total_weight / 2.0  # Each edge counted twice in undirected
        if m == 0:
            return {n: i for i, n in enumerate(nodes)}

        # Node strength: k_i = sum of all edge weights for node i
        k: Dict[str, float] = {
            n: sum(adj[n].values()) for n in nodes
        }

        # Initialize: each node in its own community
        node2comm: Dict[str, int] = {n: i for i, n in enumerate(nodes)}

        # Pre-compute community aggregates for O(1) lookup
        # sigma_tot[c] = sum of k_i for all nodes in community c
        # sigma_in[c] = sum of internal edge weights in community c
        sigma_tot: Dict[int, float] = {i: k[n] for i, n in enumerate(nodes)}
        sigma_in: Dict[int, float] = {i: 0.0 for i in range(len(nodes))}

        # Compute initial sigma_in (self-loops from adj)
        for n in nodes:
            c = node2comm[n]
            for nb, w in adj[n].items():
                if node2comm.get(nb) == c:
                    sigma_in[c] += w / 2.0  # Each edge counted once

        improved = True
        iteration = 0

        while improved and iteration < max_iter:
            improved = False
            iteration += 1
            order = list(nodes)
            random.shuffle(order)

            for node in order:
                current_comm = node2comm[node]
                k_i = k[node]

                # Compute k_{i,in} for current community
                k_i_in_current = sum(
                    adj[node].get(nb, 0)
                    for nb in nodes
                    if node2comm.get(nb) == current_comm and nb != node
                )

                # Find neighboring communities and their k_{i,in}
                neighbor_comms: Dict[int, float] = {}
                for nb, w in adj[node].items():
                    nc = node2comm.get(nb)
                    if nc is not None and nc != current_comm:
                        neighbor_comms[nc] = neighbor_comms.get(nc, 0) + w

                if not neighbor_comms:
                    continue

                # Modularity gain of REMOVING node from current community
                # ΔQ_remove = -k_{i,in}/m + resolution * σ_tot_C * k_i / (2m²)
                remove_cost = (
                    -k_i_in_current / m
                    + resolution * (sigma_tot[current_comm] - k_i) * k_i / (2.0 * m * m)
                )

                best_comm = current_comm
                best_gain = 0.0

                for target_comm, k_i_in_target in neighbor_comms.items():
                    # Modularity gain of ADDING node to target community
                    # ΔQ_add = k_{i,in_target}/m - resolution * σ_tot_target * k_i / (2m²)
                    add_gain = (
                        k_i_in_target / m
                        - resolution * sigma_tot.get(target_comm, 0) * k_i / (2.0 * m * m)
                    )

                    delta_q = remove_cost + add_gain
                    if delta_q > best_gain:
                        best_gain = delta_q
                        best_comm = target_comm

                if best_comm != current_comm:
                    # Move node: update aggregates
                    sigma_tot[current_comm] -= k_i
                    sigma_tot.setdefault(best_comm, 0)
                    sigma_tot[best_comm] += k_i

                    # Update sigma_in
                    sigma_in[current_comm] -= k_i_in_current
                    k_i_in_best = neighbor_comms.get(best_comm, 0)
                    sigma_in.setdefault(best_comm, 0)
                    sigma_in[best_comm] += k_i_in_best

                    node2comm[node] = best_comm
                    improved = True

        # Normalize community IDs to 0, 1, 2...
        unique_comms = sorted(set(node2comm.values()))
        comm_map = {old: new for new, old in enumerate(unique_comms)}
        normalized = {node: comm_map[c] for node, c in node2comm.items()}

        # Compute final modularity Q for logging
        Q = 0.0
        for node in nodes:
            for nb, w in adj[node].items():
                if normalized.get(node) == normalized.get(nb):
                    Q += w - resolution * k[node] * k.get(nb, 0) / (2.0 * m)
        Q /= (2.0 * m) if m > 0 else 1.0

        logger.info(
            f"[KG] Louvain: {len(unique_comms)} communities from "
            f"{len(nodes)} nodes in {iteration} iterations "
            f"(modularity Q={Q:.4f}, resolution={resolution})"
        )
        return normalized

    # ══════════════════════════════════════════════════════════════
    # Phase 1 Upgrade: Community Naming
    # ══════════════════════════════════════════════════════════════

    def _name_communities(
        self,
        concepts: List[Dict],
        communities: Dict[str, int],
        pagerank: Dict[str, float],
    ) -> Dict[int, str]:
        """
        Auto-name each community based on its highest-PageRank member.

        Returns:
            Dict mapping community_id → human-readable name.
            e.g., {0: "văn hóa", 1: "giáo dục", 2: "lịch sử"}
        """
        if not communities:
            return {}

        # Group concepts by community
        comm_members: Dict[int, List[Tuple[str, float]]] = {}
        for concept_data in concepts:
            name = concept_data["concept"]
            comm_id = communities.get(name)
            if comm_id is None:
                continue
            pr = pagerank.get(name, 0)
            comm_members.setdefault(comm_id, []).append((name, pr))

        # Name each community by its top-ranked member
        cluster_names: Dict[int, str] = {}
        for comm_id, members in comm_members.items():
            members.sort(key=lambda x: x[1], reverse=True)
            top_name = members[0][0] if members else f"Cluster {comm_id}"
            cluster_names[comm_id] = top_name

        logger.info(
            f"[KG] Cluster names: {cluster_names}"
        )
        return cluster_names

    # Keep old Label Propagation as fallback
    def _detect_communities_label_prop(
        self,
        adjacency: Dict[str, List[Tuple[str, float]]],
        max_iter: int = 20,
    ) -> Dict[str, int]:
        """Legacy Label Propagation — kept as fallback."""
        if not adjacency:
            return {}
        labels = {node: i for i, node in enumerate(adjacency)}
        for iteration in range(max_iter):
            changed = False
            nodes = list(adjacency.keys())
            random.shuffle(nodes)
            for node in nodes:
                neighbors = adjacency.get(node, [])
                if not neighbors:
                    continue
                label_weights: Dict[int, float] = Counter()
                for neighbor, weight in neighbors:
                    if neighbor in labels:
                        label_weights[labels[neighbor]] += weight
                if not label_weights:
                    continue
                most_common = max(label_weights, key=label_weights.get)
                if labels[node] != most_common:
                    labels[node] = most_common
                    changed = True
            if not changed:
                break
        unique_labels = sorted(set(labels.values()))
        label_map = {old: new for new, old in enumerate(unique_labels)}
        return {node: label_map[label] for node, label in labels.items()}
