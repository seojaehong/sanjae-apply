// 산업재해조사표(산업안전보건법 시행규칙 별지 제30호서식) 작성 지침 — 읽기 전용 자료.
// 근거는 ①서식 뒤쪽 「작성방법」(법제처 별지 제30호서식, 개정 2025.10.1) ②법제처 조문(fixtures/laws/osh_*) ③시행령 별표 35(과태료)
// ④고용노동부·공공데이터 공개 자료. 출처마다 확인일을 단다. 문장은 도구가 쓰지 않는다 — 호출한 AI 가 이 지침으로 쓰고 check_accident_report 로 점검한다.
// 승인·인정 여부나 그 가능성은 다루지 않는다(출력은 server.ts text() 의 금지어 필터를 거친다).

import { REF } from "../core/catalog.js";

export const GUIDE_CHECKED_AT = "2026-11-04";

const FORM_BACK = "산업재해조사표 뒤쪽 「작성방법」(산업안전보건법 시행규칙 별지 제30호서식, 개정 2025.10.1)";

/** 언제·누가·어디에 내는가 */
const duty = {
  what: "산업재해조사표(산업안전보건법 시행규칙 별지 제30호서식)",
  who: "재해자를 고용한 사업주(파견근로자는 서식상 사용사업주의 사업장명을 적는다 — 작성방법 ②)",
  when_required: "산업재해로 사망자가 발생하거나 3일 이상의 휴업이 필요한 부상을 입거나 질병에 걸린 사람이 발생한 경우",
  deadline: "해당 산업재해가 발생한 날부터 1개월 이내",
  submit_to: "관할 지방고용노동관서의 장(전자문서 제출 포함). 근로복지공단이 아니다",
  worker_rep: "근로자대표의 확인을 받고, 기재 내용에 근로자대표의 이견이 있으면 그 내용을 첨부한다. 근로자대표가 없으면 재해자 본인의 확인을 받아 낼 수 있다",
  serious_accident:
    "중대재해(사망자 1명 이상, 3개월 이상 요양 부상자 동시 2명 이상, 부상자·직업성 질병자 동시 10명 이상)는 조사표와 별도로 알게 된 즉시 관할 지방고용노동관서의 장에게 전화·팩스 등으로 보고한다(발생 개요·피해 상황, 조치·전망, 그 밖의 중요 사항)",
  records: "조사표 사본을 보존하면 산업재해 기록·보존 의무(사업장 개요·인적사항, 일시·장소, 원인·과정, 재발방지 계획)를 갈음한다",
  late_or_ordered:
    "기한이 지난 뒤 자진하여 작성·제출하거나 관서의 명령을 받고 15일 이내에 이행한 경우 보고한 것으로 보는 특례가 있으나, 안전관리자·보건관리자를 두어야 하는 사업주 등 시행규칙 제73조제2항 각 호에 해당하면 적용되지 않는다",
  basis: [REF.OSH_ACT_57.cite, REF.OSH_RULE_73.cite, REF.OSH_ACT_54.cite, REF.OSH_RULE_67.cite, REF.OSH_RULE_72.cite, "산업안전보건법 시행규칙 제3조(중대재해의 범위)"],
};

/** 과태료 — 시행령 별표 35 개별기준 초목(법 제57조제3항 위반) */
const penalties = {
  basis: `${REF.OSH_ACT_175.cite} · 산업안전보건법 시행령 별표 35 제4호 초목(개정 2026.7.28, 확인 ${GUIDE_CHECKED_AT})`,
  not_reported_manwon: { first: 700, second: 1000, third_or_more: 1500, note: "사업장 밖 교통사고 등 사업주의 법 위반이 직접 원인이 아닌 것이 명백한 경우는 제외" },
  false_report_manwon: { first: 1500, second: 1500, third_or_more: 1500 },
  serious_accident_not_reported_manwon: { amount: 3000, basis: "별표 35 조목(법 제54조제2항 위반)" },
  notes: [
    "가중은 최근 5년간 같은 위반으로 부과처분을 받은 경우에 적용한다(별표 35 제1호 가목)",
    "중대재해·중대산업사고 발생 사업장의 원인조사·감독에서 적발된 위반은 3차 이상 금액을 부과한다(별표 35 제2호)",
    "상시근로자 규모에 따라 90%·80%·70% 감경 기준이 있다(별표 35 제3호)",
  ],
};

