"""Pipeline-agnostic quality metrics for document understanding.

Every pipeline (legacy or v2) is converted by an adapter into a `PipelineOutput` dict:

    {
      "raw_text": str,
      "headings": [{"text": str, "level": int, "page": int | None}],
      "chunks":   [{"text": str, "page": int | None, "section_path": list[str] | None}],
      "concepts": [str, ...],                     # ranked, best first
      "graph":    {"nodes": [{"concept": str}], "edges": [{"source", "target", "relation_type", ...}]},
    }

and scored against gold labels produced by `tests/fixtures/build_fixtures.py`.
All metrics are pure functions so they can be unit-tested and reused for before/after reports.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Optional

GENERIC_RELATIONS = {"", "related", "related_to", "co-occurrence", "co_occurrence", "cooccurs", "co_occurs"}

# Old-style vs new-style Vietnamese tone placement (hóa ↔ hoá) — normalise to one form.
_TONE_FIX = {
    "óa": "oá", "òa": "oà", "ỏa": "oả", "õa": "oã", "ọa": "oạ",
    "óe": "oé", "òe": "oè", "ỏe": "oẻ", "õe": "oẽ", "ọe": "oẹ",
    "úy": "uý", "ùy": "uỳ", "ủy": "uỷ", "ũy": "uỹ", "ụy": "uỵ",
}
_PUNCT = re.compile(r"[^\w\s\-]", re.UNICODE)
_SPACE = re.compile(r"\s+")


# ───────────────────────────── normalisation ─────────────────────────────
def norm(text: str) -> str:
    t = unicodedata.normalize("NFC", text or "").lower().replace("_", " ")
    for old, new in _TONE_FIX.items():
        t = t.replace(old, new)
    t = _PUNCT.sub(" ", t)
    return _SPACE.sub(" ", t).strip()


def tokens(text: str, language: str = "vi") -> list[str]:
    toks = norm(text).split()
    if language == "en":  # crude singularisation so "postings lists" == "postings list"
        toks = [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in toks]
    return toks


def same_term(a: str, b: str, language: str = "vi") -> bool:
    return tokens(a, language) == tokens(b, language)


def _strip_numbering(heading: str) -> str:
    """'1.1.1. Hồi quy tuyến tính' / 'Chương 1. Tổng quan' → core title."""
    h = norm(heading)
    h = re.sub(r"^(chương|chapter|phần|part)\s+\d+\s*", "", h)
    h = re.sub(r"^\d+(\s+\d+)*\s*", "", h)
    return h.strip()


def _contains_seq(hay: list[str], needle: list[str]) -> bool:
    n = len(needle)
    return n > 0 and any(hay[i:i + n] == needle for i in range(len(hay) - n + 1))


def _ratio(num: float, den: float) -> Optional[float]:
    return round(num / den, 4) if den else None


# ───────────────────────────── structure ─────────────────────────────
def heading_metrics(out: dict, gold: dict) -> dict:
    raw = norm(out.get("raw_text", ""))
    gold_h = gold["headings"]
    pred = out.get("headings") or []

    text_hits = sum(1 for g in gold_h if norm(g["text"]) in raw)

    def matches(g, p) -> bool:
        return _strip_numbering(g["text"]) == _strip_numbering(p["text"])

    detected = level_ok = 0
    for g in gold_h:
        cands = [p for p in pred if matches(g, p)]
        if cands:
            detected += 1
            if any(p.get("level") == g["level"] for p in cands):
                level_ok += 1
    return {
        "heading_text_recall": _ratio(text_hits, len(gold_h)),
        "heading_detect_recall": _ratio(detected, len(gold_h)),
        "heading_level_accuracy": _ratio(level_ok, len(gold_h)),
    }


def _section_keys(gold: dict) -> list[list[str]]:
    """Fingerprints per section: normalised first 50 chars of each body paragraph."""
    return [[norm(p)[:50] for p in s["body"]] for s in gold["sections"]]


def chunk_metrics(out: dict, gold: dict) -> dict:
    chunks = out.get("chunks") or []
    keys = _section_keys(gold)
    pages = [s.get("page") for s in gold["sections"]]
    has_pages = any(p is not None for p in pages)

    touched_sections: set[int] = set()
    cross = mapped = with_page = page_ok = with_path = 0
    for ch in chunks:
        txt = norm(ch.get("text", ""))
        secs = [i for i, ks in enumerate(keys) if any(k and k in txt for k in ks)]
        touched_sections.update(secs)
        if secs:
            mapped += 1
            if len(secs) > 1:
                cross += 1
        if ch.get("page") is not None:
            with_page += 1
            if has_pages and secs and ch["page"] in {pages[i] for i in secs}:
                page_ok += 1
        if ch.get("section_path"):
            with_path += 1

    return {
        "chunk_count": len(chunks),
        "cross_section_chunk_rate": _ratio(cross, mapped),
        "section_coverage": _ratio(len(touched_sections), len(keys)),
        "page_attribution_rate": _ratio(with_page, len(chunks)),
        "page_accuracy": _ratio(page_ok, with_page) if has_pages else None,
        "section_path_rate": _ratio(with_path, len(chunks)),
    }


def reading_order_ok(out: dict, gold: dict) -> Optional[bool]:
    spec = gold.get("reading_order")
    if not spec:
        return None
    raw = norm(out.get("raw_text", ""))
    a, b = raw.find(norm(spec["before"])), raw.find(norm(spec["after"]))
    return a != -1 and b != -1 and a < b


def noise_leak(out: dict, gold: dict) -> Optional[int]:
    noise = gold.get("noise_strings") or []
    if not noise:
        return None
    joined = " ".join(norm(c.get("text", "")) for c in out.get("chunks") or [])
    return sum(joined.count(norm(n)) for n in noise)


# ───────────────────────────── concepts ─────────────────────────────
def _is_gold(c: str, gold_concepts: Iterable[str], lang: str) -> bool:
    return any(same_term(c, g, lang) for g in gold_concepts)


def is_fragment(concept: str, compounds: Iterable[str], lang: str = "vi") -> bool:
    """True if `concept` breaks a gold compound: it is a proper piece of one, or it
    starts/ends in the middle of one (e.g. 'máy là' cuts 'học máy')."""
    ct = tokens(concept, lang)
    if not ct:
        return False
    for comp in compounds:
        gt = tokens(comp, lang)
        if len(gt) < 2:
            continue
        if _contains_seq(ct, gt):
            continue  # compound kept intact inside the concept
        if len(ct) < len(gt) and _contains_seq(gt, ct):
            return True
        for k in range(1, len(gt)):
            if ct[:k] == gt[-k:] or ct[-k:] == gt[:k]:
                return True
    return False


def concept_metrics(out: dict, gold: dict) -> dict:
    lang = gold["language"]
    preds = [c for c in (out.get("concepts") or []) if c and c.strip()]
    gconcepts, comps = gold["concepts"], gold.get("compounds") or []

    def p_at(k: int) -> Optional[float]:
        top = preds[:k]
        return _ratio(sum(_is_gold(c, gconcepts, lang) for c in top), len(top))

    top20 = preds[:20]
    found = sum(1 for g in gconcepts if any(same_term(c, g, lang) for c in top20))
    res = {
        "concept_count": len(preds),
        "concept_precision@10": p_at(10),
        "concept_precision@20": p_at(20),
        "concept_recall@20": _ratio(found, len(gconcepts)),
        "top10_concepts": preds[:10],
    }
    if comps:
        intact = sum(1 for g in comps if any(_contains_seq(tokens(c, lang), tokens(g, lang)) for c in preds))
        frags = sum(1 for c in top20 if not _is_gold(c, gconcepts, lang) and is_fragment(c, comps, lang))
        res["compound_integrity"] = _ratio(intact, len(comps))
        res["fragment_rate@20"] = _ratio(frags, len(top20))
    return res


# ───────────────────────────── graph ─────────────────────────────
def graph_metrics(out: dict, gold: dict) -> dict:
    g = out.get("graph") or {}
    nodes, edges = g.get("nodes") or [], g.get("edges") or []
    n, e = len(nodes), len(edges)
    lang = gold["language"]
    generic = sum(1 for x in edges if str(x.get("relation_type") or x.get("relation") or "").lower()
                  in GENERIC_RELATIONS)
    evidenced = sum(1 for x in edges if isinstance(x.get("evidence"), dict) and x["evidence"].get("page"))
    node_ok = sum(1 for x in nodes if _is_gold(str(x.get("concept", "")), gold["concepts"], lang))
    return {
        "graph_nodes": n,
        "graph_edges": e,
        "graph_density": round(2 * e / (n * (n - 1)), 4) if n > 1 else None,
        "node_precision": _ratio(node_ok, n),
        "generic_edge_rate": _ratio(generic, e),
        "edge_evidence_rate": _ratio(evidenced, e),
    }


# ───────────────────────────── all ─────────────────────────────
def evaluate(out: dict, gold: dict) -> dict:
    res = {"document": gold["name"], "language": gold["language"]}
    res.update(heading_metrics(out, gold))
    res.update(chunk_metrics(out, gold))
    res["reading_order_ok"] = reading_order_ok(out, gold)
    res["noise_leak_count"] = noise_leak(out, gold)
    res.update(concept_metrics(out, gold))
    res.update(graph_metrics(out, gold))
    return res
