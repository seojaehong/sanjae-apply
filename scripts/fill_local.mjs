// 로컬에서 서식을 채운다(배포 없이 글꼴·좌표 지도 검증용).
// 사용: node scripts/fill_local.mjs <map.json> <원본.pdf> <font.ttf> <values.json> <out.pdf> [--subset]
// 먼저 npm run build 로 dist/ 를 만든다. 값은 디스크에 out.pdf 로만 남는다(합성 값만 쓸 것).
import { readFileSync, writeFileSync } from "node:fs";
import { fillForm } from "../dist/src/fill/overlay.js";

const [mapPath, pdfPath, fontPath, valuesPath, outPath, ...flags] = process.argv.slice(2);
const map = JSON.parse(readFileSync(mapPath, "utf8"));
const values = JSON.parse(readFileSync(valuesPath, "utf8"));
const { bytes, report } = await fillForm(new Uint8Array(readFileSync(pdfPath)), map, {
  fontBytes: new Uint8Array(readFileSync(fontPath)),
  values,
  subset: flags.includes("--subset"),
});
writeFileSync(outPath, bytes);
console.log(JSON.stringify({ out: outPath, bytes: bytes.length, written: report.written.length, skipped: report.skipped.length, shrunk: report.shrunk }));
