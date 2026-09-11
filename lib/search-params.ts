/**
 * URL 쿼리를 화면이 기대하는 모양으로 정규화한다 — **잎, import 0**.
 *
 * ⚠️ **Next의 `searchParams`는 반복 파라미터를 배열로 준다.** 화면의 타입이 `{ q?: string }`이면
 * `?q=a&q=b`에서 그 단언이 거짓이 되고, 그 값이 `String`을 거치지 않은 채 필터·조회로 흘러간다.
 * 경계에서 한 번 접는 것이 유일하게 일관된 자리다.
 */
/**
 * 화면이 **받는** 모양 — 필드마다 `string | string[]`이다. 페이지의 `searchParams` 타입이 이것이고,
 * 본문은 `firstQueryValues`를 지난 뒤의 `string | undefined`만 본다.
 */
export type Raw<K extends string> = Partial<Record<K, string | string[]>>;

export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 화면이 받은 쿼리 객체 전체를 접는다 — 필드마다 부르면 새 파라미터가 하나 빠진다.
 *
 * ⚠️ **`Object.create(null)`이다.** 키를 주소창이 정하므로 평범한 `{}`에 `out["__proto__"] = v`를
 * 하면 setter가 불려 own property가 안 생기고 **그 키가 조용히 사라진다** (CLAUDE.md 코드 컨벤션 —
 * sec-audit 발견 1·17과 같은 부류).
 */
export function firstQueryValues<T extends Record<string, string | string[] | undefined>>(
  raw: T,
): { [K in keyof T]: string | undefined } {
  const out = Object.create(null) as { [K in keyof T]: string | undefined };
  for (const key of Object.keys(raw) as (keyof T)[]) out[key] = firstQueryValue(raw[key]);
  return out;
}
