"""서식 PDF 의 좌표 재료를 쪽별로 뽑는다 — 좌표 지도(forms/maps/*.json) 작성용.

사용: python scripts/probe_form.py <서식.pdf> <출력폴더>
출력(쪽마다):
  p<N>.json  { size, words:[{text,x0,y0,x1,y1}], hlines:[[y,x0,x1]], vlines:[[x,y0,y1]],
               green_boxes:[[x0,y0,x1,y1]] (녹색 테두리 숫자 상자), brackets:[{x0,y0,x1,y1}] ("[ ]" 체크 괄호의 '[' 위치) }
  p<N>.jpg   110dpi 렌더(긴 변 ≤1600px, JPEG q80) — 육안용
좌표 단위 pt, 원점 쪽 왼쪽 위(PyMuPDF). pdf-lib 는 왼쪽 아래 원점이라 overlay.ts 가 뒤집는다.
녹색 상자는 get_drawings 에 안 잡혀(실측 261026) 렌더 이미지의 녹색 테두리를 스캔한다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")


def lines(pg: fitz.Page):
    hs, vs = [], []
    for d in pg.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a.y - b.y) < 0.5 and abs(a.x - b.x) > 5:
                    hs.append([round(a.y, 1), round(min(a.x, b.x), 1), round(max(a.x, b.x), 1)])
                elif abs(a.x - b.x) < 0.5 and abs(a.y - b.y) > 5:
                    vs.append([round(a.x, 1), round(min(a.y, b.y), 1), round(max(a.y, b.y), 1)])
            elif it[0] == "re":
                r = it[1]
                if r.height < 1.2 and r.width > 5:
                    hs.append([round(r.y0, 1), round(r.x0, 1), round(r.x1, 1)])
                elif r.width < 1.2 and r.height > 5:
                    vs.append([round(r.x0, 1), round(r.y0, 1), round(r.y1, 1)])
    return sorted(set(map(tuple, hs))), sorted(set(map(tuple, vs)))


def green_boxes(pg: fitz.Page):
    dpi = 220
    sc = 72 / dpi
    pix = pg.get_pixmap(dpi=dpi)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    px = im.load()
    W, H = im.size

    def g(p):
        r, gg, b = p
        return gg > 150 and r < 200 and b < 200 and gg - r > 25 and gg - b > 25

    # 녹색 픽셀이 있는 행 띠를 먼저 찾는다
    rows = [y for y in range(0, H, 2) if any(g(px[x, y]) for x in range(0, W, 3))]
    bands, start, prev = [], None, None
    for y in rows:
        if start is None:
            start = y
        elif y - prev > 6:
            bands.append((start, prev))
            start = y
        prev = y
    if start is not None:
        bands.append((start, prev))
    boxes = []
    for y0, y1 in bands:
        if y1 - y0 < 8:
            continue
        cols = [sum(1 for y in range(y0, y1 + 1) if g(px[x, y])) for x in range(W)]
        thr = max(cols) * 0.5 if max(cols) else 1
        runs, s = [], None
        for i, c in enumerate(cols):
            on = c >= thr
            if on and s is None:
                s = i
            if not on and s is not None:
                runs.append((s, i))
                s = None
        if s is not None:
            runs.append((s, len(cols)))
        edges = [r[0] for r in runs] + ([runs[-1][1]] if runs else [])
        for i in range(len(edges) - 1):
            a, b = edges[i], edges[i + 1]
            if b - a < 11 / sc or b - a > 60 / sc:
                continue
            ys = [y for y in range(y0, y1 + 1) if any(g(px[xx, y]) for xx in range(a, min(b, a + 4)))]
            if ys:
                boxes.append([round(a * sc, 1), round(min(ys) * sc, 1), round(b * sc, 1), round(max(ys) * sc, 1)])
    return boxes


def main() -> None:
    pdf, out = sys.argv[1], Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf)
    for i, pg in enumerate(doc):
        words = [{"text": w[4], "x0": round(w[0], 1), "y0": round(w[1], 1), "x1": round(w[2], 1), "y1": round(w[3], 1)} for w in pg.get_text("words")]
        hs, vs = lines(pg)
        gb = green_boxes(pg)
        br = [w for w in words if w["text"] == "[" or w["text"].startswith("[") and len(w["text"]) <= 2 and "별지" not in w["text"]]
        data = {"page": i + 1, "size": {"width": round(pg.rect.width, 1), "height": round(pg.rect.height, 1)}, "words": words, "hlines": hs, "vlines": vs, "green_boxes": gb, "brackets": br}
        (out / f"p{i + 1}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        pix = pg.get_pixmap(dpi=110)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        im.thumbnail((1600, 1600))
        im.save(out / f"p{i + 1}.jpg", quality=80)
        print(f"p{i + 1}: words {len(words)} h {len(hs)} v {len(vs)} green {len(gb)} brackets {len(br)} → {out / f'p{i + 1}.jpg'}")


if __name__ == "__main__":
    main()
