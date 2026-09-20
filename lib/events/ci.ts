import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { runTokenFor, type EventResult, type NotStartedReason, type SurfaceOutcome } from "./payload";
import { recordRun, type EventInput } from "./record";

/**
 * CI 적재 실행의 사건 (logs-rework design §3.2·§3.3).
 *
 * ⚠️ **관측된 종료만 남긴다** — CI는 시작을 알려주지 않으므로 진행 중 이벤트가 없다. 네트워크가
 * 끊겨 응답이 안 닿은 것은 관측이 아니다.
 *
 * ⚠️ **401이면 이벤트 0건이다.** 최초 인증 실패뿐 아니라 **토큰 회전 경합**도 그렇다 — 그래서
 * 쓰기 전에 잠금 아래에서 토큰을 한 번 더 대조한다. 인가되지 않은 요청이 남의 프로젝트 이력에
 * 줄을 세울 수 있으면 그 자체가 쓰기 경로다.
 */

export type CiImportEvent = {
  projectId: string;
  /** 인증에 쓴 해시. 잠금 뒤 이 값과 다르면 **아무것도 쓰지 않는다**. */
  pushTokenHash: string;
  /**
   * 생산자가 준 값이거나, 없으면 요청별로 발급한 값. 구 생산자는 후자라 **HTTP 재전달 중복 방지가
   * 보장되지 않는다**(design §3.3의 전환 제한).
   */
  executionId: string;
  /** 가드가 표면을 정하기 전에 거부하면 `null`이다. */
  surface: { id: string; slug: string } | null;
  result: Extract<EventResult, "imported" | "deferred" | "failed" | "notStarted">;
  keys?: number | null;
  pendingEdits?: number | null;
  errorCode?: string | null;
  refusal?: NotStartedReason | null;
  surfaces?: readonly SurfaceOutcome[];
};

/** 종료 행 하나. 같은 식별자의 재전달은 `@@unique([projectId, runToken])`이 한 건으로 만든다. */
export function ciImportEvent(input: CiImportEvent): EventInput & { runToken: string } {
  return {
    projectId: input.projectId,
    subtype: "import.ci",
    // CI 러너에는 사람이 없다 — 토큰이 프로젝트를 정할 뿐 누구인지는 말하지 않는다.
    actor: { kind: "AUTOMATION" },
    surfaceIds: input.surface === null ? [] : [input.surface.id],
    // 표면을 정하기 전에 거부했으면 **프로젝트 전역이 아니라 "모른다"** 이다.
    scope: input.surface === null ? "not-recorded" : "sources",
    result: input.result,
    finishedAt: new Date(),
    runToken: runTokenFor({ kind: "ci", surfaceId: input.surface?.id ?? null, executionId: input.executionId }),
    payload: {
      kind: "IMPORT",
      source: "ci",
      surfaceSlugs: input.surface === null ? [] : [input.surface.slug],
      keys: input.keys ?? null,
      pendingEdits: input.pendingEdits ?? null,
      surfaces: input.surfaces ?? [],
      errorCode: input.errorCode ?? null,
      refusal: input.refusal ?? null,
    },
  };
}

/** 적재 트랜잭션 **안에서** 부르는 형 — 성공 기록이 적재와 함께 확정된다. */
export async function recordCiImportInTransaction(tx: Prisma.TransactionClient, input: CiImportEvent): Promise<void> {
  await recordRun(tx, ciImportEvent(input));
}

/**
 * 적재 밖에서 부르는 형(보류·거부·실패 보고). **짧은 tx에서 인증을 재확인한다.**
 *
 * ⚠️ **기록 실패가 응답을 바꾸지 않는다** — 관측 기반 기록이라 실행은 이미 끝났고, 여기서 던지면
 * 정상 응답이 500이 된다. 호출부가 로그만 남긴다.
 */
export async function recordCiImport(prisma: PrismaClient, input: CiImportEvent): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ pushTokenHash: string | null }[]>`SELECT "pushTokenHash" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
    if (locked[0]?.pushTokenHash !== input.pushTokenHash) return;
    await recordCiImportInTransaction(tx, input);
  });
}
