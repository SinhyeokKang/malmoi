import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, Project, TranslationSurface } from "@/generated/prisma/client";
import type { RepoReader } from "@/lib/github";
import { isAdapterName } from "@/lib/adapters";
import { logFailure } from "@/lib/github-connect/log";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { importOutcomeFields } from "@/lib/projects/import-status";
import { applyPushInTransaction } from "@/lib/push/apply";
import { sameFingerprint } from "@/lib/protection/fingerprint";
import { planDiscardConfirmation, planProtectedImport } from "@/lib/protection/plan";
import { countPending } from "@/lib/protection/where";
import { runTokenFor } from "@/lib/events/payload";
import { finishRun, recordImportRefusal, recordRun } from "@/lib/events/record";
import { summarizeImportEvent } from "@/lib/events/view";
import { readDiscardApproval } from "./approval";
import { planImportApply, type ImportSettings } from "./apply-plan";
import { hasActiveImport, planRepositoryImport } from "./plan";
import { snapshotError } from "./read";
import { prepareSurfaceImport, type PreparedSurfaceImport } from "./surface";
import type { RepositoryImportOutcome, SurfaceImportResult } from "./result";

type Repository = Pick<Project, "repositoryId" | "installationId" | "repoOwner" | "repoName" | "baseBranch">;
/**
 * @param approval Dialog가 열릴 때 서버가 발급한 폐기 승인 지문(`readDiscardApproval`). 없으면 `null` — 미전달 편집이 있으면 reconfirm이다.
 */
type ImportRunInput = { projectId: string; userId: string; repository: Repository; approval: string | null };
/** @param approvedTokens 잠금 뒤 지문 대조를 지난 편집 토큰 — upsert는 토큰 없거나 이 목록인 셀만 덮는다. */
type Lease = { project: Project; surfaces: TranslationSurface[]; token: string; startedAt: Date; userId: string; approvedTokens: readonly string[] };
const transactionOptions = { maxWait: 10_000, timeout: 30_000 };

