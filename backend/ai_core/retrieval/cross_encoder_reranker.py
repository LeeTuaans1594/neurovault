"""
NEUROVAULT — Cross-Encoder Reranker (White-Box)
Tự build reranker bằng TF-IDF cosine similarity + BM25 score blending.
Không dùng Sentence-Transformers hay bất kỳ ML model nào.

Hybrid Reranking Strategy:
1. TF-IDF Cosine Similarity (semantic relevance)
2. BM25 Score (lexical match)
3. Position Bias (earlier chunks get slight boost)
4. Query-Concept Overlap (concept matching)
"""

import math
import re
from collections import Counter
from typing import List, Dict, Tuple, Optional


class CrossEncoderReranker:
    """
    White-box cross-encoder that scores query-document pairs.
    Uses TF-IDF cross-attention between query and document tokens.
    """

    def __init__(
        self,
        alpha_semantic: float = 0.40,
        alpha_lexical: float = 0.30,
        alpha_position: float = 0.10,
        alpha_concept: float = 0.20,
    ):
        """
        Weights for each signal:
        - alpha_semantic: TF-IDF cosine between query and chunk
        - alpha_lexical: Exact term overlap ratio
        - alpha_position: Position bias (earlier chunks boosted)
        - alpha_concept: Concept overlap between query and chunk concepts
        """
        self.alpha_semantic = alpha_semantic
        self.alpha_lexical = alpha_lexical
        self.alpha_position = alpha_position
        self.alpha_concept = alpha_concept

    def _tokenize(self, text: str) -> List[str]:
        """Simple whitespace + punctuation tokenizer."""
        text = text.lower()
        text = re.sub(r'[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]', ' ', text)
        return [t for t in text.split() if len(t) > 1]

    def _compute_tf(self, tokens: List[str]) -> Dict[str, float]:
        """Term frequency with sublinear scaling: 1 + log(tf)."""
        counts = Counter(tokens)
        tf = {}
        for term, count in counts.items():
            tf[term] = 1.0 + math.log(count) if count > 0 else 0.0
        return tf

    def _compute_idf(self, documents: List[List[str]]) -> Dict[str, float]:
        """Inverse document frequency."""
        n = len(documents)
        df = Counter()
        for doc in documents:
            unique_terms = set(doc)
            for term in unique_terms:
                df[term] += 1
        idf = {}
        for term, freq in df.items():
            idf[term] = math.log((n + 1) / (freq + 1)) + 1.0
        return idf

    def _cosine_similarity(self, vec_a: Dict[str, float], vec_b: Dict[str, float]) -> float:
        """Cosine similarity between two sparse TF-IDF vectors."""
        common_terms = set(vec_a.keys()) & set(vec_b.keys())
        if not common_terms:
            return 0.0

        dot_product = sum(vec_a[t] * vec_b[t] for t in common_terms)
        mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
        mag_b = math.sqrt(sum(v * v for v in vec_b.values()))

        if mag_a == 0 or mag_b == 0:
            return 0.0

        return dot_product / (mag_a * mag_b)

    def _lexical_overlap(self, query_tokens: List[str], chunk_tokens: List[str]) -> float:
        """Ratio of query tokens found in chunk."""
        if not query_tokens:
            return 0.0
        query_set = set(query_tokens)
        chunk_set = set(chunk_tokens)
        overlap = len(query_set & chunk_set)
        return overlap / len(query_set)

    def _position_score(self, position: int, total_chunks: int) -> float:
        """Earlier chunks get slight preference (introduction bias)."""
        if total_chunks <= 1:
            return 1.0
        # Decay: first chunk = 1.0, last chunk = 0.5
        return 1.0 - 0.5 * (position / (total_chunks - 1))

    def _concept_overlap(self, query_tokens: List[str], chunk_concepts: List[str]) -> float:
        """Check if query mentions any chunk concepts."""
        if not chunk_concepts:
            return 0.0
        query_lower = set(t.lower() for t in query_tokens)
        matches = 0
        for concept in chunk_concepts:
            concept_tokens = set(concept.lower().split())
            if concept_tokens & query_lower:
                matches += 1
        return min(1.0, matches / max(1, len(chunk_concepts)))

    def rerank(
        self,
        query: str,
        chunks: List[Dict],
        top_k: int = 5,
    ) -> List[Dict]:
        """
        Rerank chunks by computing cross-encoder scores.

        Args:
            query: User's search query
            chunks: List of chunk dicts with 'text', 'position', 'concepts'
            top_k: Number of top results to return

        Returns:
            Top-k chunks sorted by combined score, with 'rerank_score' added
        """
        if not chunks:
            return []

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return chunks[:top_k]

        # Tokenize all chunks
        all_chunk_tokens = [self._tokenize(c.get("text", "")) for c in chunks]

        # Build IDF from all chunks + query
        all_docs = all_chunk_tokens + [query_tokens]
        idf = self._compute_idf(all_docs)

        # Build query TF-IDF vector
        query_tf = self._compute_tf(query_tokens)
        query_tfidf = {t: query_tf.get(t, 0) * idf.get(t, 0) for t in query_tokens}

        total_chunks = len(chunks)
        scored_chunks = []

        for i, chunk in enumerate(chunks):
            tokens = all_chunk_tokens[i]

            # Signal 1: TF-IDF Cosine Similarity
            chunk_tf = self._compute_tf(tokens)
            chunk_tfidf = {t: chunk_tf.get(t, 0) * idf.get(t, 0) for t in tokens}
            semantic_score = self._cosine_similarity(query_tfidf, chunk_tfidf)

            # Signal 2: Lexical Overlap
            lexical_score = self._lexical_overlap(query_tokens, tokens)

            # Signal 3: Position Bias
            position = chunk.get("position", i)
            position_score = self._position_score(position, total_chunks)

            # Signal 4: Concept Overlap
            concepts = chunk.get("concepts", [])
            concept_score = self._concept_overlap(query_tokens, concepts)

            # Combined score
            combined = (
                self.alpha_semantic * semantic_score
                + self.alpha_lexical * lexical_score
                + self.alpha_position * position_score
                + self.alpha_concept * concept_score
            )

            scored_chunk = {**chunk, "rerank_score": round(combined, 4)}
            scored_chunks.append(scored_chunk)

        # Sort by combined score descending
        scored_chunks.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored_chunks[:top_k]