/** 칸별 작성법 — 서식 뒤쪽 작성방법을 칸 이름에 맞춰 줄였다. keys 는 fill_form 칸 이름 */
const fields: { keys: string[]; how: string }[] = [
  { keys: ["workplace_no", "biz_reg_no"], how: "산재보험 가입번호(산재관리번호, 일괄적용이면 사업개시번호도)와 국세청 사업자등록번호. 산재보험 미가입이면 사업자등록번호만" },
  { keys: ["employer_name"], how: "재해자가 근로계약을 맺고 실제로 급여를 받는 사업장명. 파견근로자는 실제 지휘·명령을 받는 사용사업주의 사업장명, 건설 하수급 소속이면 하수급 사업장명" },
  { keys: ["worker_count"], how: "최근 근로자 수(정규직·일용직·임시직·훈련생 포함)" },
  { keys: ["industry"], how: "한국표준산업분류 세세분류 5자리. 모르면 업종명과 주요 생산품(예: 제철업, 아파트건설업, 중식음식점업)" },
  { keys: ["prime_contractor_name", "prime_contractor_no"], how: "재해자가 사내 수급인 소속일 때(건설업 제외) 원도급인 사업장명과 산재관리번호(사업개시번호)" },
  { keys: ["dispatch_employer_name", "dispatch_employer_no"], how: "재해자가 파견근로자일 때 파견사업주의 사업장명과 산재관리번호(사업개시번호)" },
  {
    keys: ["orderer_name", "orderer_private", "orderer_government", "orderer_public_institution", "main_contractor_name", "main_contractor_no", "site_name", "construction_type", "progress_rate", "construction_amount"],
    how: "건설업만. 원수급 사업장명·번호는 재해자 소속이 하수급 사업장일 때만. 공사 종류·공정률·공사금액은 수급받은 단위공사가 아니라 원수급 사업장의 공사 현황(공정률은 전체 공정률, 공사금액은 백만원 단위)",
  },
  { keys: ["name", "rrn7", "address", "mobile"], how: "재해자 성명, 주민등록번호 앞 7자리(생년월일 6자리 + 뒤 첫 자리 — 서식이 앞 7자리만 받는다), 주소, 휴대전화" },
  { keys: ["nationality_korean", "nationality_foreign", "nationality", "visa_status"], how: "외국인이면 국적과 체류자격 기호(출입국관리법 시행령 별표 1, 예 E-9)" },
  { keys: ["job"], how: "한국표준직업분류 세세분류 5자리. 모르면 직업명과 평소 주요 업무·직위(예: 프레스조작원, 철근공)" },
  { keys: ["hire_year", "hire_month", "hire_day"], how: "이 사업장 입사일" },
  { keys: ["same_job_years", "same_job_months"], how: "같은 종류 업무 근속기간 — 과거 다른 회사 경력부터 현직까지 동일·유사 업무를 합산(질병은 관련 작업 근무기간)" },
  {
    keys: ["employment_regular", "employment_temporary", "employment_daily", "employment_unpaid_family", "employment_self_employed", "employment_other", "employment_other_text"],
    how: "하나만 고른다. 상용 = 기간 없음 또는 1년 이상, 임시 = 1개월 이상 1년 미만, 일용 = 1개월 미만 또는 일급·일당, 자영업자 = 근로자를 고용하지 않은 사람, 무급가족종사자 = 임금 없는 사업주 가족, 그 밖의 사항 = 교육·훈련생 등",
  },
  {
    keys: ["shift_normal", "shift_two", "shift_three", "shift_four", "shift_part_time", "shift_other", "shift_other_text"],
    how: "하나만 고른다. 정상 = 통상 09시 전후 출근·18시 전후 퇴근, 2·3·4교대 = 격일제·조 순환, 시간제 = 정상보다 짧은 주당 근무, 그 밖의 사항 = 고정 심야(야간) 근무 등",
  },
  { keys: ["injury_type", "injury_part"], how: "상해종류(질병명)와 상해부위(질병부위). 둘 이상이면 심한 것부터(예: 골절, 절단, 화상 / 손가락, 척추)" },
  { keys: ["lost_days", "death"], how: "휴업예상일수 = 재해발생일을 제외한 3일 이상 결근 등으로 출근하지 못한 일수(추정이면 의사의 진단 소견 참조). 사망이면 사망 칸" },
  { keys: ["accident_year", "accident_month", "accident_day", "accident_weekday", "accident_hour", "accident_minute"], how: "발생일시 — 년·월·일·요일·시(24시 기준)·분" },
  { keys: ["accident_place"], how: "발생 장소(공정 포함). 예: 사출성형부 플라스틱 용기 생산 1팀 사출공정" },
  { keys: ["work_type"], how: "재해관련 작업유형 — 누가 어떤 기계·설비를 다루면서 무슨 작업을 하고 있었는지" },
  { keys: ["accident_situation"], how: "재해발생 당시 상황 — 기계·설비·구조물·작업환경의 불안전한 상태와 재해자·동료의 불안전한 행동을 상세히" },
  { keys: ["accident_cause"], how: "재해발생 원인 — 인적·설비적·작업ㆍ환경적·관리적 요인으로 나누어" },
  { keys: ["prevention_plan"], how: "재발방지 계획 — 재해발생 원인을 토대로" },
  { keys: ["tech_support_request"], how: "재발방지 계획 이행을 위한 한국산업안전보건공단의 무료 기술지원(교육·기술지도)을 받으려면 표시" },
  { keys: ["comwel_guide_consent"], how: "근로복지공단이 재해자에게 산재보험급여 신청방법을 안내하는 데 재해자의 개인정보를 활용하는 것에 동의하는 사람만 표시(재해자 의사에 따른다)" },
  { keys: ["writer_name", "writer_phone", "apply_year", "apply_month", "apply_day", "owner_name", "worker_rep_name"], how: "작성자·작성일, 사업주 서명 또는 날인, 근로자대표(근로자대표가 없으면 재해자)의 확인 서명" },
  { keys: ["labor_office"], how: "제출할 관할 지방고용노동청(지청) 이름. 사업장 소재지로 정해진다 — find_labor_office(사업장 주소)의 labor_office_value 가 제안 값이다(지방청은 「서울」, 지청은 「서울강남」처럼 앞부분)" },
];