function settings(project: Repository, surface: TranslationSurface): ImportSettings {
  return { repositoryId: project.repositoryId, installationId: project.installationId,
    repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch,
    adapterName: surface.adapterName, pathTemplate: surface.pathTemplate, baseLocale: surface.baseLocale,
    nested: surface.nested, nestedByPath: surface.nestedByPath };
}
function result(surface: TranslationSurface, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult {
  return { surfaceSlug: surface.slug, status, reason, count: 0, failed: status === "failed" ? 1 : 0, unmanaged: 0, errors: [] };
}

async function acquire(prisma: PrismaClient, input: ImportRunInput): Promise<{ ok: true; lease: Lease } | Extract<RepositoryImportOutcome, { ok: false }>> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (project === null) return { ok: false, error: "not-found" };
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: input.projectId, userId: input.userId } } });
    if (member?.role !== "OWNER") return { ok: false, error: "forbidden" };
    if (project.archivedAt !== null) {
      await recordImportRefusal(tx, { projectId: project.id, userId: input.userId, error: "archived" });
      return { ok: false, error: "archived" };
    }
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: input.projectId }, orderBy: { slug: "asc" } });
    const expected = input.repository;
    const identity = project.repositoryId === null || project.installationId === null ? "not-connected" :
      project.repositoryId !== expected.repositoryId || project.installationId !== expected.installationId || project.repoOwner !== expected.repoOwner ||
      project.repoName !== expected.repoName || project.baseBranch !== expected.baseBranch ? "repo-replaced" : "ok";
    const startedAt = new Date();
    // Publish가 스냅샷을 뜨는 중에 리포 값으로 덮으면 절반만 덮인 DB가 PR로 나간다 — 같은 Project 잠금 안에서 읽는다 (ARCHITECTURE §5.6.1).
    const runningSync = await tx.syncRun.findFirst({ where: { projectId: project.id, status: "RUNNING" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    const plan = planRepositoryImport({ ...project, now: startedAt, readiness: planProjectReadiness({ installationId: project.installationId, surfaces }), identity, surfaces, runningSync });
    if (!plan.ok) {
      await recordImportRefusal(tx, { projectId: project.id, userId: input.userId, error: plan.error });
      return plan;
    }
    /**
     * **폐기 승인은 잠금 뒤에 재계산한다** (ARCHITECTURE §5.5.2 · POSTMORTEM 2026-09-13 "일회용 연결 요청을 락 전에 읽었다").
     * 클라이언트의 `discard: true`를 믿지 않는다 — Dialog 뒤 새 편집·적용·설정 변경은 전부 지문을 바꿔 reconfirm이 된다.
     */
    const approval = await readDiscardApproval(tx, { projectId: project.id, userId: input.userId });
    const confirmation = planDiscardConfirmation({ role: member.role, fingerprintMatches: sameFingerprint(input.approval, approval.fingerprint) });
    const decision = planProtectedImport({ mode: "manual", pending: approval.pending.length, approved: confirmation.action === "proceed" });
    if (decision.action !== "apply") return { ok: false, error: "reconfirm" };
    const token = randomUUID();
    await tx.project.update({ where: { id: project.id }, data: { repositoryImportToken: token, repositoryImportStartedAt: startedAt } });
    const active = surfaces.filter(surface => surface.archivedAt === null).sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

    /**
     * ⚠️ **중단된 이전 실행을 여기서 닫는다** (logs-rework T5b-0 · spec §7.4). 잠금을 얻었다는 것은
     * 이전 lease가 더 이상 살아 있지 않다는 뜻이므로(`planRepositoryImport`가 활성 실행을 거부한다),
     * 아직 안 닫힌 내부 Import 이벤트는 전부 만료된 것이다. **브라우저·조회가 이것을 하지 않는다** —
     * 다음 실행이 닫는다는 점에서 Publish의 stale 처리와 같은 형이다.
     *
     * ⚠️ **`import:` 접두로 좁힌다** — CI(`ci:`)는 종료만 기록하므로 미종료 행이 없고, 접두가 없으면
     * 그쪽까지 건드리게 된다.
     */
    await tx.projectEvent.updateMany({
      where: { projectId: project.id, kind: "IMPORT", finishedAt: null, runToken: { startsWith: "import:" } },
      data: { result: "failed", finishedAt: startedAt },
    });

    /**
     * 실행은 행 하나다 (결정 12) — 시작에 `INSERT`(결과 null), 종료에 같은 행을 갱신한다.
     * ⚠️ **대상 소스를 지금 잡는다** — 실행 중에 소스가 늘어도 이 집합은 안 바뀐다.
     */
    await recordRun(tx, {
      projectId: project.id,
      subtype: "import.run",
      actor: { kind: "USER", userId: input.userId },
      surfaceIds: active.map(surface => surface.id),
      occurredAt: startedAt,
      runToken: runTokenFor({ kind: "import", token }),
      payload: { kind: "IMPORT", source: "manual", surfaceSlugs: active.map(surface => surface.slug),
        keys: null, pendingEdits: null, surfaces: [], errorCode: null, refusal: null },
    });
    return { ok: true, lease: { project, token, startedAt, userId: input.userId, approvedTokens: approval.pending.map(edit => edit.token),
      surfaces: active } };
  }, transactionOptions);
}

/** 이 잠금 순서는 CI와 Add surface 같은 기존 트랜잭션이 공유한다. */
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
  // CI가 새 revision을 커밋하기 전에 진행 중일 수 있다. 그 실행 표시도 우선한다.
  if (surface.lastImportToken !== lease.token && hasActiveImport(surface.lastImportStartedAt, now)) return { ok: false, reason: "superseded" } as const;
  return { ok: true, surface } as const;
}

