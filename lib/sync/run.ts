import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { classifyFailure } from "@/lib/failure";
import type { PullOutcome } from "@/lib/pull/message";
import { triggerPull } from "@/lib/pull/trigger";

import {
  STALE_AFTER_SECONDS,
  classifySyncError,
  planSyncFinish,
  planSyncStart,
  type SyncTriggerKind,
} from "./plan";

/**
 * sync 실행의 껍데기 (ARCHITECTURE §5.6).
 *
 * 두 진입점(편집 UI의 [Send changes] · 야간 cron)이 **같은 이 함수를 지난다** — 게이트·행·오류
 * 분류가 한 벌이라야 `logs`가 둘을 같은 어휘로 보인다.
 *
 * ⚠️ **던지지 않는다.** 실패도 게이트 거부도 `PullOutcome`이다. 안 그러면 catch가 여기와 두
 * 진입점에 세 벌 생기고 **행 닫기가 그 사이 어딘가로 빠진다.**
 *
 * ⚠️ **`Project` 컬럼을 건드리지 않는다** (완료 조건 2). `lastPulledAt`·`lastPublishedAt`·`lastPrUrl`은
 * `runPull`이 성공 경로에서만 쓰고, 이 껍데기는 그것을 **감싸기만** 한다 — `SyncRun` 행을 닫는 것은
 * 다른 문장이라 실패가 성공 상태를 덮을 경로가 생기지 않는다.
 *
 * ⚠️ **`server-only`가 없다** — 하네스 테스트가 직접 부른다 (`lib/pull/trigger.ts`·`lib/auth/query.ts`와 같은 이유).
 */
