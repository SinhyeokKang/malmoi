import type { Completion, StateFilter } from "./query";

/**
 * 키 집계 — 목록 SQL 집계의 **순수 oracle**이다 (translation-rework — spec §3.3 · design §2).
 * T9가 같은 fixture에서 SQL 결과와 이 결과를 대조한다. 규칙을 바꾸면 두 곳이 같이 움직여야 한다.
 */
export type KeyCellInput = { localeCode: string; value: string | null; needsReview: boolean; pending: boolean };

export type KeySummary = { keyId: string; totalLocales: number; missingCount: number; hasReview: boolean; hasPending: boolean };

/** 분모는 그 소스의 **활성** 로케일이다 — orphan 로케일 셀은 어느 쪽에도 들지 않는다. */
export function summarizeKey(input: { activeLocales: readonly string[]; cells: readonly KeyCellInput[] }): Omit<KeySummary, "keyId"> {
  const byLocale = new Map(input.cells.map(cell => [cell.localeCode, cell]));
  let missingCount = 0;
  let hasReview = false;
  let hasPending = false;
  for (const code of new Set(input.activeLocales)) {
    const cell = byLocale.get(code);
    // 공백만 있는 DB 값은 채워진 값이다 — 저장 정규화(`planSave`)와 집계를 섞지 않는다.
    const filled = cell !== undefined && cell.value !== null && cell.value !== "";
    if (!filled) missingCount += 1;
    // 값이 없는 needsReview는 결측으로만 센다 — 값이 없는데 "검토하라"고 말하지 않는다.
    if (filled && cell.needsReview) hasReview = true;
    if (cell?.pending) hasPending = true;
  }
  return { totalLocales: new Set(input.activeLocales).size, missingCount, hasReview, hasPending };
}

/** `Incomplete first` — 결측 또는 review인 키를 앞으로 **안정 분할**한다. 결측 수로 줄세우지 않는다. */
export function orderKeySummaries<T extends Pick<KeySummary, "missingCount" | "hasReview">>(rows: readonly T[]): T[] {
  const incomplete = (row: T) => row.missingCount > 0 || row.hasReview;
  return [...rows.filter(incomplete), ...rows.filter(row => !incomplete(row))];
}

export type EffectiveCompletion = {
  completion: Completion;
  missingLocale?: string;
  /** 요청한 `Missing in {locale}`을 범위가 담지 못해 Incomplete로 대신 적용했다. */
  substituted: boolean;
  /** 그 언어가 없어 결과에서 빠지는 소스. 그 소스의 키를 전부 미번역으로 만들지 않는다. */
  excludedSurfaceIds: string[];
};

export function effectiveCompletion(
  requested: { completion: Completion; missingLocale?: string },
  scopeSurfaces: readonly { surfaceId: string; locales: readonly string[] }[],
): EffectiveCompletion {
  const locale = requested.missingLocale;
  if (requested.completion !== "missing" || locale === undefined) {
    return { completion: requested.completion, substituted: false, excludedSurfaceIds: [] };
  }
  const without = scopeSurfaces.filter(surface => !surface.locales.includes(locale)).map(surface => surface.surfaceId);
  if (without.length === scopeSurfaces.length) return { completion: "incomplete", substituted: true, excludedSurfaceIds: [] };
  return { completion: "missing", missingLocale: locale, substituted: false, excludedSurfaceIds: without };
}

export function keyMatches(
  key: { summary: Omit<KeySummary, "keyId"> | KeySummary; missingLocales: readonly string[]; createdAt: Date },
  filter: { completion: Completion; missingLocale?: string; state?: StateFilter },
  ctx: { lastPulledAt: Date | null },
): boolean {
  const { missingCount, hasReview, hasPending } = key.summary;
  const completion = filter.completion === "all" ? true
    : filter.completion === "incomplete" ? missingCount > 0
    : filter.completion === "complete" ? missingCount === 0
    : filter.missingLocale !== undefined && key.missingLocales.includes(filter.missingLocale);
  if (!completion) return false;
  switch (filter.state) {
    case undefined: return true;
    case "unsent": return hasPending;
    case "review": return hasReview;
    // lastPulledAt이 없으면 활성 키 전체가 신규다 — 승인된 정의 (`StringKey.createdAt` 주석).
    case "new": return ctx.lastPulledAt === null || key.createdAt.getTime() > ctx.lastPulledAt.getTime();
  }
}
