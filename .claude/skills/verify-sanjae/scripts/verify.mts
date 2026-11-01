// verify-sanjae 도우미 — 산재 신청 도우미 안내 페이지(웹)를 사용자처럼 돌려 증거를 남긴다.
// 실행(저장소 루트에서, 먼저 npm.cmd run build && npm.cmd run build:web):
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts list
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts serve                       # 로컬 정적 서버만 띄워 둔다(Ctrl+C 로 내린다)
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts doctor [--base <URL>]       # --base 없으면 로컬 서버를 띄웠다 내린다
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON .claude/skills/verify-sanjae/scripts/verify.mts drive --feature <id|all> [--base <URL>] [--run <이름>]
// 합성 값만 쓴다(test/samples). 증거 = artifacts/verify-sanjae/<run>/ (cleanup 이 지우지 않는다).
// 판정 재사용: 편집기 게이트 scripts/verify_web_editor.mjs · 채우기 게이트 scripts/verify_web_fill.mjs 를 URL=<base> 로 자식 프로세스 호출한다.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PDFDocument } from "pdf-lib";

const PROD = "https://sanjae-apply.vercel.app";
const TOKEN_FILE = path.join(os.homedir(), ".config", "sanjae-apply", "mcp_token.txt");
const EDITOR_SPECS: Record<string, { fields: number; pages: number; title: string; file: string }> = {
  F_YOYANG_APPLY: { fields: 74, pages: 4, title: "요양급여신청서 채우기", file: "요양급여신청서.pdf" },
  F_UNPAID_CLAIM: { fields: 63, pages: 1, title: "미지급 보험급여 청구서 채우기", file: "미지급 보험급여 청구서.pdf" },
};
const KEY_ASSETS = [
  "app/main.js", "app/engine.js", "app/editor.js", "app/fill.js", "app/pdf.worker.min.mjs", "editor.css", "data/forms.json",
  "assets/fonts/NanumGothic-Regular.ttf", "assets/fonts/OFL.txt",
  "assets/forms/bundled/F_YOYANG_APPLY.pdf", "assets/forms/maps/F_YOYANG_APPLY.json",
  "assets/forms/bundled/F_UNPAID_CLAIM.pdf", "assets/forms/maps/F_UNPAID_CLAIM.json",
];
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".pdf": "application/pdf", ".ttf": "font/ttf", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};

type Status = "PASS" | "FAIL" | "SKIP";
type Check = { name: string; ok: boolean; got: unknown; want?: unknown; note?: string };
type Report = {
  feature: string; base: string; mode: "local" | "external"; startedAt: string; finishedAt?: string;
  doctor?: unknown; checks: Check[]; consoleErrors: string[]; requests: { url: string; method: string; status?: number }[];
  artifacts: string[]; reviewWordContexts: string[]; skipped?: string; status?: Status;
};
type Ctx = {
  root: string; base: string; local: boolean; page: Page; context: BrowserContext; report: Report; outDir: string; doctor: DoctorResult;
  check: (name: string, got: unknown, want?: unknown, note?: string) => boolean;
  shot: (label: string, target?: Page) => Promise<void>;
  scan: (label: string, text: string) => Promise<void>;
  skip: (reason: string) => void;
  gate: (script: string) => Promise<void>;
};
type Feature = { title: string; browser: boolean; run: (ctx: Ctx) => Promise<void> };

const FEATURES: Record<string, Feature> = {
  check: { title: "신청 전 확인표 → 결과 숫자·명령줄 = CLI check", browser: true, run: driveCheck },
  "editor-yoyang": { title: "요양급여신청서 편집기(첫 화면 단추) → PDF 4쪽 + 게이트", browser: true, run: driveEditorYoyang },
  "editor-unpaid": { title: "미지급 보험급여 청구서 편집기(확인표 결과 단추) → PDF 1쪽 + 게이트", browser: true, run: driveEditorUnpaid },
  mcp: { title: "원격 MCP 드라이런(scripts/mcp_dryrun.mjs, 토큰 필요)", browser: false, run: driveMcp },
};

