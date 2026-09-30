import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { isAdapterName } from "@/lib/adapters";
import { importEventPayload } from "@/lib/events/payload";
import { importOutcomeFields } from "@/lib/projects/import-status";
import { recordEvent } from "@/lib/events/record";
import { AppError, logCaught } from "@/lib/failure";
import { createGitClient, openRepoReader } from "@/lib/github";
import { GITHUB_WAIT_MS, withinGithubWait } from "@/lib/github-wait";
import { runAutomationImport } from "@/lib/import/run";
import { openPrGateApplies } from "@/lib/protection/plan";
import { countPending } from "@/lib/protection/where";
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
  installationId: string | null;
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

  const active = target.surfaces.filter((surface) => surface.archivedAt === null);
  const input: NightlyInput = {
    pending: await countPending(prisma, target.id),
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
      const { installationId, repositoryId } = target;
      if (installationId === null) throw new AppError(`nightly import without installation: ${target.slug}`);
      const repository = { repositoryId, installationId, repoOwner: target.repoOwner, repoName: target.repoName, baseBranch: target.baseBranch };
      const result = await runAutomationImport(prisma, { projectId: target.id, repository },
        () => openRepoReader(target.repoOwner, target.repoName, installationId, repositoryId));
      return { action: "import", ...result };
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
          await tx.translationSurface.updateMany({ where: { projectId: target.id, id: { in: active.map((surface) => surface.id) } }, data: { lastImportError, lastImportFailedAt } });
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
 * base head. **클라이언트 생성(토큰 발급 + 리포 신원)부터 마감 안이다** — 어느 단계든 던지거나 늦으면 `{ ok: false }`(base-unreadable)다.
 * ⚠️ **base head 대비**다 — sync 브랜치 상태와 섞지 않는다(POSTMORTEM 2026-09-09).
 */
async function readHead(target: NightlyTarget): Promise<{ client: GitClient | null; head: NonNullable<NightlyInput["head"]> }> {
  const { installationId, repositoryId } = target;
  // `selectPullTargets`가 이미 거른다 — 여기 오면 조회할 수 없으므로 못 읽은 것이다.
  if (installationId === null || repositoryId === null) return { client: null, head: { ok: false } };
  return withinGithubWait((async () => {
    try {
      const client = await createGitClient(target.repoOwner, target.repoName, installationId, repositoryId);
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
      const pr = await client.findOpenPr(`${target.repoOwner}:${syncBranchFor(target.slug)}`);
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
