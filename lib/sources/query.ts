import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { canPerform, type Role } from "@/lib/auth/permission";
import { loadLocaleCounts, loadSurfaceCounts } from "@/lib/keys/query";
import { localeProgress } from "@/lib/keys/view";
import { isAdapterName } from "@/lib/adapters";
import { baseLocaleLine } from "@/lib/onboarding/workflow";
import { formatLabel } from "@/lib/onboarding/detect";
import type { Messages } from "@/lib/i18n";
import { hasActiveImport } from "@/lib/import/plan";

const sourceSelect = {
  id: true, slug: true, adapterName: true, pathTemplate: true, baseLocale: true, declaredBaseLocale: true,
  lastCommitSha: true, lastCommitAt: true, lastImportStartedAt: true, lastImportError: true, lastImportFailedAt: true,
  lastImportedAt: true, createdAt: true,
} satisfies Prisma.TranslationSurfaceSelect;
type SourceRecord = Prisma.TranslationSurfaceGetPayload<{ select: typeof sourceSelect }>;
function sourceView(m: Messages, source: SourceRecord, role: Role) {
  // select와 별개로 응답도 명시한다. 인가가 반환한 전체 레코드가 클라이언트로 새지 않는다.
  return {
    id: source.id, slug: source.slug, baseLocale: source.baseLocale, declaredBaseLocale: source.declaredBaseLocale,
    lastCommitSha: source.lastCommitSha, lastCommitAt: source.lastCommitAt,
    lastImportStartedAt: source.lastImportStartedAt, lastImportError: source.lastImportError, lastImportFailedAt: source.lastImportFailedAt,
    lastImportedAt: source.lastImportedAt, createdAt: source.createdAt,
    ...(canPerform(role, "project:settings") ? { connection: { adapterName: source.adapterName, pathTemplate: source.pathTemplate, format: source.adapterName !== null && isAdapterName(source.adapterName) ? formatLabel(m, source.adapterName).label : null } } : {}),
  };
}
const projectSelect = { repoOwner: true, repoName: true, baseBranch: true, installationId: true } as const;
function projectView(project: { repoOwner: string; repoName: string; baseBranch: string; installationId: string | null }, role: Role) {
  return { installed: project.installationId !== null, ...(canPerform(role, "project:settings") ? { repository: { repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch } } : {}) };
}

export async function loadSources(prisma: PrismaClient, m: Messages, projectId: string, role: Role) {
  const [project, counts, locales, cells] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, archivedAt: null }, select: { ...projectSelect, surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" }, select: sourceSelect } } }),
    loadSurfaceCounts(prisma, projectId),
    prisma.locale.findMany({ where: { projectId, surface: { archivedAt: null } }, select: { surfaceId: true, code: true, orphaned: true } }),
    // 목록은 셀을 가져오지 않고 표면별 두 개수만 집계한다. 소스가 늘어도 왕복은 같다.
    prisma.translation.groupBy({ by: ["surfaceId", "needsReview"], where: { projectId, surface: { archivedAt: null }, stringKey: { orphaned: false }, locale: { orphaned: false }, value: { not: "" } }, _count: { _all: true } }),
  ]);
  if (project === null) return null;
  return { ...projectView(project, role), sources: project.surfaces.map(source => {
    const count = counts.find(row => row.surfaceId === source.id);
    const keys = count?.keys ?? 0;
    const languageCount = count?.locales ?? 0;
    const total = keys * languageCount;
    const done = Math.min(total, cells.find(row => row.surfaceId === source.id && !row.needsReview)?._count._all ?? 0);
    const review = Math.min(total - done, cells.find(row => row.surfaceId === source.id && row.needsReview)?._count._all ?? 0);
    return { ...sourceView(m, source, role), keys, locales: languageCount, orphanedLocales: locales.filter(row => row.surfaceId === source.id && row.orphaned).length,
      progress: { total, done, review, percent: total === 0 ? 0 : Math.floor(done / total * 100) } };
  }) };
}

export async function loadSource(prisma: PrismaClient, m: Messages, projectId: string, surfaceId: string, role: Role) {
  const source = await prisma.translationSurface.findFirst({ where: { projectId, id: surfaceId, archivedAt: null }, select: sourceSelect });
  if (source === null) return null;
  const [project, locales, counts] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, archivedAt: null }, select: projectSelect }),
    prisma.locale.findMany({ where: { projectId, surfaceId, surface: { archivedAt: null } }, select: { code: true, isBase: true, orphaned: true } }),
    loadLocaleCounts(prisma, projectId, surfaceId),
  ]);
  if (project === null) return null;
  return { ...sourceView(m, source, role), ...projectView(project, role), ...(canPerform(role, "project:settings") && source.declaredBaseLocale ? { workflowLine: baseLocaleLine(source.declaredBaseLocale) } : {}), keys: counts.total, locales: locales.filter(locale => !locale.orphaned).length, languages: localeProgress({ ...counts, locales }),
    /**
     * 살아 있는 적재 표시 — [Remove source]의 사전 차단이 서버 판정(`removeSurface`의 `importing`)과 같은 입력을 쓰게 서버가 계산한다.
     * ⚠️ `lastImportStartedAt !== null`(목록 상태 판정)로 대신하지 않는다 — 만료된 표시는 제거를 막지 않는다. `hasActiveImport`는
     * `lib/adapters`를 끌어와 클라이언트 번들에 못 싣는다(`client-graph.test.ts`).
     */
    importActive: hasActiveImport(source.lastImportStartedAt, new Date()) };
}
export type SourcesData = NonNullable<Awaited<ReturnType<typeof loadSources>>>;
export type SourceDetail = NonNullable<Awaited<ReturnType<typeof loadSource>>>;
