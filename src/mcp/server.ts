// 산재 신청 도우미 MCP 도구 계층 — 프레임워크 무관. 노무사 사무소의 에이전트(Claude 커넥터 등)가 Streamable HTTP 로 부른다.
// 세 도구 전부 무저장: 입력을 디스크·로그에 남기지 않고 결과만 돌려준다. 승인 가능성은 코어 필터가 막는다.
// 형태는 SafeClaw `app/api/mcp/[transport]/implementation.ts`(mcp-handler + withMcpAuth + env 토큰)를 그대로 따랐다.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { FORMS } from "../core/catalog.js";
import { findOutcomeLanguage } from "../core/filter.js";
import { buildPackage } from "../core/run.js";
import { ACCIDENT_KINDS, CLAIM_TYPES, TAGS, type ClaimInput } from "../core/types.js";
import { fillForm, type FormMap } from "../fill/overlay.js";

export const SERVER_INFO = { name: "sanjae-apply", version: "0.1.0" };

const ROOT = process.env.SANJAE_ROOT ?? process.cwd();
const PDF_PATH = path.join(ROOT, "forms", "bundled", "F_YOYANG_APPLY.pdf");
const MAP_PATH = path.join(ROOT, "forms", "maps", "F_YOYANG_APPLY.json");
const CATALOG_PATH = path.join(ROOT, "forms", "catalog.json");
const FONT_PATH = process.env.SANJAE_FONT ?? path.join(ROOT, "fonts", "NanumGothic-Regular.ttf");

const tri = z.union([z.boolean(), z.literal("UNDECLARED")]).describe("true / false / 'UNDECLARED'(아직 모름 — 질문으로 돌려준다)");

function text(obj: unknown) {
  const s = JSON.stringify(obj, null, 2);
  const hits = findOutcomeLanguage(s);
  if (hits.length) throw new Error(`출력에 승인 가능성·확률 표현이 있어 거부: ${hits.join(", ")}`);
  return { content: [{ type: "text" as const, text: s }] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_required_forms",
    {
      title: "필요 서식·첨부 목록",
      description:
        "산재 보상 청구(요양·휴업·간병료이송비보조기·장해·유족·미지급·추가상병·재요양·본인부담치료비)에 필요한 서식(REQUIRED/CONDITIONAL/NOT_APPLICABLE)·첨부(PROVIDED/MISSING/SUBSTITUTABLE)·근거 조문·절차 안내·아직 답해야 할 질문을 돌려준다. 입력을 저장하지 않는다. READY_TO_SUBMIT 은 제출 가능이지 승인이 아니다.",
      inputSchema: {
        claim: z.enum(CLAIM_TYPES).describe("급여 종류"),
        accidentKind: z.union([z.enum(ACCIDENT_KINDS), z.literal("UNDECLARED")]).describe("업무상 사고 / 출퇴근 / 질병 / 모름"),
        thirdParty: tri.describe("가해자(제3자)가 있는가"),
        treatmentEnded: tri.describe("해당 상병 치료가 이미 끝났는가"),
        tags: z.array(z.enum(TAGS)).optional().describe("소음성 난청 · 척추/신경 · 관절 · 보조기 청구"),
        have: z.array(z.string()).optional().describe("이미 준비한 첨부 id (예: A_MEDICAL_RECORDS)"),
      },
    },
    async (input) => {
      const pkg = buildPackage(input as ClaimInput);
      return text(pkg);
    },
  );

  server.registerTool(
    "get_form_catalog",
    {
      title: "공단 서식 정본 대장",
      description:
        "근로복지공단 서식자료실에서 받은 서식 13종의 파일명·개정일·sha256·게시글 URL. form_id 를 주면 그 서식만. 서식이 바뀌었는지(버전 감시) 확인하는 조회 면이다.",
      inputSchema: { form_id: z.string().optional().describe("예: F_YOYANG_APPLY") },
    },
    async ({ form_id }) => {
      const cat = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as { forms: { ids: string[] }[] };
      const forms = form_id ? cat.forms.filter((f) => f.ids.includes(form_id)) : cat.forms;
      const known = form_id ? FORMS[form_id as keyof typeof FORMS] : undefined;
      return text({ form: known ?? null, entries: forms });
    },
  );

  server.registerTool(
    "fill_yoyang_apply",
    {
      title: "요양급여신청서(별지 제2호, 2026.7.7 개정) 채우기",
      description:
        "공단 정본 PDF 1쪽 위에 값을 얹어 base64 PDF 로 돌려준다. 서버에 저장하지 않는다. 체크는 true 일 때만 찍는다. 합성·실제 값 모두 호출자 책임이며 주민번호는 보내지 않아도 된다(빈칸으로 남는다).",
      inputSchema: {
        values: z
          .record(z.string(), z.union([z.string(), z.boolean()]))
          .describe("칸 이름 → 값. 칸 이름은 forms/maps/F_YOYANG_APPLY.json 의 slots 키(name, rrn, address, mobile, phone, accident_datetime(YYYYMMDDhhmm), hire_year/month/day, work_start, work_end, job, claim_kind_accident|disease|commute, worker_type_employee, employer_name, owner_name, workplace_phone, workplace_no(11자리), workplace_address, narrative, police_yes|no, fire_yes|no, insurer_yes|no, witness_name|phone|relation, apply_year|month|day, applicant_name)"),
      },
    },
    async ({ values }) => {
      const map = JSON.parse(readFileSync(MAP_PATH, "utf8")) as FormMap;
      const pdf = new Uint8Array(readFileSync(PDF_PATH));
      const fontBytes = new Uint8Array(readFileSync(FONT_PATH));
      const { bytes, report } = await fillForm(pdf, map, { fontBytes, values });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ form_id: map.form_id, source_sha256: map.source_sha256, report }, null, 2) },
          { type: "resource" as const, resource: { uri: "sanjae-apply://F_YOYANG_APPLY/filled.pdf", mimeType: "application/pdf", blob: Buffer.from(bytes).toString("base64") } },
        ],
      };
    },
  );
}

/** env SANJAE_MCP_TOKENS(콤마 구분)에 든 Bearer 토큰만 통과. env 가 비어 있으면 전부 401. */
export const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const allowed = (process.env.SANJAE_MCP_TOKENS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(bearerToken)) return undefined;
  return { token: bearerToken, clientId: "sanjae-apply-mcp", scopes: ["tools"] };
};

export function createHandler(basePath = "/api/mcp") {
  const base = createMcpHandler(registerTools, { serverInfo: SERVER_INFO }, { basePath, maxDuration: 60, verboseLogs: false });
  return withMcpAuth(base, verifyToken, { required: true });
}
