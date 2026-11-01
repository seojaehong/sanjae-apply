// Forms the browser editor supports. Shared by the page (entry buttons) and the editor (dialog titles).
// Page titles fall back to "N쪽"; `sourceFrom` marks pages kept as the original.
export interface EditorForm {
  title: string;
  pages?: Record<number, string>;
  sourceFrom?: { page: number; note: string };
}

export const EDITOR_FORMS: Record<string, EditorForm> = {
  F_YOYANG_APPLY: {
    title: "요양급여신청서",
    pages: { 1: "1쪽 · 재해자와 재해 내용", 2: "2쪽 · 다른 보상과 개인정보 동의" },
    sourceFrom: { page: 3, note: "이 쪽은 의료기관이 작성하는 소견서입니다. 원본 그대로 포함됩니다." },
  },
  F_UNPAID_CLAIM: { title: "미지급 보험급여 청구서" },
};

export const editorForm = (id: string): EditorForm | undefined => (Object.hasOwn(EDITOR_FORMS, id) ? EDITOR_FORMS[id] : undefined);
