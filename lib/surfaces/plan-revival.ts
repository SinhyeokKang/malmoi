/**
 * 재추가 = 되살림 (sources-add-remove — ARCHITECTURE §5.9). 같은 `pathTemplate` + 같은 어댑터의 제거(보관) 행이 있으면
 * 그 행을 되살린다 — 새 행을 만들면 옛 키·번역·이력이 `-2` 행과 분리된다.
 *
 * ⚠️ **어댑터가 다르면 되살리지 않는다** — 같은 경로라도 키 해석이 다르면 옛 키 집합이 그 포맷의 키가 아니다.
 * ⚠️ 일치 행이 여럿이면 `archivedAt`이 가장 최신인 행이다 — 사람이 마지막으로 쓰던 것이다.
 */

export type RevivalSurface = { id: string; slug: string; pathTemplate: string | null; adapterName: string | null; archivedAt: Date | null };
export type RevivalPlan = { kind: "revive"; surfaceId: string; slug: string } | { kind: "create" };

export function planSurfaceRevival(picks: readonly { pathTemplate: string; adapter: string }[], surfaces: readonly RevivalSurface[]): RevivalPlan[] {
  return picks.map(pick => {
    let best: RevivalSurface | null = null;
    for (const surface of surfaces) {
      if (surface.archivedAt === null || surface.pathTemplate !== pick.pathTemplate || surface.adapterName !== pick.adapter) continue;
      if (best === null || surface.archivedAt > (best.archivedAt as Date)) best = surface;
    }
    return best === null ? { kind: "create" } : { kind: "revive", surfaceId: best.id, slug: best.slug };
  });
}
