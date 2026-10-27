"""PDF 서식의 체크 상자([ ]·□)마다 지도에 check 칸이 있는지 본다. audit_coverage.py(한글 쪽)의 PDF 짝.

사용: python scripts/audit_pdf_checks.py [FORM_ID ...]
상자 중심 = 「[」 오른쪽 끝과 짝 「]」 왼쪽 끝의 중점(좌표지도_작성법), □ 는 글자 bbox 중심. 지도 check 의 (page, x, y) 가 6pt 안에 있으면 덮인 것.
면제는 forms/coverage_exempt/<FORM_ID>.json 의 「pdf:pN」(쪽 전체) 또는 「pdf:pN:x,y」(상자 하나, 정수 반올림) → 이유.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
TOL = 6.0


def boxes(page: fitz.Page) -> list[tuple[float, float]]:
    # 「[」와 「]」가 다른 줄·스팬으로 갈려 있는 쪽이 있어(요양급여 1쪽) 쪽 전체 글자에서 짝을 찾는다
    chars = [ch for b in page.get_text("rawdict")["blocks"] for ln in b.get("lines", []) for sp in ln["spans"] for ch in sp["chars"]]
    closes = [ch for ch in chars if ch["c"] in "]〕"]
    out = []
    for ch in chars:
        x0, y0, x1, y1 = ch["bbox"]
        if ch["c"] in "□☐":
            out.append(((x0 + x1) / 2, (y0 + y1) / 2))
        elif ch["c"] in "[〔":
            cy = (y0 + y1) / 2
            cand = [c for c in closes if 0 <= c["bbox"][0] - x1 <= 25 and abs((c["bbox"][1] + c["bbox"][3]) / 2 - cy) <= 2.5]
            if cand:
                cj = min(cand, key=lambda c: c["bbox"][0])
                # 「[필수]」처럼 사이에 글자가 있으면 상자가 아니다
                between = [c for c in chars if not c["c"].isspace() and x1 <= (c["bbox"][0] + c["bbox"][2]) / 2 <= cj["bbox"][0]
                           and abs((c["bbox"][1] + c["bbox"][3]) / 2 - cy) <= 2.5]
                if not between:
                    out.append(((x1 + cj["bbox"][0]) / 2, cy))
    return out


def audit(form_id: str) -> dict:
    mp = json.loads((ROOT / "forms" / "maps" / f"{form_id}.json").read_text(encoding="utf-8"))
    doc = fitz.open(ROOT / "forms" / "bundled" / f"{form_id}.pdf")
    ex_path = ROOT / "forms" / "coverage_exempt" / f"{form_id}.json"
    exempt = json.loads(ex_path.read_text(encoding="utf-8")) if ex_path.exists() else {}
    checks = [(o["page"], o["x"], o["y"]) for o in mp["slots"].values() if o.get("kind") == "check"]
    left = []
    for pi, page in enumerate(doc, start=1):
        if f"pdf:p{pi}" in exempt:
            continue
        for x, y in boxes(page):
            if any(p == pi and abs(cx - x) <= TOL and abs(cy - y) <= TOL for p, cx, cy in checks):
                continue
            if f"pdf:p{pi}:{round(x)},{round(y)}" in exempt:
                continue
            left.append({"page": pi, "x": round(x, 1), "y": round(y, 1)})
    return {"form_id": form_id, "uncovered": left}


def main() -> int:
    ids = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(p.stem for p in (ROOT / "forms" / "maps").glob("*.json"))
    total = 0
    for r in map(audit, ids):
        total += len(r["uncovered"])
        by = {}
        for u in r["uncovered"]:
            by.setdefault(u["page"], []).append(f"{u['x']:.0f},{u['y']:.0f}")
        print(f"== {r['form_id']}  덮이지 않은 상자 {len(r['uncovered'])}  " + " ".join(f"p{p}:{len(v)}" for p, v in sorted(by.items())))
        if "-v" in sys.argv:
            for p, v in sorted(by.items()):
                print(f"   p{p}: {' '.join(v)}")
    print(f"합계 {total}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
