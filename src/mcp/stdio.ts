// 로컬 stdio MCP 서버 — `npx sanjae-apply mcp`. 토큰·서버·네트워크 없이 사무소 PC 안에서만 돈다.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_INFO, registerTools } from "./server.js";

export async function runStdio(): Promise<void> {
  const server = new McpServer(SERVER_INFO);
  registerTools(server);
  await server.connect(new StdioServerTransport());
}
