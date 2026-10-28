// 사용자 입력(명령줄 인자·웹 확인표) → ClaimInput, 그리고 그 반대(ClaimInput → check 인자).
// CLI 와 안내 페이지가 같은 함수를 써서 「같은 확인을 명령줄로」 한 줄이 같은 결과를 낸다.
import { ACCIDENT_KINDS, CLAIM_TYPES, TAGS, type ClaimInput, type ClaimType, type Tag, type Tri } from "./types.js";

export interface RawCheckInput {
  claim: string | undefined;
  accident?: string | undefined;
  thirdParty?: string | undefined;
  ended?: string | undefined;
  tags?: readonly string[] | undefined;
  have?: readonly string[] | undefined;
}

/** yes/no 말고는 전부 「아직 모름」 — 모르는 것을 지어내지 않는다 */
export function parseTri(v: string | undefined): Tri {
  if (v === undefined) return "UNDECLARED";
  if (/^(y|yes|true|1)$/i.test(v)) return true;
  if (/^(n|no|false|0)$/i.test(v)) return false;
  return "UNDECLARED";
}

/** 급여 종류가 틀리면 멈춘다. 재해 유형이 틀리면 「아직 모름」, 모르는 태그는 버린다(CLI 0.5.x 동작 그대로) */
export function normalizeInput(raw: RawCheckInput): ClaimInput {
  if (!raw.claim || !(CLAIM_TYPES as readonly string[]).includes(raw.claim)) {
    throw new Error(`급여 종류를 주십시오: ${CLAIM_TYPES.join(" | ")}`);
  }
  const accident = raw.accident;
  const input: ClaimInput = {
    claim: raw.claim as ClaimType,
    accidentKind: accident && (ACCIDENT_KINDS as readonly string[]).includes(accident) ? (accident as ClaimInput["accidentKind"]) : "UNDECLARED",
    thirdParty: parseTri(raw.thirdParty),
    treatmentEnded: parseTri(raw.ended),
  };
  const have = (raw.have ?? []).map((s) => s.trim()).filter(Boolean);
  if (have.length) input.have = have;
  const tags = (raw.tags ?? []).map((s) => s.trim()).filter((t): t is Tag => (TAGS as readonly string[]).includes(t));
  if (tags.length) input.tags = tags;
  return input;
}

/** ClaimInput → `sanjae-apply check` 뒤에 붙일 인자. normalizeInput(parse(toCheckArgs(i))) 는 i 로 돌아온다(test/input.test.ts) */
export function toCheckArgs(i: ClaimInput): string[] {
  const yn = (v: Tri) => (v ? "yes" : "no");
  const a: string[] = [i.claim];
  if (i.accidentKind !== "UNDECLARED") a.push("--accident", i.accidentKind);
  if (i.thirdParty !== "UNDECLARED") a.push("--third-party", yn(i.thirdParty));
  if (i.treatmentEnded !== "UNDECLARED") a.push("--ended", yn(i.treatmentEnded));
  if (i.tags?.length) a.push("--tags", i.tags.join(","));
  if (i.have?.length) a.push("--have", i.have.join(","));
  return a;
}
