// 산재 신청 도우미 MCP 도구 계층 — 전송 무관(원격 Streamable HTTP · 로컬 stdio 둘 다 이 registerTools 를 쓴다).
// 네 도구 전부 무저장: 입력을 디스크·로그에 남기지 않고 결과만 돌려준다. 승인 가능성은 코어 필터가 막는다.
// 원격 형태는 SafeClaw `app/api/mcp/[transport]/implementation.ts`(mcp-handler + withMcpAuth + env 토큰)를 그대로 따랐다.

import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { FORMS } from "../core/catalog.js";
import { findOutcomeLanguage } from "../core/filter.js";
import { buildPackage } from "../core/run.js";
import { ACCIDENT_KINDS, CLAIM_TYPES, TAGS, type ClaimInput } from "../core/types.js";
import { fillHwpx } from "../fill/hwpx.js";
import { fillForm } from "../fill/overlay.js";
import { catalogPath, fillableForms, fillableHwpxForms, fontPath, loadAssets, loadHwpxAssets, loadMap } from "../fill/registry.js";
import { resolveStamp, stampSpots } from "../stamp/resolve.js";

export const SERVER_INFO = { name: "sanjae-apply", version: "0.5.0" };

const tri = z.union([z.boolean(), z.literal("UNDECLARED")]).describe("true / false / 'UNDECLARED'(아직 모름 — 질문으로 돌려준다)");

function text(obj: unknown) {
  const s = JSON.stringify(obj, null, 2);
  const hits = findOutcomeLanguage(s);
  if (hits.length) throw new Error(`출력에 승인 가능성·확률 표현이 있어 거부: ${hits.join(", ")}`);
  return { content: [{ type: "text" as const, text: s }] };
}

const stampSchema = z
  .object({
    name: z.string().optional().describe("성명인 이름(2~4자). 본인 또는 명의자 동의가 있는 이름만"),
    shape: z.enum(["circle", "square", "ellipse"]).optional(),
    png_base64: z.string().optional().describe("이미 있는 도장 PNG(투명 배경)"),
    spot: z.string().optional().describe("찍을 자리(쉼표 구분). 기본 = 지도에 있는 신청인 자리 전부(applicant·delegation·consent). 자리 이름은 get_form_catalog(form_id).stamps"),
  })
  .optional()
  .describe("도장. PDF 출력에서 신청인 서명란에 찍는다. 본인 또는 명의자 동의가 있는 이름만. 등록 인감 대용이 아니다(사용인감 성격)");

type StampInput = z.infer<typeof stampSchema>;

function stampsFrom(stamp: StampInput, font: Uint8Array, available: string[]): Record<string, Uint8Array> | undefined {
  if (!stamp) return undefined;
  const png = resolveStamp({ name: stamp.name, shape: stamp.shape, png: stamp.png_base64 ? new Uint8Array(Buffer.from(stamp.png_base64, "base64")) : undefined }, font);
  return Object.fromEntries(stampSpots(available, stamp.spot).map((k) => [k, png]));
}

