import { isAdapterName } from "@/lib/adapters";
import type { ProjectReadiness } from "@/lib/onboarding/readiness";

export const IMPORT_STALE_AFTER_SECONDS = 300;

export function hasActiveImport(startedAt: Date | null, now: Date): boolean {
  return startedAt !== null && now.getTime() - startedAt.getTime() <= IMPORT_STALE_AFTER_SECONDS * 1000;
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
};

export function planRepositoryImport(input: ImportPlanInput) {
  if (input.readiness !== "ready") return { ok: false, error: "not-ready" } as const;
  if (input.identity !== "ok") return { ok: false, error: input.identity } as const;
  const active = input.surfaces.filter(surface => surface.archivedAt === null)
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  if ((input.repositoryImportToken !== null && hasActiveImport(input.repositoryImportStartedAt, input.now)) ||
    active.some(surface => hasActiveImport(surface.lastImportStartedAt, input.now))) {
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
