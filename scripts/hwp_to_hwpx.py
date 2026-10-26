"""HWP → HWPX 일괄 변환(한글 COM, 윈도우 전용). 공단 HWP 서식을 한글 출력(hwpx 채우기)용으로 한 번 변환한다.

사용:
  python scripts/hwp_to_hwpx.py <입력.hwp> <출력.hwpx>              # 1건
  python scripts/hwp_to_hwpx.py --all                                # forms/raw → forms/hwpx/F_*.hwpx (아래 표)
한글(HWPFrame.HwpObject)이 설치돼 있어야 한다. 한글 세션 하나로 전부 처리하고, 이 스크립트가 띄운 한글만 끈다.
다른 세션이 한글을 쓰고 있으면 hwp_guard 가 멈춘다(시작 전 Get-Process Hwp 가 비어 있어야 한다).
변환본은 우리 파생물이다. 채우기 지도(forms/hwpx_maps)의 source_sha256 은 이 변환본의 해시를 쓴다.
"""
from __future__ import annotations

import hashlib
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.expanduser("~/.claude/scripts"))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# form_id → forms/raw 안 원본 HWP (재활보조기구 처방전 F_DEVICE_PRESCRIPTION 은 공단이 PDF 만 줘서 없다)
ALL = {
    "F_YOYANG_APPLY": "2232720/요양급여신청서 및 소견서(2026.7.7. 개정).hwp",
    "F_COMMUTE_REPORT": "2232721/(출퇴근재해)요양급여신청서및소견서(2026.7.7. 개정).hwp",
    "F_THIRD_PARTY_REPORT": "989916/제3자 행위에 따른 재해발생신고서 및 확인서.hwp",
    "F_YUJOK_CLAIM": "1182127/[별지 제15호 서식] 유족급여_진폐유족연금_장례비 청구서(20230705 개정).hwp",
    "F_SELF_PAY_CLAIM": "1182796/본인부담치료비 청구서(요양비, 본인부담금확인).hwp",
    "F_HUYEOP_CLAIM": "1182036/[별지 제7호 서식] 휴업급여 및 상병보상연금 청구서(20230705 개정).hwp",
    "F_CARE_TRANSPORT_DEVICE_CLAIM": "1204346/간병료이송비보조기 청구서.hwp",
    "F_UNPAID_CLAIM": "1182141/[별지 제29호 서식] 미지급 보험급여 청구서(20230705 개정).hwp",
    "F_JANGHAE_CLAIM": "1182065/[별지 제11호_제12호 서식] 장해급여(합병증등 예방관리) 청구(신청)서_소음작업종사사실 확인서_장해진단서_소견서_일시금연금 선택확인서(20230705 개정).hwp",
    "F_ADDITIONAL_DISEASE_APPLY": "1182798/[별지 제30,31호서식] 추가상병 신청서 및 소견서.hwp",
    "F_RE_YOYANG_APPLY": "1182803/[별지 제33호,제33의2서식] 재요양 신청서 및 소견서.hwp",
}


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def main() -> int:
    if "--all" in sys.argv:
        out_dir = os.path.join(ROOT, "forms", "hwpx")
        os.makedirs(out_dir, exist_ok=True)
        pairs = [(os.path.join(ROOT, "forms", "raw", rel), os.path.join(out_dir, f"{fid}.hwpx")) for fid, rel in ALL.items()]
    else:
        pairs = [(os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]))]

    import hwp_guard  # noqa: E402  다른 한글 창이 떠 있으면 kill_own 이 멈춘다
    import win32com.client as w

    hwp = w.gencache.EnsureDispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception:
        pass
    hwp.XHwpWindows.Item(0).Visible = False
    failed = 0
    try:
        for src, dst in pairs:
            if not os.path.exists(src):
                print("없음", src)
                failed += 1
                continue
            if not hwp.Open(src, "HWP", "forceopen:true"):
                print("열기 실패", src)
                failed += 1
                continue
            ok = hwp.SaveAs(dst, "HWPX", "")
            hwp.Clear(1)
            if ok and os.path.exists(dst):
                print(f"저장 {os.path.basename(dst)} {os.path.getsize(dst)}B sha256={sha256(dst)}")
            else:
                print("저장 실패", dst)
                failed += 1
    finally:
        try:
            hwp.Quit()
        except Exception:
            pass
        hwp_guard.kill_own()
    print(f"완료 {len(pairs) - failed}/{len(pairs)}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
