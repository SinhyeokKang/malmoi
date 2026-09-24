import { describe, expect, it } from "vitest";
import { planPublishView } from "@/lib/publish/plan";
import { pullRevalidates, type PullOutcome } from "../message";
it("결과 판정은 입력을 바꾸지 않고 전송 여부 미확인을 보존한다", () => {
  const result: PullOutcome = { status: "failed", error: "unavailable", retryable: true, delivery: "unknown" };
  expect(planPublishView(result)).toBe("transient-error");
  expect(planPublishView(result)).toBe(planPublishView(result));
  expect(result.delivery).toBe("unknown");
});

/**
 * **어느 Publish 결과가 재검증 트리를 싣고 오나** (malmoi#103 r1). `triggerPullAction`은 `runSync`를 부른 뒤 결과와 무관하게
 * `revalidatePath`를 부른다 — 그 앞의 거부(세션·인가·준비)만 트리가 없다. `delivery`는 가르지 못한다: `runSync`의 게이트 거부도
 * `not-started`다. 표식은 `runSync`만 내는 것 — 실행 실패의 `code`와 게이트의 두 코드다.
 */
describe("pullRevalidates", () => {
  it("성공·스킵은 트리가 온다", () => {
    expect(pullRevalidates({ status: "skipped", reason: "no-edits" })).toBe(true);
  });
  it.each(["already-running", "too-soon"])("runSync 게이트 거부 %s는 트리가 온다", error => {
    expect(pullRevalidates({ status: "failed", error, delivery: "not-started", retryable: false })).toBe(true);
  });
  it("runSync의 실행 실패(code)는 트리가 온다", () => {
    expect(pullRevalidates({ status: "failed", error: "boom", code: "base-unreadable", delivery: "unknown", retryable: true })).toBe(true);
  });
  it.each(["unauthorized", "not-ready", "forbidden", "unavailable", "invalid input"])("runSync 앞의 거부 %s는 트리가 없다", error => {
    expect(pullRevalidates({ status: "failed", error, delivery: "not-started", retryable: false })).toBe(false);
  });
});
