import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { adapterFor, isAdapterName } from "@/lib/adapters";
import { templatePaths } from "@/lib/onboarding/confirm";
import { prepareFirstSnapshot, type FirstSnapshotInput } from "@/lib/onboarding/ingest";
import { runTokenFor } from "@/lib/events/payload";
import { recordEvent, recordRun } from "@/lib/events/record";
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
/** 모든 파싱을 잠금 전에 끝내고 검증된 payload만 같은 tx로 쓴다. */
export async function addSurfacesFromSnapshot(prisma: PrismaClient, input: { projectSlug: string; inputs: readonly AddSurfaceSnapshot[] }) {
  const first = input.inputs[0];
  if (!first || input.inputs.some(item => item.projectId !== first.projectId || item.userId !== first.userId)) throw new SurfaceCreationError("ingest-failed");
  if (new Set(input.inputs.map(item => item.format.pathTemplate)).size !== input.inputs.length) throw new SurfaceCreationError("path-conflict");
  const prepared = input.inputs.map(item => {
    const surfaceId = randomUUID(), token = randomUUID(), startedAt = new Date();
    const result = prepareFirstSnapshot({ ...item, surfaceId, surfaceSlug: "pending", projectSlug: input.projectSlug, token, startedAt });
    if (result.payload === null) throw new SurfaceCreationError("ingest-failed");
    return { item, surfaceId, token, startedAt, payload: result.payload, result: result.result };
  });
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${first.projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id: first.projectId } });
    if (!project) throw new SurfaceCreationError("not-found");
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: first.projectId, userId: first.userId } } });
    if (member?.role !== "OWNER") throw new SurfaceCreationError("forbidden");
    if (project.archivedAt !== null) throw new SurfaceCreationError("archived");
    for (const { repository: expected } of input.inputs) {
      if (project.repositoryId !== expected.repositoryId || project.installationId !== expected.installationId || project.repoOwner !== expected.repoOwner || project.repoName !== expected.repoName || project.baseBranch !== expected.baseBranch) throw new SurfaceCreationError("repo-replaced");
    }
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: first.projectId }, include: { locales: { where: { orphaned: false } } } });
    const slugs = surfaces.map(surface => surface.slug);
    const owners = surfaces.filter(surface => surface.archivedAt === null).map(surface => {
      if (!surface.adapterName || !isAdapterName(surface.adapterName) || !surface.pathTemplate) throw new SurfaceCreationError("ingest-failed");
      const format = { adapter: surface.adapterName, pathTemplate: surface.pathTemplate, locales: surface.locales.map(locale => locale.code) };
      const layout = adapterFor(format).layout;
      const saved = layout === "per-locale" ? resolveLocalePaths(format, layout, first.paths).map(path => path.path) : [];
      return { surfaceId: surface.id, surfaceSlug: surface.slug, paths: [...saved, ...templatePaths(surface.adapterName, surface.pathTemplate, first.paths)] };
    });
    const additions = prepared.map(value => {
      const slug = planSurfaceSlug(value.item.format.pathTemplate, slugs); slugs.push(slug);
      owners.push({ surfaceId: value.surfaceId, surfaceSlug: slug, paths: [...value.item.targets, ...resolveLocalePaths(value.item.format, adapterFor(value.item.format).layout, value.item.paths).map(path => path.path)] });
      return { ...value, slug };
    });
    const ownership = surfaceOwnership(owners);
    if (!ownership.ok) throw new SurfaceCreationError("path-conflict", ownership.conflicts);
    const results = [];
    for (const { item, surfaceId, slug, token, startedAt, payload, result } of additions) {
      await tx.translationSurface.create({ data: { id: surfaceId, projectId: first.projectId, slug, adapterName: item.format.adapter, pathTemplate: item.format.pathTemplate, baseLocale: item.baseLocale, lastImportStartedAt: startedAt, lastImportToken: token } });
      /**
       * ⚠️ **소스당 하나다** (결정 13) — 생성 때 붙은 소스와 나중에 추가한 소스가 **같은 모양**으로
       * 남아야 소스 필터가 둘을 같이 다룬다.
       */
      await recordEvent(tx, {
        projectId: first.projectId,
        subtype: "surface.added",
        actor: { kind: "USER", userId: first.userId },
        surfaceIds: [surfaceId],
        payload: { kind: "SURFACE", surfaceSlug: slug, adapter: item.format.adapter, baseLocale: { before: null, after: item.baseLocale } },
      });
      await applyPushInTransaction(tx, { projectId: first.projectId, surfaceId }, { ...payload, surfaceSlug: slug }, { refsMode: "replace", previousBaseLocale: null, startedAt, token, importOutcome: result.failed === 0 ? null : "partial-import" });
      results.push({ pathTemplate: item.format.pathTemplate, surfaceSlug: slug, count: result.count, failed: result.failed });
    }

    /**
     * 최초 적재 실행 **하나** — 소스별로 행을 복제하지 않고 대상 집합과 소스별 결과를 싣는다
     * (결정 14 · T5f). 실행 식별자는 첫 표면의 lease 토큰이다.
     */
    const runner = additions[0];
    if (runner !== undefined) {
      const failed = additions.filter(value => value.result.failed > 0).length;
      await recordRun(tx, {
        projectId: first.projectId,
        subtype: "import.first",
        actor: { kind: "USER", userId: first.userId },
        surfaceIds: additions.map(value => value.surfaceId),
        // 전부 성공이면 `Imported`, 하나라도 부분 실패면 `Partially completed`다 — 숨기지 않는다(불변식 9).
        result: failed === 0 ? "imported" : "partial",
        occurredAt: runner.startedAt,
        finishedAt: new Date(),
        runToken: runTokenFor({ kind: "import", token: runner.token }),
        payload: {
          kind: "IMPORT", source: "first",
          surfaceSlugs: additions.map(value => value.slug),
          keys: additions.reduce((sum, value) => sum + value.result.count, 0),
          pendingEdits: null,
          surfaces: additions.map(value => ({
            surfaceSlug: value.slug,
            status: value.result.failed === 0 ? ("imported" as const) : ("partial" as const),
            count: value.result.count,
            reason: null,
          })),
          errorCode: null, refusal: null,
        },
      });
    }
    return results;
  }, { maxWait: 10_000, timeout: 30_000 });
}
