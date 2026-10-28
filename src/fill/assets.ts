// 서식 자산(지도·정본 PDF·hwpx·글꼴)을 어디서 읽든 같은 모양. 파일을 읽지 않는 타입만 둔다.
// 구현: node 는 registry.ts 의 nodeAssets. 브라우저 fetch 구현은 자산을 정적 파일로 낼 때(웹편집기 2단계) 더한다.
import type { HwpxMap } from "./hwpx.js";
import type { FormMap } from "./overlay.js";

export interface FormAssets {
  map(formId: string): Promise<FormMap>;
  pdf(formId: string): Promise<Uint8Array>;
  hwpxMap(formId: string): Promise<HwpxMap>;
  hwpx(formId: string): Promise<Uint8Array>;
  font(): Promise<Uint8Array>;
}
