"""채운 HWPX 검증 — ①zip 안 글자에 값이 있나 ②한글(COM)이 실제로 열어 PDF 로 그리나 ③PDF 글자에 값이 있나 ④쪽수 ⑤결합 JPEG(육안).

사용: python scripts/verify_hwpx_fill.py <채운.hwpx> <values.json> <지도.json> <out.jpg> [--no-render]
--no-render 면 ①만(한글 없는 PC). 한글 COM 은 이 PC 의 다른 한글 창이 없을 때만 돈다(hwp_guard).
종료 코드 0 = 실패 0.
"""
from __future__ import annotations

import json
import os
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.expanduser("~/.claude/scripts"))

T_RE = re.compile(r"<hp:t(?:\s[^>]*)?>(.*?)</hp:t>", re.S)


def unesc(s: str) -> str:
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&amp;", "&")


def hwpx_text(path: str) -> str:
    z = zipfile.ZipFile(path)
    names = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n))
    return "\n".join(unesc("".join(T_RE.findall(z.read(n).decode("utf-8")))) for n in names)


def main() -> int:
    hwpx, values_path, map_path, out_jpg = sys.argv[1:5]
    render = "--no-render" not in sys.argv
    values = json.load(open(values_path, encoding="utf-8"))
    fmap = json.load(open(map_path, encoding="utf-8"))
    slots = fmap["slots"]
    fails: list[str] = []

    # ① zip 글자
    text = hwpx_text(hwpx)
    checks_true = 0
    for k, v in values.items():
        op = slots.get(k)
        if op is None:
            fails.append(f"지도에 없는 칸 {k}")
            continue
        if op.get("kind") == "check":
            if v is True:
                checks_true += 1
            continue
        if v in ("", False, None):
            continue
        sv = str(v)
        if op.get("kind") == "digits":
            continue  # 한 자씩 흩어져 있어 아래 PDF 검사에서 상자 글자로 본다
        for line in sv.split("\n"):
            if line and line not in text:
                fails.append(f"① zip 글자에 없음 {k}=「{line[:30]}」")
    src_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "forms", "hwpx", fmap["source_file"])
    base_squares = hwpx_text(src_path).count("■") if os.path.exists(src_path) else 0
    n_marks = text.count("[V]") + text.count("■") - base_squares
    if n_marks != checks_true:
        fails.append(f"① 체크 표시 {n_marks}개 ≠ true 체크 {checks_true}개")
    # zip 구조 + 값 run 글자서식(검정 정체 — 빈 서식의 자리표시자 색을 물려받으면 안 된다)
    with zipfile.ZipFile(hwpx) as z:
        first = z.infolist()[0]
        if first.filename != "mimetype" or first.compress_type != zipfile.ZIP_STORED:
            fails.append(f"① mimetype 이 첫 항목·무압축이 아님 ({first.filename}, {first.compress_type})")
        hdr = z.read("Contents/header.xml").decode("utf-8")
        sec = z.read("Contents/section0.xml").decode("utf-8")
    colored = 0
    for k, v in values.items():
        op = slots.get(k) or {}
        if not isinstance(v, str) or len(v) < 2 or op.get("kind") == "digits":
            continue
        head = re.escape(v.split("\n")[0][:10])
        m = re.search(r'<hp:run charPrIDRef="(\d+)"><hp:t>[^<]*' + head, sec)
        if not m:
            continue
        cp = re.search(r'<hh:charPr id="' + m.group(1) + r'"([^>]*)>(.*?)</hh:charPr>', hdr, re.S)
        if not cp:
            fails.append(f"① {k} 의 charPr {m.group(1)} 이 header 에 없음")
            continue
        color = re.search(r'textColor="([^"]+)"', cp.group(1))
        if (color and color.group(1).upper() != "#000000") or "<hh:italic" in cp.group(2):
            fails.append(f"① {k} 글자서식이 검정 정체가 아님 (charPr {m.group(1)} color={color.group(1) if color else '?'})")
            colored += 1
    print(f"① zip 글자: 값 {len(values)}개 · 체크 {checks_true}개 · 표시 {n_marks}개 · 자리표시자 색 {colored}건")

    if not render:
        print("실패", len(fails))
        for f in fails:
            print("  ", f)
        return 1 if fails else 0

    # ② 한글이 열어 PDF 로
    import hwp_guard
    import win32com.client as w

    pdf = os.path.splitext(os.path.abspath(out_jpg))[0] + ".pdf"
    hwp = w.gencache.EnsureDispatch("HWPFrame.HwpObject")
    try:
        try:
            hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        except Exception:
            pass
        hwp.XHwpWindows.Item(0).Visible = False
        if not hwp.Open(os.path.abspath(hwpx), "HWPX", "forceopen:true"):
            fails.append("② 한글이 hwpx 를 열지 못함")
        else:
            ok = hwp.SaveAs(pdf, "PDF", "")
            hwp.Clear(1)
            if not ok:
                fails.append("② PDF 저장 실패")
    finally:
        try:
            hwp.Quit()
        except Exception:
            pass
        hwp_guard.kill_own()
    if not os.path.exists(pdf):
        print("실패", len(fails))
        for f in fails:
            print("  ", f)
        return 1

    # ③ PDF 글자 ④ 쪽수 ⑤ 결합 JPEG
    import fitz  # PyMuPDF
    from PIL import Image

    doc = fitz.open(pdf)
    ptext = "\n".join(p.get_text() for p in doc)
    flat = re.sub(r"\s+", "", ptext)
    for k, v in values.items():
        op = slots.get(k) or {}
        if v in ("", False, None, True) or op.get("kind") == "check":
            continue
        sv = re.sub(r"\s+", "", str(v))
        if len(sv) < 2:
            continue
        if op.get("kind") == "digits":
            # 상자에 한 자씩 — 전부 PDF 에 있어야 한다(순서까지는 안 본다)
            missing = [ch for ch in sv if ch not in flat]
            if missing:
                fails.append(f"③ PDF 글자에 없음 {k} 상자 글자 {missing}")
            continue
        if sv not in flat:
            fails.append(f"③ PDF 글자에 없음 {k}=「{sv[:30]}」")
    pdf_marks = flat.count("[V]") + flat.count("■") - base_squares
    if pdf_marks != checks_true:
        fails.append(f"③ PDF 체크 표시 {pdf_marks}개 ≠ {checks_true}개")
    pages = len(doc)
    expect = fmap.get("expect_pages")
    if expect and pages != expect:
        fails.append(f"④ 쪽수 {pages} ≠ 기대 {expect}(칸이 늘어나 밀렸을 수 있다)")
    print(f"③ PDF 글자 검사 · ④ 쪽수 {pages}")

    imgs = []
    for p in doc:
        pix = p.get_pixmap(dpi=72)
        imgs.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    cols = min(len(imgs), 2)
    rows = (len(imgs) + cols - 1) // cols
    w0, h0 = imgs[0].size
    sheet = Image.new("RGB", (w0 * cols, h0 * rows), "white")
    for i, im in enumerate(imgs):
        sheet.paste(im, ((i % cols) * w0, (i // cols) * h0))
    scale = min(1.0, 1600 / max(sheet.size))
    if scale < 1:
        sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)))
    sheet.save(out_jpg, "JPEG", quality=80)
    print(f"⑤ 결합 이미지 {out_jpg} ({sheet.width}×{sheet.height})")

    print("실패", len(fails))
    for f in fails:
        print("  ", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
