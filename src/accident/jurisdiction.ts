// 사업장 주소 → 관할 지방고용노동관서 · 산업재해조사표 접수 부서 · 전화 · 팩스 · 출처 · 확인방법.
// 데이터 = data/labor-offices/(원본 labor-office-directory, 2026-11-04 확인 — 그 폴더 README.md).
// findOffice 는 원본 find.mjs 를 TypeScript 로 옮긴 것이다(같은 규칙, 같은 시험 사례 — test/labor-office.test.ts).
//   관할 근거 = 「고용노동부와 그 소속기관 직제 시행규칙」 별표 1 · 연락처 = 각 관서 고용노동부 누리집 부서 화면.
// 후보가 여럿이면 하나로 추정하지 않는다. 팩스 발송은 범위가 아니다(번호 안내까지). 직원 성명은 내지 않는다.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 데이터 폴더 — env SANJAE_LABOR_OFFICE_DIR 가 있으면 그것, 없으면 패키지 안 data/labor-offices/ */
export function laborOfficeDataDir(root: string): string {
  return process.env.SANJAE_LABOR_OFFICE_DIR || join(root, "data", "labor-offices");
}

/** 데이터 폴더에 있어야 할 파일(labor-office-directory 산출물 이름 그대로) */
export const LABOR_OFFICE_FILES = ["labor_offices.json", "jurisdiction.json"] as const;

// ── 원본 데이터 모양(쓰는 칸만) ─────────────────────────────────────────────

interface RawContact {
  dept: string;
  kind?: string;
  phone: string | null;
  fax: string | null;
  fax_all?: string[];
  phone_alt?: string | null;
  fax_alt?: string | null;
  address?: string | null;
  phone_verification?: string | null;
  fax_verification?: string | null;
  fax_status?: string | null;
  fax_source?: string | null;
  notes?: string[] | null;
  source?: string | null;
  why?: string;
}

interface RawOffice {
  id: string;
  name: string;
  kind: string;
  parent: string | null;
  parent_name: string | null;
  address: string | null;
  main_phone: string | null;
  main_fax: string | null;
  sources?: string[];
  units?: { name: string; accident_report: RawContact }[];
  accident_report?: { general?: RawContact; construction?: RawContact; regional_alt?: RawContact };
  notes?: string[] | null;
}

interface Jurisdiction {
  source: { law: string; annex_header?: string; annex_in_force?: string; url?: string; fetched_kst?: string };
  sido_aliases: Record<string, string>;
  sigungu_aliases?: Record<string, Record<string, string>>;
  sido_moves?: { from_sido: string; sigungu: string; to_sido: string; note: string }[];
  jurisdiction: Record<string, Record<string, string>>;
  exceptions?: { sido: string; sigungu: string; area: string; office: string; default_office: string }[];
  contact_overrides?: { sido: string; office: string; dept: string; note: string }[];
}

export interface LaborOfficeData {
  jurisdiction: Jurisdiction;
  offices: { meta: { checked: string; contact_basis?: string }; offices: RawOffice[] };
}

const cache = new Map<string, LaborOfficeData>();

/** 두 파일을 읽는다(폴더별로 한 번). 파일이 없으면 null */
export function loadLaborOfficeData(root: string): LaborOfficeData | null {
  const dir = laborOfficeDataDir(root);
  const hit = cache.get(dir);
  if (hit) return hit;
  if (!LABOR_OFFICE_FILES.every((f) => existsSync(join(dir, f)))) return null;
  const data: LaborOfficeData = {
    jurisdiction: JSON.parse(readFileSync(join(dir, "jurisdiction.json"), "utf8")) as Jurisdiction,
    offices: JSON.parse(readFileSync(join(dir, "labor_offices.json"), "utf8")) as LaborOfficeData["offices"],
  };
  cache.set(dir, data);
  return data;
}

// ── 찾기(원본 find.mjs 그대로) ─────────────────────────────────────────────

