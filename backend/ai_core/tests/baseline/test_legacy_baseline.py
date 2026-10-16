"""Baseline: run the legacy pipeline on fixtures and record its known weaknesses.

These tests document *current* behaviour. When v2 replaces a component, the matching
assertion here is expected to be revisited (the v2 suite asserts the improved targets).
"""

import json
from pathlib import Path

import pytest

from evaluation.adapters import LegacyAdapter
from evaluation.metrics import evaluate

pytestmark = pytest.mark.baseline
FIX = Path(__file__).resolve().parents[1] / "fixtures"


@pytest.fixture(scope="module")
def results(client):
    adapter = LegacyAdapter(client)
    out = {}
    for gp in sorted((FIX / "gold").glob("*.json")):
        gold = json.loads(gp.read_text(encoding="utf-8"))
        out[gold["name"]] = evaluate(adapter.run(FIX / "docs" / gold["file"]), gold)
    return out


def test_legacy_keeps_heading_text_but_no_structure(results):
    for r in results.values():
        assert r["heading_text_recall"] == 1.0
        assert r["heading_detect_recall"] == 0.0


def test_legacy_has_no_page_or_section_attribution(results):
    for r in results.values():
        assert r["page_attribution_rate"] == 0.0
        assert r["section_path_rate"] == 0.0


def test_legacy_chunks_cross_sections(results):
    for r in results.values():
        assert r["cross_section_chunk_rate"] > 0.5


def test_legacy_breaks_vietnamese_compounds(results):
    vi = results["vi_hoc_may"]
    assert vi["compound_integrity"] < 0.5
    assert vi["fragment_rate@20"] > 0.2


def test_legacy_graph_edges_are_generic_and_unevidenced(results):
    for r in results.values():
        assert r["generic_edge_rate"] > 0.9
        assert r["edge_evidence_rate"] == 0.0
