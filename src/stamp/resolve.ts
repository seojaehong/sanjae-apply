// 도장 지정 → 자리별 PNG. 이름만 주면 성명인을 만들고, PNG 를 주면 검사한 뒤 그대로 쓴다(투명 배경 권장).
// CLI 와 MCP 가 같은 조립 함수(buildStamps)를 쓴다. 글꼴은 도장을 실제로 만들 때만 읽는다(2MB).
import { pngInfo } from "./png.js";
import { makeSeal, type SealShape } from "./seal.js";

export const SEAL_SHAPES: readonly SealShape[] = ["circle", "ellipse", "square"];

export interface StampSpec {
  /** 성명인 이름(2~4자) — 본인 또는 명의자 동의가 있는 이름만 */
  name?: string | undefined;
  shape?: SealShape | undefined;
  /** 법인형 */
  arcText?: string | undefined;
  centerText?: string | undefined;
  bottomText?: string | undefined;
  innerRing?: number | undefined;
  /** 이미 있는 도장 PNG */
  png?: Uint8Array | undefined;
}

/** 서식에서 항상 쓰는 본문·위임장·개인정보 동의의 신청인 자리. 지도 11종이 같은 이름을 쓴다. 그 밖의 키(confirm·commute_reporter·noise_applicant 등)는 조건부 부속서의 자리라 이름을 적을 때만 찍는다 */
export const APPLICANT_SPOTS = ["applicant", "delegation", "consent"] as const;

/** 찍을 자리 키 목록. spot 은 쉼표 구분("applicant,consent") 또는 배열. 비우면 지도에 있는 신청인 자리 전부. 명시한 자리가 지도에 없거나 지도에 자리가 하나도 없으면 던진다(조용히 건너뛰지 않는다) */
export function stampSpots(available: string[], spot?: string | string[] | undefined): string[] {
  const asked = [...new Set((Array.isArray(spot) ? spot : (spot ?? "").split(",")).map((s) => s.trim()).filter(Boolean))];
  if (asked.length) {
    const unknown = asked.filter((k) => !available.includes(k));
    if (unknown.length) throw new Error(`도장 자리 ${unknown.join(", ")} 가 이 서식 지도에 없다(있는 자리: ${available.join(", ") || "없음"})`);
    return asked;
  }
  const own = APPLICANT_SPOTS.filter((k) => available.includes(k));
  if (!own.length) throw new Error(`이 서식에는 신청인 도장 자리가 없다(있는 자리: ${available.join(", ") || "없음 — 의료기관 작성 서식"})`);
  return own;
}

const nfc = (s: string | undefined) => (s === undefined ? undefined : s.normalize("NFC").trim());

export function resolveStamp(spec: StampSpec, fontBytes: Uint8Array): Uint8Array {
  if (spec.png && spec.png.length) {
    pngInfo(spec.png);
    return spec.png;
  }
  const name = nfc(spec.name);
  const arcText = nfc(spec.arcText);
  const centerText = nfc(spec.centerText);
  if (!name && !centerText && !arcText) throw new Error("도장: name(성명인) 또는 png 가 필요하다");
  if (spec.shape && !SEAL_SHAPES.includes(spec.shape)) throw new Error(`도장 모양은 ${SEAL_SHAPES.join("|")} 중 하나다: ${String(spec.shape)}`);
  if (spec.innerRing !== undefined && !Number.isFinite(spec.innerRing)) throw new Error("innerRing 은 숫자여야 한다");
  return makeSeal({
    name,
    shape: spec.shape ?? "circle",
    arcText,
    centerText,
    bottomText: nfc(spec.bottomText),
    innerRing: spec.innerRing ?? (arcText ? 2 : 0),
    size: 480,
    fontBytes,
  });
}

/** CLI·MCP 공통 조립: 지정이 없으면 undefined, 있으면 자리별 PNG. 자리 선택이 먼저라 글꼴은 실제로 만들 때만 읽는다 */
export function buildStamps(spec: StampSpec | undefined, spot: string | string[] | undefined, available: string[], loadFont: () => Uint8Array): Record<string, Uint8Array> | undefined {
  if (!spec) return undefined;
  const keys = stampSpots(available, spot);
  const png = spec.png && spec.png.length ? resolveStamp(spec, new Uint8Array(0)) : resolveStamp(spec, loadFont());
  return Object.fromEntries(keys.map((k) => [k, png]));
}
