"""채워진 PDF 를 열어 값이 의도한 칸 안에 들어갔는지 PyMuPDF 로 대조하고, 1쪽을 JPEG 로 굽는다.

사용: python scripts/verify_fill.py <채워진.pdf> <map.json> <values.json> <out.jpg>
판정: 각 text/boxes 슬롯의 값이 1쪽 단어 목록에 있고, 그 bbox 가 슬롯 좌표에서 15pt 안에 있어야 PASS.
"""
from __future__ import annotations

import json
import sys

import fitz
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    pdf, map_path, values_path, out_jpg = sys.argv[1:5]
    m = json.load(open(map_path, encoding="utf-8"))
    vals = json.load(open(values_path, encoding="utf-8"))
    doc = fitz.open(pdf)
    fails = 0
    for key, slot in m["slots"].items():
        v = vals.get(key)
        if v in (None, "", False):
            continue
        pg = doc[slot["page"] - 1]
        if slot["kind"] == "text":
            hits = pg.search_for(str(v)[:12])
            ok = any(abs(r.x0 - slot["x"]) < 15 and abs(r.y1 - slot["y"]) < 15 for r in hits)
        elif slot["kind"] == "boxes":
            digits = [c for c in str(v) if c.isalnum()]
            ok = True
            for ch, b in zip(digits, slot["boxes"]):
                r = fitz.Rect(b["x0"], b["y0"], b["x1"], b["y1"])
                inside = [w for w in pg.get_text("words", clip=r) if w[4] == ch]
                if not inside:
                    ok = False
        elif slot["kind"] == "check":
            r = fitz.Rect(slot["x"] - 6, slot["y"] - 6, slot["x"] + 6, slot["y"] + 6)
            ok = any("√" in w[4] for w in pg.get_text("words", clip=r))
        else:  # multiline
            r = fitz.Rect(slot["x0"], slot["y0"], slot["x1"], slot["y1"])
            txt = pg.get_text("text", clip=r).replace("\n", "")
            ok = str(v)[:10].replace(" ", "") in txt.replace(" ", "")
        print(("PASS" if ok else "FAIL"), key)
        fails += 0 if ok else 1
    pix = doc[0].get_pixmap(dpi=110)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    im.save(out_jpg, quality=80)
    print(f"실패 {fails} · 렌더 {out_jpg} {im.size}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