function parseArgs(argv: string[]) {
  const [command = "help", ...rest] = argv;
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith("--")) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) { options[rest[i].slice(2)] = next; i += 1; } else options[rest[i].slice(2)] = "1";
  }
  return { command, options };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function repoRoot(): string {
  const root = process.cwd();
  if (!fs.existsSync(path.join(root, "web", "editor.ts")) || !fs.existsSync(path.join(root, "scripts", "verify_web_editor.mjs"))) {
    throw new Error(`저장소 루트에서 실행해야 한다(현재 ${root}). 예: cd <sanjae-apply> && node .claude/skills/verify-sanjae/scripts/verify.mts …`);
  }
  return root;
}

// ── Launch: build:web 산출 public/ 을 vercel.json 의 "/" 머리글(CSP Report-Only·Referrer-Policy)과 함께 서빙한다.
async function launch(root: string): Promise<{ base: string; server: Server }> {
  const pub = path.join(root, "public");
  const routes = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")).headers as { source: string; headers: { key: string; value: string }[] }[];
  const pageHeaders = Object.fromEntries((routes.find((r) => r.source === "/")?.headers ?? []).map((h) => [h.key, h.value]));
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
    const file = path.resolve(pub, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(pub + path.sep)) { res.writeHead(403).end(); return; }
    let body: Buffer;
    try { body = fs.readFileSync(file); } catch { res.writeHead(404).end(); return; }
    const extra = file.endsWith(`${path.sep}index.html`) ? pageHeaders : {};
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", ...extra });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${port}`, server };
}

async function stop(server: Server | null): Promise<void> {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
}

// ── Doctor(읽기 전용): 빌드 산출 · 주요 자산 200 · 첫 화면 계약 · 이 배포가 가진 편집기 서식.
type DoctorResult = { ok: boolean; problems: string[]; editorForms: string[]; detail: Record<string, unknown> };
async function doctor(root: string, base: string, local: boolean): Promise<DoctorResult> {
  const problems: string[] = [];
  const detail: Record<string, unknown> = { base, mode: local ? "local" : "external" };
  if (local) {
    const need = ["dist/src/cli.js", "public/index.html", "public/app/main.js", "public/data/forms.json"];
    const missing = need.filter((f) => !fs.existsSync(path.join(root, f)));
    if (missing.length) problems.push(`빌드 산출 없음: ${missing.join(", ")} → npm.cmd run build && npm.cmd run build:web`);
    detail.packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  }
  const home = await fetch(`${base}/`, { cache: "no-store" }).catch((e: unknown) => ({ status: 0, text: async () => String(e), headers: new Headers() }) as unknown as Response);
  const html = await home.text();
  // 첫 화면의 편집기 입구. 4단계 판 = data-open-editor="F_YOYANG_APPLY"·「요양급여신청서 PDF 채우기」, 3단계 판(261031 운영) = 값 없는 data-open-editor·「요양급여 PDF 채우기」.
  const editorEntries = [...html.matchAll(/<button\b[^>]*\bdata-open-editor(?:="([^"]*)")?[^>]*>([^<]*)</gu)].map((m) => ({ form: m[1] ?? "(값 없음)", text: m[2].trim() }));
  const externalRefs = [...html.matchAll(/<(?:script|img|iframe|link)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"/gu)].map((m) => m[1]);
  const home$ = {
    status: home.status,
    bytes: html.length,
    version: /data-version>([^<]+)</u.exec(html)?.[1] ?? null,
    sheetForm: /<form id="sheet"/u.test(html),
    result: /id="result"/u.test(html),
    cliLine: /id="cli-line"/u.test(html),
    editorDialog: /<dialog[^>]*id="editor"|id="editor"/u.test(html),
    editorEntries,
    externalResourceRefs: externalRefs,
    cspReportOnly: home.headers.get("content-security-policy-report-only") ? "있음" : "없음",
  };
  detail.home = home$;
  if (home.status !== 200) problems.push(`첫 화면 HTTP ${home.status}`);
  if (!home$.sheetForm || !home$.result || !home$.cliLine) problems.push("첫 화면 계약: form#sheet·#result·#cli-line 중 빠진 것이 있다");
  if (!editorEntries.length) problems.push("첫 화면에 편집기 입구 단추(data-open-editor)가 없다");
  if (externalRefs.length) problems.push(`첫 화면 외부 출처 자원 ${externalRefs.length}건: ${externalRefs.join(", ")}`);
  if (local && home$.version && home$.version !== detail.packageVersion) problems.push(`페이지 버전 ${home$.version} ≠ package.json ${detail.packageVersion as string}`);
  const assets: Record<string, number> = {};
  for (const asset of KEY_ASSETS) {
    const r = await fetch(`${base}/${asset}`, { method: "HEAD", cache: "no-store" }).catch(() => ({ status: 0 }) as Response);
    assets[asset] = r.status;
    if (r.status !== 200) problems.push(`자산 ${asset} HTTP ${r.status}`);
  }
  detail.assets = assets;
  let editorForms: string[] = [];
  const mainJs = await fetch(`${base}/app/main.js`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  editorForms = [...new Set(mainJs.match(/F_[A-Z_]+/gu) ?? [])].sort();
  detail.editorForms = editorForms;
  const formsJson = await fetch(`${base}/data/forms.json`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { version?: string; forms?: unknown[]; total_slots?: number } | null;
  detail.formsJson = formsJson ? { version: formsJson.version, forms: formsJson.forms?.length, total_slots: formsJson.total_slots } : null;
  if (!editorForms.includes("F_YOYANG_APPLY")) problems.push("app/main.js 에 편집기 서식 F_YOYANG_APPLY 가 없다");
  return { ok: problems.length === 0, problems, editorForms, detail };
}

function printDoctor(d: DoctorResult): void {
  console.log(JSON.stringify(d.detail, null, 2));
  for (const p of d.problems) console.log(`PROBLEM ${p}`);
  console.log(`DOCTOR ${d.ok ? "OK" : "FAIL"} — 편집기 서식 ${d.editorForms.join(", ") || "없음"}`);
}

// ── 판정 도구
let cliFilter: ((text: string) => string[]) | null = null;
async function loadWords(root: string) {
  const words = await import(pathToFileURL(path.join(root, "scripts", "forbidden_words.mjs")).href) as { FORBIDDEN: RegExp; REVIEW_WORDS: RegExp };
  if (!cliFilter) {
    const filter = await import(pathToFileURL(path.join(root, "dist", "src", "core", "filter.js")).href) as { findOutcomeLanguage: (t: string) => string[] };
    cliFilter = filter.findOutcomeLanguage;
  }
  return { ...words, findOutcomeLanguage: cliFilter };
}

/** 자식 프로세스를 비동기로 돌린다. spawnSync 는 이 프로세스의 정적 서버까지 멈춰 게이트가 첫 화면을 못 받는다(실측). */
function run(cmd: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }, timeoutMs: number): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => { stdout += d; });
    child.stderr.setEncoding("utf8").on("data", (d: string) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (status) => { clearTimeout(timer); done({ status, stdout, stderr }); });
  });
}

