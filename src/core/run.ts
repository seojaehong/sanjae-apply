// 패키지 조립. 순수 함수 — 입력을 저장하지 않고, 승인 가능성을 계산하지 않는다.

import { evalYoyang } from "../rules/s01_yoyang.js";
import {
  evalAdditionalDisease,
  evalCareTransportDevice,
  evalHuyeop,
  evalJanghae,
  evalReYoyang,
  evalSelfPay,
  evalUnpaid,
  evalYujok,
} from "../rules/s04_s13.js";
import type { RuleResult } from "../rules/common.js";
import { assertNoOutcomeLanguage } from "./filter.js";
import type { ClaimInput, ClaimType, Package, PackageStatus } from "./types.js";

const EVALUATORS: Record<ClaimType, (input: ClaimInput) => RuleResult> = {
  YOYANG: evalYoyang,
  HUYEOP: evalHuyeop,
  CARE_TRANSPORT_DEVICE: evalCareTransportDevice,
  JANGHAE: evalJanghae,
  YUJOK: evalYujok,
  UNPAID: evalUnpaid,
  ADDITIONAL_DISEASE: evalAdditionalDisease,
  RE_YOYANG: evalReYoyang,
  SELF_PAY: evalSelfPay,
};

export function buildPackage(input: ClaimInput): Package {
  const r = EVALUATORS[input.claim](input);
  const unresolved = r.attachments.some((a) => a.status !== "PROVIDED") || r.open_confirmations.length > 0;
  const status: PackageStatus = unresolved ? "INCOMPLETE" : "READY_TO_SUBMIT";
  const pkg: Package = {
    claim: input.claim,
    status,
    forms: r.forms,
    attachments: r.attachments,
    open_confirmations: r.open_confirmations,
    notes: r.notes,
    rules_applied: r.rules,
  };
  assertNoOutcomeLanguage(pkg);
  return pkg;
}
