// 규칙 엔진 전수 검증. buildPackage 의 입력 공간은 유한하다(CLAIM_TYPES × ACCIDENT_KINDS+UNDECLARED × Tri × Tri × TAGS 부분집합 × have ∈ {∅, 전체}).
// 그 전부를 실제 코드에 넣어 types.ts·filter.ts·common.ts 가 스스로 한 약속이 모든 입력에서 지켜지는지 본다. 표본 시험(s01·s04_s13)이 못 닿는 조합을 닿는다.
// 성질·해악·범위·실행법 = .claude/skills/verify-rules-formal/SKILL.md. 도메인은 export 된 배열에서 만든다. 급여·태그를 더하면 열거가 따라온다.
import { describe, expect, it } from "vitest";
import { ATTACHMENTS, FORMS } from "../src/core/catalog.js";
import { findOutcomeLanguage } from "../src/core/filter.js";
import { buildPackage } from "../src/core/run.js";
import { ACCIDENT_KINDS, CLAIM_TYPES, TAGS, type ClaimInput, type ClaimType, type Tag, type Tri } from "../src/core/types.js";

const TRI: Tri[] = [true, false, "UNDECLARED"];
const KINDS: ClaimInput["accidentKind"][] = [...ACCIDENT_KINDS, "UNDECLARED"];
const ALL_ATTACH = Object.values(ATTACHMENTS).map((d) => d.id);
const TAG_SUBSETS: Tag[][] = [];
for (let m = 0; m < 1 << TAGS.length; m++) TAG_SUBSETS.push(TAGS.filter((_, i) => m & (1 << i)));

/** 전수 도메인 */
const DOMAIN: ClaimInput[] = [];
for (const claim of CLAIM_TYPES)
  for (const accidentKind of KINDS)
    for (const thirdParty of TRI)
      for (const treatmentEnded of TRI)
        for (const tags of TAG_SUBSETS)
          for (const have of [[], ALL_ATTACH]) DOMAIN.push({ claim, accidentKind, thirdParty, treatmentEnded, tags, have });

const out = (i: ClaimInput) => JSON.stringify(buildPackage(i));
const label = (i: ClaimInput) => `${i.claim}/${i.accidentKind}/3rd=${i.thirdParty}/ended=${i.treatmentEnded}/tags=${(i.tags ?? []).join("+") || "∅"}/have=${i.have?.length ? "all" : "∅"}`;

/** 급여별 기본 규칙과 기본 서식. 규칙표 S-01~S-13 의 첫 줄 */
const BASE: Record<ClaimType, { rule: string; form: string }> = {
  YOYANG: { rule: "S-01", form: "F_YOYANG_APPLY" },
  YUJOK: { rule: "S-04", form: "F_YUJOK_CLAIM" },
  SELF_PAY: { rule: "S-05", form: "F_SELF_PAY_CLAIM" },
  HUYEOP: { rule: "S-06", form: "F_HUYEOP_CLAIM" },
  CARE_TRANSPORT_DEVICE: { rule: "S-07", form: "F_CARE_TRANSPORT_DEVICE_CLAIM" },
  UNPAID: { rule: "S-08", form: "F_UNPAID_CLAIM" },
  JANGHAE: { rule: "S-09", form: "F_JANGHAE_CLAIM" },
  ADDITIONAL_DISEASE: { rule: "S-12", form: "F_ADDITIONAL_DISEASE_APPLY" },
  RE_YOYANG: { rule: "S-13", form: "F_RE_YOYANG_APPLY" },
};
/** 급여가 실제로 읽는 태그. 그 밖의 태그는 출력을 바꾸면 안 된다 */
const RELEVANT_TAGS: Partial<Record<ClaimType, Tag[]>> = { JANGHAE: ["NOISE_HEARING_LOSS", "SPINE_OR_NERVE", "JOINT"], CARE_TRANSPORT_DEVICE: ["DEVICE"] };

