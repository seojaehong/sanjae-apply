// 도장: ①PNG 생성(서명·IHDR 크기·알파가 있는 투명 PNG) ②PNG 통과 ③PDF 날인(지도에 자리가 있으면 찍고 없으면 건너뜀)
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fillForm, type FormMap } from "../src/fill/overlay.js";
import { makeSeal } from "../src/stamp/seal.js";
import { buildStamps, resolveStamp, stampSpots } from "../src/stamp/resolve.js";

const FONT = new Uint8Array(readFileSync("fonts/NanumGothic-Regular.ttf"));
const PDF = "forms/bundled/F_YOYANG_APPLY.pdf";
const MAP = "forms/maps/F_YOYANG_APPLY.json";

function pngSize(png: Uint8Array): { w: number; h: number; colorType: number } {
  expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(png.buffer, png.byteOffset);
  return { w: dv.getUint32(16), h: dv.getUint32(20), colorType: png[25]! };
}

/** PNG 를 풀어 원 안(중심 반지름 30%)에 불투명 픽셀이 몇 개인지 — 글자가 실제로 그려졌는가 */
function innerOpaque(png: Uint8Array): number {
  const { w, h } = pngSize(png);
  const dv = new DataView(png.buffer, png.byteOffset);
  let pos = 8;
  const idat: Uint8Array[] = [];
  while (pos < png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    if (type === "IDAT") idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c))));
  let n = 0;
  const r = Math.min(w, h) * 0.3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((x - w / 2) ** 2 + (y - h / 2) ** 2 > r * r) continue;
      if (raw[y * (w * 4 + 1) + 1 + x * 4 + 3]! > 128) n++;
    }
  return n;
}

/** 바깥 테두리 타원(seal.ts 의 box: 여백 W*0.085, 타원은 세로 여백에 ratio 를 곱한다) 밖에 있는 불투명 픽셀 수 — 글자가 테두리를 넘었는가 */
function outsideOpaque(png: Uint8Array, ratio = 1): number {
  const { w, h } = pngSize(png);
  const dv = new DataView(png.buffer, png.byteOffset);
  let pos = 8;
  const idat: Uint8Array[] = [];
  while (pos < png.length) {
    const len = dv.getUint32(pos);
    if (String.fromCharCode(...png.subarray(pos + 4, pos + 8)) === "IDAT") idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c))));
  const m = w * 0.085;
  const rx = w / 2 - m;
  const ry = h / 2 - m * ratio;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (raw[y * (w * 4 + 1) + 1 + x * 4 + 3]! > 128 && ((x - w / 2) / rx) ** 2 + ((y - h / 2) / ry) ** 2 > 1.03) n++;
  return n;
}

describe("도장 생성", () => {
  it("글자가 바깥 테두리를 넘지 않는다(원형·타원 성명인·법인형) — 타원 성명인은 v0.5.2 까지 세로로 쌓아 위아래로 튀어나왔다", () => {
    for (const name of ["홍길동", "남궁민수", "이"]) {
      expect(outsideOpaque(makeSeal({ name, fontBytes: FONT })), `원형 ${name}`).toBe(0);
      const e = makeSeal({ name, shape: "ellipse", fontBytes: FONT });
      expect(outsideOpaque(e, 0.72), `타원 ${name}`).toBe(0);
      expect(innerOpaque(e), `타원 ${name} 글자가 그려졌다`).toBeGreaterThan(800);
    }
    expect(outsideOpaque(makeSeal({ shape: "ellipse", arcText: "노무법인 위너스", centerText: "직인", fontBytes: FONT }), 0.72)).toBe(0);
  });
  it("성명인 원형 480px 투명 RGBA, 원 안에 글자가 실제로 그려진다", () => {
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    expect(pngSize(png)).toEqual({ w: 480, h: 480, colorType: 6 });
    expect(png.length).toBeGreaterThan(2000);
    expect(innerOpaque(png)).toBeGreaterThan(3000);
  });
  it("글꼴에 없는 글자(한자)·공백만·NFD 분해 한글은 빈 도장이 아니라 오류 또는 정상 글자다", () => {
    expect(() => makeSeal({ name: "洪吉童", fontBytes: FONT })).toThrow(/없는 글자.*洪/);
    expect(() => resolveStamp({ name: "   " }, FONT)).toThrow();
    expect(() => resolveStamp({ arcText: "㈜가나다", centerText: "印", fontBytes: FONT } as never, FONT)).toThrow(/없는 글자/);
    const nfd = resolveStamp({ name: "홍길동".normalize("NFD") }, FONT);
    expect(innerOpaque(nfd)).toBe(innerOpaque(makeSeal({ name: "홍길동", fontBytes: FONT })));
  });
  it("PNG 통과 경로는 시그니처·IHDR 를 검사한다", () => {
    expect(() => resolveStamp({ png: new Uint8Array([1, 2, 3, 4, 5]) }, FONT)).toThrow(/PNG/);
    expect(() => resolveStamp({ png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0x20, 0, 0, 0, 0x20, 0, 8, 6, 0, 0, 0, 0, 0, 0, 0]) }, FONT)).toThrow(/크기/);
    expect(() => resolveStamp({ name: "홍길동", shape: "triangle" as never }, FONT)).toThrow(/모양/);
  });
  it("사각·타원·법인형도 만들어진다", () => {
    expect(pngSize(makeSeal({ name: "김대표", shape: "square", fontBytes: FONT })).w).toBe(480);
    expect(pngSize(makeSeal({ shape: "ellipse", arcText: "노무법인 위너스", centerText: "직인", fontBytes: FONT })).h).toBe(Math.round(480 * 0.72));
    expect(pngSize(makeSeal({ arcText: "가나다 주식회사", centerText: "대표자인", bottomText: "123-45-67890", innerRing: 2, fontBytes: FONT })).w).toBe(480);
  });
  it("이름·PNG 둘 다 없으면 오류", () => {
    expect(() => resolveStamp({}, FONT)).toThrow(/name/);
  });
  it("자리 키: 비우면 지도의 신청인 자리 전부, 쉼표로 고르면 그것만. 명시한 자리가 지도에 없거나 지도에 자리가 없으면 오류(조용히 건너뛰지 않는다)", () => {
    expect(stampSpots(["applicant", "delegation", "consent", "confirm"])).toEqual(["applicant", "delegation", "consent"]);
    expect(stampSpots(["applicant"])).toEqual(["applicant"]);
    expect(() => stampSpots([])).toThrow(/자리가 없다/);
    expect(stampSpots(["applicant", "consent"], "consent, applicant,consent")).toEqual(["consent", "applicant"]);
    expect(() => stampSpots(["applicant"], ["confirm"])).toThrow(/confirm.*지도에 없다/);
    expect(() => stampSpots(["applicant", "consent"], "aplicant")).toThrow(/aplicant/);
  });
  it("buildStamps: 지정 없으면 undefined 이고 글꼴을 읽지 않는다. PNG 를 주면 글꼴을 읽지 않는다", () => {
    let reads = 0;
    const load = () => (reads++, FONT);
    expect(buildStamps(undefined, undefined, ["applicant"], load)).toBeUndefined();
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    expect(Object.keys(buildStamps({ png }, undefined, ["applicant", "consent"], load)!)).toEqual(["applicant", "consent"]);
    expect(reads).toBe(0);
    expect(Object.keys(buildStamps({ name: "홍길동" }, "consent", ["applicant", "consent"], load)!)).toEqual(["consent"]);
    expect(reads).toBe(1);
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
