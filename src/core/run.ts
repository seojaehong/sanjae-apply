// 패키지 조립. 순수 함수 — 입력을 저장하지 않고, 승인 가능성을 계산하지 않는다.

import { evalYoyang } from "../rules/s01_yoyang.js";
import { assertNoOutcomeLanguage } from "./filter.js";
import type { ClaimInput, Package, PackageStatus } from "./types.js";

export function buildPackage(input: ClaimInput): Package {
  if (input.claim !== "YOYANG") {
    throw new Error(`아직 규칙이 없는 급여 종류: ${input.claim} (M1 에서 S-04~S-13 추가)`);
  }
  const r = evalYoyang(input);
  const unresolved = r.attachments.some((a) => a.status !== "PROVIDED") || r.open_confirmations.length > 0;
  const status: PackageStatus = unresolved ? "INCOMPLETE" : "READY_TO_SUBMIT";
  const pkg: Package = {
    claim: input.claim,
    status,
    forms: r.forms,
    attachments: r.attachments,
    open_confirmations: r.open_confirmations,
    rules_applied: r.rules,
  };
  assertNoOutcomeLanguage(pkg);
  return pkg;
}
