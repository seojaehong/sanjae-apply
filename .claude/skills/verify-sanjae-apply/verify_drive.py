"""verify-sanjae-apply 보조 도구. doctor · snapshot(부작용 대조) · forbidden(금지어) · crop(날인 자리 크롭).
레포 루트에서 실행한다. 사용:
  python .claude/skills/verify-sanjae-apply/verify_drive.py doctor [--remote]
  python .claude/skills/verify-sanjae-apply/verify_drive.py snapshot <저장.json>            # 작업 폴더·%TEMP% 파일 목록
  python .claude/skills/verify-sanjae-apply/verify_drive.py snapshot <저장.json> --diff <전.json> [--allow <경로> ...]
  python .claude/skills/verify-sanjae-apply/verify_drive.py forbidden <파일 ...>             # 금지어 grep, 걸리면 exit 1
  python .claude/skills/verify-sanjae-apply/verify_drive.py crop <pdf> <forms/maps/X.json> <out.jpg>   # 도장 자리 주변 크롭 시트
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.getcwd()
FORBIDDEN = [r"승인\s*(가능|될|확률|율)", r"인정\s*(가능성|확률)", r"확률", r"적중", r"승소\s*가능", r"노무사"]


def doctor(remote: bool) -> int:
    bad = 0

    def ok(cond, msg):
        nonlocal bad
        print(("✓ " if cond else "✗ ") + msg)
        if not cond:
            bad += 1

    pkg = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))
    ok(pkg.get("name") == "sanjae-apply", "레포 루트에서 실행(package.json name = sanjae-apply)")
    node = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()
    ok(node.startswith("v") and int(node[1:].split(".")[0]) >= 20, f"node {node} (>= 20)")
    cli = os.path.join(ROOT, "dist", "src", "cli.js")
    ok(os.path.exists(cli), "dist/src/cli.js 있음 (없으면 npm.cmd run build)")
    if os.path.exists(cli):
        src_ts = open(os.path.join(ROOT, "src", "mcp", "server.ts"), encoding="utf-8").read()
        m = re.search(r'version: "([^"]+)"', src_ts)
        ok(m and m.group(1) == pkg["version"], f"SERVER_INFO.version {m.group(1) if m else '?'} = package.json {pkg['version']}")
        cat = subprocess.run(["node", cli, "catalog"], capture_output=True, text=True, encoding="utf-8")
        try:
            c = json.loads(cat.stdout)
            ok(len(c["fillable"]) == 12 and len(c["fillable_hwpx"]) == 11, f"catalog fillable {len(c['fillable'])}/12 · fillable_hwpx {len(c['fillable_hwpx'])}/11")
        except Exception as e:  # noqa: BLE001
            ok(False, f"catalog 호출 실패: {e} {cat.stderr[-200:]}")
    try:
        import fitz  # noqa: F401
        from PIL import Image  # noqa: F401
        ok(True, "python PyMuPDF(fitz)·Pillow 있음 (PDF 증거용)")
    except Exception:
        ok(False, "python PyMuPDF·Pillow 없음. pip install pymupdf pillow")
    if os.name == "nt":
        r = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-Process Hwp -ErrorAction SilentlyContinue | Measure-Object).Count"], capture_output=True, text=True)
        n = int((r.stdout or "0").strip() or 0)
        ok(n == 0, f"한글(Hwp) 프로세스 {n}개. 0 이어야 한글 드라이브를 시작한다(다른 세션이 쓰는 중이면 기다린다)")
        try:
            import win32com.client  # noqa: F401
            ok(True, "pywin32 있음 (한글 COM 렌더용)")
        except Exception:
            ok(False, "pywin32 없음. 한글 렌더 단계는 --no-render 로")
    else:
        print("· 윈도우가 아니다. 한글(hwpx) 렌더 단계는 건너뛴다(zip 검사만)")
    if remote:
        tok = os.path.join(os.path.expanduser("~"), ".config", "sanjae-apply", "mcp_token.txt")
        ok(os.path.exists(tok) and os.path.getsize(tok) > 10, "원격 토큰 파일 ~/.config/sanjae-apply/mcp_token.txt 있음 (값은 적지 않는다)")
    print("doctor:", "통과" if not bad else f"문제 {bad}건")
    return 1 if bad else 0


def listing(dirs):
    out = {}
    for d in dirs:
        for base, _dn, files in os.walk(d):
            if "node_modules" in base or os.sep + ".git" in base or os.sep + "dist" in base:
                continue
            for f in files:
                p = os.path.join(base, f)
                try:
                    out[p] = os.path.getsize(p)
                except OSError:
                    pass
    return out


def snapshot(path: str, diff: str | None, allow: list[str]) -> int:
    # 레포 안만 본다. %TEMP% 전체는 수십만 파일이라 분 단위로 걸리고(261027 실측 51만), 판정은 어차피 레포 안 파일로 한다
    dirs = [ROOT]
    cur = listing(dirs)
    json.dump(cur, open(path, "w", encoding="utf-8"))
    print(f"snapshot {len(cur)} files → {path}")
    if not diff:
        return 0
    before = json.load(open(diff, encoding="utf-8"))
    allow_abs = [os.path.abspath(a) for a in allow]
    new = [p for p in cur if p not in before and not any(os.path.abspath(p).startswith(a) for a in allow_abs)]
    changed = [p for p in cur if p in before and before[p] != cur[p] and not any(os.path.abspath(p).startswith(a) for a in allow_abs)]
    # 시스템 임시 잡음은 보고만 하고 판정은 레포 안 파일로 한다
    repo_new = [p for p in new if os.path.abspath(p).startswith(os.path.abspath(ROOT))]
    repo_changed = [p for p in changed if os.path.abspath(p).startswith(os.path.abspath(ROOT))]
    print(f"새 파일(레포 안, 허용 밖): {repo_new}")
    print(f"바뀐 파일(레포 안, 허용 밖): {repo_changed}")
    return 1 if repo_new or repo_changed else 0


def forbidden(files: list[str]) -> int:
    hits = 0
    for f in files:
        if f.lower().endswith(".pdf"):
            import fitz

            text = "".join(p.get_text() for p in fitz.open(f))
        elif f.lower().endswith(".hwpx"):
            import zipfile

            z = zipfile.ZipFile(f)
            text = "".join(z.read(n).decode("utf-8", "replace") for n in z.namelist() if n.endswith(".xml"))
            text = re.sub(r"<[^>]+>", "", text)
        else:
            text = open(f, encoding="utf-8", errors="replace").read()
        for pat in FORBIDDEN:
            for m in re.finditer(pat, text):
                hits += 1
                print(f"✗ {f}: {pat} → …{text[max(0, m.start() - 20):m.end() + 20]!r}")
    print("금지어:", "없음" if not hits else f"{hits}건")
    return 1 if hits else 0


def crop(pdf: str, map_path: str, out_jpg: str) -> int:
    import fitz
    from PIL import Image, ImageDraw

    m = json.load(open(map_path, encoding="utf-8"))
    spots = m.get("stamps") or {}
    doc = fitz.open(pdf)
    tiles = []
    for key, s in spots.items():
        page = doc[s["page"] - 1]
        clip = fitz.Rect(s["x"] - 130, s["y"] - 60, s["x"] + 130, s["y"] + 60)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip)
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, im.width - 1, 14], fill=(255, 255, 255))
        d.text((2, 1), f"{m['form_id']} / {key} p{s['page']}", fill=(0, 0, 160))
        tiles.append(im)
    if not tiles:
        print("도장 자리 없음")
        return 1
    tw, th = tiles[0].size
    cols = min(2, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (200, 200, 200))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    sheet.save(out_jpg, quality=75)
    print(f"crop {len(tiles)} 자리 → {out_jpg} {os.path.getsize(out_jpg)} B (300KB 넘으면 Read 훅이 막는다)")
    imgs = sum(len(p.get_image_info()) for p in doc)
    orig_path = os.path.join(ROOT, "forms", "bundled", f"{m['form_id']}.pdf")
    orig = sum(len(p.get_image_info()) for p in fitz.open(orig_path)) if os.path.exists(orig_path) else None
    added = imgs - orig if orig is not None else None
    print(f"PDF 안 그림 객체 원본 {orig} → 결과 {imgs} (+{added}, 자리 {len(spots)})")
    return 0 if added == len(spots) else 1


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    cmd = a[0]
    if cmd == "doctor":
        sys.exit(doctor("--remote" in a))
    if cmd == "snapshot":
        diff = a[a.index("--diff") + 1] if "--diff" in a else None
        allow = [a[i + 1] for i, v in enumerate(a) if v == "--allow"]
        sys.exit(snapshot(a[1], diff, allow))
    if cmd == "forbidden":
        sys.exit(forbidden(a[1:]))
    if cmd == "crop":
        sys.exit(crop(a[1], a[2], a[3]))
    print(__doc__)
    sys.exit(2)
