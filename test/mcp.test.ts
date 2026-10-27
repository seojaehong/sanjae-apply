// MCP 출구 — 핸들러를 Request 로 직접 불러 initialize → tools/list → tools/call 을 확인한다(네트워크·Vercel 불요).
import { describe, expect, it } from "vitest";
import { createHandler } from "../src/mcp/server.js";

const TOKEN = "test-token-for-vitest";
process.env.SANJAE_MCP_TOKENS = `other,${TOKEN}`;
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
  it("토큰이 없거나 틀리면 401", async () => {
    expect((await rpc(INIT, null)).status).toBe(401);
    expect((await rpc(INIT, "wrong")).status).toBe(401);
  });

  it("initialize → tools/list 에 도구 5개", async () => {
    const init = await rpc(INIT);
    expect(init.status).toBe(200);
    expect(init.json.result.serverInfo.name).toBe("sanjae-apply");
    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, TOKEN, init.sessionId);
    const names = list.json.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["fill_form", "fill_yoyang_apply", "get_form_catalog", "list_required_forms", "make_seal"]);
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
