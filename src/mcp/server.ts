// 산재 신청 도우미 MCP 도구 계층 — 전송 무관(원격 Streamable HTTP · 로컬 stdio 둘 다 이 registerTools 를 쓴다).
// 도구 전부 무저장: 입력을 디스크·로그에 남기지 않고 결과만 돌려준다. 승인 가능성은 코어 필터가 막는다.
// 산업재해조사표(고용노동부 제출) 지침·점검·관할 찾기 도구 셋은 읽기 전용 — 문장은 호출한 AI 가 쓰고 도구는 근거·형식·점검·연락처만 준다.
// 원격 형태는 SafeClaw `app/api/mcp/[transport]/implementation.ts`(mcp-handler + withMcpAuth + env 토큰)를 그대로 따랐다.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute } from "node:path";
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
import { describeForm } from "../fill/describe.js";
import { catalogPath, fillableForms, fillableHwpxForms, fontPath, loadAssets, loadHwpxAssets, loadMap, unknownKeys } from "../fill/registry.js";
import { pngInfo } from "../stamp/png.js";
import { buildStamps, resolveStamp } from "../stamp/resolve.js";
import { accidentReportGuide, GUIDE_SECTIONS } from "../accident/guide.js";
import { checkAccidentReport, todayKst } from "../accident/check.js";
import { lookupLaborOffice } from "../accident/jurisdiction.js";
import { packageRoot } from "../fill/registry.js";

export const SERVER_INFO = { name: "sanjae-apply", version: "0.6.0" };

const tri = z.union([z.boolean(), z.literal("UNDECLARED")]).describe("true / false / 'UNDECLARED'(아직 모름 — 질문으로 돌려준다)");

function text(obj: unknown) {
  const s = JSON.stringify(obj, null, 2);
  const hits = findOutcomeLanguage(s);
  if (hits.length) throw new Error(`출력에 승인 가능성·확률 표현이 있어 거부: ${hits.join(", ")}`);
  return { content: [{ type: "text" as const, text: s }] };
}

/** base64 PNG 상한 — 도장은 수십 KB 면 충분하다. 상한이 없으면 압축 폭탄 PNG 가 서버 메모리를 쓴다 */
const PNG_B64_MAX = 2_000_000;
const stampSchema = z
  .object({
    name: z.string().max(20).optional().describe("성명인 이름(2~4자). 본인 또는 명의자 동의가 있는 이름만. 동봉 글꼴(나눔고딕)에 없는 글자(한자 등)는 오류"),
    shape: z.enum(["circle", "square", "ellipse"]).optional(),
    png_base64: z.string().max(PNG_B64_MAX).optional().describe("이미 있는 도장 PNG(투명 배경, 4096px 이하)"),
    spot: z.string().max(200).optional().describe("찍을 자리(쉼표 구분). 기본 = 지도에 있는 신청인 자리 전부(applicant·delegation·consent). 자리 이름은 get_form_catalog(form_id).stamps. 없는 이름은 오류"),
  })
  .optional()
  .describe("도장. PDF·한글(hwpx) 출력 모두 신청인 서명란에 찍는다. 본인 또는 명의자 동의가 있는 이름만. 등록 인감 대용이 아니다(사용인감 성격)");

type StampInput = z.infer<typeof stampSchema>;

const loadFont = () => new Uint8Array(readFileSync(fontPath()));

function stampsFrom(stamp: StampInput, available: string[], font?: Uint8Array): Record<string, Uint8Array> | undefined {
  if (!stamp) return undefined;
  const spec = { name: stamp.name, shape: stamp.shape, png: stamp.png_base64 ? new Uint8Array(Buffer.from(stamp.png_base64, "base64")) : undefined };
  return buildStamps(spec, stamp.spot, available, () => font ?? loadFont());
}

/**
 * 로컬 stdio 전용 — 받은 절대 경로에 직접 쓴다. base64 만 돌려주면 클라이언트(Claude Code)가 그것을 자기 설정 폴더에 두고
 * 작업 폴더로 옮길 때마다 사람 승인이 필요했다(261027 실사용 시험). 덮어쓰지 않고, 확장자가 형식과 다르면 쓰지 않는다.
 */
