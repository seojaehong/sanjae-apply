// 서식·첨부 카탈로그. 정본 파일(공단 서식자료실)의 해시·버전은 forms/catalog.json 에서 따로 관리한다.
// basis 의 MST·JO 는 법제처 lawService 식별자. 실측 261026: 법 283459 · 시행령 287491 · 시행규칙 283239.
// title 은 법제처 조문제목 그대로 — test/refs.test.ts 가 fixtures/laws 와 대조한다.

import type { LawRef } from "./types.js";

export const ACT = "283459"; // 산업재해보상보험법 (시행 2026-07-01)
export const RULE = "283239"; // 산업재해보상보험법 시행규칙 (시행 2026-02-02)

const act = (jo: string, title: string, cite: string): LawRef => ({ cite: `산업재해보상보험법 ${cite}`, title, mst: ACT, jo });
const rule = (jo: string, title: string, cite: string): LawRef => ({ cite: `산업재해보상보험법 시행규칙 ${cite}`, title, mst: RULE, jo });

export const REF = {
  ACT_36: act("003600", "보험급여의 종류와 산정 기준 등", "제36조(평균임금 산정)"),
  ACT_37_1_3: act("003700", "업무상의 재해의 인정 기준", "제37조제1항제3호(출퇴근 재해)"),
  ACT_40: act("004000", "요양급여", "제40조(요양급여의 범위 — 간병·이송·재활보조기구)"),
  ACT_41_1: act("004100", "요양급여의 신청", "제41조제1항"),
  ACT_41_2: act("004100", "요양급여의 신청", "제41조제2항(의료기관 대행)"),
  ACT_49: act("004900", "추가상병 요양급여의 신청", "제49조"),
  ACT_51: act("005100", "재요양", "제51조"),
  ACT_52: act("005200", "휴업급여", "제52조"),
  ACT_57: act("005700", "장해급여", "제57조"),
  ACT_61: act("006100", "간병급여", "제61조"),
  ACT_62: act("006200", "유족급여", "제62조"),
  ACT_71: act("007100", "장례비", "제71조"),
  ACT_81: act("008100", "미지급의 보험급여", "제81조"),
  ACT_87: act("008700", "제3자에 대한 구상권", "제87조(제3자에 대한 구상권)"),
  RULE_14: rule("001400", "간병료의 청구 방법", "제14조"),
  RULE_20: rule("002000", "요양급여의 신청 등", "제20조"),
  RULE_31: rule("003100", "재요양의 신청 절차 등", "제31조"),
  RULE_47: rule("004700", "운동기능장해의 측정", "제47조제3항(능동·수동 측정)"),
} satisfies Record<string, LawRef>;

export interface FormDef {
  id: string;
  title: string;
  /** 공단 서식자료실 파일명(블로그 261026 기준). 정본 해시는 forms/catalog.json */
  file: string;
  basis: LawRef[];
}

const F = (id: string, title: string, file: string, basis: LawRef[]): FormDef => ({ id, title, file, basis });

export const FORMS = {
  F_YOYANG_APPLY: F("F_YOYANG_APPLY", "요양급여 신청서(별지 제2호서식)", "[별지_제2,3호서식]요양급여신청서_및_소견서(2024.7.15.개정).hwp", [REF.ACT_41_1, REF.RULE_20]),
  F_YOYANG_OPINION: F("F_YOYANG_OPINION", "요양급여 신청 소견서(별지 제3호서식) — 산재보험 의료기관 의사 작성", "[별지_제2,3호서식]요양급여신청서_및_소견서(2024.7.15.개정).hwp", [REF.ACT_41_1]),
  F_COMMUTE_REPORT: F("F_COMMUTE_REPORT", "출퇴근재해 발생신고서", "출퇴근재해발생신고서.hwp", [REF.ACT_37_1_3]),
  F_THIRD_PARTY_REPORT: F("F_THIRD_PARTY_REPORT", "제3자의 행위에 따른 재해발생 신고서 및 확인서", "(출퇴근재해)제3자의 행위에 따른 재해발생 신고서 및 확인서.hwp", [REF.ACT_87]),
  F_YUJOK_CLAIM: F("F_YUJOK_CLAIM", "유족급여·진폐유족연금·장례비 청구서(별지 제15호서식)", "[별지_제15호_서식]_유족급여_진폐유족연금_장례비_청구서(20230705_개정).hwp", [REF.ACT_62, REF.ACT_71]),
  F_SELF_PAY_CLAIM: F("F_SELF_PAY_CLAIM", "본인부담 치료비 청구서(요양비·본인부담금 확인)", "본인부담치료비_청구서(요양비,_본인부담금확인).hwp", [REF.ACT_40, REF.ACT_41_1]),
  F_HUYEOP_CLAIM: F("F_HUYEOP_CLAIM", "휴업급여 및 상병보상연금 청구서(별지 제7호서식)", "[별지_제7호_서식]_휴업급여_및_상병보상연금_청구서(20230705_개정).hwp", [REF.ACT_52]),
  F_CARE_TRANSPORT_DEVICE_CLAIM: F("F_CARE_TRANSPORT_DEVICE_CLAIM", "간병료·이송비·보조기 청구서(뒷면 소견서 포함)", "간병료이송비보조기_청구서.hwp", [REF.ACT_40, REF.RULE_14]),
  F_DEVICE_PRESCRIPTION: F("F_DEVICE_PRESCRIPTION", "산재보험 재활보조기구 처방전 및 검수확인서", "산재보험_재활보조기구_처방전_및_검수확인서.hwp", [REF.ACT_40]),
  F_UNPAID_CLAIM: F("F_UNPAID_CLAIM", "미지급 보험급여 청구서(별지 제29호서식)", "[별지_제29호_서식]_미지급_보험급여_청구서(20230705_개정).hwp", [REF.ACT_81]),
  F_JANGHAE_CLAIM: F("F_JANGHAE_CLAIM", "장해급여 청구서 + 장해진단서(별지 제11호·제12호서식)", "[별지_제11호_제12호_서식]_장해급여(합병증등_예방관리)_청구(신청)서_소음작업종사사실_확인서_장해진단서_소견서_일시금연금_선택확인서(20230705_).hwp", [REF.ACT_57]),
  F_LIMB_OPINION: F("F_LIMB_OPINION", "지체장애용 소견서(척추·사지마비 / 관절 기능장해, 별지 제12호 다·라)", "(별지 제12호 서식 안)", [REF.ACT_57, REF.RULE_47]),
  F_NOISE_WORK_CERT: F("F_NOISE_WORK_CERT", "소음작업 종사 사실확인서(별지 제11호 뒷면)", "(별지 제11호 서식 안)", [REF.ACT_57]),
  F_ADDITIONAL_DISEASE_APPLY: F("F_ADDITIONAL_DISEASE_APPLY", "추가상병 신청서 및 소견서(별지 제30호·제31호서식)", "[별지_제30,31호서식]_추가상병_신청서_및_소견서.hwp", [REF.ACT_49]),
  F_RE_YOYANG_APPLY: F("F_RE_YOYANG_APPLY", "재요양 신청서 및 소견서(별지 제33호·제33호의2서식)", "[별지_제33호,제33의2서식]_재요양_신청서_및_소견서.hwp", [REF.ACT_51, REF.RULE_31]),
} satisfies Record<string, FormDef>;
export type FormId = keyof typeof FORMS;

