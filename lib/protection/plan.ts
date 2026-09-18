/**
 * 미전달 편집 보호의 순수 판정 (sync-edit-protection — DIRECTORY의 `lib/protection/`).
 *
 * **I/O가 0이고 리포를 보지 않는다.** 자동 적재의 보류는 DB의 pending 수 하나로 갈리며, 리포 값과 DB 값을
 * 견주는 입력이 원리적으로 없다 — 이 모듈에 그런 입력이 생기는 순간 병합이다(ARCHITECTURE §0 불변식 2).
 *
 * ⚠️ **잎 모듈이다** — 화면(배너·Sync Dialog·Home 카드)이 값으로 읽는다. `./fingerprint`(crypto)를 물면
 * `node:crypto`가 클라이언트 번들로 온다(`components/__tests__/client-graph.test.ts`가 파일 목록으로 고정한다).
 */

export type ProtectedImport =
  | { action: "apply" }
  | { action: "defer"; reason: "pending-edits"; pendingCount: number }
  | { action: "reject"; reason: "reconfirm" };

/**
 * @param approved 수동 Sync에서 `planDiscardConfirmation`이 `proceed`를 냈는가. 자동 적재에는 승인 경로가 없다.
 */
export function planProtectedImport(
  input: { mode: "auto"; pending: number } | { mode: "manual"; pending: number; approved: boolean },
): ProtectedImport {
  if (input.pending === 0) return { action: "apply" };
  if (input.mode === "auto") return { action: "defer", reason: "pending-edits", pendingCount: input.pending };
  return input.approved ? { action: "apply" } : { action: "reject", reason: "reconfirm" };
}

export type ProtectedPublish =
  | { action: "proceed" }
  | { action: "skip"; reason: "no-edits" }
  | { action: "reject"; reason: "writer-warnings"; warnings: number };

/**
 * pending 0이 경고보다 먼저다 — 경고는 렌더 뒤에야 알고, 렌더는 GitHub 읽기 뒤다. pending 0의 "GitHub 0회"가 그 앞에 선다.
 */
export function planProtectedPublish(input: { pending: number; writerWarnings: number }): ProtectedPublish {
  if (input.pending === 0) return { action: "skip", reason: "no-edits" };
  if (input.writerWarnings > 0) return { action: "reject", reason: "writer-warnings", warnings: input.writerWarnings };
  return { action: "proceed" };
}

export type DiscardConfirmation = { action: "proceed" } | { action: "reconfirm" } | { action: "reject"; reason: "forbidden" };

/**
 * 인가가 지문보다 먼저다 — EDITOR가 OWNER의 지문을 되돌려 보내도 폐기는 열리지 않는다.
 * 지문 대조 자체(`timingSafeEqual`)는 `./fingerprint`의 `sameFingerprint`가 하고 여기엔 결과만 온다.
 */
export function planDiscardConfirmation(input: { role: "OWNER" | "EDITOR"; fingerprintMatches: boolean }): DiscardConfirmation {
  if (input.role !== "OWNER") return { action: "reject", reason: "forbidden" };
  return input.fingerprintMatches ? { action: "proceed" } : { action: "reconfirm" };
}

export type SyncProtectionExit = "publish" | "discard";

export type SyncProtectionView = {
  /** pending 0이면 없다 — 가장 흔한 상태가 가장 조용하다(DESIGN §6.1). */
  banner: { pendingCount: number; exits: readonly SyncProtectionExit[] } | null;
  /** EDITOR에게는 Sync UI가 통째로 없다. */
  sync: { confirmLabel: "sync" | "discard-and-sync"; discardCount: number } | null;
  homeSubline: "repositoryUpdatesPaused" | null;
};

/**
 * ⚠️ **출구가 빈 배너를 만들지 않는다** — 보류는 사람이 풀 때까지 유지되므로(spec "보류의 자동 해소 없음") 출구 없는
 * 배너는 막힌 상태만 알린다. 비파괴 출구(Publish)가 언제나 첫째다(spec "화면은 ①을 먼저").
 */
export function planSyncProtectionView(input: { pending: number; role: "OWNER" | "EDITOR" }): SyncProtectionView {
  const owner = input.role === "OWNER";
  const sync = owner ? { confirmLabel: input.pending === 0 ? "sync" as const : "discard-and-sync" as const, discardCount: input.pending } : null;
  if (input.pending === 0) return { banner: null, sync, homeSubline: null };
  return {
    banner: { pendingCount: input.pending, exits: owner ? ["publish", "discard"] : ["publish"] },
    sync,
    homeSubline: "repositoryUpdatesPaused",
  };
}
