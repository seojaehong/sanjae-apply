// 공단 PDF 서식 위에 값을 얹는다(서식 재현 금지 — 원본 PDF 를 바탕으로 쓴다).
// 좌표는 forms/maps/<FORM_ID>.json 에 둔다. 단위 pt, 원점은 쪽 왼쪽 위(PyMuPDF 와 같다). pdf-lib 는 왼쪽 아래 원점이라 여기서 뒤집는다.
// 값은 메모리에서만 다루고 디스크·로그에 남기지 않는다. 호출자가 돌려받은 바이트를 어디에 둘지 정한다.

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pngInfo } from "../stamp/png.js";

export interface TextSlot {
  kind: "text";
  page: number;
  /** 글자 왼쪽 아래 기준 x (pt, 왼쪽 위 원점 좌표계의 x) */
  x: number;
  /** 글자 기준선 y (pt, 왼쪽 위 원점) */
  y: number;
  size?: number;
  /** 넘치면 줄여 쓴다 */
  maxWidth?: number;
}
export interface BoxesSlot {
  kind: "boxes";
  page: number;
  /** 한 글자씩 넣을 상자들. 왼쪽 위 원점 */
  boxes: { x0: number; y0: number; x1: number; y1: number }[];
  size?: number;
}
export interface CheckSlot {
  kind: "check";
  page: number;
  /** 「[ ]」 괄호 안 중심 */
  x: number;
  y: number;
  size?: number;
}
export interface MultilineSlot {
  kind: "multiline";
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size?: number;
  lineHeight?: number;
}
/** label = 서식 원문 글자로 쓴 칸 설명. AI 클라이언트가 칸 이름을 고를 때 본다(get_form_catalog 의 slot_labels) */
export type Slot = (TextSlot | BoxesSlot | CheckSlot | MultilineSlot) & { label?: string };

/** 도장 자리 — 「(서명 또는 인)」 글자 상자 중심(왼쪽 위 원점 pt)과 지름 */
export interface StampSpot {
  page: number;
  x: number;
  y: number;
  size: number;
}

export interface FormMap {
  form_id: string;
  /** forms/catalog.json 의 파일명과 sha256 — 좌표가 어느 판본의 것인지 */
  source_file: string;
  source_sha256: string;
  page_size: { width: number; height: number };
  slots: Record<string, Slot>;
  /** Explicitly reviewed source-form choices; label prefixes never imply exclusivity. */
  check_groups?: { id: string; label: string; exclusive: boolean; keys: string[] }[];
  /** applicant = 신청인 본인 서명란. 그 밖(consent·delegation 등)은 서식마다 */
  stamps?: Record<string, StampSpot>;
}

export interface FillOptions {
  fontBytes: Uint8Array;
  /** 글꼴 서브셋 임베딩. 기본 true. 글꼴에 따라 서브셋이 글리프를 잃는 경우가 있어(261026 나눔고딕 운영 실측) 끌 수 있다 */
  subset?: boolean;
  /** 값. 키는 map.slots 의 키. check 는 true 일 때만 찍는다 */
  values: Record<string, string | boolean | undefined>;
  /** 도장 PNG(투명 배경). 키는 map.stamps 의 키(applicant 등). 지도에 자리가 없으면 건너뛰고 report.stamps_skipped 에 적는다 */
  stamps?: Record<string, Uint8Array> | undefined;
}

export interface FillReport {
  written: string[];
  skipped: string[];
  /** maxWidth 에 맞추려고 글자 크기를 줄인 칸 */
  shrunk: string[];
  /** 찍은 도장 자리 */
  stamped?: string[];
  stamps_skipped?: string[];
}

function flipY(page: PDFPage, yTop: number): number {
  return page.getHeight() - yTop;
}

