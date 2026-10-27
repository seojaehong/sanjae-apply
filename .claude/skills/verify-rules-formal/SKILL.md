---
name: verify-rules-formal
description: "규칙 엔진(src/core·src/rules, buildPackage)의 입력 공간 전수 검증. 급여·재해 분기·제3자·치료 종결·태그·첨부 조합 10,368건 전부를 실제 코드에 넣어 types.ts·filter.ts·common.ts 가 한 약속 7가지가 모든 입력에서 지켜지는지 본다. src/core 나 src/rules 를 고쳤을 때, 급여·태그·첨부를 더했을 때, 「이 분기에서도 질문이 열리나」가 궁금할 때 쓴다."
---

# 규칙 엔진 전수 검증

## 무엇을 증명하나

`buildPackage(input)` 는 급여 종류와 재해 상황을 받아 공단에 낼 서식·첨부·열린 질문 목록을 돌려준다. 이 목록이 틀리면 재해자가 서식을 빠뜨리거나, 묻지 않은 전제로 신청서가 나간다. 표본 시험(`test/s01_yoyang.test.ts`·`test/s04_s13.test.ts`)은 규칙마다 한두 조합만 본다. 이 검증은 **선언된 입력 타입 전체**를 돈다.

입력 공간(`src/core/types.ts`)은 유한하다.

| 축 | 값 | 수 |
|---|---|---:|
| `claim` | `CLAIM_TYPES` | 9 |
| `accidentKind` | `ACCIDENT_KINDS` + `UNDECLARED` | 4 |
| `thirdParty` | `true` · `false` · `UNDECLARED` | 3 |
| `treatmentEnded` | 같음 | 3 |
| `tags` | `TAGS` 의 모든 부분집합 | 16 |
| `have` | 없음 · 카탈로그 첨부 전부 | 2 |

곱 10,368건. 순수 함수라 11초 안에 끝난다. 「경계까지」가 아니라 타입이 허용하는 **모든 입력**이다. `have` 를 두 값으로 줄인 근거는 P4 가 「첨부는 첨부 상태만 바꾼다」를 증명하기 때문이다(중간 부분집합은 그 두 끝 사이의 단조 결과이고, 첨부별 PROVIDED 판정은 `common.ts` `Acc.attach` 한 줄이다).

## 도구와 이유

vitest 하나. 도메인이 유한하고 코드 자체를 돌리므로 모델(TLA+)도 입력 생성기(fast-check)도 필요 없다. 둘 다 레포에 없다. `/statechart` 는 TLA+ 전용이라 여기 해당 없다.

## 성질 7가지와 해악

`test/formal_rules.test.ts` 의 `it` 하나가 성질 하나다. 제목에 해악이 적혀 있다.

| | 성질 | 코드가 한 약속 | 깨지면 |
|---|---|---|---|
| P1 | 결정성. 같은 입력 두 번 = 같은 출력 | `run.ts` 「순수 함수」 | 같은 재해자가 다른 서식 목록을 받는다 |
| P2 | `UNDECLARED` 는 결정으로 읽지 않는다. 그 필드를 묻는 `open_confirmation` 이 있거나, 아니면 어떤 구체값을 넣어도 출력이 같다. 질문은 `UNDECLARED` 인 필드만 묻고 `affects` 는 `forms` 안에 있다 | `types.ts` 「NOT_APPLICABLE 로 읽지 않고 open_confirmations 로 보낸다」 | 묻지 않은 전제로 공단에 제출된다 |
| P3 | 어느 출력에도 승인 가능성·확률·적중 표현이 없다 | `filter.ts` | NOW.md 「절대 하지 말 것」을 제품이 어긴다 |
| P4 | `have` 는 첨부 상태만 바꾼다. 전부 주면 모두 PROVIDED 이고 forms·open_confirmations·notes·rules 는 ∅ 때와 같다. 안 주면 PROVIDED 없음. `READY_TO_SUBMIT` ⇔ 열린 질문 0 ∧ 첨부 전부 PROVIDED | `common.ts` `attach` · `run.ts` status | 첨부를 냈다고 서식이 바뀌거나 준비 안 된 패키지가 READY 로 나간다 |
| P5 | 서식·첨부 id 가 카탈로그에 있고 중복 없음. CONDITIONAL 은 조건문, SUBSTITUTABLE 은 대체물, 근거 조문 비지 않음 | `catalog.ts` · `common.ts` | 없는 서식을 안내하거나 조건 없는 「조건부」가 나간다 |
| P6 | 규칙표. 급여의 기본 규칙이 첫 번째, 기본 서식 REQUIRED. S-02 ⇔ 요양급여∧출퇴근, S-03 ⇔ 요양급여∧제3자, S-10 ⇔ 장해급여∧소음성난청, S-11 ⇔ 요양급여. 출퇴근·제3자 서식의 세 상태 | `s01_yoyang.ts` · `s04_s13.ts` | 분기 서식이 빠지거나 엉뚱한 급여에 붙는다 |
| P7 | 급여가 읽지 않는 태그는 출력을 바꾸지 않는다(장해: 소음·척추신경·관절, 간병료이송비보조기: 보조기, 나머지: 없음) | `TAGS` 주석 「사용자가 말한 것만」 | 다른 급여의 태그가 서식 목록에 샌다 |