/** 서술 칸 — AI 가 문장을 쓰는 자리. 도구는 요소·점검표·예시만 준다 */
const narrative = {
  overview: {
    keys: ["accident_place", "work_type", "accident_situation"],
    elements: [
      "발생일시: 년·월·일·요일·시(24시)·분",
      "발생장소: 공정까지(부서·라인·설비 번호)",
      "작업유형: 누가 · 어떤 기계·설비를 · 무슨 작업 중",
      "당시 상황: 불안전한 상태(기계·설비·구조물·환경)와 불안전한 행동(재해자·동료)",
    ],
    checklist: [
      "주어(재해자·동료)가 문장마다 분명한가",
      "설비 이름·번호와 공정이 장소·작업유형 칸과 같은가",
      "상태(무엇이 어떤 상태였나)와 행동(누가 무엇을 했나)이 둘 다 있는가",
      "결과(어디를 어떻게 다쳤나)가 상해종류·부위 칸과 맞는가",
      "추측·책임 판단을 사실처럼 쓰지 않았는가(확인 안 된 것은 「확인 중」으로)",
    ],
    official_example: {
      source: `${FORM_BACK} [작성예시]`,
      발생일시: "2013년 5월 30일 금요일 14시 30분",
      발생장소: "사출성형부 플라스틱 용기 생산 1팀 사출공정에서",
      재해관련_작업유형: "재해자 000가 사출성형기 2호기에서 플라스틱 용기를 꺼낸 후 금형을 점검하던 중",
      재해발생_당시_상황: "재해자가 점검중임을 모르던 동료 근로자 000가 사출성형기 조작 스위치를 가동하여 금형 사이에 재해자가 끼어 사망하였음",
    },
  },
  cause: {
    keys: ["accident_cause"],
    factors: [
      { factor: "인적 요인", examples: "무의식 행동, 착오, 피로, 연령, 커뮤니케이션 등" },
      { factor: "설비적 요인", examples: "기계·설비의 설계상 결함, 방호장치의 불량, 작업표준화의 부족, 점검·정비의 부족 등" },
      { factor: "작업ㆍ환경적 요인", examples: "작업정보의 부적절, 작업자세·동작의 결함, 작업방법의 부적절, 작업환경 조건의 불량 등" },
      { factor: "관리적 요인", examples: "관리조직의 결함, 규정·매뉴얼의 불비·불철저, 안전교육의 부족, 지도감독의 부족 등" },
    ],
    source: FORM_BACK,
    checklist: [
      "네 요인을 각각 검토했는가(해당 없음이면 그렇게 적는다)",
      "「부주의」 한 단어로 끝내지 않고 그 행동을 가능하게 한 설비·작업방법·관리의 빈틈을 적었는가",
      "당시 상황 칸의 불안전한 상태·행동과 원인이 이어지는가",
    ],
  },
  prevention: {
    keys: ["prevention_plan"],
    rules: [
      "원인 칸의 요인마다 대응하는 조치를 하나 이상",
      "조치마다 무엇을 · 언제까지 · 누가(담당 부서·직책)",
      "같은 설비·공정의 다른 기계·작업장까지 범위를 적는다",
      "교육만으로 끝내지 않고 설비 개선·작업 절차(예: 전원 차단·잠금·표지) 같은 조치를 함께",
      "이행 확인 방법(점검표·산업안전보건위원회 보고 등)",
    ],
    checklist: ["원인 칸의 각 요인과 짝이 맞는가", "기한·담당이 빠진 조치가 없는가", "즉시 조치와 중장기 조치가 구분되는가"],
    synthetic_example:
      "1) 금형 점검 전 전원 차단·잠금·표지(LOTO) 절차를 정하고 사출 공정 근로자 전원 교육(2026.11.30까지, 생산팀장). 2) 안전문 연동장치 즉시 수리, 작업 시작 전 작동 여부를 점검표로 매일 확인(설비보전팀장). 3) 점검 작업은 2인 1조, 조작반에 「점검 중 — 조작 금지」 표지(2026.11.15까지, 생산팀장). 4) 같은 형식 사출성형기 전체의 방호장치 점검, 결과를 산업안전보건위원회에 보고(2026.12.15까지, 안전관리자).",
    synthetic_note: "합성 예시다. 실제 사업장 사실로 바꿔 쓴다",
  },
  length_note:
    "PDF 는 서술 칸이 한두 줄이라 칸을 넘는 글은 칸에 「(별지에 적음)」을 쓰고 전문을 덧붙인 별지 쪽에 적는다. 한글(hwpx)도 7pt 로 줄여도 넘치면 같은 방식으로 문서 끝 별지 쪽에 적는다",
};

