# 관할 지방고용노동관서 · 산업재해조사표 접수 부서 데이터

사업장 주소로 관할 지방고용노동관서와 산업재해조사표를 받는 부서의 전화·팩스를 찾는 데 쓴다.
MCP 도구 `find_labor_office`, `get_accident_report_guide`(workplace_address), `fill_form`(산업재해조사표 결과의 `labor_office`)이 읽는다.

## 어디서 왔나

| 항목 | 값 |
|---|---|
| 원본 폴더 | `C:/Users/iceam/dev/labor-office-directory/` (별도 작업으로 만든 데이터) |
| 원본 확인일 | 2026-11-04 (KST) — `labor_offices.json` 의 `meta.checked` |
| 이 저장소로 복사한 날 | 2026-11-04 22:19 (KST) |
| 관할 근거 | 「고용노동부와 그 소속기관 직제 시행규칙」 별표 1(관할 구역)·별표 3(상위청), <개정 2026. 6. 30.>, 2026-07-01 시행 |
| 연락처 근거 | 각 관서 고용노동부 누리집 부서 안내 화면(`moel.go.kr/local/{관서}/introduce/dept/list.do`) |

## 파일

| 파일 | 내용 | sha256 (복사 시점) |
|---|---|---|
| `labor_offices.json` | 관서 49곳, 부서 111행. 조사표 접수 부서(`accident_report`)의 전화·팩스·주소·출처·확인방법 | `3e6d0230…` |
| `jurisdiction.json` | 시도·시군구 → 관서. 옛 이름·시도 이동·읍면 단위 예외(칠곡군 석적읍)·제주 연락처 예외 | `ca68830f…` |
| `upstream/find.mjs` | 원본 찾기 로직. 이 저장소는 `src/accident/jurisdiction.ts` 로 옮겨 쓴다(실행하지 않는 참고본) | `44d4b61c…` |
| `upstream/find.test.mjs` | 원본 시험 15건. 같은 사례를 `test/labor-office.test.ts` 로 옮겼다 | `e2dd4e83…` |
| `upstream/README.md` | 원본 설명(확인 방법 정의, 미확인·주의 목록) | `badb2fbc…` |
| `upstream/audit.md` | 원본 점검 결과(전화·팩스 칸 밀림 0건, 성명 누출 0건 등) | `362d05a9…` |

npm 패키지와 Vercel 함수에는 JSON 두 개만 들어간다(`package.json` files, `vercel.json` includeFiles).

## 확인방법 값

| 값 | 뜻 |
|---|---|
| 공식 직접 확인 | 관서 부서 화면에서 직접 읽은 번호 |
| 두 리서치 일치 | 공식 화면에 없고 외부 조사 두 곳이 같은 번호를 냄 |
| 단일 출처 | 출처가 하나뿐(여수지청 산재예방감독과 팩스 — 2025-09 부서별 전자팩스번호표) |
| 미확인 | 번호를 찾지 못함. 지어내지 않는다 |

## 주의

- 지방청 7곳(서울·경기·중부·부산·대구·광주·대전)의 직할 구역은 조사표 접수 과가 확정되지 않았다. 산재예방감독과를 기본, 광역산재예방감독과를 보조로 두 번호를 함께 내고 「제출 전 전화 확인 권장」을 붙인다.
- 광주청 광역산재예방감독과는 화면에 전화·팩스가 없어 「미확인」이다.
- 직원 성명은 데이터에 없다. 넣지 않는다. 도구 출력도 부서·번호·주소·출처만 낸다.
- 번호는 확인일 기준이다. 관서 이전·조직 개편으로 바뀔 수 있다.

## 다시 가져오는 법

원본 폴더에서 데이터를 고쳤으면 JSON 두 개와 `upstream/` 네 파일을 다시 복사하고, 위 표의 확인일·sha256 을 고친 뒤
`npm.cmd test` 를 돌린다(`test/labor-office.test.ts` 가 원본 시험과 같은 사례를 본다). 원본 `find.mjs` 의 규칙이 바뀌었으면
`src/accident/jurisdiction.ts` 도 같이 고친다.
