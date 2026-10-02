import type { KeyHit } from "@/lib/search/key-href";
import { Q_MAX_LENGTH } from "@/lib/translations/query";
import { likePattern } from "./translation-list";

export function keySearchQuery(q: string): { pattern: string } | null {
  const query = q.trim().slice(0, Q_MAX_LENGTH);
  return query.length < 2 ? null : { pattern: likePattern(query) };
}

/** UTF-8 COLLATE C order is code-point order, including supplementary characters. */
function compareC(a: string, b: string): number {
  const left = Array.from(a, char => char.codePointAt(0) ?? 0);
  const right = Array.from(b, char => char.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function mergeKeyHits(first: readonly KeyHit[], second: readonly KeyHit[], activeSlug: string | null): KeyHit[] {
  const order = (a: KeyHit, b: KeyHit) => Number(b.slug === activeSlug) - Number(a.slug === activeSlug) || compareC(a.key, b.key) || compareC(a.id, b.id);
  const seen = new Set<string>();
  const unique = (rows: readonly KeyHit[]) => rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  const primary = unique([...first].sort((a, b) => Number(b.inKey) - Number(a.inKey) || order(a, b))).slice(0, 5);
  if (primary.length === 5) return primary;
  return [...primary, ...unique([...second].sort(order)).slice(0, 5 - primary.length)];
}
