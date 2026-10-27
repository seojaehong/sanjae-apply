// 로컬 stdio MCP 실측 — Claude Desktop·Cursor 가 설정 파일의 command/args 로 띄우는 것과 같은 명령을 그대로 띄워
// 공식 SDK 클라이언트로 initialize → tools/list → 도구 5개를 전부 부른다. 값은 전부 합성이다.
// 사용: node scripts/e2e_mcp_stdio.mjs <out_dir> <command> [args...]
//   예(윈도우 Desktop 설정과 같음): node scripts/e2e_mcp_stdio.mjs out cmd /c npx -y sanjae-apply mcp
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [outDir, command, ...args] = process.argv.slice(2);
if (!outDir || !command) {
  console.error("사용: node scripts/e2e_mcp_stdio.mjs <out_dir> <command> [args...]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) fails++;
};
const t0 = Date.now();
const client = new Client({ name: "sanjae-e2e-stdio", version: "0.0.1" });
await client.connect(new StdioClientTransport({ command, args, stderr: "inherit" }));
const sv = client.getServerVersion();
ok(sv?.name === "sanjae-apply", `initialize ${sv?.name} ${sv?.version} (${((Date.now() - t0) / 1000).toFixed(1)}초, 명령: ${[command, ...args].join(" ")})`);

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
ok(tools.join() === "fill_form,fill_yoyang_apply,get_form_catalog,list_required_forms,make_seal", `tools/list ${tools.length}: ${tools.join(", ")}`);

const call = (name, a) => client.callTool({ name, arguments: a });
const json = (r) => JSON.parse(r.content[0].text);

const req = json(await call("list_required_forms", { claim: "YOYANG", accidentKind: "COMMUTE", thirdParty: true, treatmentEnded: false }));
ok(["S-01", "S-02", "S-03"].every((r) => req.rules_applied.includes(r)), `list_required_forms 출퇴근·제3자 → ${req.rules_applied.join(" ")}, 필수 서식 ${req.forms.filter((f) => f.status === "REQUIRED").length}`);

const cat = json(await call("get_form_catalog", { form_id: "F_YOYANG_APPLY" }));
ok(cat.entries[0].revised === "2026-07-07" && cat.slots?.length > 0, `get_form_catalog F_YOYANG_APPLY 개정 ${cat.entries[0].revised}, 칸 ${cat.slots?.length}, 도장 자리 ${(cat.stamps ?? []).join(",")}`);

const seal = await call("make_seal", { name: "홍길동" });
const sealMeta = json(seal);
writeFileSync(join(outDir, "mcp_seal.png"), Buffer.from(seal.content[1].resource.blob, "base64"));
ok(sealMeta.width === 480, `make_seal ${sealMeta.width}×${sealMeta.height}`);

const values = { name: "홍길동", claim_kind_accident: true, apply_year: "2026" };
const pdf = await call("fill_form", { form_id: "F_YOYANG_APPLY", values, stamp: { name: "홍길동" } });
writeFileSync(join(outDir, "mcp_yoyang.pdf"), Buffer.from(pdf.content[1].resource.blob, "base64"));
ok(JSON.stringify(json(pdf).report.stamped) === '["applicant","delegation","consent"]', `fill_form PDF + 도장 → stamped ${json(pdf).report.stamped}`);

const hx = await call("fill_form", { form_id: "F_YOYANG_APPLY", values, format: "hwpx", stamp: { png_base64: seal.content[1].resource.blob, spot: "applicant" } });
writeFileSync(join(outDir, "mcp_yoyang.hwpx"), Buffer.from(hx.content[1].resource.blob, "base64"));
ok(JSON.stringify(json(hx).report.stamped) === '["applicant"]', `fill_form 한글 + 가진 PNG → stamped ${json(hx).report.stamped}`);

// 로컬 save_to — 절대 경로에 바로 쓴다(v0.5.3~). 이미 있으면 덮어쓰지 않는다
const saveTo = resolve(outDir, "mcp_saved.pdf");
if (existsSync(saveTo)) rmSync(saveTo);
const saved = await call("fill_form", { form_id: "F_YOYANG_APPLY", values, stamp: { name: "홍길동" }, save_to: saveTo });
ok(!saved.isError && json(saved).saved_to === saveTo && readFileSync(saveTo).subarray(0, 5).toString() === "%PDF-", `fill_form save_to → ${saveTo}`);
const again = await call("fill_form", { form_id: "F_YOYANG_APPLY", values, save_to: saveTo });
ok(again.isError === true, "save_to 이미 있는 파일 → isError(덮어쓰지 않음)");

const legacy = await call("fill_yoyang_apply", { values });
ok(Buffer.from(legacy.content[1].resource.blob, "base64").subarray(0, 5).toString() === "%PDF-", "fill_yoyang_apply(v0.1 호환) PDF");

const bad = await call("fill_form", { form_id: "F_YOYANG_APPLY", values, stamp: { name: "洪吉童" } });
ok(bad.isError === true, `한자 이름 도장 → isError (${bad.content[0].text.slice(0, 40)})`);

await client.close();
console.log(`합계 ${fails ? "실패 " + fails : "전부 통과"}`);
process.exit(fails ? 1 : 0);
