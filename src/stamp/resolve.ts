// 도장 지정 → PNG 바이트. 이름만 주면 성명인을 만들고, PNG 를 주면 그대로 쓴다(투명 배경 권장).
import { makeSeal, type SealShape } from "./seal.js";

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
  /** 찍을 자리 키(지도 stamps 의 키). 쉼표 구분. 기본 = 지도에 있는 신청인 자리 전부(applicant·delegation·consent) */
  spot?: string | undefined;
}

/** 신청인 본인이 찍는 자리 — 지도 11종이 같은 이름을 쓴다(본문·위임장·개인정보 동의). 그 밖의 키(confirm·commute_reporter 등)는 타인 서명란 */
export const APPLICANT_SPOTS = ["applicant", "delegation", "consent"] as const;

/** 찍을 자리 키 목록. spot 은 쉼표 구분("applicant,consent") 또는 배열. 비우면 지도에 있는 신청인 자리 전부(없으면 applicant 하나 — 건너뜀으로 보고된다) */
export function stampSpots(available: string[], spot?: string | string[] | undefined): string[] {
  const asked = (Array.isArray(spot) ? spot : (spot ?? "").split(",")).map((s) => s.trim()).filter(Boolean);
  if (asked.length) return [...new Set(asked)];
  const own = APPLICANT_SPOTS.filter((k) => available.includes(k));
  return own.length ? own : ["applicant"];
}

export function resolveStamp(spec: StampSpec, fontBytes: Uint8Array): Uint8Array {
  if (spec.png && spec.png.length) return spec.png;
  if (!spec.name && !spec.centerText && !spec.arcText) throw new Error("도장: name(성명인) 또는 png 가 필요하다");
  return makeSeal({
    name: spec.name,
    shape: spec.shape ?? "circle",
    arcText: spec.arcText,
    centerText: spec.centerText,
    bottomText: spec.bottomText,
    innerRing: spec.innerRing ?? (spec.arcText ? 2 : 0),
    size: 480,
    fontBytes,
  });
}
