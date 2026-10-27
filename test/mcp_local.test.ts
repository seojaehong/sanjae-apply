// 로컬 stdio 전용 save_to — Claude Code 실사용 시험(261027)에서 「PDF 로 저장해줘」가 막혔다.
// 도구가 base64 만 돌려주면 클라이언트가 그것을 자기 설정 폴더에 두고, 작업 폴더로 옮기려면 사람 승인이 필요했다.
// 로컬 서버는 받은 절대 경로에 직접 쓴다. 원격 서버에는 이 인자가 없다(남의 서버 디스크에 쓰지 않는다).
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { SERVER_INFO, registerTools } from "../src/mcp/server.js";

process.env.SANJAE_ROOT = process.cwd();

async function connect(local: boolean) {
  const server = new McpServer(SERVER_INFO);
  registerTools(server, { local });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "vitest", version: "0" });
  await client.connect(b);
  return client;
}
const json = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);

describe("로컬 save_to", () => {
  const dir = mkdtempSync(join(tmpdir(), "sanjae-save-"));

  it("로컬 서버: fill_form·make_seal 이 절대 경로에 파일을 쓰고, base64 대신 경로를 돌려준다", async () => {
    const c = await connect(true);
    const pdf = join(dir, "신청서.pdf");
    const r = await c.callTool({ name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" }, stamp: { name: "홍길동" }, save_to: pdf } });
    expect(json(r).saved_to).toBe(pdf);
    expect((r.content as unknown[]).length).toBe(1);
    expect(readFileSync(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const hx = join(dir, "신청서.hwpx");
    await c.callTool({ name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: { name: "홍길동" }, format: "hwpx", save_to: hx } });
    expect(readFileSync(hx).subarray(0, 2).toString()).toBe("PK");
    const png = join(dir, "도장.png");
    const s = await c.callTool({ name: "make_seal", arguments: { name: "홍길동", save_to: png } });
    expect(json(s)).toMatchObject({ saved_to: png, width: 480 });
    expect(readFileSync(png).subarray(1, 4).toString()).toBe("PNG");
  });

  it("상대 경로·확장자 불일치·이미 있는 파일·없는 폴더는 isError 이고 아무것도 쓰지 않는다", async () => {
    const c = await connect(true);
    const call = (save_to: string, format?: string) => c.callTool({ name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: {}, format, save_to } });
    expect((await call("신청서.pdf")).isError).toBe(true);
    expect((await call(join(dir, "x.hwpx"))).isError).toBe(true);
    expect(existsSync(join(dir, "x.hwpx"))).toBe(false);
    const taken = join(dir, "taken.pdf");
    writeFileSync(taken, "keep");
    expect((await call(taken)).isError).toBe(true);
    expect(readFileSync(taken, "utf8")).toBe("keep");
    expect((await call(join(dir, "없는폴더", "a.pdf"))).isError).toBe(true);
  });

  it("fill_form: 서식에 없는 칸 이름은 unknown_keys 로 알린다", async () => {
    const c = await connect(false);
    const r = await c.callTool({ name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: { name: "홍길동", birth: "1990-01-01" } } });
    expect(json(r).unknown_keys).toEqual(["birth"]);
  });

  it("원격(기본) 서버에는 save_to 가 없다", async () => {
    const c = await connect(false);
    const tools = (await c.listTools()).tools;
    for (const t of tools) expect(Object.keys((t.inputSchema as { properties?: object }).properties ?? {})).not.toContain("save_to");
  });
});

describe("unknown_keys 거짓 경고 없음", () => {
  it("모든 서식: 합성 샘플의 칸 이름은 PDF·한글 지도 어디서도 모르는 칸이 아니다", async () => {
    const { fillableForms, fillableHwpxForms, loadMap, loadHwpxAssets, unknownKeys } = await import("../src/fill/registry.js");
    const hwpx = new Set(fillableHwpxForms());
    for (const id of fillableForms()) {
      const vals = JSON.parse(readFileSync(`test/samples/${id}.json`, "utf8")) as Record<string, unknown>;
      expect(unknownKeys(vals, loadMap(id).slots), `${id} PDF`).toEqual([]);
      if (hwpx.has(id)) expect(unknownKeys(vals, loadHwpxAssets(id).map.slots), `${id} 한글`).toEqual([]);
    }
  });
});
