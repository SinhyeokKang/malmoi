import { TOKEN_GRANTS, type TokenGrant } from "./grant";

/**
 * `/mcp` 토큰 카드의 판정 (핸드오프 `1a`–`1c`). 페이지(서버)가 행과 멤버십을 읽어 여기 넘기고, 결과만 클라이언트로 간다.
 *
 * ⚠️ **범위는 현재 멤버십(보관 제외)과 교집합한다** (README §10-3) — 발급 뒤 멤버에서 빠진 id는 인가 판정에서 효과가 없으므로
 * 카드의 `{n} projects`와 회전 폼의 채움도 그 id를 세지 않는다. 저장된 값은 건드리지 않는다(토큰은 불변이다).
 */

export type TokenCardView =
  | { state: "none" }
  | {
      state: "active" | "expired";
      grants: TokenGrant[];
      scope: { kind: "all" } | { kind: "projects"; projectIds: string[] };
      createdAt: Date;
      lastUsedAt: Date | null;
      expiresAt: Date;
    };

export function planTokenCard(input: {
  row: { grants: readonly string[]; allProjects: boolean; projectIds: readonly string[]; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date } | null;
  memberProjectIds: readonly string[];
  now: Date;
}): TokenCardView {
  const { row } = input;
  if (row === null) return { state: "none" };
  return {
    // 인증 경계(`planApiTokenUse`)와 같은 `<=` — 카드가 "활성"이라 말하는 순간에 401이 나지 않게.
    state: row.expiresAt.getTime() <= input.now.getTime() ? "expired" : "active",
    grants: TOKEN_GRANTS.filter(g => row.grants.includes(g)),
    scope: row.allProjects ? { kind: "all" } : { kind: "projects", projectIds: row.projectIds.filter(id => input.memberProjectIds.includes(id)) },
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  };
}
