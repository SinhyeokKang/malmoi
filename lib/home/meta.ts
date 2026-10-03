import { readPayload, type ActorKind, type EventKind } from "@/lib/events/payload";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { triggerOf, type Trigger } from "@/lib/events/view";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import type { HoldReason } from "@/lib/protection/plan";

import { connectionProblem, connectionState, failureState, type ConnectionProblem, type HomeState } from "./state";
import type { SyncTime } from "./sync-time";

/**
 * 오른쪽 `Project` 메타 열 (캔버스 `2a` 오른쪽 · DESIGN §6.64).
 *
 * ⚠️ **행이 상태에 따라 사라지거나 는다.** 그 규칙을 JSX의 `&&`에 흩으면 여섯 상태 × 열 행의
 * 매트릭스를 화면을 읽어야만 알 수 있고, 테스트가 전수로 들 자리가 없어진다.
 */
export type MetaRow =
  /**
   * ⚠️ **`2c`에서 링크가 사라진다** — 지금 우리가 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다.
   *
   * ⚠️ **`disconnected`가 판별자다** — 전에는 `href: string | null`과 `disconnected: boolean`이 따로
   * 서서 **`href: null` ∧ `disconnected: false`**를 타입이 허용했다. 그 조합이 서면 화면은
   * `href={row.href ?? undefined}`로 **파랑 글자 + 외부 링크 모양인데 포커스를 못 받는 요소**를
   * 그린다. 지금은 `metaRows`가 한 삼항에서 둘을 함께 만들어 도달 불가지만, 그것은 타입이 아니라
   * 그 함수 한 줄이 지키는 것이었다.
   */
  | { kind: "repository"; owner: string; name: string; disconnected: false; href: string }
  | { kind: "repository"; owner: string; name: string; disconnected: true; problem: ConnectionProblem }
  | { kind: "branch"; branch: string }
  | { kind: "surfaces"; count: number }
  | { kind: "locales"; codes: readonly string[] }
  | { kind: "keys"; count: number }
  | { kind: "members"; count: number }
  /** ⚠️ **`2b`에서 값이 둘이다** — `1d ago · [Sync failed] 10m ago`. 뒤쪽이 `lastImportFailedAt`이다. */
  | {
      kind: "lastSync";
      at: Date | null;
      /**
       * 마지막 적재의 실패 — 상태 키가 배지 낱말이다(4-W11 — 옛 붉은 `failed 10m ago` 글자). ⚠️ **일부 반영은 `partiallySynced`다**(🔴 A2) —
       * 데이터가 들어간 적재를 "failed"로 말하지 않는다.
       */
      failed: { at: Date; state: "syncFailed" | "partiallySynced" } | null;
      /** 최근 성공 적재의 주체 (nightly-sync 14). 사건이 없으면(이력 도입 전) `null`이고 주체를 붙이지 않는다. */
      trigger: Trigger | null;
      /**
       * 지금 자동 적재가 보류 중인가, 왜 (ux-drift-unify Q6 · 6-Y10). ⚠️ **마지막 사건이 아니라 지금의 판정이다** — 사건으로 판정하던 때는
       * PR이 닫혀도 옛 보류를 말할 수 있었고 조회 실패(게이트 fail-closed)를 말할 자리가 없었다. 입력은 게이트와 같다(`planHoldNotice`).
       */
      held: HoldReason | null;
    }
  | { kind: "lastPublish"; at: Date | null; prUrl: string | null; trigger: Trigger | null }
  | { kind: "created"; at: Date }
  /** ⚠️ **시각만 든다** (DESIGN §6.64 이탈 표) — 캔버스의 `· by Sinhyeok`을 뺀 **의도된 이탈**이다. */
  | { kind: "archived"; at: Date };

