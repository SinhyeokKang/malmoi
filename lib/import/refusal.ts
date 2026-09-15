import { isAccessError } from "@/lib/auth/message";

import type { RepositoryImportError } from "./result";

/**
 * 거부 Alert의 표시 계약 (시안 `4f`).
 *
 * ⚠️ **거부는 Alert이고 Dialog 안이 아니다** — 게이트 여섯은 확인을 누른 **뒤**에 돌므로, 답을
 * Dialog 안에 띄우면 이미 답한 질문 위에 새 문장이 얹히고 사람이 "닫아도 되는지"를 다시 판단해야
 * 한다. 결과와 거부가 같은 한 자리에 서서 한 번 누른 일의 답이 두 곳에 나지 않는다.
 *
 * ⚠️ **사전 비활성화를 만들지 않는다** — `not-ready`·`not-connected`는 렌더 시점에 알 수 있지만
 * 그것으로 트리거를 끄지 않는다. 비활성 버튼은 이유를 말하지 못하고, 이 기능은 이미 "부재가
 * 결정"(EDITOR에게 버튼이 없다)을 들고 있다. 예외는 **자기 실행 중**뿐이다.
 */
export type ImportRefusalPlan = {
  /** ⚠️ **"다시 누르면 되나"로 갈린다** — 기다리면 풀리는 것만 info다. */
  tone: "info" | "warning" | "danger";
  /** ⚠️ 닫아도 같은 버튼이 같은 거부를 반복하는 갈래에는 닫기를 주지 않는다. */
  dismissible: boolean;
  /** 고칠 자리로 보내는 링크. 표면 추가·포맷 수정은 이 Alert가 보낼 곳이 아니다(액션이 둘이 된다). */
  action: "settings" | "reconnect" | null;
};

const PLANS: Partial<Record<string, ImportRefusalPlan>> = {
  "already-running": { tone: "info", dismissible: true, action: null },
  "not-ready": { tone: "warning", dismissible: false, action: "settings" },
  "not-connected": { tone: "warning", dismissible: false, action: "reconnect" },
  "no-surfaces": { tone: "warning", dismissible: false, action: null },
  /**
   * ⚠️ **danger이고 액션이 없다** (DESIGN §6.2 · 2026-09-10 sec-audit-2 발견 34). 리포는 생성 시점에
   * 고정이라 `connectRepository`가 재고정을 거부한다 — [Reconnect]는 눌러도 실패할 버튼이고,
   * 이 거부는 이 화면에서 풀리지 않으므로 "다시 누르면 되나"의 답이 아니오다.
   */
  "repo-replaced": { tone: "danger", dismissible: false, action: null },
  /**
   * ⚠️ **`checkRepoAccess`·`snapshotError`가 돌려주는 `ConnectError`도 이 자리에 선다.** 그 문구는
   * **설정 화면의 컨트롤을 이름으로 가리킨다**("use Reauthorize GitHub App" · "Install it, then connect
   * again") — Home에는 그 버튼이 없다. 액션 없이 두면 **닫을 수도 없고 갈 곳도 없는 amber**가
   * 존재하지 않는 컨트롤을 가리킨 채 고정된다.
   * ⚠️ `installation-forbidden`·`repo-forbidden`은 일부러 뺀다 — 그 문장의 다음 행동이 화면이 아니라
   * **사람**이다("Ask the repository owner"). 보낼 곳이 없는데 버튼을 세우면 거기서 또 막힌다.
   */
  "reauthorize": { tone: "warning", dismissible: false, action: "settings" },
  "repo-not-installed": { tone: "warning", dismissible: false, action: "settings" },
};

/**
 * ⚠️ **모르는 값은 warning으로 떨어진다** — `danger`로 떨어뜨리면 기다리면 풀리는 장애가 최종
 * 실패처럼 보이고, `info`로 떨어뜨리면 버린 값이 성공처럼 보인다(ARCHITECTURE §0 불변식 9).
 * `AccessError`만 갈래를 알아 danger로 올린다 — 세션 만료·인가 거부는 이 화면에서 풀리지 않는다.
 */
export function planImportRefusal(error: RepositoryImportError): ImportRefusalPlan {
  // 남이 정한 키가 아니라 서버 union이지만, 프로토타입에서 찾아진 값이 계획으로 읽히지 않게 막는다.
  if (Object.hasOwn(PLANS, error)) {
    const plan = PLANS[error];
    if (plan !== undefined) return plan;
  }
  if (isAccessError(error)) return { tone: "danger", dismissible: false, action: null };
  return { tone: "warning", dismissible: false, action: null };
}
