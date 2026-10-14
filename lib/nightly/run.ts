import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { isAdapterName } from "@/lib/adapters";
import { importEventPayload } from "@/lib/events/payload";
import { importOutcomeFields } from "@/lib/projects/import-status";
import { recordEvent } from "@/lib/events/record";
import { AppError, fail, logCaught } from "@/lib/failure";
import { createGitClient, openRepoReader } from "@/lib/repo-host";
import { hasRepoConnection, repoTargetOf, sameRepoTarget } from "@/lib/repo-host/target";
import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";
import { closeExpiredImportRuns, runAutomationImport } from "@/lib/import/run";
import { observeSurfaceLocales } from "@/lib/import/observe";
import { expireLocaleChanges } from "@/lib/locales/expire";
import { readLocaleStates } from "@/lib/locales/work";
import { planPublishBarrier, uncertainPublishWhere } from "@/lib/sync/execution";
import { openPrGateApplies } from "@/lib/protection/plan";
import { countPending } from "@/lib/protection/where";
import { readDeliveryRevision } from "@/lib/pull/delivery-revision";
import type { GitClient } from "@/lib/pull/client";
import { syncBranchFor } from "@/lib/pull/sync-branch";
import { runSync } from "@/lib/sync/run";

import { planNightly, type NightlyInput, type NightlyPlan } from "./plan";
import type { NightlyVisit } from "./summary";

/**
 * 야간 방문 하나 (nightly-sync design "야간 판정 순서"). 판정은 `planNightly`(순수)가 하고, 이 껍데기는 그것이 `need`로 요구하는 입력만
 * 조회해 다시 부른 뒤 **정확히 한 갈래**를 실행한다 — Publish(`runSync`) · 적재(`runAutomationImport`) · 스킵(`nightly.skip` 사건) · 없음.
 * **방문마다 사건이 최대 하나다** — 갈래가 자기 사건을 쓰고, 이 함수가 따로 쓰지 않는다.
 *
 * ⚠️ **GitHub 호출 순서가 계약이다**: 미전달 편집이 있으면 0회(1층 스킵의 "API 0회" 유지), head가 같으면 PR 목록 0회. head → PR은
 * **순차**다 — `Promise.all`로 묶지 않는다(POSTMORTEM 2026-09-13 — 원격 신호 하나의 실패가 다른 판정을 풀었다).
 * ⚠️ **실패를 "같은 head"·"PR 없음"으로 읽지 않는다** — head 조회 실패·마감은 `base-unreadable`, PR 조회 실패·마감은 `pr-check-failed`.
 * ⚠️ 트랜잭션 안에서 GitHub을 부르지 않는다 — 판정은 잠금 밖이고, 적재의 잠금 안 재판정은 `runAutomationImport`가 한다.
 */

/** `/api/pull`이 고른 행 **그대로**다 — 적재의 리포 신원(`repository`)도 이 행에서 넘긴다(다시 읽지 않는다). */
export type NightlyTarget = {
  id: string;
  slug: string;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  repoHost: string; installationId: string | null; gitlabConnectionId: string | null;
  repositoryId: string | null;
  /** 방문 **전** 값 — 마감으로 멈춘 방문이 방문 기록을 되돌릴 때 쓴다. */
  lastNightlyAt: Date | null;
  surfaces: readonly {
    id: string;
    slug: string;
    archivedAt: Date | null;
    lastCommitSha: string | null;
    adapterName: string | null;
    pathTemplate: string | null;
    baseLocale: string | null;
    /** 표면 실패 상태 — 있으면 같은 head여도 다시 적재한다(`NightlySurface.failed`). */
    lastImportError: string | null;
    importRevision: number;
  }[];
};

/**
 * @param elapsedMs 루프 시작부터의 경과. 판정마다 다시 읽는다 — 적재 시작 마감(`NIGHTLY_IMPORT_START_MS`)은 GitHub 조회 **뒤**의 시각으로 잰다.
 */