export function metaRows(input: {
  state: HomeState;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  surfaces: number;
  locales: readonly string[];
  keys: number;
  members: number;
  /** `"unrecorded"`면 행을 그리지 않는다 — 적재는 됐는데 시각이 없다. `Never`는 거짓이다 (malmoi#81). */
  lastSyncAt: SyncTime;
  lastImportFailedAt: Date | null;
  /** 배너가 지목하는 표면의 실패 코드(`worstFailingSurface`) — 실패 배지의 낱말이 그것으로 갈린다. */
  lastImportError: ImportFailureCode | null;
  lastPublishedAt: Date | null;
  lastPrUrl: string | null;
  createdAt: Date;
  archivedAt: Date | null;
  triggers: HomeTriggers;
  /** 미연결 갈래 — 배지 색·낱말이 셋으로 갈린다(2026-09-30 상태 통일). 없으면 `not-connected`로 읽는다. */
  connection?: ConnectionProblem | null;
  /**
   * 지금의 보류 사유 — `planHomeHold`의 결론(게이트와 같은 입력, ux-drift-unify Q6). ⚠️ **PR 조회를 기다리는 동안은 `null`이다** — 그 사유는
   * Suspense로 늦게 도착한다(`MetaColumn`의 `heldLater`).
   */
  held: HoldReason | null;
}): MetaRow[] {
  const disconnected = input.state === "not_connected";
  const rows: MetaRow[] = [
    disconnected
      ? { kind: "repository", owner: input.repoOwner, name: input.repoName, disconnected: true, problem: input.connection ?? "not-connected" }
      : { kind: "repository", owner: input.repoOwner, name: input.repoName, disconnected: false,
          href: `https://github.com/${input.repoOwner}/${input.repoName}` },
    { kind: "branch", branch: input.baseBranch },
  ];
  // ⚠️ **표면이 하나면 행이 사라진다** — `1`은 정보가 아니라 자리만 먹는다.
  if (input.surfaces > 1) rows.push({ kind: "surfaces", count: input.surfaces });
  rows.push(
    { kind: "locales", codes: input.locales },
    { kind: "keys", count: input.keys },
    { kind: "members", count: input.members },
    // 실패 시각은 실패 상태에서만 나란히 선다 — 성공한 뒤에도 남으면 옛 실패를 상시로 말한다.
  );
  if (input.lastSyncAt !== "unrecorded")
    rows.push({
      kind: "lastSync", at: input.lastSyncAt,
      failed: input.state === "import_failed" && input.lastImportFailedAt !== null && input.lastImportError !== null
        ? { at: input.lastImportFailedAt, state: failureState(input.lastImportError) } : null,
      trigger: input.triggers.sync,
      held: input.held,
    });
  rows.push(
    { kind: "lastPublish", at: input.lastPublishedAt, prUrl: input.lastPrUrl, trigger: input.triggers.publish },
    { kind: "created", at: input.createdAt },
  );
  // 시각 없는 사건을 세우지 않는다 — 활동 스트림이 관측된 것만 남기는 것과 같은 규칙이다.
  if (input.state === "archived" && input.archivedAt !== null) rows.push({ kind: "archived", at: input.archivedAt });
  return rows;
}

/** Home이 읽는 사건 한 줄 — **행위자를 싣지 않는다**(POSTMORTEM 2026-09-29 #146). 주체는 컬럼 셋(`triggerOf`)이 정한다. */
export type RunEvent = { actorKind: ActorKind; kind: EventKind; subtype: string; result: string | null; payload: unknown };

/** IMPORT 사건 — `occurredAt`은 실행 **시작**, `finishedAt`은 종료다(내부·CI·야간 종료가 모두 채운다). */
export type ImportRunEvent = RunEvent & { occurredAt: Date; finishedAt: Date | null };

/** PUBLISH 사건 — 결과·시각·PR은 조인한 `SyncRun`이 든다(logs-rework 결정 1). 백필된 옛 사건은 `SyncRun`이 없을 수 있다. */
export type PublishRunEvent = ImportRunEvent & {
  syncRun: { finishedAt: Date | null; prUrl: string | null; changedValues: number | null } | null;
};

export type HomeTriggers = { sync: Trigger | null; publish: Trigger | null };

/**
 * 성공 적재 — `lastImportedAt`을 전진시키는 집합과 같다. ⚠️ 두 집합이 갈리면 "12시간 전 수동 Sync" 옆에 그 뒤 보류된 야간 행의
 * `nightly`가 붙는다. 조회(`lib/home/runs.ts`)가 같은 술어를 SQL로 걸고, 여기서 한 번 더 거른다.
 */
export const SUCCESSFUL_IMPORT_RESULTS = ["imported", "partial"] as const;

/**
 * `lastImportedAt`을 적어도 한 표면에서 전진시킨 적재인가. ⚠️ `partial` 사건은 표면이 전부 코드를 달고 끝났을 수 있다 — 그 표면은
 * `lastImportedAt`을 안 쓴다(`importOutcomeFields`). 조회(`lib/home/runs.ts`)의 SQL 술어가 이것과 같은 행을 고르는지는
 * `runs.integration.ts`가 실제 행으로 잰다.
 */
