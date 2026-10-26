// 근거 조문 대조 — catalog.REF 전건에 법제처 fixture 가 있고 조문제목이 맞아야 한다.
// 사람이 눈으로 본 것은 근거가 아니다. 이 시험이 지킨다.
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACT, REF, RULE } from "../src/core/catalog.js";

function fixturePath(mst: string, jo: string): string {
  const pre = mst === ACT ? "act" : mst === RULE ? "rule" : "unknown";
  return `fixtures/laws/${pre}_${mst}_jo${jo}.xml`;
}

function articleTitle(xml: string): string {
  const x = xml.replace(/<!\[CDATA\[|\]\]>/g, "");
  return x.match(/<조문제목>([\s\S]*?)<\/조문제목>/)?.[1]?.trim() ?? "";
}

describe("REF ↔ 법제처 fixture", () => {
  for (const [key, ref] of Object.entries(REF)) {
    it(`${key} ${ref.cite} — fixture 가 있고 조문제목 「${ref.title}」 이 맞는다`, () => {
      const p = fixturePath(ref.mst, ref.jo);
      expect(existsSync(p), `fixture 없음: ${p}`).toBe(true);
      const xml = readFileSync(p, "utf8");
      expect(articleTitle(xml)).toBe(ref.title);
      expect(xml).not.toContain("OC=");
    });
  }
});
