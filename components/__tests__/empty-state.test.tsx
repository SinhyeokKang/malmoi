// @vitest-environment jsdom
import { expect, it } from "vitest";

import { EmptyState } from "@/components/ui/empty-state";

import { render, find } from "./helpers/dom";

/**
 * ⚠️ **`className`이 없어서 모달 ①의 막힘 상태가 §8의 치수를 못 실었다** (new-project-modal T7).
 * 넓히는 것이지 옮기는 것이 아니다 — 기본 치수는 그대로다.
 */
it("merges a caller className onto the container", async () => {
  const { container } = await render(<EmptyState title="No installation found" className="py-6" />);
  const root = find<HTMLElement>(container, "div");

  expect(root.className).toContain("py-6");
  expect(root.className).toContain("flex-col");
});
