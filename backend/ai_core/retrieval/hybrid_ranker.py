"""
NEUROVAULT — Hybrid Ranker (White-Box)
Kết hợp BM25 (sparse) + Vector Search (dense) bằng Reciprocal Rank Fusion.
"""

from typing import List, Dict, Tuple


class HybridRanker:
    """
    Hybrid Retrieval: Dense + Sparse kết hợp bằng RRF.
    
    RRF Score = Σ 1 / (k + rank_i)
    k = smoothing constant (default 60)
    """

    def __init__(self, k: int = 60, dense_weight: float = 0.6, sparse_weight: float = 0.4):
        self.k = k
        self.dense_weight = dense_weight
        self.sparse_weight = sparse_weight

    def fuse(
        self,
        dense_results: List[Tuple[str, float]],
        sparse_results: List[Tuple[str, float]],
        top_k: int = 10,
    ) -> List[Tuple[str, float]]:
        """
        Fuse dense + sparse results using Reciprocal Rank Fusion.
        
        Args:
            dense_results: [(chunk_id, score), ...] sorted by score desc
            sparse_results: [(chunk_id, score), ...] sorted by score desc
            top_k: number of results to return
            
        Returns:
            [(chunk_id, fused_score), ...] sorted by fused_score desc
        """
        rrf_scores: Dict[str, float] = {}

        # RRF from dense results
        for rank, (chunk_id, _score) in enumerate(dense_results):
            rrf = self.dense_weight / (self.k + rank + 1)
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0) + rrf

        # RRF from sparse results
        for rank, (chunk_id, _score) in enumerate(sparse_results):
            rrf = self.sparse_weight / (self.k + rank + 1)
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0) + rrf

        # Sort by fused score
        sorted_results = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_results[:top_k]

    def rerank_with_scores(
        self,
        dense_results: List[Tuple[str, float]],
        sparse_results: List[Tuple[str, float]],
        chunk_texts: Dict[str, str],
        query: str,
        top_k: int = 10,
    ) -> List[Dict]:
        """
        Full reranking pipeline with chunk text included.
        Returns list of dicts with id, score, text.
        """
        fused = self.fuse(dense_results, sparse_results, top_k=top_k * 2)

        results = []
        for chunk_id, score in fused[:top_k]:
            results.append({
                "chunk_id": chunk_id,
                "score": round(score, 6),
                "text": chunk_texts.get(chunk_id, ""),
            })

        return results
