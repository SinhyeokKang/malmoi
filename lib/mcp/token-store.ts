import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { logFailure } from "@/lib/github-connect/log";

import { TOKEN_GRANTS, type ApiTokenAuthority, type TokenGrant } from "./grant";
import { API_TOKEN_PREFIX, hashApiToken, planApiTokenUse, shouldTouch } from "./token";

/**
 * Bearer → 서버 주체 (mcp-connector design §1.2 · §1.25). **인가의 입구는 여기 하나다** — `app/__tests__/exempt-route-guards.test.ts`가
 * `/api/mcp` route의 이 호출을 센다.
 *
 * 주체의 `tokenId`는 **`tokenHash`**다(2026-09-28 결정 — `id` 컬럼이 없고 `userId`가 PK다). 쓰기 코어가 잠금 뒤 `userId` AND
 * `tokenHash`로 다시 읽어, 대기 중 재발급(같은 `userId`, 새 해시)된 토큰을 거부한다.
 *
 * ⚠️ **조회 장애는 던진다** — `null`(401)로 접으면 DB 장애가 "토큰이 무효"로 읽히고 에이전트가 사용자에게 재발급을 권한다
 * (POSTMORTEM 2026-09-06 "세션 없음과 못 읽었다는 다르다"와 같은 축).
 */

export type ApiTokenSubject = ApiTokenAuthority & { tokenId: string };

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

  // DB 값을 권한으로 그대로 믿지 않는다 — 어휘 밖 문자열은 버린다(배열 `includes`라 프로토타입 이름도 안 통한다).
  const vocabulary: readonly string[] = TOKEN_GRANTS;
  const grants = row.grants.filter((g): g is TokenGrant => vocabulary.includes(g));
  return {
    userId: row.userId,
    tokenId: row.tokenHash,
    grants,
    scope: row.allProjects ? { kind: "all" } : { kind: "projects", projectIds: row.projectIds },
  };
}
