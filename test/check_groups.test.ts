import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeForm } from "../src/fill/describe.js";
import type { FormMap } from "../src/fill/overlay.js";

const load = (id: string): FormMap => JSON.parse(readFileSync(`forms/maps/${id}.json`, "utf8")) as FormMap;

describe("explicit source-form check groups", () => {
  it("keeps all three employer choices together despite different label prefixes", () => {
    const details = describeForm(load("F_YOYANG_APPLY")).slot_details;
    for (const key of ["employer_relation_none", "employer_relation_actual", "employer_relation_subcontract"]) {
      expect(details.find((s) => s.key === key)).toMatchObject({ group: "사업주여부", exclusive: true, selection_group: "employer_relation" });
    }
  });

  it("marks worker type and each independent yes/no question as exclusive", () => {
    const details = describeForm(load("F_YOYANG_APPLY")).slot_details;
    expect(details.filter((s) => s.key.startsWith("worker_type_")).every((s) => "exclusive" in s && s.exclusive === true)).toBe(true);
    expect(details.find((s) => s.key === "police_yes")).toMatchObject({ selection_group: "police", exclusive: true });
    expect(details.find((s) => s.key === "fire_yes")).toMatchObject({ selection_group: "fire", exclusive: true });
  });

  it("preserves multiple unpaid benefit choices and does not infer exclusivity from label text", () => {
    const details = describeForm(load("F_UNPAID_CLAIM")).slot_details;
    const benefits = details.filter((s) => s.group === "미지급 보험급여 종류");
    expect(benefits).toHaveLength(10);
    for (const slot of benefits) expect(slot).toMatchObject({ exclusive: false, selection_group: "unpaid_benefits" });
    const other = describeForm(load("F_ADDITIONAL_DISEASE_APPLY")).slot_details.find((s) => s.kind === "check");
    expect(other).not.toHaveProperty("exclusive");
  });

  it("rejects a broken choice map instead of silently splitting or losing a selection", () => {
    const map = load("F_YOYANG_APPLY");
    const base = { id: "example", label: "example", exclusive: true, keys: ["police_yes", "police_no"] };
    expect(() => describeForm({ ...map, check_groups: [base, { ...base, id: "overlap" }] })).toThrow(/member/);
    expect(() => describeForm({ ...map, check_groups: [{ ...base, keys: ["name", "police_no"] }] })).toThrow(/member/);
    expect(() => describeForm({ ...map, check_groups: [{ ...base, keys: ["missing", "police_no"] }] })).toThrow(/member/);
    expect(() => describeForm({ ...map, check_groups: [{ ...base, keys: ["police_yes", "consent_sensitive_yes"] }] })).toThrow(/pages/);
  });
});
