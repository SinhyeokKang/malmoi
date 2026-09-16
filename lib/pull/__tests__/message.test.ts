import { expect, it } from "vitest";
import { planPublishView } from "@/lib/publish/plan";
import type { PullOutcome } from "../message";
it("결과 판정은 입력을 바꾸지 않고 전송 여부 미확인을 보존한다", () => {
  const result: PullOutcome = { status: "failed", error: "unavailable", retryable: true, delivery: "unknown" };
  expect(planPublishView(result)).toBe("transient-error");
  expect(planPublishView(result)).toBe(planPublishView(result));
  expect(result.delivery).toBe("unknown");
});
