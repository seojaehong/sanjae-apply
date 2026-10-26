// 운영 MCP 서버를 공식 SDK 클라이언트(StreamableHTTP)로 붙어 도구 3개를 전부 드라이런한다.
// 사용: node scripts/mcp_dryrun.mjs [URL] [토큰파일] [출력PDF]
// 토큰은 파일에서만 읽고 출력하지 않는다. 값은 전부 합성이다.
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.argv[2] ?? "https://sanjae-apply.vercel.app/api/mcp/mcp";
const TOKEN = readFileSync(process.argv[3] ?? `${process.env.USERPROFILE}/.config/sanjae-apply/mcp_token.txt`, "utf8").trim();
const OUT = process.argv[4] ?? "dryrun_filled.pdf";

const client = new Client({ name: "sanjae-dryrun", version: "0.0.1" });
const transport = new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } });
await client.connect(transport);
const sv = client.getServerVersion();
console.log(`연결: ${sv?.name} ${sv?.version} @ ${URL_}`);

const tools = (await client.listTools()).tools;
console.log(`tools/list: ${tools.length} → ${tools.map((t) => t.name).join(", ")}`);

const parse = (r) => JSON.parse(r.content[0].text);
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) fails++; };

// 1) list_required_forms — 급여 9종 × 분기
const base = { accidentKind: "WORK_ACCIDENT", thirdParty: false, treatmentEnded: false };
const cases = [
  ["YOYANG 업무상·제3자없음", { ...base, claim: "YOYANG" }, (p) => p.rules_applied.join() === "S-01,S-11" && p.forms.filter((f) => f.status === "REQUIRED").length === 2],
  ["YOYANG 출퇴근·제3자", { ...base, claim: "YOYANG", accidentKind: "COMMUTE", thirdParty: true }, (p) => ["S-01", "S-02", "S-03"].every((r) => p.rules_applied.includes(r)) && p.forms.filter((f) => f.status === "REQUIRED").length === 4],
  ["YOYANG 분기 UNDECLARED → 질문 2", { ...base, claim: "YOYANG", accidentKind: "UNDECLARED", thirdParty: "UNDECLARED" }, (p) => p.open_confirmations.length === 2 && p.forms.filter((f) => f.status === "CONDITIONAL").length === 2],
  ["YOYANG have 첨부 → PROVIDED", { ...base, claim: "YOYANG", have: ["A_MEDICAL_RECORDS", "A_MEDICAL_OPINION"] }, (p) => p.attachments.every((a) => a.status === "PROVIDED") && p.status === "READY_TO_SUBMIT"],
  ["HUYEOP", { ...base, claim: "HUYEOP" }, (p) => p.rules_applied.includes("S-06") && /평균임금.*정정/.test(p.notes.join())],
  ["CARE_TRANSPORT_DEVICE 기본", { ...base, claim: "CARE_TRANSPORT_DEVICE" }, (p) => p.forms.find((f) => f.id === "F_DEVICE_PRESCRIPTION").status === "CONDITIONAL"],
  ["CARE_TRANSPORT_DEVICE 보조기 태그", { ...base, claim: "CARE_TRANSPORT_DEVICE", tags: ["DEVICE"] }, (p) => p.forms.find((f) => f.id === "F_DEVICE_PRESCRIPTION").status === "REQUIRED"],
  ["JANGHAE 기본", { ...base, claim: "JANGHAE" }, (p) => p.rules_applied.includes("S-09") && /능동/.test(p.notes.join())],
  ["JANGHAE 소음성 난청", { ...base, claim: "JANGHAE", tags: ["NOISE_HEARING_LOSS"] }, (p) => p.rules_applied.includes("S-10") && p.forms.find((f) => f.id === "F_NOISE_WORK_CERT").status === "REQUIRED" && /확진/.test(p.attachments.find((a) => a.id === "A_DISABILITY_DIAG").substitute)],
  ["JANGHAE 척추·신경", { ...base, claim: "JANGHAE", tags: ["SPINE_OR_NERVE"] }, (p) => p.forms.find((f) => f.id === "F_LIMB_OPINION").status === "REQUIRED"],
  ["YUJOK", { ...base, claim: "YUJOK" }, (p) => p.rules_applied.includes("S-04") && p.attachments.some((a) => a.id === "A_DEATH_CERT")],
  ["UNPAID", { ...base, claim: "UNPAID" }, (p) => p.rules_applied.includes("S-08")],
  ["ADDITIONAL_DISEASE", { ...base, claim: "ADDITIONAL_DISEASE" }, (p) => p.rules_applied.includes("S-12") && JSON.stringify(p).includes("제49조")],
  ["RE_YOYANG", { ...base, claim: "RE_YOYANG" }, (p) => p.rules_applied.includes("S-13") && JSON.stringify(p).includes("시행규칙 제31조")],
  ["SELF_PAY 치료종결", { ...base, claim: "SELF_PAY", treatmentEnded: true }, (p) => p.attachments.some((a) => a.id === "A_ACCIDENT_NARRATIVE")],
  ["SELF_PAY 환급", { ...base, claim: "SELF_PAY", treatmentEnded: false }, (p) => p.attachments.some((a) => a.id === "A_RECEIPTS")],
  ["SELF_PAY UNDECLARED → 질문", { ...base, claim: "SELF_PAY", treatmentEnded: "UNDECLARED" }, (p) => p.open_confirmations.length === 1],
];
for (const [name, args, check] of cases) {
  const r = await client.callTool({ name: "list_required_forms", arguments: args });
  const p = r.isError ? null : parse(r);
  const banned = /승인\s*가능|확률|적중/.test(JSON.stringify(r));
  ok(p && check(p) && !banned, `list_required_forms ${name}${r.isError ? " (isError)" : ""}`);
}
// 잘못된 입력 → isError(도구 오류)로 돌아와야 한다
const bad = await client.callTool({ name: "list_required_forms", arguments: { claim: "NOPE", accidentKind: "COMMUTE", thirdParty: false, treatmentEnded: false } }).catch((e) => ({ isError: true, err: String(e) }));
ok(bad.isError === true, `list_required_forms 잘못된 claim → 오류 응답`);