export async function runSync(
  prisma: PrismaClient,
  input: { projectId: string; slug: string; trigger: SyncTriggerKind; requestedBy: string | null },
): Promise<PullOutcome> {
  const { projectId, slug, trigger, requestedBy } = input;

  const started = await startRun(prisma, projectId, trigger, requestedBy);
  if (started.status !== "ok") return started.outcome;
  const runId = started.runId;

  let result: Parameters<typeof planSyncFinish>[0];
  let outcome: PullOutcome;
  try {
    const pulled = await triggerPull(prisma, slug);
    result = pulled;
    outcome = pulled;
  } catch (error) {
    result = { thrown: error };
    outcome = failureOutcome(slug, error);
  }

  const finish = planSyncFinish(result);
  try {
    await prisma.syncRun.update({
      where: { id: runId },
      data: {
        status: finish.status,
        errorCode: finish.errorCode,
        prUrl: finish.prUrl,
        changed: finish.changed,
        warnings: finish.warnings,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    // 리포 쓰기 이후의 DB 실패일 수 있으므로 미전송을 단정하지 않는다.
    return failureOutcome(slug, error);
  }
  return outcome;
}

type Started = { status: "ok"; runId: string } | { status: "rejected"; outcome: PullOutcome };

/**
 * 게이트 판정 · stale 닫기 · 행 생성을 **한 트랜잭션**에서 한다 (design §3).
 *
 * ⚠️ **잠금은 `Project` 행이지 `SyncRun`이 아니다** — 막으려는 것이 "이 프로젝트에 대한 두 번째
 * 실행"이고, 아직 존재하지 않는 행은 잠글 수 없다. `createInvitation`·`changeMember`·`createProject`가
 * 정확히 이 형이다.
 *
 * ⚠️ **트랜잭션 안에서 GitHub을 부르지 않는다.** 여기까지가 수 ms이고 실제 pull은 밖에서 돈다 —
 * 안 그러면 GitHub 지연이 곧 DB 커넥션 점유이고, pooler에서 그것은 전 테넌트에 번진다.
 *
 * ⚠️ **거부에는 행을 만들지 않는다** (결정 6). `already-running`의 증거는 **첫 실행의 `RUNNING` 행**이다.
 */
async function startRun(
  prisma: PrismaClient,
  projectId: string,
  trigger: SyncTriggerKind,
  requestedBy: string | null,
): Promise<Started> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;

    // ⚠️ **순차로 보낸다.** 대화형 트랜잭션은 커넥션 하나라 `Promise.all`이 왕복을 줄이지 못하고,
    // 엔진 내부 직렬화에 기대는 모양이 된다 — 이 리포에 트랜잭션 안 `Promise.all` 선례가 없다.
    const running = await tx.syncRun.findFirst({
      where: { projectId, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    // ⚠️ **FAILED를 안 집는다** — 최소 간격은 "리포에 쓴 뒤 쉬는 간격"이라 아무것도 못 쓴 실행은
    // 세지 않는다 (design 결정 7). 그 술어가 여기 있으므로 판정 함수는 `null`만 받는다.
    const lastSettled = await tx.syncRun.findFirst({
      where: { projectId, status: { in: ["SUCCEEDED", "SKIPPED"] } },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    });

    // 수동 Sync가 리포 값으로 덮는 중이면 스냅샷이 절반만 덮인 DB가 된다 — 같은 Project 잠금 안에서 읽는다 (sync-edit-protection design §4.2).
    const importing = await tx.project.findUnique({ where: { id: projectId }, select: { repositoryImportToken: true, repositoryImportStartedAt: true } });
    const activeImport = importing?.repositoryImportToken != null && importing.repositoryImportStartedAt !== null
      ? { startedAt: importing.repositoryImportStartedAt } : null;

    const now = new Date();
    // `finishedAt`은 terminal 행에서 항상 채워지지만 컬럼이 nullable이라 타입이 그것을 모른다.
    // 없으면 "직전 성공 없음"으로 읽는다 — 게이트가 더 관대해질 뿐 잘못 막지 않는다.
    const settledAt = lastSettled?.finishedAt ?? null;
    const gate = planSyncStart({
      now,
      running,
      lastSettled: settledAt === null ? null : { finishedAt: settledAt },
      trigger,
      activeImport,
    });
    if (gate.status === "already-running") {
      return { status: "rejected", outcome: { status: "failed", error: "already-running", delivery: "not-started", retryable: false } };
    }
    if (gate.status === "too-soon") {
      return {
        status: "rejected",
        outcome: { status: "failed", error: "too-soon", delivery: "not-started", retryable: false, retryAfterSeconds: gate.retryAfterSeconds },
      };
    }

    if (gate.staleToClose) {
      // ⚠️ **닫는다, 지우지 않는다.** 중단된 실행도 일어난 일이라 `logs`에 남아야 한다 — 영구 RUNNING이
      // 안 남는 것과 "무슨 일이 있었나"가 남는 것을 함께 얻는다.
      const cutoff = new Date(now.getTime() - STALE_AFTER_SECONDS * 1000);
      await tx.syncRun.updateMany({
        where: { projectId, status: "RUNNING", startedAt: { lt: cutoff } },
        data: { status: "FAILED", errorCode: "stale", finishedAt: now },
      });
    }

    const row = await tx.syncRun.create({
      data: {
        projectId,
        status: "RUNNING",
        trigger: trigger === "cron" ? "CRON" : "MANUAL",
        requestedBy,
      },
      select: { id: true },
    });
    return { status: "ok", runId: row.id };
  });
}

/**
 * 예외를 편집자가 볼 수 있는 모양으로.
 *
 * ⚠️ **남의 라이브러리 메시지는 싣지 않는다** — 이 값이 화면과 대상 리포의 (public일 수 있는)
 * Actions 로그로 흘러가고, Prisma 접속 오류 한 줄이 pooler 호스트와 DB 유저를 담는다
 * (ARCHITECTURE §6.0). 전문은 `ref`와 함께 서버 로그로 간다.
 */
function failureOutcome(slug: string, error: unknown): PullOutcome {
  const failure = classifyFailure(error);
  const { code, retryable } = classifySyncError(error);
  if (failure.safe) {
    // 우리 문구도 로그에 남긴다 — 응답은 200 배열이라 cron에서는 이것이 유일한 신호다.
    console.error(`[sync:${slug}] ${classifySyncError(error).code} ${failure.message}`);
    return { status: "failed", error: failure.message, code, retryable, delivery: "unknown" };
  }
  const ref = randomUUID().slice(0, 8);
  console.error(`[sync:${slug}] ${ref} ${failure.detail}`);
  return { status: "failed", error: `internal (ref ${ref})`, code, retryable, delivery: "unknown" };
}
