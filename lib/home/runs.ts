import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { SUCCESSFUL_IMPORT_RESULTS, homeTriggers, type HomeTriggers } from "./meta";

/**
 * Home 메타 열의 실행 주체 조회 (nightly-sync F2) — 사건 셋: 최근 성공 적재 · 최근 적재(보류 포함) · 최근 성공 Publish.
 *
 * ⚠️ **행위자를 고르지 않는다** (POSTMORTEM 2026-09-29 #146) — 주체는 `actorKind`·`kind`·`subtype`이 정하고, 이름·이메일은 필요 없다.
 * ⚠️ **페이지의 한 라운드(`Promise.all`) 안에서 부른다** — 셋도 병렬이라 도쿄 왕복이 하나 더 쌓이지 않는다.
 * ⚠️ 성공 Publish의 술어는 Logs 결과 필터의 `sent`와 같은 모양이다(저장 결과 ∨ 조인한 `SyncRun` 상태) — Publish 결과는 `SyncRun`이 든다.
 */
const SELECT = { actorKind: true, kind: true, subtype: true, result: true, payload: true } satisfies Prisma.ProjectEventSelect;

const NEWEST: Prisma.ProjectEventOrderByWithRelationInput[] = [{ occurredAt: "desc" }, { id: "desc" }];

export async function loadHomeRuns(prisma: PrismaClient, projectId: string): Promise<HomeTriggers> {
  const [lastImport, latestImport, lastPublish] = await Promise.all([
    prisma.projectEvent.findFirst({
      where: { projectId, kind: "IMPORT", result: { in: [...SUCCESSFUL_IMPORT_RESULTS] } },
      orderBy: NEWEST, select: SELECT,
    }),
    // 보류 한 줄은 "최근 적재 사건"이 정한다 — 스킵(`upToDate`)·실패는 적재가 아니라 이 집합에 없다.
    prisma.projectEvent.findFirst({
      where: { projectId, kind: "IMPORT", result: { in: [...SUCCESSFUL_IMPORT_RESULTS, "deferred"] } },
      orderBy: NEWEST, select: SELECT,
    }),
    prisma.projectEvent.findFirst({
      where: { projectId, kind: "PUBLISH", OR: [{ result: "sent" }, { syncRun: { status: "SUCCEEDED" } }] },
      orderBy: NEWEST, select: SELECT,
    }),
  ]);
  return homeTriggers({ lastImport, latestImport, lastPublish });
}
