// S-01 요양급여 기본 서식 · S-02 출퇴근재해 발생신고서 · S-03 제3자행위 신고서+확인서.
// 출처 = 산재창고 블로그(2025.1.14 기준) 실무 메모. 조문 근거는 catalog.ts REF 와 fixtures/laws.

import { ATTACHMENTS, FORMS } from "../core/catalog.js";
import type { AttachmentItem, ClaimInput, FormItem, OpenConfirmation } from "../core/types.js";

export interface RuleResult {
  rules: string[];
  forms: FormItem[];
  attachments: AttachmentItem[];
  open_confirmations: OpenConfirmation[];
}

function form(id: keyof typeof FORMS, status: FormItem["status"], condition?: string): FormItem {
  const d = FORMS[id]!;
  const item: FormItem = { id: d.id, title: d.title, status, basis: d.basis };
  if (condition) item.condition = condition;
  return item;
}

function attachment(id: keyof typeof ATTACHMENTS, have: Set<string>): AttachmentItem {
  const d = ATTACHMENTS[id]!;
  const provided = have.has(d.id);
  const status: AttachmentItem["status"] = provided ? "PROVIDED" : d.substitute ? "SUBSTITUTABLE" : "MISSING";
  const item: AttachmentItem = { id: d.id, title: d.title, status, basis: d.basis };
  if (!provided && d.substitute) item.substitute = d.substitute;
  return item;
}

export function evalYoyang(input: ClaimInput): RuleResult {
  const have = new Set(input.have ?? []);
  const rules = ["S-01"];
  const forms: FormItem[] = [form("F_YOYANG_APPLY", "REQUIRED"), form("F_YOYANG_OPINION", "REQUIRED")];
  const attachments: AttachmentItem[] = [attachment("A_MEDICAL_OPINION", have), attachment("A_MEDICAL_RECORDS", have)];
  const open: OpenConfirmation[] = [];

  // S-02 출퇴근재해 — 통상의 경로·방법(일탈·중단 없음), 자택 현관문을 나온 뒤부터.
  if (input.accidentKind === "COMMUTE") {
    rules.push("S-02");
    forms.push(form("F_COMMUTE_REPORT", "REQUIRED"));
    attachments.push(attachment("A_COMMUTE_EVIDENCE", have));
  } else if (input.accidentKind === "UNDECLARED") {
    forms.push(form("F_COMMUTE_REPORT", "CONDITIONAL", "출퇴근 중 재해이면 필요"));
    open.push({ field: "accidentKind", question: "업무상 사고·출퇴근 재해·업무상 질병 중 어느 것입니까?", affects: ["F_COMMUTE_REPORT"] });
  } else {
    forms.push(form("F_COMMUTE_REPORT", "NOT_APPLICABLE"));
  }

  // S-03 제3자(가해자) 행위 — 신고서+확인서를 추가.
  if (input.thirdParty === true) {
    rules.push("S-03");
    forms.push(form("F_THIRD_PARTY_REPORT", "REQUIRED"));
  } else if (input.thirdParty === "UNDECLARED") {
    forms.push(form("F_THIRD_PARTY_REPORT", "CONDITIONAL", "가해자(제3자)가 있으면 필요"));
    open.push({ field: "thirdParty", question: "재해에 가해자(제3자)가 있습니까?", affects: ["F_THIRD_PARTY_REPORT"] });
  } else {
    forms.push(form("F_THIRD_PARTY_REPORT", "NOT_APPLICABLE"));
  }

  return { rules, forms, attachments, open_confirmations: open };
}
