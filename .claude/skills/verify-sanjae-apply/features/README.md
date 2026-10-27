# sanjae-apply 검증 지도

이 폴더는 sanjae-apply 의 사용자 가시 동작을 검증하는 유지 대상 원본이다. 앱을 몰기 전에 이 색인을 읽고, 맞는 기능 파일을 레시피로 쓴다.

## 기본 전제

- 레포 루트에서 `npm.cmd run build` 가 끝나 `dist/src/cli.js` 가 있다.
- `python .claude/skills/verify-sanjae-apply/verify_drive.py doctor` 가 통과했다.
- `RUN=.verify/<YYYYMMDD-HHMM>` 폴더를 만들었고 모든 산출물은 거기로 간다.
- 값은 `test/samples/<FORM_ID>.json` 의 합성 값만 쓴다.
- 한글 렌더 단계는 윈도우 + 한글 + `Get-Process Hwp` 0개일 때만 시작한다.
- 이 실행이 띄우지 않은 한글·프로세스는 건드리지 않는다.

## 드라이브 규칙

- 각 레시피는 기본 전제에서 시작한다. 전제가 다르면 그 파일의 Preconditions 가 말한다.
- 명령은 글자 그대로 친다. 인자·따옴표를 바꾸지 않는다.
- CLI 는 `node dist/src/cli.js …`, 원격 MCP 는 `node scripts/mcp_dryrun.mjs`, stdio MCP 는 `npx.cmd vitest run test/stdio.test.ts` 로 몬다.
- 결과 파일은 반드시 다시 열어 본다(fitz · zip). stdout 의 보고 JSON 만으로 끝내지 않는다.
- 정리할 때 `$RUN` 은 지우지 않는다.

## 증거와 건너뜀 보고

- 사용자 행동(명령)과 그 결과 상태(파일·stdout·종료 코드)를 함께 남긴다.
- PDF 증거 = `verify_fill.py` 의 JPEG + fitz 로 읽은 글자·그림 bbox. 날인 증거 = `verify_drive.py crop` JPEG.
- hwpx 증거 = zip 안 `BinData`·`content.hpf`·`<hp:pic>` 수 + (가능하면) 한글 렌더 PDF 의 쪽수·그림 bbox.
- 부작용 증거 = `snapshot --diff` 로 레포 안 새 파일 0건.
- 금지어 증거 = `verify_drive.py forbidden` 「없음」.
- 닿지 못한 경로는 시도한 명령과 못 맞춘 전제를 적는다. 다른 경로로 대신 검증했다고 적지 않는다.

## 기능 파일 규약

각 파일은 H1 제목과 사용자 가시 동작 한 문단으로 시작하고, H2 네 개를 이 순서로 둔다.

1. `Sub-features` 짧은 ID 와 한 줄 설명.
2. `How to get to it (user POV)` 사용자 진입점 전부.
3. `Driving it with sanjae-apply CLI·scripts` `Preconditions:` 로 시작하고, 사용자 행동·정확한 명령·관찰 결과를 한 불릿에 짝지어 적는다.
4. `Gotchas` 검증 실행을 낭비시키거나 무효로 만드는 함정.

구현 세부는 적지 않는다. 사용자 경로·안정된 핸들·필요한 상태·명령·관찰 가능한 증거만.

## 기능

- [필요 서식 확인](./check-required.md). `check` 명령과 `list_required_forms` 도구. 급여·재해 분기·제3자·치료 종결·태그·첨부 → 서식·첨부·열린 질문.
- [PDF 채우기 + 날인](./fill-pdf.md). 공단 정본 PDF 에 값과 도장. 12종.
- [한글(hwpx) 채우기 + 날인](./fill-hwpx.md). 같은 값을 hwpx 로. 11종. 렌더는 한글이 있는 윈도우에서만.
- [도장 PNG](./seal.md). `seal` 명령과 `make_seal` 도구. 성명인·법인형.
- [MCP 연결](./mcp.md). stdio(Claude Desktop 경로)와 원격(Vercel, Bearer).
