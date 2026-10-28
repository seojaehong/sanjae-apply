// 「산업재해보상보험법 시행규칙 제20조」 → 국가법령정보센터 조문 주소. 형식이 안 맞으면 null(조용히 홈으로 보내지 않는다)
// test/input.test.ts 가 REF 전부에서 null 이 0건인지 본다.
export function lawUrl(cite: string): string | null {
  const m = cite.match(/^(.+?)\s(제\d+조(?:의\d+)?)/);
  if (!m) return null;
  return `https://www.law.go.kr/법령/${encodeURIComponent(m[1]!.replace(/\s/g, ""))}/${encodeURIComponent(m[2]!)}`;
}