export function advancedSyncTime(event: RunEvent): boolean {
  if (event.result === "imported") return true;
  if (event.result !== "partial") return false;
  const payload = readPayload(event.kind, event.payload);
  return payload?.kind === "IMPORT" && payload.surfaces.some((surface) => surface.status === "imported");
}

/**
 * 시각을 전진시킨 마지막 IMPORT 사건 → Sync 탭의 실행 (project-card-tabs §2.2). ⚠️ **보류는 여기서 오지 않는다** (ux-drift-unify Q6).
 *
 * ⚠️ **조회는 시각을 전진시키지 못한 사건을 건너뛰고 그 앞 실행으로 물러난다** — 옛 판정(nightly-sync F2)은 물러나지 않았다: 주체(사건)와
 * 시각(전 소스 `lastImportedAt` 최댓값)이 다른 실행을 가리킬 수 있어서였다. 이제 시각도 이 사건(`finishedAt`)에서 읽으므로 그 근거가 없다.
 * ⚠️ `occurredAt`은 시작이다 — `Synced`는 종료(`finishedAt`)이고, 옛 행처럼 비었을 때만 시작으로 물러난다.
 */
export function homeSyncRun(event: ImportRunEvent | null): HomeSyncRun | null {
  if (event === null || !advancedSyncTime(event)) return null;
  const payload = readPayload(event.kind, event.payload);
  const imported = payload?.kind === "IMPORT" ? payload : null;
  return {
    trigger: triggerOf(event),
    at: event.finishedAt ?? event.occurredAt,
    result: event.result === "imported" ? "imported" : "partial",
    changedValues: imported?.changedValues ?? null,
    keys: imported?.keys ?? null,
    surfaceSlugs: imported?.surfaceSlugs ?? [],
  };
}

/** 마지막 성공 PUBLISH 사건 → Publish 탭의 실행. 시각·PR·값 수는 조인한 `SyncRun`의 것이다 — `Project.lastPublishedAt`·`lastPrUrl`이 아니다. */
export function homePublishRun(event: PublishRunEvent | null): HomePublishRun | null {
  if (event === null) return null;
  const payload = readPayload(event.kind, event.payload);
  return {
    trigger: triggerOf(event),
    at: event.syncRun?.finishedAt ?? event.finishedAt ?? event.occurredAt,
    prUrl: event.syncRun?.prUrl ?? null,
    changedValues: event.syncRun?.changedValues ?? null,
    surfaceSlugs: payload?.kind === "PUBLISH" ? payload.surfaceSlugs : [],
  };
}

/**
 * 메타 열 Sync 탭의 실행 하나 (project-card-tabs) — **마지막으로 시각을 전진시킨 IMPORT 사건**에서 전부 온다.
 * `at`은 그 실행의 **종료 시각**(사건 `finishedAt`)이다 — 전 소스 `lastImportedAt`의 최댓값이 아니다(spec 문제 3).
 */
export type HomeSyncRun = {
  trigger: Trigger;
  at: Date;
  result: (typeof SUCCESSFUL_IMPORT_RESULTS)[number];
  changedValues: number | null;
  keys: number | null;
  surfaceSlugs: readonly string[];
};

/** 메타 열 Publish 탭의 실행 하나 — 마지막 성공 PUBLISH 사건과 그 `SyncRun`. `at`은 `SyncRun.finishedAt`이다. */
export type HomePublishRun = {
  trigger: Trigger;
  at: Date;
  prUrl: string | null;
  changedValues: number | null;
  /** 실행 시작 때의 비보관 소스 전부 — "그 PR에 실린 소스"가 아니다. 백필된 옛 사건은 `[]`(모른다)다. */
  surfaceSlugs: readonly string[];
};

/** Connection 배지의 상태 키 — 설정 카드·Home 배너와 같은 `STATE` 행이다. */
export type MetaConnection = "connected" | "notConnected" | "disconnected" | "wrongRepository" | "couldNotCheck";

/**
 * 연결 상태 → Connection 배지. ⚠️ **모름(`unknown`)을 끊김으로 접지 않는다** — `planHomeState`가 조회 실패를 미연결로 접지 않는 것과
 * 같은 축이다. `repo-moved`는 Sync·Publish가 도는 연결이라 `connected`다(`connectionProblem`이 `null`).
 */
export function metaConnection(status: ConnectionHealth["status"]): MetaConnection {
  if (status === "unknown") return "couldNotCheck";
  const problem = connectionProblem(status);
  return problem === null ? "connected" : connectionState(problem);
}