export async function runNightly(prisma: PrismaClient, target: NightlyTarget, elapsedMs: () => number): Promise<NightlyVisit> {
  /**
   * ⚠️ **방문 기록이 머리이고 쓰는 자리는 여기 하나다** — 예외는 마감 멈춤의 되돌림 하나(아래 `none` 갈래) (POSTMORTEM 2026-09-15 — 컬럼을 더하며
   * 쓰는 자리를 전수로 안 셌다). 성공·스킵·실패와
   * 무관하게 먼저 쓴다 — 정렬(`selectPullTargets`)의 아사 방지 힌트이지 이력이 아니라서 사건과 같은 트랜잭션에 묶지 않는다.
   */
  const stamp = new Date();
  await prisma.project.update({ where: { id: target.id }, data: { lastNightlyAt: stamp } });
  /**
   * ⚠️ **어느 갈래든 먼저 만료된 `import:` 행을 닫는다** — 적재 갈래만 닫으면(`acquire`) 마지막 표면까지 커밋한 뒤 죽은 실행이 head가 같은 밤마다
   * `Running…`으로 남는다. 살아 있는 lease는 건드리지 않고(`hasLiveInternalImport`), 새 사건을 만들지 않는다.
   */
  // ⚠️ **정리가 방문을 막지 않는다** (Codex 교차 리뷰 r2) — 부수 작업이라, 던지면 로그만 남기고 판정·갈래는 그대로 돈다(미전달 편집 Publish가 먼저다).
  try {
    await closeExpiredImportRuns(prisma, target.id);
  } catch (error) {
    logCaught("nightly", "close-expired", error);
  }

  const snapshot = await prisma.project.findUniqueOrThrow({ where: { id: target.id }, select: { lastPublishedAt: true } });
  const expectedDeliveryRevision = await readDeliveryRevision(prisma, target.id);
  const active = target.surfaces.filter((surface) => surface.archivedAt === null);
  // 언어 변경 상태는 셀 편집 수와 따로 센다(locale-add design §4) — 행이 없는 프로젝트는 입력이 0·false라 판정 순서가 그대로다.
  const localeStates = await readLocaleStates(prisma, target.id);
  const input: NightlyInput = {
    pending: await countPending(prisma, target.id),
    localeWork: localeStates.reduce((sum, state) => sum + state.work.length, 0),
    localeChanges: localeStates.some((state) => state.rows.length > 0),
    surfaces: target.surfaces.map((surface) => ({
      active: surface.archivedAt === null,
      formatComplete: surface.adapterName !== null && isAdapterName(surface.adapterName) && !!surface.pathTemplate && !!surface.baseLocale,
      lastCommitSha: surface.lastCommitSha,
      failed: surface.lastImportError !== null,
    })),
    elapsedMs: elapsedMs(),
  };
  let client: GitClient | null = null;

  // 판정은 많아야 세 번이다(head를 묻고, PR을 묻고, 결론) — 입력이 한 번씩만 채워지므로 네 번째 `need`는 판정의 결함이다.
  let plan: NightlyPlan = planNightly(input);
  for (let step = 0; plan.action === "need"; step++) {
    if (step >= 2) throw new AppError(`nightly plan asked for ${plan.input} twice: ${target.slug}`);
    if (plan.input === "head") {
      const read = await readHead(target);
      client = read.client;
      input.head = read.head;
    } else {
      input.openPr = { url: await readOpenPr(target, client) };
    }
    plan = planNightly({ ...input, elapsedMs: elapsedMs() });
  }

  switch (plan.action) {
    case "publish":
      // ⚠️ **지금 그대로다** — 스킵·보류·경고도 `publish.run` 행의 결과로 선다. GitHub 호출도 `runSync`가 정한다.
      return { action: "publish", ...(await runSync(prisma, { projectId: target.id, slug: target.slug, trigger: "cron", requestedBy: null, credential: undefined })) };
    case "import": {
      if (!hasRepoConnection(target)) throw new AppError(`nightly import without installation: ${target.slug}`);
      const repository = { repoHost: target.repoHost, repositoryId: target.repositoryId, installationId: target.installationId, gitlabConnectionId: target.gitlabConnectionId,
        repoOwner: target.repoOwner, repoName: target.repoName, baseBranch: target.baseBranch };
      // 리더는 열 때 연결을 판정한다 — 리포 id가 없으면 지금처럼 리더 열기가 거부한다(적재 코어가 그 실패를 결과로 남긴다).
      // 적재 갈래는 열린 PR 게이트를 지났다 — 표면 적재가 같은 잠금 안에서 언어 변경 만료를 겸한다.
      const result = await runAutomationImport(prisma, { projectId: target.id, repository, expectedLastPublishedAt: snapshot.lastPublishedAt, expectedDeliveryRevision, pullRequest: "none-open" },
        async () => {
          const connection = repoTargetOf(target);
          if (connection.status !== "ok") fail("repository identity is not pinned; reconnect the project", "not-installed");
          return openRepoReader(connection.target);
        });
      return { action: "import", ...result };
    }
    case "expire": {
      // ⚠️ 사건은 방문 결과 하나다 — 만료된 의도는 각자 `surface.localeChangeResolved` 사건을 같은 tx에 남긴다(상태 변경 사건).
      const read = await expireAtHead(prisma, target, { lastPublishedAt: snapshot.lastPublishedAt, deliveryRevision: expectedDeliveryRevision });
      const event = {
        projectId: target.id, subtype: "nightly.skip", actor: { kind: "AUTOMATION" }, surfaceIds: active.map((surface) => surface.id),
        result: read === "unreadable" ? "failed" : "upToDate", finishedAt: new Date(),
        payload: importEventPayload({ source: "nightly", surfaceSlugs: active.map((surface) => surface.slug), deferReason: null, errorCode: read === "unreadable" ? "base-unreadable" : null }),
      } as const;
      await recordEvent(prisma, event);
      // base 트리를 못 읽은 것은 일시·설정 실패다 — 브랜치는 방금 head로 읽혔으므로 표면 실패 상태를 쓰지 않는다(`branchMissing: false`).
      return read === "unreadable" ? { action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing: false } : { action: "skip", outcome: "upToDate" };
    }
    case "skip": {
      const event = {
        projectId: target.id,
        subtype: "nightly.skip",
        actor: { kind: "AUTOMATION" },
        surfaceIds: active.map((surface) => surface.id),
        result: plan.outcome,
        finishedAt: new Date(),
        payload: importEventPayload({
          source: "nightly",
          surfaceSlugs: active.map((surface) => surface.slug),
          deferReason: plan.outcome === "deferred" ? plan.reason : null,
          errorCode: plan.outcome === "failed" ? plan.reason : null,
        }),
      } as const;
      if (plan.outcome === "failed" && plan.branchMissing) {
        /**
         * ⚠️ **base 브랜치가 정말 없으면 표면 실패 상태도 쓴다** (#155, 2026-09-30 사용자 판정). 사건만 남기면 Home이 "Nothing needs you"라고
         * 말한다 — 주의 항목·`failed` 접미는 표면 `lastImportError`만 읽는다. 수동 Sync가 같은 상황(`base-branch-missing`)에서 쓰는 코드·표면
         * (`import-failed`, 활성 표면)을 그대로 쓴다 — 새 코드를 만들지 않는다. 다음 성공 적재(야간·CI·수동)가 같은 컬럼을 비운다.
         * ⚠️ 진행 표시(`lastImportStartedAt`·`lastImportToken`)는 건드리지 않는다 — 이 방문은 적재를 시작하지 않았고, 도는 CI의 표시를 뺏지 않는다.
         * ⚠️ 사건과 **같은 트랜잭션**이다(상태 변경 사건 — 어느 쪽이 실패해도 둘 다 롤백된다).
         */
        const { lastImportError, lastImportFailedAt } = importOutcomeFields("import-failed", new Date());
        await prisma.$transaction(async (tx) => {
          // 늦은 원격 관측은 사건으로 보존하되 새 설정·성공 적재의 현재 건강성을 덮지 않는다.
          await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${target.id} FOR UPDATE`;
          const current = await tx.project.findUnique({ where: { id: target.id } });
          const now = current === null ? null : repoTargetOf(current);
          const then = repoTargetOf(target);
          if (current !== null && current.archivedAt === null
            && now?.status === "ok" && then.status === "ok" && sameRepoTarget(now.target, then.target)
            && current.repoOwner === target.repoOwner && current.repoName === target.repoName && current.baseBranch === target.baseBranch) {
            const ids = active.map(surface => surface.id).sort();
            await tx.$executeRaw`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = ${target.id} AND "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
            await tx.translationSurface.updateMany({
              where: { projectId: target.id, archivedAt: null, OR: active.map(surface => ({
                id: surface.id, importRevision: surface.importRevision, adapterName: surface.adapterName,
                pathTemplate: surface.pathTemplate, baseLocale: surface.baseLocale,
              })) },
              data: { lastImportError, lastImportFailedAt },
            });
          }
          await recordEvent(tx, event);
        });
      } else {
        await recordEvent(prisma, event);
      }
      const { action: _, ...rest } = plan;
      return { action: "skip", ...rest };
    }
    default:
      /**
       * ⚠️ **마감으로 멈춘 방문은 방문으로 치지 않는다** (r3) — 방문 기록이 남으면 다음 밤 뒤로 가고, 정렬이 오래된 순이라 같은 프로젝트들이 매일
       * 20초 뒤에 닿아 매일 마감에 걸린다(아사). 방문 전 값으로 되돌려 다음 밤 **앞으로** 오게 한다. 머리의 기록 뒤에 누가 다시 썼으면 건드리지
       * 않는다(조건부). 이것이 `lastNightlyAt`을 쓰는 **유일한 두 번째 자리**다.
       */
      if (plan.counter === "unprocessed") {
        await prisma.project.updateMany({ where: { id: target.id, lastNightlyAt: stamp }, data: { lastNightlyAt: target.lastNightlyAt } });
      }
      // 사건이 없는 갈래(비교 대상 0 · 적재 시작 마감) — 요약 카운터만 센다.
      return { action: "none", counter: plan.counter };
  }
}

