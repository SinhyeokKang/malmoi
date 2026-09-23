import { planInvitationCreate } from "@/lib/auth/invitation";

import { ADDRESS_INTERVAL_MS, INVITATION_HOURLY_LIMIT, PROJECT_WINDOW_MS } from "./limits";

export { ADDRESS_INTERVAL_MS, INVITATION_HOURLY_LIMIT, PROJECT_WINDOW_MS };

/**
 * 초대 발급 판정 (docs/features/invitation-email design §3). **요청 전체가 통과하거나 전체가 막힌다** —
 * 배열 순서로 일부만 보내면 "누구에게 갔나"를 설명할 화면이 필요해지고, 그 화면을 만들지 않기로 했다.
 *
 * ⚠️ 입력은 전부 `Project` 행 잠금 **안에서** 읽은 값이어야 한다 — 밖에서 세면 동시 요청이 마지막
 * 한도 자리를 둘 다 가져간다(`planInvitationCreate`와 같은 형).
 */

export type IssueTarget = {
  alreadyMember: boolean;
  /** 이 주소의 마지막 발급 시각. 수락·철회·만료된 초대도 포함한다 — 빼면 철회→재발급이 간격을 우회한다. */
  lastIssuedAt: Date | null;
};

export type IssueRowError = { index: number; code: "already-member" };

export type IssuePlan =
  | { status: "ok" }
  | { status: "member-limit"; limit: number }
  | { status: "too-many"; limit: number }
  | { status: "invalid-rows"; rowErrors: IssueRowError[] }
  | { status: "rate-limited"; retryAt: Date };

/**
 * 판정 순서는 "사용자가 무엇을 해야 풀리나"다 — 좌석·요청 크기(입력을 고쳐도 안 풀림) → 행 오류(고치면 풀림)
 * → 제한(기다리면 풀림). 기다린 뒤에 행 오류를 처음 보는 왕복을 만들지 않는다.
 */
export function planInvitationIssue(input: {
  now: Date;
  memberCount: number;
  targets: readonly IssueTarget[];
  /** 프로젝트의 최근 발급 시각들. 창 밖 값이 섞여 있어도 되고 정렬하지 않아도 된다. */
  recentIssues: readonly Date[];
}): IssuePlan {
  const seat = planInvitationCreate({ memberCount: input.memberCount });
  if (seat.status !== "ok") return seat;

  const count = input.targets.length;
  if (count > INVITATION_HOURLY_LIMIT) return { status: "too-many", limit: INVITATION_HOURLY_LIMIT };

  const rowErrors: IssueRowError[] = [];
  input.targets.forEach((t, index) => {
    if (t.alreadyMember) rowErrors.push({ index, code: "already-member" });
  });
  if (rowErrors.length > 0) return { status: "invalid-rows", rowErrors };

  const now = input.now.getTime();
  let retryAt = now;

  for (const t of input.targets) {
    if (t.lastIssuedAt === null) continue;
    const open = t.lastIssuedAt.getTime() + ADDRESS_INTERVAL_MS;
    if (open > now) retryAt = Math.max(retryAt, open);
  }

  // 정각은 창 밖이다(`>`). 미래 시각(서버 간 시계 차)도 창 안으로 센다 — 빼면 그만큼 한도가 늘어난다.
  const inWindow = input.recentIssues
    .map((d) => d.getTime())
    .filter((t) => t > now - PROJECT_WINDOW_MS)
    .sort((a, b) => a - b);
  const excess = inWindow.length + count - INVITATION_HOURLY_LIMIT;
  if (excess > 0) {
    // 가장 오래된 `excess`건이 창을 벗어나야 이번 요청 전체가 들어간다.
    const leaving = inWindow[excess - 1];
    if (leaving !== undefined) retryAt = Math.max(retryAt, leaving + PROJECT_WINDOW_MS);
  }

  return retryAt > now ? { status: "rate-limited", retryAt: new Date(retryAt) } : { status: "ok" };
}
