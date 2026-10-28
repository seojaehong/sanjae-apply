// 도장(인영) PNG 생성 — 원형·타원·사각, 개인 성명인 + 법인형(원주 주문자·중심 문자·하단 부문자). 글리프 윤곽을 직접 래스터한다(네이티브 의존 없음).
// ★ 도장은 명의자의 인격표지다. 본인 또는 명의자 동의가 있는 이름만 넣는다. 등록 인감을 흉내 내는 용도가 아니다(사용인감 성격).
// ★ 글꼴에 없는 글자는 조용히 빈 자리가 된다(.notdef 는 윤곽이 없다). 그래서 makeSeal 이 모든 글자의 글리프 존재를 먼저 확인하고 없으면 던진다.

import fontkit from "@pdf-lib/fontkit";
import { encodePng } from "./png.js";
import { Canvas, ellipsePoly, pathToPolys, ring, roundedRectPoly, type Poly, type Transform } from "./raster.js";

export type SealShape = "circle" | "ellipse" | "square";

export interface SealOptions {
  /** 성명인 이름(2~4자). centerText 가 없을 때 세로 1열 */
  name?: string | undefined;
  shape?: SealShape | undefined;
  /** 픽셀. 기본 480 */
  size?: number;
  /** 타원 세로/가로 비. 기본 0.72 */
  ratio?: number;
  /** 원주 상단 주문자(법인명). 있으면 법인형 */
  arcText?: string | undefined;
  /** 원주 하단 부문자(사업자번호 등) */
  bottomText?: string | undefined;
  /** 중심 문자. "\n" 으로 줄바꿈 */
  centerText?: string | undefined;
  /** 이중선 두께(px, 0 = 없음) */
  innerRing?: number | undefined;
  /** 테두리 두께(px). 기본 size×0.0115 */
  ring?: number;
  arcSpread?: number;
  bottomSpread?: number;
  /** TTF 바이트(한글 글꼴) */
  fontBytes: Uint8Array;
  /** 인주 색. 기본 (230,0,18) */
  color?: [number, number, number];
}

interface Glyphed {
  polys: Poly[];
}

type Font = ReturnType<typeof fontkit.create>;

/** 한 글자의 윤곽을 bbox 중심이 (cx,cy)에 오도록, 글자 크기 fs(px) 로, 시계 방향 rot(라디안) 회전해 배치 */
function charPolys(font: Font, ch: string, fs: number, cx: number, cy: number, rot = 0): Glyphed {
  const g = font.glyphForCodePoint(ch.codePointAt(0)!);
  const s = fs / font.unitsPerEm;
  const bb = g.bbox;
  const t: Transform = { s, rot, cx, cy, ox: (bb.minX + bb.maxX) / 2, oy: (bb.minY + bb.maxY) / 2, flipY: true };
  return { polys: pathToPolys((g.path as unknown as { commands: { command: string; args: number[] }[] }).commands, t) };
}

/** 한 줄 글(여러 글자)을 가로로 늘어놓고 전체 bbox 중심이 (cx,cy)에 오게 */
function linePolys(font: Font, text: string, fs: number, cx: number, cy: number): Poly[] {
  const s = fs / font.unitsPerEm;
  const run = font.layout(text);
  let x = 0;
  const items: { g: (typeof run.glyphs)[number]; x: number }[] = [];
  for (let i = 0; i < run.glyphs.length; i++) {
    items.push({ g: run.glyphs[i]!, x });
    x += run.positions[i]!.xAdvance;
  }
  // bbox(글꼴 단위)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const b = it.g.bbox;
    if (!Number.isFinite(b.minX)) continue;
    minX = Math.min(minX, it.x + b.minX);
    maxX = Math.max(maxX, it.x + b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  }
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  const out: Poly[] = [];
  for (const it of items) {
    const t: Transform = { s, rot: 0, cx, cy, ox: ox - it.x, oy, flipY: true };
    out.push(...pathToPolys((it.g.path as unknown as { commands: { command: string; args: number[] }[] }).commands, t));
  }
  return out;
}

/** 줄바꿈 또는 글자 세로 1열 — make_seal.stack_text */
function stackPolys(font: Font, text: string, fs: number, cx: number, cy: number, boxH: number): Poly[] {
  const lines = text.includes("\n") ? text.split("\n") : [...text];
  const pitch = boxH / lines.length;
  const top = cy - (pitch * (lines.length - 1)) / 2;
  const out: Poly[] = [];
  lines.forEach((ln, i) => out.push(...linePolys(font, ln, fs, cx, top + i * pitch)));
  return out;
}

/** 원주를 따라 글자 배치 — make_seal.arc_text. top = 머리가 바깥, bottom = 머리가 중심 */
function arcPolys(font: Font, text: string, cx: number, cy: number, rx: number, ry: number, fs: number, spreadDeg: number, position: "top" | "bottom"): Poly[] {
  const chars = [...text.trim()];
  const n = chars.length;
  if (!n) return [];
  const step = n > 1 ? spreadDeg / (n - 1) : 0;
  const start = -spreadDeg / 2;
  const out: Poly[] = [];
  chars.forEach((ch, i) => {
    const a = ((start + i * step) * Math.PI) / 180;
    let px: number;
    let py: number;
    let rot: number; // 시계 방향(화면), 라디안
    if (position === "top") {
      px = cx + rx * Math.sin(a);
      py = cy - ry * Math.cos(a);
      rot = a;
    } else {
      px = cx + rx * Math.sin(a);
      py = cy + ry * Math.cos(a);
      rot = -a;
    }
    out.push(...charPolys(font, ch, fs, px, py, rot).polys);
  });
  return out;
}