/** 분류코드 — 사업장이 적는 것은 업종·직업(세세분류 5자리)뿐이다. 발생형태·기인물 등 코드는 「재해 분류자 기입란(사업장에서는 적지 않습니다)」 */
const codes = [
  {
    name: "한국표준산업분류(KSIC)",
    field: "industry",
    format: "세세분류 5자리 숫자(모르면 업종명 + 주요 생산품)",
    notice: "통계청 고시 제2024-203호, 2024.7.1 시행",
    lookup_url: "https://kssc.mods.go.kr:8443/ksscNew_web/index.jsp",
    lookup_note: "통계분류포털(국가데이터처). 2025.12.2 주소 변경",
    checked_at: GUIDE_CHECKED_AT,
  },
  {
    name: "한국표준직업분류(KSCO) 제8차",
    field: "job",
    format: "세세분류 5자리 숫자(모르면 직업명 + 주요 업무·직위)",
    notice: "통계청 고시 제2024-328호, 2025.1.1 시행",
    lookup_url: "https://kssc.mods.go.kr:8443/ksscNew_web/index.jsp",
    checked_at: GUIDE_CHECKED_AT,
  },
  {
    name: "체류자격 기호",
    field: "visa_status",
    format: "출입국관리법 시행령 별표 1 의 기호(예: E-1, E-7, E-9 — 서식 작성방법의 예)",
    checked_at: GUIDE_CHECKED_AT,
  },
  {
    name: "발생형태(참고 — 사업장 기입 칸 아님)",
    field: null,
    format: "서술 칸에서 사고 형태를 같은 이름으로 적으면 분류자가 읽기 쉽다. 코드 자체는 관서가 적는다",
    terms: ["떨어짐", "넘어짐", "부딪힘", "맞음", "무너짐", "끼임", "절단·베임·찔림", "감전", "폭발·파열", "화재", "깔림·뒤집힘", "이상온도 물체 접촉", "빠짐·익사", "불균형 및 무리한 동작", "화학물질 누출·접촉", "산소결핍", "사업장 내 교통사고", "사업장 외 교통사고", "체육행사", "폭력행위", "동물상해", "기타", "분류불능"],
    source: "공공데이터포털 「산업재해 발생형태」 분류(데이터 15084677, 2026-09-30 기준) — 이름만 옮겼다",
    note: "분류 체계의 원 지침은 KOSHA GUIDE G-83-2016 「산업재해 기록ㆍ분류에 관한 지침」으로 알려져 있으나 2차 인용이며 현행 여부는 확인하지 못했다",
    checked_at: GUIDE_CHECKED_AT,
  },
];

