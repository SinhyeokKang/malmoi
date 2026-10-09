import { uncertainPublishWhere } from "@/lib/sync/execution";
import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, Project, TranslationSurface } from "@/generated/prisma/client";
import type { RepoReader } from "@/lib/github";
import { isAdapterName } from "@/lib/adapters";
import { lockCredential } from "@/lib/auth/lock";
import type { Credential } from "@/lib/auth/subject";
import { logFailure } from "@/lib/github-connect/log";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { importOutcomeFields } from "@/lib/projects/import-status";
import { applyPushInTransaction } from "@/lib/push/apply";
import { sameFingerprint } from "@/lib/protection/fingerprint";
import { planDiscardConfirmation, planProtectedImport } from "@/lib/protection/plan";
import { releaseOrphanedApproved } from "@/lib/protection/release-orphaned";
import { countPending } from "@/lib/protection/where";
import { readDeliveryRevision } from "@/lib/pull/delivery-revision";
import { importEventPayload as importPayload, runTokenFor } from "@/lib/events/payload";
import { finishRun, recordEvent, recordImportRefusal, recordRun } from "@/lib/events/record";
import { readDiscardApproval } from "./approval";
import { classifySnapshotFailure, classifySurfaceFailure, summarizeRun, type ImportEventSummary } from "./automation";
import { planImportApply, type ImportSettings } from "./apply-plan";
import { hasActiveImport, hasLiveInternalImport, planRepositoryImport } from "./plan";
import { snapshotError } from "./read";
import { prepareSurfaceImport, type PreparedSurfaceImport } from "./surface";
import type { RepositoryImportError, RepositoryImportOutcome, SurfaceImportResult } from "./result";

type Repository = Pick<Project, "repositoryId" | "installationId" | "repoOwner" | "repoName" | "baseBranch">;
/**
 * @param approval Dialog가 열릴 때 서버가 발급한 폐기 승인 지문(`readDiscardApproval`). 없으면 `null` — 미전달 편집이 있으면 reconfirm이다.
 */
type ImportRunInput = { projectId: string; userId: string; repository: Repository; approval: string | null; credential: Credential | undefined };
/**
 * 실행 주체 (nightly-sync). `AUTOMATION`은 야간 cron이다 — 사용자·지문·자격증명이 없고, 폐기 승인 경로가 없으므로 **편집을 한 줄도 덮지 않는다**
 * (`approvedTokens: []` + 표면별 사후 재집계). 리포 신원은 `repositoryId`에 고정된 installation 토큰 범위와 `repo-replaced` 판정이 대신한다.
 */
type RunActor = { kind: "USER"; userId: string; approval: string | null; credential: Credential | undefined } | { kind: "AUTOMATION"; expectedLastPublishedAt: Date | null; expectedDeliveryRevision: string };
type CoreInput = { projectId: string; repository: Repository; actor: RunActor };
/** @param approvedTokens 잠금 뒤 지문 대조를 지난 편집 토큰 — upsert는 토큰 없거나 이 목록인 셀만 덮는다. 자동화는 언제나 빈 배열이다. */
type Lease = { project: Project; surfaces: TranslationSurface[]; token: string; startedAt: Date; actor: RunActor; approvedTokens: readonly string[] };
const transactionOptions = { maxWait: 10_000, timeout: 30_000 };

/** 주체별 사건 어휘. 수동 Sync와 첫 적재 UI 경로가 USER, 야간이 AUTOMATION이다 — 호출자가 따로 고르면 짝이 어긋난 조합이 생긴다. */
function eventVocabulary(actor: RunActor) {
  return actor.kind === "USER"
    ? { subtype: "import.run", source: "manual", actor: { kind: "USER", userId: actor.userId } } as const
    : { subtype: "import.nightly", source: "nightly", actor: { kind: "AUTOMATION" } } as const;
}

/** 표면 트랜잭션 안 사후 재집계가 0이 아니었다 — 그 표면을 롤백하려고 던진다(`applyProtectedPush`의 `PendingEditsDuringApply`와 같은 형). */
class PendingEditsDuringImport extends Error {
  constructor() { super("pending edits appeared during automation import"); }
}

