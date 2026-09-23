import { ALL_NAMESPACES } from "@/lib/routes";

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

export const DEFAULT_TRANSLATION_QUERY: TranslationQuery = { ns: ALL_NAMESPACES, scope: "source", completion: "all" };

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
    scope: pick(SCOPES, read(raw, "scope")) ?? "source",
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
export function serializeTranslationQuery(query: TranslationQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.ns !== ALL_NAMESPACES) out.ns = query.ns;
  if (query.scope !== "source") out.scope = query.scope;
  if (query.completion !== "all") out.completion = query.completion;
  for (const name of ["missingLocale", "state", "q", "cursor", "key", "keySurface", "language"] as const) {
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
  if (next.completion !== "missing") delete next.missingLocale;
  for (const name of Object.keys(next) as (keyof TranslationQuery)[]) if (next[name] === undefined) delete next[name];
  if (CONDITION_FIELDS.some(name => next[name] !== query[name])) delete next.cursor;
  return next;
}

/** `Clear filters` — 완성도·상태·범위 세 축만. 검색어·트리 선택·상세 언어·선택 키는 남는다. */
export function clearFilters(query: TranslationQuery): TranslationQuery {
  const next: TranslationQuery = { ...query, scope: "source", completion: "all" };
  delete next.missingLocale;
  delete next.state;
  delete next.cursor;
  return next;
}

/** 트리 클릭 — 네임스페이스는 This namespace, 전체는 This source. 첫 키는 새 목록이 정하므로 선택을 비운다. */
export function treeQuery(query: TranslationQuery, ns: string): TranslationQuery {
  const next: TranslationQuery = { ...query, ns, scope: ns === ALL_NAMESPACES ? "source" : "namespace" };
  delete next.cursor;
  delete next.key;
  delete next.keySurface;
  return next;
}
