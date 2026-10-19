"""Core domain entities for the v2 Document Intelligence pipeline.

Pure data models — no I/O, no framework imports besides pydantic for (de)serialisation.
A document flows:  file → DocumentAST (sections + blocks) → Chunk[] → Concept[] → Tree / SemanticEdge[]
                   → Artifact (exercises, summary, notes, outline, glossary) with Evidence citations.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Iterator, Literal, Optional

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    """UTC now, truncated to milliseconds (BSON datetime precision) so Mongo round-trips are exact."""
    now = datetime.now(timezone.utc)
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)


class BlockType(str, Enum):
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE = "table"
    CAPTION = "caption"
    CODE = "code"


class Block(BaseModel):
    """Smallest content unit inside a section (a paragraph, a table, ...)."""

    block_id: str
    type: BlockType = BlockType.PARAGRAPH
    text: str
    page: Optional[int] = None


class SectionNode(BaseModel):
    """A heading and everything under it. The root node has level 0 and no title."""

    section_id: str
    title: str = ""
    level: int = 0
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    blocks: list[Block] = Field(default_factory=list)
    children: list["SectionNode"] = Field(default_factory=list)

    def walk(self, path: tuple[str, ...] = ()) -> Iterator[tuple["SectionNode", tuple[str, ...]]]:
        """Depth-first walk yielding (section, path_of_titles_from_root)."""
        here = path + ((self.title,) if self.title else ())
        yield self, here
        for child in self.children:
            yield from child.walk(here)


class DocumentAST(BaseModel):
    """Structured representation of one uploaded document."""

    document_id: str
    title: str = ""
    language: str = "unknown"
    source_format: Literal["pdf", "docx", "txt", "md"] = "txt"
    page_count: int = 1
    root: SectionNode
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)

    def sections(self) -> list[SectionNode]:
        return [s for s, _ in self.root.walk() if s.level > 0]

    def headings(self) -> list[dict]:
        return [{"text": s.title, "level": s.level, "page": s.page_start} for s in self.sections()]


class Evidence(BaseModel):
    """Where a claim/relation comes from — used for citations."""

    document_id: str
    chunk_id: Optional[str] = None
    page: Optional[int] = None
    section_path: list[str] = Field(default_factory=list)
    quote: str = ""


class Chunk(BaseModel):
    """Retrieval unit. Never crosses a section boundary."""

    chunk_id: str
    document_id: str
    text: str
    section_id: str
    section_path: list[str] = Field(default_factory=list)
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    position: int = 0
    token_count: int = 0
    language: str = "unknown"


class Concept(BaseModel):
    concept_id: str
    document_id: str
    name: str
    normalized: str
    score: float = 0.0
    frequency: int = 0
    section_ids: list[str] = Field(default_factory=list)
    definition: Optional[str] = None
    evidence: list[Evidence] = Field(default_factory=list)


class TreeNode(BaseModel):
    """Deterministic knowledge tree: document → sections → concepts."""

    node_id: str
    label: str
    kind: Literal["document", "section", "concept"]
    section_id: Optional[str] = None
    children: list["TreeNode"] = Field(default_factory=list)


class SemanticEdge(BaseModel):
    source: str
    target: str
    relation_type: str  # e.g. is_a, part_of, prerequisite_of, causes, used_for, contrasts_with
    confidence: float = 0.0
    evidence: Optional[Evidence] = None


ArtifactKind = Literal["exercises", "summary", "notes", "outline", "glossary"]


class Artifact(BaseModel):
    """A generated learning document, always grounded in the selected source documents."""

    artifact_id: str
    kind: ArtifactKind
    document_ids: list[str]
    language: str
    title: str = ""
    content_md: str = ""
    citations: list[Evidence] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utcnow)


SectionNode.model_rebuild()
TreeNode.model_rebuild()
