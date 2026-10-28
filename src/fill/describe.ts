// 지도 → 서식 설명. CLI `catalog`·MCP `get_form_catalog`·안내 페이지 forms.json 이 같은 함수를 쓴다(파일을 읽지 않는다).
import type { FormMap } from "./overlay.js";

export interface SlotDetail {
  key: string;
  kind: "text" | "boxes" | "check" | "multiline";
  label: string;
  page: number;
  /** boxes 칸의 자리 수(주민번호 13 등) */
  boxes?: number;
  /** 체크 칸 라벨의 「:」 앞 — 화면에서 묶어 보이는 용도일 뿐, 하나만 고르는 묶음인지는 뜻하지 않는다 */
  group?: string;
}

export interface FormDescription {
  slots: string[];
  /** 칸 이름 → 서식 원문 글자. checkHint 면 체크 칸에 「 (체크: true)」 를 붙인다(MCP) */
  slot_labels: Record<string, string>;
  stamps: string[];
  slot_details: SlotDetail[];
}

export function describeForm(map: FormMap, opt: { checkHint?: boolean } = {}): FormDescription {
  const entries = Object.entries(map.slots);
  return {
    slots: entries.map(([k]) => k),
    slot_labels: Object.fromEntries(entries.map(([k, s]) => [k, `${s.label ?? ""}${opt.checkHint && s.kind === "check" ? " (체크: true)" : ""}`])),
    stamps: Object.keys(map.stamps ?? {}),
    slot_details: entries.map(([key, s]) => {
      const d: SlotDetail = { key, kind: s.kind, label: s.label ?? "", page: s.page };
      if (s.kind === "boxes") d.boxes = s.boxes.length;
      if (s.kind === "check" && s.label?.includes(":")) d.group = s.label.slice(0, s.label.indexOf(":")).trim();
      return d;
    }),
  };
}
