---
name: verify-sanjae
description: sanjae-apply 안내 페이지(웹, 운영 https://sanjae-apply.vercel.app)를 실제 브라우저로 사용자처럼 돌려 증거를 남기는 검증 스킬. 로컬 정적 서버(build:web 산출 public/)를 띄우거나 --base 로 배포 주소를 받아 신청 전 확인표·요양급여신청서 편집기·미지급 보험급여 청구서 편집기·원격 MCP 드라이런을 Playwright 로 구동하고 스크린샷·내려받은 PDF·게이트 로그·report.md 를 남긴다. 웹 화면(web/·public/)을 바꾼 브랜치의 로컬 증명, master 병합 뒤 운영 확인(doctor), 「화면에서 그렇게 보이나·입력값이 밖으로 안 나가나」를 물을 때 쓴다. CLI·한글(hwpx)·도장 표면은 verify-sanjae-apply. 기능 지도 = features/README.md.
---

# verify-sanjae — 안내 페이지를 사용자처럼 돌려 증명한다

앱을 처음 보는 에이전트가 작업 중간에 읽는다는 전제로 쓴다. 명령은 전부 **저장소 루트**에서 친다. 값은 `test/samples/*.json` 합성 값만 쓴다(실명·주민번호 금지). 이 페이지는 서버가 없다 — 확인표 판정·PDF 채우기가 전부 브라우저 안에서 돈다. 그래서 「입력값 외부 전송 0」은 **모든 요청이 같은 출처 정적 GET 200** 인지로 본다.

## 표면

- 주 표면 = 정적 페이지 `public/index.html` + `public/app/*.js`(esbuild 번들) + `public/assets/**`(공단 PDF·지도·나눔고딕). 버셀 `outputDirectory: public`.
- 부 표면 = 원격 MCP `/api/mcp/mcp`(버셀 함수, Bearer 토큰). 로컬 정적 서버에는 없다.
- CLI(`npx sanjae-apply`)·stdio MCP·한글 출력·도장은 이 스킬 밖이다 → `.claude/skills/verify-sanjae-apply/`.

## Launch

```
npm.cmd run build && npm.cmd run build:web
```

`dist/src/cli.js`(CLI, PDF=CLI 대조에 쓴다)와 `public/app/`·`public/data/`·`public/assets/`(gitignore)를 만든다. `build:web` 은 `public/index.html` 에 버전·서식 표를 다시 구우니 커밋 전에 `git status` 로 index.html 이 바뀌었는지 본다. 도우미는 `npm.cmd` 를 부르지 않는다(백그라운드 셸에서 `'C:\Program'` 사고 선례).

`drive`·`doctor` 가 `--base` 없이 돌면 **자기 프로세스 안에서** `public/` 을 `127.0.0.1:<빈 포트>` 로 서빙한다. `vercel.json` 의 `/` 머리글(CSP Report-Only·Referrer-Policy)을 index.html 응답에 그대로 싣는다 — 안 실으면 편집기 게이트의 CSP 음성 대조가 멈춘다. 준비 신호 = `LAUNCH 준비됨 http://127.0.0.1:<port>`. 시드 데이터·DB·환경 변수 없음. 여러 개를 동시에 띄워도 포트가 겹치지 않는다. 손으로 보고 싶으면 `serve` 로 띄워 두고 Ctrl+C 로 내린다.

## Doctor — 이 인스턴스를 돌릴 가치가 있나(읽기 전용)

```
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts doctor                                        # 로컬: 띄웠다 내린다
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts doctor --base https://sanjae-apply.vercel.app   # 운영
```

JSON 으로 낸다 — 빌드 산출 존재(로컬) · 페이지 버전(`data-version`) = package.json(로컬) · `/` 200 · 첫 화면 계약(`form#sheet`·`#result`·`#cli-line`·편집기 입구 단추 `editorEntries`) · 첫 화면 HTML 의 외부 출처 자원 0 · CSP Report-Only 머리글 · 주요 자산 13개 HEAD 200 · `data/forms.json`(서식 12·칸 836) · **`editorForms`** = `app/main.js` 에 묶인 편집기 서식 id. 끝 줄 `DOCTOR OK|FAIL — 편집기 서식 …`. `drive` 는 매번 이것을 먼저 돌리고 FAIL 이면 구동하지 않는다.

`editorForms` 가 판을 가른다 — 4단계(이 브랜치) = `F_UNPAID_CLAIM, F_YOYANG_APPLY`, 3단계(261031 운영) = `F_YOYANG_APPLY` 하나. 운영 반영을 확인할 때는 이 값과 `editorEntries` 문구를 본다.

## Drive

```
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts list
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature <id>                 # 로컬 정적 서버
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature all [--run <이름>]
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature <id> --base <URL>     # 떠 있는 배포
```

기능 id = `check` · `editor-yoyang` · `editor-unpaid` · `mcp`. 사용자 경로·핸들·기대값은 [features/README.md](features/README.md) 와 기능 파일에 있다. 핸들은 id·`data-*`·`name`/`value` 속성뿐이다(좌표·탭 순서 없음):

| 핸들 | 뜻 |
|---|---|
| `#sheet label.opt-box:has(input[name=claim][value=UNPAID])` | 확인표 선택지(라벨을 누른다 — input 은 시각적으로 감춰져 있다) |
| `#result-summary dd` ×3 · `#seal[data-state]` · `#cli-line` | 결과 숫자(서식·준비할 첨부·남은 질문) · 도장 ready/open · 같은 확인의 명령줄 |
| `#try > [data-open-editor="F_YOYANG_APPLY"]` | 첫 화면 요양 편집기 단추(결과 목록 안에도 같은 속성 단추가 하나 더 있다 — `>` 로 고정) |
| `#result [data-open-editor="F_UNPAID_CLAIM"]` | 확인표 「미지급 보험급여」 결과의 채우기 단추 |
| `#editor` · `[data-slot=<칸>]` · `[data-boxes]` | 편집기 dialog · 칸(지도 칸 이름) · 숫자 상자 수 |
| `#editor-download` · `#editor-page` · `#editor-preview canvas` | 내려받기(입력 중 비활성) · 「1 / N쪽」 · 미리보기 |
| `#editor-show-preview` / `#editor-show-inputs` | 390px 에서 미리보기/입력 전환 |

판정은 두 겹이다.
1. **이 도우미의 사용자 여정**(1440 → 390): 칸 수 · 쪽 수 · 내려받은 PDF(이름·`%PDF`·쪽 수) · 미리보기 픽셀 · 금지어 · 390 넘침 · 여정의 모든 요청이 같은 출처 GET 200 · 콘솔 오류 0.
2. **기존 게이트 호출**(복제하지 않는다): `scripts/verify_web_editor.mjs`(두 편집기 · 화면 PDF = CLI 쪽 내용 해시 · 저장소·쿠키·IndexedDB·쿼리 0 · 실패/재시도 · CSP 음성 대조)와 `scripts/verify_web_fill.mjs`(브라우저 채우기 = CLI, 도장 포함)를 `URL=<base>/ EVIDENCE_DIR=<run>/gate-*` 로 자식 프로세스 실행해 exit 0 을 요구한다. `all` 에서는 같은 게이트를 한 번만 돈다.

끝 줄 = `RESULT PASS|FAIL|SKIP — <기능별 상태>` 와 `EVIDENCE <경로>`. exit 0 = FAIL 없음(SKIP 은 실패가 아니지만 검증도 아니다 — 보고에 그대로 적는다).

## Evidence

`artifacts/verify-sanjae/<YYYYMMDD-HHMMSS>-<feature>/`(`all` 이면 그 아래 기능별 폴더). `artifacts/` 는 gitignore. cleanup 이 지우지 않는다.

- `doctor.json` · `report.md` · `report.json`(검사별 OK/FAIL, 여정의 요청 목록, 콘솔 오류, 검토어 문맥)
- `NN-<label>.jpg` — 행동 전후(확인표 결과 → 편집기 열림 → 채움 1440 → 미리보기 390). JPEG q55. **여러 장을 Read 하지 말고 PIL 로 결합해 한 번에 본다.**
- `downloads/<서식>.pdf` · `<FORM_ID>-values.json`(실제로 넣은 값) · `cli-check-<급여>.json`
- `gate-<게이트>.txt`(명령·exit·stdout) · `gate-<게이트>/`(게이트가 남긴 web/cli PDF 쌍·스크린샷)

증명 기준: ① 사용자 경로만 탄다(확인표 라벨 클릭 → 결과 단추 → 칸 입력 → 내려받기). `fill.js` 를 직접 import 하는 것은 게이트 ②의 몫이지 여정의 증거가 아니다. ② 행동과 결과 상태를 둘 다 찍는다. ③ 부수 효과(내려받은 파일, 요청 목록)를 화면과 함께 본다. ④ 금지어 = 레포 목록 두 벌 — `src/core/filter.ts` `findOutcomeLanguage`(dist 에서 import)와 `scripts/forbidden_words.mjs` `FORBIDDEN` — 이 0. 검토어(노무사·상담·진단·판정·자문·대리)는 문맥만 보고하고, **공단 원문 칸 이름 「대리인」은 예외**(261031 결정, 미지급 편집기에 2건 보인다). ⑤ 화면 PDF = CLI 는 게이트가 쪽 내용 스트림 해시로 본다(pdf-lib 글꼴 부분집합 이름이 실행마다 달라 바이트 비교는 안 된다).

## Cleanup

`drive`·`doctor` 는 끝나면(실패해도) 자기가 띄운 정적 서버(`server.close`)와 Playwright 브라우저만 닫는다. 게이트 자식 프로세스는 각자 자기 서버·브라우저를 닫고 끝난다. 별도 프로세스가 남지 않는다 — 확인은 `netstat -ano | grep :<port>` 에 LISTENING 이 없으면 된다(TIME_WAIT 는 정상). `taskkill /IM node.exe` 금지. 증거 폴더는 지우지 않는다.

## Helpers

- `scripts/verify.mts` — 위 명령 전부(`list`·`serve`·`doctor`·`drive`). Node 24 타입 제거로 바로 돈다(`enum` 등 변환이 필요한 문법은 쓰지 않는다). `playwright`·`pdf-lib` 는 레포 devDependencies. 플래그 `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` 은 선례(verify-llg·verify-safeclaw)와 명령 모양을 맞춘 것이다(이 레포는 `type: module` 이라 경고가 원래 없다).
- `scripts/forbidden_words.mjs`(레포) — 금지어·검토어 한 벌. `e2e_published.mjs` 도 이것을 쓴다.

## 알려진 한계

- `--base` 운영에서 `check`·`editor-*` 의 CLI 대조는 **이 체크아웃의 `dist`** 와 비교한다. 운영 판과 브랜치 판이 다르면 거짓 FAIL 이 날 수 있다 — 운영 확인은 master 체크아웃에서 돈다.
- 운영(261031 기준 3단계 판)에는 미지급 편집기가 없다. `editor-unpaid --base 운영` 은 「편집기 서식에 F_UNPAID_CLAIM 없음」 FAIL, `editor-yoyang --base 운영` 은 첫 화면 단추 문구(4단계 「요양급여신청서 PDF 채우기」 ↔ 3단계 「요양급여 PDF 채우기」)에서 FAIL 이 맞다. 병합·배포 뒤에 다시 돈다.
- Chromium 한 가지다. Safari·Firefox·실기기는 미실측.
- 게이트 `verify_web_editor.mjs` 는 두 편집기와 실패 경우를 한 번에 돈다(약 30~60초). 한 서식만 따로 돌리는 옵션은 없다.

## 유지

화면을 바꾼 커밋은 같은 커밋에서 기능 파일의 핸들·문구·기대값과 `verify.mts` 의 `EDITOR_SPECS` 를 고친다. 새 편집기 서식을 붙이면 `features/editor-<id>.md` 와 `FEATURES` 항목을 더한다. 주기 점검은 `/pstack:maintain-verification-skill`.
