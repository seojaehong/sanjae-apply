// HWPX 채우기 — 한글 2014+ 가 여는 .hwpx(zip + XML)를 한글 없이 채운다. 순수 TS, 어느 OS 에서나 돈다.
// 방식은 우리 hwpx_edit.py(런 단위 글자 교체, charPr·표 구조 보존)를 옮긴 것이다. 손댄 문단의 <hp:linesegarray> 는 지운다
// (안 지우면 한글이 「손상된 파일」 경고를 낸다). 값은 XML 이스케이프한다. 체크는 그 칸의 N번째 「[  ]」만 바꾼다(전역 치환 금지).
//
// 주소 체계 = (표 번호 t, rowAddr r, colAddr c, 문단 순번 p) — 표 번호는 섹션 안 <hp:tbl> 등장 순서(안쪽 표 포함, scripts/probe_hwpx.py 와 같다).
// 지도 JSON 은 forms/hwpx_maps/F_*.json, 칸 이름은 PDF 지도(forms/maps)와 똑같이 쓴다.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type HwpxOp =
  | { kind: "cell"; t: number; r: number; c: number; p?: number; s?: number }
  | { kind: "after"; t: number; r: number; c: number; label: string; s?: number }
  | { kind: "check"; t: number; r: number; c: number; n?: number; s?: number }
  | { kind: "digits"; t: number; r: number; c: number; count: number; start?: number; s?: number }
  /** 같은 행의 이웃 칸(c, c+1, …)에 한 글자씩 — 숫자 상자가 안쪽 표가 아니라 칸으로 나뉜 서식 */
  | { kind: "cells"; t: number; r: number; c: number; count: number; s?: number }
  | { kind: "group"; template: string };

export interface HwpxTemplate {
  t: number;
  r: number;
  c: number;
  p?: number;
  s?: number;
  /** "채용일자: {hire_year}년 {hire_month}월 {hire_day}일" — 참조한 칸 중 하나라도 값이 있으면 문단을 통째로 바꾼다 */
  text: string;
}

export interface HwpxMap {
  form_id: string;
  source_file: string;
  source_sha256: string;
  slots: Record<string, HwpxOp>;
  templates?: Record<string, HwpxTemplate>;
  _about?: string;
}

export interface HwpxFillReport {
  filled: string[];
  skipped: string[];
  errors: string[];
}

const BOX_RE = /\[\s*\]|□|☐/g; // 「[  ]」 → 「[V]」, 「□」 → 「■」
const markFor = (box: string) => (box.startsWith("[") ? "[V]" : "■");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 여는 태그 위치에서 짝이 맞는 닫는 태그 끝 위치(중첩 고려). 자기닫힘은 깊이를 올리지 않는다. */
function findClose(xml: string, start: number, tag: string): number {
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else if (m[1] !== "/") {
      depth++;
    }
  }
  throw new Error(`닫는 태그 없음: ${tag} @${start}`);
}

interface Span {
  start: number;
  end: number;
}

/** 섹션 안 모든 <hp:tbl> (안쪽 표 포함) 등장 순서 */
function allTables(xml: string): Span[] {
  const out: Span[] = [];
  const re = /<hp:tbl\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ start: m.index, end: findClose(xml, m.index, "hp:tbl") });
  return out;
}

/** 어떤 범위 안의 최상위 <hp:tbl> 들 */
function topTables(xml: string, span: Span): Span[] {
  const out: Span[] = [];
  const re = /<hp:tbl\b/g;
  re.lastIndex = span.start;
  let m: RegExpExecArray | null;
  let curEnd = -1;
  while ((m = re.exec(xml)) && m.index < span.end) {
    if (m.index < curEnd) continue;
    curEnd = findClose(xml, m.index, "hp:tbl");
    out.push({ start: m.index, end: curEnd });
  }
  return out;
}

interface Cell extends Span {
  r: number;
  c: number;
  inner: Span[]; // 최상위 안쪽 표
  paras: Span[]; // 안쪽 표 밖의 <hp:p> (문서 순서)
}

