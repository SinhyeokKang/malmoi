import type { CandidateSummary } from "@/lib/onboarding/detect";
import { m } from "@/lib/i18n";

export type SurfaceAdded = { pathTemplate: string; surfaceSlug: string; count: number; failed: number };

export function planAddSources(input: { picked: readonly CandidateSummary[]; existing: readonly { pathTemplate: string | null }[] }):
  | { ok: true; add: CandidateSummary[]; locked: CandidateSummary[] }
  | { ok: false; error: "duplicate-path-template" } {
  const seen = new Set<string>();
  const existing = new Set(input.existing.map(surface => surface.pathTemplate));
  const add: CandidateSummary[] = [], locked: CandidateSummary[] = [];
  for (const candidate of input.picked) {
    if (seen.has(candidate.pathTemplate)) return { ok: false, error: "duplicate-path-template" };
    seen.add(candidate.pathTemplate);
    (existing.has(candidate.pathTemplate) ? locked : add).push(candidate);
  }
  return { ok: true, add, locked };
}

export function summarizeAddResults(results: readonly SurfaceAdded[]): { surfaces: number; keys: number; failed: number; tone: "success" | "warning" } {
  const keys = results.reduce((sum, result) => sum + result.count, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  // 오류 목록은 상위 몇 건뿐이고 중복 키 실패는 그 목록에 없을 수 있다.
  return { surfaces: results.length, keys, failed, tone: failed > 0 ? "warning" : "success" };
}

/** 집계는 서버가 orphaned를 제외해 넘긴다. 여기서 후보의 표본 개수를 대신 쓰지 않는다. */
export function formatSourceCounts(counts: { keys: number; locales: number }): string {
  return m.surfaces.sourceCounts(counts.keys, counts.locales);
}
