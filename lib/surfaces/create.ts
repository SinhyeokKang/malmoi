import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, isAdapterName } from "@/lib/adapters";
import { templatePaths } from "@/lib/onboarding/confirm";
import { prepareFirstSnapshot, type FirstSnapshotInput } from "@/lib/onboarding/ingest";
import { applyPushInTransaction } from "@/lib/push/apply";
import { resolveLocalePaths } from "@/lib/pull/plan";
import { planSurfaceSlug, surfaceOwnership } from "./plan";

export type AddSurfaceErrorCode = "not-found" | "forbidden" | "archived" | "repo-replaced" | "path-conflict" | "ingest-failed";
export class SurfaceCreationError extends Error {
  constructor(readonly code: AddSurfaceErrorCode, readonly conflicts: { path: string; surfaceSlugs: string[] }[] = []) {
    super(code);
  }
}

export type AddSurfaceSnapshot = Omit<FirstSnapshotInput, "surfaceId" | "surfaceSlug" | "startedAt" | "token" | "projectSlug"> & {
  userId: string;
  repository: { repositoryId: string; installationId: string; repoOwner: string; repoName: string; baseBranch: string };
};

/** GitHub I/O는 호출부가 끝낸다. 잠금 후 재조회한 경계와 첫 적재만 원자적으로 확정한다. */
export async function addSurfaceFromSnapshot(prisma: PrismaClient, input: AddSurfaceSnapshot) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (project === null) throw new SurfaceCreationError("not-found");
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: input.projectId, userId: input.userId } } });
    if (member?.role !== "OWNER") throw new SurfaceCreationError("forbidden");
    if (project.archivedAt !== null) throw new SurfaceCreationError("archived");
    const expected = input.repository;
    if (project.repositoryId !== expected.repositoryId || project.installationId !== expected.installationId ||
        project.repoOwner !== expected.repoOwner || project.repoName !== expected.repoName || project.baseBranch !== expected.baseBranch) {
      throw new SurfaceCreationError("repo-replaced");
    }
    // slug는 비활성 행과도 충돌할 수 있다. 경로 소유권만 활성 행으로 제한한다.
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: input.projectId },
      include: { locales: { where: { orphaned: false } } } });
    const slug = planSurfaceSlug(input.format.pathTemplate, surfaces.map(s => s.slug));
    const owners = surfaces.filter(s => s.archivedAt === null).map(s => {
      if (s.adapterName === null || !isAdapterName(s.adapterName) || s.pathTemplate === null) {
        throw new SurfaceCreationError("ingest-failed");
      }
      const format = { adapter: s.adapterName, pathTemplate: s.pathTemplate, locales: s.locales.map(l => l.code) };
      const layout = adapterFor(format).layout;
      // 리포에서 지워진 파일도 DB locale이 남아 있으면 다음 Publish가 재생성한다.
      const saved = layout === "per-locale" ? resolveLocalePaths(format, layout, input.paths).map(p => p.path) : [];
      return { surfaceId: s.id, surfaceSlug: s.slug, paths: [...saved, ...templatePaths(s.adapterName, s.pathTemplate, input.paths)] };
    });
    const ownership = surfaceOwnership([...owners, { surfaceId: `pending-${slug}`, surfaceSlug: slug,
      paths: [...input.targets, ...resolveLocalePaths(input.format, adapterFor(input.format).layout, input.paths).map(p => p.path)] }]);
    if (!ownership.ok) throw new SurfaceCreationError("path-conflict", ownership.conflicts);
    const startedAt = new Date();
    const token = randomUUID();
    const surface = await tx.translationSurface.create({ data: { projectId: input.projectId, slug,
      adapterName: input.format.adapter, pathTemplate: input.format.pathTemplate, baseLocale: input.baseLocale,
      lastImportStartedAt: startedAt, lastImportToken: token } });
    const prepared = prepareFirstSnapshot({ ...input, surfaceId: surface.id, surfaceSlug: slug,
      projectSlug: project.slug, startedAt, token });
    if (prepared.payload === null) throw new SurfaceCreationError("ingest-failed");
    await applyPushInTransaction(tx, { projectId: input.projectId, surfaceId: surface.id }, prepared.payload, {
      previousBaseLocale: null, startedAt, token, importOutcome: prepared.result.failed === 0 ? null : "partial-import",
    });
    const result = prepared.result;
    return { ...result, surfaceId: surface.id, surfaceSlug: slug };
  }, { maxWait: 10_000, timeout: 30_000 });
}
