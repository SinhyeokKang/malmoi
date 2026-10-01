import { ALL_NAMESPACES, routes, type TranslationsQuery } from "@/lib/routes";

/**
 * 번역 화면의 URL 계약 (translation-rework — design §3·§3.1·§10.2 · translation-tree-range design §2.1).
 *
 * **두 층이다.** 아래 파서·직렬화·기본값(`parseTranslationQuery`·`serializeTranslationQuery`·`DEFAULT_TRANSLATION_QUERY`)은 MCP `list_keys`의
 * **외부 계약으로 동결**한다 — `scope`·`completion`(`missing`·`complete`)·`state`·cursor를 그대로 받는다. 화면은 그 위의 **화면 층**
 * (`screenQuery` 이하)만 쓴다: 트리 = 목록 범위, 필터는 Status 하나, 검색은 전 소스다(2026-10-01 사용자 — 09-30의 "트리는 위치이고 필터가
 * 아니다"를 뒤집었다).
 *
 * ⚠️ **잎이다 — import는 잎인 `lib/routes.ts` 하나다.** 클라이언트 화면 소유자가 읽는다.
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
 * ⚠️ **MCP 계약의 기본값이다 — 화면의 기본값이 아니다** (translation-tree-range). `list_keys`는 `scope`가 없으면 전 소스를 읽는다.
 * 화면은 검색어가 없으면 `scope`를 무시하고 위치(`ns`)에서 파생한다(`screenQuery`) — 검색어 없는 `scope=project` 북마크는 범위가 좁아진다.
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

/** 서버가 `FIRST_KEY`를 푼다 — 첫 행이 있으면 그 키, 없으면 선택 없음. 예약값이 상세 조회·주소로 새지 않는다. */
export function landOnFirstKey(query: TranslationQuery, first: { keyId: string; surfaceSlug: string } | undefined): TranslationQuery {
  const next: TranslationQuery = { ...query };
  delete next.key;
  delete next.keySurface;
  return first === undefined ? next : { ...next, key: first.keyId, keySurface: first.surfaceSlug };
}

// ── 화면 층 (translation-tree-range — design §2.1) ──────────────────────────────────────────────────

/** 필터 축은 Status 하나다 (spec 조건 3). 순서가 메뉴 순서다. */
export const STATUSES = ["all", "incomplete", "review", "unsent", "new"] as const;
export type Status = (typeof STATUSES)[number];

/** 옛 `missing`(Untranslated in)은 `Incomplete`, 옛 `complete`는 `All keys`다 — 둘 다 화면 선택지에서 사라졌다. 상태가 있으면 상태가 이긴다. */
export function statusOf(query: TranslationQuery): Status {
  return query.state ?? (query.completion === "incomplete" || query.completion === "missing" ? "incomplete" : "all");
}

/** `completion`·`state` 한 쌍만 바꾼다 — 둘이 동시에 서지 않는다. 위치·검색어·선택·언어는 남긴다. */
export function withStatus(query: TranslationQuery, status: Status): TranslationQuery {
  return nextQuery(query, status === "all" || status === "incomplete" ? { completion: status, state: undefined } : { completion: "all", state: status });
}

/** 위치의 범위 — `ALL_NAMESPACES`는 네임스페이스가 아니라 소스 전체다. */
function locationScope(ns: string): Scope {
  return ns === ALL_NAMESPACES ? "source" : "namespace";
}

/**
 * 원본 URL 입력 → 화면 요청값. **MCP 파서를 무수정으로 부르고 그 위에 화면 규칙을 얹는다** — 로케일 없는 `completion=missing`은 파서가
 * `all`로 접으므로 원본에서 먼저 읽어 둔다(화면은 `Incomplete`, MCP는 `All keys` — 조건 15).
 * - `scope`는 파생값이다: 검색어가 없으면 위치, 있으면 전 소스(기본) 또는 위치로 좁힌 검색(`source`·`namespace`가 왔을 때).
 * - `completion`은 `all | incomplete`만, `state`와 동시에 서지 않는다. 옛 `missing` → `incomplete` + 상세 언어(`language ??= missingLocale`).
 * - `cursor`는 항상 뺀다 — 화면 목록은 전량이다(cursor 보존은 MCP 계약으로 남는다).
 * ⚠️ 정규화된 값은 왕복 고정점이다(`screenQuery(serializeScreenQuery(x))` = x) — 페이지의 redirect가 루프하지 않는 근거다.
 */
