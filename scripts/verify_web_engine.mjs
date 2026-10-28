// 브라우저 번들(public/app/engine.js)이 CLI 와 같은 답을 내는지 대조한다.
// ① 전 조합(급여 9 × 재해 4 × 제3자 3 × 치료종결 3 × 태그 16 × 첨부 없음/전부 준비) 을 dist 코어와 비교
// ⓪ 확인표 선택지 값 = 엔진 상수 · ② 의 인자는 페이지의 「같은 확인을 명령줄로」 한 줄과 같은 toCheckArgs 로 만든다
// ② 그중 일부를 실제 CLI(`node dist/src/cli.js check --json`) 와 비교 — 「제출할 수 있는 상태」·「확인할 것이 남음」 둘 다 포함
// 사용: npm run build && npm run build:web && node scripts/verify_web_engine.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const web = await import(new URL("../public/app/engine.js", import.meta.url).href);
const core = await import(new URL("../dist/src/core/run.js", import.meta.url).href);
const { ATTACHMENTS } = await import(new URL("../dist/src/core/catalog.js", import.meta.url).href);

const { toCheckArgs } = await import(new URL("../dist/src/core/input.js", import.meta.url).href);

const ALL_HAVE = Object.keys(ATTACHMENTS);
const tris = [true, false, "UNDECLARED"];
const subsets = (xs) => xs.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
const cases = [];
for (const claim of web.CLAIM_TYPES)
  for (const accidentKind of [...web.ACCIDENT_KINDS, "UNDECLARED"])
    for (const thirdParty of tris)
      for (const treatmentEnded of tris)
        for (const tags of subsets(web.TAGS))
          for (const have of [undefined, ALL_HAVE]) {
            const i = { claim, accidentKind, thirdParty, treatmentEnded };
            if (tags.length) i.tags = tags;
            if (have) i.have = have;
            cases.push(i);
          }

// ⓪ 확인표의 선택지 값이 엔진 상수와 같은가 — 문구는 HTML 에서 고치므로 값이 어긋나면 여기서 잡는다
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const values = (name) => [...html.matchAll(new RegExp(`name="${name}" value="([^"]+)"`, "g"))].map((m) => m[1]).sort();
let htmlDiff = 0;
for (const [name, want] of [["claim", web.CLAIM_TYPES], ["accidentKind", [...web.ACCIDENT_KINDS, "UNDECLARED"]], ["tags", web.TAGS]]) {
  const got = values(name);
  const ok = isDeepStrictEqual(got, [...want].sort());
  if (!ok) htmlDiff++;
  console.log(`⓪ 확인표 ${name}: ${ok ? "같음" : `다름 — HTML ${got.join(",")} / 엔진 ${[...want].join(",")}`}`);
}

let diff = 0;
const status = { READY_TO_SUBMIT: 0, INCOMPLETE: 0 };
for (const i of cases) {
  const a = web.buildPackage(i);
  const b = core.buildPackage(i);
  status[a.status]++;
  if (!isDeepStrictEqual(a, b)) diff++;
}
console.log(`① 번들 ↔ dist 코어: ${cases.length}건, 불일치 ${diff} · 제출할 수 있는 상태 ${status.READY_TO_SUBMIT} · 확인할 것이 남음 ${status.INCOMPLETE}`);

const picks = [];
for (const want of ["READY_TO_SUBMIT", "INCOMPLETE"]) {
  const pool = cases.filter((i) => web.buildPackage(i).status === want);
  picks.push(...[0, Math.floor(pool.length / 3), Math.floor((pool.length * 2) / 3), pool.length - 1].map((k) => pool[k]));
  picks.push(pool.find((i) => i.tags?.length === web.TAGS.length && !i.have) ?? pool[1]);
}
let cliDiff = 0;
for (const i of picks) {
  const args = ["dist/src/cli.js", "check", ...toCheckArgs(i), "--json"];
  const cli = JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8" }));
  const ok = isDeepStrictEqual(cli, web.buildPackage(i));
  if (!ok) cliDiff++;
  console.log(`  ${ok ? "같음" : "다름"}  ${cli.status.padEnd(15)} ${args.slice(2).join(" ").slice(0, 110)}`);
}
console.log(`② 번들 ↔ CLI: ${picks.length}건, 불일치 ${cliDiff}`);
process.exit(diff || cliDiff || htmlDiff ? 1 : 0);
