/**
 * 설치 요청 대기 판정 (install-and-connect). **대기** = `Account(github-app).installRequestedAt`가 있고, 그
 * 시각 **이후에** 생긴 설치가 사용자 설치 목록에 없다. GitHub은 거절을 요청자에게 알리지 않으므로 만료는 없다.
 *
 * ⚠️ **거부 union(`OnboardError`)에 넣지 않는다** — 넣으면 `?e=install-pending`이 ① danger 배너 후보가 되고,
 * `satisfies` 사전 맵이 union·문구를 한 커밋에 묶는다(POSTMORTEM 2026-09-06). 그래서 결과가 플래그 둘이다.
 */
export type PendingInput = {
  listResult: { ok: true } | { ok: false; error: string };
  requestedAt: Date | null;
  installations: readonly { id: string; createdAt: Date }[];
};

export type PendingPlan = { pending: boolean; clearRequest: boolean };

/** 대기를 말할 수 있는 결과 — 장애·토큰 상태는 기록과 무관하게 그대로 간다. */
const WAITABLE: ReadonlySet<string> = new Set(["no-installations", "no-repos"]);

export function planPending({ listResult, requestedAt, installations }: PendingInput): PendingPlan {
  if (requestedAt === null) return { pending: false, clearRequest: false };
  if (!listResult.ok && !WAITABLE.has(listResult.error)) return { pending: false, clearRequest: false };
  // 같은 시각은 승인이 아니다 — 요청 직전의 설치를 승인으로 읽지 않는다.
  if (installations.some((i) => i.createdAt.getTime() > requestedAt.getTime())) return { pending: false, clearRequest: true };
  return { pending: true, clearRequest: false };
}
