// CLI 4명령 — 빌드된 dist/src/cli.js 를 자식 프로세스로 실행한다(npm run build 선행).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
    expect(out.written).toBe(30);
    expect(readFileSync(outPdf).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("fill: 지도 없는 서식은 오류로 끝난다", () => {
    expect(() => run("fill", "F_NOPE", "test/samples/F_YOYANG_APPLY.json", "--out", "x.pdf")).toThrow();
  });

  it("--help 가 채울 수 있는 서식을 보여준다", () => {
    expect(run("--help")).toContain("F_YOYANG_APPLY");
  });
});
