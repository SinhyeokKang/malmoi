import { normalizeProjectSlug, planSlug, PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";
import { compareCodeUnits } from "@/lib/compare";

export function compareSurfaces(a: string | number, b: string | number): number {
  return compareCodeUnits(a, b);
}

export function selectDefaultSurface<T>(candidates: readonly T[]): T | null {
  return candidates[0] ?? null;
}

export function surfaceLabel(pathTemplate: string): string {
  return pathTemplate.split("/").slice(0, -1).filter(part => !/[{}*?]/.test(part)).at(-1) ?? "default";
}

export function planSurfaceSlug(pathTemplate: string, existingSlugs: readonly string[]): string {
  const directory = surfaceLabel(pathTemplate);
  // 앞 밑줄은 Chrome 관례 디렉터리 이름(`_locales`)에서 의미가 있다.
  const stem = directory === "_locales" ? directory : normalizeProjectSlug(directory) || "default";
  const used = new Set(existingSlugs);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = stem.slice(0, PROJECT_SLUG_MAX - suffix.length).replace(/[.-]+$/, "") + suffix;
    if (!used.has(candidate) && (candidate.startsWith("_locales") || planSlug(candidate) === "ok")) return candidate;
  }
}

export type SurfacePaths = { surfaceId: string; surfaceSlug: string; paths: readonly string[] };
export function surfaceOwnership(targets: readonly SurfacePaths[]):
  | { ok: true }
  | { ok: false; conflicts: { path: string; surfaceSlugs: string[] }[] } {
  const owners = new Map<string, Map<string, string>>();
  for (const target of targets) for (const path of target.paths) {
    const row = owners.get(path) ?? new Map<string, string>();
    row.set(target.surfaceId, target.surfaceSlug);
    owners.set(path, row);
  }
  const conflicts = [...owners].filter(([, row]) => row.size > 1)
    .map(([path, row]) => ({ path, surfaceSlugs: [...row.values()].sort(compareSurfaces) }))
    .sort((a, b) => compareSurfaces(a.path, b.path));
  return conflicts.length ? { ok: false, conflicts } : { ok: true };
}

/**
 * 추가 거부의 충돌 줄 — **추가하려던 템플릿 하나에 한 줄, 소유자는 지금 그 파일을 쥔 기존 소스만**이다 (malmoi#194).
 *
 * ⚠️ **계획 slug를 소유자로 들지 않는다** — 추가가 받을 뻔한 slug(`emails-2`)나 되살릴 행의 slug는 거부와 함께 존재하지 않게 된다.
 * 파일 줄(`surfaceOwnership`의 형)을 그대로 보이면 그 slug가 "이미 파일을 쥔 둘째 소스"로 읽혔다. 추가끼리만 겹치면 소유자가 비어 있다.
 */
export function planAddConflicts(existing: readonly SurfacePaths[], additions: readonly { surfaceId: string; pathTemplate: string; paths: readonly string[] }[]):
  | { ok: true }
  | { ok: false; conflicts: { path: string; surfaceSlugs: string[] }[] } {
  const ownership = surfaceOwnership([...existing, ...additions.map(a => ({ surfaceId: a.surfaceId, surfaceSlug: a.surfaceId, paths: a.paths }))]);
  if (ownership.ok) return ownership;
  const contested = new Set(ownership.conflicts.map(conflict => conflict.path));
  const conflicts = additions.flatMap(addition => {
    const hit = addition.paths.filter(path => contested.has(path));
    if (hit.length === 0) return [];
    const owners = new Set(existing.filter(owner => owner.paths.some(path => hit.includes(path))).map(owner => owner.surfaceSlug));
    return [{ path: addition.pathTemplate, surfaceSlugs: [...owners].sort(compareSurfaces) }];
  });
  return { ok: false, conflicts };
}

