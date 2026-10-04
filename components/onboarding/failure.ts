import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

/**
 * 세 union을 다 읽는다 — Action이 `OnboardError`를, callback 경유가 `ConnectError`를, 인가가
 * `AccessError`를 낸다. **한쪽만 보면 그 사유가 통째로 무음이다** (POSTMORTEM 2026-09-06).
 * 모르는 값에 던지지 않는다: Action이 갈래를 늘려도 화면이 죽지 않아야 한다.
 */
export function failureText(error: string, created = false): string {
  if (error === "unauthorized") return created ? m.newProject.errors.sessionLostAfterCreate : m.newProject.errors.sessionLost;
  if (isOnboardError(error)) return onboardErrorMessage(m, error);
  if (isConnectError(error)) return connectErrorMessage(m, error);
  if (isAccessError(error)) return accessErrorMessage(m, error);
  return m.newProject.result.failed;
}

/**
 * 예외 J — 세션 만료·인가 거부. **모달을 닫지도 `router.refresh()`를 부르지도 않는다**: 모달이
 * 클라이언트 상태를 들고 있어 씻기면 ①~③의 입력이 통째로 사라진다 (POSTMORTEM 2026-09-08).
 */
export function isAccessLost(error: string): boolean {
  return ["unauthorized", "forbidden", "not-found", "not-connected", "reauthorize",
    "repo-not-installed", "installation-forbidden", "repo-forbidden", "repo-read-only"].includes(error);
}

/**
 * `isAccessLost` 중 **리포 한 곳의** 거부 — 다른 리포를 고르면 풀린다. ①에서는 고른 행 아래에만 서고 모달 상단
 * 배너로 올리지 않는다(malmoi#122 — 둘 다 세우면 같은 문장이 한 화면에 두 번이다).
 */
export function isRepoScopedRefusal(error: string): boolean {
  return ["repo-not-installed", "installation-forbidden", "repo-forbidden", "repo-read-only"].includes(error);
}
