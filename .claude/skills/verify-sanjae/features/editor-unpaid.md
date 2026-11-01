# 미지급 보험급여 청구서 편집기

확인표에서 급여 종류 「미지급 보험급여」를 고르면 결과 서식 목록에 「여기서 미지급 보험급여 청구서 PDF 채우기」 단추가 나오고, 누르면 같은 편집기 창이 미지급 보험급여 청구서 63칸(1쪽)으로 열린다. 미지급 급여 종류 10칸은 여럿 고를 수 있고 수령계좌·확인사항①·행정정보 동의는 하나만 고른다. 「PDF 내려받기」는 1쪽 PDF 를 준다. 웹편집기 4단계(브랜치 `feat/web-editor-phase4-unpaid`, 261101 운영 미반영).

## Sub-features

- `unpaid-entry` 확인표 「미지급 보험급여」 → 결과 단추 문구 「여기서 미지급 보험급여 청구서 PDF 채우기」.
- `unpaid-open` 제목 「미지급 보험급여 청구서 채우기」, 칸 63, 쪽 표시 「1 / 1쪽」.
- `unpaid-digits` 견본 재해발생일 12자리 → 상자 8자리라 내려받기를 막는다, 8자리로 고쳐 넣으면 풀린다.
- `unpaid-download` 「미지급 보험급여 청구서.pdf」, `%PDF`, 1쪽. 화면 PDF = 같은 값의 CLI 출력(게이트, 최초값 + 수정값).
- `unpaid-groups` 미지급 급여 종류 체크박스 10(복수), 단일 선택 라디오 6 = 묶음 3, 각 묶음 비우기(게이트).
- `unpaid-agent-label` 공단 원문 칸 이름 「대리인 : 성명(서명란)」·「대리인 ☎ 전화번호」가 라벨로 보인다 — 금지어 예외(261031 결정).
- `unpaid-390` 390px 미리보기 넘침 0.
- `unpaid-no-leak` 저장소·쿠키·IndexedDB·쿼리 0, 모든 요청 같은 출처 정적 GET 200.
- `unpaid-retry` 지도·PDF 실패 뒤 같은 창에서 다시 시도, 앞 서식(요양 3쪽)의 쪽 안내가 남지 않는다(게이트).

## How to get to it (user POV)

- 첫 화면 「신청 전 확인표」에서 급여 종류 「미지급 보험급여」 → 결과 「서식」 목록의 「여기서 미지급 보험급여 청구서 PDF 채우기」. 첫 화면에 따로 단추는 없다(안내 문단이 이 경로를 알려 준다).

## Driving it with verify.mts

Preconditions:

- `doctor` OK, `editorForms` 에 `F_UNPAID_CLAIM`(없으면 이 기능은 FAIL 로 끝난다 — 판 차이를 적는다). 로컬이면 `dist/src/cli.js`.

- **입구.** `/` 를 연다. `#sheet label.opt-box:has(input[name=claim][value=UNPAID])` 클릭 → `#result [data-open-editor="F_UNPAID_CLAIM"]` 문구 확인. `NN-unpaid-check-result.jpg`.
- **열기.** 그 단추 클릭 → `[data-slot]` 63, `#editor-title` 「미지급 보험급여 청구서 채우기」. `NN-F_UNPAID_CLAIM-open.jpg`.
- **채우기.** `test/samples/F_UNPAID_CLAIM.json` 을 칸별로 넣는다. `accident_datetime` 은 12자리라 `data-boxes`=8 을 넘는다 → 그 순간 `#editor-download` 가 비활성인지 기록하고 앞 8자리로 고쳐 넣는다(넣은 값 `F_UNPAID_CLAIM-values.json`). 내려받기 활성 대기 → `#editor-page` 「1 / 1쪽」, 미리보기 픽셀. `NN-F_UNPAID_CLAIM-filled-1440.jpg`.
- **내려받기.** `downloads/미지급 보험급여 청구서.pdf`, `%PDF`, 쪽 수 1.
- **금지어·폭.** 편집기 본문 금지어 0, 「대리인」 2건은 보고만. 390 넘침 0, 미리보기 전환 뒤 넘침 0, `NN-F_UNPAID_CLAIM-preview-390.jpg`. Escape 로 닫힘.
- **게이트.** `scripts/verify_web_editor.mjs` 를 `URL=<base>/` 로 실행해 exit 0(PASS 줄 6: 요양·미지급·실패/재시도 2·빈 화면 재시도·CSP 음성 대조). 산출 `gate-verify_web_editor/unpaid-{first,latest}-{web,cli}.pdf`.
- **명령.** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature editor-unpaid [--base <URL>]`. 261101 로컬 실측 PASS(18/18, 게이트 PASS 6).

## Gotchas

- 3단계 판(261031 운영)에는 이 편집기가 없다. doctor `editorForms` = `F_YOYANG_APPLY` 하나면 운영 반영 전이다. 「단추가 없다」를 화면 결함으로 보고하지 않는다.
- 견본 JSON 의 재해일 12자리는 CLI 가 앞 8자리만 쓰는 값이다. 화면은 조용히 자르지 않고 거절한다 — 기준을 낮춰 잘라 넣고 통과시키는 게 아니라, 거절을 확인한 뒤 사용자가 하듯 고쳐 넣는다.
- 「대리인」을 금지어(대리)에 넣으면 이 화면에서 바로 FAIL 이다. 예외는 공단 원문 칸 이름에만 — 우리 문구에 「대리」가 새로 생기면 검토어 문맥에 나온다.
- 확인표 기본값(출퇴근·가해자 있음)은 그대로 둔 채 급여만 바꾼다. 다른 선택지를 바꿔도 서식 목록에 청구서는 남지만, 스크린샷 비교가 어긋난다.
- 게이트는 요양 편집기도 같이 돈다(따로 돌리는 옵션 없음). `all` 에서는 한 번만 돈다.
