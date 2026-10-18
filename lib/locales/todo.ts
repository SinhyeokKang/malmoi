import { compareCodeUnits } from "@/lib/compare";
import { planLocaleImportGate } from "@/lib/push/locale-gate";

import type { SurfaceLocaleState } from "./work";

/**
 * **언어 변경 작업의 할 일 재료** (language-request-todo design §3) — 목록 행 띠 · Inbox 항목 · Home이 같은 사실로 말하도록 한 번 접는다.
 *
 * ⚠️ **새 정의를 만들지 않는다** — 수는 `countLocaleWork`와 같은 `work.length` 합이고, 보류는 CI 게이트 함수(`planLocaleImportGate`)를
 * 그대로 부른 결과다. 술어를 다시 쓰면 화면과 게이트가 갈린다(ux-drift-unify Q6).
 * ⚠️ **서버 로더에서만 부른다** — 게이트 모듈을 값으로 물므로 클라이언트 그래프(`lib/inbox/project-todos.ts` → Inbox 섬)에 들어가면 안 된다.
 * 그쪽은 `import type { LanguageTodo }`만 한다(`components/__tests__/client-graph.test.ts`).
 */
export type LanguageTodo = {
  /** 소스·언어 단위 작업 수 — `countLocaleWork`와 같다. */
  count: number;
  /** 작업이 있는 소스 가운데 slug가 가장 작은 것(코드 단위). */
  surfaceSlug: string;
  /** 작업이 있는 코드의 마지막 요청 시각. 거둘 것만 남으면 요청 행이 없어 `null`이다(design D11). */
  at: Date | null;
  /** 전달 전 제거가 CI 적재를 보류한다(`locale-change-pending`). */
  held: boolean;
};

/**
 * @param slugOf 소스 id → slug. 모르는 소스(조회와 경합해 보관된 소스)는 대표가 될 수 없고, 아는 소스가 하나도 없으면 항목을 세우지 않는다 —
 *   미발송 편집(`unsent`)이 대표 slug를 모르면 항목을 세우지 않는 것과 같다(`lib/inbox/load.ts`).
 */
export function languageTodo(states: readonly SurfaceLocaleState[], slugOf: ReadonlyMap<string, string>): LanguageTodo | null {
  const working = states.filter(state => state.work.length > 0);
  const count = working.reduce((sum, state) => sum + state.work.length, 0);
  if (count === 0) return null;
  let surfaceSlug: string | null = null;
  let at: Date | null = null;
  for (const state of working) {
    const slug = slugOf.get(state.surfaceId);
    if (slug !== undefined && (surfaceSlug === null || compareCodeUnits(slug, surfaceSlug) < 0)) surfaceSlug = slug;
    const codes = new Set(state.work.map(item => item.localeCode));
    for (const row of state.rows) {
      if (codes.has(row.localeCode) && (at === null || row.requestedAt > at)) at = row.requestedAt;
    }
  }
  if (surfaceSlug === null) return null;
  return { count, surfaceSlug, at, held: planLocaleImportGate(states).action === "defer" };
}
