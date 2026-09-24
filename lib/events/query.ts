import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { maskedEmailLabels } from "@/lib/auth/invite-label";
import { decodeUser, readable } from "@/lib/credentials/records";
import { validatePiiReadKeys } from "@/lib/credentials/storage";
import { m } from "@/lib/i18n";

import { PROJECT_WIDE, parseDateRange, type EventCursor, type LogFilter } from "./filter";
import {
  eventKindOf,
  readPayload,
  type ActorKind,
  type EventKind,
  type EventPayload,
  type EventResult,
  type SurfaceScope,
} from "./payload";

/**
 * 활동 스트림의 조회 (logs-rework design §5). **목록도 상세도 RSC가 읽는다** — Route Handler를 새로
 * 만들지 않는다(그쪽은 스키마가 두 벌이 되고 로딩·오류 갈래를 손으로 배선해야 한다).
 *
 * ⚠️ **`projectId`로 좁힌다** (불변식 5). 인가는 호출부(`requireProjectAccess`)가 이미 지났고 여기
 * 오는 값은 그 판정의 산출물이다. 인덱스가 `[projectId, occurredAt, id]` 선두라 안 좁히면 풀스캔이고,
 * 더 중요하게는 **테넌트 간 데이터가 새는 경로**가 된다.
 *
 * ⚠️ **`try`로 감싸지 않는다** (결정 16). 조회 실패는 던져서 페이지 전체가 공통 오류 경계로 가야
 * 한다 — 빈 배열로 접으면 "아직 사건이 없다"와 "물어보지 못했다"가 바이트 단위로 같아진다
 * (POSTMORTEM 2026-09-03).
 *
 * ⚠️ **원문 이메일을 안 돌려준다** (sec-audit 발견 4). 라벨은 **목록 전체를 보고** 만든다 —
 * 행마다 만들면 같은 도메인의 두 주소가 같은 라벨이 된다.
 */

export const EVENT_PAGE_SIZE = 20;

/** Home의 Recent logs. **같은 함수를 부른다** — 같은 수를 두 번 세지 않는다 (PRODUCT §7.7 결정 2). */
export const HOME_EVENT_LIMIT = 6;

export type EventActor = {
  kind: ActorKind;
  /** `USER`인데 FK가 비었다 — 계정이 지워진 사람이다 (`SetNull`). */
  removed: boolean;
  name: string | null;
  emailLabel: string | null;
};

/** Publish 실행의 정본은 `SyncRun`이다 — 이 값들은 **조인해서 읽고 복제하지 않는다** (결정 1). */
export type PublishRun = {
  changed: number | null;
  warnings: number;
  /** 못 실은 편집 수 (`SyncRun.withheld`) — 결과 모달과 같은 수다. */
  withheld: number;
  prUrl: string | null;
  errorCode: string | null;
};

export type EventRow = {
  id: string;
  ref: string;
  kind: EventKind;
  subtype: string;
  occurredAt: Date;
  finishedAt: Date | null;
  result: EventResult | null;
  actor: EventActor;
  surfaceIds: readonly string[];
  surfaceScope: SurfaceScope;
  /** 형을 못 알아보면 `null`이다 — 화면이 `Not recorded`로 떨어진다(던지지 않는다). */
  payload: EventPayload | null;
  run: PublishRun | null;
};

export type EventPage = { rows: EventRow[]; nextCursor: EventCursor | null };

const SELECT = {
  id: true,
  ref: true,
  kind: true,
  subtype: true,
  occurredAt: true,
  finishedAt: true,
  result: true,
  actorKind: true,
  actorUserId: true,
  surfaceIds: true,
  surfaceScope: true,
  payload: true,
  // ⚠️ `email`을 **읽되 돌려주지 않는다** — 가리려면 원문이 필요하고, 나가면 안 되는 것은 반환값이다.
  actor: { select: { id: true, name: true, email: true, emailLookup: true } },
  syncRun: { select: { status: true, finishedAt: true, changed: true, warnings: true, withheld: true, prUrl: true, errorCode: true } },
} satisfies Prisma.ProjectEventSelect;

