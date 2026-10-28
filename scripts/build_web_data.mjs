// 안내 페이지가 읽는 서식 데이터 → public/data/forms.json
// 숫자를 HTML 에 손으로 적지 않으려고 만든다. 나중 웹 편집기도 이 파일(칸 이름·종류·설명)을 입력 모델로 쓴다.
// 사용: npm run build 뒤 node scripts/build_web_data.mjs  (dist/src/core/catalog.js 의 서식 제목을 쓴다)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const { FORMS } = await import(new URL("../dist/src/core/catalog.js", import.meta.url).href);

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
    return {
      id,
      title: FORMS[id]?.title ?? id,
      revised: src?.revised ?? null,
      source_url: src?.view_url ?? null,
      pdf: true,
      hwpx,
      stamps: Object.keys(map.stamps ?? {}),
      slots: Object.entries(map.slots).map(([key, s]) => ({ key, kind: s.kind, label: s.label ?? "", page: s.page ?? null })),
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
