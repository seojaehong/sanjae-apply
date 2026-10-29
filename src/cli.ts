#!/usr/bin/env node
// sanjae-apply — 산재 신청 도우미 CLI
//   sanjae-apply check <급여> [--accident WORK_ACCIDENT|COMMUTE|DISEASE] [--third-party yes|no] [--ended yes|no] [--tags A,B] [--have X,Y] [--json]
//   sanjae-apply fill <FORM_ID> <values.json> --out <파일.pdf>
//   sanjae-apply catalog [FORM_ID]
//   sanjae-apply mcp            (stdio MCP 서버 — Claude Desktop/Code 설정에 넣는다)
// 값은 어디에도 저장하지 않는다. fill 은 --out 파일로만 쓴다. (구버전 호환: 첫 인자가 급여 종류면 check 로 본다)

import { readFileSync, writeFileSync } from "node:fs";
import { buildPackage } from "./core/run.js";
import { normalizeInput } from "./core/input.js";
import { CLAIM_TYPES, type ClaimInput } from "./core/types.js";
import { fillHwpx } from "./fill/hwpx.js";
import { fillForm } from "./fill/overlay.js";
import { describeForm } from "./fill/describe.js";
import { catalogPath, fillableForms, fillableHwpxForms, fontPath, loadAssets, loadHwpxAssets, loadMap, unknownKeys } from "./fill/registry.js";
import { pngInfo } from "./stamp/png.js";
import { buildStamps, resolveStamp, type StampSpec } from "./stamp/resolve.js";
import type { SealShape } from "./stamp/seal.js";

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
  const { opt, flags } = opts(rest);
  const input = normalizeInput({
    claim: claimArg,
    accident: opt["accident"],
    thirdParty: opt["third-party"],
    ended: opt["ended"],
    tags: opt["tags"]?.split(","),
    have: opt["have"]?.split(","),
  });
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
    const m = id && fillableForms().includes(id) ? loadMap(id) : undefined;
    const d = m ? describeForm(m) : undefined;
    const out = { fillable: fillableForms(), fillable_hwpx: fillableHwpxForms(), slots: d?.slots, slot_labels: d?.slot_labels, slot_details: d?.slot_details, stamps: d?.stamps, entries };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }
  if (cmd === "fill") {
    const [formId, valuesPath] = rest;
    const { opt, flags } = opts(rest);
    if (!formId || !valuesPath || !opt["out"]) throw new Error("사용: sanjae-apply fill <FORM_ID> <values.json> --out <파일.pdf | 파일.hwpx>");
    const values = JSON.parse(readFileSync(valuesPath, "utf8")) as Record<string, string | boolean>;
    // 도장: --stamp 이름(성명인 생성) 또는 --stamp-png 파일. 자리는 지도의 신청인 자리 전부(applicant·delegation·consent), --stamp-spot a,b 로 바꿈. PDF·한글 공통
    for (const k of ["stamp", "stamp-png", "stamp-spot", "stamp-shape"]) if (flags.has(k)) throw new Error(`--${k} 에 값이 없다`);
    if (opt["stamp"] && opt["stamp-png"]) throw new Error("--stamp 과 --stamp-png 는 하나만 준다");
    const spec: StampSpec | undefined = opt["stamp"] || opt["stamp-png"] ? { name: opt["stamp"], shape: opt["stamp-shape"] as SealShape | undefined, png: opt["stamp-png"] ? new Uint8Array(readFileSync(opt["stamp-png"])) : undefined } : undefined;
    const stampsFor = (available: string[], font?: Uint8Array) => buildStamps(spec, opt["stamp-spot"], available, () => font ?? new Uint8Array(readFileSync(fontPath())));
    if (opt["out"].toLowerCase().endsWith(".hwpx")) {
      // 한글 출력 — 공단 HWP 를 변환한 hwpx 에 값을 넣는다(한글 없이 돈다. 한글 2014+ 로 연다)
      const { map, hwpx } = loadHwpxAssets(formId);
      const { bytes, report } = await fillHwpx(hwpx, map, { values, stamps: stampsFor(Object.keys(map.stamps ?? {})) });
      writeFileSync(opt["out"], bytes);
      process.stdout.write(JSON.stringify({ out: opt["out"], form_id: map.form_id, format: "hwpx", filled: report.filled.length, skipped: report.skipped, stamped: report.stamped, stamps_skipped: report.stamps_skipped, unknown_keys: unknownKeys(values, map.slots) }, null, 2) + "\n");
      return;
    }
    const { map, pdf, font } = loadAssets(formId);
    const stamps = stampsFor(Object.keys(map.stamps ?? {}), font);
    const { bytes, report } = await fillForm(pdf, map, { fontBytes: font, values, stamps });
    writeFileSync(opt["out"], bytes);
    process.stdout.write(JSON.stringify({ out: opt["out"], form_id: map.form_id, format: "pdf", written: report.written.length, skipped: report.skipped, shrunk: report.shrunk, stamped: report.stamped, stamps_skipped: report.stamps_skipped, unknown_keys: unknownKeys(values, map.slots) }, null, 2) + "\n");
    return;
  }
  if (cmd === "seal") {
    // 도장 PNG 만 만든다. 사용: seal --out 도장.png --name 홍길동 [--shape circle|square|ellipse] [--arc 법인명 --center 대표자인 --bottom 사업자번호 --inner 2]
    const { opt } = opts(rest);
    if (!opt["out"] || !(opt["name"] || opt["center"] || opt["arc"])) throw new Error("사용: sanjae-apply seal --out <도장.png> --name <이름> [--shape circle|square|ellipse] [--arc <법인명> --center <중심문자> --bottom <부문자> --inner <두께>]");
    const png = resolveStamp(
      { name: opt["name"], shape: opt["shape"] as SealShape | undefined, arcText: opt["arc"], centerText: opt["center"]?.replace(/\\n/g, "\n"), bottomText: opt["bottom"], innerRing: opt["inner"] ? Number(opt["inner"]) : undefined },
      new Uint8Array(readFileSync(fontPath())),
    );
    writeFileSync(opt["out"], png);
    const { width, height } = pngInfo(png);
    process.stdout.write(JSON.stringify({ out: opt["out"], bytes: png.length, width, height, note: "본인 또는 명의자 동의가 있는 이름만. 등록 인감 대용이 아니다." }, null, 2) + "\n");
    return;
  }
  const checkArgs = cmd === "check" ? rest : argv; // 구버전: 첫 인자가 급여 종류
  if (!checkArgs[0] || checkArgs[0] === "--help" || checkArgs[0] === "-h") {
    process.stdout.write(
      [
        "sanjae-apply — 산재 신청 도우미",
        "  check <급여> [--accident WORK_ACCIDENT|COMMUTE|DISEASE] [--third-party yes|no] [--ended yes|no] [--tags A,B] [--have X,Y] [--json]",
        "  fill <FORM_ID> <values.json> --out <파일.pdf | 파일.hwpx>   (확장자로 PDF/한글 결정)",
        "       [--stamp <이름> | --stamp-png <도장.png>] [--stamp-shape circle|square|ellipse] [--stamp-spot applicant,consent]   (PDF·한글 날인. 기본 = 신청인 자리 전부, 자리 이름은 catalog <FORM_ID> 의 stamps)",
        "  seal --out <도장.png> --name <이름> [--shape circle|square|ellipse] [--arc <법인명> --center <중심문자> --bottom <부문자> --inner <두께>]",
        "  catalog [FORM_ID]",
        "  mcp   (stdio MCP 서버)",
        `급여: ${CLAIM_TYPES.join(" ")}`,
        `PDF 로 채울 수 있는 서식: ${fillableForms().join(" ") || "(없음)"}`,
        `한글(hwpx)로 채울 수 있는 서식: ${fillableHwpxForms().join(" ") || "(없음)"}`,
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
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  });
}