function makeCtx(root: string, base: string, local: boolean, page: Page, context: BrowserContext, report: Report, outDir: string, doctorResult: DoctorResult, gateCache: Map<string, boolean>): Ctx {
  let shotIndex = 0;
  const check: Ctx["check"] = (name, got, want, note) => {
    const ok = want === undefined ? Boolean(got) : JSON.stringify(got) === JSON.stringify(want);
    report.checks.push({ name, ok, got, want, note });
    console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(got)}${want === undefined ? "" : ` (기대 ${JSON.stringify(want)})`}${note ? ` — ${note}` : ""}`);
    return ok;
  };
  const shot: Ctx["shot"] = async (label, target) => {
    shotIndex += 1;
    const file = path.join(outDir, `${String(shotIndex).padStart(2, "0")}-${label}.jpg`);
    await (target ?? page).screenshot({ path: file, type: "jpeg", quality: 55 });
    report.artifacts.push(path.relative(root, file));
  };
  const scan: Ctx["scan"] = async (label, text) => {
    const words = await loadWords(root);
    const outcome = words.findOutcomeLanguage(text);
    check(`${label} 금지어(src/core/filter.ts 승인 가능성·확률)`, outcome.length, 0, outcome.join(","));
    const service = text.match(new RegExp(words.FORBIDDEN.source, "gu")) ?? [];
    check(`${label} 금지어(scripts/forbidden_words.mjs 서비스 문구)`, service.length, 0, service.slice(0, 5).join(","));
    const contexts: string[] = [];
    for (const m of text.matchAll(new RegExp(words.REVIEW_WORDS.source, "gu"))) {
      const at = m.index ?? 0;
      contexts.push(text.slice(Math.max(0, at - 15), at + 15).replace(/\s+/gu, " "));
    }
    report.reviewWordContexts.push(...contexts.map((c) => `${label}: ${c}`));
    const agent = (text.match(/대리인/gu) ?? []).length;
    console.log(`INFO ${label} 검토어 ${contexts.length}건(보고만, report.md 에 문맥) · 「대리인」 ${agent}건(공단 원문 칸 이름, 예외)`);
  };
  const skip: Ctx["skip"] = (reason) => { report.skipped = reason; console.log(`SKIP ${report.feature}: ${reason}`); };
  // 기존 게이트를 그대로 호출한다. 같은 실행 안에서 두 번 부르지 않는다(all 에서 편집기 두 기능이 같은 게이트를 쓴다).
  const gate: Ctx["gate"] = async (script) => {
    const log = path.join(outDir, `gate-${path.basename(script, ".mjs")}.txt`);
    if (gateCache.has(script)) {
      check(`게이트 ${script}(같은 실행에서 이미 돌림)`, gateCache.get(script), true);
      return;
    }
    const evidence = path.join(outDir, `gate-${path.basename(script, ".mjs")}`);
    const env = { ...process.env, URL: `${base}/`, EVIDENCE_DIR: evidence };
    console.log(`GATE node ${script} (URL=${base}/) …`);
    const r = await run(process.execPath, [path.join(root, script)], { cwd: root, env }, 600_000);
    fs.writeFileSync(log, `$ URL=${base}/ EVIDENCE_DIR=${path.relative(root, evidence)} node ${script}\nexit ${r.status}\n\n${r.stdout ?? ""}\n${r.stderr ?? ""}`, "utf8");
    report.artifacts.push(path.relative(root, log));
    if (fs.existsSync(evidence)) for (const f of fs.readdirSync(evidence)) report.artifacts.push(path.relative(root, path.join(evidence, f)));
    const passLines = (r.stdout ?? "").split("\n").filter((l) => l.startsWith("PASS")).length;
    const ok = r.status === 0;
    gateCache.set(script, ok);
    check(`게이트 ${script} exit 0`, r.status, 0, `PASS 줄 ${passLines} · 로그 ${path.relative(root, log)}${ok ? "" : ` · ${(r.stderr ?? "").trim().split("\n").slice(-3).join(" / ")}`}`);
  };
  return { root, base, local, page, context, report, outDir, doctor: doctorResult, check, shot, scan, skip, gate };
}

async function overflow390(ctx: Ctx, label: string): Promise<void> {
  await ctx.page.setViewportSize({ width: 390, height: 844 });
  const wide = await ctx.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ctx.check(`${label} 390px 가로 넘침`, wide > 0 ? wide : 0, 0);
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

// ── check: 확인표를 사용자처럼 골라 화면 숫자·명령줄이 같은 입력의 CLI 결과와 같은지 본다.
async function driveCheck(ctx: Ctx): Promise<void> {
  const { page, base, root, check, shot, scan } = ctx;
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const cases: { claim: string; accidentKind: string; thirdParty: string; treatmentEnded: string; tags: string[] }[] = [
    { claim: "YOYANG", accidentKind: "WORK_ACCIDENT", thirdParty: "no", treatmentEnded: "no", tags: [] },
    { claim: "UNPAID", accidentKind: "COMMUTE", thirdParty: "yes", treatmentEnded: "UNDECLARED", tags: [] },
    { claim: "JANGHAE", accidentKind: "DISEASE", thirdParty: "UNDECLARED", treatmentEnded: "yes", tags: ["NOISE_HEARING_LOSS"] },
  ];
  const sheet = page.locator("#sheet");
  for (const c of cases) {
    for (const [name, value] of [["claim", c.claim], ["accidentKind", c.accidentKind], ["thirdParty", c.thirdParty], ["treatmentEnded", c.treatmentEnded]]) {
      await sheet.locator(`label.opt-box:has(input[name=${name}][value=${value}])`).click();
    }
    for (const box of await sheet.locator("input[name=tags]:checked").all()) await sheet.locator(`label.opt-box:has(input[name=tags][value=${await box.getAttribute("value")})`).click();
    for (const tag of c.tags) await sheet.locator(`label.opt-box:has(input[name=tags][value=${tag}])`).click();
    const cliLine = (await page.locator("#cli-line").textContent())?.trim() ?? "";
    const summary = await page.locator("#result-summary dd").allTextContents();
    const seal = await page.locator("#seal").getAttribute("data-state");
    await shot(`check-${c.claim}`);
    const prefix = "npx -y sanjae-apply check ";
    check(`${c.claim} 명령줄 형식`, cliLine.startsWith(prefix), true, cliLine);
    const args = cliLine.slice(prefix.length).split(/\s+/u).filter(Boolean);
    const r = spawnSync(process.execPath, [path.join(root, "dist/src/cli.js"), "check", ...args, "--json"], { encoding: "utf8" });
    fs.writeFileSync(path.join(ctx.outDir, `cli-check-${c.claim}.json`), r.stdout ?? "", "utf8");
    if (!check(`${c.claim} CLI check exit 0`, r.status, 0, (r.stderr ?? "").slice(0, 200))) continue;
    const pkg = JSON.parse(r.stdout) as { status: string; forms: { status: string }[]; attachments: { status: string }[]; open_confirmations: unknown[] };
    const want = [pkg.forms.filter((f) => f.status !== "NOT_APPLICABLE").length, pkg.attachments.filter((a) => a.status !== "PROVIDED").length, pkg.open_confirmations.length].map(String);
    check(`${c.claim} 화면 숫자(서식·첨부·남은 질문) = CLI`, summary, want);
    check(`${c.claim} 도장 상태 = CLI status`, seal, pkg.status === "READY_TO_SUBMIT" ? "ready" : "open");
    if (c.claim === "UNPAID") {
      const unpaidButton = page.locator('#result [data-open-editor="F_UNPAID_CLAIM"]');
      const has = ctx.doctor.editorForms.includes("F_UNPAID_CLAIM");
      check(`UNPAID 결과의 미지급 편집기 단추 수(이 배포 편집기 서식에 ${has ? "있음" : "없음"})`, await unpaidButton.count(), has ? 1 : 0);
    }
  }
  check("주소에 고른 값이 붙지 않는다", new URL(page.url()).search, "");
  await scan("첫 화면", await bodyText(page));
  await overflow390(ctx, "확인표");
  await shot("check-390");
}

/** 견본 값을 사용자처럼 칸에 넣는다. 상자 수보다 긴 숫자는 화면이 거절하므로 상자 수만큼 고쳐 넣는다(게이트와 같은 사용자 행동). */
async function fillSample(ctx: Ctx, id: string): Promise<Record<string, string | boolean>> {
  const values = JSON.parse(fs.readFileSync(path.join(ctx.root, "test/samples", `${id}.json`), "utf8")) as Record<string, string | boolean>;
  const editor = ctx.page.locator("#editor");
  const refused: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const field = editor.locator(`[data-slot="${key}"]`);
    if (typeof value === "boolean") { if (value) await field.check(); continue; }
    await field.fill(value);
    const boxes = Number(await field.getAttribute("data-boxes"));
    if (boxes && value.length > boxes) {
      refused.push(`${key}: ${value.length}→${boxes}자리, 내려받기 ${await editor.locator("#editor-download").isDisabled() ? "막힘" : "열림"}`);
      values[key] = value.slice(0, boxes);
      await field.fill(values[key] as string);
    }
  }
  if (refused.length) ctx.check(`${id} 자리 수 초과 값은 내려받기를 막는다`, refused.every((r) => r.endsWith("막힘")), true, refused.join(" · "));
  fs.writeFileSync(path.join(ctx.outDir, `${id}-values.json`), JSON.stringify(values, null, 2), "utf8");
  return values;
}

async function editorJourney(ctx: Ctx, id: string): Promise<void> {
  const { page, check, shot, outDir, root } = ctx;
  const spec = EDITOR_SPECS[id];
  const editor = page.locator("#editor");
  await editor.waitFor({ state: "visible" });
  await page.waitForFunction((n) => document.querySelectorAll("#editor [data-slot]").length === n, spec.fields, { timeout: 30_000 }).catch(() => undefined);
  check(`${id} 칸 수`, await editor.locator("[data-slot]").count(), spec.fields);
  check(`${id} 편집기 제목`, await page.locator("#editor-title").textContent(), spec.title);
  await shot(`${id}-open`);
  await fillSample(ctx, id);
  await editor.locator("#editor-download:not([disabled])").waitFor({ timeout: 60_000 });
  check(`${id} 쪽 표시`, (await page.locator("#editor-page").textContent())?.trim(), `1 / ${spec.pages}쪽`);
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#editor-preview canvas");
    return !!canvas && canvas.width > 100 && canvas.getContext("2d")!.getImageData(100, 100, 100, 100).data.some((v, i) => i % 4 !== 3 && v < 230);
  });
  check(`${id} 미리보기에 PDF 픽셀`, painted, true);
  await shot(`${id}-filled-1440`);
  const event = page.waitForEvent("download");
  await editor.locator("#editor-download").click();
  const download = await event;
  const downloads = path.join(outDir, "downloads");
  fs.mkdirSync(downloads, { recursive: true });
  const saved = path.join(downloads, download.suggestedFilename());
  await download.saveAs(saved);
  ctx.report.artifacts.push(path.relative(root, saved));
  check(`${id} 내려받은 파일 이름`, download.suggestedFilename(), spec.file);
  const bytes = fs.readFileSync(saved);
  check(`${id} 내려받은 PDF 머리 %PDF`, bytes.subarray(0, 4).toString("latin1"), "%PDF");
  check(`${id} 내려받은 PDF 쪽 수`, (await PDFDocument.load(bytes)).getPageCount(), spec.pages);
  await ctx.scan(`${id} 편집기`, await editor.innerText());
  await overflow390(ctx, `${id} 편집기`);
  await editor.locator("#editor-show-preview").click();
  await page.waitForFunction(() => document.querySelector("#editor-preview")?.getAttribute("aria-busy") === "false");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${id} 390px 미리보기 가로 넘침`, wide > 0 ? wide : 0, 0);
  await shot(`${id}-preview-390`);
  await editor.locator("#editor-show-inputs").click();
  await page.keyboard.press("Escape");
  check(`${id} 닫힘(Escape)`, await page.evaluate(() => (document.querySelector("#editor") as HTMLDialogElement | null)?.open ?? false), false);
}

