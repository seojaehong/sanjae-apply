// 관할 관서 찾기 — 원본 labor-office-directory/find.test.mjs 15건을 같은 사례로 옮기고(data/labor-offices/upstream/),
// 도구 출력(지방청 두 번호·「제출 전 전화 확인 권장」·확인방법·성명 없음)을 더 본다. 주소는 관공서·공개 주소다.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALL_BEFORE_SUBMIT,
  findOffice,
  loadLaborOfficeData,
  lookupLaborOffice,
  parseAddress,
  type LaborOfficeData,
} from "../src/accident/jurisdiction.js";
import { findOutcomeLanguage } from "../src/core/filter.js";

const ROOT = process.cwd();
const data = loadLaborOfficeData(ROOT) as LaborOfficeData;
const id = (addr: string, opts?: { construction?: boolean }) => {
  const r = findOffice(addr, data, opts);
  return r.status === "confirmed" ? r.office!.id : r.status;
};
const cands = (addr: string) => {
  const r = findOffice(addr, data);
  expect(r.status, `${addr} → ${r.status}`).toBe("candidates");
  return r.candidates!.map((c) => c.id).sort();
};

describe("원본 find.test.mjs 와 같은 사례", () => {
  it("데이터가 있다(관서 49곳, 확인일 2026-11-04)", () => {
    expect(data).toBeTruthy();
    expect(data.offices.offices).toHaveLength(49);
    expect(data.offices.meta.checked).toBe("2026-11-04");
  });

  it("기본: 지방청 직할과 지청", () => {
    expect(id("서울특별시 중구 삼일대로 363")).toBe("seoul");
    expect(id("서울특별시 강남구 테헤란로 152")).toBe("seoulgangnam");
    expect(id("경기도 수원시 팔달구 효원로 1")).toBe("gyeonggi");
    expect(id("충청북도 청주시 상당구 상당로 82")).toBe("cheongju");
    expect(id("경기도 수원시팔달구 효원로 1")).toBe("gyeonggi");
  });

  it("같은 이름 구 — 시도로 가른다", () => {
    const want: [string, string][] = [
      ["서울특별시 중구 세종대로 110", "seoul"],
      ["부산광역시 중구 중앙대로 2", "busan"],
      ["대구광역시 중구 공평로 88", "daegu"],
      ["울산광역시 중구 성안로 1", "ulsandongbu"],
      ["대전광역시 중구 중앙로 100", "daejeon"],
      ["서울특별시 강서구 화곡로 302", "seoulnambu"],
      ["부산광역시 강서구 낙동북로 477", "busanbukbu"],
      ["부산광역시 북구 금곡대로 1", "busanbukbu"],
      ["대구광역시 북구 연암로 40", "daegu"],
      ["울산광역시 북구 산업로 1", "ulsandongbu"],
      ["대구광역시 서구 국채보상로 257", "daeguseobu"],
      ["부산광역시 서구 구덕로 120", "busan"],
      ["대구광역시 남구 이천로 51", "daeguseobu"],
      ["울산광역시 남구 돋질로 233", "ulsan"],
    ];
    for (const [a, o] of want) expect(id(a), a).toBe(o);
  });

  it("시도를 빼면 같은 이름 구는 후보로 돌려준다(추정 금지)", () => {
    const c = cands("중구 세종대로 110");
    for (const o of ["seoul", "busan", "daegu", "ulsandongbu"]) expect(c).toContain(o);
    expect(cands("고성군 간성읍 고성중앙길 9")).toEqual(["gangneung", "tongyeong"]);
    expect(id("김포시 사우중로 1")).toBe("bucheon");
  });

  it("세종특별자치시 — 시군구 없이 대전청", () => {
    for (const a of ["세종특별자치시 한누리대로 2130", "세종시 갈매로 388", "세종 도움6로 11"]) expect(id(a), a).toBe("daejeon");
  });

  it("제주(행정시) — 광주청 관할, 연락처는 제주산재예방감독팀", () => {
    for (const a of ["제주특별자치도 제주시 청사로 59", "제주특별자치도 서귀포시 중앙로 105", "제주도 제주시 문연로 6"]) {
      const r = findOffice(a, data);
      expect(r.status, a).toBe("confirmed");
      expect(r.office!.id).toBe("gwangju");
      expect(r.office!.report_to!.unit, a).toBe("제주산재예방감독팀");
    }
    const g = findOffice("광주광역시 북구 첨단과기로 208번길 43", data);
    expect(g.office!.id).toBe("gwangju");
    expect(g.office!.report_to!.unit).not.toBe("제주산재예방감독팀");
  });

  it("일부 지역만 다른 관할 — 칠곡군 석적읍 중리 구미국가산업단지", () => {
    expect(id("경상북도 칠곡군 왜관읍 군청1길 80")).toBe("daeguseobu");
    expect(id("경상북도 칠곡군 석적읍 중리 구미국가산업단지 100")).toBe("gumi");
    expect(id("경상북도 칠곡군 석적읍 남율리 123")).toBe("daeguseobu");
    expect(cands("경상북도 칠곡군 석적읍 석적로 955")).toEqual(["daeguseobu", "gumi"]);
    expect(cands("경상북도 칠곡군 석적읍 중리 55")).toEqual(["daeguseobu", "gumi"]);
  });

  it("시도 경계를 넘는 관할(별표 1)", () => {
    expect(id("강원특별자치도 철원군 철원읍 금학로 1")).toBe("uijeongbu");
    expect(id("강원도 철원군 갈말읍 삼부연로 51")).toBe("uijeongbu");
    expect(id("경기도 가평군 가평읍 석봉로 181")).toBe("gangwon");
    expect(id("충청남도 공주시 봉황로 1")).toBe("daejeon");
    expect(id("경상북도 경산시 남매로 158")).toBe("daegu");
  });

  it("상위청은 별표 3 — 부천지청은 중부청, 울산은 부산청, 영월은 출장소", () => {
    const r = findOffice("경기도 부천시 길주로 210", data);
    expect(r.office!.id).toBe("bucheon");
    expect(r.office!.parent).toBe("jungbu");
    expect(findOffice("울산광역시 남구 돋질로 233", data).office!.parent).toBe("busan");
    expect(findOffice("강원특별자치도 영월군 영월읍 단종로 8", data).office!.id).toBe("yeongwol");
  });

  it("옛 이름 주소 — 광주광역시·전라남도·전라북도·강원도·경상북도 군위군·인천 중구/서구", () => {
    const want: [string, string][] = [
      ["광주광역시 서구 내방로 111", "gwangju"],
      ["광주 광산구 광산로 29", "gwangju"],
      ["광주시 북구 우치로 77", "gwangju"],
      ["전라남도 목포시 양을로 203", "mokpo"],
      ["전남 순천시 장명로 30", "yeosu"],
      ["전라남도 나주시 시청길 22", "gwangju"],
      ["전라북도 전주시 완산구 노송광장로 10", "jeonju"],
      ["강원도 춘천시 시청길 11", "gangwon"],
      ["경상북도 군위군 군위읍 군청로 200", "daegu"],
      ["인천광역시 중구 신포로 27", "jungbu"],
      ["인천광역시 중구 운서동 2850", "jungbu"],
      ["인천광역시 동구 송림로 23", "jungbu"],
      ["인천광역시 서구 서곶로 307", "incheonbukbu"],
      ["인천광역시 검단구 검단로 1", "incheonbukbu"],
      ["인천광역시 제물포구 참외전로 1", "jungbu"],
      ["인천광역시 남구 독정이로 95", "jungbu"],
    ];
    for (const [a, o] of want) expect(id(a), a).toBe(o);
  });

  it("경기도 광주시 ↔ 광주광역시", () => {
    expect(id("경기도 광주시 행정타운로 50")).toBe("seongnam");
    expect(id("광주시 오포읍 문형산길 1")).toBe("seongnam");
    expect(id("광주광역시 동구 서남로 1")).toBe("gwangju");
  });

  it("건설업 옵션 — 건설산재예방감독과가 있는 관서만 건설과로", () => {
    expect(findOffice("서울특별시 종로구 세종대로 209", data, { construction: true }).office!.report_to!.kind).toBe("construction");
    const n = findOffice("서울특별시 강남구 테헤란로 152", data, { construction: true });
    expect(n.office!.report_to!.kind).toBe("general");
    expect(n.office!.report_to!.construction_note).toBeTruthy();
  });

  it("지방청 직할 구역은 광역산재예방감독과를 함께 돌려준다(지청·제주·건설은 없음)", () => {
    const s = findOffice("서울특별시 종로구 세종대로 209", data);
    expect(s.office!.report_to!.dept).toBe("산재예방감독과");
    expect(s.office!.report_to_alt!.dept).toBe("광역산재예방감독과");
    expect(findOffice("서울특별시 강남구 테헤란로 152", data).office!.report_to_alt).toBeNull();
    expect(findOffice("제주특별자치도 제주시 청사로 59", data).office!.report_to_alt).toBeNull();
    expect(findOffice("서울특별시 종로구 세종대로 209", data, { construction: true }).office!.report_to_alt).toBeNull();
  });

  it("주소가 아니면 none", () => {
    expect(findOffice("", data).status).toBe("none");
    expect(findOffice("아무말", data).status).toBe("none");
    expect(findOffice("서울특별시 없는구 1", data).status).toBe("none");
  });

  it("모든 관서에 조사표 접수 팩스 칸이 있다(값 또는 「미확인」 표시)", () => {
    for (const o of data.offices.offices) {
      const g = o.accident_report?.general;
      expect(g, `${o.id} general 없음`).toBeTruthy();
      expect(Boolean(g!.fax) || g!.fax_status === "미확인", `${o.id} fax 칸`).toBe(true);
    }
  });

  it("parseAddress 우편번호·괄호 정리", () => {
    const p = parseAddress("(우:04541) 서울특별시 중구 삼일대로 363(장교동)", data.jurisdiction);
    expect(p.sido).toBe("서울특별시");
    expect(p.sigungu).toBe("중구");
  });
});

