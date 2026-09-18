import type { ConnectError } from "./message";
import type { StateCheck, StateDest } from "./state";

/**
 * `/api/github/callback`의 갈래 판정 (ARCHITECTURE §6.4). **쓰기는 route에 남는다** —
 * `lib/login-link/__tests__/exclusive.test.ts`가 `account.create`의 자리를 그 파일로 고정한다.
 *
 * ⚠️ **state 쿼리가 없는 설치 계열 복귀는 착지만 한다.** GitHub 앱 페이지에서 직접 설치, 리포 선택 Save,
 * 관리자의 요청 승인이 전부 state 없이 돌아온다 — 누가 시작했는지 모르는 왕복이라 code 교환·Account·
 * 요청 기록 어느 것도 쓰지 않는다(POSTMORTEM 2026-09-10). state 쿠키도 **안 지운다**: 다른 탭에서 진행 중인
 * 왕복의 쿠키일 수 있다.
 * ⚠️ **쿼리가 있으면 설치 계열이어도 서명 검증을 지난다** — land-only가 검증을 우회하는 문이 되지 않는다.
 */
export type CallbackInput = {
  setupAction: string | null;
  stateParam: string | null;
  state: StateCheck;
  denied: boolean;
  code: string | null;
};

/** 요청 기록 지시 — `request`로 돌아왔으면 심고, 설치가 끝났으면 지우고, 그 외(Authorize·update)는 모른다. */
export type RequestRecord = "set" | "clear" | "keep";

export type CallbackPlan =
  | { kind: "reject"; dest: StateDest | null; error: ConnectError }
  | { kind: "land-only" }
  | { kind: "link"; dest: StateDest; code: string; request: RequestRecord };

const INSTALL_ACTIONS: ReadonlySet<string> = new Set(["install", "update", "request"]);

export function planCallback(input: CallbackInput): CallbackPlan {
  const { setupAction, stateParam, state, denied, code } = input;

  if (stateParam === null && setupAction !== null && INSTALL_ACTIONS.has(setupAction)) return { kind: "land-only" };

  // state를 믿을 수 없으면 dest도 믿을 수 없다 — 취소여도 어디로 돌아갈지 모르는 것이 먼저다.
  if (state.status !== "ok") return { kind: "reject", dest: null, error: denied ? "denied" : state.status };
  if (denied) return { kind: "reject", dest: state.dest, error: "denied" };
  // code도 error도 없는 요청을 성공으로 읽지 않는다.
  if (code === null || code === "") return { kind: "reject", dest: state.dest, error: "exchange-failed" };

  return { kind: "link", dest: state.dest, code, request: setupAction === "request" ? "set" : setupAction === "install" ? "clear" : "keep" };
}
