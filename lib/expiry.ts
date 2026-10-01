/**
 * 만료 경계 (ux-drift-unify 6-⚪14) — 초대·MCP 토큰이 이것 하나를 쓴다. **정각은 이미 만료다** — 유효 구간을 만료 이전까지로 닫는다.
 * 인증 경계(`planApiTokenUse`)와 카드 표시(`lib/mcp/view.ts`)가 같은 식이라야 카드가 "활성"이라 말하는 순간에 401이 나지 않는다.
 * ⚠️ OAuth(`lib/oauth/*`·`lib/oauth-server/*`)의 인라인 비교는 범위 밖이다(spec Q14).
 */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