/**
 * **같은 head의 언어 변경 만료** (locale-add design §1 "자동 적재가 만료를 겸한다" — 적재를 건너뛰는 방문). 판정이 열린 PR/MR 없음을 성공한 조회로
 * 확인한 뒤에만 온다. base 트리를 읽고(내용은 읽지 않는다 — 존재는 경로·mode가 정한다), `Project` 잠금 뒤 소스마다 `expireLocaleChanges`를 부른다.
 *
 * ⚠️ **원격 관측을 최신으로 취급하지 않는다** (POSTMORTEM 2026-10-07) — 잠금 뒤 리포 신원·기준 브랜치·Publish 완료 표식(`lastPublishedAt`·전달
 * revision)·실행 중/미확정 Publish를 다시 본다. 그 사이 Publish가 PR을 열었을 수 있으므로 하나라도 다르면 만료하지 않는다(다음 밤이 다시 본다).
 * ⚠️ 트리를 못 읽으면 파일 부재가 아니다 — 아무것도 쓰지 않고 `unreadable`이다(POSTMORTEM 2026-09-27). 행 있는 소스의 관측이 비거나 경로가 로케일을
 *   말하지 않아 보류된 것도 `unreadable`이다 — 그 소스의 만료는 안 썼고, 다른 소스의 만료는 같은 tx에 그대로 남는다(R-B3 W1).
 * ⚠️ 잠금 순서는 `Project` → 소스(id순)다 — `expireLocaleChanges`가 같은 tx에서 다시 잡는 것은 재진입이다(W3 호출 계약).
 */
