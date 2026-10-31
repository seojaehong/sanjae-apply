// Synthetic browser UI drive. No real claimant data is used or logged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const root = resolve(import.meta.dirname, "..");
const pub = resolve(root, "public");
const out = process.env.EVIDENCE_DIR;
if (out) mkdirSync(out, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".pdf": "application/pdf", ".woff2": "font/woff2" };
const headers = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")).headers;
const server = createServer((req, res) => {
  const path = resolve(pub, `.${decodeURIComponent(new URL(req.url, "http://local").pathname === "/" ? "/index.html" : new URL(req.url, "http://local").pathname)}`);
  if (!path.startsWith(pub + sep)) { res.writeHead(403).end(); return; }
  const pageHeaders = path.endsWith(`${sep}index.html`) ? Object.fromEntries(headers.find((h) => h.source === "/").headers.map((h) => [h.key, h.value])) : {};
  try { res.writeHead(200, { "content-type": mime[extname(path)] ?? "application/octet-stream", ...pageHeaders }); res.end(readFileSync(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = process.env.URL ?? `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("request", (request) => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
await page.addInitScript(() => {
  window.cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => window.cspViolations.push(event.effectiveDirective));
});
const work = out ?? mkdtempSync(resolve(tmpdir(), "sanjae-editor-"));
async function pdfContents(path) {
  const doc = await PDFDocument.load(readFileSync(path));
  return doc.getPages().map((pg) => {
    const c = pg.node.Contents();
    const arr = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const raw = arr.map((st) => st instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(st).decode()).toString("latin1") : "").join("\n").replace(/\/F\w+/g, "/F");
    return createHash("sha256").update(raw, "latin1").digest("hex");
  });
}
try {
  await page.goto(base, { waitUntil: "networkidle" });
  assert(await page.locator("[data-open-editor]").count() > 0, "요양급여 편집기 진입점이 있어야 한다");
  assert.equal(requests.filter((r) => /\/app\/(editor|fill)\.js|\/assets\//.test(r.url)).length, 0, "첫 화면에 채우기 자산을 받지 않는다");
  assert.equal(requests.filter((r) => new URL(r.url).origin !== new URL(base).origin).length, 0, "웹폰트를 포함해 외부 요청이 없다");
  await page.locator("[data-open-editor]").first().click();
  const editor = page.locator("#editor");
  await editor.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelectorAll("#editor [data-slot]").length === 74);
  assert.equal(await editor.locator("[data-slot]").count(), 74);
  const field = (key) => editor.locator(`[data-slot="${key}"]`);
  await field("employer_relation_none").check();
  await field("employer_relation_actual").check();
  assert.equal(await field("employer_relation_none").isChecked(), false);
  await field("worker_type_employee").check();
  await field("worker_type_labor_provider").check();
  assert.equal(await field("worker_type_employee").isChecked(), false);
  await field("police_yes").check();
  await field("fire_no").check();
  assert.equal(await field("police_yes").isChecked(), true, "질문 간 선택이 섞이지 않는다");
  await editor.locator("[data-clear-group=police]").click();
  assert.equal(await field("police_yes").isChecked(), false, "선택을 비워 둘 수 있다");
  const sample = JSON.parse(readFileSync(resolve(root, "test/samples/F_YOYANG_APPLY.json"), "utf8"));
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === "boolean") { if (value) await field(key).check(); }
    else await field(key).fill(value);
  }
  await editor.locator("#editor-download:not([disabled])").waitFor();
  await field("rrn").fill("900101-1234567");
  await editor.locator("#editor-download:not([disabled])").waitFor();
  assert.equal(await page.evaluate(() => {
    const canvas = document.querySelector("#editor-preview canvas");
    return !!canvas && canvas.width > 100 && canvas.getContext("2d").getImageData(100, 100, 100, 100).data.some((v, i) => i % 4 !== 3 && v < 230);
  }), true, "미리보기에 실제 PDF 픽셀이 있다");
  if (out) await page.screenshot({ path: resolve(out, "editor-desktop.png") });
  const downloadEvent = page.waitForEvent("download");
  await editor.locator("#editor-download").click();
  const download = await downloadEvent;
  await download.saveAs(resolve(work, "synthetic-yoyang.pdf"));
  assert(download.suggestedFilename().endsWith(".pdf"));
  execFileSync(process.execPath, [resolve(root, "dist/src/cli.js"), "fill", "F_YOYANG_APPLY", resolve(root, "test/samples/F_YOYANG_APPLY.json"), "--out", resolve(work, "cli-yoyang.pdf")]);
  assert.deepEqual(await pdfContents(resolve(work, "synthetic-yoyang.pdf")), await pdfContents(resolve(work, "cli-yoyang.pdf")), "입력 화면에서 내려받은 PDF가 같은 값의 CLI 출력과 일치한다");
  await editor.locator("#editor-next").click();
  await page.waitForFunction(() => document.querySelector("#editor-page")?.textContent?.includes("2 / 4"));
  await field("consent_sensitive_no").check();
  assert.equal(await field("consent_sensitive_yes").isChecked(), false);
  await editor.locator("#editor-download:not([disabled])").waitFor();
  // A rapid final edit must not leave a stale download enabled.
  await field("name").fill("최종확인");
  assert.equal(await editor.locator("#editor-download").isDisabled(), true);
  await editor.locator("#editor-download:not([disabled])").waitFor();
  const latest = { ...sample, name: "최종확인", consent_sensitive_yes: false, consent_sensitive_no: true };
  writeFileSync(resolve(work, "latest-values.json"), JSON.stringify(latest));
  const latestEvent = page.waitForEvent("download");
  await editor.locator("#editor-download").click();
  await (await latestEvent).saveAs(resolve(work, "latest-web.pdf"));
  execFileSync(process.execPath, [resolve(root, "dist/src/cli.js"), "fill", "F_YOYANG_APPLY", resolve(work, "latest-values.json"), "--out", resolve(work, "latest-cli.pdf")]);
  assert.deepEqual(await pdfContents(resolve(work, "latest-web.pdf")), await pdfContents(resolve(work, "latest-cli.pdf")), "마지막 편집값과 단일선택 해제가 내려받기에 반영된다");
  await field("rrn").fill("12345678901234");
  assert.equal(await editor.locator("#editor-download").isDisabled(), true, "자리 수 초과를 조용히 잘라 내지 않는다");
  await field("rrn").fill("900101-1234567");
  await editor.locator("#editor-download:not([disabled])").waitFor();
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.equal((await context.cookies()).length, 0);
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0);
  assert.equal(new URL(page.url()).search, "");
  assert.equal(requests.filter((r) => r.method !== "GET" || r.body || new URL(r.url).origin !== new URL(base).origin).length, 0, "입력값을 요청으로 보내지 않는다");
  assert(requests.every((r) => {
    const u = new URL(r.url);
    return !u.search && /^\/(?:$|index\.html$|editor\.css$|app\/[\w.-]+$|data\/forms\.json$|(?:assets|fonts\/ui|img)\/[\w/.-]+$)/.test(u.pathname);
  }), "모든 요청은 쿼리 없는 정적 자산 GET이다");
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.locator("#editor-show-preview").click();
  await page.waitForFunction(() => document.querySelector("#editor-preview")?.getAttribute("aria-busy") === "false");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (out) await page.screenshot({ path: resolve(out, "editor-mobile.png") });
  await editor.locator("#editor-show-inputs").click();
  await editor.locator("#editor-reset").click();
  assert.equal(await field("name").inputValue(), "");
  assert.equal(await editor.locator("input:checked").count(), 0);
  await page.keyboard.press("Escape");
  await page.locator("[data-open-editor]").first().click();
  assert.equal(await field("name").inputValue(), "", "닫은 뒤 값이 남지 않는다");
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
  console.log("PASS editor: 74 fields, exclusive groups, independent questions, preview, downloaded PDF = CLI, reset/close, 390/1440, no storage/external requests/CSP violations");
  // Negative control: prove that the Report-Only observer actually sees a violation.
  await page.route("https://csp-self-test.invalid/**", (route) => route.fulfill({ body: "", status: 200 }));
  await page.evaluate(() => { const img = document.createElement("img"); img.src = "https://csp-self-test.invalid/probe"; document.body.append(img); });
  await page.waitForFunction(() => window.cspViolations.includes("img-src"));
  console.log("PASS CSP negative control: an injected external image triggers the Report-Only observer");

  // Real fetch failure: no partial/stale PDF download, and retry preserves entered values.
  const failurePage = await context.newPage();
  await failurePage.route("**/assets/forms/bundled/F_YOYANG_APPLY.pdf", (route) => route.abort());
  await failurePage.goto(base, { waitUntil: "networkidle" });
  await failurePage.locator("[data-open-editor]").first().click();
  await failurePage.locator("#editor-retry:not([hidden])").waitFor();
  await failurePage.locator('[data-slot="name"]').fill("재시도확인");
  assert.equal(await failurePage.locator("#editor-download").isDisabled(), true);
  await failurePage.unroute("**/assets/forms/bundled/F_YOYANG_APPLY.pdf");
  await failurePage.locator("#editor-retry").click();
  await failurePage.locator("#editor-download:not([disabled])").waitFor();
  assert.equal(await failurePage.locator('[data-slot="name"]').inputValue(), "재시도확인");
  await failurePage.close();
  console.log("PASS editor failure/retry: download disabled on source-asset failure, entered values retained on successful retry");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
