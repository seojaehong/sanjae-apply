// 안내 페이지 동작: 신청 전 확인표 → 엔진 → 결과, 연결 탭, 서식 표.
// 선택지의 문구는 index.html 에 있다(고치기 쉽게). 여기는 읽고 그리는 일만 한다.
import { buildPackage, type ClaimInput, type Package } from "./engine.js";

type FormsData = {
  version: string;
  total_slots: number;
  forms: { id: string; title: string; revised: string | null; source_url: string | null; pdf: boolean; hwpx: boolean; stamps: string[]; slots: { key: string; kind: string; label: string }[] }[];
};

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const FORM_STATUS = { REQUIRED: "필수", CONDITIONAL: "해당하면", NOT_APPLICABLE: "해당 없음" } as const;
const ATT_STATUS = { PROVIDED: "준비함", MISSING: "필요", SUBSTITUTABLE: "다른 서류로 갈음" } as const;

let fillable = new Map<string, FormsData["forms"][number]>();
const have = new Set<string>();

// 「산업재해보상보험법 시행규칙 제20조」 → 국가법령정보센터 조문 주소
function lawLink(cite: string): string {
  const m = cite.match(/^(.+?)\s(제\d+조(?:의\d+)?)/);
  if (!m) return "https://www.law.go.kr/";
  return `https://www.law.go.kr/법령/${encodeURIComponent(m[1]!.replace(/\s/g, ""))}/${encodeURIComponent(m[2]!)}`;
}

function tri(v: FormDataEntryValue | null): boolean | "UNDECLARED" {
  return v === "yes" ? true : v === "no" ? false : "UNDECLARED";
}

function readInput(form: HTMLFormElement): ClaimInput {
  const fd = new FormData(form);
  const accident = fd.get("accidentKind");
  const input: ClaimInput = {
    claim: (fd.get("claim") as ClaimInput["claim"]) ?? "YOYANG",
    accidentKind: accident === "WORK_ACCIDENT" || accident === "COMMUTE" || accident === "DISEASE" ? accident : "UNDECLARED",
    thirdParty: tri(fd.get("thirdParty")),
    treatmentEnded: tri(fd.get("treatmentEnded")),
  };
  const tags = fd.getAll("tags") as NonNullable<ClaimInput["tags"]>;
  if (tags.length) input.tags = tags;
  if (have.size) input.have = [...have];
  return input;
}

// 같은 확인을 명령줄로 — 연결한 뒤 그대로 붙여 넣을 수 있게
function cliOf(i: ClaimInput): string {
  const parts = ["npx -y sanjae-apply check", i.claim];
  if (i.accidentKind !== "UNDECLARED") parts.push(`--accident ${i.accidentKind}`);
  if (i.thirdParty !== "UNDECLARED") parts.push(`--third-party ${i.thirdParty ? "yes" : "no"}`);
  if (i.treatmentEnded !== "UNDECLARED") parts.push(`--ended ${i.treatmentEnded ? "yes" : "no"}`);
  if (i.tags?.length) parts.push(`--tags ${i.tags.join(",")}`);
  if (i.have?.length) parts.push(`--have ${i.have.join(",")}`);
  return parts.join(" ");
}

function basisHtml(basis: Package["forms"][number]["basis"]): string {
  return basis.map((b) => `<a href="${lawLink(b.cite)}" target="_blank" rel="noopener">${esc(b.cite)}</a> <span class="law-title">${esc(b.title)}</span>`).join("<br>");
}

