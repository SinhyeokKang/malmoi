import type { ConnectionHealth } from "@/lib/github-connect/health";
import type { ConnectionProblem } from "@/lib/home/state";
import type { StateKey } from "@/lib/status/canon";

/**
 * Settings 연결 행의 상태 키 — 배지와 아이콘 칸이 이것 하나에서 톤을 읽는다(DESIGN §2.4 연결 행 · ux-drift-unify 1-Y15).
 *
 * ⚠️ **끊김·미연결·다른 리포는 `problem`(= `connectionProblem`)을 그대로 옮긴다** — Home·목록과 같은 판정이어야 하고
 * (D1), 여기서 다시 가르면 `unpinned`가 한 화면에서만 다른 낱말이 된다. 이 카드가 덧붙이는 것은 `repo-moved`(이름만 바뀐
 * 연결됨)와 `unknown`(확인 실패) 둘뿐이다. `problem`을 인자로 받는 것은 `cross-screen.test.ts`가 판정 하나를 갈아 끼워
 * 이 칸까지 red가 나는지 보기 위해서다.
 */
export function repositoryConnectionState(status: ConnectionHealth["status"], problem: ConnectionProblem | null): StateKey {
  if (problem === "not-connected") return "notConnected";
  if (problem === "disconnected") return "disconnected";
  if (problem === "wrong-repository") return "wrongRepository";
  if (status === "unknown") return "couldNotCheck";
  return "connected";
}
