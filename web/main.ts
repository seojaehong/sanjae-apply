// 안내 페이지 동작: 신청 전 확인표 → 엔진 → 결과, 연결 탭, 복사 버튼.
// 선택지의 문구는 index.html 에 있다(고치기 쉽게). 숫자·서식 표는 빌드 때 index.html 에 구워져 있다(scripts/build_web_data.mjs).
import { buildPackage, normalizeInput, toCheckArgs, type ClaimInput, type Package } from "./engine.js";
import { lawUrl } from "./law.js";

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FORM_STATUS = { REQUIRED: "필수", CONDITIONAL: "해당하면", NOT_APPLICABLE: "해당 없음" } as const;
const ATT_STATUS = { PROVIDED: "준비함", MISSING: "필요", SUBSTITUTABLE: "다른 서류로 갈음" } as const;

/** 서식 id → 한글 출력 가능 여부. 빌드가 index.html 의 #fillable-data 에 넣는다 */
function readFillable(): Map<string, { hwpx: boolean }> {
  try {
    return new Map(Object.entries(JSON.parse($("#fillable-data")?.textContent ?? "{}") as Record<string, { hwpx: boolean }>));
  } catch (e) {
    console.error("fillable-data", e);
    return new Map();
  }
}
const fillable = readFillable();
const have = new Set<string>();

function readInput(form: HTMLFormElement): ClaimInput {
  const fd = new FormData(form);
  const str = (k: string) => (fd.get(k) as string | null) ?? undefined;
  return normalizeInput({
    claim: str("claim"),
    accident: str("accidentKind"),
    thirdParty: str("thirdParty"),
    ended: str("treatmentEnded"),
    tags: fd.getAll("tags") as string[],
    have: [...have],
  });
}

function basisHtml(basis: Package["forms"][number]["basis"]): string {
  return basis.map((b) => {
    const url = lawUrl(b.cite);
    const cite = url ? `<a href="${url}" target="_blank" rel="noopener">${esc(b.cite)}</a>` : esc(b.cite);
    return `${cite} <span class="law-title">${esc(b.title)}</span>`;
  }).join("<br>");
}

