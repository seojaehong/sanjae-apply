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
// One row per editor form: slot count (catalog = map), pages, synthetic sample, source PDF route.
const SPECS = {
  F_YOYANG_APPLY: { fields: 74, pages: 4, sample: "test/samples/F_YOYANG_APPLY.json" },
  F_UNPAID_CLAIM: { fields: 63, pages: 1, sample: "test/samples/F_UNPAID_CLAIM.json" },
};
const readSample = (id) => JSON.parse(readFileSync(resolve(root, SPECS[id].sample), "utf8"));
/** Opens the editor for a form. The unpaid claim is reached the way a visitor would: check sheet → result row button. */
async function openForm(p, id) {
  if (id !== "F_YOYANG_APPLY") {
    await p.locator(`#sheet label.opt-box:has(input[name=claim][value=UNPAID])`).click();
  }
  await p.locator(`[data-open-editor="${id}"]`).first().click();
  await p.locator("#editor").waitFor({ state: "visible" });
  await p.waitForFunction((n) => document.querySelectorAll("#editor [data-slot]").length === n, SPECS[id].fields);
}
/** Downloads the current editor PDF and compares every page's content stream with the CLI fill of the same values. */
async function assertWebEqualsCli(id, values, tag, message) {
  await page.locator("#editor-download:not([disabled])").waitFor();
  const event = page.waitForEvent("download");
  await page.locator("#editor-download").click();
  const download = await event;
  await download.saveAs(resolve(work, `${tag}-web.pdf`));
  writeFileSync(resolve(work, `${tag}-values.json`), JSON.stringify(values));
  execFileSync(process.execPath, [resolve(root, "dist/src/cli.js"), "fill", id, resolve(work, `${tag}-values.json`), "--out", resolve(work, `${tag}-cli.pdf`)]);
  const web = await pdfContents(resolve(work, `${tag}-web.pdf`));
  assert.equal(web.length, SPECS[id].pages, `${id} 쪽 수`);
  assert.deepEqual(web, await pdfContents(resolve(work, `${tag}-cli.pdf`)), message);
  return download;
}
/** The input-value no-transmission gate: no storage, no cookies, no query, only same-origin static GETs. */
async function assertNoLeak(label) {
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0, `${label}: storage 0`);
  assert.equal((await context.cookies()).length, 0, `${label}: cookie 0`);
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).length), 0, `${label}: IndexedDB 0`);
  assert.equal(new URL(page.url()).search, "", `${label}: 주소에 값이 붙지 않는다`);
  assert.equal(requests.filter((r) => r.method !== "GET" || r.body || new URL(r.url).origin !== new URL(base).origin).length, 0, `${label}: 입력값을 요청으로 보내지 않는다`);
  assert(requests.every((r) => {
    const u = new URL(r.url);
    return !u.search && /^\/(?:$|index\.html$|editor\.css$|app\/[\w.-]+$|data\/forms\.json$|(?:assets|fonts\/ui|img)\/[\w/.-]+$)/.test(u.pathname);
  }), `${label}: 모든 요청은 쿼리 없는 정적 자산 GET이다`);
}
try {
  await page.goto(base, { waitUntil: "networkidle" });
  assert(await page.locator("[data-open-editor]").count() > 0, "요양급여 편집기 진입점이 있어야 한다");
  assert.equal(requests.filter((r) => /\/app\/(editor|fill)\.js|\/assets\//.test(r.url)).length, 0, "첫 화면에 채우기 자산을 받지 않는다");
  assert.equal(requests.filter((r) => new URL(r.url).origin !== new URL(base).origin).length, 0, "웹폰트를 포함해 외부 요청이 없다");
  await openForm(page, "F_YOYANG_APPLY");
  const editor = page.locator("#editor");
  assert.equal(await editor.locator("[data-slot]").count(), 74);
  assert.equal(await page.locator("#editor-title").textContent(), "요양급여신청서 채우기");
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
  await assertNoLeak("F_YOYANG_APPLY");
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
  console.log("PASS editor F_YOYANG_APPLY: 74 fields, exclusive groups, independent questions, preview, downloaded PDF = CLI, reset/close, 390/1440, no storage/external requests/CSP violations");

  // ── F_UNPAID_CLAIM: 63 fields, 1 page, groups decided in phase 3 (unpaid_benefits multi; account_type·compensation·info_consent single).
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const U = "F_UNPAID_CLAIM";
  await openForm(page, U);
  assert.equal(await editor.locator("[data-slot]").count(), 63);
  assert.equal(await page.locator("#editor-title").textContent(), "미지급 보험급여 청구서 채우기");
  assert.deepEqual(await editor.locator("#editor-fields h3").allTextContents(), ["1쪽"], "1쪽짜리 서식은 절이 하나다");
  const unpaidKinds = editor.locator('[data-slot^="unpaid_"]');
  assert.equal(await unpaidKinds.count(), 10);
  assert.deepEqual(new Set(await unpaidKinds.evaluateAll((els) => els.map((e) => e.type))), new Set(["checkbox"]), "미지급 급여 종류 10칸은 복수 선택");
  assert.equal(await editor.locator('input[type=radio]').count(), 6, "단일 선택 칸은 수령계좌 2·확인사항① 2·행정정보 동의 2");
  assert.deepEqual((await editor.locator("[data-clear-group]").evaluateAll((els) => els.map((e) => e.dataset.clearGroup))).sort(), ["account_type", "compensation", "info_consent"]);
  assert.equal((await editor.locator("label:has([data-slot=unpaid_yoyang]) span").textContent()), "요양급여", "화면 라벨 끝의 「( )」는 지운다");
  const uf = (key) => editor.locator(`[data-slot="${key}"]`);
  await uf("unpaid_yoyang").check();
  await uf("unpaid_huyeop").check();
  assert.equal(await uf("unpaid_yoyang").isChecked(), true, "미지급 급여 종류는 여럿 고를 수 있다");
  for (const [group, a, b] of [["account_type", "account_type_normal", "account_type_protected"], ["compensation", "compensation_yes", "compensation_no"], ["info_consent", "info_consent_yes", "info_consent_no"]]) {
    await uf(a).check();
    await uf(b).check();
    assert.equal(await uf(a).isChecked(), false, `${group}: 하나만 선택`);
    await editor.locator(`[data-clear-group=${group}]`).click();
    assert.equal(await uf(b).isChecked(), false, `${group}: 선택을 비워 둘 수 있다`);
  }
  await editor.locator("#editor-reset").click();
  assert.equal(await editor.locator("input:checked").count(), 0);
  // Values actually entered on screen. The 8-box accident date takes 8 digits on screen (the CLI would cut 12 to 8).
  const unpaid = { ...readSample(U), accident_datetime: "20261015" };
  for (const [key, value] of Object.entries(unpaid)) {
    if (typeof value === "boolean") { if (value) await uf(key).check(); }
    else await uf(key).fill(value);
  }
  await page.waitForFunction(() => document.querySelector("#editor-page")?.textContent === "1 / 1쪽");
  await assertWebEqualsCli(U, unpaid, "unpaid-first", "미지급: 입력 화면에서 내려받은 PDF가 같은 값의 CLI 출력과 일치한다(최초값)");
  assert.equal(await editor.locator("#editor-prev").isDisabled(), true, "1쪽 서식: 이전 쪽 비활성");
  assert.equal(await editor.locator("#editor-next").isDisabled(), true, "1쪽 서식: 다음 쪽 비활성");
  assert.equal(await page.evaluate(() => {
    const canvas = document.querySelector("#editor-preview canvas");
    return !!canvas && canvas.width > 100 && canvas.getContext("2d").getImageData(100, 100, 100, 100).data.some((v, i) => i % 4 !== 3 && v < 230);
  }), true, "미지급 미리보기에 실제 PDF 픽셀이 있다");
  if (out) await page.screenshot({ path: resolve(out, "editor-unpaid-desktop.png") });
  await uf("account_type_protected").check();
  await uf("compensation_no").check();
  await uf("unpaid_janghae").check();
  await uf("name").fill("최종확인");
  assert.equal(await editor.locator("#editor-download").isDisabled(), true);
  const unpaidLatest = { ...unpaid, name: "최종확인", account_type_normal: false, account_type_protected: true, compensation_yes: false, compensation_no: true, unpaid_janghae: true };
  const unpaidDownload = await assertWebEqualsCli(U, unpaidLatest, "unpaid-latest", "미지급: 수정값(단일선택 전환·복수선택 추가)이 내려받기에 반영된다");
  assert.equal(unpaidDownload.suggestedFilename(), "미지급 보험급여 청구서.pdf");
  await assertNoLeak(U);
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.locator("#editor-show-preview").click();
  await page.waitForFunction(() => document.querySelector("#editor-preview")?.getAttribute("aria-busy") === "false");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "미지급 390px 넘침 0");
  if (out) await page.screenshot({ path: resolve(out, "editor-unpaid-mobile.png") });
  await editor.locator("#editor-show-inputs").click();
  await page.keyboard.press("Escape");
  await page.locator(`[data-open-editor="${U}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll("#editor [data-slot]").length === 63);
  assert.equal(await uf("name").inputValue(), "", "미지급: 닫은 뒤 값이 남지 않는다");
  assert.equal(await editor.locator("input:checked").count(), 0);
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
  console.log("PASS editor F_UNPAID_CLAIM: 63 fields, 1 page (prev/next disabled), unpaid_benefits checkbox 10, single-choice groups 3 with clear, downloaded PDF = CLI (first + edited), reset/close, 390/1440, no storage/external requests/CSP violations");
  // Negative control: prove that the Report-Only observer actually sees a violation.
  await page.route("https://csp-self-test.invalid/**", (route) => route.fulfill({ body: "", status: 200 }));
  await page.evaluate(() => { const img = document.createElement("img"); img.src = "https://csp-self-test.invalid/probe"; document.body.append(img); });
  await page.waitForFunction(() => window.cspViolations.includes("img-src"));
  console.log("PASS CSP negative control: an injected external image triggers the Report-Only observer");

  // Real fetch failure: no partial/stale PDF download, and retry preserves entered values.
  for (const id of Object.keys(SPECS)) {
    const failurePage = await context.newPage();
    const pdfRoute = `**/assets/forms/bundled/${id}.pdf`;
    await failurePage.route(pdfRoute, (route) => route.abort());
    await failurePage.goto(base, { waitUntil: "networkidle" });
    await openForm(failurePage, id);
    await failurePage.locator("#editor-retry:not([hidden])").waitFor();
    await failurePage.locator('[data-slot="name"]').fill("재시도확인");
    assert.equal(await failurePage.locator("#editor-download").isDisabled(), true);
    await failurePage.unroute(pdfRoute);
    await failurePage.locator("#editor-retry").click();
    await failurePage.locator("#editor-download:not([disabled])").waitFor();
    assert.equal(await failurePage.locator('[data-slot="name"]').inputValue(), "재시도확인");
    await failurePage.close();
    console.log(`PASS editor failure/retry ${id}: download disabled on source-asset failure, entered values retained on successful retry`);
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