async function fillAndPack(formId: string, values: Record<string, string | boolean>, format: "pdf" | "hwpx" = "pdf", stamp?: StampInput) {
  if (format === "hwpx") {
    const { map, hwpx } = loadHwpxAssets(formId);
    const { bytes, report } = await fillHwpx(hwpx, map, { values });
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ form_id: map.form_id, format: "hwpx", source_sha256: map.source_sha256, report }, null, 2) },
        { type: "resource" as const, resource: { uri: `sanjae-apply://${map.form_id}/filled.hwpx`, mimeType: "application/vnd.hancom.hwpx", blob: Buffer.from(bytes).toString("base64") } },
      ],
    };
  }
  const { map, pdf, font } = loadAssets(formId);
  const { bytes, report } = await fillForm(pdf, map, { fontBytes: font, values, stamps: stampsFrom(stamp, font, Object.keys(map.stamps ?? {})) });
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ form_id: map.form_id, format: "pdf", source_sha256: map.source_sha256, report }, null, 2) },
      { type: "resource" as const, resource: { uri: `sanjae-apply://${map.form_id}/filled.pdf`, mimeType: "application/pdf", blob: Buffer.from(bytes).toString("base64") } },
    ],
  };
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
    async (input) => text(buildPackage(input as ClaimInput)),
  );

  server.registerTool(
    "get_form_catalog",
    {
      title: "공단 서식 정본 대장",
      description:
        "근로복지공단 서식자료실에서 받은 서식 13종의 파일명·개정일·sha256·게시글 URL 과, 지금 채울 수 있는 서식(fillable)과 그 칸 이름(slots)·도장 자리 이름(stamps). form_id 를 주면 그 서식만.",
      inputSchema: { form_id: z.string().optional().describe("예: F_YOYANG_APPLY") },
    },
    async ({ form_id }) => {
      const cat = JSON.parse(readFileSync(catalogPath(), "utf8")) as { forms: { ids: string[] }[] };
      const forms = form_id ? cat.forms.filter((f) => f.ids.includes(form_id)) : cat.forms;
      const known = form_id ? (FORMS as Record<string, unknown>)[form_id] ?? null : undefined;
      const fillable = fillableForms();
      const fillable_hwpx = fillableHwpxForms();
      const m = form_id && fillable.includes(form_id) ? loadMap(form_id) : undefined;
      const slots = m ? Object.keys(m.slots) : undefined;
      const stamps = m ? Object.keys(m.stamps ?? {}) : undefined;
      return text({ form: known, fillable, fillable_hwpx, slots, stamps, entries: forms });
    },
  );

  server.registerTool(
    "fill_form",
    {
      title: "서식 채우기(공단 정본 PDF 오버레이)",
      description:
        "form_id 의 공단 정본 서식에 값을 넣어 base64 로 돌려준다. format='pdf'(기본)는 정본 PDF 오버레이, format='hwpx'는 한글 문서(한글 2014+ 로 열어 고칠 수 있다). 채울 수 있는 서식과 칸 이름은 get_form_catalog(form_id) 의 fillable·fillable_hwpx·slots 로 본다(칸 이름은 두 형식이 같다). 서버에 저장하지 않는다. 체크 칸은 true 일 때만 찍는다. 주민번호 등은 보내지 않아도 된다(빈칸으로 남는다).",
      inputSchema: {
        form_id: z.string().describe("예: F_YOYANG_APPLY, F_HUYEOP_CLAIM …"),
        values: z.record(z.string(), z.union([z.string(), z.boolean()])).describe("칸 이름 → 값"),
        format: z.enum(["pdf", "hwpx"]).optional().describe("pdf(기본) 또는 hwpx(한글)"),
        stamp: stampSchema,
      },
    },
    async ({ form_id, values, format, stamp }) => fillAndPack(form_id, values, format ?? "pdf", stamp),
  );

  server.registerTool(
    "make_seal",
    {
      title: "도장(인영) PNG 만들기",
      description:
        "이름으로 성명인(원형·사각·타원) 또는 법인형(원주 법인명 + 중심 문자 + 하단 부문자) 도장 PNG(투명 배경)를 만들어 base64 로 돌려준다. 본인 또는 명의자 동의가 있는 이름만 쓴다. 등록 인감을 흉내 내는 용도가 아니다(사용인감 성격). fill_form 의 stamp.name 으로 바로 찍을 수도 있다.",
      inputSchema: {
        name: z.string().optional().describe("성명인 이름(2~4자)"),
        shape: z.enum(["circle", "square", "ellipse"]).optional().describe("기본 circle"),
        arc_text: z.string().optional().describe("원주 상단 법인명(있으면 법인형)"),
        center_text: z.string().optional().describe("중심 문자. 줄바꿈은 \\n"),
        bottom_text: z.string().optional().describe("원주 하단 부문자(사업자번호 등)"),
        inner_ring: z.number().optional().describe("이중선 두께 px"),
      },
    },
    async (a) => {
      const png = resolveStamp({ name: a.name, shape: a.shape, arcText: a.arc_text, centerText: a.center_text?.replace(/\\n/g, "\n"), bottomText: a.bottom_text, innerRing: a.inner_ring }, new Uint8Array(readFileSync(fontPath())));
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ bytes: png.length, width: 480, note: "본인 또는 명의자 동의가 있는 이름만. 등록 인감 대용이 아니다." }) },
          { type: "resource" as const, resource: { uri: "sanjae-apply://seal.png", mimeType: "image/png", blob: Buffer.from(png).toString("base64") } },
        ],
      };
    },
  );

  // 하위 호환(v0.1 클라이언트)
  server.registerTool(
    "fill_yoyang_apply",
    {
      title: "요양급여신청서(별지 제2호, 2026.7.7 개정) 채우기",
      description: "fill_form(form_id='F_YOYANG_APPLY') 과 같다. 칸 이름: name, rrn, address, mobile, phone, accident_datetime(YYYYMMDDhhmm), hire_year/month/day, work_start, work_end, job, claim_kind_accident|disease|commute, worker_type_employee, employer_name, owner_name, workplace_phone, workplace_no(11자리), workplace_address, narrative, police_yes|no, fire_yes|no, insurer_yes|no, witness_name|phone|relation, apply_year|month|day, applicant_name",
      inputSchema: { values: z.record(z.string(), z.union([z.string(), z.boolean()])).describe("칸 이름 → 값") },
    },
    async ({ values }) => fillAndPack("F_YOYANG_APPLY", values),
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