function writeTo(path: string, ext: string, bytes: Uint8Array): void {
  if (!isAbsolute(path)) throw new Error(`save_to 는 절대 경로여야 한다: ${path}`);
  if (extname(path).toLowerCase() !== ext) throw new Error(`save_to 확장자가 ${ext} 가 아니다: ${path}`);
  const dir = dirname(path);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`save_to 폴더가 없다: ${dir}`);
  if (existsSync(path)) throw new Error(`이미 있는 파일은 덮어쓰지 않는다: ${path}`);
  writeFileSync(path, bytes, { flag: "wx" });
}

/** 결과 묶기 — save_to 가 있으면 파일로 쓰고 경로만, 없으면 base64 리소스를 붙인다 */
function pack(meta: Record<string, unknown>, bytes: Uint8Array, file: { uri: string; mimeType: string; ext: string }, saveTo?: string | undefined) {
  if (saveTo) {
    writeTo(saveTo, file.ext, bytes);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...meta, saved_to: saveTo, bytes: bytes.length }, null, 2) }] };
  }
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(meta, null, 2) },
      { type: "resource" as const, resource: { uri: file.uri, mimeType: file.mimeType, blob: Buffer.from(bytes).toString("base64") } },
    ],
  };
}

const ACCIDENT_REPORT = "F_INDUSTRIAL_ACCIDENT_REPORT";

/**
 * 산업재해조사표 결과에 붙이는 관할 관서 안내 — workplace_address 로 찾고, 건설업 칸(construction_*)에 값이 있으면 건설 전담 과로.
 * labor_office 칸은 고치지 않는다(적은 값과 제안 값을 나란히 보여 줄 뿐).
 */
function laborOfficeFor(formId: string, values: Record<string, string | boolean>): Record<string, unknown> {
  if (formId !== ACCIDENT_REPORT) return {};
  const addr = typeof values.workplace_address === "string" ? values.workplace_address.trim() : "";
  if (!addr) return { labor_office: { status: "NO_ADDRESS", note: "workplace_address(사업장 소재지)를 넣으면 관할 관서·접수 부서·전화·팩스를 함께 돌려준다" } };
  const construction = Object.entries(values).some(([k, v]) => k.startsWith("construction_") && v !== "" && v !== false);
  const lookup = lookupLaborOffice(packageRoot(), addr, construction);
  const written = typeof values.labor_office === "string" && values.labor_office.trim() ? values.labor_office.trim() : null;
  return { labor_office: { ...lookup, slot: { written, suggested: lookup.office?.labor_office_value ?? null } } };
}

async function fillAndPack(formId: string, values: Record<string, string | boolean>, format: "pdf" | "hwpx" = "pdf", stamp?: StampInput, saveTo?: string | undefined) {
  if (format === "hwpx") {
    const { map, hwpx } = loadHwpxAssets(formId);
    const { bytes, report } = await fillHwpx(hwpx, map, { values, stamps: stampsFrom(stamp, Object.keys(map.stamps ?? {})) });
    return pack({ form_id: map.form_id, format: "hwpx", source_sha256: map.source_sha256, report, unknown_keys: unknownKeys(values, map.slots), ...laborOfficeFor(formId, values) }, bytes, { uri: `sanjae-apply://${map.form_id}/filled.hwpx`, mimeType: "application/vnd.hancom.hwpx", ext: ".hwpx" }, saveTo);
  }
  const { map, pdf, font } = loadAssets(formId);
  const { bytes, report } = await fillForm(pdf, map, { fontBytes: font, values, stamps: stampsFrom(stamp, Object.keys(map.stamps ?? {}), font) });
  return pack({ form_id: map.form_id, format: "pdf", source_sha256: map.source_sha256, report, unknown_keys: unknownKeys(values, map.slots), ...laborOfficeFor(formId, values) }, bytes, { uri: `sanjae-apply://${map.form_id}/filled.pdf`, mimeType: "application/pdf", ext: ".pdf" }, saveTo);
}

