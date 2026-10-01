import { readPayload, type ActorKind, type EventKind } from "@/lib/events/payload";
import { triggerOf, type Trigger } from "@/lib/events/view";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import type { HoldReason } from "@/lib/protection/plan";

import { failureState, type ConnectionProblem, type HomeState } from "./state";
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

export type HomeTriggers = { sync: Trigger | null; publish: Trigger | null };

/**
 * 성공 적재 — `lastImportedAt`을 전진시키는 집합과 같다. ⚠️ 두 집합이 갈리면 "12시간 전 수동 Sync" 옆에 그 뒤 보류된 야간 행의
 * `nightly`가 붙는다. 조회(`lib/home/runs.ts`)가 같은 목록으로 좁히고, 여기서 한 번 더 거른다.
 */
export const SUCCESSFUL_IMPORT_RESULTS = ["imported", "partial"] as const;

/**
 * `lastImportedAt`을 적어도 한 표면에서 전진시킨 적재인가. ⚠️ `partial` 사건은 표면이 전부 코드를 달고 끝났을 수 있다 — 그 표면은
 * `lastImportedAt`을 안 쓴다(`importOutcomeFields`). 그러면 `Last sync` 시각은 더 옛 실행의 것이라 이 사건의 주체를 붙이면 거짓이다.
 */
function advancedSyncTime(event: RunEvent): boolean {
  if (event.result === "imported") return true;
  if (event.result !== "partial") return false;
  const payload = readPayload(event.kind, event.payload);
  return payload?.kind === "IMPORT" && payload.surfaces.some((surface) => surface.status === "imported");
}

/**
 * 사건 둘 → 메타 열의 주체 (nightly-sync 14). ⚠️ **보류 한 줄은 여기서 오지 않는다** (ux-drift-unify Q6) — `metaRows`가 지금의 판정으로 든다.
 *
 * ⚠️ **고른 적재 사건이 못 쓰이면 더 옛 사건으로 물러나지 않는다** — 물러난 사건이 `lastSyncAt`과 다른 실행일 수 있다. 틀린 주체보다 주체 없음이 낫다.
 *
 * ⚠️ **`lastSyncAt`(표면 `lastImportedAt`)과 사건 시각을 대조하지 않는다** — 트랜잭션 경계가 달라 밀리초가 갈리고, 대조가
 * 실패하면 주체가 조용히 사라진다.
 */
export function homeTriggers(input: { lastImport: RunEvent | null; lastPublish: RunEvent | null }): HomeTriggers {
  const last = input.lastImport;
  return {
    sync: last !== null && advancedSyncTime(last) ? triggerOf(last) : null,
    publish: input.lastPublish === null ? null : triggerOf(input.lastPublish),
  };
}