/** 표의 직접 칸들 */
function cellsOf(xml: string, tbl: Span): Cell[] {
  // 표 머리(<hp:tbl …>)와 첫 <hp:tr> 사이는 건너뛰고, 안쪽 표의 tc 는 depth 로 거른다
  const out: Cell[] = [];
  const re = /<hp:tc\b/g;
  re.lastIndex = tbl.start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < tbl.end) {
    const end = findClose(xml, m.index, "hp:tc");
    const span = { start: m.index, end };
    const inner = topTables(xml, span);
    const outside = (pos: number) => inner.every((t) => pos < t.start || pos >= t.end);
    const tail = xml.slice(inner.at(-1)?.end ?? m.index, end);
    const addr = /<hp:cellAddr\s+colAddr="(\d+)"\s+rowAddr="(\d+)"/.exec(tail);
    if (!addr) throw new Error(`cellAddr 없음 @${m.index}`);
    const paras: Span[] = [];
    const pre = /<hp:p\b/g;
    pre.lastIndex = m.index;
    let pm: RegExpExecArray | null;
    while ((pm = pre.exec(xml)) && pm.index < end) {
      if (!outside(pm.index)) continue;
      const pe = findClose(xml, pm.index, "hp:p");
      paras.push({ start: pm.index, end: pe });
      pre.lastIndex = pe;
    }
    out.push({ ...span, r: Number(addr[2]), c: Number(addr[1]), inner, paras });
    re.lastIndex = end;
  }
  return out;
}

function paraText(pxml: string): string {
  return [...pxml.matchAll(/<hp:t(?:\s[^>]*)?>(.*?)<\/hp:t>/gs)].map((m) => m[1]).join("");
}

function stripLineseg(pxml: string): string {
  return pxml.replace(/<hp:linesegarray>.*?<\/hp:linesegarray>/gs, "");
}

/**
 * header.xml 의 글자 서식 중 자리표시자 색(회색·파랑)·기울임이 든 것은 검정 정체 사본을 만들어 쓴다.
 * 빈 서식의 예시 글자 서식을 그대로 물려받으면 받는 기관이 보기에 자리표시자다(feedback_blank_form_charpr_placeholder).
 */
class CharPrFixer {
  private header: string;
  private cache = new Map<string, string>();
  private added = 0;
  constructor(header: string) {
    this.header = header;
  }
  /** id 가 검정 정체면 그대로, 아니면 검정 정체 사본의 id */
  black(id: string): string {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const re = new RegExp(`<hh:charPr id="${id}"([^>]*)>(.*?)</hh:charPr>`, "s");
    const m = re.exec(this.header);
    if (!m) {
      this.cache.set(id, id);
      return id;
    }
    const attrs = m[1]!;
    const body = m[2]!;
    const color = /textColor="([^"]+)"/.exec(attrs)?.[1] ?? "#000000";
    const italic = /<hh:italic\b/.test(body);
    if (color.toUpperCase() === "#000000" && !italic) {
      this.cache.set(id, id);
      return id;
    }
    // charPr id 는 0..itemCnt-1 로 빈틈없이 이어져야 한다(건너뛰면 한글이 글자를 못 그린다 — 261027 실측, 점선으로 나옴).
    // 새 id = 지금 itemCnt, 그리고 itemCnt 를 1 올린다. 사본은 charProperties 끝(</hh:charProperties> 직전)에 붙인다.
    const cnt = /<hh:charProperties itemCnt="(\d+)"/.exec(this.header);
    if (!cnt) throw new Error("header.xml 에 charProperties 가 없다");
    const newId = cnt[1]!;
    const newAttrs = attrs.replace(/textColor="[^"]+"/, 'textColor="#000000"');
    const newBody = body.replace(/<hh:italic\b[^>]*\/>/g, "");
    const clone = `<hh:charPr id="${newId}"${newAttrs}>${newBody}</hh:charPr>`;
    this.header = this.header
      .replace("</hh:charProperties>", clone + "</hh:charProperties>")
      .replace(/<hh:charProperties itemCnt="(\d+)"/, (_s, n: string) => `<hh:charProperties itemCnt="${Number(n) + 1}"`);
    this.added++;
    this.cache.set(id, newId);
    return newId;
  }
  get changed(): boolean {
    return this.added > 0;
  }
  get xml(): string {
    return this.header;
  }
}

/** 문단의 글자를 value 로 바꾼다. 첫 run 의 charPr(검정 정체로 교정)을 쓰고 나머지 run 글자는 비운다. 줄바꿈은 문단 복제. */
function setParagraph(pxml: string, value: string, fixer: CharPrFixer): string {
  const lines = value.split(/\r?\n/);
  const one = (line: string): string => {
    let out = stripLineseg(pxml);
    // 기존 <hp:t> 전부 제거(안쪽 표는 이 함수에 오지 않는다 — cell op 는 paras 가 안쪽 표 밖 문단만)
    let first = true;
    out = out.replace(/<hp:run\b([^>]*?)(\/>|>(.*?)<\/hp:run>)/gs, (_m, attrs: string, _rest: string, body?: string) => {
      const keep = (body ?? "").replace(/<hp:t(?:\s[^>]*)?>.*?<\/hp:t>/gs, "");
      if (first) {
        first = false;
        const fixed = attrs.replace(/charPrIDRef="(\d+)"/, (_s, id: string) => `charPrIDRef="${fixer.black(id)}"`);
        return `<hp:run${fixed}>${keep}<hp:t>${esc(line)}</hp:t></hp:run>`;
      }
      return keep.trim() ? `<hp:run${attrs}>${keep}</hp:run>` : "";
    });
    if (first) throw new Error("문단에 run 이 없다");
    return out;
  };
  return lines.map(one).join("");
}

