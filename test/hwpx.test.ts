// 한글(hwpx) 채우기 — forms/hwpx_maps 에 지도가 있는 서식 전부: ①동봉 hwpx 해시 = 지도 source_sha256 ②칸 이름 집합 = PDF 지도와 동일
// ③합성 값(test/samples)으로 채우면 글자가 들어가고 체크 수가 맞고 ④mimetype 이 zip 첫 항목·무압축 ⑤값 run 은 검정 정체.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { fillHwpx, hwpxText, STAMP_LABEL, type HwpxMap } from "../src/fill/hwpx.js";
import { fillableHwpxForms, hwpxPath, loadHwpxAssets, loadMap } from "../src/fill/registry.js";
import { makeSeal } from "../src/stamp/seal.js";

process.env.SANJAE_ROOT = process.cwd(); // src/ 에서 import 하면 세 단계 위가 레포 밖이다
const forms = fillableHwpxForms();

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
    it(`${id}: 도장 자리 키가 PDF 지도와 같고 앵커 라벨이 실제로 있다`, () => {
      const pdfSpots = Object.keys(loadMap(id).stamps ?? {}).sort();
      expect(Object.keys(spots).sort()).toEqual(pdfSpots);
      const sec = strFromU8(unzipSync(hwpx)["Contents/section0.xml"]!);
      const n = sec.split(STAMP_LABEL).length - 1;
      for (const [k, s] of Object.entries(spots)) {
        expect(s.anchor, `${k}.anchor < 라벨 ${n}`).toBeLessThan(n);
        expect(s.size, `${k}.size`).toBeGreaterThan(0);
      }
    });
  }
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
