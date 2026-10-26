"""HWPX 구조 탐침 — 표·칸(rowAddr/colAddr/span)·칸 글자를 문서 순서대로 찍는다. 채우기 지도(forms/hwpx_maps)를 만들 때 쓴다.

사용: python scripts/probe_hwpx.py <파일.hwpx> [--grep 글자]
출력 한 줄 = T<표번호> r<행> c<열> (rs×cs) 「글자」. 표번호는 섹션 안 <hp:tbl> 등장 순서(겹친 표는 바깥→안쪽 순).
"""
from __future__ import annotations

import re
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")

TBL_RE = re.compile(r"<hp:tbl\b")
T_RE = re.compile(r"<hp:t(?:\s[^>]*)?>(.*?)</hp:t>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def _unesc(s: str) -> str:
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")


def _find_close(xml: str, start: int, tag: str) -> int:
    """start(여는 태그 위치)에서 짝이 맞는 닫는 태그 끝 위치. 중첩을 센다."""
    depth, i = 0, start
    open_re = re.compile(rf"<{tag}\b[^>]*?(/?)>|</{tag}>")
    for m in open_re.finditer(xml, start):
        if m.group(0).startswith("</"):
            depth -= 1
            if depth == 0:
                return m.end()
        elif m.group(1) != "/":
            depth += 1
    return len(xml)


def tables(xml: str):
    """[(tbl_index, tbl_xml_start, tbl_xml_end)] 등장 순서."""
    out = []
    for i, m in enumerate(TBL_RE.finditer(xml)):
        out.append((i, m.start(), _find_close(xml, m.start(), "hp:tbl")))
    return out


def cells(tbl_xml: str):
    """바깥 표의 직접 칸만. [(row, col, rowspan, colspan, text, tc_start, tc_end)]"""
    out = []
    pos = 0
    tc_re = re.compile(r"<hp:tc\b")
    while True:
        m = tc_re.search(tbl_xml, pos)
        if not m:
            break
        end = _find_close(tbl_xml, m.start(), "hp:tc")
        tc = tbl_xml[m.start():end]
        # 안쪽 표가 있으면 그 글자·주소는 빼고 센다(바깥 칸의 cellAddr 는 subList 뒤에 온다)
        # 안쪽 표는 최상위 것만 (표 안의 표 안의 표는 바깥 안쪽 표 범위에 포함된다) — 뒤에서부터 잘라야 앞 오프셋이 유지된다
        spans, cur_end = [], -1
        for im in TBL_RE.finditer(tc):
            if im.start() < cur_end:
                continue
            cur_end = _find_close(tc, im.start(), "hp:tbl")
            spans.append((im.start(), cur_end))
        inner = tc
        for s0, e0 in spans[::-1]:
            inner = inner[:s0] + inner[e0:]
        inner_tables = len(spans)
        addr = re.search(r'<hp:cellAddr\s+colAddr="(\d+)"\s+rowAddr="(\d+)"', inner)
        span = re.search(r'<hp:cellSpan\s+colSpan="(\d+)"\s+rowSpan="(\d+)"', inner)
        if not addr or not span:
            print(f"[probe] cellAddr/cellSpan 없음 — tc 머리: {inner[:160]!r} … 꼬리: {inner[-240:]!r}", file=sys.stderr)
            pos = end
            continue
        paras = []
        for pm in re.finditer(r"<hp:p\b.*?</hp:p>", inner, re.S):
            ptxt = TAG_RE.sub("", "".join(_unesc(t) for t in T_RE.findall(pm.group(0))))
            paras.append(ptxt)
        text = " ¶ ".join(paras) + (f" [안쪽표 {inner_tables}]" if inner_tables else "")
        out.append((int(addr.group(2)), int(addr.group(1)), int(span.group(2)), int(span.group(1)), text, m.start(), end))
        pos = end
    return out


def main() -> int:
    path = sys.argv[1]
    grep = None
    if "--grep" in sys.argv:
        grep = sys.argv[sys.argv.index("--grep") + 1]
    only = None  # --cell T0:r19:c1 → 그 칸의 문단을 한 줄씩 전부
    if "--cell" in sys.argv:
        m = re.match(r"T(\d+):r(\d+):c(\d+)", sys.argv[sys.argv.index("--cell") + 1])
        only = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    z = zipfile.ZipFile(path)
    names = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n))
    for n in names:
        xml = z.read(n).decode("utf-8")
        tl = tables(xml)
        print(f"== {n}: 표 {len(tl)}개, 런 {len(T_RE.findall(xml))}개")
        for ti, s, e in tl:
            if only and ti != only[0]:
                continue
            cl = cells(xml[s:e])
            if only:
                for r, c, rs, cs, text, *_ in cl:
                    if (r, c) == only[1:]:
                        for i, p in enumerate(text.split(" ¶ ")):
                            print(f"   T{ti} r{r} c{c} p{i}: 「{p}」")
                continue
            rows = max((r + rs for r, c, rs, cs, *_ in cl), default=0)
            cols = max((c + cs for r, c, rs, cs, *_ in cl), default=0)
            print(f"-- T{ti} {rows}행×{cols}열 칸 {len(cl)}")
            for r, c, rs, cs, text, *_ in cl:
                t = text.replace("\n", "⏎")
                if grep and grep not in t:
                    continue
                print(f"   T{ti} r{r} c{c} ({rs}×{cs}) 「{t[:110]}」")
    return 0


if __name__ == "__main__":
    sys.exit(main())
