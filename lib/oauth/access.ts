import type { OAuthEndpoint } from "./endpoint";

/**
 * OAuth access → 주체 판정 (mcp-oauth design §5 · §6). 개인 토큰의 `planApiTokenUse`와 같은 모양이다 — **없음·만료·다른 환경이 한 갈래**라
 * 401 본문이 갈래를 말하지 않는다. 끊기·재동의·회전된 옛 access는 해시 조회가 비어 `row === null`로 온다.
 *
 * ⚠️ 발급 환경 바인딩은 origin 허용이 아니라 **저장된 issuer/resource와 현재 엔드포인트의 일치**다 — 로컬·preview가 dev DB를 공유해도
 * 다른 origin의 access로 주체를 만들지 않는다(spec 조건 13).
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */
export type OAuthAccessRow = { issuer: string; resource: string; accessExpiresAt: Date; expiresAt: Date };

export function planOAuthAccess(input: { row: OAuthAccessRow | null; now: Date; endpoint: OAuthEndpoint }): { status: "ok" } | { status: "rejected" } {
  const { row, now, endpoint } = input;
  if (row === null) return { status: "rejected" };
  if (row.issuer !== endpoint.issuer || row.resource !== endpoint.resource) return { status: "rejected" };
  // 연결 수명이 access보다 짧아질 수 없게 발급하지만(`accessExpiry`), 저장값을 믿지 않고 둘 다 본다.
  if (row.accessExpiresAt.getTime() <= now.getTime() || row.expiresAt.getTime() <= now.getTime()) return { status: "rejected" };
  return { status: "ok" };
}
