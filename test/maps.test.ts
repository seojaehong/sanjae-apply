// 모든 좌표 지도(forms/maps/*.json)의 공통 시험.
// 지도마다 ① source_sha256 이 forms/bundled/<id>.pdf 와 같다 ② 칸이 쪽 안에 있다 ③ test/samples/<id>.json 합성 값으로 채워진다(건너뜀 0은 아님 — 체크 반대편은 건너뛴다).
// 픽셀 검사(글리프가 실제로 그려졌는가)는 scripts/verify_fill.py 가 한다 — 이 시험은 그것을 대체하지 않는다.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fillForm, type FormMap } from "../src/fill/overlay.js";

const FONT = "fonts/NanumGothic-Regular.ttf";
const maps = readdirSync("forms/maps").filter((f) => f.endsWith(".json"));

describe("forms/maps 공통", () => {
  it("지도가 하나 이상 있다", () => expect(maps.length).toBeGreaterThan(0));

  for (const file of maps) {
    const map = JSON.parse(readFileSync(join("forms/maps", file), "utf8")) as FormMap;
    const pdfPath = `forms/bundled/${map.form_id}.pdf`;
    const samplePath = `test/samples/${map.form_id}.json`;

    describe(map.form_id, () => {
      it("동봉 PDF 가 있고 sha256 이 지도와 같다", () => {
        expect(existsSync(pdfPath), pdfPath).toBe(true);
        expect(createHash("sha256").update(readFileSync(pdfPath)).digest("hex")).toBe(map.source_sha256);
      });

      it("모든 칸에 label(서식 원문 글자)이 있다 — AI 클라이언트가 칸을 고르는 유일한 단서(0.5.3 Desktop 이 35칸 중 24칸만 쓴 원인)", () => {
        for (const [k, s] of Object.entries(map.slots)) expect((s.label ?? "").trim().length, `${k}.label`).toBeGreaterThan(1);
      });
      it("모든 칸이 쪽 안에 있고 page 가 1 이상이다", () => {
        for (const [k, s] of Object.entries(map.slots)) {
          expect(s.page, k).toBeGreaterThanOrEqual(1);
          const xs = s.kind === "boxes" ? s.boxes.flatMap((b) => [b.x0, b.x1]) : s.kind === "multiline" ? [s.x0, s.x1] : [s.x];
          const ys = s.kind === "boxes" ? s.boxes.flatMap((b) => [b.y0, b.y1]) : s.kind === "multiline" ? [s.y0, s.y1] : [s.y];
          for (const x of xs) expect(x, `${k}.x`).toBeGreaterThan(0), expect(x, `${k}.x`).toBeLessThan(map.page_size.width);
          for (const y of ys) expect(y, `${k}.y`).toBeGreaterThan(0), expect(y, `${k}.y`).toBeLessThan(map.page_size.height);
        }
      });

      it("도장 자리(stamps)가 쪽 안에 있고 지름이 양수다 — 의료기관 작성 서식(처방전)만 자리 없음", async () => {
        const stamps = map.stamps ?? {};
        if (map.form_id === "F_DEVICE_PRESCRIPTION") {
          expect(Object.keys(stamps)).toEqual([]);
          return;
        }
        expect(Object.keys(stamps), "applicant 자리").toContain("applicant");
        const pages = (await PDFDocument.load(readFileSync(pdfPath))).getPageCount();
        for (const [k, s] of Object.entries(stamps)) {
          expect(s.page, `${k}.page`).toBeGreaterThanOrEqual(1);
          expect(s.page, `${k}.page ≤ 쪽수`).toBeLessThanOrEqual(pages);
          expect(s.x, `${k}.x`).toBeGreaterThan(0), expect(s.x, `${k}.x`).toBeLessThan(map.page_size.width);
          expect(s.y, `${k}.y`).toBeGreaterThan(0), expect(s.y, `${k}.y`).toBeLessThan(map.page_size.height);
          expect(s.size, `${k}.size`).toBeGreaterThan(0);
        }
      });

      it("합성 값 파일이 있고, 값이 있는 칸은 전부 써지며 축소 0", async () => {
        expect(existsSync(samplePath), samplePath).toBe(true);
        const values = JSON.parse(readFileSync(samplePath, "utf8")) as Record<string, string | boolean>;
        const unknown = Object.keys(values).filter((k) => !(k in map.slots));
        expect(unknown, "지도에 없는 키").toEqual([]);
        const { bytes, report } = await fillForm(new Uint8Array(readFileSync(pdfPath)), map, { fontBytes: new Uint8Array(readFileSync(FONT)), values });
        const expected = Object.keys(values).filter((k) => values[k] !== "" && values[k] !== false).sort();
        expect(report.written.sort()).toEqual(expected);
        expect(report.shrunk).toEqual([]);
        const outDir = join(tmpdir(), "sanjae-apply");
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${map.form_id}_sample.pdf`), bytes);
      });
    });
  }
});
