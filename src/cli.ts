#!/usr/bin/env node
// sanjae-apply — 산재 신청 도우미 CLI
//   sanjae-apply check <급여> [--accident WORK_ACCIDENT|COMMUTE|DISEASE] [--third-party yes|no] [--ended yes|no] [--tags A,B] [--have X,Y] [--json]
//   sanjae-apply fill <FORM_ID> <values.json> --out <파일.pdf>
//   sanjae-apply catalog [FORM_ID]
//   sanjae-apply mcp            (stdio MCP 서버 — Claude Desktop/Code 설정에 넣는다)
// 값은 어디에도 저장하지 않는다. fill 은 --out 파일로만 쓴다. (구버전 호환: 첫 인자가 급여 종류면 check 로 본다)

import { readFileSync, writeFileSync } from "node:fs";
import { buildPackage } from "./core/run.js";
import { CLAIM_TYPES, TAGS, type ClaimInput, type ClaimType, type Tag, type Tri } from "./core/types.js";
import { fillForm } from "./fill/overlay.js";
import { catalogPath, fillableForms, loadAssets, loadMap } from "./fill/registry.js";

function tri(v: string | undefined): Tri {
  if (v === undefined) return "UNDECLARED";
  if (/^(y|yes|true|1)$/i.test(v)) return true;
  if (/^(n|no|false|0)$/i.test(v)) return false;
  return "UNDECLARED";
}

function opts(rest: string[]): { opt: Record<string, string>; flags: Set<string> } {
  const opt: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith("--")) continue;
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) flags.add(a.slice(2));
    else opt[a.slice(2)] = rest[++i]!;
  }
  return { opt, flags };
}

export function parseCheck(argv: string[]): { input: ClaimInput; json: boolean } {
  const [claimArg, ...rest] = argv;
  if (!claimArg || !(CLAIM_TYPES as readonly string[]).includes(claimArg)) {
    throw new Error(`급여 종류를 주십시오: ${CLAIM_TYPES.join(" | ")}`);
  }
  const { opt, flags } = opts(rest);
  const accident = opt["accident"];
  const input: ClaimInput = {
    claim: claimArg as ClaimType,
    accidentKind: accident === "WORK_ACCIDENT" || accident === "COMMUTE" || accident === "DISEASE" ? accident : "UNDECLARED",
    thirdParty: tri(opt["third-party"]),
    treatmentEnded: tri(opt["ended"]),
  };
  if (opt["have"]) input.have = opt["have"].split(",").map((s) => s.trim()).filter(Boolean);
  if (opt["tags"]) {
    const tags = opt["tags"].split(",").map((s) => s.trim()).filter((t): t is Tag => (TAGS as readonly string[]).includes(t));
    if (tags.length) input.tags = tags;
  }
  return { input, json: flags.has("json") };
}

export function render(pkg: ReturnType<typeof buildPackage>): string {
  const lines: string[] = [];
  lines.push(`[${pkg.claim}] 패키지 상태: ${pkg.status}  (READY_TO_SUBMIT 은 제출 가능이지 승인이 아닙니다)`);
  lines.push("", "서식");
  for (const f of pkg.forms) {
    const cond = f.condition ? `  — ${f.condition}` : "";
    lines.push(`  ${f.status.padEnd(14)} ${f.title}${cond}`);
    for (const b of f.basis) lines.push(`      근거: ${b.cite}`);
  }
  lines.push("", "첨부");
  for (const a of pkg.attachments) {
    const sub = a.substitute ? `  — 대체: ${a.substitute}` : "";
    lines.push(`  ${a.status.padEnd(14)} ${a.title}${sub}`);
  }
  if (pkg.open_confirmations.length) {
    lines.push("", "답이 필요한 질문");
    for (const c of pkg.open_confirmations) lines.push(`  - ${c.question} (영향: ${c.affects.join(", ")})`);
  }
  if (pkg.notes.length) {
    lines.push("", "절차 안내");
    for (const n of pkg.notes) lines.push(`  - ${n}`);
  }
  lines.push("", `적용 규칙: ${pkg.rules_applied.join(", ")}`);
  return lines.join("\n");
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (cmd === "mcp") {
    const { runStdio } = await import("./mcp/stdio.js");
    await runStdio();
    return;
  }
  if (cmd === "catalog") {
    const id = rest[0];
    const cat = JSON.parse(readFileSync(catalogPath(), "utf8")) as { forms: { ids: string[] }[] };
    const entries = id ? cat.forms.filter((f) => f.ids.includes(id)) : cat.forms;
    const out = { fillable: fillableForms(), slots: id && fillableForms().includes(id) ? Object.keys(loadMap(id).slots) : undefined, entries };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  if (cmd === "fill") {
    const [formId, valuesPath] = rest;
    const { opt } = opts(rest);
    if (!formId || !valuesPath || !opt["out"]) throw new Error("사용: sanjae-apply fill <FORM_ID> <values.json> --out <파일.pdf>");
    const values = JSON.parse(readFileSync(valuesPath, "utf8")) as Record<string, string | boolean>;
    const { map, pdf, font } = loadAssets(formId);
    const { bytes, report } = await fillForm(pdf, map, { fontBytes: font, values });
    writeFileSync(opt["out"], bytes);
    process.stdout.write(JSON.stringify({ out: opt["out"], form_id: map.form_id, written: report.written.length, skipped: report.skipped, shrunk: report.shrunk }, null, 2) + "\n");
    return;
  }
  const checkArgs = cmd === "check" ? rest : argv; // 구버전: 첫 인자가 급여 종류
  if (!checkArgs[0] || checkArgs[0] === "--help" || checkArgs[0] === "-h") {
    process.stdout.write(
      [
        "sanjae-apply — 산재 신청 도우미",
        "  check <급여> [--accident WORK_ACCIDENT|COMMUTE|DISEASE] [--third-party yes|no] [--ended yes|no] [--tags A,B] [--have X,Y] [--json]",
        "  fill <FORM_ID> <values.json> --out <파일.pdf>",
        "  catalog [FORM_ID]",
        "  mcp   (stdio MCP 서버)",
        `급여: ${CLAIM_TYPES.join(" ")}`,
        `채울 수 있는 서식: ${fillableForms().join(" ") || "(없음)"}`,
      ].join("\n") + "\n",
    );
    return;
  }
  const { input, json } = parseCheck(checkArgs);
  const pkg = buildPackage(input);
  process.stdout.write((json ? JSON.stringify(pkg, null, 2) : render(pkg)) + "\n");
}

const isMain = process.argv[1] && /(cli\.(js|ts)|sanjae-apply)$/.test(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(2);
  });
}
