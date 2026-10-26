"""HWP → PDF (한글 COM, 윈도우 전용). 공단이 HWP 만 주는 서식(추가상병·재요양)을 오버레이용 PDF 로 만든다.

사용: python scripts/hwp_to_pdf.py <입력.hwp> <출력.pdf>
한글(HWPFrame.HwpObject)이 설치돼 있어야 한다. 변환본은 우리 파생물이므로 forms/catalog.json 의 원본 sha256 과
별도로, 좌표 지도의 source_sha256 은 이 변환본 PDF 의 해시를 쓴다(변환이 달라지면 좌표도 다시 잰다).
"""
from __future__ import annotations

import os
import sys

sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    src, dst = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    import win32com.client as w

    hwp = w.gencache.EnsureDispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception:
        pass
    hwp.XHwpWindows.Item(0).Visible = False
    if not hwp.Open(src, "HWP", "forceopen:true"):
        print("열기 실패", src)
        return 1
    ok = hwp.SaveAs(dst, "PDF", "")
    hwp.Clear(1)
    hwp.Quit()
    print("저장" if ok else "저장 실패", dst, os.path.getsize(dst) if os.path.exists(dst) else 0)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
