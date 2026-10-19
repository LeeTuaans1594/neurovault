"""Document repositories: MongoDB (production) and in-memory (tests / offline)."""

from __future__ import annotations

from collections import defaultdict
from typing import Optional, Sequence

from domain.entities import Artifact, Chunk, Concept, DocumentAST, SemanticEdge


class InMemoryDocumentRepository:
    def __init__(self) -> None:
        self._ast: dict[str, DocumentAST] = {}
        self._chunks: dict[str, list[Chunk]] = defaultdict(list)
        self._concepts: dict[str, list[Concept]] = defaultdict(list)
        self._edges: dict[str, list[SemanticEdge]] = defaultdict(list)
        self._artifacts: dict[str, Artifact] = {}

    def save_ast(self, ast: DocumentAST) -> None:
        self._ast[ast.document_id] = ast.model_copy(deep=True)

    def get_ast(self, document_id: str) -> Optional[DocumentAST]:
        return self._ast.get(document_id)

    def save_chunks(self, document_id: str, chunks: Sequence[Chunk]) -> None:
        self._chunks[document_id] = list(chunks)

    def get_chunks(self, document_ids: Sequence[str]) -> list[Chunk]:
        return [c for d in document_ids for c in self._chunks.get(d, [])]

    def save_concepts(self, document_id: str, concepts: Sequence[Concept]) -> None:
        self._concepts[document_id] = list(concepts)

    def get_concepts(self, document_ids: Sequence[str]) -> list[Concept]:
        return [c for d in document_ids for c in self._concepts.get(d, [])]

    def save_edges(self, document_id: str, edges: Sequence[SemanticEdge]) -> None:
        self._edges[document_id] = list(edges)

    def get_edges(self, document_ids: Sequence[str]) -> list[SemanticEdge]:
        return [e for d in document_ids for e in self._edges.get(d, [])]

    def save_artifact(self, artifact: Artifact) -> None:
        self._artifacts[artifact.artifact_id] = artifact

    def get_artifact(self, artifact_id: str) -> Optional[Artifact]:
        return self._artifacts.get(artifact_id)

    def delete_document(self, document_id: str) -> None:
        for store in (self._ast, self._chunks, self._concepts, self._edges):
            store.pop(document_id, None)

    def ping(self) -> bool:
        return True


class MongoDocumentRepository:
    """Collections: doc_ast, chunks, concepts, edges, artifacts (all keyed by document_id)."""

    def __init__(self, uri: str, db_name: str, timeout_ms: int = 3000) -> None:
        from pymongo import ASCENDING, MongoClient

        self._client = MongoClient(uri, serverSelectionTimeoutMS=timeout_ms, tz_aware=True)
        self._db = self._client[db_name]
        self._db.chunks.create_index([("document_id", ASCENDING), ("position", ASCENDING)])
        self._db.concepts.create_index([("document_id", ASCENDING), ("score", ASCENDING)])
        self._db.edges.create_index([("document_id", ASCENDING)])
        self._db.artifacts.create_index([("document_ids", ASCENDING)])

    # -- helpers --
    @staticmethod
    def _dump(model) -> dict:
        return model.model_dump(mode="python")

    def _replace_many(self, coll: str, document_id: str, docs: list[dict]) -> None:
        self._db[coll].delete_many({"document_id": document_id})
        if docs:
            self._db[coll].insert_many(docs)

    # -- AST --
    def save_ast(self, ast: DocumentAST) -> None:
        doc = self._dump(ast)
        doc["_id"] = ast.document_id
        self._db.doc_ast.replace_one({"_id": ast.document_id}, doc, upsert=True)

    def get_ast(self, document_id: str) -> Optional[DocumentAST]:
        doc = self._db.doc_ast.find_one({"_id": document_id}, {"_id": 0})
        return DocumentAST.model_validate(doc) if doc else None

    # -- chunks --
    def save_chunks(self, document_id: str, chunks: Sequence[Chunk]) -> None:
        self._replace_many("chunks", document_id, [self._dump(c) for c in chunks])

    def get_chunks(self, document_ids: Sequence[str]) -> list[Chunk]:
        cur = self._db.chunks.find({"document_id": {"$in": list(document_ids)}}, {"_id": 0})
        return [Chunk.model_validate(d) for d in cur.sort([("document_id", 1), ("position", 1)])]

    # -- concepts --
    def save_concepts(self, document_id: str, concepts: Sequence[Concept]) -> None:
        self._replace_many("concepts", document_id, [self._dump(c) for c in concepts])

    def get_concepts(self, document_ids: Sequence[str]) -> list[Concept]:
        cur = self._db.concepts.find({"document_id": {"$in": list(document_ids)}}, {"_id": 0})
        return [Concept.model_validate(d) for d in cur.sort("score", -1)]

    # -- edges --
    def save_edges(self, document_id: str, edges: Sequence[SemanticEdge]) -> None:
        self._replace_many("edges", document_id,
                           [{**self._dump(e), "document_id": document_id} for e in edges])

    def get_edges(self, document_ids: Sequence[str]) -> list[SemanticEdge]:
        cur = self._db.edges.find({"document_id": {"$in": list(document_ids)}}, {"_id": 0, "document_id": 0})
        return [SemanticEdge.model_validate(d) for d in cur]

    # -- artifacts --
    def save_artifact(self, artifact: Artifact) -> None:
        doc = self._dump(artifact)
        doc["_id"] = artifact.artifact_id
        self._db.artifacts.replace_one({"_id": artifact.artifact_id}, doc, upsert=True)

    def get_artifact(self, artifact_id: str) -> Optional[Artifact]:
        doc = self._db.artifacts.find_one({"_id": artifact_id}, {"_id": 0})
        return Artifact.model_validate(doc) if doc else None

    # -- misc --
    def delete_document(self, document_id: str) -> None:
        self._db.doc_ast.delete_one({"_id": document_id})
        for coll in ("chunks", "concepts", "edges"):
            self._db[coll].delete_many({"document_id": document_id})

    def ping(self) -> bool:
        try:
            self._client.admin.command("ping")
            return True
        except Exception:
            return False

    def close(self) -> None:
        self._client.close()
