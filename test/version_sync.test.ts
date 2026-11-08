import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERVER_INFO } from "../src/mcp/server.js";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("버전 표기", () => {
  const version = JSON.parse(read("package.json")).version;

  it("server.json 과 서버 응답이 package.json 과 같다", () => {
    const server = JSON.parse(read("server.json"));
    expect(server.version).toBe(version);
    expect(server.packages[0].version).toBe(version);
    expect(SERVER_INFO.version).toBe(version);
  });

  it("랜딩 페이지 표기가 package.json 과 같다", () => {
    const shown = [...read("public/index.html").matchAll(/data-version>([^<]+)</g)].map((m) => m[1]);
    expect(shown.length).toBeGreaterThan(0);
    expect(new Set(shown)).toEqual(new Set([version]));
  });
});
