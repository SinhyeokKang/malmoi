import { compareCodeUnits } from "@/lib/compare";
export type PublishCell = { surface: string; path: string; keyId: string; key: string; localeCode: string; after: string; author: string; updatedAt: string };
export type BaseValues = Record<string, Record<string, Record<string, string>>>;
/**
 * `same` — 값이 base와 같다(B1 r3). 파일을 바꾸지 않는 편집이다: 열린 PR의 변경을 base 값으로 되돌렸거나 원래 같은 값을 다시 저장했다.
 * 양쪽이 같은 "변경" 행으로 그리면 거짓이다(QA5). ⚠️ 셀 단위 근사다 — 실행의 판정은 파일 blob SHA다.
 */
export type PublishRow = PublishCell & { before: string | null; keySpan: number; same: boolean };
/** `changes`·`keys`는 **실린 행 기준**이다 — 상한을 넘은 분량은 `truncated`가 따로 말한다. `same`은 실린 행 중 base와 같은 행 수다. */
export type PublishDiff = { groups: { surface: string; path: string; changes: number; keys: number; rows: PublishRow[] }[]; total: number; truncated: number; same: number };
// 미리보기 페이로드만 제한한다 — 실제 export의 범위·선택에는 영향을 주지 않는다.
export const PREVIEW_LIMIT = 200;
const compare = compareCodeUnits<string>;
export function buildPublishDiff(cells: readonly PublishCell[], base: BaseValues, limit = PREVIEW_LIMIT): PublishDiff {
  const sorted = [...cells].sort((a,b) => compare(a.surface,b.surface) || compare(a.path,b.path) || compare(a.key,b.key) || compare(a.keyId,b.keyId) || compare(a.localeCode,b.localeCode));
  const groups: PublishDiff["groups"] = [];
  for (const cell of sorted.slice(0, limit)) {
    let group = groups.at(-1);
    if (!group || group.surface !== cell.surface || group.path !== cell.path) { group = { surface: cell.surface, path: cell.path, changes: 0, keys: 0, rows: [] }; groups.push(group); }
    const file = Object.hasOwn(base, cell.path) ? base[cell.path] : undefined;
    const locale = file && Object.hasOwn(file, cell.localeCode) ? file[cell.localeCode] : undefined;
    const before = locale && Object.hasOwn(locale, cell.key) ? locale[cell.key] ?? null : null;
    group.rows.push({ ...cell, before, keySpan: 1, same: before !== null && before === cell.after });
  }
  for (const group of groups) {
    let first: PublishRow | undefined;
    for (const row of group.rows) {
      if (first?.keyId === row.keyId) { first.keySpan++; row.keySpan = 0; } else { first = row; group.keys++; }
    }
    group.changes = group.rows.length;
  }
  const same = groups.reduce((sum, group) => sum + group.rows.filter(row => row.same).length, 0);
  return { groups, total: cells.length, truncated: Math.max(0, cells.length - limit), same };
}
