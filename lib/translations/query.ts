import { ALL_NAMESPACES, routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 번역 화면의 URL 계약 (translation-rework — design §3·§3.1·§10.2).
 *
 * ⚠️ **잎이다 — import는 잎인 `lib/routes.ts` 하나다.** 클라이언트 화면 소유자가 읽는다.
 * ⚠️ **URL은 요청값을 든다.** `Missing in ja`는 ja가 없는 범위에서도 남고, 적용값은 `effectiveCompletion`이 계산한다.
 * ⚠️ **정렬 파라미터가 없다** — 정렬은 `Incomplete first` 하나이고 항상 적용한다(T1 결정).
 */
export { ALL_NAMESPACES };

export const COMPLETIONS = ["all", "incomplete", "missing", "complete"] as const;
export type Completion = (typeof COMPLETIONS)[number];
export const STATE_FILTERS = ["unsent", "review", "new"] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];
export const SCOPES = ["namespace", "source", "project"] as const;
export type Scope = (typeof SCOPES)[number];

/** 상세 언어 필터의 예약값. `@`는 로케일 코드에 올 수 없어 실제 코드와 충돌하지 않는다. */
export const MISSING_LANGUAGES = "@missing";
/**
 * 선택 키의 예약값 — "새 목록의 첫 키"다 (audit-ux #18). 트리 이동이 이 값을 싣고, 서버가 같은 렌더에서 첫 행으로 바꾼다
 * (`landOnFirstKey`). 키 id(cuid)는 `@`로 시작하지 않아 실제 키와 충돌하지 않는다.
 */
export const FIRST_KEY = "@first";
export const Q_MAX_LENGTH = 200;

export type TranslationQuery = {
  ns: string;
  scope: Scope;
  completion: Completion;
  /** `completion === "missing"`일 때만 선다. */
  missingLocale?: string;
  state?: StateFilter;
  q?: string;
  cursor?: string;
  key?: string;
  keySurface?: string;
  /** 생략은 All languages, `MISSING_LANGUAGES`는 Missing only, 나머지는 로케일 코드. */
  language?: string;
};

/**
 * ⚠️ **기본 범위는 All sources다** (translation-filter-scope — 2026-09-30 사용자). 필터는 사용자가 직접 켤 때만 붙는다 — 트리 위치는
 * 조회 조건이 아니다(`treeQuery`). `scope` 없는 옛 링크도 여기로 열린다(넓어지는 쪽이라 0건 착지를 만들지 않는다).
 */
export const DEFAULT_TRANSLATION_QUERY: TranslationQuery = { ns: ALL_NAMESPACES, scope: "project", completion: "all" };

type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>;

/**
 * ⚠️ **`Object.hasOwn`으로 읽는다** — 키 이름을 주소창이 정하므로 `raw.constructor`가 `Object.prototype`에서 찾아진다.
 */
function read(raw: RawParams, name: string): string | undefined {
  if (!Object.hasOwn(raw, name)) return undefined;
  const value = raw[name];
  const first = typeof value === "string" ? value : value?.[0];
  return first === undefined || first === "" ? undefined : first;
}

function pick<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parseTranslationQuery(raw: RawParams): TranslationQuery {
  const rawState = read(raw, "state");
  // 옛 링크: `state=untranslated`는 완성도 축으로 옮겨 갔다.
  const legacyIncomplete = rawState === "untranslated";
  let completion = pick(COMPLETIONS, read(raw, "completion")) ?? (legacyIncomplete ? "incomplete" : "all");
  const missingLocale = completion === "missing" ? read(raw, "missingLocale") : undefined;
  if (completion === "missing" && missingLocale === undefined) completion = "all";

  const q = read(raw, "q")?.trim().slice(0, Q_MAX_LENGTH);
  // 옛 `locales`: 단일 코드일 때만 상세 언어로 옮기고 여럿이면 전체로 연다.
  const legacyLocales = read(raw, "locales")?.split(",").map(code => code.trim()).filter(code => code !== "");
  const language = read(raw, "language") ?? (legacyLocales?.length === 1 ? legacyLocales[0] : undefined);

  const query: TranslationQuery = {
    ns: read(raw, "ns") ?? ALL_NAMESPACES,
    scope: pick(SCOPES, read(raw, "scope")) ?? DEFAULT_TRANSLATION_QUERY.scope,
    completion,
  };
  if (missingLocale !== undefined) query.missingLocale = missingLocale;
  const state = pick(STATE_FILTERS, rawState);
  if (state !== undefined) query.state = state;
  if (q !== undefined && q !== "") query.q = q;
  for (const name of ["cursor", "key", "keySurface"] as const) {
    const value = read(raw, name);
    if (value !== undefined) query[name] = value;
  }
  if (language !== undefined) query.language = language;
  return query;
}

