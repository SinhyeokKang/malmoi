import type { SyncErrorCode } from "@/lib/sync/plan";
import type { PullResult } from "./run";

export type PullOutcome =
  | PullResult
  | { status: "failed"; error: string; delivery: "not-started" | "unknown"; code?: SyncErrorCode; retryable?: boolean; retryAfterSeconds?: number };

/**
 * 이 결과가 **재검증 트리를 싣고 오나** (malmoi#103 r1) — `triggerPullAction`은 `runSync`를 부른 뒤 결과와 무관하게 `revalidatePath`를
 * 부르고, 그 앞의 거부(세션·인가·준비)만 트리 없이 돌아온다. ⚠️ **`delivery`로 가르지 않는다** — `runSync`의 게이트 거부도
 * `not-started`다. 표식은 `runSync`만 내는 것: 실행 실패의 `code`와 게이트의 두 코드. `runSync` 안의 인가 재확인 거부
 * (`lockProjectAccess`)는 앞의 거부와 코드가 같아 `false`로 읽힌다 — 데이터를 안 건드린 거부라 잠금이 한 박자 빨리 풀려도
 * 옛 수치가 틀리지 않는다. 클라이언트가 접은 throw(`unavailable`·`code` 없음)도 트리가 없다.
 */
export function pullRevalidates(outcome: PullOutcome): boolean {
  if (outcome.status !== "failed") return true;
  return outcome.code !== undefined || outcome.error === "already-running" || outcome.error === "too-soon";
}
