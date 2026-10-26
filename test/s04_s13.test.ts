// S-04~S-13 — 블로그(산재창고 cpla1004, 2025.1.14 기준) 13행 중 나머지.
import { describe, expect, it } from "vitest";
import { buildPackage } from "../src/core/run.js";
import type { ClaimInput } from "../src/core/types.js";

const base = { accidentKind: "WORK_ACCIDENT", thirdParty: false, treatmentEnded: false } as const;
const req = (pkg: { forms: { id: string; status: string }[] }) => pkg.forms.filter((f) => f.status === "REQUIRED").map((f) => f.id).sort();
const cond = (pkg: { forms: { id: string; status: string }[] }) => pkg.forms.filter((f) => f.status === "CONDITIONAL").map((f) => f.id).sort();
const att = (pkg: { attachments: { id: string; status: string }[] }, s: string) => pkg.attachments.filter((a) => a.status === s).map((a) => a.id).sort();

describe("S-04 유족급여", () => {
  const pkg = buildPackage({ ...base, claim: "YUJOK" });
  it("유족급여·장례비 청구서(별지 15호)가 REQUIRED, 사망진단서/시체검안서가 MISSING", () => {
    expect(req(pkg)).toEqual(["F_YUJOK_CLAIM"]);
    expect(att(pkg, "MISSING")).toContain("A_DEATH_CERT");
    expect(pkg.rules_applied).toContain("S-04");
  });
  it("요양 조사 중 사망하면 요양 신청이 반려되고 유족급여로 간다는 안내가 notes 에 있다", () => {
    expect(pkg.notes.join("\n")).toMatch(/요양.*사망.*유족급여/);
  });
});

describe("S-05 본인부담 치료비", () => {
  it("치료 종결 후 최초 신청이면 요양비 체크·재해 경위·소견서(대체 가능)", () => {
    const pkg = buildPackage({ ...base, claim: "SELF_PAY", treatmentEnded: true });
    expect(req(pkg)).toEqual(["F_SELF_PAY_CLAIM"]);
    expect(att(pkg, "MISSING")).toContain("A_ACCIDENT_NARRATIVE");
    expect(att(pkg, "SUBSTITUTABLE")).toContain("A_MEDICAL_OPINION");
    expect(pkg.rules_applied).toContain("S-05");
  });
  it("승인 뒤 요양비 환급이면 영수증·세부내역서", () => {
    const pkg = buildPackage({ ...base, claim: "SELF_PAY", treatmentEnded: false });
    expect(att(pkg, "MISSING")).toContain("A_RECEIPTS");
  });
  it("치료 종결 여부가 UNDECLARED 면 질문이 열린다", () => {
    const pkg = buildPackage({ ...base, claim: "SELF_PAY", treatmentEnded: "UNDECLARED" });
    expect(pkg.open_confirmations.map((c) => c.field)).toEqual(["treatmentEnded"]);
  });
});

describe("S-06 휴업급여", () => {
  const pkg = buildPackage({ ...base, claim: "HUYEOP" });
  it("휴업급여·상병보상연금 청구서(별지 7호) REQUIRED, 평균임금 정정·차액 청구 안내", () => {
    expect(req(pkg)).toEqual(["F_HUYEOP_CLAIM"]);
    expect(pkg.notes.join("\n")).toMatch(/평균임금.*정정/);
    expect(pkg.notes.join("\n")).toMatch(/2회/);
    expect(pkg.rules_applied).toContain("S-06");
  });
});

describe("S-07 간병료·이송비·보조기", () => {
  const pkg = buildPackage({ ...base, claim: "CARE_TRANSPORT_DEVICE" });
  it("청구서 REQUIRED, 보조기 처방전·검수확인서는 CONDITIONAL, 간병 소견서·자격증·간호기록지·이송 영수증 첨부", () => {
    expect(req(pkg)).toEqual(["F_CARE_TRANSPORT_DEVICE_CLAIM"]);
    expect(cond(pkg)).toEqual(["F_DEVICE_PRESCRIPTION"]);
    expect(att(pkg, "MISSING")).toEqual(expect.arrayContaining(["A_CAREGIVER_CERT", "A_NURSING_RECORD", "A_TRANSPORT_RECEIPT"]));
    const op = pkg.attachments.find((a) => a.id === "A_CARE_OPINION");
    expect(op?.status).toBe("SUBSTITUTABLE");
    expect(op?.substitute).toMatch(/공단/);
    expect(pkg.rules_applied).toContain("S-07");
  });
  it("보조기 태그가 있으면 처방전·검수확인서가 REQUIRED 가 된다", () => {
    const p2 = buildPackage({ ...base, claim: "CARE_TRANSPORT_DEVICE", tags: ["DEVICE"] });
    expect(req(p2)).toContain("F_DEVICE_PRESCRIPTION");
  });
});

