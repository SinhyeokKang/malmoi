// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import PageError from "../error";
import { render, find } from "@/components/__tests__/helpers/dom";

it("오류 상태도 콘텐츠 패널·내부 스크롤을 유지하며 재시도할 수 있다", async () => {
  const reset = vi.fn();
  const { container } = await render(<PageError reset={reset} />);
  expect(container.querySelectorAll("main")).toHaveLength(1);
  const panel = find<HTMLElement>(container, "main");
  expect(panel.classList.contains("flex-1")).toBe(true);
  expect(panel.classList.contains("bg-background")).toBe(true);
  expect(panel.querySelector(".overflow-y-auto")).not.toBeNull();
  await act(async () => find<HTMLButtonElement>(panel, "button").click());
  expect(reset).toHaveBeenCalledTimes(1);
});
