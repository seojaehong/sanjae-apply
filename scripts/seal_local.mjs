// 도장 PNG 생성 로컬 시험. 사용: node scripts/seal_local.mjs <out.png> --name 홍길동 [--shape circle|square|ellipse] [--arc "법인명" --center "대표자인" --bottom "000-00-00000" --inner 2]
import { readFileSync, writeFileSync } from "node:fs";
import { makeSeal } from "../dist/src/stamp/seal.js";
import { fontPath } from "../dist/src/fill/registry.js";

const [out, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];
const t0 = Date.now();
const png = makeSeal({
  name: opt.name,
  shape: opt.shape,
  arcText: opt.arc,
  centerText: opt.center?.replace(/\\n/g, "\n"),
  bottomText: opt.bottom,
  innerRing: opt.inner ? Number(opt.inner) : 0,
  size: opt.size ? Number(opt.size) : 480,
  fontBytes: new Uint8Array(readFileSync(fontPath())),
});
writeFileSync(out, png);
console.log(out, png.length, "bytes", Date.now() - t0, "ms");
