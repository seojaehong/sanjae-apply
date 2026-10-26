// 출력 금지어 필터 — 승인 가능성·확률·적중률 류는 어느 출구(CLI·MCP·웹)로도 나가지 않는다.
// 프롬프트 지시는 보장이 아니므로 코드에서 거른다(개발게이트 G5-5). NOW.md 「절대 하지 말 것」.

const OUTCOME_PATTERNS: RegExp[] = [
  /승인\s*(가능|될|확률|율)/,
  /인정\s*(가능성|확률)/,
  /확률/,
  /적중/,
  /승소\s*가능/,
  /\d+\s*%\s*(승인|인정)/,
];

export function findOutcomeLanguage(text: string): string[] {
  return OUTCOME_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

/** 패키지 전체를 직렬화해 금지 표현이 있으면 던진다. */
export function assertNoOutcomeLanguage(value: unknown): void {
  const hits = findOutcomeLanguage(JSON.stringify(value));
  if (hits.length) throw new Error(`출력에 승인 가능성·확률 표현이 있다: ${hits.join(", ")}`);
}
