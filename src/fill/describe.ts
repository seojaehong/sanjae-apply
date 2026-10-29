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
  /** Stable source-form group id, only present for explicitly reviewed groups. */
  selection_group?: string;
  exclusive?: boolean;
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
  const groups = new Map<string, NonNullable<FormMap["check_groups"]>[number]>();
  const ids = new Set<string>();
  for (const group of map.check_groups ?? []) {
    if (!group.id || ids.has(group.id) || group.keys.length < 2) throw new Error(`Invalid check group: ${group.id}`);
    ids.add(group.id);
    const pages = new Set<number>();
    for (const key of group.keys) {
      const slot = map.slots[key];
      if (!slot || slot.kind !== "check" || groups.has(key)) throw new Error(`Invalid check group member: ${key}`);
      pages.add(slot.page);
      groups.set(key, group);
    }
    if (pages.size !== 1) throw new Error(`Check group spans pages: ${group.id}`);
  }
  return {
    slots: entries.map(([k]) => k),
    slot_labels: Object.fromEntries(entries.map(([k, s]) => [k, `${s.label ?? ""}${opt.checkHint && s.kind === "check" ? " (체크: true)" : ""}`])),
    stamps: Object.keys(map.stamps ?? {}),
    slot_details: entries.map(([key, s]) => {
      const d: SlotDetail = { key, kind: s.kind, label: s.label ?? "", page: s.page };
      if (s.kind === "boxes") d.boxes = s.boxes.length;
      if (s.kind === "check" && s.label?.includes(":")) d.group = s.label.slice(0, s.label.indexOf(":")).trim();
      const group = groups.get(key);
      if (group) {
        d.group = group.label;
        d.selection_group = group.id;
        d.exclusive = group.exclusive;
      }
      return d;
    }),
  };
}
