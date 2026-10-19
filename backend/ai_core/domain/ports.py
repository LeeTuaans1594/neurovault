"""Ports (interfaces) the application layer depends on. Infrastructure provides adapters.

Keeping these as Protocols lets use cases run against in-memory fakes in tests and against
MongoDB / Qdrant / Ollama / Gemini in production, without code changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol, Sequence, runtime_checkable

from domain.entities import Artifact, Chunk, Concept, DocumentAST, SemanticEdge


class LLMUnavailableError(RuntimeError):
    """Provider cannot serve the request now (quota, network, model missing)."""


@runtime_checkable
class DocumentRepository(Protocol):
    def save_ast(self, ast: DocumentAST) -> None: ...
    def get_ast(self, document_id: str) -> Optional[DocumentAST]: ...
    def save_chunks(self, document_id: str, chunks: Sequence[Chunk]) -> None: ...
    def get_chunks(self, document_ids: Sequence[str]) -> list[Chunk]: ...
    def save_concepts(self, document_id: str, concepts: Sequence[Concept]) -> None: ...
    def get_concepts(self, document_ids: Sequence[str]) -> list[Concept]: ...
    def save_edges(self, document_id: str, edges: Sequence[SemanticEdge]) -> None: ...
    def get_edges(self, document_ids: Sequence[str]) -> list[SemanticEdge]: ...
    def save_artifact(self, artifact: Artifact) -> None: ...
    def get_artifact(self, artifact_id: str) -> Optional[Artifact]: ...
    def delete_document(self, document_id: str) -> None: ...
    def ping(self) -> bool: ...


@dataclass
class VectorHit:
    chunk_id: str
    score: float
    payload: dict = field(default_factory=dict)


@runtime_checkable
class VectorStore(Protocol):
    def upsert(self, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]]) -> None: ...
    def search(self, vector: Sequence[float], top_k: int = 8,
               document_ids: Optional[Sequence[str]] = None) -> list[VectorHit]: ...
    def delete_document(self, document_id: str) -> None: ...
    def count(self, document_id: Optional[str] = None) -> int: ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    model: str

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...
    def is_available(self) -> bool: ...


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    def generate(self, prompt: str, *, system: Optional[str] = None, json_mode: bool = False,
                 temperature: float = 0.2, max_tokens: int = 2048) -> LLMResult: ...
    def is_available(self) -> bool: ...
