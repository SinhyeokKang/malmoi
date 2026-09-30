import { planOpenPrGate } from "@/lib/protection/plan";
import { NIGHTLY_IMPORT_START_MS } from "@/lib/pull/targets";

/**
 * 야간 판정 (nightly-sync design "야간 판정 순서"). 프로젝트 하나를 Publish / 적재 / 스킵 중 하나로 가른다.
 *
 * **I/O가 0이다.** 껍데기(`runNightly`)는 `need`를 받을 때마다 그 입력만 조회해 다시 부른다 — 그래서 "무엇을
 * 묻지 않는가"가 이 함수에서 정해진다: 미전달 편집이 있으면 head를 묻지 않고(1층 스킵의 "API 0회" 유지), head가
 * 같으면 PR 목록을 묻지 않는다. 조회를 한 번에 몰아 `Promise.all`로 묶지 않는 이유가 그것이다(POSTMORTEM 2026-09-13).
 *
 * ⚠️ **병합이 아니다** — 입력은 편집 토큰 수 · head SHA 동일성 · PR 열림 여부뿐이고 리포 값과 DB 값을 견주지 않는다.
 * head 비교는 "적재할 새 커밋이 있나"이고, **base head 대비**다(sync 브랜치 상태와 섞지 않는다 — POSTMORTEM 2026-09-09).
 */

export type NightlySurface = {
  /** 보관되지 않았다. */
  active: boolean;
  /** 적재에 필요한 포맷 컬럼이 다 있다. */
  formatComplete: boolean;
  lastCommitSha: string | null;
  /**
   * 표면 실패 상태가 있다(`lastImportError`). ⚠️ **SHA 일치를 완전한 적재의 증거로 읽지 않게 한다** — 부분 적재(`partial-import`)도
   * `lastCommitSha`를 전진시키고, 브랜치 부재(#155)를 같은 SHA로 되살리면 실패가 안 지워진다. 이 표면은 같은 head여도 매일 다시 적재한다
   * (2026-09-30 사용자 판정). 대가: 영구히 깨진 로케일 파일이 있으면 밤마다 `partial` 한 행이 선다.
   */
  failed: boolean;
};

export type NightlyInput = {
  pending: number;
  surfaces: readonly NightlySurface[];
  /** base head 조회 결과. 없으면 아직 안 물었다. `ok: false`는 조회가 던졌다. */
  head?: { ok: true; sha: string | null } | { ok: false };
  /**
   * 열린 PR 조회 결과 — **상자에 담는 이유**: "아직 안 물었다"와 "물었는데 확인 못 함(`url: undefined`)"이
   * 같은 `undefined`로 접히면 안 된다. 앞은 `need`, 뒤는 `pr-check-failed`다.
   */
  openPr?: { url: string | null | undefined };
  /** 루프 시작부터의 경과. 적재 시작 마감에만 쓴다. */
  elapsedMs: number;
};

export type NightlyPlan =
  | { action: "publish" }
  | { action: "need"; input: "head" | "open-pr" }
  | { action: "import" }
  | { action: "skip"; outcome: "upToDate" }
  | { action: "skip"; outcome: "deferred"; reason: "open-pr" | "pr-check-failed" }
  /**
   * @param branchMissing base 브랜치가 **정말 없다**(`getRefSha` → `null`) — Publish도 못 도는 영구 설정 문제라 껍데기가 표면 실패 상태를 쓴다(#155).
   *   `false`는 조회가 던졌거나 늦었다 — 일시·설정 실패라 사건만 남긴다(야간이 CI로 건강한 프로젝트를 Home에서 뒤집지 않는다).
   */
  | { action: "skip"; outcome: "failed"; reason: "base-unreadable"; branchMissing: boolean }
  | { action: "none"; counter: "notReady" | "unprocessed" };

export function planNightly(input: NightlyInput): NightlyPlan {
  if (input.pending > 0) return { action: "publish" };

  // ⚠️ 비교 대상을 좁힌다 — `lastCommitSha`가 null이거나 포맷이 불완전한 표면은 적재해도 전진하지 않으므로, 넣으면
  // `upToDate`가 영원히 안 서서 매일 전 표면을 다시 적재한다. 적재 자체는 수동 Sync와 같은 표면 집합을 돈다.
  const compared = input.surfaces.filter((surface) => surface.active && surface.formatComplete && surface.lastCommitSha !== null);
  // ⚠️ 빈 배열의 `every`는 참이다 — 이 줄이 없으면 비교 대상 0개가 `upToDate`로 샌다.
  if (compared.length === 0) return { action: "none", counter: "notReady" };

  if (input.head === undefined) return { action: "need", input: "head" };
  if (!input.head.ok) return { action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing: false };
  if (input.head.sha === null) return { action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing: true };
  const head = input.head.sha;
  // ⚠️ 실패 상태가 남은 표면은 같은 head여도 "받을 것이 없다"가 아니다 — 게이트(PR·마감)는 그대로 지난다.
  if (compared.every((surface) => surface.lastCommitSha === head && !surface.failed)) return { action: "skip", outcome: "upToDate" };

  // ⚠️ **마감 뒤에는 PR을 묻지 않는다** — 루프 예산은 방문 시작 전에만 재므로, 늦게 시작한 방문이 head 대기 + PR 대기를 더 쓰면 `maxDuration`을
  // 넘겨 그 밤의 요약이 사라진다(POSTMORTEM 2026-09-06). 마감 뒤의 PR 조회는 어차피 적재를 못 시작한다 — 사건 없이 미처리로 세고 다음 밤 정렬이 앞으로 가져온다.
  if (input.openPr === undefined) return input.elapsedMs > NIGHTLY_IMPORT_START_MS ? { action: "none", counter: "unprocessed" } : { action: "need", input: "open-pr" };
  const gate = planOpenPrGate({ openPr: input.openPr.url });
  if (gate.action === "defer") return { action: "skip", outcome: "deferred", reason: gate.reason };

  if (input.elapsedMs > NIGHTLY_IMPORT_START_MS) return { action: "none", counter: "unprocessed" };
  return { action: "import" };
}
