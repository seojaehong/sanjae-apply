// 규칙 공통 — 서식·첨부 항목 생성과 결과 누적기.
import { ATTACHMENTS, FORMS, type AttachmentId, type FormId } from "../core/catalog.js";
import type { AttachmentItem, ClaimInput, FormItem, OpenConfirmation } from "../core/types.js";

export interface RuleResult {
  rules: string[];
  forms: FormItem[];
  attachments: AttachmentItem[];
  open_confirmations: OpenConfirmation[];
  notes: string[];
}

export class Acc {
  readonly r: RuleResult = { rules: [], forms: [], attachments: [], open_confirmations: [], notes: [] };
  private readonly have: Set<string>;
  constructor(readonly input: ClaimInput) {
    this.have = new Set(input.have ?? []);
  }
  rule(id: string): this {
    if (!this.r.rules.includes(id)) this.r.rules.push(id);
    return this;
  }
  form(id: FormId, status: FormItem["status"], condition?: string): this {
    const d = FORMS[id];
    const item: FormItem = { id: d.id, title: d.title, status, basis: d.basis };
    if (condition) item.condition = condition;
    this.r.forms.push(item);
    return this;
  }
  attach(id: AttachmentId, substituteOverride?: string): this {
    const d = ATTACHMENTS[id];
    const provided = this.have.has(d.id);
    const substitute = substituteOverride ?? d.substitute;
    const status: AttachmentItem["status"] = provided ? "PROVIDED" : substitute ? "SUBSTITUTABLE" : "MISSING";
    const item: AttachmentItem = { id: d.id, title: d.title, status, basis: d.basis };
    if (!provided && substitute) item.substitute = substitute;
    this.r.attachments.push(item);
    return this;
  }
  ask(field: keyof ClaimInput, question: string, affects: string[]): this {
    this.r.open_confirmations.push({ field, question, affects });
    return this;
  }
  note(text: string): this {
    this.r.notes.push(text);
    return this;
  }
  has(tag: NonNullable<ClaimInput["tags"]>[number]): boolean {
    return (this.input.tags ?? []).includes(tag);
  }
}
