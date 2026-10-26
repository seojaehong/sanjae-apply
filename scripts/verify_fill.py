"""채워진 PDF 를 열어 값이 의도한 칸 안에 들어갔는지 PyMuPDF 로 대조하고, 1쪽을 JPEG 로 굽는다.

사용: python scripts/verify_fill.py <채워진.pdf> <map.json> <values.json> <out.jpg> [<원본.pdf>]
판정 ① 텍스트: 각 text/boxes 슬롯의 값이 1쪽 단어 목록에 있고, 그 bbox 가 슬롯 좌표에서 15pt 안에 있어야 PASS.
판정 ② 픽셀(원본.pdf 를 주면): 슬롯 영역의 어두운 픽셀 수가 원본보다 늘어야 PASS — 텍스트 추출은 되는데
   글리프가 안 그려지는 경우(261026 나눔고딕 서브셋 운영 실측)를 잡는다. ①만 믿으면 PASS 가 알리바이가 된다.
"""
from __future__ import annotations

import json
import sys

import fitz
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    pdf, map_path, values_path, out_jpg = sys.argv[1:5]
    orig = sys.argv[5] if len(sys.argv) > 5 else None
    m = json.load(open(map_path, encoding="utf-8"))
    vals = json.load(open(values_path, encoding="utf-8"))
    doc = fitz.open(pdf)
    fails = 0

    def dark_count(document, page_no: int, rect: fitz.Rect) -> int:
        pg = document[page_no]
        pix = pg.get_pixmap(dpi=150, clip=rect, colorspace=fitz.csGRAY)
        return sum(1 for b in pix.samples if b < 110)

    def slot_rect(slot) -> fitz.Rect:
        if slot["kind"] == "boxes":
            b = slot["boxes"]
            return fitz.Rect(min(x["x0"] for x in b), min(x["y0"] for x in b), max(x["x1"] for x in b), max(x["y1"] for x in b))
        if slot["kind"] == "multiline":
            return fitz.Rect(slot["x0"], slot["y0"], slot["x1"], slot["y1"])
        if slot["kind"] == "check":
            return fitz.Rect(slot["x"] - 6, slot["y"] - 6, slot["x"] + 6, slot["y"] + 6)
        size = slot.get("size", 9)
        return fitz.Rect(slot["x"], slot["y"] - size, slot["x"] + slot.get("maxWidth", 60), slot["y"] + 2)

    odoc = fitz.open(orig) if orig else None
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
        pix_note = ""
        if odoc is not None:
            r = slot_rect(slot)
            before, after = dark_count(odoc, slot["page"] - 1, r), dark_count(doc, slot["page"] - 1, r)
            # 글자 하나라도 그려지면 150dpi 에서 수십 픽셀은 늘어난다. 체크(√)는 작아서 +5.
            drawn = after >= before + (5 if slot["kind"] == "check" else 15)
            pix_note = f"  픽셀 {before}→{after}"
            ok = ok and drawn
        print(("PASS" if ok else "FAIL"), key, pix_note)
        fails += 0 if ok else 1
    pix = doc[0].get_pixmap(dpi=110)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    im.save(out_jpg, quality=80)
    print(f"실패 {fails} · 렌더 {out_jpg} {im.size}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
