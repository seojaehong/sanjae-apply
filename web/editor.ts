import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFDocumentLoadingTask } from "pdfjs-dist";
import { fillPdf, fetchAssets } from "./fill.js";
import type { SlotDetail } from "../src/fill/describe.js";

GlobalWorkerOptions.workerSrc = new URL("app/pdf.worker.min.mjs", document.baseURI).href;

const ID = "F_YOYANG_APPLY";
const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing editor element: ${id}`);
  return node as T;
};

/** Only this dialog session holds claimant values. Closing it discards all values and PDF bytes. */
export async function openEditor(): Promise<void> {
  const dialog = el<HTMLDialogElement>("editor");
  if (dialog.open) return;
  const form = el<HTMLFormElement>("editor-fields");
  const status = el<HTMLParagraphElement>("editor-status");
  const download = el<HTMLButtonElement>("editor-download");
  const preview = el<HTMLDivElement>("editor-preview");
  const prev = el<HTMLButtonElement>("editor-prev");
  const next = el<HTMLButtonElement>("editor-next");
  const retry = el<HTMLButtonElement>("editor-retry");
  const values: Record<string, string | boolean> = {};
  let bytes: Uint8Array | undefined;
  let pdf: PDFDocumentProxy | undefined;
  let pdfTask: PDFDocumentLoadingTask | undefined;
  let pageNumber = 1;
  let revision = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  const events = new AbortController();
  const listen = { signal: events.signal };
  let assets = fetchAssets();
  let map: ReturnType<typeof assets.map> | undefined;
  let originalPdf: ReturnType<typeof assets.pdf> | undefined;
  let font: ReturnType<typeof assets.font> | undefined;
  // Cache only public source assets. Generated claimant PDFs never enter this cache.
  const source = { ...assets, map: () => (map ??= assets.map(ID)), pdf: () => (originalPdf ??= assets.pdf(ID)), font: () => (font ??= assets.font()) };

  const fail = (): void => {
    bytes = undefined;
    download.disabled = true;
    preview.replaceChildren();
    preview.setAttribute("aria-busy", "false");
    status.textContent = "PDF를 만들지 못했습니다. 연결 상태와 입력값을 확인하고 다시 시도하세요.";
    retry.hidden = false;
    // Do not log error details: third-party errors may contain claimant text.
    console.error("PDF editor operation failed");
  };
  const enqueue = (job: () => Promise<void>): void => {
    queue = queue.then(async () => {
      if (closed) return;
      try { await job(); } catch { if (!closed) fail(); }
    });
  };
  const draw = async (version: number): Promise<void> => {
    const current = pdf;
    if (!current || closed || revision !== version) return;
    const page = await current.getPage(pageNumber);
    const width = Math.max(220, preview.clientWidth - 24);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * scale);
    canvas.height = Math.floor(viewport.height * scale);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `채운 요양급여신청서 ${pageNumber}쪽 미리보기`);
    await page.render({ canvas, viewport, transform: [scale, 0, 0, scale, 0, 0] }).promise;
    if (closed || revision !== version) return;
    preview.replaceChildren(canvas);
    preview.setAttribute("aria-busy", "false");
    el("editor-page").textContent = `${pageNumber} / ${current.numPages}쪽`;
    el("editor-page-note").textContent = pageNumber > 2 ? "이 쪽은 의료기관이 작성하는 소견서입니다. 원본 그대로 포함됩니다." : "입력한 내용과 서식의 칸을 대조해 주세요.";
    prev.disabled = pageNumber === 1;
    next.disabled = pageNumber === current.numPages;
  };
  const update = async (version: number): Promise<void> => {
    if (version !== revision) return;
    const result = await fillPdf(ID, { ...values }, { assets: source });
    if (closed || version !== revision) return;
    const old = pdfTask;
    // PDF.js transfers the provided typed array to its worker. Keep the download bytes separate.
    const loading = getDocument({
      data: result.bytes.slice(), useWasm: false,
      cMapUrl: new URL("assets/pdfjs/cmaps/", document.baseURI).href, cMapPacked: true,
      standardFontDataUrl: new URL("assets/pdfjs/standard_fonts/", document.baseURI).href,
    });
    let doc: PDFDocumentProxy;
    try { doc = await loading.promise; } catch (error) { await loading.destroy(); throw error; }
    if (closed || version !== revision) { await loading.destroy(); return; }
    pdf = doc;
    pdfTask = loading;
    if (old) await old.destroy();
    await draw(version);
    if (closed || version !== revision) return;
    bytes = result.bytes;
    download.disabled = false;
    retry.hidden = true;
    status.textContent = result.report.shrunk.length
      ? "미리보기를 갱신했습니다. 긴 입력은 글자 크기를 줄였습니다. 내려받기 전에 확인하세요."
      : "미리보기를 갱신했습니다. PDF를 내려받을 수 있습니다.";
  };
  const schedule = (immediate = false): void => {
    const version = ++revision;
    bytes = undefined;
    download.disabled = true;
    if (timer) clearTimeout(timer);
    if (form.querySelector("[aria-invalid=true]")) {
      status.textContent = "숫자 칸의 글자와 자리 수를 확인해 주세요. 공백과 하이픈은 빼고 처리합니다.";
      preview.setAttribute("aria-busy", "false");
      return;
    }
    status.textContent = "입력한 내용으로 미리보기를 만들고 있습니다.";
    preview.setAttribute("aria-busy", "true");
    timer = setTimeout(() => enqueue(() => update(version)), immediate ? 0 : 500);
  };
  const readValues = (): void => {
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-slot]")) {
      const key = input.dataset.slot!;
      if (input instanceof HTMLInputElement && (input.type === "radio" || input.type === "checkbox")) values[key] = input.checked;
      else if (input.dataset.boxes) {
        const compact = input.value.replace(/[\s-]/g, "");
        input.setAttribute("aria-invalid", String(!/^\d*$/.test(compact) || compact.length > Number(input.dataset.boxes)));
        values[key] = compact;
      } else values[key] = input.value;
    }
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    revision++;
    if (timer) clearTimeout(timer);
    events.abort();
    form.replaceChildren();
    preview.replaceChildren();
    for (const key of Object.keys(values)) delete values[key];
    bytes = undefined;
    const old = pdfTask;
    pdf = undefined;
    pdfTask = undefined;
    queue = queue.then(async () => { if (old) await old.destroy(); }).catch(() => console.error("PDF editor cleanup failed"));
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener("close", close, listen);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); }, listen);
  window.addEventListener("pagehide", close, listen);
  el("editor-close").addEventListener("click", close, listen);
  el("editor-reset").addEventListener("click", () => {
    form.reset();
    for (const input of form.querySelectorAll("[aria-invalid]")) input.removeAttribute("aria-invalid");
    for (const key of Object.keys(values)) delete values[key];
    schedule(true);
  }, listen);
  form.addEventListener("submit", (event) => event.preventDefault(), listen);
  form.addEventListener("input", () => { readValues(); schedule(); }, listen);
  form.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-clear-group]");
    if (!button) return;
    for (const input of form.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
      if (input.name === button.dataset.clearGroup) input.checked = false;
    }
    readValues(); schedule();
  }, listen);
  retry.addEventListener("click", () => {
    // Public-asset promises may be rejected; discard only that cache, keeping claimant values.
    map = undefined; originalPdf = undefined; font = undefined;
    assets = fetchAssets();
    if (!form.childElementCount) { close(); void openEditor().catch(() => console.error("PDF editor retry failed")); }
    else schedule(true);
  }, listen);
  for (const [button, delta] of [[prev, -1], [next, 1]] as const) {
    button.addEventListener("click", () => {
      if (!pdf) return;
      pageNumber = Math.max(1, Math.min(pdf.numPages, pageNumber + delta));
      const version = revision;
      enqueue(() => draw(version));
    }, listen);
  }
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const version = revision; enqueue(() => draw(version)); }, 200);
  }, listen);
  download.addEventListener("click", () => {
    if (!bytes || download.disabled) return;
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = "요양급여신청서.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, listen);
  form.replaceChildren(); preview.replaceChildren();
  dialog.dataset.view = "inputs";
  for (const [id, view] of [["editor-show-inputs", "inputs"], ["editor-show-preview", "preview"]] as const) {
    el(id).setAttribute("aria-pressed", String(view === "inputs"));
    el(id).addEventListener("click", () => {
      dialog.dataset.view = view;
      dialog.querySelector(".editor-body")?.scrollTo(0, 0);
      el("editor-show-inputs").setAttribute("aria-pressed", String(view === "inputs"));
      el("editor-show-preview").setAttribute("aria-pressed", String(view === "preview"));
      if (view === "preview") { preview.setAttribute("aria-busy", "true"); const version = revision; enqueue(() => draw(version)); }
    }, listen);
  }
  download.disabled = true; prev.disabled = true; next.disabled = true; retry.hidden = true;
  el("editor-page").textContent = "준비 중";
  status.textContent = "서식의 칸과 원본 PDF를 준비하고 있습니다.";
  dialog.showModal();
  try {
    const response = await fetch("data/forms.json");
    if (!response.ok) throw new Error("Form catalog unavailable");
    const catalog = await response.json() as { forms: { id: string; slots: SlotDetail[] }[] };
    const schema = catalog.forms.find((entry) => entry.id === ID);
    if (!schema || schema.slots.length !== 74) throw new Error("Unexpected form schema");
    if (closed) return;
    buildFields(form, schema.slots);
    if (!closed) schedule(true);
  } catch { if (!closed) fail(); }
}

function buildFields(form: HTMLFormElement, slots: SlotDetail[]): void {
  for (const page of [1, 2]) {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    title.textContent = page === 1 ? "1쪽 · 재해자와 재해 내용" : "2쪽 · 다른 보상과 개인정보 동의";
    section.append(title);
    const groups = new Set<string>();
    for (const slot of slots.filter((s) => s.page === page)) {
      if (slot.selection_group) {
        if (groups.has(slot.selection_group)) continue;
        groups.add(slot.selection_group);
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = slot.group ?? "선택";
        fieldset.append(legend);
        const hint = document.createElement("p");
        hint.className = "editor-hint";
        hint.textContent = slot.exclusive ? "하나만 선택 · 미선택 가능" : "해당하는 항목 모두 선택";
        fieldset.append(hint);
        for (const choice of slots.filter((s) => s.selection_group === slot.selection_group)) fieldset.append(field(choice));
        if (slot.exclusive) {
          const clear = document.createElement("button");
          clear.type = "button"; clear.className = "editor-clear";
          clear.dataset.clearGroup = slot.selection_group; clear.textContent = "선택 지우기";
          clear.setAttribute("aria-label", `${slot.group} 선택 지우기`);
          fieldset.append(clear);
        }
        section.append(fieldset);
      } else section.append(field(slot));
    }
    form.append(section);
  }
}

function field(slot: SlotDetail): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = slot.kind === "check" ? "editor-choice" : "editor-field";
  const text = document.createElement("span");
  text.textContent = slot.kind === "check" && slot.selection_group && slot.label.includes(":") ? slot.label.slice(slot.label.indexOf(":") + 1).trim() : slot.label;
  const input = slot.kind === "multiline" ? document.createElement("textarea") : document.createElement("input");
  input.dataset.slot = slot.key;
  input.autocomplete = "off";
  input.spellcheck = false;
  if (input instanceof HTMLInputElement) {
    input.type = slot.kind === "check" ? (slot.exclusive ? "radio" : "checkbox") : "text";
    if (slot.selection_group) input.name = slot.selection_group;
    if (slot.kind === "boxes") { input.dataset.boxes = String(slot.boxes); input.inputMode = "numeric"; }
  } else input.rows = 5;
  // Values have no form names and are never submitted, serialized into a URL, or persisted.
  if (slot.kind === "check") label.append(input, text);
  else label.append(text, input);
  return label;
}