function settings(project: Repository, surface: TranslationSurface): ImportSettings {
  return { repositoryId: project.repositoryId, installationId: project.installationId,
    repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch,
    adapterName: surface.adapterName, pathTemplate: surface.pathTemplate, baseLocale: surface.baseLocale,
    nested: surface.nested, nestedByPath: surface.nestedByPath };
}
function result(surface: TranslationSurface, status: SurfaceImportResult["status"], reason: SurfaceImportResult["reason"]): SurfaceImportResult {
  return { surfaceSlug: surface.slug, status, reason, count: 0, failed: status === "failed" ? 1 : 0, unmanaged: 0, errors: [] };
}

type Acquired = { ok: true; lease: Lease } | Extract<RepositoryImportOutcome, { ok: false }> | { ok: false; error: "pending-edits" } | { ok: false; error: "publish-raced" };

async function acquire(prisma: PrismaClient, input: CoreInput): Promise<Acquired> {
  return prisma.$transaction(async tx => {
    const { actor } = input;
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
    // 실행권 획득이 MCP 토큰의 권한 확정 시점이다(mcp-connector design §1.25) — 잠금 직후 다시 읽고, grant 거부는 역할·보관 판정 뒤에 낸다.
    const apiToken = actor.kind === "USER"
      ? await lockCredential(tx, { credential: actor.credential, userId: actor.userId, projectId: input.projectId, grant: "project:settings" })
      : null;
    if (apiToken !== null && apiToken.status !== "ok") return { ok: false, error: apiToken.status };
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (project === null) return { ok: false, error: "not-found" };
    const member = actor.kind === "USER"
      ? await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: input.projectId, userId: actor.userId } } })
      : null;
    if (actor.kind === "USER" && member?.role !== "OWNER") return { ok: false, error: "forbidden" };
    // ⚠️ 자동화의 거부는 사건을 남기지 않는다 — `recordImportRefusal`은 USER·manual 전용이고, 야간은 요약 카운터가 센다.
    if (project.archivedAt !== null) {
      if (actor.kind === "USER") await recordImportRefusal(tx, { projectId: project.id, userId: actor.userId, error: "archived" });
      return { ok: false, error: "archived" };
    }
    // grant는 멤버십·역할·보관 뒤다 — 보관된 프로젝트의 답은 "되돌리는 법"이어야 하고 grant를 고쳐도 못 쓴다(`planToolAccess`와 같은 순서).
    if (apiToken?.grant === "token-scope") return { ok: false, error: "token-scope" };
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: input.projectId }, orderBy: { slug: "asc" } });
    const expected = input.repository;
    // 설치 없음은 readiness가 먼저 `not-ready`로 거른다 — 여기 닿는 null은 리포 id 미고정이다(`unpinned`, ux-drift-unify r1).
    const identity = project.repositoryId === null || project.installationId === null ? "unpinned" :
      project.repositoryId !== expected.repositoryId || project.installationId !== expected.installationId || project.repoOwner !== expected.repoOwner ||
      project.repoName !== expected.repoName || project.baseBranch !== expected.baseBranch ? "repo-replaced" : "ok";
    const startedAt = new Date();
    // Publish가 스냅샷을 뜨는 중에 리포 값으로 덮으면 절반만 덮인 DB가 PR로 나간다 — 같은 Project 잠금 안에서 읽는다 (ARCHITECTURE §5.6.1).
    const uncertain = await tx.syncRun.findFirst({ where: uncertainPublishWhere(project.id, new Date()), select: { id: true } });
    if (uncertain !== null) return { ok: false, error: "publish-unsettled" };
    const runningSync = await tx.syncRun.findFirst({ where: { projectId: project.id, status: "RUNNING" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    const plan = planRepositoryImport({ ...project, now: startedAt, readiness: planProjectReadiness({ installationId: project.installationId, surfaces }), identity, surfaces, runningSync });
    if (!plan.ok) {
      if (actor.kind === "USER") await recordImportRefusal(tx, { projectId: project.id, userId: actor.userId, error: plan.error });
      return plan;
    }
    const active = surfaces.filter(surface => surface.archivedAt === null).sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    const vocabulary = eventVocabulary(actor);
    let approvedTokens: readonly string[] = [];
    if (actor.kind === "AUTOMATION") {
      if ((project.lastPublishedAt?.getTime() ?? null) !== (actor.expectedLastPublishedAt?.getTime() ?? null)
        || await readDeliveryRevision(tx, project.id) !== actor.expectedDeliveryRevision) {
        await recordEvent(tx, { projectId: input.projectId, subtype: vocabulary.subtype, actor: vocabulary.actor,
          surfaceIds: active.map(surface => surface.id), result: "deferred", finishedAt: new Date(),
          payload: importPayload({ source: vocabulary.source, surfaceSlugs: active.map(surface => surface.slug), deferReason: "publish-raced" }) });
        return { ok: false, error: "publish-raced" };
      }
      // 자동 적재는 승인 경로가 없다 — 미전달 편집이 하나라도 있으면 통째로 보류한다(CI `/api/push`와 같은 판정). 리포 값은 보지 않는다.
      const pending = await countPending(tx, project.id);
      if (planProtectedImport({ mode: "auto", pending }).action !== "apply") {
        await recordEvent(tx, { projectId: project.id, subtype: vocabulary.subtype, actor: vocabulary.actor, surfaceIds: active.map(surface => surface.id),
          occurredAt: startedAt, finishedAt: startedAt, result: "deferred",
          payload: importPayload({ source: vocabulary.source, surfaceSlugs: active.map(surface => surface.slug), pendingEdits: pending, deferReason: "pending-edits" }) });
        return { ok: false, error: "pending-edits" };
      }
    } else {
      /**
       * **폐기 승인은 잠금 뒤에 재계산한다** (ARCHITECTURE §5.5.2 · POSTMORTEM 2026-09-13 "일회용 연결 요청을 락 전에 읽었다").
       * 클라이언트의 `discard: true`를 믿지 않는다 — Dialog 뒤 새 편집·적용·설정 변경은 전부 지문을 바꿔 reconfirm이 된다.
       */
      const approval = await readDiscardApproval(tx, { projectId: project.id, userId: actor.userId });
      const confirmation = planDiscardConfirmation({ role: member?.role ?? "EDITOR", fingerprintMatches: sameFingerprint(actor.approval, approval.fingerprint) });
      const decision = planProtectedImport({ mode: "manual", pending: approval.pending.length, approved: confirmation.action === "proceed" });
      if (decision.action !== "apply") return { ok: false, error: "reconfirm" };
      approvedTokens = approval.pending.map(edit => edit.token);
    }
    const token = randomUUID();
    await tx.project.update({ where: { id: project.id }, data: { repositoryImportToken: token, repositoryImportStartedAt: startedAt } });

    /**
     * ⚠️ **중단된 이전 실행을 여기서 닫는다** (logs-rework T5b-0 · spec §7.4). 잠금을 얻었다는 것은
     * 이전 lease가 더 이상 살아 있지 않다는 뜻이므로(`planRepositoryImport`가 활성 실행을 거부한다),
     * 아직 안 닫힌 내부 Import 이벤트는 전부 만료된 것이다. **브라우저·조회가 이것을 하지 않는다** —
     * 다음 실행이 닫는다는 점에서 Publish의 stale 처리와 같은 형이다.
     *
     * ⚠️ **`import:` 접두로 좁힌다** — CI(`ci:`)는 종료만 기록하므로 미종료 행이 없고, 접두가 없으면
     * 그쪽까지 건드리게 된다.
     */
    await closeImportRunsInTx(tx, project.id, startedAt);

    /**
     * 실행은 행 하나다 (결정 12) — 시작에 `INSERT`(결과 null), 종료에 같은 행을 갱신한다.
     * ⚠️ **대상 소스를 지금 잡는다** — 실행 중에 소스가 늘어도 이 집합은 안 바뀐다.
     */
    await recordRun(tx, {
      projectId: project.id,
      subtype: vocabulary.subtype,
      actor: vocabulary.actor,
      surfaceIds: active.map(surface => surface.id),
      occurredAt: startedAt,
      runToken: runTokenFor({ kind: "import", token }),
      payload: importPayload({ source: vocabulary.source, surfaceSlugs: active.map(surface => surface.slug) }),
    });
    return { ok: true, lease: { project, token, startedAt, actor, approvedTokens, surfaces: active } };
  }, transactionOptions);
}

