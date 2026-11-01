# 요양급여신청서 편집기

첫 화면의 「요양급여신청서 PDF 채우기」 단추를 누르면 편집기 창이 열리고, 요양급여신청서 74칸(1쪽 · 재해자와 재해 내용 / 2쪽 · 다른 보상과 개인정보 동의)에 값을 넣으면 오른쪽 미리보기에 공단 정본 PDF 위로 글자가 그려진다. 「PDF 내려받기」는 4쪽 PDF(3·4쪽은 의료기관 소견서 원본)를 준다. 채우기 자산(`app/editor.js`·`app/fill.js`·`assets/**`)은 단추를 누른 뒤에야 받고, 입력값은 어떤 요청에도 실리지 않는다.

## Sub-features

- `yoyang-lazy` 첫 화면 로드에서 채우기 자산 요청 0.
- `yoyang-open` 첫 화면 단추 문구 「요양급여신청서 PDF 채우기」 → 제목 「요양급여신청서 채우기」, 칸 74.
- `yoyang-fill` 견본 값을 넣으면 내려받기가 활성, 쪽 표시 「1 / 4쪽」, 미리보기에 PDF 픽셀.
- `yoyang-digits` 상자 수보다 긴 숫자는 내려받기를 막고 칸 이름과 자리 수를 알린다(게이트가 본다).
- `yoyang-download` 「요양급여신청서.pdf」, `%PDF`, 4쪽. 화면 PDF = 같은 값의 CLI 출력(게이트).
- `yoyang-groups` 근로자유형·예/아니오 묶음은 하나만, 선택을 비울 수 있다(게이트).
- `yoyang-390` 390px 에서 입력·미리보기 전환, 가로 넘침 0.
- `yoyang-no-leak` 저장소·쿠키·IndexedDB·쿼리 0, 모든 요청 같은 출처 정적 GET 200(여정 + 게이트).
- `yoyang-retry` PDF 자산을 못 받으면 내려받기 비활성, 다시 시도 뒤 입력값 유지(게이트).

## How to get to it (user POV)

- 첫 화면 `#try` 절의 단추 「요양급여신청서 PDF 채우기」.
- 확인표 결과(급여 종류 = 요양급여)의 「여기서 요양급여신청서 PDF 채우기」(같은 편집기. 이 지도에서는 첫 화면 단추만 구동).

## Driving it with verify.mts

Preconditions:

- `doctor` OK, `editorForms` 에 `F_YOYANG_APPLY`. 로컬이면 `dist/src/cli.js` 가 있다(게이트의 CLI 대조).

- **첫 로드.** `/` 를 networkidle 까지 연다. 여정의 요청에 `/app/editor.js`·`/app/fill.js`·`/assets/` 가 0.
- **열기.** `#try > [data-open-editor="F_YOYANG_APPLY"]` 문구가 「요양급여신청서 PDF 채우기」, 클릭 → `#editor` 보임, `[data-slot]` 74, `#editor-title` 「요양급여신청서 채우기」. `NN-F_YOYANG_APPLY-open.jpg`.
- **채우기.** `test/samples/F_YOYANG_APPLY.json` 을 칸별로 넣는다(불리언 true 는 check, 글자는 fill). `#editor-download:not([disabled])` 대기 → `#editor-page` 「1 / 4쪽」, 미리보기 canvas 픽셀. `NN-F_YOYANG_APPLY-filled-1440.jpg`, 넣은 값 `F_YOYANG_APPLY-values.json`.
- **내려받기.** `#editor-download` 클릭 → `downloads/요양급여신청서.pdf`, `%PDF`, pdf-lib 쪽 수 4.
- **금지어·폭.** 편집기 본문 금지어 0. 390×844 로 줄여 넘침 0, `#editor-show-preview` → `aria-busy=false` 대기 → 넘침 0, `NN-F_YOYANG_APPLY-preview-390.jpg`. `#editor-show-inputs` → Escape 로 닫힘.
- **게이트.** `scripts/verify_web_fill.mjs` 와 `scripts/verify_web_editor.mjs` 를 `URL=<base>/` 로 실행, 둘 다 exit 0. 로그 `gate-*.txt`, 게이트 산출 `gate-verify_web_editor/`(yoyang-first/latest 의 web·cli PDF 쌍과 스크린샷).
- **명령.** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature editor-yoyang [--base <URL>]`. 261101 로컬 실측 PASS(19/19, 게이트 2개 exit 0).

## Gotchas

- 첫 화면 단추와 결과 목록 단추가 같은 `data-open-editor="F_YOYANG_APPLY"` 를 가진다 — `#try >` 로 첫 화면 것만 잡는다.
- 3단계 판(261031 운영)은 단추가 값 없는 `data-open-editor` 에 문구 「요양급여 PDF 채우기」다. `--base 운영` 으로 돌리면 문구 검사에서 FAIL 이 맞다(판 차이). doctor 의 `editorEntries` 로 먼저 본다.
- 견본 `rrn` 은 하이픈이 든 합성 값이다. 화면은 숫자만 센다(13자리).
- 마지막 입력 직후에는 내려받기가 잠깐 비활성이다(낡은 PDF 를 주지 않으려고). 활성을 기다린 뒤 누른다.
- 화면 PDF = CLI 대조는 쪽 내용 스트림 해시다. 파일 바이트·크기는 실행마다 다르다(글꼴 부분집합 이름).
- 게이트 `verify_web_editor.mjs` 는 미지급 편집기까지 한 번에 돈다. 3단계 판 배포에 `--base` 로 돌리면 미지급 부분에서 실패한다.