export function screenQuery(raw: RawParams): TranslationQuery {
  const parsed = parseTranslationQuery(raw);
  const next: TranslationQuery = { ...parsed };
  delete next.cursor;
  delete next.missingLocale;
  if (read(raw, "completion") === "missing") {
    next.completion = "incomplete";
    if (next.language === undefined && parsed.missingLocale !== undefined) next.language = parsed.missingLocale;
  }
  if (next.completion === "complete" || next.completion === "missing" || next.state !== undefined) next.completion = "all";
  const narrowedSearch = next.q !== undefined && pick(SCOPES, read(raw, "scope")) !== undefined && read(raw, "scope") !== "project";
  next.scope = next.q !== undefined && !narrowedSearch ? "project" : locationScope(next.ns);
  return next;
}

/** `serializeTranslationQuery` + **`scope`는 위치로 좁힌 검색일 때만 싣는다** — 위치 탐색과 전 소스 검색은 주소에 없다(파생값이다). */
export function serializeScreenQuery(query: TranslationQuery): TranslationsQuery {
  const out = serializeTranslationQuery(query);
  if (query.q === undefined || query.scope === "project") delete out.scope;
  else out.scope = query.scope;
  return out;
}

/**
 * 원본 주소가 이미 정규 주소인가 (design §3.1) — **파라미터 집합(키·값)을 비교한다**, 문자열 순서가 아니다. 파서가 버리는 잔여 파라미터
 * (`completion` 없는 `missingLocale`·옛 `locales`·모르는 이름)도 차이로 잡는다.
 * ⚠️ **`ns=*`는 생략과 같다** — Home의 상태 링크가 그것을 싣는다(POSTMORTEM 2026-09-15). 다르게 보면 카드를 누를 때마다 redirect 왕복이
 * 하나 더 붙는다(audit-ux #4b가 없앤 왕복).
 */
export function isScreenCanonical(raw: RawParams, query: TranslationQuery): boolean {
  const canonical: Readonly<Record<string, string | undefined>> = serializeScreenQuery(query);
  const given = Object.entries(raw).filter(([name, value]) => value !== undefined && !(name === "ns" && value === ALL_NAMESPACES));
  const expected = Object.entries(canonical).filter(([, value]) => value !== undefined);
  return given.length === expected.length && given.every(([name, value]) => typeof value === "string" && Object.hasOwn(canonical, name) && canonical[name] === value);
}

/** 범위가 전 소스인가 — 검색 중에만 선다. 검색어 없는 `project`는 화면에서 오지 않는다(`screenQuery`가 위치로 바꾼다). */
export function isAllSources(query: Pick<TranslationQuery, "q" | "scope">): boolean {
  return query.q !== undefined && query.scope === "project";
}

/** 조회 조건이 붙었나(Status + 검색) — 트리 숫자를 일치 수로 바꿀지의 판정이다. 트리 위치(`ns`)는 조건이 아니다. */
export function hasConditions(query: TranslationQuery): boolean {
  return statusOf(query) !== "all" || query.q !== undefined;
}

/**
 * 트리 클릭 = 그 노드가 목록 범위다 (spec 조건 1). Status·검색어·상세 언어는 그대로 둔다(조건 2) — 검색 중이면 결과를 그 노드로 좁힌다(조건 6).
 * 첫 키는 새 목록이 정하므로 선택 자리에 `FIRST_KEY`를 싣는다.
 * ⚠️ **선택을 비우지 않는다** (audit-ux #18) — 비운 주소는 상세를 "Select a key"로 한 번 그리고, 첫 키를 고르는 두 번째 왕복이 따랐다.
 */
export function treeQuery(query: TranslationQuery, ns: string): TranslationQuery {
  const next: TranslationQuery = { ...query, ns, scope: locationScope(ns), key: FIRST_KEY };
  delete next.cursor;
  delete next.keySurface;
  return next;
}

/** 트리 맨 위 `All sources` 노드 — 범위만 전 소스로. 위치·선택·검색어·Status는 남는다. */
export function allSourcesQuery(query: TranslationQuery): TranslationQuery {
  return nextQuery(query, { scope: "project" });
}

/**
 * 검색 제출. **새 검색어는 전 소스다**(조건 4·5) · **같은 검색어는 쿼리 그대로**(좁힌 범위가 남는다 — 조건 5) · **공백만은 지우기**(범위가
 * 위치로 돌아간다 — 새 전 소스 검색이 아니다). 키 선택이 위치를 그 키로 옮겨 두었으므로 위치 = 마지막으로 고른 키의 소스·네임스페이스다(조건 8).
 */
export function searchQuery(query: TranslationQuery, q: string | undefined): TranslationQuery {
  const text = (q ?? "").trim().slice(0, Q_MAX_LENGTH);
  if (text === "") return nextQuery(query, { q: undefined, scope: locationScope(query.ns) });
  if (text === query.q) return query;
  return nextQuery(query, { q: text, scope: "project" });
}