/** 글꼴에 없는 글자 목록. 줄바꿈·공백은 글자로 세지 않는다 */
export function missingGlyphs(font: Font, texts: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const ch of t) {
      if (ch === "\n" || ch === " ") continue;
      const cp = ch.codePointAt(0)!;
      if (!(font as unknown as { hasGlyphForCodePoint(cp: number): boolean }).hasGlyphForCodePoint(cp)) out.add(ch);
    }
  }
  return [...out];
}

export function makeSeal(o: SealOptions): Uint8Array {
  const font = fontkit.create(o.fontBytes) as Font;
  const missing = missingGlyphs(font, [o.name, o.arcText, o.bottomText, o.centerText]);
  if (missing.length) throw new Error(`도장: 동봉 글꼴(나눔고딕)에 없는 글자 ${missing.map((c) => `「${c}」`).join(" ")} — 한글·영문·숫자만 쓰거나 --stamp-png 로 가진 도장을 넣는다`);
  const shape = o.shape ?? "circle";
  const size = o.size ?? 480;
  const ratio = o.ratio ?? 0.72;
  const W = size;
  const H = shape === "ellipse" ? Math.round(size * ratio) : size;
  const cv = new Canvas(W, H, 4);
  const cx = W / 2;
  const cy = H / 2;
  const ringW = o.ring ?? Math.max(3, Math.round(size * 0.0115));
  const m = W * 0.085;
  const box = shape === "ellipse" ? [m, m * ratio, W - m, H - m * ratio] : [m, m, W - m, H - m];
  const [bx0, by0, bx1, by1] = box as [number, number, number, number];

  // 외곽 테두리
  const outerRing = (x0: number, y0: number, x1: number, y1: number, w: number, rad: number) => {
    if (shape === "square") return ring(roundedRectPoly(x0, y0, x1, y1, rad), roundedRectPoly(x0 + w, y0 + w, x1 - w, y1 - w, Math.max(1, rad - w)));
    const rx = (x1 - x0) / 2;
    const ry = (y1 - y0) / 2;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    return ring(ellipsePoly(mx, my, rx, ry), ellipsePoly(mx, my, rx - w, ry - w));
  };
  cv.fill(outerRing(bx0, by0, bx1, by1, ringW, W * 0.035));
  if (o.innerRing) {
    const d = ringW * 2.2;
    cv.fill(outerRing(bx0 + d, by0 + d, bx1 - d, by1 - d, o.innerRing, W * 0.025));
  }

  const inner = bx1 - bx0 - 2 * ringW;
  const polys: Poly[] = [];
  let boldR = 0; // 글자 굵기(가장 큰 글자 크기 기준)
  if (o.arcText || o.bottomText) {
    const RX = (bx1 - bx0) / 2 - ringW * 1.3;
    const RY = (by1 - by0) / 2 - ringW * 1.3;
    if (o.arcText) {
      const nArc = [...o.arcText.trim()].length;
      const cap = o.bottomText ? 200 : 265;
      const spread = o.arcSpread || Math.min(cap, Math.max(90, 27 * nArc));
      const fs = inner * (nArc <= 6 ? 0.17 : nArc <= 9 ? 0.15 : 0.128);
      boldR = Math.max(boldR, fs * 0.03);
      polys.push(...arcPolys(font, o.arcText, cx, cy, RX - fs * 0.55, RY - fs * 0.55, fs, spread, "top"));
    }
    if (o.bottomText) {
      const nB = [...o.bottomText.trim()].length;
      const bSpread = o.bottomSpread || Math.min(120, Math.max(40, 11 * nB));
      const fs = inner * 0.1;
      polys.push(...arcPolys(font, o.bottomText, cx, cy, RX - fs * 0.62, RY - fs * 0.62, fs, bSpread, "bottom"));
    }
    if (o.centerText) {
      const lines = o.centerText.includes("\n") ? o.centerText.split("\n") : [...o.centerText];
      const fs = inner * (lines.length <= 2 ? 0.22 : lines.length === 3 ? 0.165 : 0.135);
      boldR = Math.max(boldR, fs * 0.03);
      // 세로로 쌓는 줄이 많으면 상자를 키워 글자가 겹치지 않게(원본 0.40 은 4자에서 겹쳤다)
      polys.push(...stackPolys(font, o.centerText, fs, cx, cy, inner * (lines.length <= 2 ? 0.4 : 0.58)));
    }
  } else {
    const txt = (o.centerText || o.name || "").trim();
    if (!txt) throw new Error("name 또는 centerText 가 필요하다(공백만은 안 된다)");
    if (shape === "ellipse" && !txt.includes("\n")) {
      // 가로 타원은 세로 공간이 좁아 글자를 세로로 쌓으면 위아래로 테두리를 넘는다(v0.5.2 한글 렌더 실측). 한 줄 가로로 놓는다
      const n = [...txt].length;
      const innerH = by1 - by0 - 2 * ringW;
      const fs = Math.min((inner * 0.7) / n, innerH * 0.5);
      boldR = fs * 0.035;
      polys.push(...linePolys(font, txt, fs, cx, cy));
    } else {
      const lines = txt.includes("\n") ? txt.split("\n") : [...txt];
      const n = lines.length;
      const usable = inner * 0.8;
      const k = ({ 1: 0.85, 2: 0.9, 3: 0.94, 4: 0.96 } as Record<number, number>)[n] ?? 0.94;
      const fs = (usable / n) * k;
      boldR = fs * 0.035;
      polys.push(...stackPolys(font, txt, fs, cx, cy, usable));
    }
  }
  cv.fillBold(polys, boldR);
  const [r, g, b] = o.color ?? [230, 0, 18];
  return encodePng(W, H, cv.toRgba(r, g, b));
}
