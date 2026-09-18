import { isAdapterName } from "@/lib/adapters";
import type { ProjectReadiness } from "@/lib/onboarding/readiness";
import { isRunActive, STALE_AFTER_SECONDS } from "@/lib/sync/plan";

/** Publish와 같은 값이다 — 경계 판정은 `isRunActive` 하나다 (sync-edit-protection — ARCHITECTURE §5.6.1). */
export const IMPORT_STALE_AFTER_SECONDS = STALE_AFTER_SECONDS;

export function hasActiveImport(startedAt: Date | null, now: Date): boolean {
  return startedAt !== null && isRunActive(startedAt, now);
}

export type ImportPlanSurface = {
  id: string; slug: string; archivedAt: Date | null;
  adapterName: string | null; pathTemplate: string | null; baseLocale: string | null;
  lastImportStartedAt: Date | null;
};
export type ImportPlanInput = {
  now: Date; readiness: ProjectReadiness;
  identity: "ok" | "not-connected" | "repo-replaced";
  repositoryImportToken: string | null; repositoryImportStartedAt: Date | null;
  surfaces: readonly ImportPlanSurface[];
  /** 진행 중인 Publish(`SyncRun` RUNNING). 배포 A에서는 호출부가 `null`을 넘긴다 — T9가 연결한다. */
  runningSync: { startedAt: Date } | null;
};

export function planRepositoryImport(input: ImportPlanInput) {
  if (input.readiness !== "ready") return { ok: false, error: "not-ready" } as const;
  if (input.identity !== "ok") return { ok: false, error: input.identity } as const;
  const active = input.surfaces.filter(surface => surface.archivedAt === null)
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  if ((input.repositoryImportToken !== null && hasActiveImport(input.repositoryImportStartedAt, input.now)) ||
    active.some(surface => hasActiveImport(surface.lastImportStartedAt, input.now)) ||
    (input.runningSync !== null && hasActiveImport(input.runningSync.startedAt, input.now))) {
    return { ok: false, error: "already-running" } as const;
  }
  if (active.length === 0) return { ok: false, error: "no-surfaces" } as const;
  const surfaces: ImportPlanSurface[] = [];
  const invalidFormat: ImportPlanSurface[] = [];
  for (const surface of active) {
    (surface.adapterName !== null && isAdapterName(surface.adapterName) && surface.pathTemplate && surface.baseLocale
      ? surfaces : invalidFormat).push(surface);
  }
  return { ok: true, surfaces, invalidFormat } as const;
}
