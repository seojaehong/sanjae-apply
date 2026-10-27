// 서식 id → 동봉 PDF·좌표 지도 찾기. 패키지 루트(forms/, fonts/) 기준.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HwpxMap } from "./hwpx.js";
import type { FormMap } from "./overlay.js";

/** 패키지 루트 = dist/src/fill/ 의 세 단계 위, 또는 env SANJAE_ROOT */
export function packageRoot(): string {
  if (process.env.SANJAE_ROOT) return process.env.SANJAE_ROOT;
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export function mapPath(formId: string): string {
  return path.join(packageRoot(), "forms", "maps", `${formId}.json`);
}
export function pdfPath(formId: string): string {
  return path.join(packageRoot(), "forms", "bundled", `${formId}.pdf`);
}
export function fontPath(): string {
  return process.env.SANJAE_FONT ?? path.join(packageRoot(), "fonts", "NanumGothic-Regular.ttf");
}
export function catalogPath(): string {
  return path.join(packageRoot(), "forms", "catalog.json");
}

/** 채울 수 있는 서식 = 지도와 동봉 PDF 가 둘 다 있는 것 */
export function fillableForms(): string[] {
  const dir = path.join(packageRoot(), "forms", "maps");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((id) => existsSync(pdfPath(id)))
    .sort();
}

export function loadMap(formId: string): FormMap {
  const p = mapPath(formId);
  if (!existsSync(p)) throw new Error(`채우기 지도가 없는 서식: ${formId} (가능: ${fillableForms().join(", ") || "없음"})`);
  return JSON.parse(readFileSync(p, "utf8")) as FormMap;
}

export function loadAssets(formId: string): { map: FormMap; pdf: Uint8Array; font: Uint8Array } {
  const map = loadMap(formId);
  return { map, pdf: new Uint8Array(readFileSync(pdfPath(formId))), font: new Uint8Array(readFileSync(fontPath())) };
}

// ── 한글(hwpx) 출력 ──────────────────────────────────────────────
export function hwpxMapPath(formId: string): string {
  return path.join(packageRoot(), "forms", "hwpx_maps", `${formId}.json`);
}
export function hwpxPath(formId: string): string {
  return path.join(packageRoot(), "forms", "hwpx", `${formId}.hwpx`);
}

/** 한글로 채울 수 있는 서식 = hwpx 지도와 동봉 hwpx 가 둘 다 있는 것 */
export function fillableHwpxForms(): string[] {
  const dir = path.join(packageRoot(), "forms", "hwpx_maps");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((id) => existsSync(hwpxPath(id)))
    .sort();
}

export function loadHwpxMap(formId: string): HwpxMap {
  const p = hwpxMapPath(formId);
  if (!existsSync(p)) throw new Error(`한글 채우기 지도가 없는 서식: ${formId} (가능: ${fillableHwpxForms().join(", ") || "없음"})`);
  return JSON.parse(readFileSync(p, "utf8")) as HwpxMap;
}

export function loadHwpxAssets(formId: string): { map: HwpxMap; hwpx: Uint8Array } {
  const map = loadHwpxMap(formId);
  return { map, hwpx: new Uint8Array(readFileSync(hwpxPath(formId))) };
}

/** 지도에 없는 칸 이름 — 값을 조용히 버리지 않고 결과에 알린다(오타·다른 서식 칸 이름) */
export function unknownKeys(values: Record<string, unknown>, slots: Record<string, unknown>): string[] {
  return Object.keys(values).filter((k) => !Object.prototype.hasOwnProperty.call(slots, k));
}
