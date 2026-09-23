/**
 * 전달 baseline — **미전달 셀 delta 설계** (translation-rework — design §10.3·§10.4).
 *
 * 소스별 전달 확인 레코드가 유효하면 "미전달이 아닌 활성 셀의 현재 값 = 마지막 확인된 export 값"이다.
 * 그래서 baseline 행은 셀이 미전달이 되는 순간(Save)과 캡처 뒤 재편집된 셀(Publish 성공)에만 생긴다.
 * ⚠️ **복원값은 DB 유래다** — 현재 리포를 읽어 값을 고르는 순간 "병합 없음"(ARCHITECTURE §0)이 깨진다.
 */

/**
 * export와 같은 폴백 — `lib/pull/plan.ts` `buildWriteEntries`: base 부재·빈값 → 원문, 비-base 부재·빈값 → 파일에서 빠짐(`""`).
 * ⚠️ 그 규칙을 바꾸면 여기도 같이 바뀌어야 한다 — 복원이 export가 낸 적 없는 값을 만들게 된다.
 */
export function restoreValueOf(cell: { value: string | null; isBase: boolean; sourceText: string }): string {
  if (cell.value !== null && cell.value !== "") return cell.value;
  return cell.isBase ? cell.sourceText : "";
}

export type BaselineOnSave =
  | { record: true; restoreValue: string }
  | { record: false; reason: "unchanged" | "already-pending" | "no-confirmation" | "publish-in-flight" };

export function planBaselineOnSave(input: {
  changed: boolean;
  wasPending: boolean;
  confirmationValid: boolean;
  publishInFlight: boolean;
  before: { value: string | null; isBase: boolean; sourceText: string };
}): BaselineOnSave {
  if (!input.changed) return { record: false, reason: "unchanged" };
  // 이미 미전달인 셀의 직전 값은 전달된 값이 아니다 — 기준은 처음 미전달이 된 순간의 것이 남는다.
  if (input.wasPending) return { record: false, reason: "already-pending" };
  if (!input.confirmationValid) return { record: false, reason: "no-confirmation" };
  // 진행 중인 Publish가 이 셀의 현재 값을 보냈는지 아직 모른다 — unknown으로 두는 보수적 선택이다.
  if (input.publishInFlight) return { record: false, reason: "publish-in-flight" };
  return { record: true, restoreValue: restoreValueOf(input.before) };
}

/**
 * Publish 성공 확정 tx — 캡처한 미전달 셀만 다룬다(규모 = 편집 수).
 * 토큰이 그대로면 전달됐으니 기준 행을 지우고, 재편집됐으면 기준을 **캡처값**으로 바꾼다(현재 DB 값이 아니다).
 */
export function planPublishBaselines(
  captured: readonly { cellId: string; token: string; restoreValue: string }[],
  currentTokens: ReadonlyMap<string, string | null>,
): { release: string[]; rebase: { cellId: string; restoreValue: string }[] } {
  const release: string[] = [];
  const rebase: { cellId: string; restoreValue: string }[] = [];
  for (const cell of captured) {
    if (!currentTokens.has(cell.cellId)) continue;
    const token = currentTokens.get(cell.cellId);
    if (token === cell.token) release.push(cell.cellId);
    else if (token !== null && token !== undefined) rebase.push({ cellId: cell.cellId, restoreValue: cell.restoreValue });
  }
  return { release, rebase };
}

/**
 * 교체·실패 실행의 외부 쓰기 종료 — **플랫폼 `maxDuration` 강제 종료가 근거다**(사용자 결정 2026-09-23).
 * 그 실행의 `startedAt + staleAfterSeconds` 이후에 **시작한** 성공 확인이 있어야 열린다. 시간 경과만으로는 열지 않는다.
 */
export function revertSettled(input: { unsettledRunStartedAt: Date | null; confirmationRunStartedAt: Date; staleAfterSeconds: number }): boolean {
  if (input.unsettledRunStartedAt === null) return true;
  return input.confirmationRunStartedAt.getTime() >= input.unsettledRunStartedAt.getTime() + input.staleAfterSeconds * 1000;
}

export type RevertTarget = { localeCode: string; token: string; currentValue: string; needsReview: boolean };

export type RevertPlan =
  | { ok: true; writes: { localeCode: string; value: string; expectedToken: string }[] }
  | { ok: false; reason: "forbidden" | "unsaved" | "busy" | "nothing" | "baseline-stale" | "unsettled" }
  | { ok: false; reason: "baseline-unknown"; localeCodes: string[] };

export function planKeyRevert(input: {
  targets: readonly RevertTarget[];
  baselines: ReadonlyMap<string, { restoreValue: string; revision: string }>;
  confirmation: { revision: string; valid: boolean; settled: boolean } | null;
  canRevert: boolean;
  draftDirty: boolean;
  busy: boolean;
}): RevertPlan {
  // 권한이 먼저다 — EDITOR에게 기준 상태를 흘리지 않는다.
  if (!input.canRevert) return { ok: false, reason: "forbidden" };
  if (input.draftDirty) return { ok: false, reason: "unsaved" };
  if (input.busy) return { ok: false, reason: "busy" };
  if (input.targets.length === 0) return { ok: false, reason: "nothing" };
  const { confirmation } = input;
  if (confirmation === null) return { ok: false, reason: "baseline-unknown", localeCodes: input.targets.map(t => t.localeCode) };
  if (!confirmation.valid) return { ok: false, reason: "baseline-stale" };
  if (!confirmation.settled) return { ok: false, reason: "unsettled" };
  // 부분 복원을 만들지 않는다 — 어느 언어가 빠졌는지 화면이 말할 수 없다.
  const unknown = input.targets.filter(t => !input.baselines.has(t.localeCode)).map(t => t.localeCode);
  if (unknown.length > 0) return { ok: false, reason: "baseline-unknown", localeCodes: unknown };
  const writes: { localeCode: string; value: string; expectedToken: string }[] = [];
  for (const target of input.targets) {
    const baseline = input.baselines.get(target.localeCode);
    if (baseline === undefined) continue;
    if (baseline.revision !== confirmation.revision) return { ok: false, reason: "baseline-stale" };
    // 값이 같아도 쓴다 — pending 해제가 일어나므로 일반 Save의 no-op과 다르다. needsReview는 건드리지 않는다.
    writes.push({ localeCode: target.localeCode, value: baseline.restoreValue, expectedToken: target.token });
  }
  return { ok: true, writes };
}
