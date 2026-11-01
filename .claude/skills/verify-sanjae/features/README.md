# 산재 신청 도우미 안내 페이지 검증 지도

이 폴더는 sanjae-apply 안내 페이지(웹)의 사용자 가시 동작을 검증하는 유지 대상 정본이다. 구동하기 전에 이 색인을 읽고, 맞는 기능 파일을 조리법으로 쓴다. CLI·stdio MCP·한글(hwpx)·도장 표면의 지도는 `.claude/skills/verify-sanjae-apply/features/` 에 있다(여기서 다시 쓰지 않는다).

## 기본 전제

- `npm.cmd run build && npm.cmd run build:web` 이 끝나 `dist/src/cli.js` 와 `public/app/`·`public/assets/` 가 있다.
- 인스턴스는 `verify.mts drive` 가 띄운 로컬 정적 서버(`http://127.0.0.1:<빈 포트>`) 또는 `--base` 로 준 배포 주소. 운영은 `https://sanjae-apply.vercel.app`.
- 시드·로그인 없음. 첫 화면 확인표 기본값 = 요양급여 · 출퇴근 중 사고 · 가해자 있음 · 치료 종결 아직 모름.
- 값은 `test/samples/<FORM_ID>.json` 합성 값만. 실명·주민번호를 넣지 않는다.
- `doctor` 가 OK 가 아니면 구동하지 않는다. 이 실행이 띄우지 않은 서버·브라우저를 조작하지 않는다.

## 구동 규칙

- 선택자는 id·`data-*`·`name`/`value` 속성만. 좌표·탭 순서·CSS 위치 금지.
- 확인표 선택지는 감춰진 input 이 아니라 그것을 감싼 `label.opt-box` 를 누른다.
- 기다림은 상태로 한다 — 칸 수가 기대값이 될 때, `#editor-download` 가 활성일 때, `#editor-preview[aria-busy=false]` 일 때. 고정 sleep 금지.
- 기본 폭 1440×1000 에서 입력하고 390×844 로 줄여 넘침·미리보기를 본다.
- 본문 금지어(레포 목록 두 벌)는 0. 검토어는 문맥만 보고, 공단 원문 칸 이름 「대리인」은 예외.

## 증명과 건너뜀 보고

- 행동 전·후 스크린샷, 내려받은 PDF, 실제로 넣은 값, 게이트 로그, 여정의 요청 목록, 콘솔 오류 수를 `report.md` 에 남긴다.
- 「입력값 외부 전송 0」= 여정의 모든 요청이 같은 출처 GET 이고 응답이 전부 200 + 게이트의 저장소·쿠키·IndexedDB·쿼리 0.
- 「화면 PDF = CLI」= 게이트(`verify_web_editor.mjs`·`verify_web_fill.mjs`)의 쪽 내용 해시 일치. 여정은 이름·`%PDF`·쪽 수까지만 본다.
- 닿지 못한 입구는 시도한 명령과 못 맞춘 전제를 적는다(`SKIP` 사유). 다른 입구로 통과한 것을 그 입구의 검증으로 적지 않는다.

## 기능 파일 계약

H1 제목과 사용자에게 보이는 동작 한 문단, 그 뒤 H2 네 개를 이 순서로 — `Sub-features` · `How to get to it (user POV)` · `Driving it with verify.mts` · `Gotchas`. 구현 세부는 쓰지 않는다. 사용자 경로·안정 핸들·필요한 상태·명령·관찰 가능한 증거만.

## 기능

- [신청 전 확인표](./check.md) `check` — 급여·재해 선택 → 결과 숫자·도장·명령줄이 같은 입력의 CLI `check --json` 과 같다. 3개 사례(요양 업무상 / 미지급 출퇴근 / 장해 질병+소음성 난청).
- [요양급여신청서 편집기](./editor-yoyang.md) `editor-yoyang` — 첫 화면 단추 → 74칸 → PDF 4쪽, 게이트 2개.
- [미지급 보험급여 청구서 편집기](./editor-unpaid.md) `editor-unpaid` — 확인표 「미지급 보험급여」 결과 단추 → 63칸 → PDF 1쪽, 게이트 1개. 4단계(미배포).
- [원격 MCP](./mcp.md) `mcp` — `--base` 배포의 `/api/mcp/mcp` 드라이런. 토큰 없으면·로컬이면 SKIP.

## 아직 지도가 없는 표면

나머지 10종 서식의 「PDF·한글로 채울 수 있음」 링크(`#forms` 표로 이동만, 화면 채우기 없음) · 매뉴얼 탭(`#manual-install` 의 `t-*` 탭 5개, 복사 단추) · 결과의 「준비함」 덜어내기·근거 조문 law.go.kr 링크 · JS 꺼진 상태의 서식 표 · 다크 모드. 화면 도장·한글 출력이 웹에 붙으면 그때 추가한다.
