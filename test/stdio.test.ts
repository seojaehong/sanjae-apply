// stdio MCP — 빌드된 CLI 를 `mcp` 로 띄워 공식 SDK 클라이언트로 붙는다(Claude Desktop 이 하는 것과 같다).
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CLI = "dist/src/cli.js";

describe.skipIf(!existsSync(CLI))("stdio MCP", () => {
  it("initialize → tools/list 5 → list_required_forms → fill_form", async () => {
    const client = new Client({ name: "vitest", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, "mcp"] }));
    try {
      expect(client.getServerVersion()?.name).toBe("sanjae-apply");
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(names).toEqual(["fill_form", "fill_yoyang_apply", "get_form_catalog", "list_required_forms", "make_seal"]);
      const r = await client.callTool({ name: "list_required_forms", arguments: { claim: "HUYEOP", accidentKind: "WORK_ACCIDENT", thirdParty: false, treatmentEnded: false } });
      const pkg = JSON.parse((r.content as { text: string }[])[0]!.text);
      expect(pkg.rules_applied).toContain("S-06");
      const f = await client.callTool({ name: "fill_form", arguments: { form_id: "F_YOYANG_APPLY", values: { name: "홍길동", apply_year: "2026" } } });
      const content = f.content as ({ type: string; text?: string; resource?: { blob: string; mimeType: string } })[];
      expect(JSON.parse(content[0]!.text!).report.written.sort()).toEqual(["apply_year", "name"]);
      expect(content[1]!.resource!.mimeType).toBe("application/pdf");
      expect(Buffer.from(content[1]!.resource!.blob, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await client.close();
    }
  }, 60000);
});
