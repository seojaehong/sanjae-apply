// S-01~S-03: 요양급여 신청에 필요한 서식·첨부.
// 블로그(산재창고 cpla1004) 실무 메모를 규칙으로 옮긴 것. 근거 조문은 fixtures/laws 에 둔다.
import { describe, expect, it } from "vitest";
import { buildPackage } from "../src/core/run.js";
import type { ClaimInput } from "../src/core/types.js";

const ids = (items: { id: string; status: string }[], status: string) =>
  items.filter((i) => i.status === status).map((i) => i.id).sort();

describe("S-01 요양급여 — 업무상 사고, 제3자 없음", () => {
  const input: ClaimInput = { claim: "YOYANG", accidentKind: "WORK_ACCIDENT", thirdParty: false, treatmentEnded: false };
  const pkg = buildPackage(input);

  it("신청서(별지 2호)와 소견서(별지 3호)가 REQUIRED 다", () => {
    expect(ids(pkg.forms, "REQUIRED")).toEqual(["F_YOYANG_APPLY", "F_YOYANG_OPINION"]);
  });

  it("출퇴근·제3자 서식은 NOT_APPLICABLE 이다", () => {
    expect(ids(pkg.forms, "NOT_APPLICABLE")).toEqual(["F_COMMUTE_REPORT", "F_THIRD_PARTY_REPORT"]);
  });

  it("소견서는 의사 거부 시 진단서로 대체 가능(SUBSTITUTABLE)하다", () => {
    const op = pkg.attachments.find((a) => a.id === "A_MEDICAL_OPINION");
    expect(op?.status).toBe("SUBSTITUTABLE");
    expect(op?.substitute).toContain("진단서");
  });

  it("의무기록·영상 CD 는 MISSING 이고, 승인 가능성 문구는 어디에도 없다", () => {
    expect(ids(pkg.attachments, "MISSING")).toContain("A_MEDICAL_RECORDS");
    const text = JSON.stringify(pkg);
    expect(text).not.toMatch(/승인\s*가능|확률|적중/);
  });

  it("모든 REQUIRED 서식에 근거 조문이 붙는다", () => {
    for (const f of pkg.forms.filter((f) => f.status === "REQUIRED")) expect(f.basis.length).toBeGreaterThan(0);
  });

  it("패키지는 INCOMPLETE 이고 열린 확인은 없다", () => {
    expect(pkg.status).toBe("INCOMPLETE");
    expect(pkg.open_confirmations).toEqual([]);
    expect(pkg.rules_applied).toContain("S-01");
  });
});

describe("S-02·S-03 요양급여 — 출퇴근 재해, 제3자 있음", () => {
  const input: ClaimInput = { claim: "YOYANG", accidentKind: "COMMUTE", thirdParty: true, treatmentEnded: false };
  const pkg = buildPackage(input);

  it("신청서·소견서·출퇴근재해 발생신고서·제3자행위 신고서+확인서 4종이 REQUIRED 다", () => {
    expect(ids(pkg.forms, "REQUIRED")).toEqual(["F_COMMUTE_REPORT", "F_THIRD_PARTY_REPORT", "F_YOYANG_APPLY", "F_YOYANG_OPINION"]);
    expect(pkg.rules_applied).toEqual(expect.arrayContaining(["S-01", "S-02", "S-03"]));
  });

  it("출퇴근 사고 증빙(119 구급활동일지·택시영수증·목격자 확인서 등)이 첨부 목록에 MISSING 으로 뜬다", () => {
    expect(ids(pkg.attachments, "MISSING")).toContain("A_COMMUTE_EVIDENCE");
  });
});

describe("UNDECLARED 는 NOT_APPLICABLE 이 아니라 open_confirmations 로 간다", () => {
  const input: ClaimInput = { claim: "YOYANG", accidentKind: "COMMUTE", thirdParty: "UNDECLARED", treatmentEnded: false };
  const pkg = buildPackage(input);

  it("제3자 서식은 CONDITIONAL 이고 질문이 하나 열린다", () => {
    expect(pkg.forms.find((f) => f.id === "F_THIRD_PARTY_REPORT")?.status).toBe("CONDITIONAL");
    expect(pkg.open_confirmations.map((c) => c.field)).toEqual(["thirdParty"]);
    expect(pkg.open_confirmations[0]?.affects).toContain("F_THIRD_PARTY_REPORT");
  });
});
