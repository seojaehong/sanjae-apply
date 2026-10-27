// 도장: ①PNG 생성(서명·IHDR 크기·알파가 있는 투명 PNG) ②PNG 통과 ③PDF 날인(지도에 자리가 있으면 찍고 없으면 건너뜀)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillForm, type FormMap } from "../src/fill/overlay.js";
import { makeSeal } from "../src/stamp/seal.js";
import { resolveStamp, stampSpots } from "../src/stamp/resolve.js";

const FONT = new Uint8Array(readFileSync("fonts/NanumGothic-Regular.ttf"));
const PDF = "forms/bundled/F_YOYANG_APPLY.pdf";
const MAP = "forms/maps/F_YOYANG_APPLY.json";

function pngSize(png: Uint8Array): { w: number; h: number; colorType: number } {
  expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(png.buffer, png.byteOffset);
  return { w: dv.getUint32(16), h: dv.getUint32(20), colorType: png[25]! };
}

describe("도장 생성", () => {
  it("성명인 원형 480px 투명 RGBA", () => {
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    expect(pngSize(png)).toEqual({ w: 480, h: 480, colorType: 6 });
    expect(png.length).toBeGreaterThan(2000);
  });
  it("사각·타원·법인형도 만들어진다", () => {
    expect(pngSize(makeSeal({ name: "김대표", shape: "square", fontBytes: FONT })).w).toBe(480);
    expect(pngSize(makeSeal({ shape: "ellipse", arcText: "노무법인 위너스", centerText: "직인", fontBytes: FONT })).h).toBe(Math.round(480 * 0.72));
    expect(pngSize(makeSeal({ arcText: "가나다 주식회사", centerText: "대표자인", bottomText: "123-45-67890", innerRing: 2, fontBytes: FONT })).w).toBe(480);
  });
  it("이름·PNG 둘 다 없으면 오류", () => {
    expect(() => resolveStamp({}, FONT)).toThrow(/name/);
  });
  it("자리 키: 비우면 지도의 신청인 자리 전부, 쉼표로 고르면 그것만, 지도에 없으면 applicant 하나(건너뜀 보고용)", () => {
    expect(stampSpots(["applicant", "delegation", "consent", "confirm"])).toEqual(["applicant", "delegation", "consent"]);
    expect(stampSpots(["applicant"])).toEqual(["applicant"]);
    expect(stampSpots([])).toEqual(["applicant"]);
    expect(stampSpots(["applicant", "consent"], "consent, applicant,consent")).toEqual(["consent", "applicant"]);
    expect(stampSpots(["applicant"], ["confirm"])).toEqual(["confirm"]);
  });
  it("PNG 를 주면 그대로 쓴다", () => {
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    expect(resolveStamp({ png }, FONT)).toBe(png);
  });
});

describe("PDF 날인", () => {
  it("지도에 자리가 있으면 찍고, 없으면 건너뛴다", async () => {
    const pdf = new Uint8Array(readFileSync(PDF));
    const map = JSON.parse(readFileSync(MAP, "utf8")) as FormMap;
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    // 동봉 지도 그대로: 요양급여신청서는 신청인 자리 3곳
    const spots = stampSpots(Object.keys(map.stamps ?? {}));
    expect(spots).toEqual(["applicant", "delegation", "consent"]);
    const a = await fillForm(pdf, map, { fontBytes: FONT, values: { name: "홍길동" }, stamps: Object.fromEntries(spots.map((k) => [k, png])) });
    expect(a.report.stamped).toEqual(["applicant", "delegation", "consent"]);
    expect(a.report.stamps_skipped).toEqual([]);
    expect(a.bytes.length).toBeGreaterThan(pdf.length);
    const noSpot: FormMap = { ...map, stamps: {} };
    const b = await fillForm(pdf, noSpot, { fontBytes: FONT, values: { name: "홍길동" }, stamps: { applicant: png } });
    expect(b.report.stamped).toEqual([]);
    expect(b.report.stamps_skipped).toEqual(["applicant"]);
  });
});
