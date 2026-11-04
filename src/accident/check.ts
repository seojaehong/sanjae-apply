// 산업재해조사표 값 점검 — 읽기 전용. 빈 칸·형식·날짜 앞뒤·하나만 고르는 칸·서술 요소 누락을 본다.
// 문장을 고치거나 쓰지 않는다(호출한 AI 가 고친다). 산업재해 해당 여부·책임은 판단하지 않는다.

import { REF } from "../core/catalog.js";

export type IssueLevel = "error" | "warn" | "info";
export interface Issue {
  level: IssueLevel;
  keys: string[];
  message: string;
  basis?: string;
}

export interface Deadline {
  accident_date: string;
  /** 발생한 날부터 1개월 — 민법 제157조(초일 불산입)·제160조(역에 의한 계산) */
  reference_deadline: string;
  reference_weekday: string;
  today: string;
  days_left: number;
  note: string;
}

export interface CheckResult {
  form_id: "F_INDUSTRIAL_ACCIDENT_REPORT";
  issues: Issue[];
  counts: Record<IssueLevel, number>;
  deadline: Deadline | null;
  note: string;
}

type Values = Record<string, string | boolean | undefined>;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const RULE73 = REF.OSH_RULE_73.cite;
const FORM_BACK = "서식 뒤쪽 작성방법";

const on = (v: unknown) => v === true || v === "true";
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const has = (vals: Values, k: string) => str(vals[k]) !== "" || on(vals[k]);

