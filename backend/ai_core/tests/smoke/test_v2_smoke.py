"""Smoke: v2 router is mounted and answers with the standard envelope."""


def test_v2_health_envelope(client):
    r = client.get("/api/v2/health")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"success", "data", "error", "meta"}
    assert body["success"] is True
    assert set(body["data"]["checks"]) == {"mongo", "vector_store", "embeddings", "llm"}
    assert "ready" in body["meta"]


def test_legacy_routes_still_mounted(client):
    paths = {r.path for r in client.app.routes}
    assert {"/api/process", "/api/knowledge-graph", "/api/v2/health"} <= paths
