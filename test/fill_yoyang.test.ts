// M2 — 요양급여신청서(별지 제2호, 2026.7.7 개정) PDF 위에 합성 값을 얹는다.
// 원본 PDF 는 forms/raw/(미커밋)에 있어야 한다. 없으면 건너뛴다(공단 정본은 scripts/comwel_forms.py 로 받는다).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fillForm, type FormMap } from "../src/fill/overlay.js";

const PDF = "forms/raw/2232720/요양급여신청서 및 소견서(2026.7.7. 개정).pdf";
const MAP = "forms/maps/F_YOYANG_APPLY.json";
const FONT = process.env.SANJAE_FONT ?? "C:/Windows/Fonts/malgun.ttf";
const ready = existsSync(PDF) && existsSync(FONT);

// 합성 값. 실명·실제 주민번호·실제 사업장 금지.
// ★ rrn 900101-1234567 은 검증숫자가 일부러 틀린 번호다(규칙대로면 끝자리 8). 「그럴듯하게」 고쳐 유효 번호를 만들지 말 것.
export const SAMPLE = {
  name: "홍길동",
  rrn: "9001011234567",
  address: "서울특별시 중구 세종대로 110 (태평로1가) 101동 1001호",
  mobile: "010-0000-0000",
  phone: "02-000-0000",
  accident_datetime: "202610151430",
  hire_year: "2024",
  hire_month: "3",
  hire_day: "2",
  work_start: "09:00",
  work_end: "18:00",
  job: "생산직(조립)",
  claim_kind_accident: true,
  worker_type_employee: true,
  employer_name: "가나다 주식회사",
  owner_name: "김대표",
  workplace_phone: "02-111-1111",
  workplace_no: "12345678901",
  workplace_address: "경기도 화성시 동탄대로 100",
  narrative:
    "2026년 10월 15일 14시 30분경 조립 2라인에서 부품 상자를 옮기던 중 바닥의 기름에 미끄러져 넘어지면서 오른쪽 손목을 짚어 다쳤습니다. 동료가 즉시 부축하였고 회사 차량으로 인근 병원에 이송되었습니다.",
  police_no: true,
  fire_no: true,
  insurer_no: true,
  witness_name: "박동료",
  witness_phone: "010-1111-1111",
  witness_relation: "같은 라인 동료",
  apply_year: "2026",
  apply_month: "10",
  apply_day: "26",
  applicant_name: "홍길동",
};

describe.skipIf(!ready)("F_YOYANG_APPLY PDF 오버레이", () => {
  const map = JSON.parse(readFileSync(MAP, "utf8")) as FormMap;
  const pdf = readFileSync(PDF);

  it("map 은 받아 둔 정본 PDF 의 sha256 을 가리킨다(판본이 바뀌면 좌표도 다시 잰다)", () => {
    expect(createHash("sha256").update(pdf).digest("hex")).toBe(map.source_sha256);
  });

  it("합성 값이 전부 써지고 쪽 수는 그대로 4쪽이다", async () => {
    const { bytes, report } = await fillForm(new Uint8Array(pdf), map, { fontBytes: new Uint8Array(readFileSync(FONT)), values: SAMPLE });
    // 안 찍은 체크(질병·출퇴근·「예」 3개)만 건너뛴다. 값이 있는 칸은 전부 써진다.
    expect(report.skipped.sort()).toEqual(["claim_kind_commute", "claim_kind_disease", "fire_yes", "insurer_yes", "police_yes"]);
    expect(report.written.length).toBe(Object.keys(map.slots).length - 5);
    expect(report.shrunk).toEqual([]);
    expect(bytes.byteLength).toBeGreaterThan(pdf.byteLength * 0.5);
    const outDir = join(tmpdir(), "sanjae-apply");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "F_YOYANG_APPLY_sample.pdf"), bytes);
  });

  it("map 의 모든 칸이 쪽 안에 있다", () => {
    for (const [k, s] of Object.entries(map.slots)) {
      const pts = s.kind === "boxes" ? s.boxes.flatMap((b) => [b.x0, b.x1]) : s.kind === "multiline" ? [s.x0, s.x1] : [s.x];
      for (const x of pts) expect(x, k).toBeGreaterThan(0), expect(x, k).toBeLessThan(map.page_size.width);
    }
  });
});
