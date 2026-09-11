// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it } from "vitest";
import { EditLossBanner } from "@/components/translations/edit-loss-banner";
import { render, find } from "./helpers/dom";

beforeEach(() => sessionStorage.clear());
it("처음 Publish 전 경고의 닫힘 상태가 프로젝트별로 독립적이다", async () => {
  const { container, rerender } = await render(<EditLossBanner slug="a" count={1} dismissKey="never" />);
  await act(async () => find<HTMLButtonElement>(container, "button").click());
  expect(container.textContent).toBe("");
  await rerender(<EditLossBanner slug="b" count={2} dismissKey="never" />);
  expect(container.textContent).not.toBe("");
  await rerender(<EditLossBanner slug="a" count={1} dismissKey="never" />);
  expect(container.textContent).toBe("");
  await rerender(<EditLossBanner slug="a" count={1} dismissKey="2026-09-12" />);
  expect(container.textContent).not.toBe("");
});
