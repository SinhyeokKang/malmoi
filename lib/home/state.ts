import type { ConnectionHealth } from "@/lib/github-connect/health";
import { importFailureTone } from "@/lib/projects/import-failure";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import { failing } from "@/lib/projects/list";
import type { SummaryQueue } from "@/lib/projects/list";
import type { StateKey } from "@/lib/status/canon";

/**
 * Home이 그리는 화면 갈래 (캔버스 `2a`~`2d` · DESIGN §6.64).
 *
 * ⚠️ **로딩(`2e`)이 여기 없다.** 그것은 데이터 상태가 아니라 라우트의 `loading.tsx`이고, 값으로
 * 두면 **생산자가 없는 갈래**가 하나 남는다 — 이 리포는 그런 union을 만들지 않는다(`listBody`가
 * 도달 불가 갈래에 `throw`를 세운 것과 같은 규칙).
 *
 * ⚠️ **`empty`를 `counts.x === 0` 검사로 흩지 않는 이유**: 여섯 상태 × 화면 요소의 매트릭스가
 * DESIGN §6.64의 아트보드 표이고, 그 표를 테스트가 전수로 들려면 **판정이 값 하나여야 한다.** JSX 안에 흩으면
 * "빈 상태에서 저 블록이 무엇이 되나"를 화면을 읽어야만 알 수 있다.
 */
export type HomeState = "archived" | "not_connected" | "import_failed" | "empty" | "default";

/**
 * ⚠️ **순서가 곧 우선순위다.** 둘이 동시에 참인 조합이 실제로 있다 — 보관된 프로젝트의 App이
 * 제거됐거나, 미연결인 채 지난 임포트가 실패로 남아 있거나.
 *
 * ⚠️ **연결을 모르는 것(`unknown`)을 미연결로 접지 않는다.** 접으면 GitHub 장애가 "App이
 * 제거됐다"로 읽히고 사용자가 재설치하러 간다 — `planConnectionHealth`가 조회 실패를
 * `app-uninstalled`로 접지 않는 것과 정확히 같은 축이다 (POSTMORTEM 2026-09-03 · 09-06).
 *
 * ⚠️ **`repo-moved`는 미연결이 아니다.** 그 상태에서도 Sync·Publish가 돌기 때문에 "일시 정지"라고
 * 말하면 거짓이다 — 새 주소를 확인하라는 안내는 설정 화면이 든다.
 *
 * ⚠️ **`installation-changed`는 미연결이다** (#52). `createGitClient`가 **저장된** `installationId`로
 * 토큰을 받으므로 재설치로 옛 설치가 사라지면 모든 호출이 404다 — "돈다"로 읽으면 Home이 빈 상태와
 * 켜진 Publish를 띄우고, 누른 사람은 [Reconnect]로 가는 길 없이 재시도만 반복한다.
 */
export function planHomeState(input: {
  archived: boolean;
  connection: ConnectionHealth;
  surfaces: readonly { importError: ImportFailureCode | null; importing: boolean }[];
  counts: SummaryQueue;
}): HomeState {
  if (input.archived) return "archived";
  if (blocksActions(input.connection.status)) return "not_connected";
  // "지금 돌고 있다"가 "지난번에 실패했다"를 이긴다 — 목록·설정과 **같은 술어**다.
  if (input.surfaces.some((surface) => failing(surface))) return "import_failed";
  const { newFromGithub, toTranslate, toReview, toSend } = input.counts;
  return newFromGithub + toTranslate + toReview + toSend === 0 ? "empty" : "default";
}

/** 이 연결로는 Sync·Publish가 돌 수 없다 — `planHomeState`의 `not_connected`와 `planActionAvailability`가 같은 술어를 쓴다. */
function blocksActions(status: ConnectionHealth["status"]): boolean {
  return status === "not-connected" || status === "unpinned" || status === "app-uninstalled" || status === "installation-changed" || status === "repo-replaced";
}

