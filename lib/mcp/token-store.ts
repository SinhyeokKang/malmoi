import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Credential } from "@/lib/auth/subject";
import { logFailure } from "@/lib/github-connect/log";
import { planOAuthAccess } from "@/lib/oauth/access";
import { OAUTH_ACCESS_PREFIX, resolveBearerKind } from "@/lib/oauth/bearer";
import type { OAuthEndpoint } from "@/lib/oauth/endpoint";

import { TOKEN_GRANTS, type ApiTokenAuthority, type TokenGrant } from "./grant";
import { API_TOKEN_PREFIX, hashApiToken, planApiTokenUse, shouldTouch } from "./token";

/**
 * Bearer → 서버 주체 (mcp-connector design §1.2 · §1.25 · mcp-oauth design §5). **인가의 입구는 `resolveBearer` 하나다** —
 * `app/__tests__/exempt-route-guards.test.ts`가 `/api/mcp` route의 이 호출을 센다. 두 자격증명이 **같은 `ApiTokenAuthority`**를 내므로
 * 도구의 인가 판정(`planToolAccess`·잠금 뒤 재판정)은 종류를 모른다.
 *
 * 주체의 `credential`은 **`{ kind: "api-token", tokenHash }`**다(2026-09-28 결정 — `id` 컬럼이 없고 `userId`가 PK다). 쓰기 코어가 잠금 뒤 `userId` AND
 * `tokenHash`로 다시 읽어, 대기 중 재발급(같은 `userId`, 새 해시)된 토큰을 거부한다.
 *
 * ⚠️ **조회 장애는 던진다** — `null`(401)로 접으면 DB 장애가 "토큰이 무효"로 읽히고 에이전트가 사용자에게 재발급을 권한다
 * (POSTMORTEM 2026-09-06 "세션 없음과 못 읽었다는 다르다"와 같은 축).
 */

export type ApiTokenSubject = ApiTokenAuthority & { credential: Credential };

export async function resolveApiToken(prisma: Pick<PrismaClient, "apiToken">, token: string, now: Date): Promise<ApiTokenSubject | null> {
  // 접두가 다르면 우리 토큰이 아니다 — push 토큰을 잘못 붙인 설정이 DB를 두드리지 않게.
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;
  const tokenHash = hashApiToken(token);
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash },
    select: { userId: true, tokenHash: true, grants: true, allProjects: true, projectIds: true, expiresAt: true, lastUsedAt: true },
  });
  if (planApiTokenUse({ row, now }).status !== "ok" || row === null) return null;

  if (shouldTouch(row.lastUsedAt, now)) {
    try {
      // `userId` AND `tokenHash` — 그 사이 재발급된 새 행의 사용 시각을 옛 토큰이 찍지 않는다.
      await prisma.apiToken.updateMany({ where: { userId: row.userId, tokenHash: row.tokenHash }, data: { lastUsedAt: now } });
    } catch (error) {
      // 사용 시각은 표시용이다 — 그 쓰기가 실패했다고 인증된 호출을 막지 않는다.
      logFailure("mcp-token-touch", error);
    }
  }

  return authorityOf(row, { kind: "api-token", tokenHash: row.tokenHash });
}

/**
 * OAuth access(`mlo_`) → 주체. 조회는 access 해시 → 연결 하나이고, 주체의 `credential`은 **연결 id**다(잠금 뒤 재읽기의 키 — `lockCredential`).
 * 저장된 issuer/resource가 **현재 엔드포인트**와 맞아야 한다 — DB를 공유하는 다른 origin의 access를 받지 않는다(spec 조건 13).
 * ⚠️ 조회 장애는 던진다 — 개인 토큰과 같은 축이다.
 */
export async function resolveOAuthAccess(
  prisma: Pick<PrismaClient, "oAuthConnection">, token: string, now: Date, endpoint: OAuthEndpoint,
): Promise<ApiTokenSubject | null> {
  if (!token.startsWith(OAUTH_ACCESS_PREFIX)) return null;
  const row = await prisma.oAuthConnection.findUnique({
    where: { accessTokenHash: hashApiToken(token) },
    select: {
      id: true, userId: true, issuer: true, resource: true, grants: true, allProjects: true, projectIds: true,
      accessExpiresAt: true, expiresAt: true, lastUsedAt: true,
    },
  });
  if (planOAuthAccess({ row, now, endpoint }).status !== "ok" || row === null) return null;

  if (shouldTouch(row.lastUsedAt, now)) {
    try {
      // 연결 id — 사이에 refresh가 access를 회전했어도 같은 연결의 사용이다. 재동의된 새 연결(새 id)은 건드리지 않는다.
      await prisma.oAuthConnection.updateMany({ where: { id: row.id, userId: row.userId }, data: { lastUsedAt: now } });
    } catch (error) {
      logFailure("mcp-oauth-touch", error);
    }
  }
  return authorityOf(row, { kind: "oauth", connectionId: row.id });
}

/**
 * **접두로 먼저 가른다** — 한 Bearer가 두 테이블을 두드리지 않고, 모르는 접두(refresh `mlr_`·push 토큰)는 조회 0건이다(`resolveBearerKind`).
 * `endpoint`가 없으면(허용 밖 호스트) OAuth 바인딩이 성립하지 않으므로 OAuth는 거부한다 — 개인 토큰은 발급 환경에 묶이지 않아 그대로다.
 */
export async function resolveBearer(
  prisma: Pick<PrismaClient, "apiToken" | "oAuthConnection">, token: string, now: Date, endpoint: OAuthEndpoint | null,
): Promise<ApiTokenSubject | null> {
  const kind = resolveBearerKind(token);
  if (kind === "api-token") return resolveApiToken(prisma, token, now);
  if (kind === "oauth" && endpoint !== null) return resolveOAuthAccess(prisma, token, now, endpoint);
  return null;
}

function authorityOf(row: { userId: string; grants: string[]; allProjects: boolean; projectIds: string[] }, credential: Credential): ApiTokenSubject {
  // DB 값을 권한으로 그대로 믿지 않는다 — 어휘 밖 문자열은 버린다(배열 `includes`라 프로토타입 이름도 안 통한다).
  const vocabulary: readonly string[] = TOKEN_GRANTS;
  const grants = row.grants.filter((g): g is TokenGrant => vocabulary.includes(g));
  return {
    userId: row.userId,
    credential,
    grants,
    scope: row.allProjects ? { kind: "all" } : { kind: "projects", projectIds: row.projectIds },
  };
}
