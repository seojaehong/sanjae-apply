# SafeClaw 연동 설계(산업재해조사표)

SafeClaw(현장 안전 문서·TBM·위험성평가 도구)에 쌓인 사업장·작업·위험요인·개선조치 자료를 산업재해조사표 작성에 쓰는 방법을 정리한다.
**설계만 한다.** SafeClaw 저장소와 운영 DB 는 고치지 않았다. 확인일 2026-11-04(KST), SafeClaw 로컬 사본 `safeguard-contest-mvp`(마지막 커밋 2026-07-20)의 `supabase/migrations/` 와 `lib/types.ts` 를 읽고 썼다. 운영 DB 의 실제 스키마와 다를 수 있다.

## 1. 원칙

1. **주민등록번호는 SafeClaw DB 에 저장하지 않는다.** 조사표는 앞 7자리(`rrn7`)만 받고, 그 값은 조사표를 만드는 순간 사용자가 넣는다. SafeClaw 는 그 값을 받지도, 넘기지도 않는다.
2. sanjae-apply 는 지금처럼 **무저장**이다. SafeClaw DB 를 직접 읽지 않는다(토큰·권한 경계를 섞지 않는다).
3. 상해종류·상해부위·휴업일수·사망 여부는 건강에 관한 정보(개인정보 보호법 제23조 민감정보)다. 기본값은 **SafeClaw 에 저장하지 않음**이다.
4. 재해자 성명·주소·휴대전화는 조사표를 만들 때 사용자가 직접 넣는다. SafeClaw `workers` 에 이름·전화가 있어도 자동으로 넘기지 않는다(사용자가 고른 사람만, 그 자리에서).
5. 서술 칸(개요·원인·재발방지 계획)은 SafeClaw 자료를 **초안 근거**로만 쓴다. 문장은 호출한 AI 가 사업장이 확인한 사실로 쓰고 `check_accident_report` 로 점검한다.

## 2. 칸 대응표

SafeClaw 쪽 이름은 마이그레이션·타입 정의 그대로다.

| SafeClaw | 조사표 칸 | 옮기는 방법 |
|---|---|---|
| `organizations.name` | `employer_name` | 그대로. 파견·하수급이면 사용자가 확인 |
| `sites.name` | `site_name`(건설업 현장명) · `accident_place` 앞부분 | 건설업이면 현장명, 아니면 장소 서술의 출발점 |
| `sites.industry` | `industry` | 업종명만 있다. 한국표준산업분류 5자리는 사용자가 찾는다(점검 도구가 5자리가 아니면 알린다) |
| `sites.region` | (참고) | 지역 이름이라 관할 찾기에 부족하다. `workplace_address` 는 사용자가 도로명·지번 주소로 넣고 `find_labor_office` 로 관서를 찾는다 |
| `workers.role` | `job` | 직업명으로. 5자리 코드는 사용자가 찾는다 |
| `workers.joined_at` | `hire_year` · `hire_month` · `hire_day` | 날짜를 셋으로 나눈다 |
| `workers.is_foreign_worker` · `nationality` | `nationality_korean` / `nationality_foreign` · `nationality` | 그대로. 체류자격(`visa_status`)은 SafeClaw 에 없어 사용자가 넣는다 |
| `workers.experience_summary` | `same_job_years` · `same_job_months` | 글이라 숫자로 바로 못 옮긴다. 사용자가 확인해 넣는다 |
| `workers.display_name` · `phone` | `name` · `mobile` | 자동으로 넘기지 않는다(원칙 4) |
| `workpacks.scenario.workSummary` | `work_type` 초안 근거 | 「누가 · 어떤 설비로 · 무슨 작업」 요소를 채우는 데 쓴다 |
| `workpacks.scenario.workerCount` | (옮기지 않음) | 그날 작업 인원이다. 조사표 `worker_count` 는 사업장 전체 근로자 수다 |
| TBM 위험요인 `hazards[].category`(4M) | `accident_cause` 네 요인 | Man → 인적 요인, Machine → 설비적 요인, Media → 작업ㆍ환경적 요인, Management → 관리적 요인 |
| TBM 대책 `measures[].action` · `owner` | `prevention_plan` 의 「무엇을」 · 「누가」 | 기한은 SafeClaw 에 없어 사용자가 넣는다(점검 도구가 기한·담당 단서를 본다) |
| `workpack_improvements`(`review_status` = approved · reflected) | `prevention_plan` 후보 | `task_label` · `hazard_label` · `improvement_text` 를 조치 문장 근거로. candidate · rejected 는 쓰지 않는다 |
| 재해사례 `accidentType`(추락·충돌·끼임 등) | (사업장 기입 칸 아님) | 서술에서 같은 말을 쓰도록 발생형태 이름으로 바꿔 적는다: 추락 → 떨어짐, 전도 → 넘어짐, 충돌 → 부딪힘, 낙하 → 맞음, 붕괴 → 무너짐, 협착 → 끼임 |

