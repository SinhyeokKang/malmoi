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