/** local = 로컬 stdio 서버(npx sanjae-apply mcp). 이때만 save_to(파일로 바로 저장)를 연다 */
export function registerTools(server: McpServer, opts: { local?: boolean } = {}): void {
  const saveTo = (ext: string) =>
    opts.local ? { save_to: z.string().max(1000).optional().describe(`이 PC 에 바로 저장할 절대 경로(${ext}). 주면 base64 대신 저장 경로를 돌려준다. 이미 있는 파일은 덮어쓰지 않는다`) } : {};
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
      title: "서식 정본 대장(근로복지공단 + 고용노동부 산업재해조사표)",
      description:
        "근로복지공단 서식자료실에서 받은 산재보험 서식 13종과, 법제처에서 받은 산업재해조사표(산업안전보건법 시행규칙 별지 제30호서식 — 근로복지공단이 아니라 관할 지방고용노동관서에 내는 서식)의 파일명·개정일·sha256·출처 URL 과, 지금 채울 수 있는 서식(fillable)과 그 칸 이름(slots)·칸 설명(slot_labels, 서식 원문 글자)·도장 자리 이름(stamps). form_id 를 주면 그 서식만. fill_form 전에 이것으로 칸을 고른다.",
      inputSchema: { form_id: z.string().optional().describe("예: F_YOYANG_APPLY") },
    },
    async ({ form_id }) => {
      const cat = JSON.parse(readFileSync(catalogPath(), "utf8")) as { forms: { ids: string[] }[] };
      const forms = form_id ? cat.forms.filter((f) => f.ids.includes(form_id)) : cat.forms;
      const known = form_id ? (FORMS as Record<string, unknown>)[form_id] ?? null : undefined;
      const fillable = fillableForms();
      const fillable_hwpx = fillableHwpxForms();
      const m = form_id && fillable.includes(form_id) ? loadMap(form_id) : undefined;
      const d = m ? describeForm(m, { checkHint: true }) : undefined;
      return text({ form: known, fillable, fillable_hwpx, slots: d?.slots, slot_labels: d?.slot_labels, slot_details: d?.slot_details, stamps: d?.stamps, entries: forms });
    },
  );

  server.registerTool(
    "fill_form",
    {
      title: "서식 채우기(정본 PDF 오버레이 · 한글)",
      description:
        "form_id 의 정본 서식에 값을 넣어 base64 로 돌려준다. format='pdf'(기본)는 정본 PDF 오버레이, format='hwpx'는 한글 문서(한글 2014+ 로 열어 고칠 수 있다). 먼저 get_form_catalog(form_id) 의 slot_labels 로 칸을 고른다(칸 이름은 두 형식이 같다). 서식의 선택지(사업주여부·친인척여부·근로자유형·신청 구분·예/아니오·개인정보 동의 등)는 해당 체크 칸에 true 를 넣어야 찍힌다. 아는 값은 빠짐없이 넣는다. 서버에 저장하지 않는다. 주민번호 등은 보내지 않아도 된다(빈칸으로 남는다). 사용자가 도장·날인·인감을 말하면 stamp 를 넣는다(넣지 않으면 서명란이 빈다). " +
        "F_INDUSTRIAL_ACCIDENT_REPORT(산업재해조사표)는 고용노동부(관할 지방고용노동관서)에 내는 서식이다 — 서술 칸은 get_accident_report_guide 로 쓰고 check_accident_report 로 점검한 뒤 채운다. 칸이 모자란 서술은 칸에 「(별지에 적음)」을 쓰고 끝에 별지 쪽을 붙인다(report.annexed). 도장 기본 자리는 사업주(applicant)이고, 근로자대표 확인란(worker_rep)은 근로자대표 본인 것만 spot='worker_rep' 로 따로 찍는다. 결과의 labor_office 에 workplace_address 로 찾은 관할 관서·접수 부서·전화·팩스·확인방법(find_labor_office 와 같은 내용)과, labor_office 칸에 적은 값·제안 값(slot)을 붙인다.",
      inputSchema: {
        form_id: z.string().describe("예: F_YOYANG_APPLY, F_HUYEOP_CLAIM …"),
        values: z.record(z.string(), z.union([z.string(), z.boolean()])).describe("칸 이름 → 값"),
        format: z.enum(["pdf", "hwpx"]).optional().describe("pdf(기본) 또는 hwpx(한글)"),
        stamp: stampSchema,
        ...saveTo(".pdf 또는 .hwpx — format 과 맞아야 한다"),
      },
    },
    async ({ form_id, values, format, stamp, save_to }: { form_id: string; values: Record<string, string | boolean>; format?: "pdf" | "hwpx" | undefined; stamp?: StampInput | undefined; save_to?: string | undefined }) =>
      fillAndPack(form_id, values, format ?? "pdf", stamp, save_to),
  );

  server.registerTool(
    "get_accident_report_guide",
    {
      title: "산업재해조사표 작성 지침(읽기 전용)",
      description:
        "산업재해조사표(산업안전보건법 시행규칙 별지 제30호서식, 관할 지방고용노동관서 제출)의 제출 의무·기한(발생일부터 1개월)·근로자대표 확인·중대재해 즉시 보고·과태료(시행령 별표 35), 칸별 작성법, 서술 칸(재해발생 개요·원인·재발방지 계획)의 요소·점검표·서식 작성예시, 업종·직업 분류코드 찾는 곳, 자주 틀리는 것, 제출 경로를 근거·확인일과 함께 돌려준다. 문장은 쓰지 않는다 — 호출한 AI 가 사업장이 준 사실로 쓴다. workplace_address 를 주면 관할 관서·접수 부서·전화·팩스 찾기 결과(find_labor_office 와 같은 내용)를 labor_office_lookup 으로 붙인다. 입력을 저장하지 않는다.",
      inputSchema: {
        section: z.enum(GUIDE_SECTIONS).optional().describe("한 절만: duty·penalties·fields·narrative·codes·common_mistakes·submission·jurisdiction. 없으면 전부"),
        workplace_address: z.string().max(200).optional().describe("사업장 소재지(관할 관서 찾기용)"),
        construction: z.boolean().optional().describe("건설업 재해인가(건설 전담 부서가 있는 관서는 그 부서로 안내)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ section, workplace_address, construction }) =>
      text({ ...accidentReportGuide(section), ...(workplace_address ? { labor_office_lookup: lookupLaborOffice(packageRoot(), workplace_address, construction ?? false) } : {}) }),
  );

  server.registerTool(
    "find_labor_office",
    {
      title: "관할 노동관서·산업재해조사표 접수 부서 찾기(읽기 전용)",
      description:
        "사업장 주소로 관할 지방고용노동관서(「고용노동부와 그 소속기관 직제 시행규칙」 별표 1 관할 구역)와 산업재해조사표를 받는 부서의 전화·팩스·부서 주소·출처(고용노동부 누리집 관서 화면)·확인방법(공식 직접 확인 / 두 리서치 일치 / 단일 출처 / 미확인)을 돌려준다. 근로복지공단이 아니다. " +
        "status: CONFIRMED(관서 하나) / CANDIDATES(시도가 빠져 같은 이름 시군구가 여럿이거나 칠곡군 석적읍처럼 법령이 읍·리 단위로 가르는데 주소에 그 단위가 없음 — 하나로 추정하지 않는다) / NOT_FOUND. " +
        "지방청 직할 구역은 접수 과가 확정되지 않아 산재예방감독과(기본)와 광역산재예방감독과(보조) 번호를 함께 주고 confirm_before_submit='제출 전 전화 확인 권장'을 붙인다. 출처가 하나뿐인 팩스(여수지청)도 같은 표시와 확인방법을 낸다. " +
        "labor_office_value 는 서식 「(  )지방고용노동청장(지청장) 귀하」 괄호 값 제안이다(칸에 자동으로 넣지 않는다). 팩스를 보내지 않는다. 직원 성명은 없다. 입력을 저장하지 않는다. 데이터 확인일은 data.checked_at.",
      inputSchema: {
        address: z.string().min(1).max(200).describe("사업장 소재지(도로명·지번). 시도부터 넣으면 정확하다"),
        construction: z.boolean().optional().describe("건설업 재해인가(건설산재예방감독과가 있는 관서는 그 과로 안내)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ address, construction }) => text(lookupLaborOffice(packageRoot(), address, construction ?? false)),
  );

  server.registerTool(
    "check_accident_report",
    {
      title: "산업재해조사표 값 점검(읽기 전용)",
      description:
        "fill_form(form_id='F_INDUSTRIAL_ACCIDENT_REPORT') 에 넣을 values 를 점검한다 — 빈 칸, 하나만 고르는 칸(국적·고용형태·근무형태·발주자), 외국인 체류자격, 업종·직업 코드 자릿수, 날짜와 요일 일치, 24시 범위, 입사일·작성일 앞뒤, 휴업 3일 기준, 사망이면 중대재해 즉시 보고 안내, 근로자대표 확인, 원인 칸 4요인·재발방지 계획 기한·담당 단서, 기한 참고일(발생일부터 1개월, 민법 제157·160조). issues 를 error·warn·info 로 돌려준다. 고치지 않고 판단하지 않는다(산업재해 해당 여부·책임은 다루지 않는다). 입력을 저장하지 않는다.",
      inputSchema: {
        values: z.record(z.string(), z.union([z.string(), z.boolean()])).describe("fill_form 과 같은 칸 이름 → 값"),
        today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("기한 계산 기준일 YYYY-MM-DD(기본 = 오늘, KST)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ values, today }) =>
      text(checkAccidentReport(values, { today: today ?? todayKst(), slotKeys: Object.keys(loadMap("F_INDUSTRIAL_ACCIDENT_REPORT").slots) })),
  );

  server.registerTool(
    "make_seal",
    {
      title: "도장(인영) PNG 만들기",
      description:
        "이름으로 성명인(원형·사각·타원) 또는 법인형(원주 법인명 + 중심 문자 + 하단 부문자) 도장 PNG(투명 배경)를 만들어 base64 로 돌려준다. 본인 또는 명의자 동의가 있는 이름만 쓴다. 등록 인감을 흉내 내는 용도가 아니다(사용인감 성격). fill_form 의 stamp.name 으로 바로 찍을 수도 있다.",
      inputSchema: {
        name: z.string().max(20).optional().describe("성명인 이름(2~4자). 동봉 글꼴(나눔고딕)에 없는 글자(한자 등)는 오류"),
        shape: z.enum(["circle", "square", "ellipse"]).optional().describe("기본 circle"),
        arc_text: z.string().max(40).optional().describe("원주 상단 법인명(있으면 법인형)"),
        center_text: z.string().max(20).optional().describe("중심 문자. 줄바꿈은 \\n"),
        bottom_text: z.string().max(40).optional().describe("원주 하단 부문자(사업자번호 등)"),
        inner_ring: z.number().min(0).max(20).optional().describe("이중선 두께 px"),
        ...saveTo(".png"),
      },
    },
    async (a: { name?: string | undefined; shape?: "circle" | "square" | "ellipse" | undefined; arc_text?: string | undefined; center_text?: string | undefined; bottom_text?: string | undefined; inner_ring?: number | undefined; save_to?: string | undefined }) => {
      const png = resolveStamp({ name: a.name, shape: a.shape, arcText: a.arc_text, centerText: a.center_text?.replace(/\\n/g, "\n"), bottomText: a.bottom_text, innerRing: a.inner_ring }, loadFont());
      const { width, height } = pngInfo(png);
      return pack({ bytes: png.length, width, height, note: "본인 또는 명의자 동의가 있는 이름만. 등록 인감 대용이 아니다." }, png, { uri: "sanjae-apply://seal.png", mimeType: "image/png", ext: ".png" }, a.save_to);
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

/** 토큰 없이 허용하는 JSON-RPC 메서드 — 무엇을 하는 서버인지 보는 데까지만(MCP 규격 허용).
 *  도구 실행(tools/call) 등 나머지는 전부 토큰이 있어야 한다. 목록 사이트(mcptry·Glama)의 점검용. */
export const PUBLIC_METHODS = new Set(["initialize", "notifications/initialized", "ping", "tools/list"]);

async function isPublicIntrospection(req: Request): Promise<boolean> {
  if (req.method !== "POST" || req.headers.get("authorization")) return false;
  try {
    const body: unknown = JSON.parse(await req.clone().text());
    const msgs = Array.isArray(body) ? body : [body];
    return msgs.length > 0 && msgs.every((m) => !!m && typeof m === "object" && PUBLIC_METHODS.has(String((m as { method?: unknown }).method)));
  } catch {
    return false;
  }
}

export function createHandler(basePath = "/api/mcp") {
  const base = createMcpHandler(registerTools, { serverInfo: SERVER_INFO }, { basePath, maxDuration: 60, verboseLogs: false });
  const authed = withMcpAuth(base, verifyToken, { required: true });
  return async (req: Request) => ((await isPublicIntrospection(req)) ? base(req) : authed(req));
}
