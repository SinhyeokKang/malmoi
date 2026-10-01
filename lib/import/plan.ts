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
  /** `unpinned` — 리포 id가 고정되지 않았다. 설치 없음은 readiness(`not-ready`)가 먼저 거른다. */
  identity: "ok" | "unpinned" | "repo-replaced";
  repositoryImportToken: string | null; repositoryImportStartedAt: Date | null;
  surfaces: readonly ImportPlanSurface[];
  /** 진행 중인 Publish(`SyncRun` RUNNING). 껍데기(`lib/import/run.ts`)가 같은 Project 잠금 안에서 읽어 넘긴다. */
  runningSync: { startedAt: Date } | null;
};

/**
 * 살아 있는 적재가 있나 — 서버 적재의 실행권(`repositoryImportToken`)이나 활성 표면의 진행 표시(첫 적재·CI). **만료된 `import:` 행을 닫아도
 * 되는지의 판정**이고 `planRepositoryImport`의 `already-running`과 같은 술어다(Publish 제외 — Publish는 `import:` 행을 만들지 않는다).
 * `acquire`와 야간 방문(`closeExpiredImportRuns`)이 이 하나를 쓴다 — 사본 둘이면 한쪽이 살아 있는 lease의 행을 닫는다.
 */
export function hasLiveInternalImport(input: Pick<ImportPlanInput, "now" | "repositoryImportToken" | "repositoryImportStartedAt"> & {
  surfaces: readonly Pick<ImportPlanSurface, "archivedAt" | "lastImportStartedAt">[];
}): boolean {
  return (input.repositoryImportToken !== null && hasActiveImport(input.repositoryImportStartedAt, input.now)) ||
    input.surfaces.some(surface => surface.archivedAt === null && hasActiveImport(surface.lastImportStartedAt, input.now));
}

export function planRepositoryImport(input: ImportPlanInput) {
  if (input.readiness !== "ready") return { ok: false, error: "not-ready" } as const;
  if (input.identity !== "ok") return { ok: false, error: input.identity } as const;
  const active = input.surfaces.filter(surface => surface.archivedAt === null)
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  if (hasLiveInternalImport(input) ||
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
