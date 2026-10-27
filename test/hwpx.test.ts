// 한글(hwpx) 채우기 — forms/hwpx_maps 에 지도가 있는 서식 전부: ①동봉 hwpx 해시 = 지도 source_sha256 ②칸 이름 집합 = PDF 지도와 동일
// ③합성 값(test/samples)으로 채우면 글자가 들어가고 체크 수가 맞고 ④mimetype 이 zip 첫 항목·무압축 ⑤값 run 은 검정 정체.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { countStampLabels, fillHwpx, hwpxText, STAMP_LABEL, type HwpxMap } from "../src/fill/hwpx.js";
import { fillableHwpxForms, hwpxPath, loadHwpxAssets, loadMap } from "../src/fill/registry.js";
import { makeSeal } from "../src/stamp/seal.js";

process.env.SANJAE_ROOT = process.cwd(); // src/ 에서 import 하면 세 단계 위가 레포 밖이다
const forms = fillableHwpxForms();
/** 한글 쪽 나눔이 동봉 PDF 와 달라 도장 쪽이 PDF 지도와 다른 자리 — 한글 COM 렌더 실측(261027, scripts/verify_hwpx_stamps.py) */
const HWPX_PAGE: Record<string, number> = { "F_JANGHAE_CLAIM.choice_confirmer": 8 };

describe("hwpx 지도", () => {
  it("한글로 채울 수 있는 서식이 있다", () => {
    expect(forms.length).toBeGreaterThan(0);
  });

  for (const id of forms) {
    describe(id, () => {
      const { map, hwpx } = loadHwpxAssets(id);
      const samplePath = `test/samples/${id}.json`;

      it("동봉 hwpx 해시가 지도와 같다", () => {
        expect(createHash("sha256").update(hwpx).digest("hex")).toBe(map.source_sha256);
      });

      it("칸 이름 집합이 PDF 지도와 같다", () => {
        const pdfSlots = Object.keys(loadMap(id).slots).sort();
        expect(Object.keys(map.slots).sort()).toEqual(pdfSlots);
      });

      it("그룹 op 의 템플릿이 있고 템플릿이 그 칸들을 참조한다", () => {
        for (const [name, op] of Object.entries(map.slots)) {
          if (op.kind !== "group") continue;
          const tpl = map.templates?.[op.template];
          expect(tpl, `${name} → templates.${op.template}`).toBeDefined();
          expect(tpl!.text).toContain(`{${name}}`);
        }
      });

      it.skipIf(!existsSync(samplePath))("합성 값이 들어가고 체크 수가 맞고 검정 정체다", async () => {
        const values = JSON.parse(readFileSync(samplePath, "utf8")) as Record<string, string | boolean>;
        const { bytes, report } = await fillHwpx(hwpx, map, { values });
        expect(report.errors).toEqual([]);
        const text = hwpxText(bytes);
        const files = unzipSync(bytes);
        let checks = 0;
        for (const [k, v] of Object.entries(values)) {
          const op = map.slots[k];
          expect(op, `지도에 없는 칸 ${k}`).toBeDefined();
          if (op!.kind === "check") {
            if (v === true) checks++;
            continue;
          }
          if (v === "" || typeof v === "boolean" || op!.kind === "digits" || op!.kind === "cells" || op!.kind === "boxes") continue; // 상자 분산·괄호형 체크는 글자 대조 대상 아님
          for (const line of String(v).split("\n")) expect(text, `${k}=${line}`).toContain(line);
        }
        const marks = text.split("[V]").length - 1 + (text.split("■").length - 1) - (hwpxText(hwpx).split("■").length - 1);
        expect(marks).toBe(checks);
        // mimetype 첫 항목·무압축: fflate 가 만든 zip 의 local header 를 본다(첫 항목 이름, compression method 0)
        expect(Object.keys(files)[0]).toBe("mimetype");
        expect(bytes[0]).toBe(0x50);
        expect(bytes[8]! | (bytes[9]! << 8)).toBe(0); // compression method of first local header
        // 값 run 의 charPr 이 검정 정체
        const header = strFromU8(files["Contents/header.xml"]!);
        const section = strFromU8(files["Contents/section0.xml"]!);
        const textValues = Object.entries(values).filter(([k, v]) => typeof v === "string" && v.length >= 2 && !["digits", "cells", "boxes"].includes(map.slots[k]?.kind ?? ""));
        for (const [k, v] of textValues) {
          const first = String(v).split("\n")[0]!.slice(0, 10).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const m = new RegExp(`<hp:run charPrIDRef="(\\d+)"><hp:t>[^<&]*${first}`).exec(section);
          if (!m) continue; // after/template 은 라벨 run 에 붙으므로 여기 안 걸릴 수 있다
          const cp = new RegExp(`<hh:charPr id="${m[1]}"([^>]*)>(.*?)</hh:charPr>`, "s").exec(header);
          expect(cp, `${k} charPr ${m[1]}`).not.toBeNull();
          expect(/textColor="#000000"/i.test(cp![1]!), `${k} 글자색 ${cp![1]}`).toBe(true);
          expect(/<hh:italic\b/.test(cp![2]!), `${k} 기울임`).toBe(false);
        }
      });
    });
  }
});

