/**
 * 미전달 편집 보호의 순수 판정 (sync-edit-protection — DIRECTORY의 `lib/protection/`).
 *
 * **I/O가 0이고 리포 값을 보지 않는다.** 자동 적재의 보류는 DB의 pending 수와 "Malmoi PR이 열려 있나"로만
 * 갈리며, 리포 값과 DB 값을 견주는 입력이 원리적으로 없다 — 이 모듈에 그런 입력이 생기는 순간 병합이다(ARCHITECTURE §0 불변식 2).
 *
 * ⚠️ **잎 모듈이다** — 지금 소비자는 서버(`lib/pull/run.ts`·`lib/push/apply.ts`·`lib/import/run.ts`)뿐이지만
 * 판정을 화면이 값으로 읽을 수 있게 둔다. `./fingerprint`(crypto)를 물면 `node:crypto`가 클라이언트 번들로 온다(`components/__tests__/client-graph.test.ts`가 파일 목록으로 고정한다).
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

export type OpenPrGate = { action: "apply" } | { action: "defer"; reason: "open-pr" | "pr-check-failed" };

/**
 * 열린 Malmoi PR 게이트 (nightly-sync). 셀을 고르지 않고 **적재 전체**를 보류한다 — `pending-edits` 보류와 같은 부류다.
 * Publish가 토큰을 비운 뒤에도 PR이 열려 있는 동안엔 그 편집이 리포에 아직 없다; 적재하면 PR 머지 전에 DB에서 덮인다.
 *
 * ⚠️ **`planProtectedImport`와 합치지 않는다** — `apply.ts`의 트랜잭션 안 재판정은 GitHub을 부르지 않으므로 늘 `null`을 박는
 * 호출자가 되거나, 선택 입력이면 `undefined`로 모든 CI가 조용히 보류된다. 사전 판정(route·야간)만 이것을 부른다.
 *
 * @param openPr 조회의 삼상태 — `undefined`는 **확인 못 함**(실패·마감)이고 "PR 없음"으로 읽지 않는다(POSTMORTEM 2026-09-03).
 */
export function planOpenPrGate(input: { openPr: string | null | undefined }): OpenPrGate {
  if (input.openPr === undefined) return { action: "defer", reason: "pr-check-failed" };
  if (input.openPr === null) return { action: "apply" };
  return { action: "defer", reason: "open-pr" };
}

/**
 * 열린 PR 게이트가 **서는가** (nightly-sync). 설치·리포 고정이 없으면 Malmoi가 PR을 낼 수 없으므로 열린 Malmoi PR도 없다 — 조회하지 않고
 * `null`(게이트 없음)이다. CI 게이트(`loadOpenPrForImportGate`)와 야간 판정(`runNightly`)이 이 판정 하나를 쓴다 — 사본을 두면 한쪽만 옛 행을
 * 영구 보류한다(`loadOpenPrUrl`은 `repositoryId null`을 `undefined`로 읽는다).
 */
export function openPrGateApplies(project: { installationId: string | null; repositoryId: string | null }): boolean {
  return project.installationId !== null && project.repositoryId !== null;
}

export type HoldReason = "pending-edits" | "open-pr" | "pr-check-failed";
export type HoldNotice = { reason: HoldReason };

/**
 * **화면이 말하는 보류** (ux-drift-unify Q6) — Home 카드·메타가 읽는다. 입력은 게이트와 **같다**(미전달 수 · 열린 PR 삼상태)이고,
 * 결론도 게이트 둘(`planProtectedImport` auto · `planOpenPrGate`)을 순서대로 지난 것과 같다. **게이트를 대신하지 않는다** — 표시일 뿐이다.
 *
 * ⚠️ **두 게이트를 합치지 않는다**(위 `planOpenPrGate` 주석) — 이것은 그 위에 얹은 표시 판정이고 게이트 호출부는 그대로 둘을 부른다.
 * ⚠️ **순서: 보관·끊김 → null, 편집 > 0 → `pending-edits`, 그다음 PR.** 게이트도 편집을 먼저 본다(`/api/push` · `lib/nightly/plan.ts`).
 * 편집이 있으면 PR 조회 결과와 무관하므로 호출부는 PR을 조회하지 않아도 된다.
 * ⚠️ `gateApplies`(`openPrGateApplies`)는 **PR 갈래에만** 관계한다 — 편집 보류는 설치 여부와 무관하게 돈다.
 * ⚠️ `pr-check-failed`는 **보류다** — 게이트가 fail-closed라 실제로 적재가 멈춘다. "없음"으로 말하지 않는다(POSTMORTEM 2026-09-03).
 *
 * @param disconnected Sync·Publish가 돌 수 없는 연결(`planHomeState`의 `not_connected`). ⚠️ 연결 판정 술어를 여기로 복제하지 않는다 —
 *   이 파일은 잎이고(`client-graph.test.ts`), 연결 판정(`lib/github-connect/health.ts`)은 `lib/failure`를 문다.
 */
export function planHoldNotice(input: {
  pending: number;
  openPr: string | null | undefined;
  gateApplies: boolean;
  archived: boolean;
  disconnected: boolean;
}): HoldNotice | null {
  if (input.archived || input.disconnected) return null;
  const edits = planProtectedImport({ mode: "auto", pending: input.pending });
  if (edits.action === "defer") return { reason: edits.reason };
  if (!input.gateApplies) return null;
  const pr = planOpenPrGate({ openPr: input.openPr });
  return pr.action === "defer" ? { reason: pr.reason } : null;
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
