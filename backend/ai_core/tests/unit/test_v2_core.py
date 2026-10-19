"""Unit tests for domain entities, LLM fallback and the Qdrant adapter (in-memory)."""

import pytest

from domain.entities import Block, Chunk, DocumentAST, SectionNode
from domain.ports import LLMResult, LLMUnavailableError
from infrastructure.llm.providers import FallbackLLM
from infrastructure.vector.qdrant_store import QdrantVectorStore


def _ast() -> DocumentAST:
    root = SectionNode(section_id="root", children=[
        SectionNode(section_id="s1", title="Chương 1", level=1, page_start=1, children=[
            SectionNode(section_id="s1.1", title="1.1 Học sâu", level=2, page_start=2,
                        blocks=[Block(block_id="b1", text="Học sâu ...", page=2)]),
        ]),
    ])
    return DocumentAST(document_id="d1", title="T", language="vi", source_format="docx", root=root)


def test_ast_walk_and_headings():
    ast = _ast()
    assert [s.section_id for s in ast.sections()] == ["s1", "s1.1"]
    assert ast.headings()[1] == {"text": "1.1 Học sâu", "level": 2, "page": 2}
    paths = {s.section_id: p for s, p in ast.root.walk()}
    assert paths["s1.1"] == ("Chương 1", "1.1 Học sâu")


def test_ast_json_roundtrip():
    ast = _ast()
    again = DocumentAST.model_validate_json(ast.model_dump_json())
    assert again == ast


class _Fake:
    def __init__(self, name, fail=False):
        self.name, self.fail, self.calls = name, fail, 0

    def generate(self, prompt, **kw):
        self.calls += 1
        if self.fail:
            raise LLMUnavailableError(f"{self.name} down")
        return LLMResult(text=f"{self.name}:{prompt}", provider=self.name, model="m")

    def is_available(self):
        return not self.fail


def test_fallback_uses_next_provider_on_unavailable():
    a, b = _Fake("a", fail=True), _Fake("b")
    res = FallbackLLM([a, b]).generate("hi")
    assert res.provider == "b" and a.calls == 1 and b.calls == 1


def test_fallback_raises_when_all_fail():
    with pytest.raises(LLMUnavailableError):
        FallbackLLM([_Fake("a", True), _Fake("b", True)]).generate("hi")


def _chunk(cid, doc):
    return Chunk(chunk_id=cid, document_id=doc, text=cid, section_id="s")


def test_qdrant_scope_filter_and_delete():
    vs = QdrantVectorStore(None, "t", location=":memory:")
    vs.upsert([_chunk("a1", "A"), _chunk("b1", "B")], [[1.0, 0.0, 0.0], [0.9, 0.1, 0.0]])
    assert {h.chunk_id for h in vs.search([1, 0, 0], top_k=5)} == {"a1", "b1"}
    assert [h.chunk_id for h in vs.search([1, 0, 0], document_ids=["B"])] == ["b1"]
    vs.delete_document("A")
    assert vs.count() == 1 and vs.count("A") == 0
