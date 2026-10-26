// 법제처 국가법령정보 Open API 직접 호출(korean-law MCP 를 쓰지 않는다).
// 인증키(OC)는 env LAW_GO_KR_OC 로만 받는다. 코드에 기본값을 두지 않는다.
// 실측(261026): 조문·별표·개정(eflaw)은 되고, 산재 시행규칙 별지 서식은 licbyl 에 안 잡힌다.

const BASE = "https://www.law.go.kr/DRF";

export interface ArticleText {
  mst: string;
  jo: string;
  lawName: string;
  title: string;
  /** 태그를 걷어낸 조문 본문(항·호 줄바꿈 유지) */
  text: string;
  effectiveDate: string;
}

function oc(): string {
  const v = process.env.LAW_GO_KR_OC;
  if (!v) throw new Error("LAW_GO_KR_OC 가 비어 있다. 법제처 Open API 인증키를 env 로 넣어라.");
  return v;
}

function strip(xml: string): string {
  return xml.replace(/<!\[CDATA\[|\]\]>/g, "");
}

function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m?.[1]?.trim() ?? "";
}

/** 조문 코드: "제41조" → "004100", "제74조의3" → "007403" */
export function joCode(article: string): string {
  const m = article.match(/제(\d+)조(?:의(\d+))?/);
  if (!m) throw new Error(`조문 표기를 읽지 못함: ${article}`);
  return `${m[1]!.padStart(4, "0")}${(m[2] ?? "0").padStart(2, "0")}`;
}

/** lawService.do target=law MST+JO 한 조문. */
export async function fetchArticle(mst: string, jo: string, fetchImpl: typeof fetch = fetch): Promise<ArticleText> {
  const url = `${BASE}/lawService.do?OC=${encodeURIComponent(oc())}&target=law&type=XML&MST=${mst}&JO=${jo}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`법제처 응답 ${res.status}`);
  const xml = strip(await res.text());
  const unit = xml.match(/<조문단위[^>]*>([\s\S]*?)<\/조문단위>/)?.[1] ?? "";
  const text = pick(unit, "조문내용") + "\n" + [...unit.matchAll(/<항내용>([\s\S]*?)<\/항내용>/g)].map((m) => m[1]!.trim()).join("\n");
  return {
    mst,
    jo,
    lawName: pick(xml, "법령명_한글"),
    title: pick(unit, "조문제목"),
    text: text.replace(/<[^>]+>/g, "").replace(/\n\s*\n+/g, "\n").trim(),
    effectiveDate: pick(xml, "시행일자"),
  };
}
