import type { ConnectionHealth } from "@/lib/github-connect/health";
import type { ImportFailureCode } from "@/lib/projects/import-status";
import { failing } from "@/lib/projects/list";
import type { SummaryQueue } from "@/lib/projects/list";

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
  const { status } = input.connection;
  if (status === "not-connected" || status === "app-uninstalled" || status === "installation-changed" || status === "repo-replaced") {
    return "not_connected";
  }
  // "지금 돌고 있다"가 "지난번에 실패했다"를 이긴다 — 목록·설정과 **같은 술어**다.
  if (input.surfaces.some((surface) => failing(surface))) return "import_failed";
  const { newFromGithub, toTranslate, toReview, toSend } = input.counts;
  return newFromGithub + toTranslate + toReview + toSend === 0 ? "empty" : "default";
}
