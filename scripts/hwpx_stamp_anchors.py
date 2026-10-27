"""PDF 지도(forms/maps)의 도장 자리(stamps)를 한글 지도(forms/hwpx_maps)로 옮긴다.

한글 그림은 「앵커 문단이 놓인 쪽」의 종이 기준 절대좌표로 놓이므로, 자리마다 같은 쪽에 있는 「(서명 또는 인」 라벨 하나를
앵커로 고른다. 라벨이 몇 쪽에 있는지는 동봉 PDF 의 쪽별 라벨 수(글자 추출)와 hwpx XML 의 라벨 등장 순서를 맞춰 정한다 —
두 수가 다르면 그 서식은 멈춘다(사람이 본다). x·y·size 는 PDF 지도 값 그대로(hwpx 렌더가 PDF 와 1pt 안에서 같다는 것을
scripts/verify_hwpx_stamps.py 가 실측한다).

사용: python scripts/hwpx_stamp_anchors.py [--write]
"""
import json
import os
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LABEL = "(서명 또는 인"  # 닫는 괄호 없음 — 장해급여 1곳이 run 이 갈라져 있다
PDF_RE = re.compile(r"\(\s*서\s*명\s*또\s*는\s*인")


def main() -> int:
    write = "--write" in sys.argv
    bad = 0
    for f in sorted(os.listdir(os.path.join(ROOT, "forms", "maps"))):
        fid = f[:-5]
        pdf_map = json.load(open(os.path.join(ROOT, "forms", "maps", f), encoding="utf-8"))
        stamps = pdf_map.get("stamps") or {}
        hx_map_path = os.path.join(ROOT, "forms", "hwpx_maps", f)
        if not stamps or not os.path.exists(hx_map_path):
            continue
        doc = fitz.open(os.path.join(ROOT, "forms", "bundled", f"{fid}.pdf"))
        per_page = [len(PDF_RE.findall(page.get_text())) for page in doc]
        sec = zipfile.ZipFile(os.path.join(ROOT, "forms", "hwpx", f"{fid}.hwpx")).read("Contents/section0.xml").decode("utf-8")
        n_xml = sec.count(LABEL)
        if n_xml != sum(per_page):
            print(f"✗ {fid}: XML 라벨 {n_xml} ≠ PDF 라벨 {sum(per_page)} {per_page}")
            bad += 1
            continue
        # XML k번째 라벨 → 쪽
        page_of = []
        for pno, n in enumerate(per_page, start=1):
            page_of += [pno] * n
        first_on_page = {}
        for k, pg in enumerate(page_of):
            first_on_page.setdefault(pg, k)
        hx_map = json.load(open(hx_map_path, encoding="utf-8"))
        # 한글 쪽 나눔이 동봉 PDF 와 다른 서식(장해급여: 한글 8쪽 · PDF 7쪽)은 「page」 를 한글 렌더 실측값으로 둔다.
        # 앵커는 라벨 순서로 정하므로 쪽 번호와 무관하고, page 는 verify_hwpx_stamps.py 의 대조에만 쓰인다
        keep_page = hx_map.get("expect_pages") not in (None, doc.page_count)
        prev = hx_map.get("stamps") or {}
        out = {}
        for key, s in stamps.items():
            if s["page"] not in first_on_page:
                print(f"✗ {fid}.{key}: {s['page']}쪽에 라벨이 없다")
                bad += 1
                continue
            page = prev[key]["page"] if keep_page and key in prev else s["page"]
            out[key] = {"anchor": first_on_page[s["page"]], "page": page, "x": s["x"], "y": s["y"], "size": s["size"]}
        print(f"✓ {fid}: 라벨 {n_xml} 쪽별 {per_page} → " + ", ".join(f"{k}(p{stamps[k]['page']}→#{v['anchor']})" for k, v in out.items()))
        if write:
            hx_map["stamps"] = out
            with open(hx_map_path, "w", encoding="utf-8", newline="\n") as fp:
                json.dump(hx_map, fp, ensure_ascii=False, indent=2)
                fp.write("\n")
    print("완료" if not bad else f"문제 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
