// 코어 타입. 코어는 순수하다: IO 없음, 값 저장 없음, 승인 가능성 계산 없음.
// 상태어 정의 = ~/dev/_산재서식_상용화_G0_261026.md §8 「G2 상태어」.

export const CLAIM_TYPES = [
  "YOYANG", // 요양급여
  "HUYEOP", // 휴업급여·상병보상연금
  "CARE_TRANSPORT_DEVICE", // 간병료·이송비·보조기
  "JANGHAE", // 장해급여
  "YUJOK", // 유족급여·장례비
  "UNPAID", // 미지급 보험급여
  "ADDITIONAL_DISEASE", // 추가상병
  "RE_YOYANG", // 재요양
  "SELF_PAY", // 본인부담 치료비(요양비·본인부담금 확인)
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const ACCIDENT_KINDS = ["WORK_ACCIDENT", "COMMUTE", "DISEASE"] as const;
export type AccidentKind = (typeof ACCIDENT_KINDS)[number];

/** 서식 분기를 가르는 상병·청구 성격 태그. 사용자가 말한 것만 넣는다. */
export const TAGS = [
  "NOISE_HEARING_LOSS", // 소음성 난청(장해급여로 청구)
  "SPINE_OR_NERVE", // 척추·신경계통 장해
  "JOINT", // 관절 기능장해
  "DEVICE", // 보조기(재활보조기구) 청구
] as const;
export type Tag = (typeof TAGS)[number];

/** 입력에서 아직 말하지 않은 값. NOT_APPLICABLE 로 읽지 않고 open_confirmations 로 보낸다. */
export type Undeclared = "UNDECLARED";
export type Tri = boolean | Undeclared;

export interface ClaimInput {
  claim: ClaimType;
  accidentKind: AccidentKind | Undeclared;
  /** 제3자(가해자) 행위에 의한 재해인가 */
  thirdParty: Tri;
  /** 해당 상병의 치료가 이미 끝났는가 */
  treatmentEnded: Tri;
  tags?: Tag[];
  /** 사용자가 이미 준비했다고 말한 첨부·서식 id 목록 */
  have?: string[];
}

export type FormStatus = "REQUIRED" | "CONDITIONAL" | "NOT_APPLICABLE";
export type AttachmentStatus = "PROVIDED" | "MISSING" | "SUBSTITUTABLE";

/** READY_TO_SUBMIT 은 「제출 가능한 패키지」라는 뜻이지 「승인된다」는 뜻이 아니다. */
export type PackageStatus = "INCOMPLETE" | "READY_TO_SUBMIT";

export interface LawRef {
  /** 예: "산업재해보상보험법 제41조제1항" */
  cite: string;
  /** 법제처 조문제목 그대로. test/refs.test.ts 가 fixture 와 대조한다 */
  title: string;
  /** 법제처 lawService 식별 — MST(법령일련번호)와 JO(조문 코드 6자리) */
  mst: string;
  jo: string;
}

export interface FormItem {
  /** 서식 카탈로그 id. 예: "F_YOYANG_APPLY" */
  id: string;
  /** 예: "요양급여 신청서(별지 제2호서식)" */
  title: string;
  status: FormStatus;
  /** CONDITIONAL 일 때 조건 설명 */
  condition?: string;
  basis: LawRef[];
}

export interface AttachmentItem {
  id: string;
  title: string;
  status: AttachmentStatus;
  /** SUBSTITUTABLE 일 때 무엇으로 대체되는가 */
  substitute?: string;
  basis: LawRef[];
}

export interface OpenConfirmation {
  field: keyof ClaimInput;
  question: string;
  /** 답에 따라 달라지는 서식 id */
  affects: string[];
}

export interface Package {
  claim: ClaimType;
  status: PackageStatus;
  forms: FormItem[];
  attachments: AttachmentItem[];
  open_confirmations: OpenConfirmation[];
  /** 절차 안내(실무 메모). 상태가 아니고 판단도 아니다 */
  notes: string[];
  /** 규칙 id 목록. 예: ["S-01","S-02"] */
  rules_applied: string[];
}
