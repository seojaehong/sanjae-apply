// 브라우저 채우기(public/app/fill.js)가 CLI 와 같은 PDF 를 만드는지, 그동안 밖으로 나간 요청이 없는지 본다(웹편집기 2단계 게이트).
// ① 안내 페이지 첫 로드는 채우기 자산(fill.js·assets/)을 받지 않는다
// ② 견본 값 + 도장 「홍길동」으로 브라우저에서 채운 PDF 와 CLI 출력이 쪽별 내용 스트림·그림(도장) 픽셀까지 같다
//    pdf-lib 글꼴 부분집합 이름·날짜·ID 는 실행마다 달라서 바이트가 아니라 풀어낸 내용으로 비교한다
// ③ 채우는 동안의 요청이 전부 같은 출처의 정적 자산(app/fill.js · assets/**)뿐이다 — 입력값이 밖으로 나가지 않는다
// 사용: npm run build && npm run build:web && node scripts/verify_web_fill.mjs     (운영: URL=https://sanjae-apply.vercel.app/ node …)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "public");
const FORMS = ["F_YOYANG_APPLY", "F_HUYEOP_CLAIM"];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".pdf": "application/pdf", ".ttf": "font/ttf", ".txt": "text/plain", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
const srv = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    const b = readFileSync(join(pub, p === "/" ? "index.html" : p));
    res.writeHead(200, { "content-type": types[extname(p) || ".html"] ?? "application/octet-stream" });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const base = process.env.URL || `http://localhost:${srv.address().port}/`;
const origin = new URL(base).origin;

async function digest(bytes) {
  const doc = await PDFDocument.load(bytes);
  const decode = (st) => (st instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(st).decode()) : Buffer.alloc(0));
  const pages = doc.getPages().map((pg) => {
    const c = pg.node.Contents();
    const arr = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const raw = arr.map((st) => decode(st).toString("latin1")).join("\n").replace(/\/F\w+/g, "/F");
    return createHash("sha256").update(raw, "latin1").digest("hex");
  });
  const images = doc.context
    .enumerateIndirectObjects()
    .map(([, o]) => o)
    .filter((o) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))
    .map((o) => createHash("sha256").update(decode(o)).digest("hex"))
    .sort();
  return { pages, images };
}

let fail = 0;
const check = (ok, msg) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const requests = [];
page.on("request", (r) => requests.push(r.url()));
await page.goto(base, { waitUntil: "networkidle" });
const landing = requests.filter((u) => /\/app\/fill\.js|\/assets\//.test(u));
check(landing.length === 0, `① 첫 로드 요청 ${requests.length}건 중 채우기 자산 ${landing.length}건${landing.length ? ` — ${landing.join(", ")}` : ""}`);

const tmp = mkdtempSync(join(tmpdir(), "sanjae-webfill-"));
for (const id of FORMS) {
  const values = JSON.parse(readFileSync(join(root, "test/samples", `${id}.json`), "utf8"));
  requests.length = 0;
  const b64 = await page.evaluate(async ([id, values]) => {
    const m = await import(new URL("app/fill.js", location.href).href);
    const { bytes } = await m.fillPdf(id, values, { stamp: { name: "홍길동" } });
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, [id, values]);
  const web = new Uint8Array(Buffer.from(b64, "base64"));
  const out = join(tmp, `${id}.pdf`);
  execFileSync(process.execPath, [join(root, "dist/src/cli.js"), "fill", id, join(root, "test/samples", `${id}.json`), "--out", out, "--stamp", "홍길동"], { encoding: "utf8" });
  const [a, b] = await Promise.all([digest(web), digest(new Uint8Array(readFileSync(out)))]);
  const samePages = a.pages.length === b.pages.length && a.pages.every((h, i) => h === b.pages[i]);
  const sameImages = a.images.length === b.images.length && a.images.every((h, i) => h === b.images[i]);
  check(samePages && sameImages && a.images.length > 0, `② ${id}: 쪽 ${a.pages.length} 내용 ${samePages ? "같음" : "다름"} · 그림 ${a.images.length} ${sameImages ? "같음" : "다름"} (브라우저 ${web.length.toLocaleString()}B / CLI ${readFileSync(out).length.toLocaleString()}B)`);
  const outside = requests.filter((u) => new URL(u).origin !== origin || !/\/(app\/fill\.js|assets\/[\w/.-]+)$/.test(new URL(u).pathname));
  check(outside.length === 0, `③ ${id}: 채우는 동안 요청 ${requests.length}건, 정적 자산 밖 ${outside.length}건${outside.length ? ` — ${outside.join(", ")}` : ""}`);
}
await browser.close();
srv.close();
console.log(fail ? `실패 ${fail}` : "실패 0");
process.exit(fail ? 1 : 0);
