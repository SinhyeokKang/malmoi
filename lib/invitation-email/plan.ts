import { planInvitationCreate } from "@/lib/auth/invitation";

import { ADDRESS_INTERVAL_MS, INVITATION_HOURLY_LIMIT, PROJECT_WINDOW_MS, USER_HOURLY_LIMIT } from "./limits";

export { ADDRESS_INTERVAL_MS, INVITATION_HOURLY_LIMIT, PROJECT_WINDOW_MS, USER_HOURLY_LIMIT };

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
  /**
   * 사유는 `retryAt`을 정한 쪽이다 — 문구가 다르다(주소면 그 주소를, 프로젝트·발급자면 그 기준의 최근 1시간
   * 발급 수를 든다). `index`는 가장 늦게 풀리는 대상의 입력 인덱스다.
   */
  | { status: "rate-limited"; retryAt: Date; limit: "address"; index: number }
  | { status: "rate-limited"; retryAt: Date; limit: "project" | "user"; used: number };

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
  /** 발급자의 최근 발급 시각들 — 전 프로젝트. 규칙은 `recentIssues`와 같다. */
  userRecentIssues: readonly Date[];
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
  let address: { at: number; index: number } | null = null;
  for (const [index, t] of input.targets.entries()) {
    if (t.lastIssuedAt === null) continue;
    const open = t.lastIssuedAt.getTime() + ADDRESS_INTERVAL_MS;
    if (open > now && (address === null || open > address.at)) address = { at: open, index };
  }

  const project = windowOpensAt(input.recentIssues, count, INVITATION_HOURLY_LIMIT, now);
  const user = windowOpensAt(input.userRecentIssues, count, USER_HOURLY_LIMIT, now);
  // 둘 다 막으면 더 늦게 풀리는 쪽이 사유다. 같으면 프로젝트 — 이 화면의 맥락이 프로젝트다.
  const window =
    user !== null && (project === null || user.at > project.at)
      ? { ...user, limit: "user" as const }
      : project === null ? null : { ...project, limit: "project" as const };

  if (window !== null && (address === null || window.at >= address.at)) {
    return { status: "rate-limited", retryAt: new Date(window.at), limit: window.limit, used: window.used };
  }
  if (address !== null) {
    return { status: "rate-limited", retryAt: new Date(address.at), limit: "address", index: address.index };
  }
  return { status: "ok" };
}

/** 최근 1시간 창에 `count`건이 더 들어갈 수 있는 시각. 지금 들어가면 `null`. */
function windowOpensAt(issues: readonly Date[], count: number, limit: number, now: number): { at: number; used: number } | null {
  // 정각은 창 밖이다(`>`). 미래 시각(서버 간 시계 차)도 창 안으로 센다 — 빼면 그만큼 한도가 늘어난다.
  const inWindow = issues
    .map((d) => d.getTime())
    .filter((t) => t > now - PROJECT_WINDOW_MS)
    .sort((a, b) => a - b);
  const excess = inWindow.length + count - limit;
  // 가장 오래된 `excess`건이 창을 벗어나야 이번 요청 전체가 들어간다.
  const leaving = excess > 0 ? inWindow[excess - 1] : undefined;
  return leaving === undefined ? null : { at: leaving + PROJECT_WINDOW_MS, used: inWindow.length };
}