type Selected = Prisma.ProjectEventGetPayload<{ select: typeof SELECT }>;

export async function loadEvents(
  prisma: PrismaClient,
  projectId: string,
  filter: LogFilter,
  options: { limit?: number } = {},
): Promise<EventPage> {
  const limit = options.limit ?? EVENT_PAGE_SIZE;
  const rows = await prisma.projectEvent.findMany({
    where: { projectId, ...narrow(filter, await surfaceIds(prisma, projectId, filter)) },
    // ⚠️ 정렬 키 둘이 커서 둘과 **같아야 한다** — 하나라도 어긋나면 페이지 경계에서 행이 사라지거나 겹친다.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    // 한 개 더 읽어 "다음 페이지가 있나"를 조회 하나로 답한다 (기존 관용구).
    take: limit + 1,
    select: SELECT,
  });

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: present(page),
    nextCursor:
      rows.length > limit && last !== undefined ? { occurredAt: last.occurredAt, id: last.id } : null,
  };
}

/**
 * 상세 하나. **목록 필터와 독립이다** (결정 15) — 다른 페이지·필터 밖의 사건도 열되, 배경 목록에
 * 끼워 넣거나 필터를 해제하지 않는다. 없는 참조·다른 프로젝트의 참조는 같은 `null`이다.
 */
export async function loadEvent(prisma: PrismaClient, projectId: string, ref: string): Promise<EventRow | null> {
  const row = await prisma.projectEvent.findFirst({ where: { projectId, ref }, select: SELECT });
  return row === null ? null : (present([row])[0] ?? null);
}

/**
 * 행위자 필터의 목록 — **이벤트에 등장한 행위자 distinct** (결정 8). 계정이 지워진 사람들은
 * `Removed user` 하나로 접힌다(FK가 `SetNull`이라 구별이 없다).
 */
export async function loadEventActors(
  prisma: PrismaClient,
  projectId: string,
): Promise<{ id: string; label: string }[]> {
  const rows = await prisma.projectEvent.findMany({
    where: { projectId, actorKind: "USER", actorUserId: { not: null } },
    distinct: ["actorUserId"],
    select: { actor: { select: { id: true, name: true, email: true, emailLookup: true } } },
    orderBy: { actorUserId: "asc" },
  });
  validatePiiReadKeys();
  const decoded = rows.map((row) => (row.actor === null ? null : readable(() => decodeUser(row.actor!))));
  const labels = maskedEmailLabels(decoded.map((user) => user?.email ?? ""));
  const out: { id: string; label: string }[] = [];
  for (const [index, row] of rows.entries()) {
    const id = row.actor?.id;
    if (id === undefined) continue;
    const user = decoded[index];
    out.push({ id, label: user === null || user === undefined ? m.common.unreadable : user.name ?? labels[index] ?? m.common.unreadable });
  }
  return out;
}

/** 저장 행 → 화면이 읽는 행. 마스킹은 **목록 전체를 한 번에** 본다. */
function present(rows: readonly Selected[]): EventRow[] {
  // 행 하나가 못 열려도 이력은 산다 — 키 부재만 장애로 남긴다 (`loadMembers`와 같은 규칙).
  validatePiiReadKeys();
  const decoded = rows.map((row) => (row.actor === null ? null : readable(() => decodeUser(row.actor!))));
  const labels = maskedEmailLabels(decoded.map((user) => user?.email ?? ""));
  return rows.map((row, index) => {
    const user = decoded[index];
    return {
      id: row.id,
      ref: row.ref,
      kind: row.kind,
      subtype: row.subtype,
      occurredAt: row.occurredAt,
      finishedAt: row.syncRun?.finishedAt ?? row.finishedAt,
      result: eventResult(row),
      actor: {
        kind: row.actorKind,
        removed: row.actorKind === "USER" && row.actorUserId === null,
        name: row.actor === null ? null : (user?.name ?? null),
        emailLabel:
          row.actor === null
            ? null
            : user === null || user === undefined
              ? m.common.unreadable
              : user.email
                ? (labels[index] ?? null)
                : null,
      },
      surfaceIds: row.surfaceIds,
      surfaceScope: scope(row.surfaceScope),
      payload: readPayload(row.kind, row.payload),
      run:
        row.syncRun === null
          ? null
          : {
              changed: row.syncRun.changed,
              warnings: row.syncRun.warnings,
              withheld: row.syncRun.withheld,
              prUrl: row.syncRun.prUrl,
              errorCode: row.syncRun.errorCode,
            },
    };
  });
}