/** 기본값을 빼고 내보낸다 — 옛 파라미터(`locales`·`focus`·`state=untranslated`)는 다시 나가지 않는다. */
export function serializeTranslationQuery(query: TranslationQuery): TranslationsQuery {
  const out: TranslationsQuery = {};
  if (query.ns !== ALL_NAMESPACES) out.ns = query.ns;
  if (query.scope !== DEFAULT_TRANSLATION_QUERY.scope) out.scope = query.scope;
  if (query.completion !== "all") out.completion = query.completion;
  if (query.state !== undefined) out.state = query.state;
  for (const name of ["missingLocale", "q", "cursor", "key", "keySurface", "language"] as const) {
    const value = query[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

const CONDITION_FIELDS = ["ns", "scope", "completion", "missingLocale", "state", "q"] as const;

/**
 * 조건 축이 실제로 바뀌면 cursor를 푼다 — 이전 조합의 커서로 새 조합을 읽으면 첫 페이지가 비거나 중간부터 시작한다.
 * 다른 완성도를 명시적으로 고르면 기억한 `missingLocale`도 버린다(R5).
 */
export function nextQuery(query: TranslationQuery, patch: Partial<TranslationQuery>): TranslationQuery {
  const next: TranslationQuery = { ...query, ...patch };
  // 언어 없는 missing은 All keys다 — parse와 같은 규칙이어야 URL 왕복이 같은 상태를 낸다(R5).
  if (next.completion === "missing" && next.missingLocale === undefined) next.completion = "all";
  if (next.completion !== "missing") delete next.missingLocale;
  for (const name of Object.keys(next) as (keyof TranslationQuery)[]) if (next[name] === undefined) delete next[name];
  if (CONDITION_FIELDS.some(name => next[name] !== query[name])) delete next.cursor;
  return next;
}

/** `Clear filters` — 완성도·상태·범위 세 축만. 검색어·트리 선택·상세 언어·선택 키는 남는다. */
export function clearFilters(query: TranslationQuery): TranslationQuery {
  const next: TranslationQuery = { ...query, scope: DEFAULT_TRANSLATION_QUERY.scope, completion: DEFAULT_TRANSLATION_QUERY.completion };
  delete next.missingLocale;
  delete next.state;
  delete next.cursor;
  return next;
}

/** 필터 콤보박스(완성도·상태·범위)가 하나라도 켜졌나 — `Clear filters`와 빈 상태 `Show all`이 서는 조건이다. */
export function isNarrowed(query: TranslationQuery): boolean {
  return query.completion !== DEFAULT_TRANSLATION_QUERY.completion || query.state !== undefined || query.scope !== DEFAULT_TRANSLATION_QUERY.scope;
}

/** 조회 조건이 하나라도 붙었나(필터 + 검색) — 트리를 일치 키로 좁힐지의 판정이다. 트리 위치(`ns`)는 조건이 아니다. */
export function hasConditions(query: TranslationQuery): boolean {
  return isNarrowed(query) || query.q !== undefined;
}

export type EmptyAction = { kind: "search-all" | "clear-search" | "show-all"; query: TranslationQuery };

/**
 * 검색·필터 결과 0건의 버튼 (translation-filter-scope — design §2.3 · spec 조건 9). 검색어가 있는데 범위가 좁으면 먼저 범위를 넓히라고
 * 말한다 — 전엔 `Clear search` 하나라 다른 소스에 있는 값이 없는 것처럼 보였다. `Show all`은 완성도·상태가 켜졌을 때만 보조로 선다
 * (범위만 좁혔을 때의 `Show all`은 `Search all sources`와 같은 쿼리라 중복이다).
 */
export function emptyActions(query: TranslationQuery, { noKeys }: { noKeys: boolean }): { primary: EmptyAction | null; secondary: EmptyAction | null } {
  if (noKeys) return { primary: null, secondary: null };
  const showAll: EmptyAction = { kind: "show-all", query: clearFilters(query) };
  if (query.q === undefined) return { primary: isNarrowed(query) ? showAll : null, secondary: null };
  const filtered = query.completion !== DEFAULT_TRANSLATION_QUERY.completion || query.state !== undefined;
  const primary: EmptyAction = query.scope !== DEFAULT_TRANSLATION_QUERY.scope
    ? { kind: "search-all", query: nextQuery(query, { scope: DEFAULT_TRANSLATION_QUERY.scope }) }
    : { kind: "clear-search", query: nextQuery(query, { q: undefined }) };
  return { primary, secondary: filtered ? showAll : null };
}

/**
 * 트리 클릭은 **위치**다, 필터가 아니다 (translation-filter-scope — 2026-09-30 사용자). `ns`만 바꾸고 scope·완성도·상태·검색어는 그대로
 * 둔다 — 전엔 scope를 This source/namespace로 덮어 `All sources`로 넓힌 상태가 트리 클릭에 조용히 좁혀졌다. `This namespace`는
 * "현재 위치의 네임스페이스"라 대상이 새 `ns`를 따라간다. 첫 키는 새 목록이 정하므로 선택 자리에 `FIRST_KEY`를 싣는다.
 * ⚠️ **선택을 비우지 않는다** (audit-ux #18) — 비운 주소는 상세를 "Select a key"로 한 번 그리고, 첫 키를 고르는 두 번째 왕복이 따랐다.
 */
export function treeQuery(query: TranslationQuery, ns: string): TranslationQuery {
  const next: TranslationQuery = { ...query, ns, key: FIRST_KEY };
  delete next.cursor;
  delete next.keySurface;
  return next;
}

/** 서버가 `FIRST_KEY`를 푼다 — 첫 행이 있으면 그 키, 없으면 선택 없음. 예약값이 상세 조회·주소로 새지 않는다. */
export function landOnFirstKey(query: TranslationQuery, first: { keyId: string; surfaceSlug: string } | undefined): TranslationQuery {
  const next: TranslationQuery = { ...query };
  delete next.key;
  delete next.keySurface;
  return first === undefined ? next : { ...next, key: first.keyId, keySurface: first.surfaceSlug };
}

/** 작업 화면의 링크 — 경로 리터럴은 `lib/routes.ts`가 든다(`entry-points.test.ts`의 죽은 라우트·쿼리 수신자 검사). */
export function translationsHref(slug: string, surfaceSlug: string, query: TranslationQuery): string {
  return routes.surfaceTranslations(slug, surfaceSlug, serializeTranslationQuery(query));
}