옮기지 않는 칸: `rrn7`, `address`(재해자 주소), `injury_type`, `injury_part`, `lost_days`, `death`, 발생일시, `accident_situation` 의 사실관계. 모두 사고 뒤 사용자가 확인해 넣는다.

## 3. 연결 방법

### A안 — 두 MCP 를 함께 붙인다(코드 변경 없음)

호출하는 AI(Claude 등)에 SafeClaw MCP 와 sanjae-apply MCP 를 같이 연결한다.

1. 사용자가 SafeClaw 에서 해당 현장·작업의 자료(작업 요약, 위험요인, 승인된 개선조치)를 대화로 가져온다.
2. AI 가 2절 대응표대로 조사표 `values` 초안을 만든다. 민감정보·주민번호 칸은 비워 두고 사용자에게 묻는다.
3. `find_labor_office(사업장 주소)` → 제출 관서·접수 부서 확인.
4. `check_accident_report(values)` → error 를 고친다.
5. `fill_form(form_id='F_INDUSTRIAL_ACCIDENT_REPORT')` → 파일. 저장은 사용자 PC(로컬 `save_to`)에서만.

지금 SafeClaw MCP 도구(문서 생성·재해사례 검색·근거 대조 등)에는 저장된 `workers`·`workpacks` 를 읽어 오는 도구가 없다. A안에서 저장 자료를 쓰려면 사용자가 화면에서 복사해 오거나, B안의 읽기 도구가 필요하다.

### B안 — SafeClaw 에 읽기 전용 내보내기를 둔다(SafeClaw 수정 필요)

SafeClaw MCP 에 `export_accident_report_draft(workpack_id, worker_id?)` 같은 **읽기 전용** 도구를 둔다.

- 돌려주는 것: 2절 대응표의 칸만, sanjae-apply `values` 이름 그대로. 근거(어느 표·어느 행에서 왔는지)를 칸마다 붙인다.
- 돌려주지 않는 것: 주민번호, 재해자 성명·전화(사용자가 `worker_id` 를 골라 명시적으로 요청한 경우만 이름), 건강 정보.
- SafeClaw 쪽 권한: 그 조직의 토큰으로만, 기록은 「내보냈다」는 사실과 시각만 남긴다.

이 안은 SafeClaw 저장소를 고쳐야 하므로 재홍님 결정이 필요하다.

### 하지 않는 것

- sanjae-apply 가 SafeClaw 운영 DB 에 직접 붙는 것(무저장 원칙과 권한 경계가 섞인다).
- 조사표 파일·값을 SafeClaw DB 에 보관하는 것. 보관이 필요하면 「제출 여부·제출일·제출 관서·재발방지 조치 이행 상태」만 남기는 별도 설계를 한다(주민번호·건강 정보 제외).

## 4. 되돌아가는 흐름(선택)

조사표의 재발방지 계획은 SafeClaw 의 개선조치 관리와 같은 일이다. 제출 뒤 사용자가 원하면 재발방지 조치 항목(무엇을·언제까지·누가)을 SafeClaw `workpack_improvements` 의 candidate 로 등록할 수 있다. 이것도 SafeClaw 수정이 필요하고, 들어가는 값은 조치 문장·기한·담당뿐이다(재해자 정보 없음).

## 5. 결정 필요 사항

| 항목 | 선택지 |
|---|---|
| 연결 방법 | A안만(지금 바로) / B안 추가(SafeClaw 읽기 도구 개발) |
| 재해자 이름 내보내기 | 하지 않음(기본) / 사용자가 고른 사람만 |
| 제출 기록 보관 | 하지 않음(기본) / 제출 여부·관서·재발방지 이행만 SafeClaw 에 |
| 재발방지 조치 되돌려 넣기 | 하지 않음 / candidate 로 등록 |