/** 자주 틀리는 것 — 출처가 있는 것만 */
const common_mistakes = [
  { mistake: "요양급여신청서(근로복지공단)를 냈으니 조사표는 안 내도 된다고 보는 것", fact: "요양급여신청서로 산업재해조사표를 대신할 수 없다. 조사표는 지방고용노동관서에 따로 낸다", source: "고용노동부 지방관서 공지(2021, 게시번호 20210600264) · 시행규칙 제73조제1항" },
  { mistake: "제출처를 근로복지공단으로 아는 것", fact: "관할 지방고용노동관서의 장(전자문서 포함)", source: REF.OSH_RULE_73.cite },
  { mistake: "휴업일수에 재해 당일을 넣는 것", fact: "재해발생일을 제외한 3일 이상 결근 등. 추정이면 의사의 진단 소견을 참조", source: FORM_BACK },
  { mistake: "근로자대표 확인 없이 내는 것", fact: "근로자대표 확인을 받고 이견은 첨부. 근로자대표가 없으면 재해자 본인 확인", source: "시행규칙 제73조제3항" },
  { mistake: "건설업 공사 현황을 하수급 단위공사로 적는 것", fact: "원수급 사업장의 공사 현황, 공정률은 전체 공정률", source: FORM_BACK },
  { mistake: "같은 종류 업무 근속기간을 이 회사 경력만 적는 것", fact: "과거 다른 회사의 동일·유사 업무 경력까지 합산", source: FORM_BACK },
  { mistake: "외국인 재해자의 체류자격을 비우는 것", fact: "출입국관리법 시행령 별표 1 의 기호를 적는다", source: FORM_BACK },
  { mistake: "원인을 「부주의」 한 단어로 쓰는 것", fact: "인적·설비적·작업ㆍ환경적·관리적 요인으로 나누어 적는다", source: FORM_BACK },
  { mistake: "중대재해인데 1개월 안 조사표만 내는 것", fact: "중대재해는 알게 된 즉시 전화·팩스 등으로 보고하고, 조사표는 별도로 1개월 이내에 낸다", source: `${REF.OSH_RULE_67.cite} · ${REF.OSH_RULE_73.cite}` },
];

