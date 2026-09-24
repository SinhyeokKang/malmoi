import { expectTypeOf, it } from "vitest";
import type { PullDeps } from "../run";

/**
 * **전달 확인 무효화는 필수 의존성이다** (audit #60 — ARCHITECTURE §0 불변식 9). 선택 인자(`invalidateDelivery?`)이면
 * 새 호출부가 빠뜨려도 컴파일되고, 그 경로는 GitHub에 쓰면서 옛 확인을 살려 둔다 — Revert가 보낸 적 없는 값으로 되돌린다.
 * ⚠️ 이 단언은 **`pnpm typecheck`에서** red가 된다(런타임 vitest는 타입을 안 본다).
 */
it("PullDeps.invalidateDelivery는 선택 인자가 아니다", () => {
  expectTypeOf<PullDeps["invalidateDelivery"]>().toEqualTypeOf<(projectId: string) => Promise<void>>();
});
