/** 주소창 값이 쿼리 길이를 정하지 않는다. */
export const MAX_TEXT = 200;

/**
 * 다중 선택 축의 URL 표현. **쉼표로 잇고 정렬·중복 제거한다** — 같은 선택이 두 URL로 갈리면
 * 공유한 주소가 서로 다른 문자열이 되고, 그 차이는 화면에 안 보인다.
 */
export function encodeList(values: readonly string[]): string | undefined {
  const unique = [...new Set(values.filter((value) => value !== ""))].sort();
  return unique.length === 0 ? undefined : unique.join(",");
}

/**
 * 다중 선택 축의 항목 수 상한. **길이가 아니라 개수로 막는다** — 목록 **전체**에 `MAX_TEXT`를 걸면
 * 소스를 여덟 개쯤 고른 URL에서 **마지막 slug가 중간에서 잘리고**, 잘린 값은 어느 소스와도 안 맞아
 * 결과가 조용히 0건이 된다(고른 소스는 화면에 그대로 보인다 — code-review 2026-09-21).
 */
export const MAX_ITEMS = 50;

export function list(value: string | string[] | undefined): string[] {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return [];
  // `split`의 limit이 배열 길이를 먼저 막는다 — 거대한 주소창 값이 메모리를 정하지 않는다.
  const items = first
    .split(",", MAX_ITEMS + 1)
    // 상한은 **항목마다** 건다. slug 상한이 40자라(`PushPayload`) 유효한 값은 어느 개수에서도 온전하다.
    .map((item) => item.trim().slice(0, MAX_TEXT))
    .filter((item) => item !== "");
  return [...new Set(items)].sort().slice(0, MAX_ITEMS);
}

/** 반복 파라미터는 첫 값을 쓴다. 빈 문자열·공백은 없는 것과 같다. */
export function text(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return null;
  const trimmed = first.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_TEXT);
}

