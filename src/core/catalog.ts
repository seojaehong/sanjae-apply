// 서식·첨부 카탈로그. 정본 파일(공단 서식자료실)의 해시·버전은 forms/catalog.json 에서 따로 관리한다.
// basis 의 MST·JO 는 법제처 lawService 식별자. 실측 261026: 법 283459 · 시행령 287491 · 시행규칙 283239.

import type { LawRef } from "./types.js";

export const ACT = "283459"; // 산업재해보상보험법 (시행 2026-07-01)
export const RULE = "283239"; // 산업재해보상보험법 시행규칙 (시행 2026-02-02)

export const REF = {
  ACT_41_1: { cite: "산업재해보상보험법 제41조제1항", mst: ACT, jo: "004100" },
  ACT_41_2: { cite: "산업재해보상보험법 제41조제2항", mst: ACT, jo: "004100" },
  RULE_20: { cite: "산업재해보상보험법 시행규칙 제20조", mst: RULE, jo: "002000" },
  ACT_37_1_3: { cite: "산업재해보상보험법 제37조제1항제3호(출퇴근 재해)", mst: ACT, jo: "003700" },
  ACT_87: { cite: "산업재해보상보험법 제87조(제3자에 대한 구상권)", mst: ACT, jo: "008700" },
} satisfies Record<string, LawRef>;

export interface FormDef {
  id: string;
  title: string;
  /** 공단 서식자료실 파일명(블로그 261026 기준). 정본 해시는 forms/catalog.json */
  file: string;
  basis: LawRef[];
}

export const FORMS: Record<string, FormDef> = {
  F_YOYANG_APPLY: {
    id: "F_YOYANG_APPLY",
    title: "요양급여 신청서(별지 제2호서식)",
    file: "[별지_제2,3호서식]요양급여신청서_및_소견서(2024.7.15.개정).hwp",
    basis: [REF.ACT_41_1, REF.RULE_20],
  },
  F_YOYANG_OPINION: {
    id: "F_YOYANG_OPINION",
    title: "요양급여 신청 소견서(별지 제3호서식) — 산재보험 의료기관 의사 작성",
    file: "[별지_제2,3호서식]요양급여신청서_및_소견서(2024.7.15.개정).hwp",
    basis: [REF.ACT_41_1],
  },
  F_COMMUTE_REPORT: {
    id: "F_COMMUTE_REPORT",
    title: "출퇴근재해 발생신고서",
    file: "출퇴근재해발생신고서.hwp",
    basis: [REF.ACT_37_1_3],
  },
  F_THIRD_PARTY_REPORT: {
    id: "F_THIRD_PARTY_REPORT",
    title: "제3자의 행위에 따른 재해발생 신고서 및 확인서",
    file: "(출퇴근재해)제3자의 행위에 따른 재해발생 신고서 및 확인서.hwp",
    basis: [REF.ACT_87],
  },
};

export interface AttachmentDef {
  id: string;
  title: string;
  basis: LawRef[];
  /** 의사가 발급을 거부하거나 비지정 의료기관일 때의 대체물 */
  substitute?: string;
}

export const ATTACHMENTS: Record<string, AttachmentDef> = {
  A_MEDICAL_OPINION: {
    id: "A_MEDICAL_OPINION",
    title: "의사 소견서(별지 제3호) — 발급 거부·비지정 의료기관이면 대체",
    basis: [REF.ACT_41_1],
    substitute: "치료방법 및 기간이 기재된 소견서 또는 진단서",
  },
  A_MEDICAL_RECORDS: {
    id: "A_MEDICAL_RECORDS",
    title: "의무기록지 · MRI/X-ray 등 영상 CD(원무과 발급)",
    basis: [REF.ACT_41_1],
  },
  A_COMMUTE_EVIDENCE: {
    id: "A_COMMUTE_EVIDENCE",
    title: "출퇴근 사고 증빙 — 119 구급활동일지 · 택시영수증 · 목격자 확인서 · 통화/문자 내역",
    basis: [REF.ACT_37_1_3],
  },
};
