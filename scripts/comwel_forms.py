"""근로복지공단 서식자료실(board_no=224) 수집기.

사용:
  python3 -I scripts/comwel_forms.py list [--category 157] [--pages 6]      # 목록 출력(제목 | article_no | 날짜)
  python3 -I scripts/comwel_forms.py get <article_no> [<article_no> ...]    # 첨부 전부 forms/raw/<article_no>/ 에 저장 + sha256
  python3 -I scripts/comwel_forms.py search <키워드>                         # 목록에서 키워드가 든 글만

정본 출처 = https://www.comwel.or.kr/comwel/info/data/papr/papr_lst.jsp
첨부 다운로드 = /_custom/kcom/_common/board/download.jsp?attach_no=N
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://www.comwel.or.kr"
LIST = BASE + "/comwel/info/data/papr/papr_lst.jsp"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "forms" / "raw"


import http.cookiejar

# 공단 download.jsp 는 세션 쿠키 + Referer(상세 페이지) 가 없으면 286B 「다운로드 권한이 없습니다」 리다이렉트 HTML 을 준다(실측 261026).
_JAR = http.cookiejar.CookieJar()
_OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_JAR))


def fetch(url: str, referer: str | None = None) -> bytes:
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with _OPENER.open(req, timeout=60) as r:
        data = r.read()
    if len(data) < 1000 and b"Redirect page" in data:
        raise RuntimeError(f"다운로드 권한 거부(쿠키/Referer): {url}")
    return data


def list_page(offset: int, category: str | None) -> list[dict]:
    q = {"board_no": "224", "pager.offset": str(offset)}
    if category:
        q["search:search_category:category"] = category
    h = fetch(LIST + "?" + urllib.parse.urlencode(q)).decode("utf-8", "ignore")
    out = []
    for m in re.finditer(r'<a[^>]*href="([^"]*mode=view[^"]*article_no=(\d+)[^"]*)"[^>]*>(.*?)</a>', h, re.S):
        title = html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).strip()
        title = re.sub(r"\s+", " ", title)
        if title:
            out.append({"article_no": m.group(2), "title": title})
    # 중복 제거(제목 링크·아이콘 링크)
    seen, uniq = set(), []
    for o in out:
        if o["article_no"] not in seen:
            seen.add(o["article_no"])
            uniq.append(o)
    return uniq


def cmd_list(category: str | None, pages: int, keyword: str | None = None) -> None:
    for p in range(pages):
        rows = list_page(p * 10, category)
        if not rows:
            break
        for r in rows:
            if keyword and keyword not in r["title"]:
                continue
            print(f'{r["article_no"]} | {r["title"]}')


def attachments(article_no: str) -> list[dict]:
    url = f"{LIST}?mode=view&article_no={article_no}&board_wrapper=%2Fcomwel%2Finfo%2Fdata%2Fpapr%2Fpapr_lst.jsp"
    h = fetch(url).decode("utf-8", "ignore")
    title = re.search(r"<title>(.*?)</title>", h, re.S)
    out = []
    for m in re.finditer(r'<a[^>]*href="(/_custom/kcom/_common/board/download\.jsp\?attach_no=(\d+))"[^>]*title="([^"]*?)\s*다운로드"', h):
        out.append({"attach_no": m.group(2), "url": BASE + m.group(1), "name": html.unescape(m.group(3))})
    date = re.search(r"(20\d\d[.\-/]\d\d[.\-/]\d\d)", h)
    return [{"article_title": html.unescape(title.group(1)).strip() if title else "", "date": date.group(1) if date else None, "view_url": url, "files": out}]


def cmd_get(article_nos: list[str]) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    ledger = []
    for no in article_nos:
        info = attachments(no)[0]
        d = RAW / no
        d.mkdir(exist_ok=True)
        for f in info["files"]:
            data = fetch(f["url"], referer=info["view_url"])
            name = re.sub(r'[\\/:*?"<>|]', "_", f["name"])
            (d / name).write_bytes(data)
            sha = hashlib.sha256(data).hexdigest()
            ledger.append({"article_no": no, "attach_no": f["attach_no"], "file": name, "bytes": len(data), "sha256": sha})
            print(f"{no} | {name} | {len(data)} B | {sha[:16]}…")
    (RAW / "_download_ledger.json").write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"저장 {len(ledger)}건 → {RAW}")


def main(argv: list[str]) -> None:
    if not argv or argv[0] not in ("list", "get", "search"):
        print(__doc__)
        return
    if argv[0] == "list":
        cat = argv[argv.index("--category") + 1] if "--category" in argv else None
        pages = int(argv[argv.index("--pages") + 1]) if "--pages" in argv else 6
        cmd_list(cat, pages)
    elif argv[0] == "search":
        cmd_list(None, 15, argv[1])
    else:
        cmd_get(argv[1:])


if __name__ == "__main__":
    main(sys.argv[1:])
