// 산업재해조사표(고용노동부 제출) — 지침·점검 도구, 관서 찾기 자리, 칸이 모자란 서술의 별지 쪽(PDF·한글).
// 값은 전부 합성값(홍길동 등)이다.
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { accidentReportGuide, ACCIDENT_REPORT_GUIDE, GUIDE_SECTIONS } from "../src/accident/guide.js";
import { checkAccidentReport, oneMonthAfter } from "../src/accident/check.js";
import { lookupLaborOffice } from "../src/accident/jurisdiction.js";
import { findOutcomeLanguage } from "../src/core/filter.js";
import { fillHwpx, hwpxText } from "../src/fill/hwpx.js";
import { fillForm } from "../src/fill/overlay.js";
import { loadAssets, loadHwpxAssets, loadMap } from "../src/fill/registry.js";

process.env.SANJAE_ROOT = process.cwd();
const ID = "F_INDUSTRIAL_ACCIDENT_REPORT";
const sample = JSON.parse(readFileSync(`test/samples/${ID}.json`, "utf8")) as Record<string, string | boolean>;
const slotKeys = Object.keys(loadMap(ID).slots);
const LONG = {
  accident_situation:
    "재해자 홍길동이 사출성형기 2호기의 안전문을 열고 금형 사이에 남은 제품 조각을 손으로 꺼내던 중, 점검 중임을 모르던 동료 근로자가 조작반의 자동 운전 스위치를 눌러 금형이 닫히면서 재해자의 왼손이 금형 사이에 끼었음. 안전문 연동장치는 한 달 전부터 고장 난 상태였음.",
  accident_cause:
    "인적 요인: 동료 근로자가 기계 주변 작업자 확인 없이 스위치를 조작함. 설비적 요인: 안전문 연동장치 고장을 방치함. 작업ㆍ환경적 요인: 금형 점검 시 전원 차단·잠금 절차가 없었음. 관리적 요인: 점검 작업 표준과 교육이 없었음.",
};

describe("산업재해조사표 지침", () => {
  it("절마다 돌려주고, 전부·각 절에 금지어가 없다", () => {
    expect(findOutcomeLanguage(JSON.stringify(ACCIDENT_REPORT_GUIDE))).toEqual([]);
    for (const s of GUIDE_SECTIONS) {
      const g = accidentReportGuide(s);
      expect(g[s], s).toBeDefined();
      expect(g.form_id).toBe(ID);
    }
  });

  it("칸별 작성법의 칸 이름은 전부 서식 지도에 있다", () => {
    const known = new Set(slotKeys);
    for (const f of ACCIDENT_REPORT_GUIDE.fields) for (const k of f.keys) expect(known.has(k), k).toBe(true);
  });

  it("샘플 사업장 주소의 관서 찾기는 서울지방고용노동청(괄호 값 「서울」 = 샘플 labor_office)이고 노동포털 대체 안내도 붙는다", () => {
    const r = lookupLaborOffice(process.cwd(), String(sample.workplace_address));
    expect(r.status).toBe("CONFIRMED");
    expect(r.office?.office_name).toBe("서울지방고용노동청");
    expect(r.office?.labor_office_value).toBe(sample.labor_office);
    expect(r.fallback.portal_url).toContain("AH038");
  });
});