function render(pkg: Package, input: ClaimInput) {
  const out = $("#result")!;
  const ready = pkg.status === "READY_TO_SUBMIT";
  const seal = $("#seal")!;
  seal.dataset.state = ready ? "ready" : "open";
  seal.innerHTML = ready ? "<span>제출할 수 있는</span><span>상태</span>" : "<span>확인할 것이</span><span>남음</span>";
  seal.classList.remove("stamp");
  void (seal as HTMLElement).offsetWidth; // 다시 찍는 움직임
  seal.classList.add("stamp");

  const forms = pkg.forms.filter((f) => f.status !== "NOT_APPLICABLE");
  const skipped = pkg.forms.filter((f) => f.status === "NOT_APPLICABLE");
  const needed = pkg.attachments.filter((a) => a.status !== "PROVIDED").length;

  $("#result-summary")!.innerHTML = [
    ["서식", forms.length],
    ["준비할 첨부", needed],
    ["남은 질문", pkg.open_confirmations.length],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

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
        <button type="button" class="have" data-id="${a.id}" aria-pressed="${have.has(a.id)}">${have.has(a.id) ? "준비함" : "준비했으면 누르기"}</button></div>
      ${a.status === "SUBSTITUTABLE" && a.substitute ? `<p class="r-cond">갈음: ${esc(a.substitute)}</p>` : ""}
      <p class="r-status">${ATT_STATUS[a.status]}</p>
    </li>`).join("");

  const qRows = pkg.open_confirmations.map((q) => `<li>${esc(q.question)}</li>`).join("");
  const notes = pkg.notes.map((n) => `<li>${esc(n)}</li>`).join("");

  out.innerHTML = `
    <h3 class="r-h">서식</h3><ul class="r-list">${formRows}</ul>
    ${skipped.length ? `<p class="r-skip">해당 없음: ${skipped.map((f) => esc(f.title)).join(", ")}</p>` : ""}
    ${attRows ? `<h3 class="r-h">첨부</h3><ul class="r-list">${attRows}</ul>` : ""}
    ${qRows ? `<h3 class="r-h">아직 답하지 않은 것</h3><ul class="r-q">${qRows}</ul>` : ""}
    ${notes ? `<h3 class="r-h">절차 메모</h3><ul class="r-notes">${notes}</ul>` : ""}`;

  $("#cli-line")!.textContent = cliOf(input);
}

function run() {
  const form = $<HTMLFormElement>("#sheet")!;
  const input = readInput(form);
  render(buildPackage(input), input);
}

function initSheet() {
  const form = $<HTMLFormElement>("#sheet");
  if (!form) return;
  form.addEventListener("change", () => {
    have.clear(); // 급여가 바뀌면 첨부 목록도 바뀐다
    run();
  });
  $("#result")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.have");
    if (!b) return;
    const id = b.dataset.id!;
    have.has(id) ? have.delete(id) : have.add(id);
    run();
  });
  run();
}

function initTabs() {
  document.querySelectorAll<HTMLElement>("[role=tablist]").forEach((list) => {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    const select = (t: HTMLButtonElement) => {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute("aria-controls")!)!.hidden = !on;
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
    const src = document.getElementById(b.dataset.for!);
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

async function initForms() {
  const body = $("#forms-body");
  try {
    const data = (await (await fetch("data/forms.json")).json()) as FormsData;
    fillable = new Map(data.forms.map((f) => [f.id, f]));
    document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = data.version));
    document.querySelectorAll("[data-total-slots]").forEach((el) => (el.textContent = data.total_slots.toLocaleString("ko-KR")));
    document.querySelectorAll("[data-form-count]").forEach((el) => (el.textContent = String(data.forms.length)));
    if (body) {
      body.innerHTML = data.forms.map((f) => `<tr id="form-${f.id}">
        <td><details><summary>${esc(f.title)}</summary>
          <ol class="slot-list">${f.slots.map((s) => `<li>${esc(s.label || s.key)}</li>`).join("")}</ol></details></td>
        <td class="num">${f.slots.length}</td>
        <td class="mark">${f.pdf ? "가능" : ""}</td>
        <td class="mark">${f.hwpx ? "가능" : "PDF만 배포"}</td>
        <td class="num">${f.stamps.length || "의료기관 작성"}</td>
        <td class="num">${f.revised ? f.revised.replaceAll("-", ".") : "표기 없음"}</td>
      </tr>`).join("");
    }
    run(); // 결과 쪽 「채울 수 있음」 표시를 붙인다
  } catch {
    if (body) body.innerHTML = `<tr><td colspan="6">서식 목록을 불러오지 못했습니다. 새로고침하거나 GitHub 안내서의 표를 보세요.</td></tr>`;
  }
}

initSheet();
initTabs();
initCopy();
void initForms();
