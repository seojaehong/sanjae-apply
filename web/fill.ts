// 브라우저에서 서식 PDF 채우기 — npm 패키지와 같은 src/fill·src/stamp 를 묶는다. 입력값은 이 함수 밖(서버)으로 나가지 않는다.
// public/app/fill.js 로 묶이고(--platform=browser), 채우기를 시작할 때만 불러온다(웹편집기 2단계).
import type { FormAssets } from "../src/fill/assets.js";
import { fillForm, type FillReport } from "../src/fill/overlay.js";
import { buildStamps, type StampSpec } from "../src/stamp/resolve.js";
import { fetchAssets } from "./assets-fetch.js";

export { fetchAssets };
export { describeForm } from "../src/fill/describe.js";

export async function fillPdf(
  formId: string,
  values: Record<string, string | boolean>,
  opt: { stamp?: StampSpec; spot?: string | string[]; assets?: FormAssets } = {},
): Promise<{ bytes: Uint8Array; report: FillReport }> {
  const assets = opt.assets ?? fetchAssets();
  const [map, pdf, font] = await Promise.all([assets.map(formId), assets.pdf(formId), assets.font()]);
  const stamps = buildStamps(opt.stamp, opt.spot, Object.keys(map.stamps ?? {}), () => font);
  return fillForm(pdf, map, { fontBytes: font, values, stamps });
}
