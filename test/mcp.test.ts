// MCP 출구 — 핸들러를 Request 로 직접 불러 initialize → tools/list → tools/call 을 확인한다(네트워크·Vercel 불요).
import { describe, expect, it } from "vitest";
import { createHandler, RATE_LIMIT_PER_MINUTE } from "../src/mcp/server.js";

const TOKEN = null;
process.env.SANJAE_ROOT = process.cwd();
const URL = "http://localhost/api/mcp/mcp";
const handler = createHandler("/api/mcp");

async function rpc(body: unknown, token: string | null = TOKEN, sessionId?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await handler(new Request(URL, { method: "POST", headers, body: JSON.stringify(body) }));
  const raw = await res.text();
  // streamable HTTP 는 SSE 로 올 수 있다 — data: 줄만 모은다
  const json = raw.startsWith("event:") || raw.startsWith("data:")
    ? JSON.parse(raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join(""))
    : raw ? JSON.parse(raw) : null;
  return { status: res.status, json, sessionId: res.headers.get("mcp-session-id") ?? sessionId };
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "0" } } };

describe("MCP 출구", () => {
  it("토큰 없이 도구 8개를 전부 실행할 수 있다", async () => {
    const init = await rpc(INIT, null);
    expect(init.status).toBe(200);
    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, null, init.sessionId);
    expect(list.json.result.tools.length).toBe(8);
    const call = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" } } } }, null, init.sessionId);
    expect(call.status).toBe(200);
    expect(JSON.parse(call.json.result.content[0].text).report.written).toEqual(["name"]);
  });

  it("옛 토큰을 계속 보내는 클라이언트도 끊기지 않는다", async () => {
    expect((await rpc(INIT, "old-token")).status).toBe(200);
  });

  it("같은 IP 가 분당 한도를 넘으면 429, 다른 IP 는 영향이 없다", async () => {
    const send = (ip: string) => handler(new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": ip },
      body: JSON.stringify(INIT),
    }));
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) expect((await send("203.0.113.9")).status).toBe(200);
    const over = await send("203.0.113.9");
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
    expect((await send("203.0.113.10")).status).toBe(200);
  });

  it("initialize → tools/list 에 도구 8개", async () => {
    const init = await rpc(INIT);
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe("sanjae-apply");
    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, TOKEN, init.sessionId);
    const names = list.json.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["check_accident_report", "fill_form", "fill_yoyang_apply", "find_labor_office", "get_accident_report_guide", "get_form_catalog", "list_required_forms", "make_seal"]);
  });

  // 커넥터 디렉터리 심사는 도구마다 title 과 읽기·쓰기 표시(annotations)를 본다.
  // 원격판에는 save_to 가 없어 도구 8개 전부 읽기 전용이다. 로컬판의 쓰기 표시는 mcp_local.test.ts 가 본다.
  it("도구마다 title 과 annotations 네 칸이 다 있다", async () => {
    const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const want: Record<string, typeof RO> = {
      list_required_forms: RO, get_form_catalog: RO, get_accident_report_guide: RO, find_labor_office: RO,
      check_accident_report: RO, fill_yoyang_apply: RO, fill_form: RO, make_seal: RO,
    };
    const init = await rpc(INIT);
    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, TOKEN, init.sessionId);
    for (const t of list.json.result.tools as { name: string; title?: string; annotations?: Record<string, boolean> }[]) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.annotations, t.name).toEqual(want[t.name]);
    }
  });

  it("fill_form: form_id 로 범용 채우기, 없는 id 는 isError", async () => {
    const init = await rpc(INIT);
    const ok = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" } } } }, TOKEN, init.sessionId);
    expect(JSON.parse(ok.json.result.content[0].text).report.written).toEqual(["name"]);
    const bad = await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "fill_form", arguments: { form_id: "F_NOPE", values: {} } } }, TOKEN, init.sessionId);
    expect(bad.json.result.isError).toBe(true);
  });

  it("list_required_forms: 출퇴근·제3자 → S-01~S-03, 서식 4종 REQUIRED, 금지어 없음", async () => {
    const init = await rpc(INIT);
    const call = await rpc(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_required_forms", arguments: { claim: "YOYANG", accidentKind: "COMMUTE", thirdParty: true, treatmentEnded: false } } },
      TOKEN,
      init.sessionId,
    );
    expect(call.status).toBe(200);
    const pkg = JSON.parse(call.json.result.content[0].text);
    expect(pkg.rules_applied).toEqual(expect.arrayContaining(["S-01", "S-02", "S-03"]));
    expect(pkg.forms.filter((f: { status: string }) => f.status === "REQUIRED").length).toBe(4);
    expect(call.json.result.content[0].text).not.toMatch(/승인\s*가능|확률|적중/);
  });

  it("make_seal 이 PNG 를 돌려주고, fill_form 의 stamp 가 PDF·hwpx 에 찍히며, 없는 자리·깨진 PNG 는 isError 다", async () => {
    const init = await rpc(INIT);
    const call = (id: number, name: string, args: unknown) => rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, TOKEN, init.sessionId);
    const seal = await call(20, "make_seal", { name: "홍길동" });
    expect(JSON.parse(seal.json.result.content[0].text)).toMatchObject({ width: 480, height: 480 });
    expect(seal.json.result.content[1].resource.mimeType).toBe("image/png");
    const png64 = seal.json.result.content[1].resource.blob as string;
    const pdf = await call(21, "fill_form", { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" }, stamp: { png_base64: png64 } });
    expect(JSON.parse(pdf.json.result.content[0].text).report.stamped).toEqual(["applicant", "delegation", "consent"]);
    const hx = await call(22, "fill_form", { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" }, format: "hwpx", stamp: { name: "홍길동", spot: "applicant" } });
    expect(JSON.parse(hx.json.result.content[0].text).report.stamped).toEqual(["applicant"]);
    const bad = await call(23, "fill_form", { form_id: "F_YOYANG_APPLY", values: {}, stamp: { name: "홍길동", spot: "nowhere" } });
    expect(bad.json.result.isError).toBe(true);
    const badPng = await call(24, "fill_form", { form_id: "F_YOYANG_APPLY", values: {}, stamp: { png_base64: Buffer.from("not a png").toString("base64") } });
    expect(badPng.json.result.isError).toBe(true);
    const hanja = await call(25, "make_seal", { name: "洪吉童" });
    expect(hanja.json.result.isError).toBe(true);
  }, 60000);

  it("산업재해조사표: 지침·점검·관할 찾기는 읽기 전용이고, 대장에 법제처 출처·2025-10-01 개정으로 있다", async () => {
    const init = await rpc(INIT);
    const call = (id: number, name: string, args: unknown) => rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, TOKEN, init.sessionId);
    const list = await rpc({ jsonrpc: "2.0", id: 30, method: "tools/list", params: {} }, TOKEN, init.sessionId);
    for (const n of ["get_accident_report_guide", "check_accident_report", "find_labor_office"]) {
      expect(list.json.result.tools.find((t: { name: string }) => t.name === n).annotations.readOnlyHint, n).toBe(true);
    }
    const g = JSON.parse((await call(31, "get_accident_report_guide", { section: "narrative", workplace_address: "서울특별시 중구 세종대로 110" })).json.result.content[0].text);
    expect(g.narrative.cause.factors).toHaveLength(4);
    expect(g.labor_office_lookup.status).toBe("CONFIRMED");
    expect(g.labor_office_lookup.office.office_name).toBe("서울지방고용노동청");
    const c = JSON.parse((await call(32, "check_accident_report", { values: { name: "홍길동", accident_year: "2026", accident_month: "10", accident_day: "15", accident_weekday: "금" }, today: "2026-10-26" })).json.result.content[0].text);
    expect(c.issues.some((i: { keys: string[]; level: string }) => i.level === "error" && i.keys.includes("accident_weekday"))).toBe(true);
    expect(c.deadline.reference_deadline).toBe("2026-11-15");
    const cat = JSON.parse((await call(33, "get_form_catalog", { form_id: "F_INDUSTRIAL_ACCIDENT_REPORT" })).json.result.content[0].text);
    expect(cat.entries[0].revised).toBe("2025-10-01");
    expect(cat.entries[0].view_url).toContain("law.go.kr");
    expect(cat.stamps).toEqual(expect.arrayContaining(["applicant", "worker_rep"]));
  });

  it("find_labor_office: 지방청은 두 번호와 「제출 전 전화 확인 권장」, 여수는 확인방법 「단일 출처」, 빈 주소는 거부", async () => {
    const init = await rpc(INIT);
    const call = (id: number, args: unknown) => rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "find_labor_office", arguments: args } }, TOKEN, init.sessionId);
    const s = JSON.parse((await call(40, { address: "서울특별시 중구 세종대로 110" })).json.result.content[0].text);
    expect(s.office.report_to).toMatchObject({ role: "기본", department: "산재예방감독과" });
    expect(s.office.report_to_alt).toMatchObject({ role: "보조", department: "광역산재예방감독과" });
    expect(s.office.confirm_before_submit).toBe("제출 전 전화 확인 권장");
    const y = JSON.parse((await call(41, { address: "전라남도 여수시 시청로 1" })).json.result.content[0].text);
    expect(y.office.report_to).toMatchObject({ fax: "0503-8803-0638", fax_check: "확인 필요", fax_verification: "단일 출처" });
    const c = JSON.parse((await call(42, { address: "서울특별시 종로구 세종대로 209", construction: true })).json.result.content[0].text);
    expect(c.office.report_to.department).toBe("건설산재예방감독과");
    expect((await call(43, { address: "" })).json.result.isError).toBe(true);
  });

  it("fill_form(산업재해조사표): 결과에 관할 관서(labor_office)와 칸 값·제안 값이 붙고, 다른 서식에는 붙지 않는다", async () => {
    const init = await rpc(INIT);
    const call = (id: number, args: unknown) => rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "fill_form", arguments: args } }, TOKEN, init.sessionId);
    const r = JSON.parse((await call(50, { form_id: "F_INDUSTRIAL_ACCIDENT_REPORT", values: { workplace_address: "서울특별시 강남구 테헤란로 152", labor_office: "서울", construction_type: "" } })).json.result.content[0].text);
    expect(r.labor_office.status).toBe("CONFIRMED");
    expect(r.labor_office.office.office_name).toBe("서울강남지청");
    expect(r.labor_office.office.report_to.construction_desk).toBe(false);
    expect(r.labor_office.slot).toEqual({ written: "서울", suggested: "서울강남" });
    const h = JSON.parse((await call(51, { form_id: "F_INDUSTRIAL_ACCIDENT_REPORT", format: "hwpx", values: { workplace_address: "서울특별시 종로구 세종대로 209", construction_amount: "850" } })).json.result.content[0].text);
    expect(h.labor_office.office.report_to.department).toBe("건설산재예방감독과");
    // construction_* 가 비어도 다른 「건설업만 작성」 칸(발주자 등)에 값이 있으면 건설 전담 과
    const o = JSON.parse((await call(54, { form_id: "F_INDUSTRIAL_ACCIDENT_REPORT", values: { workplace_address: "서울특별시 종로구 세종대로 209", orderer_government: true, site_name: "합성 현장" } })).json.result.content[0].text);
    expect(o.labor_office.office.report_to.department).toBe("건설산재예방감독과");
    const none = JSON.parse((await call(52, { form_id: "F_INDUSTRIAL_ACCIDENT_REPORT", values: { name: "홍길동" } })).json.result.content[0].text);
    expect(none.labor_office.status).toBe("NO_ADDRESS");
    const other = JSON.parse((await call(53, { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" } })).json.result.content[0].text);
    expect(other.labor_office).toBeUndefined();
  }, 60000);

  it("get_form_catalog: F_YOYANG_APPLY 는 2026-07-07 개정본 해시를 가진다", async () => {
    const init = await rpc(INIT);
    const call = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_form_catalog", arguments: { form_id: "F_YOYANG_APPLY" } } }, TOKEN, init.sessionId);
    const out = JSON.parse(call.json.result.content[0].text);
    expect(out.entries[0].revised).toBe("2026-07-07");
    expect(out.entries[0].files.some((f: { sha256: string }) => f.sha256.startsWith("25cd22b8"))).toBe(true);
  });

  it("fill_yoyang_apply: 합성 값으로 PDF base64 를 돌려주고 저장하지 않는다", async () => {
    const init = await rpc(INIT);
    const call = await rpc(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "fill_yoyang_apply", arguments: { values: { name: "홍길동", claim_kind_accident: true, apply_year: "2026" } } } },
      TOKEN,
      init.sessionId,
    );
    expect(call.status).toBe(200);
    const report = JSON.parse(call.json.result.content[0].text);
    expect(report.report.written.sort()).toEqual(["apply_year", "claim_kind_accident", "name"]);
    const blob = call.json.result.content[1].resource.blob as string;
    expect(Buffer.from(blob, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });
});