## 실행

```bash
npx.cmd vitest run test/formal_rules.test.ts      # 윈도우. 맥·리눅스는 npx
```

8건 통과(도메인 크기 검사 1 + 성질 7)가 「통과」다. `npm test` 전체에도 포함된다.

## 실패했을 때, 진짜 버그와 모델 오류 가르기

실패 메시지의 라벨은 `급여/재해분기/3rd=…/ended=…/tags=…/have=…` 꼴이라 입력 한 건을 그대로 가리킨다.

1. 그 입력으로 `buildPackage` 를 직접 불러 출력을 본다(`node -e` 또는 vitest 한 건).
2. **의도한 변경인가.** 급여를 더했으면 P6 의 `BASE` 표에 한 줄, 태그를 더했으면 P7 의 `RELEVANT_TAGS` 에 넣는다. 이 두 표만 손으로 적은 것이고 나머지 도메인은 export 배열에서 자동으로 따라온다. 그 밖의 성질 본문을 고쳐서 통과시키지 않는다.
3. **의도하지 않았으면 코드 버그다.** 성질을 약하게 만들지 말고 코드를 고친다. 사용자가 시키지 않은 제품 코드 수정은 하지 않고 보고한다.

## 실패할 수 있음을 보였다 (261027, 커밋 bd0c9bc 기준)

성질마다 코드를 한 줄 망가뜨리고 돌린 뒤 `git checkout` 으로 되돌렸다. 전부 잡혔고 되돌린 뒤 8건 통과, `git status` 비어 있음.

| 변형 | 잡힌 성질 |
|---|---|
| `evalSelfPay` 의 치료 종결 UNDECLARED 질문을 `.note` 로 바꿈 | P2 |
| 휴업급여 안내문에 「승인 확률」 삽입 | P3 외 전부(`buildPackage` 가 던진다) |
| `Acc.attach` 가 영수증을 안 줘도 PROVIDED 로 | P4 |
| 요양급여 신청서를 두 번 `form()` | P5 |
| 출퇴근 조건을 `!== "DISEASE"` 로 | P6, P2 |
| 휴업급여가 보조기 태그를 읽어 note 추가 | P7 |
| `run.ts` notes 에 `Math.random()` | P1, P4, P7 외 |

## 다루지 않는 것

- **READY_TO_SUBMIT 인데 CONDITIONAL 서식이 남는 경우**는 의도된 동작이다. 간병료이송비보조기의 보조기 처방전, 장해급여의 지체장애 소견서는 태그를 말하지 않으면 CONDITIONAL 인 채 READY 가 된다. `TAGS` 는 「사용자가 말한 것만 넣는다」. 성질로 쓰지 않았다.
- 규칙 내용이 **법령·공단 규정에 맞는지**는 보지 않는다. 그것은 `test/refs.test.ts`(조문 제목 fixture 대조)와 사람의 몫이다.
- `have` 의 중간 부분집합(일부 첨부만 준 경우)은 돌리지 않는다. 위 「입력 공간」의 근거 참조.
- 서식 채우기(`src/fill`)·도장(`src/stamp`)·MCP 출구는 범위 밖이다. 그쪽은 `/verify-sanjae-apply`.

## 커버리지 기록과 동기화 커밋

- 대상: `src/core/run.ts` · `src/core/types.ts` · `src/core/filter.ts` · `src/core/catalog.ts` · `src/rules/common.ts` · `src/rules/s01_yoyang.ts` · `src/rules/s04_s13.ts`
- 검증 파일: `test/formal_rules.test.ts`
- **동기화 커밋: `bd0c9bc`** (2026-10-27). 이 커밋에서 검증이 위 파일들을 서술한다고 확인했다.

다음 에이전트는 `git log --oneline bd0c9bc..HEAD -- src/core src/rules` 가 비어 있지 않으면 성질 7개를 다시 읽고, 코드를 여전히 서술한다고 **확인한 뒤에만** 이 해시를 옮긴다. 검사만 통과했다고 옮기지 않는다.

변경 뒤 다시 맞추는 절차는 `/maintain-formal-verification-skill`(pstack).
