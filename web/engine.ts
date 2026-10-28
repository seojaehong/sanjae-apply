// 브라우저용 판정 엔진. npm 패키지와 같은 src/core 를 그대로 묶는다 — 규칙을 복사하지 않는다.
// 순수 함수라 입력값이 이 파일 밖(서버)으로 나가지 않는다.
export { buildPackage } from "../src/core/run.js";
export { normalizeInput, toCheckArgs } from "../src/core/input.js";
export { CLAIM_TYPES, ACCIDENT_KINDS, TAGS } from "../src/core/types.js";
export type { ClaimInput, Package } from "../src/core/types.js";