/**
 * 아직 안 닫힌 내부 Import 사건을 **만료로** 닫는다. ⚠️ 부르는 쪽이 `Project` 잠금 아래에서 살아 있는 적재가 없음을 이미 확인했어야 한다
 * (`hasLiveInternalImport`) — 이 함수는 판정하지 않는다.
 * ⚠️ **`import:` 접두로 좁힌다** — CI(`ci:`)는 종료만 기록하므로 미종료 행이 없고, 접두가 없으면 그쪽까지 건드리게 된다.
 */
async function closeImportRunsInTx(tx: Prisma.TransactionClient, projectId: string, at: Date): Promise<number> {
  const { count } = await tx.projectEvent.updateMany({
    where: { projectId, kind: "IMPORT", finishedAt: null, runToken: { startsWith: "import:" } },
    data: { result: "failed", finishedAt: at },
  });
  return count;
}

/**
 * 야간 방문의 **만료 닫기** (Codex 교차 리뷰 🟡) — 적재에 들어가지 않는 방문(head 같음·보류·Publish)도 죽은 실행의 `Running…`을 닫는다.
 * 전에는 `acquire` 안에만 있어, 마지막 표면까지 커밋한 뒤 사건 종료 전에 죽은 실행은 다음 커밋이나 수동 Sync가 올 때까지 열려 있었다.
 * ⚠️ `Project` 잠금 아래에서 `hasLiveInternalImport`로 판정하고 **살아 있는 lease는 닫지 않는다.** 새 사건을 만들지 않는다.
 * ⚠️ **잠금을 기다리지 않는다(`SKIP LOCKED`)** (Codex 교차 리뷰 r2) — 잠금을 쥔 쪽은 살아 있는 실행(CI 적재·수동 Sync·저장)이라 오늘 밤 닫을 것이
 * 없다. 기다리면 방문이 트랜잭션 timeout까지 매달려 그 밤의 Publish가 안 나가고 루프 예산을 먹는다. 건너뛴 정리는 다음 밤이 한다.
 */