/**
 * **이번 적재로 orphan이 된 승인 셀의 토큰을 비운다** (delivery-invariants D1 · 감사 #1). upsert는 페이로드에 없는 셀에 안 닿아서, 폐기를
 * 승인한 Sync가 떨어뜨린 키·로케일의 셀에 토큰이 남았다. `pendingWhere`가 orphan을 빼므로 화면 어디에도 0으로 보이다가, 그 키가 코드에
 * 되살아나면 CI push가 unorphan → 사후 재집계 1 → 롤백 → `deferred`를 **매번** 반복했다.
 *
 * - "이번 적재로 orphan이 됐다"를 따로 계산하지 않는다 — 승인 집합은 `pendingWhere` 기준이라 승인 시점에 이미 orphan인 셀은 들어 있지
 *   않다. 그래서 지금 orphan인 승인 셀은 전부 이번 적재가 만든 것이다(뒤집으면: 배포 전 잔존 유령 토큰은 여기서 안 풀린다).
 * - ⚠️ **빈 값·실패 파일 승인 셀은 그대로다** — 토큰이 남아 `remainingEdits`로 보인다. "전부 해제"는 리포에 값이 없던 셀의 편집값을 pending
 *   아닌 채 남겨 다른 Publish에 조용히 싣는다(`/feature-review` CTO).
 * - ⚠️ **적재가 확정된 갈래(`payload`·`empty`)에서만 부른다** — tx 끝에 공통으로 두면 적재 안 된 표면의 편집이 사라진다(POSTMORTEM
 *   2026-09-09 "일회용 허가를 이벤트로 비웠다").
 * - `updatedAt`을 건드리지 않는다 — raw SQL이라 `@updatedAt`이 개입하지 않는다(`acknowledgeDelivered`와 같은 이유).
 */
async function releaseOrphanedApproved(tx: Prisma.TransactionClient, scope: { projectId: string; surfaceId: string }, approvedTokens: readonly string[]): Promise<void> {
  if (approvedTokens.length === 0) return;
  await tx.$executeRaw`
    UPDATE "Translation" AS t SET "pendingEditToken" = NULL
    FROM "StringKey" k, "Locale" l
    WHERE t."projectId" = ${scope.projectId} AND t."surfaceId" = ${scope.surfaceId}
      AND t."pendingEditToken" = ANY(${[...approvedTokens]}::text[])
      AND k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
      AND l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
      AND (k."orphaned" OR l."orphaned")`;
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
        // 승인 뒤에 저장된 셀은 토큰이 달라 여기서 안 덮인다 — 결과의 `remainingEdits`가 그 수를 말한다.
        approvedTokens: lease.approvedTokens,
      });
      await releaseOrphanedApproved(tx, scope, lease.approvedTokens);
    } else if (prepared.kind === "empty") {
      await tx.stringKey.updateMany({ where: { ...scope, orphaned: false }, data: { orphaned: true } });
      await releaseOrphanedApproved(tx, scope, lease.approvedTokens);
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
      count: prepared.result.count, failed: prepared.result.failed, unmanaged: prepared.result.unmanaged,
      errors: prepared.result.errors.map(({ path, code }) => ({ path, code })),
    };
  }, transactionOptions);
}

