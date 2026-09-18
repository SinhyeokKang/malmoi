import { routes } from "@/lib/routes";

/**
 * 설치 요청(조직의 비관리자)이 관리자 승인을 기다린다는 `?e=` 값. **거부가 아니다** — 그래서
 * `OnboardError`·`ConnectError` union에 넣지 않는다: 넣으면 ① 배너(`danger`)로 서서 실패처럼 읽힌다.
 */
export const INSTALL_REQUESTED = "install-requested";

/**
 * GitHub App Setup URL(`/api/github/setup`)의 목적지 (ARCHITECTURE §6.4).
 *
 * ⚠️ **`installation_id`를 받지 않는다** — `/projects/new`가 사용자 토큰으로 설치 목록을 다시
 * 조회하므로 그 값을 믿을 이유가 없고, 안 읽으면 위조 판정 자체가 사라진다.
 *
 * ⚠️ **`request`에 `afterInstall`("끝나면 새로고침")을 세우지 않는다** — 요청자는 설치를 끝낼 수
 * 없다. 그 문장을 바꾸는 것은 ①이 이 값을 읽는 자리다 (`components/onboarding/steps/repo.tsx`).
 */
export function setupLanding(setupAction: string | null): string {
  switch (setupAction) {
    case "install":
    case "update":
      return routes.newProject();
    case "request":
      return `${routes.newProject()}?e=${INSTALL_REQUESTED}`;
    default:
      return routes.projects();
  }
}
