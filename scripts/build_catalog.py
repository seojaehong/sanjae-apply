"""forms/raw/_download_ledger.json(공단 다운로드 결과) → forms/catalog.json(정본 대장) 생성.

사용: python3 -I scripts/build_catalog.py
서식 id ↔ 공단 게시글(article_no) 매핑은 아래 MAP 에 둔다. 파일은 커밋하지 않고 해시만 커밋한다.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "forms" / "raw" / "_download_ledger.json"
OUT = ROOT / "forms" / "catalog.json"
LIST = "https://www.comwel.or.kr/comwel/info/data/papr/papr_lst.jsp"

# article_no → (서식 id 들, 게시글 제목)
MAP: dict[str, tuple[list[str], str]] = {
    "2232720": (["F_YOYANG_APPLY", "F_YOYANG_OPINION"], "요양급여신청서 및 소견서(2026.7.7. 개정)"),
    "2232721": (["F_COMMUTE_REPORT"], "(출퇴근재해) 요양급여신청서 서식 모음(2026.7.7. 개정)"),
    "989916": (["F_THIRD_PARTY_REPORT"], "제3자의 행위에 따른 재해발생신고서 및 확인서"),
    "1182127": (["F_YUJOK_CLAIM"], "유족급여_진폐유족연금_장례비 청구서(2023.07.05 개정)"),
    "1182796": (["F_SELF_PAY_CLAIM"], "[별지 제10호서식]본인부담치료비 청구서(요양비, 본인부담금확인)"),
    "1182036": (["F_HUYEOP_CLAIM"], "휴업급여 및 상병보상연금 청구서(2023.07.05 개정)"),
    "1204346": (["F_CARE_TRANSPORT_DEVICE_CLAIM"], "간병료/이송비/보조기 청구서"),
    "2252219": (["F_DEVICE_PRESCRIPTION"], "재활보조기구 처방전 및 검수확인서(별지 제1호~별지 제8호 서식)25.12.31.개정"),
    "1182141": (["F_UNPAID_CLAIM"], "미지급 보험급여 청구서(2023.07.05 개정)"),
    "1182065": (["F_JANGHAE_CLAIM", "F_LIMB_OPINION", "F_NOISE_WORK_CERT"], "장해급여 청구서_합병증등 예방관리 신청서_소음작업종사사실 확인서_장해진단서_소견서_일시금연금 선택확인서(2023.07.05 개정)"),
    "1182805": (["(병원 제출) 진료계획서"], "[별지제7호서식]진료계획서(2024.7.15. 개정)"),
    "1182798": (["F_ADDITIONAL_DISEASE_APPLY"], "[별지 제30,31호서식] 추가상병신청서+소견서(2023.7.5.개정)"),
    "1182803": (["F_RE_YOYANG_APPLY"], "[별지 제33호, 33의2서식] 재요양신청서+소견서(2023.7.5. 개정)"),
}


def revised_of(title: str) -> str | None:
    m = re.search(r"(20\d\d)[.\s]*(\d{1,2})[.\s]*(\d{1,2})", title) or re.search(r"\b(\d\d)\.(\d{1,2})\.(\d{1,2})\.", title)
    if not m:
        return None
    y = m.group(1) if len(m.group(1)) == 4 else "20" + m.group(1)
    return f"{y}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def main() -> None:
    rows = json.loads(LEDGER.read_text(encoding="utf-8"))
    by_article: dict[str, list[dict]] = {}
    for r in rows:
        by_article.setdefault(r["article_no"], []).append(r)
    forms = []
    for no, (ids, title) in MAP.items():
        files = [{"file": r["file"], "bytes": r["bytes"], "sha256": r["sha256"], "attach_no": r["attach_no"]} for r in by_article.get(no, [])]
        forms.append({
            "ids": ids,
            "article_no": no,
            "article_title": title,
            "revised": revised_of(title),
            "view_url": f"{LIST}?mode=view&article_no={no}",
            "files": files,
        })
    out = {
        "_about": "공단 서식 정본 대장. 파일은 forms/raw/(미커밋)에 두고 여기에는 파일명·개정일·sha256 만 적는다. 법제처 별표서식 API(licbyl)에는 산재 시행규칙 별지 서식이 안 잡혀(실측 261026) 정본 출처는 근로복지공단 서식자료실이다.",
        "source": {
            "name": "근로복지공단 > 정보공개 > 자료실 > 서식자료 (board_no=224, 산재보험 분류 157)",
            "url": LIST,
            "download": "/_custom/kcom/_common/board/download.jsp?attach_no=N — 세션 쿠키 + Referer(상세 페이지) 필수",
            "fetched_at": "2026-10-26",
            "tool": "scripts/comwel_forms.py",
        },
        "forms": forms,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n = sum(len(f["files"]) for f in forms)
    print(f"대장 생성: 게시글 {len(forms)} · 파일 {n} → {OUT}")
    for f in forms:
        if not f["files"]:
            print("  ⚠ 파일 없음:", f["article_no"], f["article_title"])


if __name__ == "__main__":
    main()
