// S-01 요양급여 기본 서식 · S-02 출퇴근재해 발생신고서 · S-03 제3자행위 신고서+확인서 · S-11 진료계획서 안내.
// 출처 = 산재창고 블로그(2025.1.14 기준) 실무 메모. 조문 근거는 catalog.ts REF 와 fixtures/laws.

import type { ClaimInput } from "../core/types.js";
import { Acc, type RuleResult } from "./common.js";

export function evalYoyang(input: ClaimInput): RuleResult {
  const a = new Acc(input);
  a.rule("S-01").form("F_YOYANG_APPLY", "REQUIRED").form("F_YOYANG_OPINION", "REQUIRED").attach("A_MEDICAL_OPINION").attach("A_MEDICAL_RECORDS");

  // S-02 출퇴근재해 — 통상의 경로·방법(일탈·중단 없음), 자택 현관문을 나온 뒤부터.
  if (input.accidentKind === "COMMUTE") {
    a.rule("S-02").form("F_COMMUTE_REPORT", "REQUIRED").attach("A_COMMUTE_EVIDENCE");
    a.note("출퇴근 재해는 통상의 경로와 방법이어야 하며 일탈·중단이 없어야 합니다. 주거지를 나온 시점은 자택 현관문을 나온 순간입니다(공동주택 공동현관이 아님).");
  } else if (input.accidentKind === "UNDECLARED") {
    a.form("F_COMMUTE_REPORT", "CONDITIONAL", "출퇴근 중 재해이면 필요").ask("accidentKind", "업무상 사고·출퇴근 재해·업무상 질병 중 어느 것입니까?", ["F_COMMUTE_REPORT"]);
  } else {
    a.form("F_COMMUTE_REPORT", "NOT_APPLICABLE");
  }

  // S-03 제3자(가해자) 행위 — 신고서+확인서를 추가.
  if (input.thirdParty === true) {
    a.rule("S-03").form("F_THIRD_PARTY_REPORT", "REQUIRED");
  } else if (input.thirdParty === "UNDECLARED") {
    a.form("F_THIRD_PARTY_REPORT", "CONDITIONAL", "가해자(제3자)가 있으면 필요").ask("thirdParty", "재해에 가해자(제3자)가 있습니까?", ["F_THIRD_PARTY_REPORT"]);
  } else {
    a.form("F_THIRD_PARTY_REPORT", "NOT_APPLICABLE");
  }

  // S-11 요양기간 연장 — 진료계획서는 산재보험 의료기관이 공단에 직접 보내지만, 재해자가 요청해야 움직인다.
  a.rule("S-11").note("요양기간 연장은 병원·의사가 진료계획서를 공단에 직접 제출합니다. 알아서 해 주지 않으므로 치료기간 연장이 필요하면 병원에 진료계획서 제출을 요청하십시오.");
  a.note("의사 소견서 발급이 거부되거나 비지정 의료기관(예: 정신건강의학과 의원)이면 「치료방법 및 기간이 기재된 소견서 또는 진단서」로 대체할 수 있습니다.");
  return a.r;
}