async function driveEditorYoyang(ctx: Ctx): Promise<void> {
  const { page, base } = ctx;
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  ctx.check("첫 화면에서 채우기 자산(fill.js·editor.js·assets/)을 받지 않는다", ctx.report.requests.filter((r) => /\/app\/(editor|fill)\.js|\/assets\//u.test(r.url)).length, 0);
  const entry = page.locator('#try > [data-open-editor="F_YOYANG_APPLY"]');
  ctx.check("첫 화면 요양 편집기 단추(4단계 계약) 문구", (await entry.textContent({ timeout: 5_000 }).catch(() => null))?.trim() ?? null, "요양급여신청서 PDF 채우기");
  await entry.click();
  await editorJourney(ctx, "F_YOYANG_APPLY");
  await ctx.gate("scripts/verify_web_fill.mjs");
  await ctx.gate("scripts/verify_web_editor.mjs");
}

async function driveEditorUnpaid(ctx: Ctx): Promise<void> {
  const { page, base } = ctx;
  if (!ctx.doctor.editorForms.includes("F_UNPAID_CLAIM")) {
    ctx.check("이 배포의 편집기 서식에 F_UNPAID_CLAIM", ctx.doctor.editorForms, "F_UNPAID_CLAIM 포함", "미지급 편집기가 없는 판(운영 3단계 등)이다");
    return;
  }
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.locator("#sheet label.opt-box:has(input[name=claim][value=UNPAID])").click();
  const entry = page.locator('#result [data-open-editor="F_UNPAID_CLAIM"]');
  ctx.check("확인표 「미지급 보험급여」 결과의 단추 문구", (await entry.textContent())?.trim(), "여기서 미지급 보험급여 청구서 PDF 채우기");
  await ctx.shot("unpaid-check-result");
  await entry.click();
  await editorJourney(ctx, "F_UNPAID_CLAIM");
  await ctx.gate("scripts/verify_web_editor.mjs");
}

async function driveMcp(ctx: Ctx): Promise<void> {
  if (ctx.local) { ctx.skip("로컬 정적 서버에는 /api(MCP 함수)가 없다. --base <배포 URL> 로만 돈다"); return; }
  if (!fs.existsSync(TOKEN_FILE)) { ctx.skip(`토큰 파일 없음(${TOKEN_FILE})`); return; }
  const url = `${ctx.base}/api/mcp/mcp`;
  const pdf = path.join(ctx.outDir, "mcp_dryrun_filled.pdf");
  const r = spawnSync(process.execPath, [path.join(ctx.root, "scripts/mcp_dryrun.mjs"), url, TOKEN_FILE, pdf], { cwd: ctx.root, encoding: "utf8", timeout: 300_000 });
  const log = path.join(ctx.outDir, "mcp_dryrun.txt");
  fs.writeFileSync(log, `$ node scripts/mcp_dryrun.mjs ${url} <토큰 파일> ${path.relative(ctx.root, pdf)}\nexit ${r.status}\n\n${r.stdout ?? ""}\n${r.stderr ?? ""}`, "utf8");
  ctx.report.artifacts.push(path.relative(ctx.root, log));
  const last = (r.stdout ?? "").trim().split("\n").pop() ?? "";
  ctx.check("mcp_dryrun exit 0", r.status, 0, last);
  ctx.check("mcp_dryrun 마지막 줄 「실패 0」", /^실패 0 \//u.test(last), true, last);
}

function finish(report: Report, outDir: string, root: string): Status {
  report.finishedAt = new Date().toISOString();
  const failed = report.checks.some((c) => !c.ok) || report.consoleErrors.length > 0;
  report.status = failed ? "FAIL" : report.skipped ? "SKIP" : "PASS";
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  const offOrigin = report.requests.filter((r) => new URL(r.url).origin !== new URL(report.base).origin);
  const lines = [
    `# verify-sanjae — ${report.feature} (${report.status})`, "",
    `- base: ${report.base} (${report.mode})`,
    `- 시작 ${report.startedAt} · 끝 ${report.finishedAt}`,
    ...(report.skipped ? [`- 건너뜀: ${report.skipped}`] : []),
    `- 이 여정의 요청 ${report.requests.length}건 · 다른 출처 ${offOrigin.length} · 콘솔 오류 ${report.consoleErrors.length}`,
    `- doctor: ${JSON.stringify(report.doctor)}`, "",
    "## 검사",
    ...report.checks.map((c) => `- ${c.ok ? "OK" : "FAIL"} ${c.name}: ${JSON.stringify(c.got)}${c.want === undefined ? "" : ` (기대 ${JSON.stringify(c.want)})`}${c.note ? ` — ${c.note}` : ""}`),
    "", "## 증거", ...report.artifacts.map((a) => `- ${a}`),
    "", "## 검토어 문맥(보고만)", ...(report.reviewWordContexts.length ? report.reviewWordContexts.map((v) => `- ${v}`) : ["- 없음"]),
    ...(report.consoleErrors.length ? ["", "## 콘솔 오류", ...report.consoleErrors.map((v) => `- ${v}`)] : []),
  ];
  fs.writeFileSync(path.join(outDir, "report.md"), `${lines.join("\n")}\n`, "utf8");
  console.log(`RESULT ${report.feature} ${report.status} — 검사 ${report.checks.filter((c) => c.ok).length}/${report.checks.length}, 콘솔 오류 ${report.consoleErrors.length}${report.skipped ? `, 건너뜀: ${report.skipped}` : ""}`);
  console.log(`EVIDENCE ${path.relative(root, outDir)}`);
  return report.status;
}

async function drive(featureArg: string, baseOption: string | undefined, runName: string | undefined): Promise<number> {
  const root = repoRoot();
  const ids = featureArg === "all" ? Object.keys(FEATURES) : [featureArg];
  const unknown = ids.filter((id) => !FEATURES[id]);
  if (unknown.length) { console.error(`모르는 feature: ${unknown.join(", ")}. 목록: ${Object.keys(FEATURES).join(", ")}, all`); return 2; }
  const runDir = path.join(root, "artifacts", "verify-sanjae", runName ?? `${stamp()}-${featureArg}`);
  fs.mkdirSync(runDir, { recursive: true });
  let server: Server | null = null;
  let browser: Browser | null = null;
  const statuses: Record<string, Status> = {};
  try {
    let base = baseOption?.replace(/\/$/u, "") ?? "";
    const local = !base;
    if (local) {
      const launched = await launch(root);
      server = launched.server;
      base = launched.base;
      console.log(`LAUNCH 준비됨 ${base} (public/ 정적 서빙, 이 프로세스가 띄움)`);
    }
    const d = await doctor(root, base, local);
    printDoctor(d);
    fs.writeFileSync(path.join(runDir, "doctor.json"), JSON.stringify(d, null, 2), "utf8");
    if (!d.ok) { console.log("DOCTOR FAIL — 구동하지 않는다"); return 1; }
    const gateCache = new Map<string, boolean>();
    for (const id of ids) {
      const spec = FEATURES[id];
      const outDir = ids.length > 1 ? path.join(runDir, id) : runDir;
      fs.mkdirSync(outDir, { recursive: true });
      const report: Report = { feature: id, base, mode: local ? "local" : "external", startedAt: new Date().toISOString(), doctor: { editorForms: d.editorForms, version: (d.detail.home as { version: string }).version }, checks: [], consoleErrors: [], requests: [], artifacts: [], reviewWordContexts: [] };
      console.log(`DRIVE ${id} — ${spec.title}`);
      let context: BrowserContext | null = null;
      try {
        let page = null as unknown as Page;
        if (spec.browser) {
          browser ??= await chromium.launch();
          context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
          context.setDefaultTimeout(30_000);
          context.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 200)); });
          context.on("weberror", (e) => report.consoleErrors.push(e.error().message.slice(0, 200)));
          context.on("request", (r) => report.requests.push({ url: r.url(), method: r.method() }));
          context.on("requestfinished", async (r) => {
            const entry = report.requests.findLast((x) => x.url === r.url() && x.status === undefined);
            if (entry) entry.status = (await r.response())?.status() ?? 0;
          });
          page = await context.newPage();
        }
        const ctx = makeCtx(root, base, local, page, context as BrowserContext, report, outDir, d, gateCache);
        await spec.run(ctx);
        if (spec.browser) {
          const origin = new URL(base).origin;
          const off = report.requests.filter((r) => new URL(r.url).origin !== origin || r.method !== "GET");
          ctx.check("이 여정의 요청 = 같은 출처 GET 뿐(입력값 외부 전송 0)", off.map((r) => `${r.method} ${r.url}`), []);
          const bad = report.requests.filter((r) => r.status !== undefined && r.status !== 200);
          ctx.check("이 여정의 응답 = 전부 200", bad.map((r) => `${r.status} ${r.url}`), []);
          ctx.check("콘솔·페이지 오류", report.consoleErrors.length, 0, report.consoleErrors.slice(0, 3).join(" | "));
        }
      } catch (error) {
        report.checks.push({ name: "예외", ok: false, got: String(error).slice(0, 500) });
        console.error("DRIVE 예외:", error);
      } finally {
        await context?.close().catch(() => undefined);
        statuses[id] = finish(report, outDir, root);
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await stop(server);
    console.log(`CLEANUP ${server ? "로컬 정적 서버·" : ""}브라우저 종료(이 프로세스가 띄운 것만). 증거는 남김: ${path.relative(root, runDir)}`);
  }
  const values = Object.values(statuses);
  const overall: Status = values.length < ids.length || values.includes("FAIL") ? "FAIL" : values.every((s) => s === "SKIP") ? "SKIP" : "PASS";
  console.log(`RESULT ${overall} — ${Object.entries(statuses).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`EVIDENCE ${path.relative(root, runDir)}`);
  return overall === "FAIL" ? 1 : 0;
}

async function main(): Promise<number> {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "list") {
    for (const [id, spec] of Object.entries(FEATURES)) console.log(`${id}\t${spec.title}`);
    console.log("all\t위 전부(편집기 게이트는 한 번만 돈다)");
    return 0;
  }
  if (command === "doctor") {
    const root = repoRoot();
    let server: Server | null = null;
    let base = options.base?.replace(/\/$/u, "") ?? "";
    try {
      if (!base) { const l = await launch(root); server = l.server; base = l.base; console.log(`LAUNCH 준비됨 ${base}`); }
      const d = await doctor(root, base, !options.base);
      printDoctor(d);
      return d.ok ? 0 : 1;
    } finally {
      if (server) { await stop(server); console.log("CLEANUP 로컬 정적 서버 종료"); }
    }
  }
  if (command === "serve") {
    const root = repoRoot();
    const { base, server } = await launch(root);
    console.log(`LAUNCH 준비됨 ${base} — Ctrl+C 로 내린다. 다른 창에서 drive --feature <id> --base ${base}`);
    await new Promise<void>((done) => process.once("SIGINT", () => done()));
    await stop(server);
    console.log("CLEANUP 로컬 정적 서버 종료");
    return 0;
  }
  if (command === "drive") {
    if (!options.feature) { console.error("drive 는 --feature <id|all> 가 필요하다. list 로 목록을 본다."); return 2; }
    return drive(options.feature, options.base, options.run);
  }
  console.log(`사용법: verify.mts list | serve | doctor [--base URL] | drive --feature <id|all> [--base URL] [--run 이름]   (운영 ${PROD})`);
  return 2;
}

process.exitCode = await main();
