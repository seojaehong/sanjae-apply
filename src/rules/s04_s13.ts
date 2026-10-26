// S-04~S-13 — 유족·본인부담·휴업·간병료이송비보조기·미지급·장해·소음성난청·추가상병·재요양.
// 출처 = 산재창고 블로그(2025.1.14 기준) 실무 메모. 근거 조문은 catalog.ts REF(fixture 대조 시험 있음).
// 절차 안내는 notes 로만 낸다. 승인 가능성은 어디에도 쓰지 않는다.

import type { ClaimInput } from "../core/types.js";
import { Acc, type RuleResult } from "./common.js";

export function evalYujok(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-04").form("F_YUJOK_CLAIM", "REQUIRED").attach("A_DEATH_CERT");
  a.note("요양급여 신청 조사 중 사망하면 공단은 요양급여 신청을 반려하고 유족급여 청구를 하도록 합니다. 이때는 이 청구서로 다시 청구합니다.");
  a.note("청구서 접수에는 사망진단서·시체검안서면 되고, 쟁점은 업무와 사망의 인과관계 자료입니다.");
  return a.r;
}

export function evalSelfPay(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-05").form("F_SELF_PAY_CLAIM", "REQUIRED");
  if (input.treatmentEnded === true) {
    // 치료 종결 뒤 최초 신청 — 요양급여 신청서를 대신하므로 요양비에 체크, 뒷면 경위, 소견서.
    a.attach("A_ACCIDENT_NARRATIVE").attach("A_MEDICAL_OPINION");
    a.note("치료가 끝난 뒤 처음 산재를 신청하는 경우입니다. 「요양비」에 체크하고 뒷면 재해 발생 경위를 쓰며, 아래 소견서를 의사·병원에서 받습니다.");
  } else if (input.treatmentEnded === false) {
    // 승인 뒤 본인이 낸 병원비·약제비 환급, 또는 비급여가 요양급여 범위인지 확인.
    a.attach("A_RECEIPTS");
    a.note("승인 뒤 본인이 낸 병원비·약제비를 돌려받을 때는 진료비 영수증·세부내역서·약제비 영수증을 첨부합니다. 비급여가 요양급여 범위인지 확인하려면 「본인부담금 확인」에 체크합니다.");
  } else {
    a.attach("A_RECEIPTS").ask("treatmentEnded", "이미 치료가 끝난 뒤 처음 신청하는 것입니까, 아니면 승인 뒤 낸 비용을 돌려받는 것입니까?", ["F_SELF_PAY_CLAIM"]);
  }
  return a.r;
}

export function evalHuyeop(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-06").form("F_HUYEOP_CLAIM", "REQUIRED");
  a.note("휴업급여는 요양으로 취업하지 못한 기간에 평균임금의 70%를 지급합니다. 2회차부터는 자동지급을 신청할 수 있습니다.");
  a.note("받는 것만큼 중요한 것은 평균임금이 맞게 산정됐는지입니다. 정보공개 청구로 평균임금 산정내역서와 자료를 받아 확인하고, 틀렸으면 평균임금 정정 및 차액 지급을 청구합니다.");
  return a.r;
}

export function evalCareTransportDevice(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-07").form("F_CARE_TRANSPORT_DEVICE_CLAIM", "REQUIRED");
  a.attach("A_CARE_OPINION").attach("A_CAREGIVER_CERT").attach("A_NURSING_RECORD").attach("A_TRANSPORT_RECEIPT");
  if (a.has("DEVICE")) a.form("F_DEVICE_PRESCRIPTION", "REQUIRED").attach("A_DEVICE_COST");
  else a.form("F_DEVICE_PRESCRIPTION", "CONDITIONAL", "보조기(재활보조기구)를 청구하는 경우");
  a.note("간병료는 청구서 뒷면 소견서를 반드시 의사·병원에서 받고, 간병인 자격증 사본과 간호기록지를 첨부합니다. 의사가 소견서를 거부하면 공단에 사정을 말하고 공단이 직접 받도록 요청할 수 있습니다.");
  a.note("이송비는 영수증이나 통원 확인서를 첨부합니다. 사설 구급차를 이용했으면 그 영수증을 반드시 확보하십시오.");
  return a.r;
}

export function evalUnpaid(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-08").form("F_UNPAID_CLAIM", "REQUIRED").attach("A_RECEIPTS").attach("A_CARE_OPINION").attach("A_NURSING_RECORD");
  a.note("병원 치료 중 사망해 유족급여가 승인된 뒤에는 그 기간의 치료비(요양비)·간병비·휴업급여 등을 미지급 보험급여로 청구합니다. 간병비는 간병 소견서와 간호기록지를 따로 냅니다.");
  return a.r;
}

export function evalJanghae(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-09").form("F_JANGHAE_CLAIM", "REQUIRED");
  const noise = a.has("NOISE_HEARING_LOSS");
  const limb = a.has("SPINE_OR_NERVE") || a.has("JOINT");

  if (noise) {
    // S-10 소음성 난청 — 치료 불가한 장해 상태로 보아 장해급여로 청구. 일반 진단서로 대체하되 「확진」이 적혀야 한다.
    a.rule("S-10").form("F_NOISE_WORK_CERT", "REQUIRED");
    a.attach("A_DISABILITY_DIAG", "일반 진단서 — 소음성 난청 중 감각신경성 난청의 「확진」이 기재되어야 함");
    a.note("소음성 난청은 추정 소견이나 의증으로는 반려가 원칙입니다. 진단서에 감각신경성 난청 「확진」이 적혀야 합니다.");
  } else {
    a.form("F_NOISE_WORK_CERT", "CONDITIONAL", "소음성 난청을 청구하는 경우").attach("A_DISABILITY_DIAG");
  }

  if (limb) a.form("F_LIMB_OPINION", "REQUIRED");
  else a.form("F_LIMB_OPINION", "CONDITIONAL", "척추·신경계통 장해 또는 관절 기능장해인 경우(별지 제12호 다·라)");

  a.note("장해진단서는 요양 종결 당시의 병원·의사에게 받는 것이 원칙입니다.");
  a.note("운동기능장해의 원인이 명확하면(강직·오그라듦·신경 손상 등) 근로자의 능동적 운동으로 측정한 소견을 받습니다. 원인이 명확하지 않을 때만 수동적 운동 측정입니다(시행규칙 제47조제3항).");
  return a.r;
}

export function evalAdditionalDisease(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-12").form("F_ADDITIONAL_DISEASE_APPLY", "REQUIRED").attach("A_ADDITIONAL_OPINION");
  a.note("승인 상병으로 새 상병이 생겼거나 같은 사고에서 추가 상병이 진단된 경우, 요양 중 의료사고나 통원 중 사고도 추가상병으로 신청합니다. 병원에서 추가상병 소견서를 받습니다.");
  return a.r;
}

export function evalReYoyang(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-13").form("F_RE_YOYANG_APPLY", "REQUIRED").attach("A_RE_YOYANG_OPINION").attach("A_PRIOR_RECORDS");
  a.note("재요양은 이미 산재로 승인된 상병이 재발하거나 요양 종결 때보다 악화되어 적극적 치료가 필요하다는 의학적 소견이 있을 때 신청합니다. 실무상 악화는 인접 부위 상병까지 포함합니다.");
  a.note("과거 승인 당시의 의무기록지·영상이 있으면 현재 기록과 비교할 수 있으므로 함께 제출하는 것이 좋습니다. 주치의에게 재요양 소견서를 요청하십시오.");
  return a.r;
}