/**
 * ⚠️ **Publish의 결과는 `SyncRun`이 든다** (결정 1) — 저장된 `result`가 있으면 그것이 우선이고
 * (선행 거부의 `Not started`), 없으면 조인한 상태를 어휘로 옮긴다. 두 값을 복제하지 않으므로
 * `RUNNING` 행이 나중에 닫혀도 갈릴 수 없다.
 */
function eventResult(row: Pick<Selected, "kind" | "result" | "syncRun" | "finishedAt">): EventResult | null {
  if (row.result !== null) return asResult(row.result);
  if (row.syncRun === null) return row.kind === "IMPORT" && row.finishedAt === null ? "running" : null;
  switch (row.syncRun.status) {
    case "SUCCEEDED":
      return "sent";
    // ⚠️ **보류만 남은 실행은 "보낼 것이 없었다"가 아니다** (delivery-invariants D7) — 편집은 있었고 못 실었다.
    case "SKIPPED":
      return row.syncRun.withheld > 0 ? "notSent" : "nothingToSend";
    case "FAILED":
      return "failed";
    default:
      return "running";
  }
}

const RESULTS: readonly string[] = [
  "running", "sent", "nothingToSend", "notSent", "imported", "deferred", "partial", "superseded", "notStarted", "failed",
];

/** 모르는 값은 결과 없음이다 — 던지지 않는다(읽는 쪽이 폴백을 든다). */
function asResult(raw: string): EventResult | null {
  return RESULTS.includes(raw) ? (raw as EventResult) : null;
}

function scope(raw: string): SurfaceScope {
  return raw === "sources" || raw === "project-wide" ? raw : "not-recorded";
}

/** 행위자 필터의 특수 값 둘. 사용자 id는 cuid라 이 낱말들과 겹칠 수 없다. */
export const ACTOR_AUTOMATION = "automation";
export const ACTOR_REMOVED = "removed";

/**
 * URL의 소스 **slug**를 인가된 프로젝트 안에서 id로 옮긴다.
 *
 * ⚠️ **`projectId`로 좁힌다** — slug는 프로젝트 안에서만 유일하다(`@@unique([projectId, slug])`).
 * ⚠️ **모르는 slug는 조용히 사라지지 않는다** — 하나도 못 찾으면 아래 `narrow`가 **0건**으로 좁힌다.
 *   빈 목록을 "필터 없음"으로 되돌리면 지운 소스를 고른 URL이 전체 목록을 보여준다.
 */
