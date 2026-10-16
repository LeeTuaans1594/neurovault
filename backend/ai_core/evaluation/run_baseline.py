"""Run a pipeline over all fixtures and write a metrics report.

    .venv\\Scripts\\python.exe -m evaluation.run_baseline --pipeline legacy
    → docs/audit/baseline/legacy_metrics.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from evaluation.adapters import ADAPTERS, AI_CORE
from evaluation.metrics import evaluate

FIXTURES = AI_CORE / "tests" / "fixtures"
REPO = AI_CORE.parents[1]
DEFAULT_OUT = REPO / "docs" / "audit" / "baseline"


def run(pipeline: str = "legacy") -> list[dict]:
    adapter = ADAPTERS[pipeline]()
    results = []
    for gold_path in sorted((FIXTURES / "gold").glob("*.json")):
        gold = json.loads(gold_path.read_text(encoding="utf-8"))
        out = adapter.run(FIXTURES / "docs" / gold["file"])
        results.append(evaluate(out, gold))
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pipeline", default="legacy", choices=sorted(ADAPTERS))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    results = run(args.pipeline)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{args.pipeline}_metrics.json"
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    print("wrote", path)


if __name__ == "__main__":
    main()
