# 신청 전 확인표

설치하지 않고 첫 화면에서 급여 종류·재해 유형·가해자·치료 종결·해당 태그를 고르면, 오른쪽 「확인 결과」에 서식·준비할 첨부·남은 질문 수와 서식 목록·첨부·근거 조문이 바로 나오고, 아래 「같은 확인을 명령줄로」에 같은 확인의 CLI 명령이 적힌다. 판정은 브라우저 안 번들(`app/engine.js`)이 하고 고른 값은 주소에도 요청에도 붙지 않는다.

## Sub-features

- `check-pick` 선택지를 고르면 결과가 즉시 다시 그려진다(제출 단추 없음).
- `check-summary` 결과 숫자 3개(서식·준비할 첨부·남은 질문)가 CLI `check --json` 과 같다.
- `check-seal` 도장 `#seal[data-state]` 가 CLI `status`(READY_TO_SUBMIT → ready, 그 밖 → open)와 같다.
- `check-cli-line` `#cli-line` 이 `npx -y sanjae-apply check …` 형식이고 그 인자를 그대로 CLI 에 주면 같은 숫자가 나온다.
- `check-unpaid-entry` 「미지급 보험급여」 결과에 편집기 단추가 있다(이 배포의 `editorForms` 에 F_UNPAID_CLAIM 이 있을 때만 1개, 없으면 0개).
- `check-no-query` 고른 값이 주소(쿼리)에 붙지 않는다.

## How to get to it (user POV)

- 첫 화면 「설치 전에 여기서 먼저 확인해 보세요」 절(`#try`)의 「신청 전 확인표」.
- 같은 확인을 터미널로 — `#cli-line` 의 명령을 복사해 실행(여기서는 레포 `node dist/src/cli.js check … --json` 으로 대신한다. 게시 패키지 경로는 verify-sanjae-apply).

## Driving it with verify.mts

Preconditions:

- `doctor` OK. 로컬이면 `dist/src/cli.js` 가 이 체크아웃 빌드다.

- **사례 고르기.** 세 사례를 차례로 고른다 — ① 요양급여·업무상 사고·가해자 없음·치료 중 ② 미지급 보험급여·출퇴근 중 사고·가해자 있음·아직 모름 ③ 장해급여·업무상 질병·가해자 아직 모름·끝남 + 소음성 난청. 각 선택지는 `#sheet label.opt-box:has(input[name=<칸>][value=<값>])` 클릭. 앞 사례에서 켠 태그는 같은 라벨을 다시 눌러 끈다.
- **화면 읽기.** `#result-summary dd` 세 값, `#seal` 의 `data-state`, `#cli-line` 글자. 스크린샷 `NN-check-<급여>.jpg`.
- **CLI 대조.** `#cli-line` 에서 `npx -y sanjae-apply check ` 뒤 인자를 떼어 `node dist/src/cli.js check <인자> --json` 실행 → `cli-check-<급여>.json`. 기대 = [NOT_APPLICABLE 아닌 서식 수, PROVIDED 아닌 첨부 수, open_confirmations 수] 가 화면 세 값과 같다. 도장은 status 와 같다.
- **미지급 입구.** 사례 ②에서 `#result [data-open-editor="F_UNPAID_CLAIM"]` 수 = (editorForms 에 있으면 1, 없으면 0).
- **주소·금지어·폭.** `location.search` 가 빈 문자열. 페이지 본문 금지어 0(검토어 문맥은 보고만 — 「장해진단서」 같은 공단 서식 이름이 잡힌다). 390×844 에서 가로 넘침 0, `NN-check-390.jpg`.
- **명령.** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature check [--base <URL>]`. 261101 로컬 실측 20/20 PASS.

## Gotchas

- 결과 목록에도 `data-open-editor` 단추가 그려진다(기본값 요양급여면 「여기서 요양급여신청서 PDF 채우기」). 첫 화면 단추를 찾을 때 `[data-open-editor]` 만 쓰면 둘이 잡힌다.
- 「준비함」을 누르면 숫자(준비할 첨부)가 바뀌고 `#cli-line` 에 `--have` 가 붙는다. 이 지도는 「준비함」을 누르지 않는다 — 누른 뒤 대조하려면 `--have` 를 포함해 CLI 에 넘긴다.
- `--base` 운영이면 CLI 대조 대상은 이 체크아웃의 `dist` 다. 규칙(S-01~S-13)이 운영 판과 다르면 거짓 FAIL. 운영 확인은 master 체크아웃에서.
- 도장의 움직임(stamp 애니메이션)은 상태가 아니다. `data-state` 로 판정한다.
