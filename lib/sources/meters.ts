import type { LocaleProgress } from "@/lib/keys/view";

export type LocaleMeterValue = { code: string; total: number; done: number; review: number; percent: number };

export function meterValue(row: LocaleProgress): LocaleMeterValue {
  const done = Math.min(row.total, row.translated);
  const review = Math.min(Math.max(0, row.total - done), row.needsReview);
  return { code: row.code, total: row.total, done, review, percent: row.percent };
}

const MAX_SHOWN = 5;

/** 서버에서 잘라야 로케일이 많아도 행마다 RSC 페이로드가 늘지 않는다. */
export function sourceRowMeters(languages: readonly LocaleProgress[]): { shown: LocaleMeterValue[]; hidden: number } {
  const active = languages.filter(row => !row.orphaned);
  if (active.length === 0 || active[0]?.total === 0) return { shown: [], hidden: 0 };
  return { shown: active.slice(0, MAX_SHOWN).map(meterValue), hidden: Math.max(0, active.length - MAX_SHOWN) };
}
