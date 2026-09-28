/**
 * **서버가 구성한 호출 주체** (mcp-connector design §1.25). Server Action은 세션에서, MCP 진입점은 Bearer 토큰에서 만든다 —
 * 둘이 같은 코어를 부르고, 코어는 이것만 믿는다.
 *
 * ⚠️ **클라이언트 입력으로 받지 않는다** — 입력 스키마가 `userId`를 모른다. 사용자 축 조회는 전부 이 `userId`로 좁힌다
 * (POSTMORTEM 2026-09-06).
 */
export type Subject = {
  userId: string;
  /**
   * MCP 경로만 — `ApiToken.tokenHash`. 쓰기 tx가 잠금 뒤 그 행을 다시 읽는다(`lockProjectAccess`). 세션 경로엔 없다.
   * ⚠️ 행의 키(`userId`)가 아니라 해시다 — 대기 중 재발급된 새 토큰의 권한으로 옛 토큰의 쓰기가 통과하지 않게 한다.
   */
  tokenId?: string;
};