interface Edit extends Span {
  text: string;
}

export interface FillHwpxOptions {
  values: Record<string, string | boolean>;
}

export async function fillHwpx(hwpxBytes: Uint8Array, map: HwpxMap, opts: FillHwpxOptions): Promise<{ bytes: Uint8Array; report: HwpxFillReport }> {
  const files = unzipSync(hwpxBytes);
  const report: HwpxFillReport = { filled: [], skipped: [], errors: [] };
  const headerName = "Contents/header.xml";
  if (!files[headerName]) throw new Error("hwpx 에 Contents/header.xml 이 없다");
  const fixer = new CharPrFixer(strFromU8(files[headerName]));
  const sections = Object.keys(files)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort();
  const xmls = sections.map((n) => strFromU8(files[n]!));
  const tablesBySection = xmls.map(allTables);
  const cellCache = new Map<string, Cell[]>();
  const edits: Edit[][] = xmls.map(() => []);

  const cellOf = (s: number, t: number, r: number, c: number): Cell => {
    const key = `${s}/${t}`;
    if (!cellCache.has(key)) {
      const tbl = tablesBySection[s]?.[t];
      if (!tbl) throw new Error(`표 없음 T${t}`);
      cellCache.set(key, cellsOf(xmls[s]!, tbl));
    }
    const cell = cellCache.get(key)!.find((x) => x.r === r && x.c === c);
    if (!cell) throw new Error(`칸 없음 T${t} r${r} c${c}`);
    return cell;
  };
  const pickPara = (xml: string, cell: Cell, p?: number): Span => {
    if (p !== undefined) {
      const span = cell.paras[p];
      if (!span) throw new Error(`문단 없음 p${p} (문단 ${cell.paras.length}개)`);
      return span;
    }
    const empty = cell.paras.find((sp) => paraText(xml.slice(sp.start, sp.end)).trim() === "");
    const last = cell.paras.at(-1);
    if (!last) throw new Error("칸에 문단이 없다");
    return empty ?? last;
  };

  const apply = (name: string, op: HwpxOp | HwpxTemplate, value: string | boolean, isTemplate = false) => {
    const s = ("s" in op ? op.s : undefined) ?? 0;
    const edit = edits[s]!;
    const xml = xmls[s];
    if (!xml) throw new Error(`섹션 없음 s${s}`);
    if (isTemplate || (op as HwpxOp).kind === "cell") {
      const o = op as HwpxTemplate & { p?: number };
      const cell = cellOf(s, o.t, o.r, o.c);
      const para = pickPara(xml, cell, o.p);
      edit.push({ ...para, text: setParagraph(xml.slice(para.start, para.end), String(value), fixer) });
      return;
    }
    const o = op as HwpxOp;
    if (o.kind === "after") {
      const cell = cellOf(s, o.t, o.r, o.c);
      const tre = /<hp:t(?:\s[^>]*)?>(.*?)<\/hp:t>/gs;
      tre.lastIndex = cell.start;
      let m: RegExpExecArray | null;
      while ((m = tre.exec(xml)) && m.index < cell.end) {
        if (cell.inner.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
        if (m[1]!.includes(o.label)) {
          const at = m.index + m[0].length - "</hp:t>".length;
          edit.push({ start: at, end: at, text: esc(String(value)) });
          const para = cell.paras.find((sp) => m!.index >= sp.start && m!.index < sp.end);
          if (para) {
            const ls = /<hp:linesegarray>.*?<\/hp:linesegarray>/gs;
            ls.lastIndex = para.start;
            const lm = ls.exec(xml);
            if (lm && lm.index < para.end) edit.push({ start: lm.index, end: lm.index + lm[0].length, text: "" });
          }
          return;
        }
      }
      throw new Error(`라벨 없음 「${o.label}」 T${o.t} r${o.r} c${o.c}`);
    }
    if (o.kind === "check") {
      if (value !== true) return;
      const cell = cellOf(s, o.t, o.r, o.c);
      const want = o.n ?? 1;
      let seen = 0;
      const tre = /<hp:t(?:\s[^>]*)?>(.*?)<\/hp:t>/gs;
      tre.lastIndex = cell.start;
      let m: RegExpExecArray | null;
      while ((m = tre.exec(xml)) && m.index < cell.end) {
        if (cell.inner.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
        const open = m[0].length - m[1]!.length - "</hp:t>".length;
        for (const bm of m[1]!.matchAll(BOX_RE)) {
          seen++;
          if (seen === want) {
            const at = m.index + open + bm.index!;
            edit.push({ start: at, end: at + bm[0].length, text: markFor(bm[0]) });
            return;
          }
        }
      }
      throw new Error(`체크 상자 ${want}번째 없음 T${o.t} r${o.r} c${o.c} (상자 ${seen}개)`);
    }
    if (o.kind === "digits") {
      const cell = cellOf(s, o.t, o.r, o.c);
      const chars = [...String(value)];
      const start = o.start ?? 0;
      if (chars.length > o.count) throw new Error(`${name}: 글자 ${chars.length} > 상자 ${o.count}`);
      chars.forEach((ch, i) => {
        const inner = cell.inner[start + i];
        if (!inner) throw new Error(`${name}: 안쪽 표 ${start + i} 없음 (안쪽 표 ${cell.inner.length}개)`);
        const innerCells = cellsOf(xml, inner);
        const para = innerCells[0]?.paras[0];
        if (!para) throw new Error(`${name}: 안쪽 표 ${start + i} 에 문단 없음`);
        edit.push({ ...para, text: setParagraph(xml.slice(para.start, para.end), ch, fixer) });
      });
      return;
    }
    if (o.kind === "cells") {
      const chars = [...String(value)];
      if (chars.length > o.count) throw new Error(`${name}: 글자 ${chars.length} > 칸 ${o.count}`);
      const row = (cellCache.get(`${s}/${o.t}`) ?? (cellOf(s, o.t, o.r, o.c), cellCache.get(`${s}/${o.t}`)!)).filter((x) => x.r === o.r && x.c >= o.c).sort((a, b) => a.c - b.c);
      chars.forEach((ch, i) => {
        const cell = row[i];
        if (!cell) throw new Error(`${name}: 행 r${o.r} 의 ${i + 1}번째 칸 없음`);
        const para = pickPara(xml, cell);
        edit.push({ ...para, text: setParagraph(xml.slice(para.start, para.end), ch, fixer) });
      });
      return;
    }
    throw new Error(`알 수 없는 op: ${JSON.stringify(op)}`);
  };

  const usedTemplates = new Set<string>();
  for (const [name, op] of Object.entries(map.slots)) {
    const value = opts.values[name];
    try {
      if (op.kind === "group") {
        const tpl = map.templates?.[op.template];
        if (!tpl) throw new Error(`템플릿 없음 ${op.template}`);
        if (usedTemplates.has(op.template)) continue;
        const refs = [...tpl.text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
        const any = refs.some((k) => opts.values[k] !== undefined && opts.values[k] !== "");
        if (!any) {
          report.skipped.push(name);
          continue;
        }
        usedTemplates.add(op.template);
        const text = tpl.text.replace(/\{(\w+)\}/g, (_m, k: string) => {
          const v = opts.values[k];
          return v === undefined || v === false ? "" : String(v);
        });
        apply(op.template, tpl, text, true);
        for (const k of refs) if (opts.values[k] !== undefined && opts.values[k] !== "") report.filled.push(k);
        continue;
      }
      if (value === undefined || value === "" || value === false) {
        report.skipped.push(name);
        continue;
      }
      apply(name, op, value);
      report.filled.push(name);
    } catch (e) {
      report.errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  if (report.errors.length) throw new Error(report.errors.join(" | "));

  // 편집 적용 — 겹치면 지도 오류
  edits.forEach((list, s) => {
    if (!list.length) return;
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.start < prev.end && !(prev.start === prev.end || cur.start === cur.end)) {
        throw new Error(`편집 겹침 @${prev.start}-${prev.end} / ${cur.start}-${cur.end}`);
      }
    }
    let out = xmls[s]!;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    files[sections[s]!] = strToU8(out);
  });

  if (fixer.changed) files[headerName] = strToU8(fixer.xml);

  // mimetype 은 zip 첫 항목·무압축이어야 한글이 연다
  const ordered: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  if (files["mimetype"]) ordered["mimetype"] = [files["mimetype"], { level: 0 }];
  for (const [n, d] of Object.entries(files)) if (n !== "mimetype") ordered[n] = [d, { level: 6 }];
  return { bytes: zipSync(ordered), report };
}

/** 채운 hwpx 의 글자(섹션 전부, 안쪽 표 포함)를 돌려준다 — 시험·검증용 */
export function hwpxText(hwpxBytes: Uint8Array): string {
  const files = unzipSync(hwpxBytes);
  return Object.keys(files)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort()
    .map((n) => paraText(strFromU8(files[n]!)))
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