describe("hwpx 도장", () => {
  const FONT = new Uint8Array(readFileSync("fonts/NanumGothic-Regular.ttf"));
  for (const id of forms) {
    const { map, hwpx } = loadHwpxAssets(id);
    const spots = map.stamps ?? {};
    it(`${id}: 도장 자리 키·쪽·좌표가 PDF 지도와 같고, 앵커는 쪽 순서와 단조이며 라벨이 실제로 있다`, () => {
      const pdfSpots = loadMap(id).stamps ?? {};
      expect(Object.keys(spots).sort()).toEqual(Object.keys(pdfSpots).sort());
      const sec = strFromU8(unzipSync(hwpx)["Contents/section0.xml"]!);
      const n = countStampLabels(sec);
      for (const [k, s] of Object.entries(spots)) {
        const p = pdfSpots[k]!;
        expect([s.x, s.y, s.size], `${k} 좌표 = PDF 지도`).toEqual([p.x, p.y, p.size]);
        // 쪽은 한글 렌더 기준이다. 한글 쪽 나눔이 PDF 와 같은 서식은 PDF 쪽과 같고, 다른 서식은 HWPX_PAGE 에 실측값을 적는다
        expect(s.page, `${k} 쪽(한글 렌더 실측)`).toBe(HWPX_PAGE[`${id}.${k}`] ?? p.page);
        expect(s.anchor, `${k}.anchor < 라벨 ${n}`).toBeLessThan(n);
      }
      // 같은 쪽 → 같은 anchor, 뒤 쪽 → 더 큰 anchor(한글은 앵커 문단의 쪽만 본다)
      const byPage = new Map<number, number>();
      for (const s of Object.values(spots)) {
        if (byPage.has(s.page!)) expect(byPage.get(s.page!)).toBe(s.anchor);
        byPage.set(s.page!, s.anchor);
      }
      const pages = [...byPage.keys()].sort((a, b) => a - b);
      for (let i = 1; i < pages.length; i++) expect(byPage.get(pages[i]!)!).toBeGreaterThan(byPage.get(pages[i - 1]!)!);
    });
  }
  it("모든 서식: 합성 값 + 자리 전부에 찍으면 hp:pic 이 자리 수만큼 생기고, 각 그림은 anchor 번째 라벨 문단 안에 있으며 vertOffset 이 지도 y 와 맞다", async () => {
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    for (const id of forms) {
      const { map, hwpx } = loadHwpxAssets(id);
      const spots = map.stamps ?? {};
      if (!Object.keys(spots).length) continue;
      const values = JSON.parse(readFileSync(`test/samples/${id}.json`, "utf8")) as Record<string, string | boolean>;
      const { bytes, report } = await fillHwpx(hwpx, map, { values, stamps: Object.fromEntries(Object.keys(spots).map((k) => [k, png])) });
      expect(report.stamped, id).toEqual(Object.keys(spots));
      const sec = strFromU8(unzipSync(bytes)["Contents/section0.xml"]!);
      // 서식 원본에도 그림이 있다(휴업급여 5개). 도장 그림만 센다
      const pics = [...sec.matchAll(/<hp:pic [^>]*>[\s\S]*?<\/hp:pic>/g)].filter((m) => m[0].includes('binaryItemIDRef="seal'));
      expect(pics.length, `${id} 도장 hp:pic 수`).toBe(Object.keys(spots).length);
      for (const [k, s] of Object.entries(spots)) {
        const want = Math.round(s.y * 100) - Math.floor(Math.round(s.size * 100) / 2);
        const pic = pics.find((m) => m[0].includes(`vertOffset="${want}"`));
        expect(pic, `${id}.${k} vertOffset ${want}`).toBeDefined();
        // 그림 앞까지의 라벨 수 = anchor (그림은 라벨 문단 첫 run 앞에 들어가므로 그 문단의 라벨은 뒤에 있다)
        expect(countStampLabels(sec.slice(0, pic!.index)), `${id}.${k} 앵커 문단`).toBe(s.anchor);
        const paraStart = sec.lastIndexOf("<hp:p ", pic!.index);
        const paraEnd = sec.indexOf("</hp:p>", pic!.index! + pic![0].length);
        expect(sec.slice(paraStart, paraEnd).includes(STAMP_LABEL), `${id}.${k} 같은 문단에 라벨`).toBe(true);
      }
    }
  });
  it("값에 앵커 라벨 문자열이 들어오면 멈춘다(다른 쪽에 찍히지 않는다)", async () => {
    const { map, hwpx } = loadHwpxAssets("F_YOYANG_APPLY");
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    await expect(fillHwpx(hwpx, map, { values: { name: "홍길동 (서명 또는 인)" }, stamps: { consent: png } })).rejects.toThrow(/라벨.*수가 채우기로 바뀌었다/);
  });
  it("타원·비정사각 PNG 는 비율대로 들어간다(정사각 강제 없음)", async () => {
    const { map, hwpx } = loadHwpxAssets("F_YOYANG_APPLY");
    const png = makeSeal({ shape: "ellipse", arcText: "가나다 주식회사", centerText: "직인", fontBytes: FONT });
    const { bytes } = await fillHwpx(hwpx, map, { values: {}, stamps: { applicant: png } });
    const sec = strFromU8(unzipSync(bytes)["Contents/section0.xml"]!);
    const pic = [...sec.matchAll(/<hp:pic [^>]*>[\s\S]*?<\/hp:pic>/g)].find((m) => m[0].includes('binaryItemIDRef="seal1"'))![0];
    const sz = /<hp:sz width="(\d+)" widthRelTo="ABSOLUTE" height="(\d+)"/.exec(pic)!;
    expect(Number(sz[2]) / Number(sz[1])).toBeCloseTo(Math.round(480 * 0.72) / 480, 2);
    expect(pic).toContain(`<hp:imgDim dimwidth="${480 * 75}" dimheight="${Math.round(480 * 0.72) * 75}"/>`);
  });
  it("요양급여: 자리 3곳에 찍으면 BinData 1장·매니페스트 항목 1·hp:pic 3, 없는 자리는 건너뛴다", async () => {
    const { map, hwpx } = loadHwpxAssets("F_YOYANG_APPLY");
    const png = makeSeal({ name: "홍길동", fontBytes: FONT });
    const { bytes, report } = await fillHwpx(hwpx, map, { values: { name: "홍길동" }, stamps: { applicant: png, delegation: png, consent: png, nowhere: png } });
    expect(report.stamped).toEqual(["applicant", "delegation", "consent"]);
    expect(report.stamps_skipped).toEqual(["nowhere"]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)[0]).toBe("mimetype");
    expect(files["BinData/seal1.png"]).toEqual(png);
    const hpf = strFromU8(files["Contents/content.hpf"]!);
    expect(hpf.match(/<opf:item id="seal1"/g)?.length).toBe(1);
    expect(hpf).toContain('href="BinData/seal1.png" media-type="image/png" isEmbeded="1"');
    const sec = strFromU8(files["Contents/section0.xml"]!);
    expect(sec.match(/<hp:pic /g)?.length).toBe(3);
    expect(sec.match(/binaryItemIDRef="seal1"/g)?.length).toBe(3);
    // 떠 있는 개체(글 앞) — 글자를 밀지 않는다
    expect(sec.match(/treatAsChar="0"[^>]*vertRelTo="PAPER" horzRelTo="PAPER"/g)?.length).toBe(3);
    // 도장 없이 채운 것과 글자가 같다
    const plain = await fillHwpx(hwpx, map, { values: { name: "홍길동" } });
    expect(hwpxText(bytes)).toBe(hwpxText(plain.bytes));
  });
});

describe("hwpx 엔진", () => {
  it("없는 칸·틀린 주소는 오류로 멈춘다(조용히 지나가지 않는다)", async () => {
    const id = forms[0]!;
    const hwpx = new Uint8Array(readFileSync(hwpxPath(id)));
    const bad: HwpxMap = { form_id: id, source_file: "", source_sha256: "", slots: { x: { kind: "cell", t: 0, r: 999, c: 0 } } };
    await expect(fillHwpx(hwpx, bad, { values: { x: "값" } })).rejects.toThrow(/칸 없음/);
  });
});
