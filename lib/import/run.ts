import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, Project, TranslationSurface } from "@/generated/prisma/client";
import type { RepoReader } from "@/lib/github";
import { isAdapterName } from "@/lib/adapters";
import { logFailure } from "@/lib/github-connect/log";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { importOutcomeFields } from "@/lib/projects/import-status";
import { applyPushInTransaction } from "@/lib/push/apply";
import { planImportApply, type ImportSettings } from "./apply-plan";
import { hasActiveImport, planRepositoryImport } from "./plan";
import { snapshotError } from "./read";
import { prepareSurfaceImport, type PreparedSurfaceImport } from "./surface";
import type { RepositoryImportOutcome, SurfaceImportResult } from "./result";

type Repository = Pick<Project, "repositoryId" | "installationId" | "repoOwner" | "repoName" | "baseBranch">;
type ImportRunInput = { projectId: string; userId: string; repository: Repository };
type Lease = { project: Project; surfaces: TranslationSurface[]; token: string; startedAt: Date; userId: string };
const transactionOptions = { maxWait: 10_000, timeout: 30_000 };

function settings(project: Repository, surface: TranslationSurface): ImportSettings {
  return { repositoryId: project.repositoryId, installationId: project.installationId,
    repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch,
    adapterName: surface.adapterName, pathTemplate: surface.pathTemplate, baseLocale: surface.baseLocale,
    nested: surface.nested, nestedByPath: surface.nestedByPath };
}
function result(surface: TranslationSurface, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult {
  return { surfaceSlug: surface.slug, status, reason, count: 0, failed: status === "failed" ? 1 : 0, errors: [] };
}

async function acquire(prisma: PrismaClient, input: ImportRunInput): Promise<{ ok: true; lease: Lease } | Extract<RepositoryImportOutcome, { ok: false }>> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (project === null) return { ok: false, error: "not-found" };
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: input.projectId, userId: input.userId } } });
    if (member?.role !== "OWNER") return { ok: false, error: "forbidden" };
    if (project.archivedAt !== null) return { ok: false, error: "archived" };
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: input.projectId }, orderBy: { slug: "asc" } });
    const expected = input.repository;
    const identity = project.repositoryId === null || project.installationId === null ? "not-connected" :
      project.repositoryId !== expected.repositoryId || project.installationId !== expected.installationId || project.repoOwner !== expected.repoOwner ||
      project.repoName !== expected.repoName || project.baseBranch !== expected.baseBranch ? "repo-replaced" : "ok";
    const startedAt = new Date();
    const plan = planRepositoryImport({ ...project, now: startedAt, readiness: planProjectReadiness({ installationId: project.installationId, surfaces }), identity, surfaces,
      // Publish와의 배제는 배포 B(sync-edit-protection T9)에서 연결한다 — 배포 A는 사용자 흐름을 바꾸지 않는다.
      runningSync: null });
    if (!plan.ok) return plan;
    const token = randomUUID();
    await tx.project.update({ where: { id: project.id }, data: { repositoryImportToken: token, repositoryImportStartedAt: startedAt } });
    return { ok: true, lease: { project, token, startedAt, userId: input.userId,
      surfaces: surfaces.filter(surface => surface.archivedAt === null).sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) } };
  }, transactionOptions);
}

/** This lock order is shared with CI and existing transactions such as Add surface. */
async function current(tx: Prisma.TransactionClient, lease: Lease, captured: TranslationSurface) {
  const projectId = lease.project.id;
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${captured.id} FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: projectId } });
  const surface = await tx.translationSurface.findUnique({ where: { id: captured.id, projectId } });
  const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: lease.userId } } });
  if (project === null || surface === null) return { ok: false, reason: "lease-lost" } as const;
  const now = new Date();
  const plan = planImportApply({ now, token: lease.token, currentToken: project.repositoryImportToken, startedAt: project.repositoryImportStartedAt,
    capturedRevision: captured.importRevision, currentRevision: surface.importRevision, authorized: member?.role === "OWNER",
    archived: project.archivedAt !== null || surface.archivedAt !== null,
    capturedSettings: settings(lease.project, captured), currentSettings: settings(project, surface) });
  if (!plan.ok) return plan;
  // CI may be in flight before it commits a new revision. Its running marker also takes priority.
  if (surface.lastImportToken !== lease.token && hasActiveImport(surface.lastImportStartedAt, now)) return { ok: false, reason: "superseded" } as const;
  return { ok: true, surface } as const;
}