/** 제출 경로 */
const submission = {
  offline: "관할 지방고용노동관서에 방문·우편·팩스",
  online: {
    name: "고용노동부 노동포털 민원신청 — 산업재해조사표(민원코드 AH038)",
    url: "https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchVal=AH038&searchGubun=1&searchRlm=2",
    facts: "접수 방법 방문·우편·인터넷, 신청자격 사업주(기업회원 로그인), 처리기간 14일(노동포털 민원 안내 화면)",
    menu_path: "민원신청·조회 → 민원신청(로그인 필요) → 산업안전분야 민원신청 → 산업재해조사표(대전지방고용노동청 안내, 2024)",
    checked_at: GUIDE_CHECKED_AT,
  },
  department_note: "접수 부서는 관서마다 다르다(산재예방감독과·건설산재예방감독과·제주산재예방감독팀 등). 건설업은 건설 전담 과가 따로 있는 관서(20곳)가 있다. find_labor_office 로 찾는다",
  fax_note: "이 도구는 팩스를 보내지 않는다. 관서 찾기 결과의 번호 안내까지다",
};

/** 관서 찾기 — src/accident/jurisdiction.ts · data/labor-offices/ */
const jurisdiction = {
  how: "find_labor_office(address) 가 관할 관서·조사표 접수 부서·전화·팩스·출처·확인방법을 돌려준다. get_accident_report_guide 에 workplace_address 를 주거나 fill_form 으로 조사표를 채워도 같은 결과가 붙는다",
  basis: "관할 = 「고용노동부와 그 소속기관 직제 시행규칙」 별표 1 의 관할 구역. 사업장 소재지 기준(중대재해 보고도 「사업장 소재지를 관할하는」 관서 — 시행규칙 제67조)",
  contacts: "각 관서 고용노동부 누리집 부서 안내 화면에서 확인한 번호(데이터 확인일 2026-11-04). 번호마다 확인방법(공식 직접 확인·두 리서치 일치·단일 출처·미확인)을 함께 낸다",
  cautions: [
    "지방청 7곳(서울·경기·중부·부산·대구·광주·대전)의 직할 구역은 조사표 접수 과가 확정되지 않았다 — 산재예방감독과(기본)와 광역산재예방감독과(보조) 번호를 함께 주고 「제출 전 전화 확인 권장」을 붙인다",
    "여수지청 팩스 0503-8803-0638 은 관서 화면에 없고 출처가 하나뿐이라(단일 출처) 「확인 필요」를 붙인다",
    "시도가 빠져 같은 이름 시군구가 여럿이거나, 법령이 읍·리 단위로 가르는 곳(칠곡군 석적읍)은 후보로 돌려주고 하나로 정하지 않는다",
    "제주 사업장은 광주지방고용노동청 관할이고 연락처는 제주산재예방감독팀이다",
  ],
};

export const ACCIDENT_REPORT_GUIDE = {
  form_id: "F_INDUSTRIAL_ACCIDENT_REPORT",
  title: "산업재해조사표(산업안전보건법 시행규칙 별지 제30호서식)",
  checked_at: GUIDE_CHECKED_AT,
  how_to_use:
    "도구는 근거·형식·점검만 준다. 서술 칸(개요·원인·재발방지 계획)의 문장은 호출한 AI 가 사업장이 준 사실로 쓰고, check_accident_report 로 빈 칸·형식·요소 누락을 점검한 뒤 fill_form(form_id='F_INDUSTRIAL_ACCIDENT_REPORT') 으로 채운다. 산업재해 해당 여부·책임 판단은 하지 않는다",
  duty,
  penalties,
  fields,
  narrative,
  codes,
  common_mistakes,
  submission,
  jurisdiction,
};

export const GUIDE_SECTIONS = ["duty", "penalties", "fields", "narrative", "codes", "common_mistakes", "submission", "jurisdiction"] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

/** section 이 있으면 그 절만(머리 정보는 늘 붙인다) */
export function accidentReportGuide(section?: GuideSection): Record<string, unknown> {
  const { form_id, title, checked_at, how_to_use } = ACCIDENT_REPORT_GUIDE;
  const head = { form_id, title, checked_at, how_to_use };
  if (!section) return { ...ACCIDENT_REPORT_GUIDE };
  return { ...head, [section]: ACCIDENT_REPORT_GUIDE[section] };
}
