// 형제 산출물 대조 — src/core/catalog.ts(FORMS) ↔ forms/catalog.json(공단 정본 대장).
// 한쪽만 고치면 조용히 벌어진다(261026 실측: 코드는 블로그 파일명 2024.7.15, 대장은 공단 2026.7.7).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMS } from "../src/core/catalog.js";

interface Catalog {
  forms: { ids: string[]; article_no: string; files: { file: string; sha256: string }[] }[];
}

const cat = JSON.parse(readFileSync("forms/catalog.json", "utf8")) as Catalog;

describe("FORMS ↔ forms/catalog.json", () => {
  for (const def of Object.values(FORMS)) {
    it(`${def.id} 는 게시글 ${def.article} 에 있고 file 이 그 게시글 파일명과 같다`, () => {
      const entry = cat.forms.find((f) => f.article_no === def.article);
      expect(entry, `catalog.json 에 게시글 ${def.article} 없음`).toBeDefined();
      expect(entry!.ids, `${def.id} 가 게시글 ${def.article} 의 ids 에 없음`).toContain(def.id);
      expect(entry!.files.map((f) => f.file), `${def.id}.file`).toContain(def.file);
      const sha = entry!.files.find((f) => f.file === def.file)!.sha256;
      expect(sha).toMatch(/^[0-9a-f]{64}$/);
    });
  }

  it("대장의 서식 id 는 전부 FORMS 에 있다(병원 제출 진료계획서 제외)", () => {
    const known = new Set(Object.keys(FORMS));
    for (const f of cat.forms) for (const id of f.ids) if (id.startsWith("F_")) expect(known.has(id), id).toBe(true);
  });
});
