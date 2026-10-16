"""Unit tests for evaluation metrics (pure functions, no pipeline needed)."""

from evaluation.metrics import (
    chunk_metrics,
    concept_metrics,
    graph_metrics,
    heading_metrics,
    is_fragment,
    norm,
    reading_order_ok,
    same_term,
)

GOLD = {
    "name": "t",
    "language": "vi",
    "headings": [{"text": "Chương 1. Học máy", "level": 1}, {"text": "1.1. Học sâu", "level": 2}],
    "sections": [
        {"heading": "Chương 1. Học máy", "body": ["Học máy là một nhánh của trí tuệ nhân tạo."], "page": 1},
        {"heading": "1.1. Học sâu", "body": ["Học sâu dùng mạng nơ-ron nhiều lớp."], "page": 2},
    ],
    "concepts": ["học máy", "học sâu", "trí tuệ nhân tạo", "mạng nơ-ron"],
    "compounds": ["học máy", "trí tuệ nhân tạo", "mạng nơ-ron"],
    "reading_order": {"before": "nhánh của", "after": "nhiều lớp"},
}


def test_norm_unifies_tone_placement_and_underscores():
    assert norm("Chính quy hóa") == norm("chính_quy_hoá")


def test_same_term_singularises_english():
    assert same_term("postings lists", "postings list", "en")
    assert not same_term("class", "cla", "en")


def test_heading_metrics_detects_structure_and_level():
    out = {"raw_text": "Chương 1. Học máy ... 1.1. Học sâu",
           "headings": [{"text": "Học máy", "level": 1}, {"text": "1.1 Học sâu", "level": 3}]}
    m = heading_metrics(out, GOLD)
    assert m["heading_text_recall"] == 1.0
    assert m["heading_detect_recall"] == 1.0
    assert m["heading_level_accuracy"] == 0.5


def test_chunk_metrics_cross_section_and_pages():
    out = {"chunks": [
        {"text": GOLD["sections"][0]["body"][0] + " " + GOLD["sections"][1]["body"][0], "page": None},
        {"text": GOLD["sections"][1]["body"][0], "page": 2, "section_path": ["Chương 1", "1.1"]},
    ]}
    m = chunk_metrics(out, GOLD)
    assert m["cross_section_chunk_rate"] == 0.5
    assert m["page_attribution_rate"] == 0.5
    assert m["page_accuracy"] == 1.0
    assert m["section_path_rate"] == 0.5


def test_fragment_detection():
    comps = GOLD["compounds"]
    assert is_fragment("tuệ nhân", comps)          # proper piece
    assert is_fragment("máy là", comps)             # cuts across boundary
    assert not is_fragment("học máy", comps)        # intact
    assert not is_fragment("ứng dụng học máy", comps)  # contains intact compound


def test_concept_metrics():
    out = {"concepts": ["học máy", "tuệ nhân", "học sâu", "bài toán"]}
    m = concept_metrics(out, GOLD)
    assert m["concept_precision@10"] == 0.5
    assert m["compound_integrity"] == round(1 / 3, 4)
    assert m["fragment_rate@20"] == 0.25


def test_graph_metrics_generic_and_evidence():
    out = {"graph": {"nodes": [{"concept": "học máy"}, {"concept": "xyz"}],
                     "edges": [{"source": "a", "target": "b", "relation_type": "related"},
                               {"source": "a", "target": "c", "relation_type": "is_a",
                                "evidence": {"page": 3, "quote": "..."}}]}}
    m = graph_metrics(out, GOLD)
    assert m["generic_edge_rate"] == 0.5
    assert m["edge_evidence_rate"] == 0.5
    assert m["node_precision"] == 0.5


def test_reading_order():
    assert reading_order_ok({"raw_text": "nhánh của ... nhiều lớp"}, GOLD) is True
    assert reading_order_ok({"raw_text": "nhiều lớp ... nhánh của"}, GOLD) is False
