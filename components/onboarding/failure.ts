import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

/**
 * 세 union을 다 읽는다 — Action이 `OnboardError`를, callback 경유가 `ConnectError`를, 인가가
 * `AccessError`를 낸다. **한쪽만 보면 그 사유가 통째로 무음이다** (POSTMORTEM 2026-09-06).
 * 모르는 값에 던지지 않는다: Action이 갈래를 늘려도 화면이 죽지 않아야 한다.
 */
export function failureText(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return m.newProject.result.failed;
}

/**
 * 예외 J — 세션 만료·인가 거부. **모달을 닫지도 `router.refresh()`를 부르지도 않는다**: 모달이
 * 클라이언트 상태를 들고 있어 씻기면 ①~③의 입력이 통째로 사라진다 (POSTMORTEM 2026-09-08).
 */
export function isSessionLost(error: string): boolean {
  return error === "unauthorized" || (isAccessError(error) && error === "unauthorized");
}