/**
 * **Publish·Sync를 켤 수 있나** (ux-drift-unify §3.3 · 🔴 F) — Home과 번역 화면이 이것 하나를 부른다. 번역 화면이 끊김에도 둘을 켜 두어
 * #52(누르면 실패만 반복되고 [Reconnect]로 가는 길이 없다)의 재발 경로였다.
 *
 * ⚠️ **모름(`unknown`)은 끄지 않는다** — `planHomeState`가 조회 실패를 미연결로 접지 않는 것과 같은 축이다. 누르면 서버가 어차피 다시 판정한다.
 * ⚠️ 둘이 지금은 같은 값이지만 필드를 가른 것은 소비자가 둘을 따로 그리기 때문이다(Home 머리 · 번역 화면 툴바).
 */
export function planActionAvailability(input: { archived: boolean; connection: ConnectionHealth["status"] }): { publish: boolean; sync: boolean } {
  const on = !input.archived && !blocksActions(input.connection);
  return { publish: on, sync: on };
}

/**
 * 연결 문제의 **갈래** (2026-09-30 상태 통일) — Home이 넷을 `not_connected` 하나로 접으면서 배너 문구·색이 한 벌이었다.
 * 톤: 미연결(설치 없음) 회색 · 끊김(App 제거·재설치·리포 id 미고정 — 재연결 필요) 호박 · 다른 리포(repo-replaced) 빨강.
 * **설정 화면의 배지가 이 함수를 부른다** — 목록의 `needs_reconnect`(설치 있음 + 리포 id 없음)와 같은 결론이다(ux-drift-unify D1).
 */
export type ConnectionProblem = "not-connected" | "disconnected" | "wrong-repository";

export function connectionProblem(status: ConnectionHealth["status"]): ConnectionProblem | null {
  if (status === "not-connected") return "not-connected";
  if (status === "unpinned" || status === "app-uninstalled" || status === "installation-changed") return "disconnected";
  if (status === "repo-replaced") return "wrong-repository";
  return null;
}

const PROBLEM_STATE = { "not-connected": "notConnected", disconnected: "disconnected", "wrong-repository": "wrongRepository" } as const satisfies Record<ConnectionProblem, StateKey>;

/** 연결 갈래 → 상태 키 — Home 배너·메타 열 배지가 같은 낱말·톤을 쓴다(설정 카드와 같은 `STATE` 행). */
export function connectionState(problem: ConnectionProblem): (typeof PROBLEM_STATE)[ConnectionProblem] {
  return PROBLEM_STATE[problem];
}

/** 적재 실패 코드 → 상태 키 — 일부 반영은 "실패"가 아니다(🔴 A2, DESIGN §2.4). Home 배너·메타 열이 같은 낱말을 쓰게 한 자리에서 가른다. */
export function failureState(code: ImportFailureCode): "syncFailed" | "partiallySynced" {
  return importFailureTone(code) === "danger" ? "syncFailed" : "partiallySynced";
}

/**
 * **Home 배너가 말하는 상태 하나** (DESIGN §2.4) — `HomeNotices`가 이 키로 배너를 고르고, 교차 테스트(`lib/status/__tests__/cross-screen.test.ts`)가
 * 목록 칩·Settings 배지와 같은 키인지 센다. 전에는 갈래가 컴포넌트 JSX에 있어 테스트가 사본을 들었다.
 * @param failure 배너가 지목하는 표면의 실패 코드(`worstFailingSurface`) — `import_failed`에서만 읽는다.
 */
export function homeBannerState(input: { state: HomeState; problem: ConnectionProblem | null; failure: ImportFailureCode | null }): StateKey | null {
  if (input.state === "archived") return "archived";
  if (input.state === "not_connected") return input.problem === null ? null : connectionState(input.problem);
  if (input.state === "import_failed") return input.failure === null ? null : failureState(input.failure);
  return null;
}
