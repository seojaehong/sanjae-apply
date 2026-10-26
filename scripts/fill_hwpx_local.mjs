// 로컬 한글 채우기 — dist 를 바로 불러 forms/hwpx/F_*.hwpx 에 values.json 을 얹는다.
// 사용: node scripts/fill_hwpx_local.mjs <FORM_ID> <values.json> <out.hwpx>
import { readFileSync, writeFileSync } from "node:fs";
import { fillHwpx } from "../dist/src/fill/hwpx.js";
import { loadHwpxAssets } from "../dist/src/fill/registry.js";

const [formId, valuesPath, out] = process.argv.slice(2);
const values = JSON.parse(readFileSync(valuesPath, "utf8"));
const { map, hwpx } = loadHwpxAssets(formId);
const { bytes, report } = await fillHwpx(hwpx, map, { values });
writeFileSync(out, bytes);
console.log(JSON.stringify({ out, filled: report.filled.length, skipped: report.skipped, errors: report.errors }, null, 2));