async function finishSurface(prisma: PrismaClient, lease: Lease, surface: TranslationSurface, prepared: PreparedSurfaceImport, snapshot: { headSha: string; headCommittedAt: string }): Promise<SurfaceImportResult> {
  return prisma.$transaction(async tx => {
    const check = await current(tx, lease, surface);
    if (!check.ok) return result(surface, "superseded", check.reason);
    const scope = { projectId: lease.project.id, surfaceId: surface.id };
    if (prepared.kind === "payload") {
      await applyPushInTransaction(tx, scope, prepared.payload, {
        token: lease.token, startedAt: lease.startedAt, refsMode: "preserve", previousBaseLocale: surface.baseLocale,
        importOutcome: prepared.result.failed > 0 ? "partial-import" : null,
      });
    } else if (prepared.kind === "empty") {
      await tx.stringKey.updateMany({ where: { ...scope, orphaned: false }, data: { orphaned: true } });
      // 정상 0키도 **성공 종료**다 — `importOutcomeFields(null)`이 실패 시각까지 비운다.
      await tx.translationSurface.update({ where: { id: surface.id, projectId: scope.projectId }, data: {
        lastCommitSha: snapshot.headSha, lastCommitAt: new Date(snapshot.headCommittedAt), importRevision: { increment: 1 },
        ...importOutcomeFields(null, new Date()), lastImportToken: null,
      } });
    } else {
      await tx.translationSurface.update({ where: { id: surface.id, projectId: scope.projectId }, data: {
        ...importOutcomeFields("import-failed", new Date()), lastImportToken: null,
      } });
    }
    return { surfaceSlug: surface.slug,
      status: prepared.kind === "failed" ? "failed" : prepared.result.failed > 0 ? "partial" : "imported",
      reason: prepared.kind === "failed" ? prepared.error === "resource-limit" ? "resource-limit" : "import-failed" : null,
      count: prepared.result.count, failed: prepared.result.failed,
      errors: prepared.result.errors.map(({ path, code }) => ({ path, code })),
    };
  }, transactionOptions);
}

/** The callback opens an installation reader only after atomic execution ownership is acquired. */
export async function runRepositoryImportFromReader(prisma: PrismaClient, input: ImportRunInput, openReader: () => Promise<RepoReader>): Promise<RepositoryImportOutcome> {
  const acquired = await acquire(prisma, input);
  if (!acquired.ok) return acquired;
  const { lease } = acquired;
  const failure: PreparedSurfaceImport = { kind: "failed", error: "ingest-failed", result: { count: 0, failed: 1, errors: [] } };
  const unchangedSnapshot = { headSha: "", headCommittedAt: lease.startedAt.toISOString() };
  try {
    if (lease.surfaces.every(surface => surface.adapterName === null || !isAdapterName(surface.adapterName) || !surface.pathTemplate || !surface.baseLocale)) {
      return { ok: true, surfaces: lease.surfaces.map(surface => result(surface, "failed", "invalid-format")) };
    }
    const reader = await openReader();
    const snapshot = await reader.snapshot(lease.project.baseBranch);
    if (snapshot.status !== "ok") {
      for (const surface of lease.surfaces) await finishSurface(prisma, lease, surface, failure, unchangedSnapshot);
      return { ok: false, error: snapshotError(snapshot) };
    }
    const surfaces: SurfaceImportResult[] = [];
    for (const surface of lease.surfaces) {
      if (surface.adapterName === null || !isAdapterName(surface.adapterName) || !surface.pathTemplate || !surface.baseLocale) {
        surfaces.push(result(surface, "failed", "invalid-format"));
        continue;
      }
      try {
        const marking = await prisma.$transaction(async tx => {
          const check = await current(tx, lease, surface);
          if (!check.ok) return check;
          await tx.translationSurface.update({ where: { id: surface.id, projectId: input.projectId }, data: { lastImportToken: lease.token, lastImportStartedAt: lease.startedAt } });
          return { ok: true } as const;
        }, transactionOptions);
        if (!marking.ok) { surfaces.push(result(surface, "superseded", marking.reason)); continue; }
        const prepared = await prepareSurfaceImport(reader, {
          projectId: input.projectId, projectSlug: lease.project.slug, mode: "repository", snapshot,
          token: lease.token, startedAt: lease.startedAt,
          surface: { id: surface.id, slug: surface.slug, adapter: surface.adapterName, pathTemplate: surface.pathTemplate, baseLocale: surface.baseLocale, nested: surface.nested, nestedByPath: surface.nestedByPath },
        });
        surfaces.push(await finishSurface(prisma, lease, surface, prepared, snapshot));
      } catch (error) {
        logFailure("repository-import-surface", error);
        try { surfaces.push(await finishSurface(prisma, lease, surface, failure, snapshot)); }
        catch (recordError) { logFailure("repository-import-record", recordError); surfaces.push(result(surface, "failed", "import-failed")); }
      }
    }
    return { ok: true, surfaces };
  } catch (error) {
    logFailure("repository-import-read", error);
    for (const surface of lease.surfaces) {
      try { await finishSurface(prisma, lease, surface, failure, unchangedSnapshot); }
      catch (recordError) { logFailure("repository-import-record", recordError); }
    }
    return { ok: false, error: "ingest-failed" };
  } finally {
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
        const project = await tx.project.findUnique({ where: { id: input.projectId } });
        if (project?.repositoryImportToken !== lease.token || !hasActiveImport(project.repositoryImportStartedAt, new Date())) return;
        // Clear only our markers, including configuration-change refusals. Never erase another CI/run's marker or outcome.
        await tx.translationSurface.updateMany({ where: { projectId: input.projectId, lastImportToken: lease.token }, data: { lastImportToken: null, lastImportStartedAt: null } });
        await tx.project.updateMany({ where: { id: input.projectId, repositoryImportToken: lease.token }, data: { repositoryImportToken: null, repositoryImportStartedAt: null } });
      }, transactionOptions);
    } catch (error) { logFailure("repository-import-release", error); }
  }
}
