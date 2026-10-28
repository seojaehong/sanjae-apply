// FormAssets 의 브라우저 구현 — 같은 출처의 정적 파일(public/assets/)만 받는다. build:web 이 복사해 둔다.
// 서식 하나를 채울 때 그 서식의 지도·PDF 와 글꼴만 받는다(첫 화면에는 아무것도 받지 않는다).
import type { FormAssets } from "../src/fill/assets.js";
import type { HwpxMap } from "../src/fill/hwpx.js";
import type { FormMap } from "../src/fill/overlay.js";

const ID = /^F_[A-Z_]+$/;

export function fetchAssets(base = "assets/"): FormAssets {
  const get = async (path: string): Promise<Response> => {
    const r = await fetch(base + path);
    if (!r.ok) throw new Error(`서식 파일을 받지 못했습니다(${r.status}): ${path}`);
    return r;
  };
  const id = (formId: string) => {
    if (!ID.test(formId)) throw new Error(`서식 id 형식이 아니다: ${formId}`);
    return formId;
  };
  const bytes = async (path: string) => new Uint8Array(await (await get(path)).arrayBuffer());
  let font: Promise<Uint8Array> | undefined;
  return {
    map: async (formId) => (await (await get(`forms/maps/${id(formId)}.json`)).json()) as FormMap,
    pdf: (formId) => bytes(`forms/bundled/${id(formId)}.pdf`),
    hwpxMap: async (formId) => (await (await get(`forms/hwpx_maps/${id(formId)}.json`)).json()) as HwpxMap,
    hwpx: (formId) => bytes(`forms/hwpx/${id(formId)}.hwpx`),
    font: () => (font ??= bytes("fonts/NanumGothic-Regular.ttf")), // 2MB, 한 번만
  };
}
