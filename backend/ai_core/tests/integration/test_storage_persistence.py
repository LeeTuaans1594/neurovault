"""Stage 3 gate: v2 storage survives a restart and never writes pickle files.

- Qdrant (embedded, on disk) runs everywhere, including CI.
- MongoDB part is skipped automatically when no server is reachable.
"""

import uuid

import pytest

from domain.entities import Artifact, Block, Chunk, Concept, DocumentAST, Evidence, SectionNode, SemanticEdge
from infrastructure.vector.qdrant_store import QdrantVectorStore


def _sample(doc_id: str):
    ast = DocumentAST(document_id=doc_id, title="Nhập môn", language="vi", source_format="pdf", page_count=3,
                      root=SectionNode(section_id="root", children=[
                          SectionNode(section_id="s1", title="Chương 1", level=1, page_start=1,
                                      blocks=[Block(block_id="b1", text="Học máy là ...", page=1)])]))
    chunks = [Chunk(chunk_id=f"{doc_id}-c{i}", document_id=doc_id, text=f"đoạn {i}", section_id="s1",
                    section_path=["Chương 1"], page_start=1, page_end=1, position=i) for i in range(3)]
    concepts = [Concept(concept_id=f"{doc_id}-k1", document_id=doc_id, name="học máy", normalized="học máy",
                        score=0.9, evidence=[Evidence(document_id=doc_id, chunk_id=chunks[0].chunk_id, page=1,
                                                      quote="Học máy là ...")])]
    edges = [SemanticEdge(source="học sâu", target="học máy", relation_type="is_a", confidence=0.8,
                          evidence=Evidence(document_id=doc_id, page=1, quote="..."))]
    art = Artifact(artifact_id=f"{doc_id}-a1", kind="summary", document_ids=[doc_id], language="vi",
                   content_md="# Tóm tắt")
    return ast, chunks, concepts, edges, art


def test_qdrant_persists_across_reopen(tmp_path):
    path = tmp_path / "qdrant"
    c = [Chunk(chunk_id="x1", document_id="D", text="t", section_id="s", page_start=4)]
    vs = QdrantVectorStore(path, "chunks_test")
    vs.upsert(c, [[0.1, 0.2, 0.3, 0.4]])
    vs.close()

    vs2 = QdrantVectorStore(path, "chunks_test")
    hits = vs2.search([0.1, 0.2, 0.3, 0.4], top_k=1, document_ids=["D"])
    assert hits and hits[0].chunk_id == "x1" and hits[0].payload["page_start"] == 4
    vs2.close()
    assert not list(tmp_path.rglob("*.pkl"))


@pytest.fixture
def mongo_repo_factory():
    pymongo = pytest.importorskip("pymongo")
    from infrastructure.persistence.repositories import MongoDocumentRepository

    uri, db = "mongodb://127.0.0.1:27017", f"nv_test_{uuid.uuid4().hex[:8]}"
    try:
        pymongo.MongoClient(uri, serverSelectionTimeoutMS=1500).admin.command("ping")
    except Exception:
        pytest.skip("MongoDB not reachable")
    repos = []

    def make():
        r = MongoDocumentRepository(uri, db)
        repos.append(r)
        return r

    yield make
    pymongo.MongoClient(uri).drop_database(db)
    for r in repos:
        r.close()


@pytest.mark.integration
def test_mongo_repository_persists_across_reopen(mongo_repo_factory, tmp_path):
    ast, chunks, concepts, edges, art = _sample("doc1")
    repo = mongo_repo_factory()
    repo.save_ast(ast)
    repo.save_chunks("doc1", chunks)
    repo.save_concepts("doc1", concepts)
    repo.save_edges("doc1", edges)
    repo.save_artifact(art)
    repo.close()

    repo2 = mongo_repo_factory()  # brand-new connection = simulated restart
    assert repo2.get_ast("doc1") == ast
    assert repo2.get_chunks(["doc1"]) == chunks
    assert repo2.get_concepts(["doc1"]) == concepts
    assert repo2.get_edges(["doc1"]) == edges
    assert repo2.get_artifact("doc1-a1").content_md == "# Tóm tắt"

    repo2.delete_document("doc1")
    assert repo2.get_ast("doc1") is None and repo2.get_chunks(["doc1"]) == []
    assert not list(tmp_path.rglob("*.pkl"))
