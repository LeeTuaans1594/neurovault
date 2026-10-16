"""
NEUROVAULT — Vector Store (White-Box)
In-memory vector search sử dụng brute-force cosine similarity.
Tự implement, không dùng FAISS hay Pinecone.
"""

import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field


@dataclass
class VectorEntry:
    """Một entry trong vector store."""
    id: str
    vector: np.ndarray
    metadata: Dict = field(default_factory=dict)


class VectorStore:
    """
    In-memory vector store với cosine similarity search.
    Hỗ trợ: add, search, delete, batch operations.
    """

    def __init__(self, dim: int = 128):
        self.dim = dim
        self.entries: List[VectorEntry] = []
        self._id_map: Dict[str, int] = {}  # id → index

    def add(self, id: str, vector: List[float], metadata: Dict = None) -> None:
        """Add a vector to the store."""
        vec = np.array(vector, dtype=np.float32)
        if vec.shape[0] != self.dim:
            raise ValueError(f"Vector dim {vec.shape[0]} != store dim {self.dim}")

        # Normalize for cosine similarity
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        if id in self._id_map:
            # Update existing
            idx = self._id_map[id]
            self.entries[idx] = VectorEntry(id=id, vector=vec, metadata=metadata or {})
        else:
            self._id_map[id] = len(self.entries)
            self.entries.append(VectorEntry(id=id, vector=vec, metadata=metadata or {}))

    def add_batch(self, ids: List[str], vectors: List[List[float]], metadatas: List[Dict] = None) -> None:
        """Add multiple vectors."""
        if metadatas is None:
            metadatas = [{}] * len(ids)
        for id_, vec, meta in zip(ids, vectors, metadatas):
            self.add(id_, vec, meta)

    def search(self, query_vector: List[float], top_k: int = 10) -> List[Tuple[str, float, Dict]]:
        """Search for most similar vectors. Returns list of (id, score, metadata)."""
        if not self.entries:
            return []

        q = np.array(query_vector, dtype=np.float32)
        norm = np.linalg.norm(q)
        if norm > 0:
            q = q / norm

        # Build matrix for vectorized computation
        matrix = np.array([e.vector for e in self.entries], dtype=np.float32)
        
        # Cosine similarity = dot product (vectors already normalized)
        scores = matrix @ q

        # Get top-k indices
        k = min(top_k, len(self.entries))
        top_indices = np.argpartition(scores, -k)[-k:]
        top_indices = top_indices[np.argsort(scores[top_indices])[::-1]]

        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                entry = self.entries[idx]
                results.append((entry.id, float(scores[idx]), entry.metadata))

        return results

    def delete(self, id: str) -> bool:
        """Delete entry by id."""
        if id not in self._id_map:
            return False
        idx = self._id_map[id]
        self.entries.pop(idx)
        # Rebuild index map
        self._id_map = {e.id: i for i, e in enumerate(self.entries)}
        return True

    def size(self) -> int:
        return len(self.entries)

    def clear(self) -> None:
        self.entries.clear()
        self._id_map.clear()