/** 「YYYY-MM-DD」 또는 년·월·일 칸 → UTC 자정 Date. 틀린 날짜면 null */
function ymd(y: string, m: string, d: string): Date | null {
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null;
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d) ? dt : null;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 오늘(KST) */
export function todayKst(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 발생일 + 1개월(그달에 같은 날이 없으면 말일) — 민법 제160조제2항·제3항 */
export function oneMonthAfter(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

const REQUIRED: [string, string][] = [
  ["employer_name", "사업장명"],
  ["biz_reg_no", "사업자등록번호"],
  ["worker_count", "근로자 수"],
  ["industry", "업종"],
  ["workplace_address", "소재지"],
  ["name", "재해자 성명"],
  ["job", "직업"],
  ["injury_type", "상해종류(질병명)"],
  ["injury_part", "상해부위(질병부위)"],
  ["accident_place", "발생장소"],
  ["work_type", "재해관련 작업유형"],
  ["accident_situation", "재해발생 당시 상황"],
  ["accident_cause", "재해발생 원인"],
  ["prevention_plan", "재발방지 계획"],
  ["writer_name", "작성자 성명"],
  ["writer_phone", "작성자 전화번호"],
  ["owner_name", "사업주"],
  ["labor_office", "제출 관서((  )지방고용노동청장(지청장))"],
];
const RECOMMENDED: [string, string][] = [
  ["workplace_no", "산재관리번호(산재보험 가입 사업장이면 적는다)"],
  ["rrn7", "재해자 주민등록번호 앞 7자리"],
  ["address", "재해자 주소"],
  ["mobile", "재해자 휴대전화"],
  ["same_job_years", "같은 종류업무 근속기간(년)"],
];
const GROUPS: { id: string; label: string; keys: string[]; required: boolean }[] = [
  { id: "nationality", label: "국적(내국인·외국인)", keys: ["nationality_korean", "nationality_foreign"], required: true },
  { id: "employment", label: "고용형태", keys: ["employment_regular", "employment_temporary", "employment_daily", "employment_unpaid_family", "employment_self_employed", "employment_other"], required: true },
  { id: "shift", label: "근무형태", keys: ["shift_normal", "shift_two", "shift_three", "shift_four", "shift_part_time", "shift_other"], required: true },
  { id: "orderer", label: "발주자 구분", keys: ["orderer_private", "orderer_government", "orderer_public_institution"], required: false },
];
const CONSTRUCTION = ["orderer_name", "orderer_private", "orderer_government", "orderer_public_institution", "main_contractor_name", "main_contractor_no", "site_name", "construction_type", "progress_rate", "construction_amount"];

/** 원인 칸 4요인 — 서식 작성방법의 요인 이름에서 찾을 낱말 */
const CAUSE_FACTORS: [string, RegExp][] = [
  ["인적 요인", /인적/],
  ["설비적 요인", /설비/],
  ["작업ㆍ환경적 요인", /작업\s*[ㆍ·.,/]?\s*환경|환경적|작업적/],
  ["관리적 요인", /관리적|관리\s*요인/],
];

export function checkAccidentReport(values: Values, opts: { today?: string; slotKeys?: string[] } = {}): CheckResult {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, keys: string[], message: string, basis?: string) => issues.push({ level, keys, message, ...(basis ? { basis } : {}) });
  const today = opts.today ?? todayKst();

  if (opts.slotKeys) {
    const known = new Set(opts.slotKeys);
    const unknown = Object.keys(values).filter((k) => !known.has(k));
    if (unknown.length) add("warn", unknown, `서식에 없는 칸 이름 ${unknown.length}개 — get_form_catalog(form_id='F_INDUSTRIAL_ACCIDENT_REPORT') 의 slots 로 고친다`);
  }

  for (const [k, label] of REQUIRED) if (!has(values, k)) add("error", [k], `${label} 이(가) 비었다`, FORM_BACK);
  for (const [k, label] of RECOMMENDED) if (!has(values, k)) add("warn", [k], `${label} 이(가) 비었다`, FORM_BACK);
  if (!has(values, "worker_rep_name")) add("warn", ["worker_rep_name"], "근로자대표(근로자대표가 없으면 재해자 본인)의 확인 서명 자리가 비었다", `${RULE73}제3항`);

  // 하나만 고르는 칸
  for (const g of GROUPS) {
    const picked = g.keys.filter((k) => on(values[k]));
    if (picked.length > 1) add("error", picked, `${g.label}: 하나만 고른다(${picked.length}개 선택됨)`, FORM_BACK);
    else if (!picked.length && g.required) add("error", g.keys, `${g.label}: 하나를 고른다`, FORM_BACK);
  }
  if (on(values.employment_other) && !has(values, "employment_other_text")) add("warn", ["employment_other_text"], "고용형태 「그 밖의 사항」 내용(예: 교육·훈련생)이 비었다", FORM_BACK);
  if (on(values.shift_other) && !has(values, "shift_other_text")) add("warn", ["shift_other_text"], "근무형태 「그 밖의 사항」 내용(예: 고정 심야 근무)이 비었다", FORM_BACK);

  // 외국인
  if (on(values.nationality_foreign)) {
    if (!has(values, "nationality")) add("error", ["nationality"], "외국인 재해자의 국적이 비었다", FORM_BACK);
    if (!has(values, "visa_status")) add("error", ["visa_status"], "외국인 재해자의 체류자격(기호)이 비었다", "서식 작성방법 ⑩ — 출입국관리법 시행령 별표 1");
    else if (!/^[A-H]-\d{1,2}(-\d{1,2})?$/i.test(str(values.visa_status))) add("warn", ["visa_status"], `체류자격은 기호로 적는다(예: E-9). 지금 값: ${str(values.visa_status)}`, "서식 작성방법 ⑩");
  } else if (on(values.nationality_korean) && (has(values, "nationality") || has(values, "visa_status"))) {
    add("warn", ["nationality", "visa_status"], "내국인으로 골랐는데 국적·체류자격이 적혀 있다");
  }

  // 업종·직업 형식
  for (const [k, label] of [["industry", "업종(한국표준산업분류)"], ["job", "직업(한국표준직업분류)"]] as const) {
    const v = str(values[k]);
    if (!v) continue;
    const digits = /^\d+/.exec(v)?.[0];
    if (digits && digits.length !== 5) add("warn", [k], `${label} 코드는 세세분류 5자리다(지금 ${digits.length}자리)`, FORM_BACK);
    else if (!digits) add("info", [k], `${label} 코드가 없다 — 코드를 모르면 이름에 더해 ${k === "industry" ? "주요 생산품" : "평소 주요 업무·직위"}를 적었는지 본다`, FORM_BACK);
  }

  // 주민번호 앞 7자리·휴대전화
  const rrn = str(values.rrn7).replace(/[-\s]/g, "");
  if (rrn && !/^\d{7}$/.test(rrn)) add("error", ["rrn7"], "주민등록번호는 앞 7자리(생년월일 6자리 + 뒤 첫 자리)만 받는다", "서식 재해자 정보 칸");
  // 월·일만 본다(윤년 2000 으로 2월 29일 허용)
  else if (rrn && !ymd("2000", rrn.slice(2, 4), rrn.slice(4, 6))) {
    add("warn", ["rrn7"], "주민등록번호 앞 6자리가 날짜가 아니다");
  }
  const mob = str(values.mobile).replace(/[-\s]/g, "");
  if (mob && !/^01\d{8,9}$/.test(mob)) add("warn", ["mobile"], "휴대전화 번호 형식(010-0000-0000)이 아니다");

  // 날짜·시각
  const acc = ymd(str(values.accident_year), str(values.accident_month), str(values.accident_day));
  if (has(values, "accident_year") || has(values, "accident_month") || has(values, "accident_day")) {
    if (!acc) add("error", ["accident_year", "accident_month", "accident_day"], "발생일이 날짜가 아니다");
  } else add("error", ["accident_year", "accident_month", "accident_day"], "발생일이 비었다", FORM_BACK);
  if (acc) {
    const wd = WEEKDAYS[acc.getUTCDay()]!;
    const given = str(values.accident_weekday).replace(/요일$/, "");
    if (!given) add("error", ["accident_weekday"], `발생 요일이 비었다(${iso(acc)} 은 ${wd}요일)`, FORM_BACK);
    else if (given !== wd) add("error", ["accident_weekday"], `발생 요일이 날짜와 다르다 — ${iso(acc)} 은 ${wd}요일인데 「${given}」`);
    if (iso(acc) > today) add("error", ["accident_year", "accident_month", "accident_day"], `발생일(${iso(acc)})이 오늘(${today})보다 뒤다`);
  }
  const hh = str(values.accident_hour);
  const mm = str(values.accident_minute);
  if (!hh) add("error", ["accident_hour"], "발생 시(24시 기준)가 비었다", FORM_BACK);
  else if (!/^\d{1,2}$/.test(hh) || Number(hh) > 23) add("error", ["accident_hour"], `발생 시는 0~23(24시 기준)이다. 지금 값: ${hh}`, FORM_BACK);
  if (!mm) add("warn", ["accident_minute"], "발생 분이 비었다", FORM_BACK);
  else if (!/^\d{1,2}$/.test(mm) || Number(mm) > 59) add("error", ["accident_minute"], `발생 분은 0~59 이다. 지금 값: ${mm}`);

  const hire = ymd(str(values.hire_year), str(values.hire_month), str(values.hire_day));
  if (!has(values, "hire_year")) add("error", ["hire_year", "hire_month", "hire_day"], "입사일이 비었다", FORM_BACK);
  else if (!hire) add("error", ["hire_year", "hire_month", "hire_day"], "입사일이 날짜가 아니다");
  else if (acc && hire > acc) add("error", ["hire_year", "hire_month", "hire_day"], `입사일(${iso(hire)})이 발생일(${iso(acc)})보다 뒤다`);

  const apply = ymd(str(values.apply_year), str(values.apply_month), str(values.apply_day));
  if (!has(values, "apply_year")) add("error", ["apply_year", "apply_month", "apply_day"], "작성일이 비었다");
  else if (!apply) add("error", ["apply_year", "apply_month", "apply_day"], "작성일이 날짜가 아니다");
  else if (acc && apply < acc) add("error", ["apply_year", "apply_month", "apply_day"], `작성일(${iso(apply)})이 발생일(${iso(acc)})보다 앞이다`);

  // 휴업·사망
  const death = on(values.death);
  const days = str(values.lost_days);
  if (!death && !days) add("error", ["lost_days", "death"], "휴업예상일수 또는 사망 중 하나는 적는다", FORM_BACK);
  if (days && !/^\d+$/.test(days)) add("error", ["lost_days"], `휴업예상일수는 숫자(일)로 적는다. 지금 값: ${days}`);
  else if (days && !death && Number(days) < 3) {
    add("warn", ["lost_days"], `휴업예상일수 ${days}일 — 제출 대상은 사망 또는 3일 이상 휴업이 필요한 경우다. 일수는 재해발생일을 빼고 센다(추정이면 의사의 진단 소견 참조)`, `${RULE73}제1항 · ${FORM_BACK}`);
  }
  if (death) {
    add("info", ["death"], "사망 재해는 중대재해다. 조사표(1개월 이내)와 별도로, 알게 된 즉시 관할 지방고용노동관서에 전화·팩스 등으로 보고한다(발생 개요·피해 상황, 조치·전망, 그 밖의 중요 사항)", `${REF.OSH_ACT_54.cite} · ${REF.OSH_RULE_67.cite} · 산업안전보건법 시행규칙 제3조제1호`);
  }

  // 건설업 칸
  if (CONSTRUCTION.some((k) => has(values, k))) {
    const pr = str(values.progress_rate).replace(/%$/, "");
    if (pr && (!/^\d{1,3}(\.\d+)?$/.test(pr) || Number(pr) > 100)) add("warn", ["progress_rate"], `공정률은 0~100 사이 숫자(전체 공정률)다. 지금 값: ${pr}`, FORM_BACK);
    const amt = str(values.construction_amount).replace(/,/g, "");
    if (amt && !/^\d+(\.\d+)?$/.test(amt)) add("warn", ["construction_amount"], `공사금액은 백만원 단위 숫자다. 지금 값: ${str(values.construction_amount)}`, FORM_BACK);
    if (!has(values, "construction_type")) add("warn", ["construction_type"], "건설업 칸을 쓰기 시작했는데 공사 종류가 비었다(원수급 사업장의 공사 현황)", FORM_BACK);
  }

  // 서술 칸 요소
  const sit = str(values.accident_situation);
  if (sit && sit.length < 20) add("warn", ["accident_situation"], "당시 상황이 짧다 — 불안전한 상태(기계·설비·구조물·환경)와 불안전한 행동(재해자·동료)을 둘 다 적었는지 본다", FORM_BACK);
  const wt = str(values.work_type);
  if (wt && wt.length < 10) add("warn", ["work_type"], "작업유형은 「누가 · 어떤 기계·설비를 · 무슨 작업 중」 셋을 적는다", FORM_BACK);
  const cause = str(values.accident_cause);
  if (cause) {
    const missing = CAUSE_FACTORS.filter(([, re]) => !re.test(cause)).map(([n]) => n);
    if (missing.length) add("warn", ["accident_cause"], `원인 칸에 ${missing.join(" · ")} 이(가) 보이지 않는다 — 요인마다 검토했는지 본다(해당 없으면 그렇게 적는다)`, FORM_BACK);
    if (/^\s*(작업자\s*)?부주의\.?\s*$/.test(cause)) add("warn", ["accident_cause"], "원인을 「부주의」 한 마디로 끝냈다 — 그 행동을 가능하게 한 설비·작업방법·관리의 빈틈을 적는다", FORM_BACK);
  }
  const plan = str(values.prevention_plan);
  if (plan) {
    if (!/\d{4}\s*[.\-/년]\s*\d{1,2}|\d{1,2}\s*월|즉시|매일|매주|매월|까지/.test(plan)) add("warn", ["prevention_plan"], "재발방지 계획에 기한(언제까지)이 보이지 않는다");
    if (!/팀장|담당|관리자|관리감독자|부서|책임자|과장|부장|대표|팀|위원회/.test(plan)) add("warn", ["prevention_plan"], "재발방지 계획에 담당(누가)이 보이지 않는다");
    if (cause && plan.length < cause.length / 2) add("info", ["prevention_plan"], "재발방지 계획이 원인 칸보다 많이 짧다 — 원인 요인마다 짝이 되는 조치가 있는지 본다", "서식 Ⅳ 「재해발생 원인을 토대로」");
  }

  if (on(values.comwel_guide_consent)) add("info", ["comwel_guide_consent"], "개인정보 활용 동의 칸은 재해자 본인이 동의한 경우에만 표시한다");

  // 기한 참고일
  let deadline: Deadline | null = null;
  if (acc) {
    const due = oneMonthAfter(acc);
    const t = ymd(...(today.split("-") as [string, string, string]));
    const daysLeft = t ? Math.round((due.getTime() - t.getTime()) / 86_400_000) : NaN;
    const wd = WEEKDAYS[due.getUTCDay()]!;
    deadline = {
      accident_date: iso(acc),
      reference_deadline: iso(due),
      reference_weekday: wd,
      today,
      days_left: daysLeft,
      note:
        "발생한 날부터 1개월(시행규칙 제73조제1항). 민법 제157조·제160조로 센 참고일이다" +
        (wd === "토" || wd === "일" ? ` — 참고일이 ${wd}요일이라 민법 제161조로 그다음 날로 넘어갈 수 있다` : "") +
        ". 공휴일은 따지지 않았다",
    };
    if (t && daysLeft < 0) add("warn", [], `기한 참고일(${iso(due)})이 지났다. 늦게라도 자진 제출하면 보고한 것으로 보는 특례가 있으나 안전관리자·보건관리자를 두어야 하는 사업주 등에는 적용되지 않는다`, `${RULE73}제2항`);
  }

  const counts = { error: 0, warn: 0, info: 0 } as Record<IssueLevel, number>;
  for (const i of issues) counts[i.level]++;
  return {
    form_id: "F_INDUSTRIAL_ACCIDENT_REPORT",
    issues,
    counts,
    deadline,
    note: "형식·누락 점검이다. 산업재해 해당 여부, 사실관계, 책임은 판단하지 않는다. 서술 칸의 낱말 점검은 단서일 뿐이라 내용은 작성자가 확인한다",
  };
}
