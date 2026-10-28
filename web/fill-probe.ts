// 브라우저 번들 점검용 — 채우기·도장 모듈이 node 전용 모듈 없이 묶이는지(docs/웹편집기_설계.md 1단계 끝 기준).
// `npm run probe:web` 이 esbuild --platform=browser 로 묶는다. node: 가 하나라도 남으면 빌드가 실패한다. 페이지에는 아직 연결하지 않는다.
export { fillForm } from "../src/fill/overlay.js";
export { fillHwpx } from "../src/fill/hwpx.js";
export { buildStamps } from "../src/stamp/resolve.js";
export { makeSeal } from "../src/stamp/seal.js";
export { describeForm } from "../src/fill/describe.js";
