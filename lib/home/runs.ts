import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { homePublishRun, homeSyncRun, type HomePublishRun, type HomeSyncRun } from "./meta";

/**
 * Home 메타 열의 Sync·Publish 탭 조회 (project-card-tabs §2.2) — 사건 둘: **시각을 전진시킨 마지막 IMPORT** · **마지막 성공 PUBLISH + 그 `SyncRun`**.
 * 한 탭의 모든 행이 한 실행의 사실이다(spec 문제 3).
 *
 * ⚠️ **행위자를 고르지 않는다** (POSTMORTEM 2026-09-29 #146) — 주체는 `actorKind`·`kind`·`subtype`이 정하고, 이름·이메일은 필요 없다.
 * ⚠️ **페이지의 한 라운드(`Promise.all`) 안에서 부른다** — 둘도 병렬이라 도쿄 왕복이 하나 더 쌓이지 않는다.
 * ⚠️ 성공 Publish의 술어는 Logs 결과 필터의 `sent`와 같은 모양이다(저장 결과 ∨ 조인한 `SyncRun` 상태) — Publish 결과는 `SyncRun`이 든다.
 * 인덱스는 `[projectId, occurredAt, id]`를 역방향으로 탄다 — `kind`·`result` 인덱스는 없다.
 */
const SELECT = {
  actorKind: true, kind: true, subtype: true, result: true, payload: true, occurredAt: true, finishedAt: true,
} satisfies Prisma.ProjectEventSelect;

const NEWEST: Prisma.ProjectEventOrderByWithRelationInput[] = [{ occurredAt: "desc" }, { id: "desc" }];

/**
 * **`advancedSyncTime`과 같은 술어를 SQL로 건다** — `imported`, 또는 `partial`이면서 payload `surfaces`에 `imported` 표면이 하나라도 있다
 * (jsonb `@>` 포함). ⚠️ **최신 N건을 읽어 JS로 거르지 않는다** — 상한 안이 전부 실패 partial이면 사건이 있는데 `"unrecorded"`로 떨어진다.
 * 두 술어가 같은 행을 고르는지는 `runs.integration.ts`가 실제 행으로 잰다. 야간 보류·스킵은 `result`가 달라 여기서 빠진다.
 */
export const ADVANCED_IMPORT_WHERE = {
  kind: "IMPORT",
  OR: [
    { result: "imported" },
    { result: "partial", payload: { path: ["surfaces"], array_contains: [{ status: "imported" }] } },
  ],
} satisfies Prisma.ProjectEventWhereInput;

export const SUCCESSFUL_PUBLISH_WHERE = {
  kind: "PUBLISH",
  OR: [{ result: "sent" }, { syncRun: { status: "SUCCEEDED" } }],
} satisfies Prisma.ProjectEventWhereInput;

export type HomeRuns = { sync: HomeSyncRun | null; publish: HomePublishRun | null };

export async function loadHomeRuns(prisma: PrismaClient, projectId: string): Promise<HomeRuns> {
  const [lastImport, lastPublish] = await Promise.all([
    prisma.projectEvent.findFirst({ where: { projectId, ...ADVANCED_IMPORT_WHERE }, orderBy: NEWEST, select: SELECT }),
    prisma.projectEvent.findFirst({
      where: { projectId, ...SUCCESSFUL_PUBLISH_WHERE },
      orderBy: NEWEST,
      select: { ...SELECT, syncRun: { select: { finishedAt: true, prUrl: true, changedValues: true } } },
    }),
  ]);
  return { sync: homeSyncRun(lastImport), publish: homePublishRun(lastPublish) };
}