/** callback은 실행 소유권을 원자적으로 얻은 뒤에만 설치 reader를 연다. */
export async function runRepositoryImportFromReader(prisma: PrismaClient, input: ImportRunInput, openReader: () => Promise<RepoReader>): Promise<RepositoryImportOutcome> {
  const acquired = await acquire(prisma, input);
  if (!acquired.ok) return acquired;
  const { lease } = acquired;
  /**
   * **모든 반환·예외 경로가 이것을 지난다** (T5b-0). 조기 반환이 넷이라 하나라도 빠지면 그 실행이
   * 영영 `Running…`으로 남는다 — 화면에 그것을 닫을 수단이 없다.
   *
   * ⚠️ **기록 실패가 적재를 되돌리지 않는다.** 관측 기반 기록이라 실행은 이미 일어났고, 여기서
   * 던지면 성공한 적재가 실패로 보고된다 — 상태 변경 사건의 양방향 롤백과 **부류가 다르다.**
   */
  const runToken = runTokenFor({ kind: "import", token: lease.token });
  const close = async (outcome: RepositoryImportOutcome): Promise<RepositoryImportOutcome> => {
    try {
      const surfaces = outcome.ok ? outcome.surfaces : [];
      const closed = await finishRun(prisma, {
        projectId: input.projectId,
        runToken,
        result: outcome.ok ? summarizeImportEvent(outcome.surfaces) : "failed",
        payload: {
          kind: "IMPORT",
          source: "manual",
          surfaceSlugs: lease.surfaces.map(surface => surface.slug),
          // 관측한 값만 싣는다 — 실패 경로는 키 수를 세지 않았으므로 `Not recorded`다.
          keys: outcome.ok ? surfaces.reduce((sum, surface) => sum + surface.count, 0) : null,
          pendingEdits: outcome.ok ? outcome.remainingEdits : null,
          surfaces: surfaces.map(surface => ({ surfaceSlug: surface.surfaceSlug, status: surface.status, count: surface.count, reason: surface.reason })),
          errorCode: outcome.ok ? null : outcome.error,
          refusal: null,
        },
      });
      // ⚠️ **0행 갱신은 조용하다** (POSTMORTEM 2026-09-14) — 다음 실행의 stale 정리가 이 행을 먼저
      // 닫았다는 뜻이고, 그러면 이력에 남는 결과가 실제 결과가 아니다. 적재를 되돌리지는 않되 남긴다.
      if (!closed) logFailure("repository-import-event", new Error(`run event already closed: ${runToken}`));
    } catch (error) {
      logFailure("repository-import-event", error);
    }
    return outcome;
  };
  const failure: PreparedSurfaceImport = { kind: "failed", error: "ingest-failed", result: { count: 0, failed: 1, unmanaged: 0, errors: [] } };
  const unchangedSnapshot = { headSha: "", headCommittedAt: lease.startedAt.toISOString() };
  try {
    if (lease.surfaces.every(surface => surface.adapterName === null || !isAdapterName(surface.adapterName) || !surface.pathTemplate || !surface.baseLocale)) {
      return await close({ ok: true, surfaces: lease.surfaces.map(surface => result(surface, "failed", "invalid-format")), remainingEdits: await countPending(prisma, input.projectId) });
    }
    const reader = await openReader();
    const snapshot = await reader.snapshot(lease.project.baseBranch);
    if (snapshot.status !== "ok") {
      for (const surface of lease.surfaces) await finishSurface(prisma, lease, surface, failure, unchangedSnapshot);
      return await close({ ok: false, error: snapshotError(snapshot) });
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
    // **승인 뒤 남은 편집을 성공으로 접지 않는다** (POSTMORTEM 2026-09-16) — 남아 있는 한 리포 갱신은 계속 멈춘다.
    return await close({ ok: true, surfaces, remainingEdits: await countPending(prisma, input.projectId) });
  } catch (error) {
    logFailure("repository-import-read", error);
    for (const surface of lease.surfaces) {
      try { await finishSurface(prisma, lease, surface, failure, unchangedSnapshot); }
      catch (recordError) { logFailure("repository-import-record", recordError); }
    }
    return await close({ ok: false, error: "ingest-failed" });
  } finally {
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
        const project = await tx.project.findUnique({ where: { id: input.projectId } });
        if (project?.repositoryImportToken !== lease.token || !hasActiveImport(project.repositoryImportStartedAt, new Date())) return;
        // 우리 표시만 지운다(설정 변경 거부 포함). 다른 CI·실행의 표시나 결과는 지우지 않는다.
        await tx.translationSurface.updateMany({ where: { projectId: input.projectId, lastImportToken: lease.token }, data: { lastImportToken: null, lastImportStartedAt: null } });
        await tx.project.updateMany({ where: { id: input.projectId, repositoryImportToken: lease.token }, data: { repositoryImportToken: null, repositoryImportStartedAt: null } });
      }, transactionOptions);
    } catch (error) { logFailure("repository-import-release", error); }
  }
}
