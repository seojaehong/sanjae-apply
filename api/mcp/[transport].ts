// Vercel Node 함수(Web 표준 시그니처). 실제 호출 URL 은 /api/mcp/mcp (mcp-handler 가 basePath+"/mcp" 로 끝점을 정한다).
// 무인증 공개 끝점(IP별 호출 한도). 빌드는 `npm run build`(tsc → dist) 뒤 dist 를 가져온다.
import { createHandler } from "../../dist/src/mcp/server.js";

const handler = createHandler("/api/mcp");

export const GET = (req: Request) => handler(req);
export const POST = (req: Request) => handler(req);
export const DELETE = (req: Request) => handler(req);
