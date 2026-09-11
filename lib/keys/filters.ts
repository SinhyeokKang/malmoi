import { ALL_NAMESPACES, type TranslationsQuery } from "@/lib/routes";

/**
 * 툴바 아래 **칩 행**의 유일한 출처 (8-4 design §3.5).
 *
 * ⚠️ **잎이다 — import가 `lib/routes.ts`(그쪽도 잎)까지다.** 칩 행이 클라이언트 컴포넌트인데
 * `lib/keys/view.ts`는 잎이 아니다(`compareKeys` → `lib/adapters/shared`). 값으로 읽으면 그
 * 그래프가 번들에 따라온다 (POSTMORTEM 2026-09-07 — 7.2MB 청크). **재수출도 하지 않는다.**
 *
 * ⚠️ **`next`가 "그 칩을 뗀 뒤의 쿼리"다** — 화면이 쿼리 조립을 다시 하면 규칙이 두 벌이 되고
 * 하나가 낡는다.
 *
 * ⚠️ **라벨을 만들지 않는다** — 문구는 `messages/en.tsx`가 소유하고 칩 컴포넌트가 붙인다.
 * 여기서 `m`을 읽으면 이 모듈이 사전 그래프까지 물게 되고, 잎이라는 성질을 지킬 이유가 흐려진다.
 */

/** 시안의 칩 종류 — `namespaceName` · `localeName` · `searchKeyword` 셋이다. 넷째는 시안 개정이 먼저다. */
export type FilterChipKey = "namespace" | "locales" | "search";

export type FilterChip = {
  key: FilterChipKey;
  /** 사람이 읽는 값(`common` · `ko, ja` · 검색어). 라벨 접두는 호출부가 붙인다. */
  value: string;
  next: TranslationsQuery;
};

/**
 * @param query 지금 URL의 값.
 * @param ctx `selected`는 `parseLocaleSelection`의 결과, `fallback`은 선택이 없을 때의 기본이다.
 *   **둘을 비교해야 "사용자가 고른 것"인지 알 수 있다** — 쿼리에 `locales`가 있어도 그 값이 기본과
 *   같으면 칩이 아니다.
 */
export function activeFilters(
  query: TranslationsQuery,
  ctx: { selected: readonly string[]; fallback: readonly string[] },
): FilterChip[] {
  const chips: FilterChip[] = [];

  // 기본 착지(미지정)는 사용자가 고른 것이 아니다 — 뗄 것이 없으므로 칩도 없다.
  if (query.ns !== undefined && query.ns !== "" && query.ns !== ALL_NAMESPACES) {
    chips.push({ key: "namespace", value: query.ns, next: { ...query, ns: ALL_NAMESPACES } });
  }

  /**
   * ⚠️ **로케일 칩은 코드마다가 아니라 하나로 묶는다** — 코드마다 내면 마지막 하나를 떼는 순간
   * 폴백이 걸려 **전체로 넓어지고**, 제거가 "좁힘 해제"가 아니라 넓힘이 되어 다른 두 칩과 방향이
   * 반대다. 6로케일에서 넷을 고르면 칩 행 한 줄도 넘는다.
   */
  if (!sameSelection(ctx.selected, ctx.fallback)) {
    // `undefined`다 — 빈 문자열이면 `?locales=`가 URL에 남는다.
    chips.push({ key: "locales", value: ctx.selected.join(", "), next: { ...query, locales: undefined } });
  }

  if (query.q !== undefined && query.q.trim() !== "") {
    chips.push({ key: "search", value: query.q, next: { ...query, q: undefined } });
  }

  return chips;
}

/** 순서가 달라도 같은 선택이다 — URL이 순서를 정하지 않는다 (`parseLocaleSelection`). */
function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code) => b.includes(code));
}

/**
 * 초기화 — **칩 전부를 뗀 뒤의 쿼리** (8-4).
 *
 * ⚠️ **`ns`를 `undefined`로 되돌리지 않는다.** 그 값은 "기본 착지"(남은 일이 있는 첫 네임스페이스)를
 * 뜻하는데, 초기화가 그리로 데려가면 사용자가 보고 있던 것과 무관한 곳에 떨어진다. 네임스페이스
 * 칩의 제거와 같은 목적지(`*`)여야 한다 — 단, 애초에 칩이 아니었으면(미지정) 그대로 둔다.
 */
export function clearedQuery(query: TranslationsQuery): TranslationsQuery {
  const ns = query.ns === undefined || query.ns === "" ? query.ns : ALL_NAMESPACES;
  return { ...query, ns, locales: undefined, q: undefined };
}