export async function closeExpiredImportRuns(prisma: PrismaClient, projectId: string): Promise<number> {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE SKIP LOCKED`;
    if (locked.length === 0) return 0;
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { repositoryImportToken: true, repositoryImportStartedAt: true } });
    if (project === null) return 0;
    const surfaces = await tx.translationSurface.findMany({ where: { projectId }, select: { archivedAt: true, lastImportStartedAt: true } });
    const now = new Date();
    if (hasLiveInternalImport({ now, ...project, surfaces })) return 0;
    return closeImportRunsInTx(tx, projectId, now);
  }, transactionOptions);
}

/** 이 잠금 순서는 CI와 Add surface 같은 기존 트랜잭션이 공유한다. */
async function current(tx: Prisma.TransactionClient, lease: Lease, captured: TranslationSurface) {
  const projectId = lease.project.id;
  await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${projectId} AND "id" = ${captured.id} FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: projectId } });
  const surface = await tx.translationSurface.findUnique({ where: { id: captured.id, projectId } });
  const actor = lease.actor;
  const member = actor.kind === "USER" ? await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actor.userId } } }) : null;
  if (project === null || surface === null) return { ok: false, reason: "lease-lost" } as const;
  const now = new Date();
  const plan = planImportApply({ now, token: lease.token, currentToken: project.repositoryImportToken, startedAt: project.repositoryImportStartedAt,
    capturedRevision: captured.importRevision, currentRevision: surface.importRevision, authorized: actor.kind === "AUTOMATION" || member?.role === "OWNER",
    archived: project.archivedAt !== null || surface.archivedAt !== null,
    capturedSettings: settings(lease.project, captured), currentSettings: settings(project, surface) });
  if (!plan.ok) return plan;
  // CI가 새 revision을 커밋하기 전에 진행 중일 수 있다. 그 실행 표시도 우선한다.
  if (surface.lastImportToken !== lease.token && hasActiveImport(surface.lastImportStartedAt, now)) return { ok: false, reason: "superseded" } as const;
  return { ok: true, surface } as const;
}

/** 커밋된 표면 트랜잭션이 실제로 바꾼 값 수의 합 — 롤백된 표면은 더하지 않는다(트랜잭션이 끝난 뒤에 더한다). */
type Tally = { changedValues: number };

async function finishSurface(prisma: PrismaClient, lease: Lease, surface: TranslationSurface, prepared: PreparedSurfaceImport, snapshot: { headSha: string; headCommittedAt: string }, tally: Tally): Promise<SurfaceImportResult> {
  const finished = await prisma.$transaction(async tx => {
    const check = await current(tx, lease, surface);
    if (!check.ok) return { surface: result(surface, "superseded", check.reason), changedValues: 0 };
    const scope = { projectId: lease.project.id, surfaceId: surface.id };
    let changedValues = 0;
    if (prepared.kind === "payload") {
      const applied = await applyPushInTransaction(tx, scope, prepared.payload, {
        token: lease.token, startedAt: lease.startedAt, refsMode: "preserve", previousBaseLocale: surface.baseLocale,
        importOutcome: prepared.result.failed > 0 ? "partial-import" : null,
        // 승인 뒤에 저장된 셀은 토큰이 달라 여기서 안 덮인다 — 결과의 `remainingEdits`가 그 수를 말한다.
        approvedTokens: lease.approvedTokens,
        // 다운로드·파싱 실패가 하나라도 있으면 빠진 파일의 키를 삭제로 읽지 않는다(audit #7) — 중복 키는 잃는 키가 없어 `errors`에 없다.
        suppressOrphan: prepared.result.errors.length > 0,
      });
      changedValues = applied.changedValues;
      await releaseOrphanedApproved(tx, scope, lease.approvedTokens);
    } else if (prepared.kind === "empty") {
      await tx.stringKey.updateMany({ where: { ...scope, orphaned: false }, data: { orphaned: true } });
      await releaseOrphanedApproved(tx, scope, lease.approvedTokens);
      // 정상 0키도 **성공 종료**다 — `importOutcomeFields(null)`이 실패 시각까지 비운다.
      await tx.translationSurface.update({ where: { id: surface.id, projectId: scope.projectId }, data: {
        lastCommitSha: snapshot.headSha, lastCommitAt: new Date(snapshot.headCommittedAt), importRevision: { increment: 1 },
        ...importOutcomeFields(null, new Date()), lastImportToken: null,
      } });
    } else if (lease.actor.kind === "USER" || classifySurfaceFailure(prepared) === "record") {
      // ⚠️ 야간의 서버 전용 한도·일시 실패는 표면 실패 상태를 쓰지 않는다 — 야간이 CI로 건강한 프로젝트를 Home에서 실패로 뒤집지 않는다
      // (`./automation` — 사건이 `too-large`·`failed`를 말한다). CI도 같이 실패할 것(파싱 실패·0키)만 쓴다.
      await tx.translationSurface.update({ where: { id: surface.id, projectId: scope.projectId }, data: {
        ...importOutcomeFields("import-failed", new Date()), lastImportToken: null,
      } });
    }
    /**
     * ⚠️ **자동화의 표면별 사후 재집계** — 표면 트랜잭션 사이(파일을 읽는 동안)에 저장된 편집이 있으면 이 표면을 롤백하고 뒤 표면을 시작하지 않는다.
     * 토큰 가드(`approvedTokens: []`)가 그 셀을 안 덮어도 조건 불일치는 0행 갱신이라 조용하고(POSTMORTEM 2026-09-14), unorphan된 토큰 셀도
     * 여기서만 보인다. 앞서 커밋된 표면은 가드가 편집을 안 덮었으므로 되돌릴 이유가 없다.
     */
    if (lease.actor.kind === "AUTOMATION" && prepared.kind !== "failed" && await countPending(tx, scope.projectId) > 0) throw new PendingEditsDuringImport();
    return { changedValues, surface: { surfaceSlug: surface.slug,
      status: prepared.kind === "failed" ? "failed" : prepared.result.failed > 0 ? "partial" : "imported",
      reason: prepared.kind === "failed" ? prepared.error === "resource-limit" ? "resource-limit" : "import-failed" : null,
      count: prepared.result.count, failed: prepared.result.failed, unmanaged: prepared.result.unmanaged,
      errors: prepared.result.errors.map(({ path, code }) => ({ path, code })),
    } satisfies SurfaceImportResult };
  }, transactionOptions);
  tally.changedValues += finished.changedValues;
  return finished.surface;
}

/** callback은 실행 소유권을 원자적으로 얻은 뒤에만 설치 reader를 연다. */
export async function runRepositoryImportFromReader(prisma: PrismaClient, input: ImportRunInput, openReader: () => Promise<RepoReader>): Promise<RepositoryImportOutcome> {
  const outcome = await runImport(prisma, { projectId: input.projectId, repository: input.repository,
    actor: { kind: "USER", userId: input.userId, approval: input.approval, credential: input.credential } }, openReader, () => {});
  // USER는 승인 경로가 있어 `pending-edits`로 보류되지 않는다 — 그 갈래는 `reconfirm`이다.
  if (!outcome.ok && (outcome.error === "pending-edits" || outcome.error === "publish-raced")) return { ok: false, error: "reconfirm" };
  return outcome;
}

/**
 * 야간 서버 적재의 결과 (nightly-sync). `recorded: false`는 사건을 남기지 않은 거부다(`already-running`·`no-surfaces`·보관 경합…) —
 * 야간 요약 카운터가 센다. 나머지는 정확히 한 사건(`import.nightly`)이 그 결과로 닫혔다.
 */
export type AutomationImportResult =
  | ({ recorded: true } & ImportEventSummary)
  | { recorded: false; error: RepositoryImportError };

export async function runAutomationImport(prisma: PrismaClient, input: { projectId: string; repository: Repository; expectedLastPublishedAt: Date | null; expectedDeliveryRevision: string }, openReader: () => Promise<RepoReader>): Promise<AutomationImportResult> {
  const closed: { summary: ImportEventSummary | null } = { summary: null };
  const outcome = await runImport(prisma, { ...input, actor: { kind: "AUTOMATION", expectedLastPublishedAt: input.expectedLastPublishedAt, expectedDeliveryRevision: input.expectedDeliveryRevision } }, openReader, summary => { closed.summary = summary; });
  // 보류는 `acquire`가 같은 잠금 안에서 사건을 쓰고 돌아온다 — 실행 행(`recordRun`)을 만들지 않은 갈래다.
  if (!outcome.ok && (outcome.error === "pending-edits" || outcome.error === "publish-raced")) return { recorded: true, result: "deferred", deferReason: outcome.error };
  if (closed.summary !== null) return { recorded: true, ...closed.summary };
  // `close`를 안 지난 반환은 실행권을 못 얻은 거부뿐이다(성공·실패 반환은 전부 `close`를 지난다).
  return { recorded: false, error: outcome.ok ? "unavailable" : outcome.error };
}

async function runImport(prisma: PrismaClient, input: CoreInput, openReader: () => Promise<RepoReader>, observe: (summary: ImportEventSummary) => void): Promise<RepositoryImportOutcome | { ok: false; error: "pending-edits" } | { ok: false; error: "publish-raced" }> {
  const acquired = await acquire(prisma, input);
  if (!acquired.ok) return acquired;
  const { lease } = acquired;
  const vocabulary = eventVocabulary(lease.actor);
  /** 자동화의 사후 재집계가 표면을 롤백하고 루프를 멈췄다. */
  let halted = false;
  /** 자동화의 스냅샷이 서버 한도(`truncated`)에 걸렸다 — 사건은 `deferred`·`too-large`다. */
  let held = false;
  const automation = lease.actor.kind === "AUTOMATION";
  const tally: Tally = { changedValues: 0 };
  /**
   * **모든 반환·예외 경로가 이것을 지난다** (T5b-0). 조기 반환이 넷이라 하나라도 빠지면 그 실행이
   * 영영 `Running…`으로 남는다 — 화면에 그것을 닫을 수단이 없다.
   *
   * ⚠️ **기록 실패가 적재를 되돌리지 않는다.** 관측 기반 기록이라 실행은 이미 일어났고, 여기서
   * 던지면 성공한 적재가 실패로 보고된다 — 상태 변경 사건의 양방향 롤백과 **부류가 다르다.**
   */
  const runToken = runTokenFor({ kind: "import", token: lease.token });
  const close = async (outcome: RepositoryImportOutcome): Promise<RepositoryImportOutcome> => {
    const summary = summarizeRun({ automation, outcome, halted, held });
    observe(summary);
    try {
      const surfaces = outcome.ok ? outcome.surfaces : [];
      const closed = await finishRun(prisma, {
        projectId: input.projectId,
        runToken,
        result: summary.result,
        payload: importPayload({
          source: vocabulary.source,
          surfaceSlugs: lease.surfaces.map(surface => surface.slug),
          // 관측한 값만 싣는다 — 실패 경로는 키 수를 세지 않았으므로 `Not recorded`다.
          keys: outcome.ok ? surfaces.reduce((sum, surface) => sum + surface.count, 0) : null,
          pendingEdits: outcome.ok ? outcome.remainingEdits : null,
          surfaces: surfaces.map(surface => ({ surfaceSlug: surface.surfaceSlug, status: surface.status, count: surface.count, reason: surface.reason })),
          errorCode: outcome.ok ? null : outcome.error,
          deferReason: summary.deferReason,
          // 관측값이다 — 실패 실행은 무엇이 커밋됐는지 세지 않았으므로 `null`이다.
          changedValues: outcome.ok ? tally.changedValues : null,
        }),
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
      const kind = automation ? classifySnapshotFailure(snapshot.status) : "record";
      held = kind === "hold";
      if (kind === "record") for (const surface of lease.surfaces) await finishSurface(prisma, lease, surface, failure, unchangedSnapshot, tally);
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
        surfaces.push(await finishSurface(prisma, lease, surface, prepared, snapshot, tally));
      } catch (error) {
        // 자동화의 사후 재집계 — 이 표면은 이미 롤백됐다. 실패로 기록하지 않고(편집이 들어왔을 뿐이다) 뒤 표면을 시작하지 않는다.
        if (error instanceof PendingEditsDuringImport) { halted = true; break; }
        logFailure("repository-import-surface", error);
        // 야간의 트랜잭션 예외(timeout·DB 오류)는 일시 실패다 — 사건만 실패로 남기고 표면 실패 상태를 쓰지 않는다.
        if (automation) { surfaces.push(result(surface, "failed", "import-failed")); continue; }
        try { surfaces.push(await finishSurface(prisma, lease, surface, failure, snapshot, tally)); }
        catch (recordError) { logFailure("repository-import-record", recordError); surfaces.push(result(surface, "failed", "import-failed")); }
      }
    }
    // **승인 뒤 남은 편집을 성공으로 접지 않는다** (POSTMORTEM 2026-09-16) — 남아 있는 한 리포 갱신은 계속 멈춘다.
    return await close({ ok: true, surfaces, remainingEdits: await countPending(prisma, input.projectId) });
  } catch (error) {
    logFailure("repository-import-read", error);
    // 야간의 reader 열기·읽기 예외(설치 토큰·리포 선택 해제·네트워크)는 일시·자격 실패다 — 표면 실패 상태를 쓰지 않는다.
    for (const surface of automation ? [] : lease.surfaces) {
      try { await finishSurface(prisma, lease, surface, failure, unchangedSnapshot, tally); }
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
