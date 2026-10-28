// 안내 페이지가 읽는 서식 데이터 → public/data/forms.json
// 숫자를 HTML 에 손으로 적지 않으려고 만든다. 나중 웹 편집기도 이 파일(칸 이름·종류·설명)을 입력 모델로 쓴다.
// 사용: npm run build 뒤 node scripts/build_web_data.mjs  (dist/src/core/catalog.js 의 서식 제목을 쓴다)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const { FORMS } = await import(new URL("../dist/src/core/catalog.js", import.meta.url).href);
const { describeForm } = await import(new URL("../dist/src/fill/describe.js", import.meta.url).href);

const pkg = read("package.json");
const catalog = read("forms/catalog.json");
const revisedOf = (id) => catalog.forms.find((f) => f.ids.includes(id)) ?? null;

const forms = readdirSync(path.join(root, "forms/maps"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((id) => existsSync(path.join(root, "forms/bundled", `${id}.pdf`)))
  .map((id) => {
    const map = read(`forms/maps/${id}.json`);
    const hwpxMap = `forms/hwpx_maps/${id}.json`;
    const hwpx = existsSync(path.join(root, hwpxMap)) && existsSync(path.join(root, "forms/hwpx", `${id}.hwpx`));
    const src = revisedOf(id);
    const d = describeForm(map);
    return {
      id,
      title: FORMS[id]?.title ?? id,
      revised: src?.revised ?? null,
      source_url: src?.view_url ?? null,
      pdf: true,
      hwpx,
      stamps: d.stamps,
      slots: d.slot_details, // key·kind·label·page + boxes(자리 수)·group(체크 라벨 앞말, 하나만 고르는 묶음이라는 뜻은 아니다)
    };
  })
  .sort((a, b) => b.slots.length - a.slots.length);

const out = {
  version: pkg.version,
  generated_from: "forms/maps · forms/hwpx_maps · forms/catalog.json",
  total_slots: forms.reduce((n, f) => n + f.slots.length, 0),
  forms,
};
mkdirSync(path.join(root, "public/data"), { recursive: true });
writeFileSync(path.join(root, "public/data/forms.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`public/data/forms.json — 서식 ${forms.length}종 · 칸 ${out.total_slots} · v${pkg.version}`);

// public/index.html 에 숫자·서식 표를 굽는다. 페이지가 데이터를 받아 오지 않아도 처음부터 맞는 값이 보이게.
// 몇 번을 돌려도 결과가 같다(자리 표시 안의 내용만 바꾼다).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const htmlPath = path.join(root, "public/index.html");
let html = readFileSync(htmlPath, "utf8");
const NL = html.includes("\r\n") ? "\r\n" : "\n";
const bake = (re, to, what) => {
  if (!re.test(html)) throw new Error(`index.html 에 ${what} 자리가 없습니다`);
  html = html.replace(re, to);
};
const span = (attr, v) => bake(new RegExp(`(<span ${attr}>)[^<]*(</span>)`, "g"), `$1${v}$2`, attr);
span("data-version", pkg.version);
span("data-form-count", forms.length);
span("data-total-slots", out.total_slots.toLocaleString("ko-KR"));
span("data-stamp-forms", forms.filter((f) => f.stamps.length).length);
bake(/(<meta name="description" content="[^"]*정본 서식 )\d+(종)/, `$1${forms.length}$2`, "meta description");
const rows = forms.map((f) => `<tr id="form-${f.id}">` +
  `<td><details><summary>${esc(f.title)}</summary><ol class="slot-list">${f.slots.map((s) => `<li>${esc(s.label || s.key)}</li>`).join("")}</ol></details></td>` +
  `<td class="num">${f.slots.length}</td><td class="mark">${f.pdf ? "가능" : ""}</td><td class="mark">${f.hwpx ? "가능" : "PDF만 배포"}</td>` +
  `<td class="num">${f.stamps.length || "의료기관 작성"}</td><td class="num">${f.revised ? f.revised.replace(/-/g, ".") : "표기 없음"}</td></tr>`).join(NL);
bake(/(<tbody id="forms-body">)[\s\S]*?(<\/tbody>)/, `$1${NL}${rows}${NL}$2`, "서식 표");
const fillable = Object.fromEntries(forms.map((f) => [f.id, { hwpx: f.hwpx }]));
bake(/(<script type="application\/json" id="fillable-data">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(fillable)}$2`, "fillable-data");
writeFileSync(htmlPath, html);
console.log(`public/index.html — 숫자·서식 표 반영`);
