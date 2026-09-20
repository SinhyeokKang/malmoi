import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";

import { NOT_STARTED_REASONS, normalizeSurfaceIds, type EventPayload, type EventResult, type SurfaceScope } from "./payload";
import { buildSearchText } from "./search";

/**
 * 활동 사건을 남기는 **유일한 자리** (logs-rework design §3).
 *
 * ⚠️ **두 부류를 섞지 않는다.** 상태 변경은 `recordEvent`로 **변경과 같은 트랜잭션**에 싣고, 외부
 * 실행은 `recordRun`/`finishRun`으로 **관측된 사실만** 남긴다. 이벤트만 남고 변경이 없는 조합이
 * 생기면 이력이 거짓이 된다 — 그래서 두 함수 다 `tx`를 받고 스스로 트랜잭션을 열지 않는다.
 *
 * ⚠️ **`searchText`는 여기서만 조립된다** (결정 3). 적재 지점이 직접 만들면 종류 하나가 조용히
 * 검색에서 빠진다.
 */

export type EventActorInput =
  /** 계정이 지워졌으면 `userId`가 null이다 — `Removed user`로 접힌다. */
  | { kind: "USER"; userId: string | null }
  | { kind: "AUTOMATION" }
  | { kind: "UNKNOWN" };

export type EventInput = {
  projectId: string;
  /** `translation.saved` · `member.invited` … 앱 층 어휘라 enum이 아니다. */
  subtype: string;
  actor: EventActorInput;
  payload: EventPayload;
  /** 사건 당시 대상 소스. 비어 있고 `scope`를 안 주면 프로젝트 전역이다. */
  surfaceIds?: readonly string[];
  /** 대상 소스를 **수집하지 못한** 경우에만 명시한다(`not-recorded`). */
  scope?: SurfaceScope;
  result?: EventResult | null;
  occurredAt?: Date;
  finishedAt?: Date | null;
  syncRunId?: string | null;
  runToken?: string | null;
};

/** 공개 참조 — 목록·링크에 실리는 값이라 **id를 그대로 노출하지 않는다**(cuid는 생성 순서를 흘린다). */
export function newEventRef(): string {
  return `evt_${randomUUID().replace(/-/g, "")}`;
}

export function eventData(input: EventInput): Prisma.ProjectEventUncheckedCreateInput {
  const ref = newEventRef();
  const surfaceIds = normalizeSurfaceIds(input.surfaceIds ?? []);
  return {
    ref,
    projectId: input.projectId,
    kind: input.payload.kind,
    subtype: input.subtype,
    ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
    finishedAt: input.finishedAt ?? null,
    result: input.result ?? null,
    actorKind: input.actor.kind,
    actorUserId: input.actor.kind === "USER" ? input.actor.userId : null,
    surfaceIds,
    surfaceScope: input.scope ?? (surfaceIds.length > 0 ? "sources" : "project-wide"),
    syncRunId: input.syncRunId ?? null,
    payload: input.payload as unknown as Prisma.InputJsonValue,
    searchText: buildSearchText(ref, input.payload),
    runToken: input.runToken ?? null,
  };
}

/** 상태 변경 사건. **변경과 같은 트랜잭션에서 부른다** — 어느 쪽이 실패해도 둘 다 롤백된다. */
export async function recordEvent(tx: Prisma.TransactionClient, input: EventInput): Promise<string> {
  const data = eventData(input);
  await tx.projectEvent.create({ data });
  return data.ref;
}

/**
 * 실행 사건 — **재전달·동시 요청에도 한 건이다** (spec 완료조건 4b).
 *
 * ⚠️ **완료된 결과를 덮지 않는다** — 이미 있으면 **아무것도 쓰지 않고** 돌아간다. 같은 식별자의
 * 재전달이 사건 시각·행위자·완료된 결과를 되돌리면 이력이 거짓이 된다.
 *
 * ⚠️ **호출부가 `Project` 행 잠금을 들고 있어야 한다.** 그래서 "있으면 그만두고 없으면 만든다"가
 * 경합하지 않는다 — 이 리포의 모든 실행 경로(Publish 시작 · import lease 획득 · CI 적용·기록)가
 * 그 잠금 안이다. 충돌한 INSERT의 unique 예외를 catch해도 Postgres 트랜잭션은 이미 중단됐으므로,
 * 경합을 잠금으로 막고 완료된 행을 그대로 둔다. `@@unique([projectId, runToken])`은
 * 그 약속이 깨졌을 때 조용히 두 줄이 되지 않게 하는 **마지막 그물**로 남는다.
 */
export async function recordRun(
  tx: Prisma.TransactionClient,
  input: EventInput & { runToken: string },
): Promise<void> {
  const existing = await tx.projectEvent.findFirst({
    where: { projectId: input.projectId, runToken: input.runToken },
    select: { id: true },
  });
  if (existing !== null) return;
  await tx.projectEvent.create({ data: eventData(input) });
}

/**
 * 내부 실행의 종료 — **자기 `runToken`의 미종료 행만** 갱신한다 (design §3.2).
 *
 * ⚠️ **늦은 종료가 이미 닫힌 결과나 다른 실행을 덮지 않는다.** lease가 만료된 뒤 다음 실행이
 * 이전 이벤트를 `Failed/stale`로 닫는 경로가 있으므로, 조건이 없으면 죽은 실행이 그것을 되살린다.
 *
 * @returns 실제로 닫았으면 true. **0행 갱신은 조용하다**(POSTMORTEM 2026-09-14) — 호출부가 그것을 읽는다.
 */
export async function finishRun(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    runToken: string;
    result: EventResult;
    finishedAt?: Date;
    payload?: EventPayload;
    surfaceIds?: readonly string[];
  },
): Promise<boolean> {
  // ⚠️ **참조를 읽어 와서 검색 문자열을 다시 조립한다** — 종료가 payload를 채우는데 여기서 ref를
  // 빼면 그 사건만 참조로 검색되지 않는다(조용한 누락이다).
  const existing =
    input.payload === undefined
      ? null
      : await tx.projectEvent.findFirst({
          where: { projectId: input.projectId, runToken: input.runToken },
          select: { ref: true },
        });
  const { count } = await tx.projectEvent.updateMany({
    where: { projectId: input.projectId, runToken: input.runToken, finishedAt: null },
    data: {
      result: input.result,
      finishedAt: input.finishedAt ?? new Date(),
      ...(input.payload === undefined
        ? {}
        : {
            payload: input.payload as unknown as Prisma.InputJsonValue,
            searchText: buildSearchText(existing?.ref ?? "", input.payload),
          }),
      ...(input.surfaceIds === undefined ? {} : { surfaceIds: normalizeSurfaceIds(input.surfaceIds) }),
    },
  });
  return count > 0;
}

/** 인가 뒤 관측한 거부만 받는다 — 일시적인 재시도·확인 요구를 이력으로 부풀리지 않는다. */
export async function recordImportRefusal(
  tx: Prisma.TransactionClient,
  input: { projectId: string; userId: string | null; error: string },
): Promise<void> {
  const refusal = NOT_STARTED_REASONS.find(reason => reason === input.error);
  if (refusal === undefined) return;
  await recordEvent(tx, {
    projectId: input.projectId, subtype: "import.notStarted", actor: { kind: "USER", userId: input.userId },
    scope: "project-wide", result: "notStarted", finishedAt: new Date(),
    payload: { kind: "IMPORT", source: "manual", surfaceSlugs: [], keys: null, pendingEdits: null,
      surfaces: [], errorCode: null, refusal },
  });
}
