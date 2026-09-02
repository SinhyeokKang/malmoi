/** 중앙값 — `summarize`와 `surveyOne`이 함께 쓴다(리포별 집계와 파일별 집계). */
export function median(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