describe("산업재해조사표 점검", () => {
  it("합성 샘플은 error 0", () => {
    const r = checkAccidentReport(sample, { today: "2026-10-26", slotKeys });
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.deadline).toMatchObject({ accident_date: "2026-10-15", reference_deadline: "2026-11-15", days_left: 20 });
  });

  it("요일 불일치·고용형태 둘·외국인 체류자격 빈칸·24시 범위·모르는 칸을 잡는다", () => {
    const r = checkAccidentReport(
      { ...sample, accident_weekday: "금", employment_daily: true, nationality_korean: false, nationality_foreign: true, nationality: "베트남", visa_status: "", accident_hour: "25", bogus: "x" },
      { today: "2026-10-26", slotKeys },
    );
    const keys = r.issues.filter((i) => i.level === "error").flatMap((i) => i.keys);
    expect(keys).toEqual(expect.arrayContaining(["accident_weekday", "employment_regular", "employment_daily", "visa_status", "accident_hour"]));
    expect(r.issues.some((i) => i.keys.includes("bogus"))).toBe(true);
  });

  it("휴업 3일 미만은 warn, 사망은 중대재해 즉시 보고 안내(info), 기한이 지나면 warn", () => {
    const short = checkAccidentReport({ ...sample, lost_days: "2" }, { today: "2026-10-26" });
    expect(short.issues.some((i) => i.level === "warn" && i.keys.includes("lost_days"))).toBe(true);
    const death = checkAccidentReport({ ...sample, lost_days: "", death: true }, { today: "2026-10-26" });
    expect(death.issues.some((i) => i.level === "info" && i.keys.includes("death") && /즉시/.test(i.message))).toBe(true);
    const late = checkAccidentReport(sample, { today: "2026-12-01" });
    expect(late.deadline?.days_left).toBeLessThan(0);
    expect(late.issues.some((i) => /기한 참고일/.test(i.message))).toBe(true);
  });

  it("원인 칸 4요인·재발방지 기한·담당 단서", () => {
    const r = checkAccidentReport({ ...sample, accident_cause: "부주의", prevention_plan: "안전교육 강화" }, { today: "2026-10-26" });
    const msgs = r.issues.filter((i) => i.keys.includes("accident_cause") || i.keys.includes("prevention_plan")).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/관리적 요인/);
    expect(msgs).toMatch(/부주의/);
    expect(msgs).toMatch(/기한/);
    expect(msgs).toMatch(/담당/);
    const ok = checkAccidentReport({ ...sample, ...LONG }, { today: "2026-10-26" });
    expect(ok.issues.some((i) => i.keys.includes("accident_cause"))).toBe(false);
  });

  it("1개월 참고일: 그달에 같은 날이 없으면 말일(민법 제160조제3항)", () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(oneMonthAfter(d("2026-10-15")).toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(oneMonthAfter(d("2026-01-31")).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(oneMonthAfter(d("2028-01-30")).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(oneMonthAfter(d("2026-12-20")).toISOString().slice(0, 10)).toBe("2027-01-20");
  });

  it("출력에 금지어가 없다", () => {
    const r = checkAccidentReport({ ...sample, death: true, lost_days: "1" }, { today: "2027-01-01" });
    expect(findOutcomeLanguage(JSON.stringify(r))).toEqual([]);
  });
});

describe("산업재해조사표 별지 쪽", () => {
  it("PDF: 칸이 모자란 서술은 칸에 「(별지에 적음)」, 덧붙은 3쪽에 전문", async () => {
    const { map, pdf, font } = loadAssets(ID);
    const { bytes, report } = await fillForm(pdf, map, { fontBytes: font, values: { ...sample, ...LONG } });
    expect(report.annexed).toEqual(["accident_situation", "accident_cause"]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    const short = await fillForm(pdf, map, { fontBytes: font, values: sample });
    expect(short.report.annexed).toBeUndefined();
    expect((await PDFDocument.load(short.bytes)).getPageCount()).toBe(2);
  });

  it("한글: 같은 서술이 문서 끝 별지에 들어가고 칸에는 「(별지에 적음)」, 체크 표시(■)는 늘지 않는다", async () => {
    const { map, hwpx } = loadHwpxAssets(ID);
    const { bytes, report } = await fillHwpx(hwpx, map, { values: { ...sample, ...LONG } });
    expect(report.annexed).toEqual(["accident_situation", "accident_cause"]);
    const text = hwpxText(bytes);
    expect(text).toContain("(별지에 적음)");
    expect(text.indexOf(LONG.accident_cause)).toBeGreaterThan(text.indexOf("별지 — "));
    const short = await fillHwpx(hwpx, map, { values: sample });
    expect(short.report.annexed).toBeUndefined();
    expect(text.split("■").length).toBe(hwpxText(short.bytes).split("■").length);
    const sec = strFromU8(unzipSync(bytes)["Contents/section0.xml"]!);
    expect(sec).toMatch(/<hp:p id="0" [^>]*pageBreak="1"/);
  });

  it("도장 기본 자리는 사업주(applicant) 하나 — 근로자대표 자리는 따로 지정해야 찍힌다", async () => {
    const { buildStamps } = await import("../src/stamp/resolve.js");
    const { map, font } = loadAssets(ID);
    const s = buildStamps({ name: "이대표" }, undefined, Object.keys(map.stamps ?? {}), () => font);
    expect(Object.keys(s ?? {})).toEqual(["applicant"]);
  });
});
