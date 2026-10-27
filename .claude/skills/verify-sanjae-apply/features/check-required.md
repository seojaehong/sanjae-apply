# 필요 서식 확인

사용자가 급여 종류와 재해 상황을 말하면 공단에 낼 서식·첨부·근거 조문·절차 안내·아직 답하지 않은 질문 목록을 받는다. 승인 가능성은 어디에도 나오지 않는다.

## Sub-features

- `check-basic` 급여 하나로 기본 서식·첨부·규칙 id 가 나온다.
- `check-branch` 출퇴근·제3자·태그가 분기 서식을 더한다.
- `check-undeclared` 말하지 않은 분기는 열린 질문으로 돌아온다.
- `check-have` 준비했다고 말한 첨부는 PROVIDED 가 되고 서식 목록은 그대로다.
- `check-json` `--json` 으로 기계가 읽는 출력.

## How to get to it (user POV)

- 터미널: `npx -y sanjae-apply check <급여> [--accident …] [--third-party yes|no] [--ended yes|no] [--tags A,B] [--have X,Y] [--json]`
- MCP: `list_required_forms` 도구(stdio·원격 공통).

## Driving it with sanjae-apply CLI·scripts

Preconditions:

- `dist/src/cli.js` 있음, `$RUN` 있음.

- **기본.** 요양급여를 묻는다. Run `node dist/src/cli.js check YOYANG --accident WORK_ACCIDENT --third-party no --ended no --json > $RUN/check_basic.json`. 종료 코드 0. `rules_applied` 가 `["S-01","S-11"]`, `forms` 에 `F_YOYANG_APPLY` 와 `F_YOYANG_OPINION` 이 REQUIRED, `F_COMMUTE_REPORT` 와 `F_THIRD_PARTY_REPORT` 가 NOT_APPLICABLE.
- **분기.** 출퇴근 + 제3자. Run `node dist/src/cli.js check YOYANG --accident COMMUTE --third-party yes --json > $RUN/check_branch.json`. `rules_applied` 에 S-02·S-03, `F_COMMUTE_REPORT`·`F_THIRD_PARTY_REPORT` 가 REQUIRED.
- **열린 질문.** 분기를 말하지 않는다. Run `node dist/src/cli.js check YOYANG --json > $RUN/check_undeclared.json`. `open_confirmations` 2건(`accidentKind`·`thirdParty`), `status` 가 INCOMPLETE, 두 서식이 CONDITIONAL.
- **첨부.** 소견서를 준비했다고 말한다. Run `node dist/src/cli.js check YOYANG --accident WORK_ACCIDENT --third-party no --have A_MEDICAL_OPINION --json > $RUN/check_have.json`. `A_MEDICAL_OPINION` 이 PROVIDED, `forms` 는 기본과 같다.
- **장해 소음성 난청.** Run `node dist/src/cli.js check JANGHAE --tags NOISE_HEARING_LOSS --json > $RUN/check_noise.json`. S-10 과 `F_NOISE_WORK_CERT` REQUIRED.
- **금지어.** Run `python .claude/skills/verify-sanjae-apply/verify_drive.py forbidden $RUN/check_*.json`. 「없음」.
- **증거.** `$RUN/check_*.json` 다섯 파일과 금지어 출력.

## Gotchas

- 급여 이름은 `CLAIM_TYPES` 의 대문자 id 다(`YOYANG`, `HUYEOP`, …). 한글 이름은 받지 않는다.
- `--json` 없이 실행하면 사람용 텍스트가 나와 필드 단정이 흔들린다. 증거는 `--json` 으로.
- 열린 질문이 있는데 `READY_TO_SUBMIT` 이면 버그다. 그 조합은 `test/formal_rules.test.ts`(전수)에서 먼저 깨진다. `/verify-rules-formal` 을 본다.
- 보조기·지체장애 소견서는 태그를 말하지 않으면 CONDITIONAL 인 채 READY 가 될 수 있다. 의도된 동작이다.
