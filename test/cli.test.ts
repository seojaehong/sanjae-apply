// CLI 4명령 — 빌드된 dist/src/cli.js 를 자식 프로세스로 실행한다(npm run build 선행).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = "dist/src/cli.js";
const run = (...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

describe.skipIf(!existsSync(CLI))("CLI", () => {
  it("check: 출퇴근·제3자 → 규칙 S-01~S-03", () => {
    const out = run("check", "YOYANG", "--accident", "COMMUTE", "--third-party", "yes", "--json");
    const pkg = JSON.parse(out);
    expect(pkg.rules_applied).toEqual(expect.arrayContaining(["S-01", "S-02", "S-03"]));
  });

  it("구버전 호출(첫 인자가 급여)도 check 로 본다", () => {
    expect(run("JANGHAE", "--tags", "NOISE_HEARING_LOSS")).toContain("S-10");
  });

  it("catalog: fillable 에 F_YOYANG_APPLY 가 있고 slots 가 나온다", () => {
    const out = JSON.parse(run("catalog", "F_YOYANG_APPLY"));
    expect(out.fillable).toContain("F_YOYANG_APPLY");
    expect(out.slots).toContain("narrative");
    expect(out.entries[0].revised).toBe("2026-07-07");
  });

  it("fill: 합성 값으로 PDF 파일을 만든다", () => {
    const outPdf = join(tmpdir(), "sanjae-apply", "cli_fill.pdf");
    const out = JSON.parse(run("fill", "F_YOYANG_APPLY", "test/samples/F_YOYANG_APPLY.json", "--out", outPdf));
    const sample = JSON.parse(readFileSync("test/samples/F_YOYANG_APPLY.json", "utf8")) as Record<string, unknown>;
    expect(out.written).toBe(Object.values(sample).filter((v) => v !== false && v !== "").length);
    expect(readFileSync(outPdf).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("seal: 도장 PNG 를 만들고, fill --stamp 는 신청인 자리 전부에 찍으며, 없는 자리·한자 이름·값 없는 --stamp 는 오류다", () => {
    const sealPng = join(tmpdir(), "sanjae-apply", "cli_seal.png");
    const s = JSON.parse(run("seal", "--out", sealPng, "--name", "홍길동"));
    expect([s.width, s.height]).toEqual([480, 480]);
    expect(readFileSync(sealPng).subarray(1, 4).toString()).toBe("PNG");
    const outPdf = join(tmpdir(), "sanjae-apply", "cli_fill_stamp.pdf");
    const a = JSON.parse(run("fill", "F_YOYANG_APPLY", "test/samples/F_YOYANG_APPLY.json", "--out", outPdf, "--stamp-png", sealPng));
    expect(a.stamped).toEqual(["applicant", "delegation", "consent"]);
    const outHwpx = join(tmpdir(), "sanjae-apply", "cli_fill_stamp.hwpx");
    const b = JSON.parse(run("fill", "F_YOYANG_APPLY", "test/samples/F_YOYANG_APPLY.json", "--out", outHwpx, "--stamp", "홍길동", "--stamp-spot", "consent"));
    expect(b.stamped).toEqual(["consent"]);
    expect(() => run("fill", "F_YOYANG_APPLY", "test/samples/F_YOYANG_APPLY.json", "--out", outPdf, "--stamp", "홍길동", "--stamp-spot", "aplicant")).toThrow(/aplicant/);
    expect(() => run("fill", "F_DEVICE_PRESCRIPTION", "test/samples/F_DEVICE_PRESCRIPTION.json", "--out", outPdf, "--stamp", "홍길동")).toThrow(/자리가 없다/);
    expect(() => run("seal", "--out", sealPng, "--name", "洪吉童")).toThrow(/없는 글자/);
    expect(() => run("fill", "F_YOYANG_APPLY", "test/samples/F_YOYANG_APPLY.json", "--out", outPdf, "--stamp", "--stamp-spot", "consent")).toThrow(/값이 없다/);
  });

  it("fill: 서식에 없는 칸 이름은 버리지 않고 unknown_keys 로 알린다(PDF·한글)", () => {
    const vals = join(tmpdir(), "sanjae-apply", "unknown_vals.json");
    writeFileSync(vals, JSON.stringify({ name: "홍길동", birth: "1990-01-01", nmae: "오타" }));
    const a = JSON.parse(run("fill", "F_YOYANG_APPLY", vals, "--out", join(tmpdir(), "sanjae-apply", "unknown.pdf")));
    expect(a.unknown_keys).toEqual(["birth", "nmae"]);
    const b = JSON.parse(run("fill", "F_YOYANG_APPLY", vals, "--out", join(tmpdir(), "sanjae-apply", "unknown.hwpx")));
    expect(b.unknown_keys).toEqual(["birth", "nmae"]);
    const ok = JSON.parse(run("fill", "F_YOYANG_APPLY", "test/samples/F_YOYANG_APPLY.json", "--out", join(tmpdir(), "sanjae-apply", "known.pdf")));
    expect(ok.unknown_keys).toEqual([]);
  });

  it("fill: 지도 없는 서식은 오류로 끝난다", () => {
    expect(() => run("fill", "F_NOPE", "test/samples/F_YOYANG_APPLY.json", "--out", "x.pdf")).toThrow();
  });

  it("--help 가 채울 수 있는 서식을 보여준다", () => {
    expect(run("--help")).toContain("F_YOYANG_APPLY");
  });
});
