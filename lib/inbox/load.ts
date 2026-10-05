import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { collectAttention, neverFilledLocales } from "@/lib/home/attention";
import { loadActors, loadProjectListAggregates, loadReviewAttention } from "@/lib/keys/query";
import { isImportFailureCode } from "@/lib/projects/import-failure";
import { projectStatus } from "@/lib/projects/list";
import { planInbox, type InboxPlan } from "./plan";

export async function loadAttentionInbox(prisma: PrismaClient, userId: string): Promise<InboxPlan> {
  // 레이아웃의 멤버십을 넓히지 않는다 — Inbox를 요청한 때만 이 재료가 필요하다.
  const rows = await prisma.projectMember.findMany({
    where: { userId, project: { archivedAt: null } },
    select: {
      role: true,
      user: { select: { attentionSeenAt: true } },
      project: { select: {
        id: true, slug: true, name: true, image: true, createdAt: true,
        installationId: true, repositoryId: true, archivedAt: true,
        surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" }, select: {
          id: true, slug: true, archivedAt: true, lastCommitSha: true,
          lastImportError: true, lastImportStartedAt: true, lastImportFailedAt: true,
          locales: { select: { code: true, name: true, orphaned: true, createdAt: true } },
        } },
      } },
    },
    orderBy: { project: { slug: "asc" } },
  });
  if (rows.length === 0) return { groups: [], unread: 0 };
  const ids = rows.map(row => row.project.id);
  const [aggregates, review] = await Promise.all([
    loadProjectListAggregates(prisma, ids), loadReviewAttention(prisma, ids),
  ]);
  const actors = await loadActors(prisma, [...new Set(review.flatMap(row => row.updatedBy === null ? [] : [row.updatedBy]))]);
  return planInbox({ seenAt: rows[0]!.user.attentionSeenAt, projects: rows.map(row => {
    const project = row.project;
    const surfaces = project.surfaces.map(surface => ({ ...surface,
      importError: isImportFailureCode(surface.lastImportError) ? surface.lastImportError : null,
      importing: surface.lastImportStartedAt !== null,
    }));
    const bySurface = new Map(surfaces.map(surface => [surface.id, surface]));
    const attention = collectAttention(surfaces, review.flatMap(item => {
      if (item.projectId !== project.id) return [];
      const surface = bySurface.get(item.surfaceId);
      if (surface === undefined) return [];
      return [{ surfaceSlug: surface.slug, code: item.localeCode,
        name: surface.locales.find(locale => locale.code === item.localeCode)?.name ?? item.localeCode,
        count: item.count, at: item.at, updatedBy: item.updatedBy }];
    }), neverFilledLocales(surfaces, aggregates), actors);
    const count = aggregates.unsent.get(project.id) ?? 0;
    const surfaceSlug = aggregates.unsentSurfaces.get(project.id);
    return {
      slug: project.slug, name: project.name, image: project.image, role: row.role,
      status: projectStatus(project), createdAt: project.createdAt, attention,
      unsent: count > 0 && surfaceSlug !== undefined ? { count, surfaceSlug, at: aggregates.unsentAt.get(project.id) ?? null } : null,
    };
  }) });
}
