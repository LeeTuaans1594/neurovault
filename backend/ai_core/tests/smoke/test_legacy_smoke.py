"""Smoke tests for the legacy AI Core.

They pin the current behaviour so every refactoring stage can prove it did not
break the existing pipeline (and so `PIPELINE_VERSION=legacy` stays a valid rollback).
"""

from fastapi.testclient import TestClient


def test_health_endpoint_reports_ok(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["pipeline_version"] in ("legacy", "v2")


def test_process_and_chat_retrieval_on_text_file(client: TestClient, tmp_path):
    doc = tmp_path / "sample.txt"
    doc.write_text(
        "# Machine Learning\n\n"
        "Machine learning is a field of artificial intelligence. "
        "Supervised learning uses labelled data to train a model. "
        "Unsupervised learning finds structure in unlabelled data. "
        "Reinforcement learning trains an agent with rewards. "
        "Neural networks are models inspired by the brain. "
        "Gradient descent optimises the parameters of a neural network.",
        encoding="utf-8",
    )
    resp = client.post("/api/process", json={"document_id": "smoke-doc", "file_path": str(doc)})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["word_count"] > 0
    assert len(body["chunks"]) >= 1

    graph = client.post("/api/knowledge-graph", json={"document_id": "smoke-doc", "file_path": ""})
    assert graph.status_code == 200
    assert "nodes" in graph.json()["graph"]
