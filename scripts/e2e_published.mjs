// 게시판 전수 시험 — npm 에서 받은 패키지의 cli.js 를 사용자 경로 그대로 실행한다(레포 dist 아님).
// 사용: node scripts/e2e_published.mjs <cli.js> <out_dir>
//   cli.js 는 `npx -y sanjae-apply@<ver> --help` 를 한 번 돌린 뒤 npm 캐시 _npx/<hash>/node_modules/sanjae-apply/dist/src/cli.js
// 결과: <out_dir>/e2e_report.json + 표준출력 요약. 하나라도 실패하면 exit 1.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cli, outDir] = process.argv.slice(2);
if (!cli || !outDir) {
  console.error("사용: node scripts/e2e_published.mjs <cli.js> <out_dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const FORBIDDEN = /승인\s*가능|확률|적중|승소|노무사가\s*대신/;
const results = [];
const rec = (area, name, ok, detail) => {
  results.push({ area, name, ok, detail });
  if (!ok) console.log(`✗ ${area} ${name} ${JSON.stringify(detail).slice(0, 300)}`);
};
const run = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const runErr = (args) => {
  try {
    run(args);
    return { code: 0, msg: "" };
  } catch (e) {
    return { code: e.status, msg: String(e.stderr || e.message) };
  }
};
const pkgVersion = JSON.parse(readFileSync(join(dirname(cli), "..", "..", "package.json"), "utf8")).version;

// 1. check — 급여 9종 × 재해 3종 × 제3자 2종
const CLAIMS = ["YOYANG", "HUYEOP", "CARE_TRANSPORT_DEVICE", "JANGHAE", "YUJOK", "UNPAID", "ADDITIONAL_DISEASE", "RE_YOYANG", "SELF_PAY"];
const KINDS = ["WORK_ACCIDENT", "COMMUTE", "DISEASE"];
const checkRows = [];
for (const c of CLAIMS)
  for (const k of KINDS)
    for (const t of ["yes", "no"]) {
      const out = run(["check", c, "--accident", k, "--third-party", t, "--json"]);
      const p = JSON.parse(out);
      const cnt = (s) => p.forms.filter((f) => f.status === s).length;
      const row = { claim: c, accident: k, third: t, status: p.status, required: cnt("REQUIRED"), conditional: cnt("CONDITIONAL"), rules: p.rules_applied.join(" "), open: p.open_confirmations.length };
      checkRows.push(row);
      rec("check", `${c}/${k}/${t}`, p.forms.length > 0 && !FORBIDDEN.test(out), row);
    }
// 분기가 실제로 갈리는지: 출퇴근·제3자 yes 와 no 가 서로 다른 서식 수를 내야 한다
const y = checkRows.find((r) => r.claim === "YOYANG" && r.accident === "COMMUTE" && r.third === "yes");
const n = checkRows.find((r) => r.claim === "YOYANG" && r.accident === "WORK_ACCIDENT" && r.third === "no");
rec("check", "분기 양쪽(출퇴근·제3자 vs 업무상 사고·제3자 없음)", y.required > n.required, { commute_third: y.required, work_none: n.required });
const tags = JSON.parse(run(["check", "JANGHAE", "--tags", "NOISE_HEARING_LOSS", "--json"]));
rec("check", "장해 소음성 난청 태그 → S-10", tags.rules_applied.includes("S-10"), tags.rules_applied);
const have = JSON.parse(run(["check", "YOYANG", "--have", "A_MEDICAL_OPINION", "--json"]));
rec("check", "--have 로 준 첨부는 PROVIDED", have.attachments.some((a) => a.id === "A_MEDICAL_OPINION" && a.status === "PROVIDED"), have.attachments.map((a) => `${a.id}:${a.status}`));
const human = run(["check", "YOYANG", "--accident", "COMMUTE", "--third-party", "yes"]);
rec("check", "사람용 출력(비 JSON)", human.includes("요양급여 신청서") && !FORBIDDEN.test(human), human.slice(0, 120));

// 2. catalog
const cat = JSON.parse(run(["catalog"]));
rec("catalog", "fillable 12 · fillable_hwpx 11", cat.fillable.length === 12 && cat.fillable_hwpx.length === 11, { pdf: cat.fillable.length, hwpx: cat.fillable_hwpx.length });
const forms = cat.fillable;
const catRows = [];
for (const fid of forms) {
  const c = JSON.parse(run(["catalog", fid]));
  catRows.push({ form: fid, slots: c.slots.length, stamps: (c.stamps ?? []).join(",") || "-", revised: c.entries?.[0]?.revised });
  rec("catalog", fid, c.slots.length > 0, catRows.at(-1));
}

// 3. fill — PDF 12 · hwpx 11 (샘플 값 = test/samples, 합성 값)
const fillRows = [];
for (const fid of forms) {
  const sample = join(ROOT, "test", "samples", `${fid}.json`);
  const vals = JSON.parse(readFileSync(sample, "utf8"));
  const nKeys = Object.keys(vals).length;
  // 값이 있는 칸(빈 문자열·false 아님)이 건너뜀에 들어가면 실패다. 건너뜀에는 샘플에 없는 지도 칸도 들어가므로 합계로 비교하지 않는다
  const lost = (skipped) => skipped.filter((k) => vals[k] !== undefined && vals[k] !== "" && vals[k] !== false);
  const pdf = join(outDir, `${fid}.pdf`);
  const a = JSON.parse(run(["fill", fid, sample, "--out", pdf]));
  const pdfOk = lost(a.skipped).length === 0 && a.written > 0 && readFileSync(pdf).subarray(0, 5).toString() === "%PDF-";
  const row = { form: fid, sample_keys: nKeys, pdf_written: a.written, pdf_skipped: a.skipped.length, pdf_kb: Math.round(statSync(pdf).size / 1024) };
  rec("fill-pdf", fid, pdfOk, row);
  if (cat.fillable_hwpx.includes(fid)) {
    const hx = join(outDir, `${fid}.hwpx`);
    const b = JSON.parse(run(["fill", fid, sample, "--out", hx]));
    const hxOk = lost(b.skipped).length === 0 && b.filled > 0 && readFileSync(hx).subarray(0, 2).toString() === "PK";
    Object.assign(row, { hwpx_filled: b.filled, hwpx_skipped: b.skipped.length });
    rec("fill-hwpx", fid, hxOk, row);
  }
  fillRows.push(row);
}

// 4. seal — 4 모양
const sealRows = [];
const seals = {
  circle: ["--name", "홍길동"],
  square: ["--name", "김대표", "--shape", "square"],
  ellipse: ["--name", "홍길동", "--shape", "ellipse"],
  corporate: ["--arc", "가나다 주식회사", "--center", "대표이사", "--bottom", "123-45-67890", "--inner", "2"],
};
for (const [k, args] of Object.entries(seals)) {
  const png = join(outDir, `seal_${k}.png`);
  const s = JSON.parse(run(["seal", "--out", png, ...args]));
  sealRows.push({ shape: k, width: s.width, height: s.height, bytes: s.bytes });
  rec("seal", k, s.width === 480 && s.bytes > 2000 && readFileSync(png).subarray(1, 4).toString() === "PNG", sealRows.at(-1));
}

// 5. 날인 — 이름·모양·PNG·자리 선택, PDF·hwpx
const S = join(ROOT, "test", "samples", "F_YOYANG_APPLY.json");
const stampCases = [
  ["pdf 이름(원형) 기본 자리", ["--out", join(outDir, "st_name.pdf"), "--stamp", "홍길동"], ["applicant", "delegation", "consent"]],
  ["pdf 타원형", ["--out", join(outDir, "st_ellipse.pdf"), "--stamp", "홍길동", "--stamp-shape", "ellipse"], ["applicant", "delegation", "consent"]],
  ["pdf 가진 PNG + 자리 1곳", ["--out", join(outDir, "st_png.pdf"), "--stamp-png", join(outDir, "seal_square.png"), "--stamp-spot", "applicant"], ["applicant"]],
  ["hwpx 이름 기본 자리", ["--out", join(outDir, "st_name.hwpx"), "--stamp", "홍길동"], ["applicant", "delegation", "consent"]],
  ["hwpx 가진 PNG(법인형) + 자리 2곳", ["--out", join(outDir, "st_png.hwpx"), "--stamp-png", join(outDir, "seal_corporate.png"), "--stamp-spot", "consent,applicant"], ["consent", "applicant"]],
];
for (const [name, args, want] of stampCases) {
  const r = JSON.parse(run(["fill", "F_YOYANG_APPLY", S, ...args]));
  rec("stamp", name, JSON.stringify(r.stamped) === JSON.stringify(want), r.stamped);
}

// 6. 오류는 조용히 넘어가지 않는다
const errCases = [
  ["한자 이름 도장", ["seal", "--out", join(outDir, "x.png"), "--name", "洪吉童"], /없는 글자/],
  ["없는 자리 이름", ["fill", "F_YOYANG_APPLY", S, "--out", join(outDir, "x.pdf"), "--stamp", "홍길동", "--stamp-spot", "aplicant"], /aplicant/],
  ["도장 자리 없는 서식", ["fill", "F_DEVICE_PRESCRIPTION", join(ROOT, "test", "samples", "F_DEVICE_PRESCRIPTION.json"), "--out", join(outDir, "x.pdf"), "--stamp", "홍길동"], /자리가 없다/],
  ["값 없는 --stamp", ["fill", "F_YOYANG_APPLY", S, "--out", join(outDir, "x.pdf"), "--stamp", "--stamp-spot", "consent"], /값이 없다/],
  ["--stamp 와 --stamp-png 동시", ["fill", "F_YOYANG_APPLY", S, "--out", join(outDir, "x.pdf"), "--stamp", "홍길동", "--stamp-png", join(outDir, "seal_circle.png")], /.+/],
  ["없는 서식", ["fill", "F_NOPE", S, "--out", join(outDir, "x.pdf")], /.+/],
  ["PNG 아닌 파일", ["fill", "F_YOYANG_APPLY", S, "--out", join(outDir, "x.pdf"), "--stamp-png", S], /PNG/],
];
for (const [name, args, re] of errCases) {
  const e = runErr(args);
  rec("error", name, e.code !== 0 && re.test(e.msg), { code: e.code, msg: e.msg.trim().split("\n")[0].slice(0, 120) });
}

const fails = results.filter((r) => !r.ok);
const summary = Object.entries(results.reduce((m, r) => ((m[r.area] ??= { pass: 0, fail: 0 }), m[r.area][r.ok ? "pass" : "fail"]++, m), {}));
writeFileSync(join(outDir, "e2e_report.json"), JSON.stringify({ version: pkgVersion, cli, summary: Object.fromEntries(summary), checkRows, catRows, fillRows, sealRows, results }, null, 2));
console.log(`sanjae-apply ${pkgVersion} 게시판 전수 시험`);
for (const [a, s] of summary) console.log(`  ${a.padEnd(10)} 통과 ${s.pass}  실패 ${s.fail}`);
console.log(`합계 ${results.length - fails.length}/${results.length}`);
process.exit(fails.length ? 1 : 0);