function fitSize(font: PDFFont, text: string, size: number, maxWidth: number | undefined): number {
  if (!maxWidth) return size;
  let s = size;
  while (s > 5 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  return s;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const ch of para) {
      const next = line + ch;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = ch;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function fillForm(pdfBytes: Uint8Array, map: FormMap, opt: FillOptions): Promise<{ bytes: Uint8Array; report: FillReport }> {
  const doc = await PDFDocument.load(pdfBytes);
  doc.registerFontkit(fontkit);
  // 기본 서브셋 끔. 나눔고딕을 subset:true 로 넣으면 텍스트 추출은 되는데 글리프가 그려지지 않는다(261026 운영 실측, 픽셀 0→0).
  // 전체 임베딩이면 PDF 가 약 1.2MB 가 된다 — 받아들인다.
  const font = await doc.embedFont(opt.fontBytes, { subset: opt.subset ?? false });
  const pages = doc.getPages();
  const report: FillReport = { written: [], skipped: [], shrunk: [] };
  const black = rgb(0, 0, 0);

  for (const [key, slot] of Object.entries(map.slots)) {
    const v = opt.values[key];
    const page = pages[slot.page - 1];
    if (!page) throw new Error(`map ${map.form_id}: ${key} 의 page ${slot.page} 가 없다`);
    if (v === undefined || v === "" || v === false) {
      report.skipped.push(key);
      continue;
    }
    if (slot.kind === "check") {
      const size = slot.size ?? 9;
      page.drawText("√", { x: slot.x - size * 0.3, y: flipY(page, slot.y) - size * 0.35, size, font, color: black });
    } else if (slot.kind === "boxes") {
      const text = String(v).replace(/[^0-9A-Za-z가-힣]/g, "");
      const size = slot.size ?? 9;
      text.split("").slice(0, slot.boxes.length).forEach((ch, i) => {
        const b = slot.boxes[i]!;
        const w = font.widthOfTextAtSize(ch, size);
        page.drawText(ch, { x: (b.x0 + b.x1) / 2 - w / 2, y: flipY(page, (b.y0 + b.y1) / 2) - size * 0.35, size, font, color: black });
      });
    } else if (slot.kind === "multiline") {
      const size = slot.size ?? 8.5;
      const lh = slot.lineHeight ?? size * 1.45;
      const lines = wrap(font, String(v), size, slot.x1 - slot.x0 - 4);
      const maxLines = Math.floor((slot.y1 - slot.y0 - 2) / lh);
      lines.slice(0, maxLines).forEach((ln, i) => {
        page.drawText(ln, { x: slot.x0 + 2, y: flipY(page, slot.y0 + 1 + lh * (i + 1)) + size * 0.25, size, font, color: black });
      });
      if (lines.length > maxLines) report.shrunk.push(`${key}(줄 넘침 ${lines.length - maxLines})`);
    } else {
      const base = slot.size ?? 9;
      const text = String(v);
      const size = fitSize(font, text, base, slot.maxWidth);
      if (size !== base) report.shrunk.push(key);
      page.drawText(text, { x: slot.x, y: flipY(page, slot.y), size, font, color: black });
    }
    report.written.push(key);
  }
  if (opt.stamps) {
    report.stamped = [];
    report.stamps_skipped = [];
    const embedded = new Map<Uint8Array, Awaited<ReturnType<typeof doc.embedPng>>>(); // 같은 그림은 XObject 하나로
    for (const [key, png] of Object.entries(opt.stamps)) {
      const spot = map.stamps?.[key];
      if (!spot) {
        report.stamps_skipped.push(key);
        continue;
      }
      const page = pages[spot.page - 1];
      if (!page) throw new Error(`도장 자리 ${key}: 쪽 ${spot.page} 없음`);
      pngInfo(png);
      let img = embedded.get(png);
      if (!img) {
        img = await doc.embedPng(png);
        embedded.set(png, img);
      }
      const w = spot.size;
      const h = (spot.size * img.height) / img.width;
      page.drawImage(img, { x: spot.x - w / 2, y: flipY(page, spot.y) - h / 2, width: w, height: h });
      report.stamped.push(key);
    }
  }
  return { bytes: await doc.save(), report };
}