function render(pkg: Package, input: ClaimInput, animate: boolean) {
  const ready = pkg.status === "READY_TO_SUBMIT";
  const seal = $("#seal")!;
  seal.dataset.state = ready ? "ready" : "open";
  seal.innerHTML = ready ? "<span>제출할 수 있는</span><span>상태</span>" : "<span>확인할 것이</span><span>남음</span>";
  if (animate) {
    seal.classList.remove("stamp");
    void seal.offsetWidth; // 다시 찍는 움직임
    seal.classList.add("stamp");
  }

  const forms = pkg.forms.filter((f) => f.status !== "NOT_APPLICABLE");
  const skipped = pkg.forms.filter((f) => f.status === "NOT_APPLICABLE");
  const needed = pkg.attachments.filter((a) => a.status !== "PROVIDED").length;
  const q = pkg.open_confirmations.length;

  $("#result-summary")!.innerHTML = [
    ["서식", forms.length],
    ["준비할 첨부", needed],
    ["남은 질문", q],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  // 화면 낭독기에는 이 한 줄만 읽힌다(결과 전체를 다시 읽지 않게)
  $("#result-status")!.textContent = `${ready ? "제출할 수 있는 상태" : "확인할 것이 남음"}. 서식 ${forms.length}개, 준비할 첨부 ${needed}개, 남은 질문 ${q}개.`;

  const formRows = forms.map((f) => {
    const fill = fillable.get(f.id);
    const fillNote = fill ? `<a class="fill-note" href="#form-${f.id}">${fill.hwpx ? "PDF·한글로 채울 수 있음" : "PDF로 채울 수 있음"}</a>` : "";
    return `<li class="r-row">
      <div class="r-head"><span class="r-title">${esc(f.title)}</span><span class="tag tag-${f.status}">${FORM_STATUS[f.status]}</span></div>
      ${f.condition ? `<p class="r-cond">${esc(f.condition)}</p>` : ""}
      <p class="r-basis">${basisHtml(f.basis)}</p>${fillNote}
    </li>`;
  }).join("");

  const attRows = pkg.attachments.map((a) => `<li class="r-row">
      <div class="r-head"><span class="r-title">${esc(a.title)}</span>
        <button type="button" class="have" data-id="${a.id}" aria-pressed="${have.has(a.id)}">준비함</button></div>
      ${a.status === "SUBSTITUTABLE" && a.substitute ? `<p class="r-cond">갈음: ${esc(a.substitute)}</p>` : ""}
      <p class="r-status">${ATT_STATUS[a.status]}</p>
    </li>`).join("");

  const qRows = pkg.open_confirmations.map((c) => `<li>${esc(c.question)}</li>`).join("");
  const notes = pkg.notes.map((n) => `<li>${esc(n)}</li>`).join("");

  $("#result")!.innerHTML = `
    <h4 class="r-h">서식</h4><ul class="r-list">${formRows}</ul>
    ${skipped.length ? `<p class="r-skip">해당 없음: ${skipped.map((f) => esc(f.title)).join(", ")}</p>` : ""}
    ${attRows ? `<h4 class="r-h">첨부</h4><ul class="r-list">${attRows}</ul>` : ""}
    ${qRows ? `<h4 class="r-h">아직 답하지 않은 것</h4><ul class="r-q">${qRows}</ul>` : ""}
    ${notes ? `<h4 class="r-h">절차 메모</h4><ul class="r-notes">${notes}</ul>` : ""}`;

  $("#cli-line")!.textContent = ["npx -y sanjae-apply check", ...toCheckArgs(input)].join(" ");
}

function run(animate = true) {
  const form = $<HTMLFormElement>("#sheet")!;
  try {
    let input = readInput(form);
    let pkg = buildPackage(input);
    // 지금 목록에 없는 첨부의 「준비함」은 덜어 낸다 — 명령줄 한 줄의 --have 도 같이 정리된다
    const ids = new Set(pkg.attachments.map((a) => a.id));
    if ([...have].some((id) => !ids.has(id))) {
      for (const id of have) if (!ids.has(id)) have.delete(id);
      input = readInput(form);
      pkg = buildPackage(input);
    }
    render(pkg, input, animate);
  } catch (e) {
    console.error("확인표", e);
    $("#result")!.innerHTML = `<p class="r-skip">확인표 값을 읽지 못했습니다. 새로고침해 주세요. 계속되면 GitHub 이슈로 알려 주세요.</p>`;
  }
}

function initSheet() {
  const form = $<HTMLFormElement>("#sheet");
  if (!form) return;
  form.addEventListener("submit", (e) => e.preventDefault()); // 고른 값을 주소에 붙여 보내지 않는다
  form.addEventListener("change", () => run());
  $("#result")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.have");
    if (!b) return;
    const id = b.dataset.id!;
    have.has(id) ? have.delete(id) : have.add(id);
    run();
    $<HTMLButtonElement>(`button.have[data-id="${id}"]`)?.focus(); // 다시 그린 뒤 같은 버튼으로
  });
  run(false);
}

function initTabs() {
  document.querySelectorAll<HTMLElement>("[role=tablist]").forEach((list) => {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    const select = (t: HTMLButtonElement) => {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(x.getAttribute("aria-controls") ?? "");
        if (panel) panel.hidden = !on;
      });
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t));
      t.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        const n = tabs[(i + d + tabs.length) % tabs.length]!;
        select(n);
        n.focus();
      });
    });
  });
}

function initCopy() {
  document.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.copy");
    if (!b) return;
    const src = document.getElementById(b.dataset.for ?? "");
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src.textContent ?? "");
      b.textContent = "복사함";
    } catch {
      b.textContent = "직접 선택해 복사하세요";
    }
    setTimeout(() => (b.textContent = "복사"), 1600);
  });
}

// 하나가 실패해도 나머지는 돈다
for (const [name, init] of [["확인표", initSheet], ["탭", initTabs], ["복사", initCopy]] as const) {
  try {
    init();
  } catch (e) {
    console.error(name, e);
  }
}