export interface AttachmentDef {
  id: string;
  title: string;
  basis: LawRef[];
  /** 발급 거부·비지정 의료기관 등일 때의 대체물 */
  substitute?: string;
}

const A = (id: string, title: string, basis: LawRef[], substitute?: string): AttachmentDef =>
  substitute ? { id, title, basis, substitute } : { id, title, basis };

export const ATTACHMENTS = {
  A_MEDICAL_OPINION: A("A_MEDICAL_OPINION", "의사 소견서(별지 제3호) — 발급 거부·비지정 의료기관이면 대체", [REF.ACT_41_1], "치료방법 및 기간이 기재된 소견서 또는 진단서"),
  A_MEDICAL_RECORDS: A("A_MEDICAL_RECORDS", "의무기록지 · MRI/X-ray 등 영상 CD(원무과 발급)", [REF.ACT_41_1]),
  A_COMMUTE_EVIDENCE: A("A_COMMUTE_EVIDENCE", "출퇴근 사고 증빙 — 119 구급활동일지 · 택시영수증 · 목격자 확인서 · 통화/문자 내역", [REF.ACT_37_1_3]),
  A_DEATH_CERT: A("A_DEATH_CERT", "사망진단서 또는 시체검안서", [REF.ACT_62]),
  A_ACCIDENT_NARRATIVE: A("A_ACCIDENT_NARRATIVE", "재해 발생 경위(청구서 뒷면, 별지 사용 가능)", [REF.ACT_41_1]),
  A_RECEIPTS: A("A_RECEIPTS", "진료비 영수증 · 진료비 세부내역서 · 약제비 영수증", [REF.ACT_40]),
  A_CARE_OPINION: A("A_CARE_OPINION", "간병 소견서(청구서 뒷면) — 의사가 거부하면 공단에 사정을 말하고 직접 받도록 요청", [REF.RULE_14], "공단이 의료기관에서 직접 소견을 받도록 요청"),
  A_CAREGIVER_CERT: A("A_CAREGIVER_CERT", "간병인 자격증 사본", [REF.RULE_14]),
  A_NURSING_RECORD: A("A_NURSING_RECORD", "간호기록지", [REF.RULE_14]),
  A_TRANSPORT_RECEIPT: A("A_TRANSPORT_RECEIPT", "이송비 영수증 또는 통원 확인서(사설 구급차 영수증 포함)", [REF.ACT_40]),
  A_DEVICE_COST: A("A_DEVICE_COST", "보조기 비용 증빙 — 세금계산서·거래명세서·영수증", [REF.ACT_40]),
  A_DISABILITY_DIAG: A("A_DISABILITY_DIAG", "장해진단서 — 요양 종결 당시 병원·의사", [REF.ACT_57]),
  A_ADDITIONAL_OPINION: A("A_ADDITIONAL_OPINION", "추가상병 소견서(별지 제31호) — 병원 발급", [REF.ACT_49]),
  A_RE_YOYANG_OPINION: A("A_RE_YOYANG_OPINION", "재요양 소견서(별지 제33호의2) — 주치의", [REF.ACT_51, REF.RULE_31]),
  A_PRIOR_RECORDS: A("A_PRIOR_RECORDS", "과거 승인 당시 의무기록지·영상(악화 비교용, 권장)", [REF.ACT_51]),
} satisfies Record<string, AttachmentDef>;
export type AttachmentId = keyof typeof ATTACHMENTS;
