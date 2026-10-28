// 입력 정규화 — CLI 와 안내 페이지가 같은 함수를 쓴다. 페이지의 「같은 확인을 명령줄로」 한 줄이 같은 입력으로 돌아와야 한다.
import { describe, expect, it } from "vitest";
import { parseCheck } from "../src/cli.js";
import { REF } from "../src/core/catalog.js";
import { normalizeInput, toCheckArgs } from "../src/core/input.js";
import { ACCIDENT_KINDS, CLAIM_TYPES, TAGS, type ClaimInput, type Tri } from "../src/core/types.js";
import { lawUrl } from "../web/law.js";

const tris: Tri[] = [true, false, "UNDECLARED"];
const subsets = <T>(xs: readonly T[]): T[][] => xs.reduce<T[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);

describe("toCheckArgs ↔ parseCheck", () => {
  it("전 조합(급여 × 재해 × 제3자 × 치료종결 × 태그 16 × 첨부)에서 원래 입력으로 돌아온다", () => {
    let n = 0;
    for (const claim of CLAIM_TYPES)
      for (const accidentKind of [...ACCIDENT_KINDS, "UNDECLARED" as const])
        for (const thirdParty of tris)
          for (const treatmentEnded of tris)
            for (const tags of subsets(TAGS))
              for (const have of [[], ["A_DIAGNOSIS", "A_BANK"]]) {
                const i: ClaimInput = { claim, accidentKind, thirdParty, treatmentEnded };
                if (tags.length) i.tags = tags;
                if (have.length) i.have = have;
                expect(parseCheck(toCheckArgs(i)).input).toEqual(i);
                n++;
              }
    expect(n).toBe(CLAIM_TYPES.length * 4 * 9 * 16 * 2);
  });

  it("틀린 급여 종류는 멈추고, 틀린 재해 유형·태그는 버린다(0.5.x 동작)", () => {
    expect(() => normalizeInput({ claim: "NOPE" })).toThrow(/급여 종류/);
    expect(normalizeInput({ claim: "YOYANG", accident: "X", thirdParty: "maybe", tags: ["X", " JOINT "], have: [" a ", ""] })).toEqual({
      claim: "YOYANG",
      accidentKind: "UNDECLARED",
      thirdParty: "UNDECLARED",
      treatmentEnded: "UNDECLARED",
      tags: ["JOINT"],
      have: ["a"],
    });
  });
});

describe("근거 조문 링크", () => {
  it("REF 전건이 법령정보센터 조문 주소로 바뀐다(홈으로 빠지는 것 0건)", () => {
    for (const r of Object.values(REF)) expect(lawUrl(r.cite), r.cite).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/.+\/.+/);
  });
});
