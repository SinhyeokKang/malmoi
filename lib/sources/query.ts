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
import { hasRepoConnection } from "@/lib/repo-host/target";
import { sourceRowMeters } from "./meters";
import { readLocaleStates } from "@/lib/locales/work";
import { localeRole } from "@/lib/translations/summary";

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
const projectSelect = { repoOwner: true, repoName: true, baseBranch: true, repoHost: true, installationId: true, repositoryId: true } as const;
function projectView(project: { repoOwner: string; repoName: string; baseBranch: string; repoHost: string; installationId: string | null; repositoryId: string | null }, role: Role) {
  // `installed`는 readiness의 연결 증거다 — GitHub 설치·GitLab 고정 리포(`hasRepoConnection`). 이름은 화면 계약이라 그대로 둔다.
  // `repoHost`는 화면 문장(`RepoHostScope`)과 머리 글리프를 고른다 — 역할과 무관한 프로젝트 사실이다(주소는 OWNER만).
  return { installed: hasRepoConnection(project), repoHost: project.repoHost, ...(canPerform(role, "project:settings") ? { repository: { repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch } } : {}) };
}

export async function loadSources(prisma: PrismaClient, m: Messages, projectId: string, role: Role) {
  const [project, counts, locales, cells] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, archivedAt: null }, select: { ...projectSelect, surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" }, select: sourceSelect } } }),
    loadSurfaceCounts(prisma, projectId),
    prisma.locale.findMany({ where: { projectId, surface: { archivedAt: null } }, select: { surfaceId: true, code: true, isBase: true, orphaned: true, change: { select: { operation: true } } } }),
    // 상세와 같은 조건으로 집계한다. 작업 언어는 아래에서 골라 분모(`loadSurfaceCounts`)와 맞추며 왕복은 늘리지 않는다.
    prisma.translation.groupBy({ by: ["surfaceId", "localeCode", "needsReview"], where: { projectId, surface: { archivedAt: null }, stringKey: { orphaned: false }, value: { not: "" } }, _count: { _all: true } }),
  ]);
  if (project === null) return null;
  return { ...projectView(project, role), sources: project.surfaces.map(source => {
    const count = counts.find(row => row.surfaceId === source.id);
    const keys = count?.keys ?? 0;
    const languageCount = count?.locales ?? 0;
    const total = keys * languageCount;
    const languages = localeProgress({
      locales: locales.filter(row => row.surfaceId === source.id && localeRole(row) === "work"),
      total: keys,
      cells: cells.filter(row => row.surfaceId === source.id).map(row => ({ localeCode: row.localeCode, needsReview: row.needsReview, count: row._count._all })),
    });
    const done = Math.min(total, languages.reduce((sum, row) => sum + row.translated, 0));
    const review = Math.min(total - done, languages.reduce((sum, row) => sum + row.needsReview, 0));
    return { ...sourceView(m, source, role), keys, locales: languageCount, orphanedLocales: locales.filter(row => row.surfaceId === source.id && row.orphaned).length,
      progress: { total, done, review, percent: total === 0 ? 0 : Math.floor(done / total * 100) }, meters: sourceRowMeters(languages) };
  }) };
}

export async function loadSource(prisma: PrismaClient, m: Messages, projectId: string, surfaceId: string, role: Role) {
  const source = await prisma.translationSurface.findFirst({ where: { projectId, id: surfaceId, archivedAt: null }, select: sourceSelect });
  if (source === null) return null;
  const [project, locales, counts, localeStates, confirmation] = await Promise.all([
    // `lastPrUrl` — 언어 행의 PR 링크다. 저장된 마지막 Publish 주소만 읽고 호스트를 부르지 않는다(그래서 조회 실패 상태가 없다 — 그건 Home 몫).
    prisma.project.findFirst({ where: { id: projectId, archivedAt: null }, select: { ...projectSelect, lastPrUrl: true } }),
    prisma.locale.findMany({ where: { projectId, surfaceId, surface: { archivedAt: null } }, select: { code: true, isBase: true, orphaned: true, change: { select: { operation: true, requestedAt: true } } } }),
    loadLocaleCounts(prisma, projectId, surfaceId),
    readLocaleStates(prisma, projectId, surfaceId),
    // 확인 무효화는 의도 행이 없어도 본다 — `readLocaleStates`는 행·전달 목록이 빈 소스를 싣지 않는다.
    prisma.deliveryConfirmation.findUnique({ where: { projectId_surfaceId: { projectId, surfaceId } }, select: { invalidatedAt: true } }),
  ]);
  if (project === null) return null;
  const { lastPrUrl, ...projectRow } = project;
  /**
   * 언어 상태 (locale-add design §5·§6). `change`는 현재 의도(ADD·REMOVE)이고 `unsent`는 그 언어의 파일 변경이 마지막 전달과 다르다는 뜻이다
   * (`localeWork` — 셀 편집의 Unsent와 따로 센다). 제거 취소 뒤 남은 차이도 행 없이 `unsent`다. `localeDelivery: "unconfirmed"`는 확인이
   * 무효화 중이라 `unsent`가 실렸는지 모르는 상태다 — 화면은 단정하지 않는다. 행은 상태와 무관하게 남는다(작업 수는 `locales`가 뺀다).
   */
  const unsent = new Set((localeStates[0]?.work ?? []).map(item => item.localeCode));
  const changeOf = new Map(locales.flatMap(locale => (locale.change === null ? [] : [[locale.code, locale.change] as const])));
  return { ...sourceView(m, source, role), ...projectView(projectRow, role), pullRequestUrl: lastPrUrl, ...(canPerform(role, "project:settings") && source.declaredBaseLocale ? { workflowLine: baseLocaleLine(source.declaredBaseLocale) } : {}), keys: counts.total, locales: locales.filter(locale => localeRole(locale) === "work").length,
    languages: localeProgress({ ...counts, locales }).map(row => ({ ...row, change: changeOf.get(row.code) ?? null, unsent: unsent.has(row.code) })),
    localeDelivery: (confirmation?.invalidatedAt ?? null) !== null ? "unconfirmed" as const : "confirmed" as const,
    /**
     * 살아 있는 적재 표시 — [Detach source]의 사전 차단이 서버 판정(`removeSurface`의 `importing`)과 같은 입력을 쓰게 서버가 계산한다.
     * ⚠️ `lastImportStartedAt !== null`(목록 상태 판정)로 대신하지 않는다 — 만료된 표시는 제거를 막지 않는다. `hasActiveImport`는
     * `lib/adapters`를 끌어와 클라이언트 번들에 못 싣는다(`client-graph.test.ts`).
     */
    importActive: hasActiveImport(source.lastImportStartedAt, new Date()) };
}
export type SourcesData = NonNullable<Awaited<ReturnType<typeof loadSources>>>;
export type SourceDetail = NonNullable<Awaited<ReturnType<typeof loadSource>>>;
