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

/**
 * ⚠️ **액션이 둘이면 버튼이 맞붙는다** (2026-09-13 사용자 실물 — 검색 0건의 [Clear search]·[New project]).
 * 호출부는 `<>`로 넘기므로 사이를 벌릴 자리가 이 래퍼밖에 없다. `mt-4`만 들고 있으면 inline-flex
 * 버튼 둘이 간격 0으로 붙어 한 덩어리로 읽힌다 — **§6.4의 "액션 둘" 예외가 성립하려면 여기가 flex다.**
 */
it("액션이 둘이어도 사이가 벌어진다", async () => {
  const { container } = await render(
    <EmptyState
      title="No results"
      action={
        <>
          <button type="button">Clear search</button>
          <button type="button">New project</button>
        </>
      }
    />,
  );
  const wrapper = find<HTMLElement>(container, "button").parentElement;

  expect(wrapper?.className).toContain("flex");
  expect(wrapper?.className).toContain("gap-2");
  expect(wrapper?.className).toContain("justify-center");
});