async function surfaceIds(prisma: PrismaClient, projectId: string, filter: LogFilter): Promise<string[]> {
  const slugs = filter.sources.filter((value) => value !== PROJECT_WIDE);
  if (slugs.length === 0) return [];
  const rows = await prisma.translationSurface.findMany({
    where: { projectId, slug: { in: slugs } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

function narrow(filter: LogFilter, sourceIds: readonly string[]): Prisma.ProjectEventWhereInput {
  const where: Prisma.ProjectEventWhereInput = {};
  const and: Prisma.ProjectEventWhereInput[] = [];

  const kind = eventKindOf(filter.kind);
  if (kind !== null) where.kind = kind;

  const range = parseDateRange(filter.from, filter.to);
  if (range.from !== null || range.to !== null) {
    where.occurredAt = {
      ...(range.from === null ? {} : { gte: range.from }),
      // 상한은 **배타**다 — 고른 날 하루가 통째로 들어온다 (`parseDateRange`).
      ...(range.to === null ? {} : { lt: range.to }),
    };
  }

  if (filter.actor === ACTOR_AUTOMATION) where.actorKind = "AUTOMATION";
  else if (filter.actor === ACTOR_REMOVED) {
    where.actorKind = "USER";
    where.actorUserId = null;
  } else if (filter.actor !== null) where.actorUserId = filter.actor;

  /**
   * ⚠️ **사건 당시 대상 집합을 본다** (결정 14). A·B를 처리한 실행은 A 필터와 B 필터에 각각 한 번
   * 나오고 C 필터에는 없다 — 행을 소스별로 복제하는 대신 배열이 그 일을 한다. 백필된 Publish는
   * `not-recorded`라 **어느 소스 필터에도, Project-wide에도 안 들어간다**(과거를 채우지 않는다).
   */
  /**
   * 다중 선택이라 **OR**다 (캔버스 `1m`). `Project-wide`는 소스가 없는 사건(멤버 · 설정)을 고르는
   * 항목이고, 그 사건에 **가짜 소스 값을 넣지 않기 때문에** 여기서 따로 집는다.
   *
   * ⚠️ **slug를 하나도 못 찾았는데 고르긴 했으면 0건이다** — `hasSome: []`은 Postgres에서 항상
   * 거짓이라 그 성질이 그대로 맞는다.
   */
  if (filter.sources.length > 0) {
    const parts: Prisma.ProjectEventWhereInput[] = [{ surfaceIds: { hasSome: [...sourceIds] } }];
    if (filter.sources.includes(PROJECT_WIDE)) parts.push({ surfaceScope: "project-wide" });
    and.push({ OR: parts });
  }

  // 검색은 술어 하나다 (결정 3). 대소문자는 `buildSearchText`가 이미 접었다.
  if (filter.q !== null) where.searchText = { contains: filter.q.toLowerCase() };

  if (filter.results.length > 0) {
    and.push({ OR: filter.results.map((result) => resultWhere(result)) });
  }

  if (filter.cursor !== null) {
    and.push({
      OR: [
        { occurredAt: { lt: filter.cursor.occurredAt } },
        { occurredAt: filter.cursor.occurredAt, id: { lt: filter.cursor.id } },
      ],
    });
  }

  return and.length === 0 ? where : { ...where, AND: and };
}

/**
 * ⚠️ **Publish의 결과는 컬럼이 아니라 조인에 있다** — `result` 컬럼만 보면 Publish 실행이 결과
 * 필터에서 통째로 빠진다. 저장된 값과 조인한 상태를 **OR로 함께** 본다.
 */
function resultWhere(result: EventResult): Prisma.ProjectEventWhereInput {
  const status = PUBLISH_STATUS[result];
  if (status === undefined) return { result };
  // SKIPPED 하나가 두 어휘로 갈린다 — 조회(`eventResult`)와 같은 술어여야 필터와 행 라벨이 갈리지 않는다.
  const run: Prisma.SyncRunWhereInput = result === "notSent" ? { status, withheld: { gt: 0 } } : result === "nothingToSend" ? { status, withheld: 0 } : { status };
  return { OR: [{ result }, { syncRun: run },
    ...(result === "running" ? [{ kind: "IMPORT" as const, result: null, finishedAt: null }] : []),
  ] };
}

const PUBLISH_STATUS: Partial<Record<EventResult, "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED">> = {
  running: "RUNNING",
  sent: "SUCCEEDED",
  nothingToSend: "SKIPPED",
  notSent: "SKIPPED",
  failed: "FAILED",
};