// 2) get_form_catalog
const all = parse(await client.callTool({ name: "get_form_catalog", arguments: {} }));
ok(all.entries.length === 13 && all.entries.reduce((n, e) => n + e.files.length, 0) === 26, `get_form_catalog 전체 13 게시글 26 파일`);
const one = parse(await client.callTool({ name: "get_form_catalog", arguments: { form_id: "F_YOYANG_APPLY" } }));
ok(one.entries.length === 1 && one.entries[0].revised === "2026-07-07" && one.form?.id === "F_YOYANG_APPLY", `get_form_catalog F_YOYANG_APPLY = 2026-07-07`);
const none = parse(await client.callTool({ name: "get_form_catalog", arguments: { form_id: "F_NOPE" } }));
ok(none.entries.length === 0 && none.form === null, `get_form_catalog 없는 id → 빈 목록`);

// 3) fill_yoyang_apply — 합성 값 전체
const values = JSON.parse(readFileSync(new URL("../test/samples/F_YOYANG_APPLY.json", import.meta.url), "utf8"));
const f = await client.callTool({ name: "fill_yoyang_apply", arguments: { values } });
const rep = parse(f);
const blob = f.content[1]?.resource?.blob;
const pdf = blob ? Buffer.from(blob, "base64") : null;
ok(rep.report?.written?.length === 30 && rep.report.skipped.length === 5 && rep.report.shrunk.length === 0, `fill_yoyang_apply 30칸 기록·5칸 건너뜀·축소 0`);
// 원본 523KB 를 pdf-lib 가 다시 저장하면 객체 스트림 압축으로 더 작아진다(운영 실측 491KB). 하한은 100KB.
ok(pdf && pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 100000, `fill_yoyang_apply PDF ${pdf?.length ?? 0} B`);
if (pdf) writeFileSync(OUT, pdf);
const empty = parse(await client.callTool({ name: "fill_yoyang_apply", arguments: { values: {} } }));
ok(empty.report.written.length === 0 && empty.report.skipped.length === 35, `fill_yoyang_apply 빈 값 → 전부 건너뜀`);

// 4) fill_form — 범용 채우기(요양급여 외 서식)
const hy = JSON.parse(readFileSync(new URL("../test/samples/F_HUYEOP_CLAIM.json", import.meta.url), "utf8"));
const ff = await client.callTool({ name: "fill_form", arguments: { form_id: "F_HUYEOP_CLAIM", values: hy } });
const ffr = ff.isError ? null : parse(ff);
ok(ffr && ffr.report.written.length === 30 && ff.content[1]?.resource?.blob?.startsWith("JVBERi"), `fill_form F_HUYEOP_CLAIM 30칸 PDF`);
const cat2 = parse(await client.callTool({ name: "get_form_catalog", arguments: {} }));
ok(Array.isArray(cat2.fillable) && cat2.fillable.length === 12, `get_form_catalog fillable 12종 (${cat2.fillable?.length})`);

await client.close();
console.log(`\n실패 ${fails} / 검사 ${cases.length + 9}`);
process.exit(fails ? 1 : 0);