/**
 * Sync 탭 입력의 세 갈래. ⚠️ **`"unrecorded"`는 첫 Sync 전(`null`)과 다른 사실이다** — 사건 기록(2026-09-20) 이전에 적재되고 그 뒤
 * 시각을 전진시킨 실행이 없다. `notSyncedYet`으로 접으면 거짓이다. `lastSyncTime`의 `"unrecorded"`(`lastCommitAt` 기준)와 이름만 같다.
 */
export function homeLastSync(run: HomeSyncRun | null, surfaces: readonly { lastImportedAt: Date | null }[]): HomeSyncRun | "unrecorded" | null {
  if (run !== null) return run;
  return surfaces.some((surface) => surface.lastImportedAt !== null) ? "unrecorded" : null;
}

export type MetaTabsInput = {
  repository: { owner: string; name: string; branch: string; connection: MetaConnection };
  /** `pushTokenHash !== null` — ⚠️ **해시는 입력에 없다**. 서버가 select 직후 boolean으로 접는다(RSC 페이로드에 싣지 않는다). */
  ciConfigured: boolean;
  /** 비보관 소스 수 — Project `Sources` 행 · Sync/Publish `Sources` 행의 "둘 이상" 판정. */
  surfaceCount: number;
  keys: number;
  members: number;
  /** 대기 초대 수(수락·만료 제외 — `pendingInvitationWhere`). ⚠️ **0도 값이다** — `(0)`. */
  pendingInvites: number;
  createdAt: Date;
  /** 보관 시각 — 있으면 보관 상태다. */
  archivedAt: Date | null;
  lastSync: HomeSyncRun | "unrecorded" | null;
  lastPublish: HomePublishRun | null;
  /** 첫 렌더에 아는 보류 — PR 조회를 기다리는 동안은 `null`이고 늦게 오는 값은 탭 껍데기가 든다. */
  held: HoldReason | null;
  /** PR 조회를 하는 갈래면 `pending`(스켈레톤 자리) · 아니면 `absent`(행 없음). 새 GitHub 호출은 없다. */
  prState: "pending" | "absent";
};

/**
 * ⚠️ **링크 여부가 `linked` 하나다** — `href`는 언제나 있다(평문일 때도 주소는 같다). 옛 `MetaRow`가 `href: null` ∧ `disconnected: false`를
 * 허용해 파랑 글자인데 포커스를 못 받는 요소가 설 수 있었던 것과 같은 조합이 이 형에선 생기지 않는다.
 */
export type ProjectTabRow =
  | { kind: "repository"; owner: string; name: string; href: string; linked: boolean }
  | { kind: "connection"; state: MetaConnection }
  | { kind: "branch"; branch: string }
  | { kind: "ci"; configured: boolean }
  | { kind: "sources"; count: number }
  | { kind: "keys"; count: number }
  | { kind: "members"; count: number; pending: number }
  | { kind: "created"; at: Date }
  /** ⚠️ **시각만 든다** — 행위자를 싣지 않는다(DESIGN §6.64 이탈 표 · POSTMORTEM 2026-09-29 #146). */
  | { kind: "archived"; at: Date };

export type SyncTabRow =
  | { kind: "lastSync"; value: Trigger | "notSyncedYet" | "unrecorded" }
  | { kind: "synced"; at: Date }
  | { kind: "result"; state: "synced" | "partiallySynced" }
  | { kind: "changed"; values: number }
  | { kind: "keysSeen"; count: number }
  | { kind: "sources"; slugs: readonly string[] }
  /** 지금의 판정(`planHomeHold`)이다 — 실행의 사실이 아니라 마지막 묶음 끝에 붙고 자리를 잡지 않는다. */
  | { kind: "hold"; reason: HoldReason };

export type PublishTabRow =
  | { kind: "lastPublish"; value: Trigger | "never" }
  | { kind: "published"; at: Date }
  | { kind: "pullRequest"; href: string; linked: boolean }
  /** 값이 없다 — 자리(스켈레톤)만 잡고 늦게 오는 PR 조회 결과를 탭 껍데기가 채운다. */
  | { kind: "prState" }
  | { kind: "changed"; values: number }
  | { kind: "sources"; slugs: readonly string[] };

/** 탭마다 **묶음 배열**(구분선 단위). 빈 묶음은 내지 않는다. */
export type MetaTabs = { project: ProjectTabRow[][]; sync: SyncTabRow[][]; publish: PublishTabRow[][] };