describe("S-08 미지급 보험급여", () => {
  const pkg = buildPackage({ ...base, claim: "UNPAID" });
  it("미지급 보험급여 청구서(별지 29호) REQUIRED, 간병비는 소견서·간호기록지 별도", () => {
    expect(req(pkg)).toEqual(["F_UNPAID_CLAIM"]);
    expect(att(pkg, "MISSING")).toContain("A_NURSING_RECORD");
    expect(pkg.rules_applied).toContain("S-08");
  });
});

describe("S-09 장해급여", () => {
  const pkg = buildPackage({ ...base, claim: "JANGHAE" });
  it("장해급여 청구서(별지 11·12호)·장해진단서 필수, 지체장애용 소견서는 CONDITIONAL", () => {
    expect(req(pkg)).toEqual(["F_JANGHAE_CLAIM"]);
    expect(cond(pkg)).toEqual(["F_LIMB_OPINION", "F_NOISE_WORK_CERT"]);
    expect(att(pkg, "MISSING")).toContain("A_DISABILITY_DIAG");
    expect(pkg.rules_applied).toContain("S-09");
  });
  it("운동기능장해 원인이 명확하면 능동 측정(시행규칙 §47③) 안내가 붙고 근거가 시행규칙 제47조다", () => {
    expect(pkg.notes.join("\n")).toMatch(/능동/);
    expect(JSON.stringify(pkg)).toContain("시행규칙 제47조");
  });
  it("척추·신경계 태그면 지체장애용 소견서가 REQUIRED", () => {
    const p2 = buildPackage({ ...base, claim: "JANGHAE", tags: ["SPINE_OR_NERVE"] });
    expect(req(p2)).toContain("F_LIMB_OPINION");
  });
});

describe("S-10 소음성 난청", () => {
  const pkg = buildPackage({ ...base, claim: "JANGHAE", tags: ["NOISE_HEARING_LOSS"] });
  it("장해급여 청구 + 소음작업 종사 사실확인서 REQUIRED, 장해진단서는 일반 진단서(확진 기재)로 대체 가능", () => {
    expect(req(pkg)).toEqual(expect.arrayContaining(["F_JANGHAE_CLAIM", "F_NOISE_WORK_CERT"]));
    const d = pkg.attachments.find((a) => a.id === "A_DISABILITY_DIAG");
    expect(d?.status).toBe("SUBSTITUTABLE");
    expect(d?.substitute).toMatch(/확진/);
    expect(pkg.notes.join("\n")).toMatch(/추정|의증/);
    expect(pkg.rules_applied).toContain("S-10");
  });
});

describe("S-11 진료계획서(요양기간 연장)", () => {
  const pkg = buildPackage({ ...base, claim: "YOYANG" });
  it("요양급여 패키지의 notes 에 진료계획서는 병원이 제출하되 재해자가 요청해야 한다는 안내가 있다", () => {
    expect(pkg.notes.join("\n")).toMatch(/진료계획서/);
    expect(pkg.rules_applied).toContain("S-11");
  });
});

describe("S-12 추가상병", () => {
  const pkg = buildPackage({ ...base, claim: "ADDITIONAL_DISEASE" });
  it("추가상병 신청서·소견서(별지 30·31호) REQUIRED, 근거 법 제49조", () => {
    expect(req(pkg)).toEqual(["F_ADDITIONAL_DISEASE_APPLY"]);
    expect(att(pkg, "MISSING")).toContain("A_ADDITIONAL_OPINION");
    expect(JSON.stringify(pkg)).toContain("제49조");
    expect(pkg.rules_applied).toContain("S-12");
  });
});

describe("S-13 재요양", () => {
  const pkg = buildPackage({ ...base, claim: "RE_YOYANG" });
  it("재요양 신청서·소견서(별지 33·33의2호) REQUIRED, 과거 의무기록·영상 권장, 근거 법 제51조·규칙 제31조", () => {
    expect(req(pkg)).toEqual(["F_RE_YOYANG_APPLY"]);
    expect(att(pkg, "MISSING")).toEqual(expect.arrayContaining(["A_RE_YOYANG_OPINION", "A_PRIOR_RECORDS"]));
    expect(pkg.notes.join("\n")).toMatch(/악화/);
    const s = JSON.stringify(pkg);
    expect(s).toContain("제51조");
    expect(s).toContain("시행규칙 제31조");
    expect(pkg.rules_applied).toContain("S-13");
  });
});

describe("공통", () => {
  it("아홉 급여 전부 패키지가 만들어지고 금지 표현이 없다", () => {
    const claims: ClaimInput["claim"][] = ["YOYANG", "HUYEOP", "CARE_TRANSPORT_DEVICE", "JANGHAE", "YUJOK", "UNPAID", "ADDITIONAL_DISEASE", "RE_YOYANG", "SELF_PAY"];
    for (const claim of claims) {
      const pkg = buildPackage({ ...base, claim });
      expect(pkg.forms.length).toBeGreaterThan(0);
      expect(JSON.stringify(pkg)).not.toMatch(/승인\s*가능|확률|적중/);
      for (const f of pkg.forms) expect(f.basis.length, `${claim}/${f.id} 근거 없음`).toBeGreaterThan(0);
    }
  });
});
