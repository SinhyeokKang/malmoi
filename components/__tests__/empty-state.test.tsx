// @vitest-environment jsdom
import { Inbox } from "lucide-react";
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

it("keeps the page shape, decorative icon and ordered paragraph slots", async () => {
  const { container } = await render(<EmptyState icon={Inbox} title={<strong>No results</strong>}
    description={<>Try <em>another query</em>.</>} action={<a href="/projects">Clear search</a>} />);
  const root = find<HTMLElement>(container, "div");
  const [tile, title, description, action] = [...root.children];
  expect(root.children).toHaveLength(4);
  expect(root.classList.contains("py-12")).toBe(true);
  expect([...root.classList].some(token => token.startsWith("gap-"))).toBe(false);
  expect(tile?.classList.contains("size-10")).toBe(true);
  expect(tile?.classList.contains("mb-3")).toBe(true);
  expect(tile?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(title?.tagName).toBe("P");
  expect(title?.querySelector("strong")?.textContent).toBe("No results");
  expect(title?.classList.contains("text-lg")).toBe(true);
  expect(title?.classList.contains("mb-1")).toBe(true);
  expect(description?.tagName).toBe("P");
  expect(description?.querySelector("em")?.textContent).toBe("another query");
  expect(description?.classList.contains("max-w-[46ch]")).toBe(true);
  expect(description?.classList.contains("text-sm")).toBe(true);
  expect(action?.querySelector("a")?.getAttribute("href")).toBe("/projects");
  expect(action?.classList.contains("mt-4")).toBe(true);
  expect(root.querySelector('[role="alert"], [role="status"]')).toBeNull();
});

it("omitted icon, description and action do not leave empty wrappers or live regions", async () => {
  const { container } = await render(<EmptyState title="Nothing here" />);
  const root = find<HTMLElement>(container, "div");
  expect(root.children).toHaveLength(1);
  expect(root.firstElementChild?.tagName).toBe("P");
  expect(root.firstElementChild?.textContent).toBe("Nothing here");
  expect(root.querySelector("svg, a, button, [role]")).toBeNull();
});