/**
 * 오른쪽 메타 열의 탭 셋 (project-card-tabs — spec "결정" · 시안 v3).
 *
 * ⚠️ **한 행 = 라벨 하나 + 사실 하나.** 옛 `metaRows`의 `Last sync`는 주체·성공 시각·실패·보류를 한 줄에 붙였다.
 * ⚠️ **Sync·Publish 탭은 실행 하나의 사실이다** — 입력이 실행 하나뿐이라 다른 소스의 시각·실패가 섞일 자리가 없고,
 * 실패·진행 중은 입력조차 받지 않는다(배너가 든다). ⚠️ **로케일·역할 입력이 없다** — 로케일은 Sources 상세가, 역할은 바닥 링크가 든다.
 * ⚠️ 상태 매트릭스를 JSX의 `&&`에 흩지 않는다 — 여기 한 곳이 행의 유무를 정하고 테스트가 전수로 든다.
 */
export function metaTabs(input: MetaTabsInput): MetaTabs {
  const { owner, name, branch, connection } = input.repository;
  // 지금 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다. 모름(`couldNotCheck`)은 끊김이 아니다.
  const linked = connection === "connected" || connection === "couldNotCheck";
  const multiSource = input.surfaceCount > 1;

  const project: ProjectTabRow[][] = [
    [
      { kind: "repository", owner, name, href: `https://github.com/${owner}/${name}`, linked },
      { kind: "connection", state: connection },
      { kind: "branch", branch },
      { kind: "ci", configured: input.ciConfigured },
    ],
    // ⚠️ **소스가 하나여도 선다** — Keys가 몇 개의 합인지 말한다(옛 `> 1` 규칙을 뒤집었다).
    [
      { kind: "sources", count: input.surfaceCount },
      { kind: "keys", count: input.keys },
      { kind: "members", count: input.members, pending: input.pendingInvites },
    ],
    [
      { kind: "created", at: input.createdAt },
      ...(input.archivedAt === null ? [] : [{ kind: "archived", at: input.archivedAt } as const]),
    ],
  ];

  const sync = syncTab(input.lastSync, multiSource);
  if (input.held !== null) sync.at(-1)?.push({ kind: "hold", reason: input.held });

  return { project, sync, publish: publishTab(input, linked, multiSource) };
}

function syncTab(run: MetaTabsInput["lastSync"], multiSource: boolean): SyncTabRow[][] {
  if (run === null) return [[{ kind: "lastSync", value: "notSyncedYet" }]];
  if (run === "unrecorded") return [[{ kind: "lastSync", value: "unrecorded" }]];
  // 관측하지 않은 수(`null`)를 `0`으로 접지 않는다 — 행이 없다(malmoi#81과 같은 원칙).
  const facts: SyncTabRow[] = [
    ...(run.changedValues === null ? [] : [{ kind: "changed", values: run.changedValues } as const]),
    ...(run.keys === null ? [] : [{ kind: "keysSeen", count: run.keys } as const]),
    ...sourcesRow(run.surfaceSlugs, multiSource),
  ];
  return nonEmpty<SyncTabRow>([
    [
      { kind: "lastSync", value: run.trigger },
      { kind: "synced", at: run.at },
      { kind: "result", state: run.result === "imported" ? "synced" : "partiallySynced" },
    ],
    facts,
  ]);
}

function publishTab(input: MetaTabsInput, linked: boolean, multiSource: boolean): PublishTabRow[][] {
  const run = input.lastPublish;
  // 발송 전이면 PR 조회 결과도 말할 실행이 없다 — 자리를 잡지 않는다.
  if (run === null) return [[{ kind: "lastPublish", value: "never" }]];
  return nonEmpty<PublishTabRow>([
    [
      { kind: "lastPublish", value: run.trigger },
      { kind: "published", at: run.at },
      ...(run.prUrl === null ? [] : [{ kind: "pullRequest", href: run.prUrl, linked } as const]),
      ...(input.prState === "pending" ? [{ kind: "prState" } as const] : []),
    ],
    [
      ...(run.changedValues === null ? [] : [{ kind: "changed", values: run.changedValues } as const]),
      ...sourcesRow(run.surfaceSlugs, multiSource),
    ],
  ]);
}

/** 프로젝트 소스가 둘 이상일 때만 — 백필된 옛 사건의 `[]`는 "모른다"라 빈 행을 세우지 않는다. */
function sourcesRow(slugs: readonly string[], multiSource: boolean): { kind: "sources"; slugs: readonly string[] }[] {
  return multiSource && slugs.length > 0 ? [{ kind: "sources", slugs }] : [];
}

function nonEmpty<T>(groups: T[][]): T[][] {
  return groups.filter((group) => group.length > 0);
}