describe("규칙 엔진 전수 검증", () => {
  it(`도메인이 유한하고 전부 돈다(${DOMAIN.length}건). 어느 조합에서도 던지지 않는다`, () => {
    expect(DOMAIN.length).toBe(CLAIM_TYPES.length * KINDS.length * 3 * 3 * TAG_SUBSETS.length * 2);
    for (const i of DOMAIN) expect(() => buildPackage(i), label(i)).not.toThrow();
  });

  it("P1 결정성. 같은 입력은 같은 출력(두 번 불러 deep-equal). 깨지면 같은 재해자가 다른 서식 목록을 받는다", () => {
    for (const i of DOMAIN) expect(out(i), label(i)).toBe(out(i));
  });

  it("P2 UNDECLARED 는 결정으로 읽지 않는다. 그 필드를 묻는 open_confirmation 이 있거나, 아니면 어떤 구체값을 넣어도 출력이 같다(필드를 읽지 않음). 깨지면 묻지 않은 전제로 공단에 제출된다", () => {
    const fields = [
      ["accidentKind", ACCIDENT_KINDS] as const,
      ["thirdParty", [true, false]] as const,
      ["treatmentEnded", [true, false]] as const,
    ];
    for (const i of DOMAIN) {
      const pkg = buildPackage(i);
      for (const q of pkg.open_confirmations) {
        expect(i[q.field], `${label(i)}: 이미 말한 ${q.field} 를 되묻는다`).toBe("UNDECLARED");
        const ids = pkg.forms.map((f) => f.id);
        for (const a of q.affects) expect(ids, `${label(i)}: affects ${a} 가 forms 에 없다`).toContain(a);
      }
      for (const [field, values] of fields) {
        if (i[field] !== "UNDECLARED") continue;
        const asked = pkg.open_confirmations.some((q) => q.field === field);
        if (asked) continue;
        const base = out(i);
        for (const v of values) expect(out({ ...i, [field]: v }), `${label(i)}: ${field} 를 묻지 않으면서 값에 따라 출력이 달라진다(${String(v)})`).toBe(base);
      }
    }
  });

  it("P3 금지어. 어느 출력에도 승인 가능성·확률·적중 표현이 없다(filter.ts 의 약속을 전수로). 깨지면 NOW.md 「절대 하지 말 것」을 제품이 어긴다", () => {
    for (const i of DOMAIN) expect(findOutcomeLanguage(out(i)), label(i)).toEqual([]);
  });

  it("P4 첨부(have)는 첨부 상태만 바꾼다. 전부 주면 모두 PROVIDED 이고 forms·open_confirmations·notes·rules 는 ∅ 때와 같다. 안 주면 PROVIDED 가 없다. READY_TO_SUBMIT ⇔ 열린 질문 0 ∧ 첨부 전부 PROVIDED. 깨지면 첨부를 냈다고 서식이 바뀌거나 준비 안 된 패키지가 READY 로 나간다", () => {
    for (const i of DOMAIN) {
      const pkg = buildPackage(i);
      const ready = pkg.open_confirmations.length === 0 && pkg.attachments.every((a) => a.status === "PROVIDED");
      expect(pkg.status, label(i)).toBe(ready ? "READY_TO_SUBMIT" : "INCOMPLETE");
      if (!i.have?.length) {
        expect(pkg.attachments.some((a) => a.status === "PROVIDED"), `${label(i)}: 주지 않은 첨부가 PROVIDED`).toBe(false);
        continue;
      }
      expect(pkg.attachments.every((a) => a.status === "PROVIDED"), `${label(i)}: 전부 줬는데 PROVIDED 아님`).toBe(true);
      const none = buildPackage({ ...i, have: [] });
      expect(pkg.forms, label(i)).toEqual(none.forms);
      expect(pkg.open_confirmations, label(i)).toEqual(none.open_confirmations);
      expect(pkg.notes, label(i)).toEqual(none.notes);
      expect(pkg.rules_applied, label(i)).toEqual(none.rules_applied);
    }
  });

  it("P5 카탈로그 정합. 서식·첨부 id 가 카탈로그에 있고 중복이 없으며, CONDITIONAL 은 조건문, SUBSTITUTABLE 은 대체물, 근거 조문이 비지 않는다. 깨지면 존재하지 않는 서식을 안내하거나 조건 없는 「조건부」가 나간다", () => {
    for (const i of DOMAIN) {
      const pkg = buildPackage(i);
      const fids = pkg.forms.map((f) => f.id);
      expect(new Set(fids).size, `${label(i)}: 서식 중복`).toBe(fids.length);
      for (const f of pkg.forms) {
        expect(FORMS, `${label(i)}: 카탈로그에 없는 서식 ${f.id}`).toHaveProperty(f.id);
        expect(f.basis.length, `${label(i)}: ${f.id} 근거 없음`).toBeGreaterThan(0);
        if (f.status === "CONDITIONAL") expect(f.condition, `${label(i)}: ${f.id} 조건문 없음`).toBeTruthy();
        else expect(f.condition, `${label(i)}: ${f.id} ${f.status} 에 조건문`).toBeUndefined();
      }
      const aids = pkg.attachments.map((a) => a.id);
      expect(new Set(aids).size, `${label(i)}: 첨부 중복`).toBe(aids.length);
      for (const a of pkg.attachments) {
        expect(ATTACHMENTS, `${label(i)}: 카탈로그에 없는 첨부 ${a.id}`).toHaveProperty(a.id);
        expect(a.basis.length, `${label(i)}: ${a.id} 근거 없음`).toBeGreaterThan(0);
        if (a.status === "SUBSTITUTABLE") expect(a.substitute, `${label(i)}: ${a.id} 대체물 없음`).toBeTruthy();
        if (a.status === "PROVIDED") expect(a.substitute, `${label(i)}: PROVIDED 에 대체물`).toBeUndefined();
      }
    }
  });

  it("P6 규칙표 S-01~S-13. 급여의 기본 규칙이 첫 번째이고 기본 서식이 REQUIRED. S-02 ⇔ 요양급여∧출퇴근, S-03 ⇔ 요양급여∧제3자=true, S-10 ⇔ 장해급여∧소음성난청, S-11 ⇔ 요양급여. 출퇴근 발생신고서는 출퇴근이면 REQUIRED, 사고·질병이면 NOT_APPLICABLE. 깨지면 분기 서식이 빠지거나 엉뚱한 급여에 붙는다", () => {
    for (const i of DOMAIN) {
      const pkg = buildPackage(i);
      const base = BASE[i.claim];
      expect(pkg.rules_applied[0], label(i)).toBe(base.rule);
      expect(pkg.forms.find((f) => f.id === base.form)?.status, `${label(i)}: 기본 서식`).toBe("REQUIRED");
      const yo = i.claim === "YOYANG";
      const has = (r: string) => pkg.rules_applied.includes(r);
      expect(has("S-02"), `${label(i)}: S-02`).toBe(yo && i.accidentKind === "COMMUTE");
      expect(has("S-03"), `${label(i)}: S-03`).toBe(yo && i.thirdParty === true);
      expect(has("S-11"), `${label(i)}: S-11`).toBe(yo);
      expect(has("S-10"), `${label(i)}: S-10`).toBe(i.claim === "JANGHAE" && (i.tags ?? []).includes("NOISE_HEARING_LOSS"));
      const commute = pkg.forms.find((f) => f.id === "F_COMMUTE_REPORT")?.status;
      const third = pkg.forms.find((f) => f.id === "F_THIRD_PARTY_REPORT")?.status;
      if (yo) {
        expect(commute, `${label(i)}: 출퇴근 서식`).toBe(i.accidentKind === "COMMUTE" ? "REQUIRED" : i.accidentKind === "UNDECLARED" ? "CONDITIONAL" : "NOT_APPLICABLE");
        expect(third, `${label(i)}: 제3자 서식`).toBe(i.thirdParty === true ? "REQUIRED" : i.thirdParty === "UNDECLARED" ? "CONDITIONAL" : "NOT_APPLICABLE");
      } else {
        expect(commute, `${label(i)}: 요양급여 아닌데 출퇴근 서식`).toBeUndefined();
        expect(third, `${label(i)}: 요양급여 아닌데 제3자 서식`).toBeUndefined();
      }
    }
  });

  it("P7 태그 무관성. 급여가 읽지 않는 태그는 출력을 바꾸지 않는다(장해: 소음·척추신경·관절, 간병료이송비보조기: 보조기, 나머지: 없음). 깨지면 다른 급여의 태그가 서식 목록에 샌다", () => {
    for (const i of DOMAIN) {
      const rel = RELEVANT_TAGS[i.claim] ?? [];
      const kept = (i.tags ?? []).filter((t) => rel.includes(t));
      expect(out({ ...i, tags: kept }), label(i)).toBe(out(i));
    }
  });
});
