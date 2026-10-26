#!/usr/bin/env node
// sanjae-apply <급여> [--accident WORK_ACCIDENT|COMMUTE|DISEASE] [--third-party yes|no] [--ended yes|no] [--tags NOISE_HEARING_LOSS,SPINE_OR_NERVE,JOINT,DEVICE] [--have A_MEDICAL_RECORDS,...] [--json]
// 값은 어디에도 저장하지 않는다. 표준출력으로만 낸다.

import { buildPackage } from "./core/run.js";
import { CLAIM_TYPES, TAGS, type ClaimInput, type ClaimType, type Tag, type Tri } from "./core/types.js";

function tri(v: string | undefined): Tri {
  if (v === undefined) return "UNDECLARED";
  if (/^(y|yes|true|1)$/i.test(v)) return true;
  if (/^(n|no|false|0)$/i.test(v)) return false;
  return "UNDECLARED";
}

export function parseArgs(argv: string[]): { input: ClaimInput; json: boolean } {
  const [claimArg, ...rest] = argv;
  if (!claimArg || !(CLAIM_TYPES as readonly string[]).includes(claimArg)) {
    throw new Error(`급여 종류를 주십시오: ${CLAIM_TYPES.join(" | ")}`);
  }
  const opt: Record<string, string> = {};
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--json") json = true;
    else if (a.startsWith("--")) opt[a.slice(2)] = rest[++i] ?? "";
  }
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
  return { input, json };
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

const isMain = process.argv[1] && /cli\.(js|ts)$/.test(process.argv[1]);
if (isMain) {
  try {
    const { input, json } = parseArgs(process.argv.slice(2));
    const pkg = buildPackage(input);
    process.stdout.write((json ? JSON.stringify(pkg, null, 2) : render(pkg)) + "\n");
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(2);
  }
}
