/**
 * GitLab PAT의 만료 판정 (gitlab-repositories D11 · design §2 톤 표). **저장한 `expiresAt`만 본다** — 원격 호출 0이다. GitLab의
 * `expires_at`은 날짜이고 그날 자정(UTC)에 만료되며 저장값이 그 시각이다. 만료일이 없는 토큰(셀프 매니지드 설정)은 `valid`다.
 *
 * ⚠️ **잎이다** — 클라이언트(`/account` 카드)와 서버(목록·Inbox 사전 판정)가 같은 함수를 쓴다. 경계를 화면마다 다시 쓰지 않는다.
 */
export const EXPIRES_SOON_DAYS = 14;

export type TokenExpiryState = "valid" | "expiresSoon" | "expired";

export function tokenExpiryState(expiresAt: Date | null, now: Date): TokenExpiryState {
  if (expiresAt === null) return "valid";
  const left = expiresAt.getTime() - now.getTime();
  if (left <= 0) return "expired";
  return left <= EXPIRES_SOON_DAYS * 86_400_000 ? "expiresSoon" : "valid";
}
