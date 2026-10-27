"""한글 서식에서 지도가 덮지 않는 자리(체크 상자·빈 칸·빈 라벨)를 찾는다.

사용: python scripts/audit_coverage.py [FORM_ID ...] [--json]
「자리」 = ①칸 안의 체크 상자 [ ]·□ (n번째) ②괄호형 체크 「예(   )」 ③글자 없는 칸
④「라벨:」 뒤가 비어 있는 곳 ⑤「(      )」 빈 괄호. 지도의 op 가 같은 칸을 몇 번 쓰는지와 비교해 남는 자리를 낸다.
면제는 forms/coverage_exempt/<FORM_ID>.json( 「T0:r1:c2」 또는 「T0:r1:c2:n3」 → 이유). 공단 처리란·의사 작성란처럼 신청 쪽이 쓰지 않는 자리만 넣는다.
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_hwpx import cells, tables  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
BOX_RE = re.compile(r"\[\s*\]|□|☐")
PAREN_CHECK_RE = re.compile(r"[가-힣]\s*\(\s{2,}\)")          # 예(   ) 아니오(   )
EMPTY_PAREN_RE = re.compile(r"(?<![가-힣])\(\s{3,}\)")          # 관계(        )
LABEL_RE = re.compile(r"([가-힣A-Za-z·()]{2,})\s*:(?=\s*$|\s{2,}[가-힣A-Za-z·()]{2,}\s*:)")


SIGN_RE = re.compile(r"^\s*(?:[가-힣()]{2,}\s{3,})?\(서명 또는 인\)")   # 「성명      (서명 또는 인)」·이름 없는 서명 줄
BRANCH_RE = re.compile(r"\s{4,}(?:지역본부|지사)")                    # 「근로복지공단        지역본부(지사)장 귀하」


def blanks_in(text: str) -> int:
    """칸 글자 안의 「적을 자리」 수(체크 상자 제외)."""
    n = 0
    for p in text.split(" ¶ "):
        n += len(EMPTY_PAREN_RE.findall(p))
        n += len(LABEL_RE.findall(p.strip()))
        n += len(SIGN_RE.findall(p)) + len(BRANCH_RE.findall(p))
    return n


def audit(form_id: str) -> dict:
    hx = ROOT / "forms" / "hwpx" / f"{form_id}.hwpx"
    mp = json.loads((ROOT / "forms" / "hwpx_maps" / f"{form_id}.json").read_text(encoding="utf-8"))
    xml = zipfile.ZipFile(hx).read("Contents/section0.xml").decode("utf-8")

    checks: set[tuple] = set()
    text_ops: dict[tuple, int] = {}
    for name, op in mp["slots"].items():
        k = op["kind"]
        if k == "check":
            checks.add((op["t"], op["r"], op["c"], op.get("n", 1)))
        elif k == "group":
            tp = mp["templates"][op["template"]]
            key = (tp["t"], tp["r"], tp["c"])
            text_ops[key] = text_ops.get(key, 0) + 1
        elif k == "boxes":
            for t, r, c in op["cells"]:
                text_ops[(t, r, c)] = text_ops.get((t, r, c), 0) + 1
        else:
            key = (op["t"], op["r"], op["c"])
            text_ops[key] = text_ops.get(key, 0) + 1
    # 템플릿 칸은 괄호형 체크도 덮는다({x} 가 괄호 안에 들어간 경우)
    tmpl_cells = {(tp["t"], tp["r"], tp["c"]): tp["text"] for tp in mp.get("templates", {}).values()}

    out = []
    for ti, s, e in tables(xml):
        cl = cells(xml[s:e])
        if len(cl) == 1 and not cl[0][4].strip():
            continue  # 숫자 상자(1×1 안쪽 표) — 바깥 칸의 digits/boxes 가 덮는다
        for r, c, rs, cs, text, *_ in cl:
            plain = re.sub(r" \[안쪽표 \d+\]$", "", text)
            has_inner = plain != text
            key = (ti, r, c)
            # ① 체크 상자
            boxes = sum(len(BOX_RE.findall(p)) for p in plain.split(" ¶ "))
            for n in range(1, boxes + 1):
                if (ti, r, c, n) not in checks and not (key in tmpl_cells and "{" in tmpl_cells[key] and "[" in tmpl_cells[key]):
                    out.append({"addr": f"T{ti}:r{r}:c{c}:n{n}", "kind": "check", "text": plain[:90]})
            # ② 괄호형 체크
            pchk = sum(len(PAREN_CHECK_RE.findall(p)) for p in plain.split(" ¶ "))
            # ③④⑤ 적을 자리
            need = blanks_in(plain) + pchk
            if not plain.replace(" ¶ ", "").strip() and not has_inner:
                need = max(need, 1)
            have = text_ops.get(key, 0)
            if need > have:
                out.append({"addr": f"T{ti}:r{r}:c{c}", "kind": "text", "need": need, "have": have, "text": plain[:90]})
    ex_path = ROOT / "forms" / "coverage_exempt" / f"{form_id}.json"
    exempt = json.loads(ex_path.read_text(encoding="utf-8")) if ex_path.exists() else {}
    # 면제 키 = 「T48」(표 전체) · 「T0:r2:c2」(칸) · 「T0:r2:c2:n1」(상자 하나)
    left = [x for x in out if not any(x["addr"] == k or x["addr"].startswith(k + ":") for k in exempt if not k.startswith("pdf:"))]
    return {"form_id": form_id, "slots": len(mp["slots"]), "found": len(out), "uncovered": left}


def main() -> int:
    ids = [a for a in sys.argv[1:] if not a.startswith("--")] or sorted(p.stem for p in (ROOT / "forms" / "hwpx_maps").glob("*.json"))
    res = [audit(i) for i in ids]
    if "--json" in sys.argv:
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0
    total = 0
    for r in res:
        total += len(r["uncovered"])
        print(f"== {r['form_id']}  칸 {r['slots']} · 빈 자리 {len(r['uncovered'])}")
        for x in r["uncovered"]:
            extra = f" ({x['have']}/{x['need']})" if x["kind"] == "text" else ""
            print(f"   {x['addr']:<16} {x['kind']}{extra}  「{x['text']}」")
    print(f"합계 덮이지 않은 자리 {total}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
