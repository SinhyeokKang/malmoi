import { isAccessError } from "@/lib/auth/message";

import type { RepositoryImportError } from "./result";

/**
 * 거부 Alert의 표시 계약 (시안 `4f`).
 *
 * ⚠️ **tone과 `dismissible`의 판정 기준이 다르다** — 아래 타입의 주석이 근거다.
 *
 * ⚠️ **거부는 Alert이고 Dialog 안이 아니다** — 게이트 여섯은 확인을 누른 **뒤**에 돌므로, 답을
 * Dialog 안에 띄우면 이미 답한 질문 위에 새 문장이 얹히고 사람이 "닫아도 되는지"를 다시 판단해야
 * 한다. 결과와 거부가 같은 한 자리에 서서 한 번 누른 일의 답이 두 곳에 나지 않는다.
 *
 * ⚠️ **아래 넷은 `[Sync]`에서 도달할 수 없다** (2026-09-16 브라우저 실측 · T11). 전에 이 주석은
 * *"사전 비활성화를 만들지 않는다 — `not-ready`·`not-connected`는 렌더 시점에 알 수 있지만 그것으로
 * 트리거를 끄지 않는다"*라고 적혀 있었는데 **화면은 정확히 반대로 동작한다**:
 *
 * - `not-ready`·`no-surfaces` — `planProjectReadiness`가 `ready`가 아니면 Home이 서지 않고 설정 화면이
 *   대신 뜬다. 거기엔 `[Sync]`가 없다(`[Run first import]`뿐). `lastCommitSha`를 **null로 되돌리는
 *   코드가 없어서**(`lib/push/apply.ts`가 세우기만 한다) 한 번 `ready`가 된 프로젝트는 여기 못 온다.
 * - `not-connected`·`repo-replaced` — `planHomeState`가 둘을 `not_connected` 하나로 접고, Home의
 *   `paused`가 트리거를 native `disabled`로 만든다(`app/(edit)/projects/[slug]/page.tsx`).
 *
 * **손실은 아니다** — 그 화면은 `not_connected` 배너가 `[Reconnect]`를 들어 아래 `action`이 하려던
 * 일을 이미 한다. **계획을 지우지도 않는다**: Action은 경합(렌더 후 상태가 바뀜)에서 여전히 이 코드를
 * 돌려주고, `planImportRefusal`의 폴백이 모르는 값을 warning으로 떨어뜨리는 것이 방어선이다.
 * 실제로 밟히는 것은 `already-running`·`ingest-failed`·`unavailable`과 `AccessError` 갈래다.
 */
export type ImportRefusalPlan = {
  /**
   * ⚠️ **두 축의 소유자가 다르다** (2026-09-16 라운드 4 — 전에는 이 주석이 tone까지 "다시 누르면
   * 되나"로 갈린다고 적어 두고 코드가 그것을 안 지켰다).
   *
   * - **tone은 캔버스 §6 `4f`의 tone 표가 정한다.** `ingest-failed`·`unavailable`은 기다리면 풀리지만
   *   **danger**다 — 실패한 Sync는 "덮였다고 믿는데 안 덮였다"라 불변식 9 계열이고, 동료 편집을
   *   지우는 버튼 옆에서 info는 틀린 음역이다.
   * - **`dismissible`만 아래 기준을 따른다.**
   *
   * ⚠️ **tone이 live politeness까지 정한다** — `components/ui/alert.tsx`가 `role`을 `danger`면
   * `"alert"`(assertive)로 덮는다. 캔버스는 **색**을 골랐는데 프리미티브가 그것을 **읽기 방해**
   * 결정으로 번역한다. 지금 구조에는 "danger 시각 + `status`"가 없다 — 일시적 실패에 스크린리더가
   * 읽던 문장이 끊기는 대가를 알고 받는다 (`docs/DESIGN.md`).
   */
  tone: "info" | "warning" | "danger";
  /** ⚠️ 닫아도 같은 버튼이 같은 거부를 반복하는 갈래에는 닫기를 주지 않는다. */
  dismissible: boolean;
  /** 고칠 자리로 보내는 링크. 표면 추가·포맷 수정은 이 Alert가 보낼 곳이 아니다(액션이 둘이 된다). */
  action: "settings" | "reconnect" | null;
};

const PLANS: Partial<Record<string, ImportRefusalPlan>> = {
  "already-running": { tone: "info", dismissible: true, action: null },
  /**
   * 승인한 뒤 편집·설정이 바뀌었다 (sync-edit-protection T9). **닫을 수 있다** — 다음 행동은 `[Sync]`를 다시 열어 새 건수를
   * 보고 승인하는 것이고, 그 Dialog가 새 지문을 받는다. 아무것도 지워지지 않았으므로 danger가 아니다.
   */
  "reconfirm": { tone: "warning", dismissible: true, action: null },
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
  /**
   * ⚠️ **"요청이 못 갔다"는 생산자가 둘이다** — `runRepositoryImport`의 서버 `catch`가 `ingest-failed`를,
   * 클라이언트 `catch`가 `unavailable`을 낸다. **둘 다 등재한다**: 한쪽만 고치면 다른 쪽이 폴백으로
   * 떨어져 같은 증상이 재생된다 (2026-09-15 라운드 3 — 실제로 클라이언트만 고쳤다가 다시 잡혔다).
   * ⚠️ **닫을 수 있다** — 이 파일의 기준은 *"닫아도 같은 버튼이 같은 거부를 반복하는 갈래에는 닫기를
   * 주지 않는다"*이고, 일시적 실패는 그 갈래가 아니다. 다음 행동은 머리의 `[Sync]`를 다시 누르는
   * 것이라 액션 버튼도 두지 않는다(보낼 곳이 자기 자신이면 버튼이 둘로 보인다).
   */
  "ingest-failed": { tone: "danger", dismissible: true, action: null },
  "unavailable": { tone: "danger", dismissible: true, action: null },
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
