import { clientIdLabel } from "@/lib/oauth/client-metadata";

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

/**
 * `/mcp` Connected apps 행 (mcp-oauth 핸드오프 §7.3 · spec 조건 8). 토큰 카드와 같은 판정(만료 `<=` · grant 어휘 순서 · 멤버십 교집합)을 쓴다 —
 * 같은 권한이 두 카드에서 다르게 읽히지 않게. 이름은 클라이언트가 정한 스냅샷이라 신원 보증이 아니다 — 식별 줄을 함께 싣는다.
 */
export type ConnectedAppView = {
  id: string;
  name: string;
  ident: string;
  state: "active" | "expired";
  grants: TokenGrant[];
  scope: { kind: "all" } | { kind: "projects"; projectIds: string[] };
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
};

export function planConnectedApps(input: {
  rows: readonly {
    id: string; clientId: string; clientName: string | null; grants: readonly string[]; allProjects: boolean; projectIds: readonly string[];
    createdAt: Date; lastUsedAt: Date | null; expiresAt: Date;
  }[];
  memberProjectIds: readonly string[];
  now: Date;
}): ConnectedAppView[] {
  const views = input.rows.map((row): ConnectedAppView => ({
    id: row.id,
    name: row.clientName ?? row.clientId,
    ident: clientIdLabel(row.clientId),
    state: row.expiresAt.getTime() <= input.now.getTime() ? "expired" : "active",
    grants: TOKEN_GRANTS.filter(g => row.grants.includes(g)),
    scope: row.allProjects ? { kind: "all" } : { kind: "projects", projectIds: row.projectIds.filter(id => input.memberProjectIds.includes(id)) },
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  }));
  // 정렬(핸드오프 §7.3): 마지막 사용 최신 → 사용 없음(연결일 최신) → 만료. 만료가 맨 아래라 살아 있는 연결이 먼저 읽힌다.
  const rank = (v: ConnectedAppView) => (v.state === "expired" ? 2 : v.lastUsedAt === null ? 1 : 0);
  const time = (v: ConnectedAppView) => (v.lastUsedAt ?? v.createdAt).getTime();
  return views.sort((a, b) => rank(a) - rank(b) || time(b) - time(a) || a.id.localeCompare(b.id));
}