describe("관할 찾기 도구 출력(lookupLaborOffice)", () => {
  it("지방청 직할: 산재예방감독과(기본)+광역산재예방감독과(보조) 두 번호와 「제출 전 전화 확인 권장」", () => {
    const r = lookupLaborOffice(ROOT, "서울특별시 중구 세종대로 110");
    expect(r.status).toBe("CONFIRMED");
    const o = r.office!;
    expect(o).toMatchObject({ office_name: "서울지방고용노동청", office_kind: "지방청", labor_office_value: "서울", confirm_before_submit: CALL_BEFORE_SUBMIT });
    expect(o.report_to).toMatchObject({ role: "기본", department: "산재예방감독과", phone_verification: "공식 직접 확인", fax_verification: "공식 직접 확인" });
    expect(o.report_to.phone).toMatch(/^\d{2,4}-\d{3,4}-\d{4}$/);
    expect(o.report_to.fax).toMatch(/^\d{2,4}-\d{3,4}-\d{4}$/);
    expect(o.report_to_alt).toMatchObject({ role: "보조", department: "광역산재예방감독과" });
    expect(o.report_to_alt!.phone).toBeTruthy();
    expect(o.report_to_alt!.fax).toBeTruthy();
    expect(o.cautions.join("\n")).toContain(CALL_BEFORE_SUBMIT);
    expect(r.data).toMatchObject({ connected: true, checked_at: "2026-11-04" });
    expect(r.data.jurisdiction_basis).toContain("별표 1");
  });

  it("지방청 7곳 모두 보조 과와 표시가 붙고, 광주청 보조 과는 번호 미확인을 알린다", () => {
    const regional: [string, string][] = [
      ["서울특별시 중구 세종대로 110", "seoul"],
      ["경기도 수원시 팔달구 효원로 1", "gyeonggi"],
      ["인천광역시 남동구 정각로 29", "jungbu"],
      ["부산광역시 중구 중앙대로 2", "busan"],
      ["대구광역시 중구 공평로 88", "daegu"],
      ["광주광역시 서구 내방로 111", "gwangju"],
      ["대전광역시 중구 중앙로 100", "daejeon"],
    ];
    for (const [a, oid] of regional) {
      const o = lookupLaborOffice(ROOT, a).office!;
      expect(o.office_id, a).toBe(oid);
      expect(o.report_to_alt?.role, a).toBe("보조");
      expect(o.confirm_before_submit, a).toBe(CALL_BEFORE_SUBMIT);
    }
    const g = lookupLaborOffice(ROOT, "광주광역시 서구 내방로 111").office!;
    expect(g.report_to_alt!.phone).toBeNull();
    expect(g.report_to_alt!.phone_verification).toBe("미확인");
    expect(g.cautions.some((c) => c.includes("미확인"))).toBe(true);
  });

  it("여수지청 팩스는 확인방법 「단일 출처」와 출처·표시를 함께 낸다", () => {
    const o = lookupLaborOffice(ROOT, "전라남도 여수시 시청로 1").office!;
    expect(o.office_name).toBe("여수지청");
    expect(o.report_to.fax_verification).toBe("단일 출처");
    expect(o.report_to.phone_verification).toBe("공식 직접 확인");
    expect(o.report_to.fax_source).toContain("전자팩스번호표");
    expect(o.confirm_before_submit).toBe(CALL_BEFORE_SUBMIT);
    expect(o.cautions.some((c) => c.includes("단일 출처") && c.includes(CALL_BEFORE_SUBMIT))).toBe(true);
  });

  it("지청은 접수 과 하나·표시 없음, 괄호 값은 「서울강남」", () => {
    const o = lookupLaborOffice(ROOT, "서울특별시 강남구 테헤란로 152").office!;
    expect(o).toMatchObject({ office_name: "서울강남지청", labor_office_value: "서울강남", report_to_alt: null, confirm_before_submit: null });
    expect(o.parent_name).toBe("서울지방고용노동청");
  });

  it("제주는 제주산재예방감독팀, 건설업은 건설산재예방감독과, 영월은 출장소(괄호 값 제안 없음)", () => {
    const j = lookupLaborOffice(ROOT, "제주특별자치도 서귀포시 중앙로 105").office!;
    expect(j.report_to.department).toBe("제주산재예방감독팀");
    expect(j.report_to_alt).toBeNull();
    const c = lookupLaborOffice(ROOT, "서울특별시 종로구 세종대로 209", true).office!;
    expect(c.report_to).toMatchObject({ department: "건설산재예방감독과", construction_desk: true });
    const y = lookupLaborOffice(ROOT, "강원특별자치도 영월군 영월읍 단종로 8").office!;
    expect(y).toMatchObject({ office_kind: "출장소", labor_office_value: null });
    expect(y.cautions.some((s) => s.includes("출장소"))).toBe(true);
  });

  it("후보는 하나로 정하지 않고(CANDIDATES), 못 읽으면 NOT_FOUND 와 찾는 길", () => {
    const c = lookupLaborOffice(ROOT, "중구 세종대로 110");
    expect(c.status).toBe("CANDIDATES");
    expect(c.office).toBeUndefined();
    expect(c.candidates!.length).toBeGreaterThan(3);
    expect(c.candidates!.every((x) => x.sido && x.why)).toBe(true);
    const n = lookupLaborOffice(ROOT, "아무말");
    expect(n.status).toBe("NOT_FOUND");
    expect(n.fallback.portal_url).toContain("AH038");
  });

  it("데이터 폴더가 비면 DATA_NOT_CONNECTED, 절대 경로를 내지 않는다", () => {
    const prev = process.env.SANJAE_LABOR_OFFICE_DIR;
    process.env.SANJAE_LABOR_OFFICE_DIR = mkdtempSync(join(tmpdir(), "lo-"));
    try {
      const r = lookupLaborOffice(ROOT, "서울특별시 중구 세종대로 110");
      expect(r.status).toBe("DATA_NOT_CONNECTED");
      expect(JSON.stringify(r)).not.toContain(process.env.SANJAE_LABOR_OFFICE_DIR);
    } finally {
      if (prev === undefined) delete process.env.SANJAE_LABOR_OFFICE_DIR;
      else process.env.SANJAE_LABOR_OFFICE_DIR = prev;
    }
  });

  it("관할표 전 구역(일반·건설): 금지어 없음, 절대 경로 없음, 직함 뒤 이름 모양 없음", () => {
    // 원본 scripts/audit.py 3절과 같은 검사
    const NAME = /(?:주무관|감독관|담당자|사무관|팀장|과장)\s*[:：]?\s*[가-힣]{2,3}(?=[\s,)/]|$)/g;
    const PARTICLE = /(과장|팀장)\s*[:：]?\s*(은|는|이|및|등|의)/;
    const seen = new Set<string>();
    for (const [sido, m] of Object.entries(data.jurisdiction.jurisdiction)) {
      for (const sgg of Object.keys(m)) {
        for (const construction of [false, true]) {
          const r = lookupLaborOffice(ROOT, sgg === "*" ? `${sido} 1` : `${sido} ${sgg} 1`, construction);
          expect(r.status, `${sido} ${sgg}`).not.toBe("NOT_FOUND");
          const s = JSON.stringify(r);
          for (const o of [r.office, ...(r.candidates ?? [])]) if (o) seen.add(o.office_id);
          expect(findOutcomeLanguage(s)).toEqual([]);
          expect(s).not.toContain(ROOT);
          expect((s.match(NAME) ?? []).filter((x) => !PARTICLE.test(x)), `${sido} ${sgg}`).toEqual([]);
        }
      }
    }
    expect(seen.size).toBe(49);
  });
});