// 옛 광주광역시의 자치구 — 「광주시 북구」처럼 쓰면 광주광역시로 읽는다(그 밖의 「광주시」는 경기도 광주시)
const GWANGJU_METRO_GU = new Set(["동구", "서구", "남구", "북구", "광산구"]);

function normalize(address: string): string {
  return String(address ?? "")
    .replace(/\(\s*우\s*[:：]?\s*\d{5}\s*\)/g, " ")
    .replace(/^\s*\[?\d{5}\]?\s+/, " ")
    .replace(/[,·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 시군구 이름 → [시도...] (시도를 생략한 주소용) */
function sigunguIndex(jur: Jurisdiction): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  const add = (sgg: string, sido: string) => {
    const list = idx.get(sgg) ?? [];
    if (!list.includes(sido)) list.push(sido);
    idx.set(sgg, list);
  };
  for (const [sido, m] of Object.entries(jur.jurisdiction)) for (const sgg of Object.keys(m)) if (sgg !== "*") add(sgg, sido);
  for (const [sido, m] of Object.entries(jur.sigungu_aliases ?? {})) for (const oldName of Object.keys(m)) add(oldName, sido);
  for (const mv of jur.sido_moves ?? []) add(mv.sigungu, mv.to_sido);
  return idx;
}

/** 시도 이름 첫머리(공백 없이 붙여 쓴 주소: 「서울특별시중구」) */
function splitGluedSido(token: string, jur: Jurisdiction): [string, string] | null {
  const names = Object.keys(jur.sido_aliases).sort((a, b) => b.length - a.length);
  for (const n of names) if (n.length >= 3 && token.startsWith(n) && token.length > n.length) return [n, token.slice(n.length)];
  return null;
}

export interface ParsedAddress {
  text: string;
  tokens: string[];
  sido: string | null;
  sigungu: string | null;
  rest: string;
  notes: string[];
}

export function parseAddress(address: string, jur: Jurisdiction): ParsedAddress {
  const text = normalize(address);
  let tokens = text.split(" ").filter(Boolean);
  const notes: string[] = [];
  if (tokens.length && !jur.sido_aliases[tokens[0]!]) {
    const glued = splitGluedSido(tokens[0]!, jur);
    if (glued) tokens = [...glued, ...tokens.slice(1)];
  }
  let sido: string | null = null;
  let i = 0;
  if (tokens[0] === "광주시") {
    // 「광주시」 = 경기도 광주시가 원칙. 다음 낱말이 광주광역시 자치구면 광주광역시로 본다.
    if (GWANGJU_METRO_GU.has(tokens[1] ?? "")) {
      sido = "전남광주통합특별시";
      i = 1;
      notes.push("「광주시 ○구」를 광주광역시(현 전남광주통합특별시)로 읽음");
    }
  } else if (tokens[0] && jur.sido_aliases[tokens[0]]) {
    sido = jur.sido_aliases[tokens[0]]!;
    if (sido !== tokens[0]) notes.push(`시도 이름 「${tokens[0]}」→「${sido}」(법령 별표 1 표기)`);
    i = 1;
  }
  let sigungu: string | null = null;
  const t = tokens[i];
  const gluedSiGu = t?.match(/^(.{1,4}?시)(.{1,4}구)$/); // 「수원시팔달구」
  if (gluedSiGu) sigungu = gluedSiGu[1]!;
  else if (t && /[시군구]$/.test(t)) sigungu = t;
  else if (t) {
    const m = t.match(/^(.+?[시군])(.+[구읍면동])$/);
    if (m) sigungu = m[1]!;
  }
  return { text, tokens, sido, sigungu, rest: tokens.slice(i + 1).join(" "), notes };
}

const officeById = (data: LaborOfficeData, id: string) => data.offices.offices.find((o) => o.id === id) ?? null;

type ReportTo = RawContact & { unit?: string; override_note?: string; construction_note?: string };

function contactFor(data: LaborOfficeData, officeId: string, sido: string, construction: boolean): ReportTo | null {
  const o = officeById(data, officeId);
  if (!o) return null;
  const override = (data.jurisdiction.contact_overrides ?? []).find((c) => c.office === officeId && c.sido === sido);
  if (override) {
    const unit = (o.units ?? []).find((u) => u.name === override.dept);
    if (unit) return { ...unit.accident_report, unit: unit.name, override_note: override.note };
  }
  const ar = o.accident_report ?? {};
  if (construction && ar.construction) return { ...ar.construction, kind: "construction" };
  const general: ReportTo = { ...(ar.general ?? { dept: "", phone: null, fax: null }), kind: "general" };
  if (construction) general.construction_note = "이 관서에는 건설산재 전담 과가 없어 산재예방감독과(팀) 연락처를 돌려준다";
  return general;
}

export interface RawSummary {
  id: string;
  name: string | null;
  kind?: string;
  parent?: string | null;
  parent_name?: string | null;
  address?: string | null;
  main_phone?: string | null;
  main_fax?: string | null;
  report_to?: ReportTo | null;
  report_to_alt?: RawContact | null;
  source_url?: string | null;
  office_notes?: string[];
  why?: string;
  sido?: string;
}

function summarize(data: LaborOfficeData, officeId: string, sido: string, construction: boolean): RawSummary {
  const o = officeById(data, officeId);
  if (!o) return { id: officeId, name: null };
  const reportTo = contactFor(data, officeId, sido, construction);
  // 지방청 직할 구역: 광역산재예방감독과도 법령상 「재해발생 상황파악」을 맡는다 — 함께 돌려준다
  const alt = reportTo?.kind === "general" && !reportTo.unit ? (o.accident_report?.regional_alt ?? null) : null;
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    parent: o.parent,
    parent_name: o.parent_name,
    address: o.address,
    main_phone: o.main_phone,
    main_fax: o.main_fax,
    report_to: reportTo,
    report_to_alt: alt,
    source_url: o.sources?.[0] ?? null,
    office_notes: o.notes ?? [],
  };
}

type Resolved =
  | { office: string; matched: { sido: string; sigungu: string | null }; notes?: string[] }
  | { candidates: { office: string; why: string }[]; matched: { sido: string; sigungu: string | null }; notes?: string[] };

function resolveInSido(jur: Jurisdiction, sido: string, sigungu: string | null, rest: string): Resolved | null {
  const m = jur.jurisdiction[sido];
  if (!m) return null;
  if (m["*"]) return { office: m["*"], matched: { sido, sigungu: null } };
  if (!sigungu) return null;
  let sgg = sigungu;
  const alias = jur.sigungu_aliases?.[sido]?.[sgg];
  const notes: string[] = [];
  if (alias && !m[sgg]) {
    notes.push(`옛 이름 「${sgg}」→「${alias}」(같은 관서)`);
    sgg = alias;
  }
  const office = m[sgg];
  if (!office) return null;
  for (const e of (jur.exceptions ?? []).filter((x) => x.sido === sido && x.sigungu === sgg)) {
    // 예: 칠곡군 석적읍 중리 구미국가산업단지 → 구미지청 (나머지 칠곡군 = 대구서부지청)
    const [eup = "", ri = ""] = e.area.split(" ");
    const r = rest ?? "";
    if (/국가산업단지|국가산단|구미국가/.test(r) && r.includes(eup)) {
      return { office: e.office, matched: { sido, sigungu: sgg }, notes: [...notes, `법령 예외: ${e.area}`] };
    }
    if (r.includes(eup)) {
      const riGiven = /\S+리(\s|$|\d)/.test(r.replace(eup, ""));
      if (riGiven && !r.includes(ri)) return { office, matched: { sido, sigungu: sgg }, notes: [...notes, `${eup} 이지만 ${ri} 아님`] };
      return {
        candidates: [
          { office: e.office, why: `${e.area} 안이면` },
          { office: e.default_office, why: `${e.area} 밖이면` },
        ],
        matched: { sido, sigungu: sgg },
        notes: [...notes, `법령이 「${e.area}」만 따로 관할 — 주소만으로 가를 수 없음`],
      };
    }
  }
  return { office, matched: { sido, sigungu: sgg }, notes };
}

export interface RawFind {
  status: "confirmed" | "candidates" | "none";
  input: string;
  parsed: { sido?: string | null; sigungu?: string | null };
  office?: RawSummary;
  candidates?: RawSummary[];
  notes: string[];
}

/** 원본 find.mjs 의 findOffice — 순수 함수 */
export function findOffice(address: string, data: LaborOfficeData, opts: { construction?: boolean } = {}): RawFind {
  const jur = data.jurisdiction;
  const construction = Boolean(opts.construction);
  const p = parseAddress(address, jur);
  const notes = [...p.notes];
  let sido = p.sido;
  const sigungu = p.sigungu;

  // 시도가 바뀐 시군구(경상북도 군위군 → 대구광역시)
  for (const mv of jur.sido_moves ?? []) {
    if (sido === mv.from_sido && sigungu === mv.sigungu) {
      notes.push(`${mv.from_sido} ${mv.sigungu} → ${mv.to_sido} (${mv.note})`);
      sido = mv.to_sido;
    }
  }

  if (sido) {
    const s = sido;
    const r = resolveInSido(jur, s, sigungu, p.rest);
    if (!r) return { status: "none", input: address, parsed: { sido: s, sigungu }, notes: [...notes, "시군구를 관할표에서 찾지 못함"] };
    if ("candidates" in r) {
      return {
        status: "candidates",
        input: address,
        parsed: r.matched,
        candidates: r.candidates.map((c) => ({ ...summarize(data, c.office, s, construction), why: c.why })),
        notes: [...notes, ...(r.notes ?? [])],
      };
    }
    return { status: "confirmed", input: address, parsed: r.matched, office: summarize(data, r.office, s, construction), notes: [...notes, ...(r.notes ?? [])] };
  }

  // 시도 생략: 시군구 이름으로만 찾는다(같은 이름이 여럿이면 후보)
  if (!sigungu) return { status: "none", input: address, parsed: {}, notes: [...notes, "시도·시군구를 읽지 못함"] };
  const sidos = sigunguIndex(jur).get(sigungu) ?? [];
  const hits: { sido: string; office: string; why?: string }[] = [];
  for (const s of sidos) {
    const r = resolveInSido(jur, s, sigungu, p.rest);
    if (r && "office" in r) hits.push({ sido: s, office: r.office });
    if (r && "candidates" in r) for (const c of r.candidates) hits.push({ sido: s, office: c.office, why: c.why });
  }
  const uniq = [...new Map(hits.map((h) => [h.office, h])).values()];
  if (uniq.length === 1 && hits.length === 1) {
    const h = uniq[0]!;
    return {
      status: "confirmed",
      input: address,
      parsed: { sido: h.sido, sigungu },
      office: summarize(data, h.office, h.sido, construction),
      notes: [...notes, "시도가 빠진 주소 — 시군구 이름이 하나뿐이라 확정"],
    };
  }
  if (uniq.length === 0) return { status: "none", input: address, parsed: { sigungu }, notes: [...notes, "시군구를 관할표에서 찾지 못함"] };
  return {
    status: "candidates",
    input: address,
    parsed: { sigungu },
    candidates: hits.map((h) => ({ ...summarize(data, h.office, h.sido, construction), sido: h.sido, why: h.why ?? `${h.sido} ${sigungu}` })),
    notes: [...notes, `시도가 빠졌고 「${sigungu}」가 ${sidos.length}곳에 있음 — 시도를 넣어 다시 찾기`],
  };
}

// ── 도구 출력 ──────────────────────────────────────────────────────────────

/** 지방청 접수 과 미확정·단일 출처 팩스·번호 미확인일 때 붙이는 표시(문구 그대로) */
export const CALL_BEFORE_SUBMIT = "제출 전 전화 확인 권장";

export type OfficeLookupStatus =
  /** 데이터 파일이 없다 — fallback 만 쓴다 */
  | "DATA_NOT_CONNECTED"
  /** 관서 하나로 정해졌다 */
  | "CONFIRMED"
  /** 시도가 빠졌거나 읍·리 단위로 관할이 갈려 후보가 여럿이다 — 하나로 추정하지 않는다 */
  | "CANDIDATES"
  /** 시도·시군구를 읽지 못했다 */
  | "NOT_FOUND";

/** 조사표를 받는 부서 하나 */
export interface ReportDesk {
  /** 기본 = 먼저 연락할 부서 · 보조 = 지방청 직할 구역에서 함께 확인할 광역산재예방감독과 */
  role: "기본" | "보조";
  /** 부서 이름(관서마다 다르다: 산재예방감독과·건설산재예방감독과·제주산재예방감독팀 등) */
  department: string;
  phone: string | null;
  fax: string | null;
  /** 팩스가 둘 이상 적힌 부서 */
  fax_all?: string[];
  phone_alt?: string;
  fax_alt?: string;
  /** 부서가 본청과 다른 건물이면 그 주소 */
  address: string | null;
  /** 확인방법 — 공식 직접 확인 · 두 리서치 일치 · 단일 출처 · 미확인 */
  phone_verification: string | null;
  fax_verification: string | null;
  /** 팩스 번호를 어디서 읽었나 */
  fax_source: string | null;
  /** 번호를 확인한 관서 화면 */
  source_url: string | null;
  /** 건설업 전담 과로 안내했는가 */
  construction_desk: boolean;
  /** 데이터에 적힌 주의(공지 링크 포함) */
  notes: string[];
  /** 보조 부서를 함께 주는 이유 */
  why?: string;
}

export interface OfficeContact {
  /** 데이터 안 관서 id(예: seoul, seoulgangnam) */
  office_id: string;
  /** 예: 서울지방고용노동청 · 서울강남지청 */
  office_name: string;
  /** 지방청 / 지청 / 출장소 */
  office_kind: string | null;
  /** 상위 지방청(직제 시행규칙 별표 3) */
  parent_name: string | null;
  office_address: string | null;
  main_phone: string | null;
  main_fax: string | null;
  /** 서식 맨 아래 「(  )지방고용노동청장(지청장) 귀하」 괄호에 넣을 값의 제안 — 칸에 자동으로 넣지 않는다 */
  labor_office_value: string | null;
  /** 조사표 접수 부서(기본) */
  report_to: ReportDesk;
  /** 지방청 직할 구역일 때 함께 확인할 부서(보조). 그 밖에는 null */
  report_to_alt: ReportDesk | null;
  /** 「제출 전 전화 확인 권장」 — 접수 과 미확정·단일 출처 팩스·번호 미확인이면 붙는다. 아니면 null */
  confirm_before_submit: string | null;
  /** 사람이 알아야 할 주의(왜 전화 확인을 권하는지 등) */
  cautions: string[];
  /** 관서 부서 안내 화면 */
  source_url: string | null;
  /** 후보일 때: 어느 경우 이 관서인지 */
  why?: string;
  /** 후보일 때: 어느 시도의 같은 이름 시군구인지 */
  sido?: string;
}

export interface OfficeLookup {
  status: OfficeLookupStatus;
  input: { workplace_address: string; construction: boolean };
  parsed?: { sido?: string | null; sigungu?: string | null };
  office?: OfficeContact;
  candidates?: OfficeContact[];
  notes: string[];
  /** 데이터 근거와 확인일 */
  data: {
    dir: string;
    connected: boolean;
    checked_at: string | null;
    jurisdiction_basis: string;
    jurisdiction_url: string;
    contact_basis: string;
    verification_values: Record<string, string>;
  };
  fax_note: string;
  /** 데이터가 없거나 하나로 정해지지 않을 때 사람이 찾는 길 */
  fallback: { how: string; portal_url: string };
}

/** 출력에는 서버의 절대 경로를 내지 않는다 */
const DATA_DIR_LABEL = "data/labor-offices/(env SANJAE_LABOR_OFFICE_DIR 로 바꿀 수 있다)";

const FALLBACK = {
  how: "고용노동부 누리집(www.moel.go.kr) 「지방관서」에서 사업장 소재지 관할 관서를 찾아 산재예방감독과(팀)에 확인한다. 온라인 제출은 노동포털 민원 「산업재해조사표」(AH038)",
  portal_url: "https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchVal=AH038&searchGubun=1&searchRlm=2",
};

const VERIFICATION_VALUES: Record<string, string> = {
  "공식 직접 확인": "관서 부서 화면에서 직접 읽은 번호",
  "두 리서치 일치": "공식 화면에 없고 외부 조사 두 곳이 같은 번호를 냄",
  "단일 출처": `출처가 하나뿐인 번호 — ${CALL_BEFORE_SUBMIT}`,
  미확인: "번호를 찾지 못함(지어내지 않는다)",
};

const FAX_NOTE = "이 도구는 팩스를 보내지 않는다. 번호 안내까지다. 노동포털(AH038) 온라인 제출도 된다";

const OFFICIAL = "공식 직접 확인";

function desk(c: ReportTo | RawContact, role: "기본" | "보조"): ReportDesk {
  const d: ReportDesk = {
    role,
    department: ("unit" in c && c.unit) || c.dept,
    phone: c.phone ?? null,
    fax: c.fax ?? null,
    address: c.address ?? null,
    phone_verification: c.phone_verification ?? null,
    fax_verification: c.fax_verification ?? null,
    fax_source: c.fax_source ?? null,
    source_url: c.source ?? null,
    construction_desk: c.kind === "construction",
    notes: [...(c.notes ?? [])],
  };
  if (c.fax_all && c.fax_all.length > 1) d.fax_all = c.fax_all;
  if (c.phone_alt) d.phone_alt = c.phone_alt;
  if (c.fax_alt) d.fax_alt = c.fax_alt;
  if (c.why) d.why = c.why;
  if ("override_note" in c && c.override_note) d.notes.push(c.override_note);
  if ("construction_note" in c && c.construction_note) d.notes.push(c.construction_note);
  return d;
}

/** 「(  )지방고용노동청장(지청장) 귀하」 괄호 값 제안 — 지방청은 「서울」, 지청은 「서울강남」. 출장소는 정하지 않는다 */
function slotValue(name: string, kind: string | undefined): string | null {
  if (kind === "지방청") return name.replace(/지방고용노동청$/, "") || null;
  if (kind === "지청") return name.replace(/지청$/, "") || null;
  return null;
}

function shape(s: RawSummary): OfficeContact | null {
  if (!s.name || !s.report_to) return null;
  const report_to = desk(s.report_to, "기본");
  const report_to_alt = s.report_to_alt ? desk(s.report_to_alt, "보조") : null;
  const cautions: string[] = [];
  if (report_to_alt) {
    cautions.push(
      `지방청 직할 구역은 조사표 접수 과가 확정되지 않았다 — ${report_to.department}(기본)와 ${report_to_alt.department}(보조) 번호를 함께 드린다. ${CALL_BEFORE_SUBMIT}`,
    );
    if (!report_to_alt.phone && !report_to_alt.fax) cautions.push(`${report_to_alt.department} 번호는 관서 화면에 없어 미확인이다 — 관서 대표전화로 확인`);
  }
  if (!report_to.fax) cautions.push(`${report_to.department} 팩스 번호 미확인 — 전화로 확인`);
  else if (report_to.fax_verification && report_to.fax_verification !== OFFICIAL) {
    cautions.push(`${report_to.department} 팩스 번호 확인방법 = ${report_to.fax_verification}${report_to.fax_source ? `(${report_to.fax_source})` : ""}. ${CALL_BEFORE_SUBMIT}`);
  }
  if (report_to.phone_verification && report_to.phone_verification !== OFFICIAL) {
    cautions.push(`${report_to.department} 전화 번호 확인방법 = ${report_to.phone_verification}. ${CALL_BEFORE_SUBMIT}`);
  }
  if (s.kind === "출장소") cautions.push(`출장소다 — 서식의 「(  )지방고용노동청장(지청장)」 괄호에 무엇을 적을지는 관서에 확인(상위 ${s.parent_name ?? "지방청"})`);
  const out: OfficeContact = {
    office_id: s.id,
    office_name: s.name,
    office_kind: s.kind ?? null,
    parent_name: s.parent_name ?? null,
    office_address: s.address ?? null,
    main_phone: s.main_phone ?? null,
    main_fax: s.main_fax ?? null,
    labor_office_value: slotValue(s.name, s.kind),
    report_to,
    report_to_alt,
    confirm_before_submit: cautions.some((c) => c.includes(CALL_BEFORE_SUBMIT) || c.includes("미확인")) ? CALL_BEFORE_SUBMIT : null,
    cautions,
    source_url: s.source_url ?? null,
  };
  if (s.why) out.why = s.why;
  if (s.sido) out.sido = s.sido;
  return out;
}

/** 예: 고용노동부와 그 소속기관 직제 시행규칙 별표 1(관할 구역) <개정 2026. 6. 30.>, 2026-07-01 시행 */
function basisText(src: Jurisdiction["source"]): string {
  const rev = src.annex_header?.match(/<[^>]+>/)?.[0];
  const inForce = src.annex_in_force?.split(" ")[0];
  return `${src.law} 별표 1(관할 구역)${rev ? ` ${rev}` : ""}${inForce ? `, ${inForce} 시행` : ""}`;
}

/**
 * 사업장 소재지로 관할 관서와 산업재해조사표 접수 부서를 찾는다(읽기 전용, 무저장).
 * CONFIRMED 면 office, CANDIDATES 면 candidates(하나로 추정하지 않는다), NOT_FOUND 면 둘 다 없다.
 */
export function lookupLaborOffice(root: string, workplaceAddress: string, construction = false): OfficeLookup {
  const data = loadLaborOfficeData(root);
  const input = { workplace_address: workplaceAddress, construction };
  const base = {
    data: {
      dir: DATA_DIR_LABEL,
      connected: Boolean(data),
      checked_at: data?.offices.meta.checked ?? null,
      jurisdiction_basis: data ? basisText(data.jurisdiction.source) : "고용노동부와 그 소속기관 직제 시행규칙 별표 1",
      jurisdiction_url: data?.jurisdiction.source.url ?? "https://www.law.go.kr/법령/고용노동부와그소속기관직제시행규칙",
      contact_basis: "각 관서 고용노동부 누리집 부서 안내 화면(moel.go.kr/local/{관서}/introduce/dept/list.do)",
      verification_values: VERIFICATION_VALUES,
    },
    fax_note: FAX_NOTE,
    fallback: FALLBACK,
  };
  if (!data) {
    return {
      status: "DATA_NOT_CONNECTED",
      input,
      notes: [`관할·연락처 데이터 파일(${LABOR_OFFICE_FILES.join(" · ")})이 ${DATA_DIR_LABEL} 에 없다`, "관서를 추정해서 적지 않는다. labor_office 칸은 확인한 관서로 채운다"],
      ...base,
    };
  }
  const r = findOffice(workplaceAddress, data, { construction });
  const notes = [...r.notes];
  if (r.status === "confirmed" && r.office) {
    const office = shape(r.office);
    if (office) return { status: "CONFIRMED", input, parsed: r.parsed, office, notes, ...base };
  }
  if (r.status === "candidates" && r.candidates) {
    const candidates = r.candidates.map(shape).filter((c): c is OfficeContact => c !== null);
    notes.push("후보 중 하나로 추정하지 않는다 — 시도·읍면·리를 더 넣어 다시 찾거나 관서에 확인");
    return { status: "CANDIDATES", input, parsed: r.parsed, candidates, notes, ...base };
  }
  return { status: "NOT_FOUND", input, parsed: r.parsed, notes: [...notes, "시도와 시군구를 넣은 도로명·지번 주소로 다시 찾기"], ...base };
}