/**
 * 키 선택. **전 소스 범위면 항상** 위치를 그 키의 소스·네임스페이스로 맞춘다(`ns=*`도 예외 없다 — 조건 7). `surfaceSlug`는 이동 대상 소스이고,
 * 호출부가 경로와 다르면 그 소스로 옮긴다(재마운트). 위치 범위·좁힌 검색에서는 범위를 바꾸지 않는다(`null`).
 */
export function selectQuery(query: TranslationQuery, row: { keyId: string; surfaceSlug: string; namespace: string }): { query: TranslationQuery; surfaceSlug: string | null } {
  const next: TranslationQuery = { ...query, key: row.keyId, keySurface: row.surfaceSlug };
  if (!isAllSources(query)) return { query: next, surfaceSlug: null };
  return { query: { ...next, ns: row.namespace }, surfaceSlug: row.surfaceSlug };
}

/** `label`은 문구 키다 — 잎이라 문구를 import하지 않고, 화면이 `m.translations.workspace`에서 고른다. */
export type EmptyAction = { kind: "search-all" | "clear-search" | "clear-filters"; label: "searchAll" | "clearSearch" | "clearFilters"; query: TranslationQuery };

/**
 * 0건 빈 상태의 버튼 (translation-tree-range design §2.1 표 · spec 조건 13). 검색어가 위치로 좁혀졌으면 먼저 범위를 넓히라고 말하고,
 * 전 소스면 검색을 지우라고 말한다. `Clear filters`는 Status가 켜졌을 때만 — 검색 중엔 보조, 아니면 주다.
 */
export function emptyActions(query: TranslationQuery, { noKeys }: { noKeys: boolean }): { primary: EmptyAction | null; secondary: EmptyAction | null } {
  if (noKeys) return { primary: null, secondary: null };
  const action = (kind: EmptyAction["kind"], label: EmptyAction["label"]): EmptyAction => ({ kind, label, query: applyEmptyAction(kind, query) });
  const clear = statusOf(query) === "all" ? null : action("clear-filters", "clearFilters");
  if (query.q === undefined) return { primary: clear, secondary: null };
  return { primary: isAllSources(query) ? action("clear-search", "clearSearch") : action("search-all", "searchAll"), secondary: clear };
}

/**
 * 빈 상태 버튼 종류를 쿼리에 적용한다. ⚠️ **표시와 목적지의 기준이 다르다** — 화면은 버튼을 빈 문구와 같은 서버 쿼리로 고르고(`emptyActions(query)`),
 * 주소는 누른 순간의 낙관값에 이 함수를 적용해 만든다(POSTMORTEM 2026-09-12). 표시까지 낙관값으로 고르면 누른 버튼이 대기 중에 사라지고
 * 포커스가 `body`로 빠졌다.
 */
export function applyEmptyAction(kind: EmptyAction["kind"], query: TranslationQuery): TranslationQuery {
  return kind === "search-all" ? allSourcesQuery(query)
    : kind === "clear-search" ? searchQuery(query, undefined)
    : withStatus(query, "all");
}

/**
 * 목록 세대 키 (design §2.3) — 이 값이 바뀔 때만 목록이 새로 시작한다. **전 소스 범위는 위치(`ns`·경로)를 보지 않는다** — 전 소스 결과에서
 * 같은 소스의 다른 네임스페이스 키를 골라 `ns`가 바뀌어도 `savedOut` 행·행 memo가 남는다(POSTMORTEM 2026-10-01 #157). 다른 소스는 재마운트라 무관하다.
 */
export function listGenerationKey(query: TranslationQuery, routeSurfaceSlug: string): string {
  const conditions = [query.scope, statusOf(query), query.q ?? null];
  return JSON.stringify(isAllSources(query) ? conditions : [routeSurfaceSlug, query.ns, ...conditions]);
}

/**
 * 작업 화면의 링크 — 받은 쿼리를 **화면 정규형으로 직렬화한다**(옛 필터 형도 — `Untranslated in` → `Incomplete` + 상세 언어). 소스·키·언어의
 * 존재 보정은 페이지가 맡는다. 경로 리터럴은 `lib/routes.ts`가 든다(`entry-points.test.ts`의 죽은 라우트·쿼리 수신자 검사).
 */
export function translationsHref(slug: string, surfaceSlug: string, query: TranslationQuery): string {
  return routes.surfaceTranslations(slug, surfaceSlug, serializeScreenQuery(screenQuery(serializeTranslationQuery(query))));
}
