import { m } from "@/lib/i18n";

/**
 * `?sessionRevocation=` → 문구 (account-settings 태스크 5·10).
 *
 * ⚠️ **인자가 `string | undefined`다 — union이 아니다.** 주소창 값이고, 단언으로 좁히면 "모르는
 * 값에는 문구를 내지 않는다"가 검사에서 지워진다 (POSTMORTEM 2026-09-08).
 *
 * ⚠️ **사전 조회가 아니라 분기다.** 갈래가 다섯인데 문구는 넷이라(할 일이 같은 둘이 접힌다)
 * 사전 하나로 대응시킬 수 없고, 조회로 만들면 `Object.hasOwn` 없이 프로토타입 키가 문자열 자리에
 * 함수를 넣는 그 부류가 다시 생긴다.
 *
 * ⚠️ **제출 실패는 여기 없다** — 그것은 주소창이 아니라 컴포넌트의 상태이고, 문구만 `failed`를
 * 공유한다.
 */
export function sessionRevocationMessage(outcome: string | undefined): string | null {
  const SESSIONS = m.account.sessions;
  if (outcome === "cancelled") return SESSIONS.cancelled;
  if (outcome === "wrong-account") return SESSIONS.wrongAccount;
  if (outcome === "expired") return SESSIONS.expired;
  if (outcome === "invalid" || outcome === "unavailable") return SESSIONS.failed;
  return null;
}