async function expireAtHead(
  prisma: PrismaClient,
  target: NightlyTarget,
  expected: { lastPublishedAt: Date | null; deliveryRevision: string },
): Promise<"expired" | "held" | "unreadable"> {
  const connection = repoTargetOf(target);
  if (connection.status !== "ok") return "unreadable";
  // 경로와 mode를 함께 든다 — 링크(120000)도 리더에는 blob으로 오고, 정규 파일 판정이 Publish 쪽 만료와 같아야 한다(`observeLocaleFiles`, R-B2 Y4).
  let entries: readonly { path: string; mode?: string }[];
  try {
    const reader = await openRepoReader(connection.target);
    const tree = await reader.snapshot(target.baseBranch);
    if (tree.status !== "ok") return "unreadable";
    entries = tree.files;
  } catch (error) {
    logCaught("nightly", "locale-expiry-tree", error);
    return "unreadable";
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${target.id} FOR UPDATE`;
    const current = await tx.project.findUnique({ where: { id: target.id } });
    if (current === null || current.archivedAt !== null) return "held";
    const now = repoTargetOf(current);
    if (now.status !== "ok" || !sameRepoTarget(now.target, connection.target) || current.repoOwner !== target.repoOwner
      || current.repoName !== target.repoName || current.baseBranch !== target.baseBranch) return "held";
    if ((current.lastPublishedAt?.getTime() ?? null) !== (expected.lastPublishedAt?.getTime() ?? null)
      || await readDeliveryRevision(tx, target.id) !== expected.deliveryRevision) return "held";
    const at = new Date();
    if (await tx.syncRun.findFirst({ where: uncertainPublishWhere(target.id, at), select: { id: true } }) !== null) return "held";
    const running = await tx.syncRun.findFirst({ where: { projectId: target.id, status: "RUNNING" }, orderBy: { startedAt: "desc" } });
    if (running !== null && planPublishBarrier(running, at) !== null) return "held";
    const surfaces = await tx.translationSurface.findMany({ where: { projectId: target.id, archivedAt: null }, orderBy: { id: "asc" } });
    let expired = false;
    let unreadable = false;
    for (const surface of surfaces) {
      const result = await expireLocaleChanges(tx, { projectId: target.id, surfaceId: surface.id, surfaceSlug: surface.slug, pullRequest: "none-open",
        observed: observeSurfaceLocales(entries, surface), actor: { kind: "AUTOMATION" } });
      expired ||= result.expired.length > 0;
      // 행 있는 소스의 base를 근거로 쓸 수 없었다(관측 0개는 `expireLocaleChanges`가 이 사유로 접는다) — "받을 것 없음"과 갈라 실패 사건으로 남긴다.
      unreadable ||= result.held === "base-unreadable";
    }
    return unreadable ? "unreadable" : expired ? "expired" : "held";
  });
}

/**
 * base head. **클라이언트 생성(토큰 발급 + 리포 신원)부터 마감 안이다** — 어느 단계든 던지거나 늦으면 `{ ok: false }`(base-unreadable)다.
 * ⚠️ **base head 대비**다 — sync 브랜치 상태와 섞지 않는다(POSTMORTEM 2026-09-09).
 */
async function readHead(target: NightlyTarget): Promise<{ client: GitClient | null; head: NonNullable<NightlyInput["head"]> }> {
  // `selectPullTargets`가 이미 거른다 — 여기 오면 조회할 수 없으므로 못 읽은 것이다.
  const connection = repoTargetOf(target);
  if (connection.status !== "ok") return { client: null, head: { ok: false } };
  return withinGithubWait((async () => {
    try {
      const client = await createGitClient(connection.target);
      return { client, head: { ok: true as const, sha: await client.getRefSha(`heads/${target.baseBranch}`) } };
    } catch (error) {
      // 설정 오류(개인키 누락 등)도 여기서 값이 된다 — 던지지 않는 대신 `failed.base-unreadable` 카운터와 이 로그가 그것을 말한다.
      logCaught("nightly", "head", error);
      return { client: null, head: { ok: false as const } };
    }
  })(), () => {
    logCaught("nightly", "head-deadline", new AppError(`no response within ${GITHUB_WAIT_MS}ms`));
    return { client: null, head: { ok: false as const } };
  });
}

/**
 * 열린 Malmoi PR — **삼상태**다(`null` 없음 · URL · `undefined` 확인 못 함). 게이트가 서는지는 CI와 같은 판정(`openPrGateApplies`)이다.
 * head를 읽은 **같은 클라이언트**를 쓴다 — 토큰 발급·리포 신원 왕복을 다시 하지 않는다(`loadOpenPrUrl`은 자체 클라이언트를 만든다).
 */
async function readOpenPr(target: NightlyTarget, client: GitClient | null): Promise<string | null | undefined> {
  if (!openPrGateApplies(target)) return null;
  if (client === null) return undefined;
  return withinGithubWait((async () => {
    try {
      const pr = await client.findOpenPr(syncBranchFor(target.slug));
      return pr === null ? null : pr.url;
    } catch (error) {
      logCaught("nightly", "open-pr", error);
      return undefined;
    }
  })(), () => {
    logCaught("nightly", "open-pr-deadline", new AppError(`no response within ${GITHUB_WAIT_MS}ms`));
    return undefined;
  });
}
