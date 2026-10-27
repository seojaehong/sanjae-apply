"""한글 날인 실측 — 지도에 도장 자리가 있는 서식 전부를 합성 값 + 모든 자리 도장으로 채워(dist CLI) 한글 COM 으로 PDF 렌더한 뒤,
①쪽수 = expect_pages ②그림 수 = 자리 수 ③그림 중심이 지도 (x,y) 의 ±tol pt 안인지 보고, 자리 주변 크롭을 한 장 JPEG 로 묶는다.

한글(HWPFrame.HwpObject)이 있는 윈도우에서만 돈다. 다른 세션이 한글을 쓰고 있으면 hwp_guard 가 멈춘다.
사용: python scripts/verify_hwpx_stamps.py <out_dir> [--tol 3] [--name 홍길동]
"""
import io
import json
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.expanduser("~/.claude/scripts"))
import fitz  # PyMuPDF
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def arg(name: str, default: str) -> str:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main() -> int:
    out_dir = os.path.abspath(sys.argv[1])
    tol = float(arg("--tol", "3"))
    name = arg("--name", "홍길동")
    os.makedirs(out_dir, exist_ok=True)
    jobs = []
    for f in sorted(os.listdir(os.path.join(ROOT, "forms", "hwpx_maps"))):
        fid = f[:-5]
        m = json.load(open(os.path.join(ROOT, "forms", "hwpx_maps", f), encoding="utf-8"))
        if not m.get("stamps"):
            continue
        out = os.path.join(out_dir, f"{fid}.hwpx")
        spots = ",".join(m["stamps"].keys())
        r = subprocess.run(
            ["node", os.path.join(ROOT, "dist", "src", "cli.js"), "fill", fid, os.path.join(ROOT, "test", "samples", f), "--out", out, "--stamp", name, "--stamp-spot", spots],
            capture_output=True, text=True, encoding="utf-8",
        )
        if r.returncode != 0:
            print("✗ fill 실패", fid, r.stderr[-400:])
            return 1
        rep = json.loads(r.stdout)
        jobs.append((fid, m, out, rep))
        print(f"채움 {fid}: stamped {rep.get('stamped')} skipped {rep.get('stamps_skipped')}")

    import hwp_guard  # noqa: E402
    import win32com.client as w  # noqa: E402

    hwp = w.gencache.EnsureDispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception:
        pass
    hwp.XHwpWindows.Item(0).Visible = False
    try:
        for fid, m, out, rep in jobs:
            pdf = out[:-5] + ".pdf"
            ok = hwp.Open(out, "HWPX", "forceopen:true")
            ok2 = hwp.SaveAs(pdf, "PDF", "") if ok else False
            hwp.Clear(1)
            if not (ok and ok2):
                print("✗ 렌더 실패", fid, ok, ok2)
    finally:
        try:
            hwp.Quit()
        except Exception:
            pass
        hwp_guard.kill_own()

    fails = 0
    tiles = []
    for fid, m, out, rep in jobs:
        pdf = out[:-5] + ".pdf"
        if not os.path.exists(pdf):
            fails += 1
            continue
        doc = fitz.open(pdf)
        exp_pages = m.get("expect_pages")
        if exp_pages and doc.page_count != exp_pages:
            print(f"✗ {fid}: 쪽수 {doc.page_count} ≠ {exp_pages}")
            fails += 1
        # 그림 bbox 전부(쪽별)
        imgs = []
        for pno, page in enumerate(doc, start=1):
            for inf in page.get_image_info():
                b = inf["bbox"]
                imgs.append((pno, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, b[2] - b[0]))
        spots = m["stamps"]
        for key, s in spots.items():
            # 가장 가까운 그림
            cands = [(abs(cx - s["x"]) + abs(cy - s["y"]), pno, cx, cy, wpt) for pno, cx, cy, wpt in imgs]
            cands.sort()
            if not cands:
                print(f"✗ {fid}.{key}: 렌더된 그림이 없다")
                fails += 1
                continue
            d, pno, cx, cy, wpt = cands[0]
            if d > tol:
                print(f"✗ {fid}.{key}: 지도 ({s['x']},{s['y']}) ↔ 그림 중심 p{pno} ({cx:.1f},{cy:.1f}) 차 {d:.1f}pt > {tol}")
                fails += 1
            page = doc[pno - 1]
            clip = fitz.Rect(s["x"] - 130, s["y"] - 60, s["x"] + 130, s["y"] + 60)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip)
            im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            dr = ImageDraw.Draw(im)
            dr.rectangle([0, 0, im.width - 1, 14], fill=(255, 255, 255))
            dr.text((2, 1), f"{fid} / {key} p{pno} d={d:.1f}", fill=(0, 0, 160))
            tiles.append(im)
        print(f"{'✓' if not fails else '·'} {fid}: 쪽 {doc.page_count} 그림 {len(imgs)} 자리 {len(spots)}")
    if tiles:
        cols = 4
        tw, th = tiles[0].size
        for n, start in enumerate(range(0, len(tiles), 16)):
            chunk = tiles[start : start + 16]
            rows = (len(chunk) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * tw, rows * th), (200, 200, 200))
            for i, t in enumerate(chunk):
                sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
            mx = max(sheet.size)
            if mx > 1600:
                r = 1600 / mx
                sheet = sheet.resize((int(sheet.width * r), int(sheet.height * r)), Image.LANCZOS)
            p = os.path.join(out_dir, f"stamps_sheet{n}.jpg")
            sheet.save(p, quality=75)
            print("크롭", p, os.path.getsize(p), "B")
    print("실패 0 — 전건 통과" if not fails else f"실패 {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
