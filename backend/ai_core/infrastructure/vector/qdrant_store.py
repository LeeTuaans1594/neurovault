"""Qdrant vector store in embedded (on-disk, serverless) mode."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional, Sequence

from domain.entities import Chunk
from domain.ports import VectorHit

_NS = uuid.UUID("6f1c2b52-3a4e-4d1a-9f57-6e0f2a9d7c11")


def _point_id(chunk_id: str) -> str:
    return str(uuid.uuid5(_NS, chunk_id))


class QdrantVectorStore:
    def __init__(self, path: Optional[Path], collection: str, location: Optional[str] = None) -> None:
        from qdrant_client import QdrantClient

        if location == ":memory:":
            self._client = QdrantClient(location=":memory:")
        else:
            Path(path).mkdir(parents=True, exist_ok=True)
            self._client = QdrantClient(path=str(path))
        self._collection = collection
        self._dim: Optional[int] = None
        if self._client.collection_exists(collection):
            info = self._client.get_collection(collection)
            self._dim = info.config.params.vectors.size

    def _ensure(self, dim: int) -> None:
        from qdrant_client import models as m

        if self._dim is None:
            self._client.create_collection(
                self._collection, vectors_config=m.VectorParams(size=dim, distance=m.Distance.COSINE)
            )
            self._client.create_payload_index(self._collection, "document_id", m.PayloadSchemaType.KEYWORD)
            self._dim = dim
        elif self._dim != dim:
            raise ValueError(f"Embedding dim {dim} != collection dim {self._dim}")

    def upsert(self, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]]) -> None:
        from qdrant_client import models as m

        if not chunks:
            return
        if len(chunks) != len(vectors):
            raise ValueError("chunks and vectors length mismatch")
        self._ensure(len(vectors[0]))
        points = [
            m.PointStruct(
                id=_point_id(c.chunk_id),
                vector=list(v),
                payload={"chunk_id": c.chunk_id, "document_id": c.document_id,
                         "section_path": c.section_path, "page_start": c.page_start,
                         "position": c.position},
            )
            for c, v in zip(chunks, vectors)
        ]
        self._client.upsert(self._collection, points=points, wait=True)

    def _doc_filter(self, document_ids: Optional[Sequence[str]]):
        from qdrant_client import models as m

        if not document_ids:
            return None
        return m.Filter(must=[m.FieldCondition(key="document_id", match=m.MatchAny(any=list(document_ids)))])

    def search(self, vector: Sequence[float], top_k: int = 8,
               document_ids: Optional[Sequence[str]] = None) -> list[VectorHit]:
        if self._dim is None:
            return []
        res = self._client.query_points(self._collection, query=list(vector), limit=top_k,
                                        query_filter=self._doc_filter(document_ids), with_payload=True)
        return [VectorHit(chunk_id=p.payload["chunk_id"], score=float(p.score), payload=dict(p.payload))
                for p in res.points]

    def delete_document(self, document_id: str) -> None:
        from qdrant_client import models as m

        if self._dim is None:
            return
        self._client.delete(self._collection, points_selector=m.FilterSelector(
            filter=self._doc_filter([document_id])), wait=True)

    def count(self, document_id: Optional[str] = None) -> int:
        if self._dim is None:
            return 0
        flt = self._doc_filter([document_id]) if document_id else None
        return self._client.count(self._collection, count_filter=flt, exact=True).count

    def close(self) -> None:
        self._client.close()
