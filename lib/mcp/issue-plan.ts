import { TOKEN_GRANTS, type TokenGrant } from "./grant";

/**
 * 토큰 발급 판정 (mcp-connector design §3). 입력은 클라이언트가 보내므로 전부 거부 가능해야 한다.
 * 토큰은 불변이라(재발급 = 삭제 + 삽입) 여기서 정한 값이 그 토큰의 일생이다.
 */

/** "없음"은 없다 (2026-09-28 사용자) — 만료 없는 토큰은 만들 수 없다. */
export const API_TOKEN_EXPIRY_DAYS: readonly number[] = [30, 90, 365];

const DAY_MS = 86_400_000;

export type ApiTokenIssuePlan =
  | { status: "ok"; grants: TokenGrant[]; allProjects: boolean; projectIds: string[]; expiresAt: Date }
  | { status: "invalid"; field: "expiresIn" | "grants" | "scope" };

export function planApiTokenIssue(input: {
  expiresInDays: number;
  grants: readonly string[];
  scope: { kind: "all" } | { kind: "projects"; projectIds: readonly string[] };
  /** 호출자의 **현재 멤버십 중 비보관** 프로젝트 id. 호출부가 `userId`로 좁혀 읽는다. */
  memberProjectIds: readonly string[];
  now: Date;
}): ApiTokenIssuePlan {
  if (!API_TOKEN_EXPIRY_DAYS.includes(input.expiresInDays)) return { status: "invalid", field: "expiresIn" };

  // 배열 `includes`라 프로토타입 이름(`__proto__`·`toString`)이 어휘로 읽히지 않는다.
  const vocabulary: readonly string[] = TOKEN_GRANTS;
  if (!input.grants.every(g => vocabulary.includes(g))) return { status: "invalid", field: "grants" };
  const grants = TOKEN_GRANTS.filter(g => input.grants.includes(g));

  const expiresAt = new Date(input.now.getTime() + input.expiresInDays * DAY_MS);
  if (input.scope.kind === "all") return { status: "ok", grants, allProjects: true, projectIds: [], expiresAt };

  // 빈 목록은 아무것도 못 여는 토큰이다 — 멤버십 0이면 고를 것이 없으므로 이 갈래로 떨어진다.
  const projectIds = [...new Set(input.scope.projectIds)];
  if (projectIds.length === 0) return { status: "invalid", field: "scope" };
  if (!projectIds.every(id => input.memberProjectIds.includes(id))) return { status: "invalid", field: "scope" };
  return { status: "ok", grants, allProjects: false, projectIds, expiresAt };
}
