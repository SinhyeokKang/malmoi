// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "@/components/ui/checkbox";
import { find, render } from "./helpers/dom";
vi.setConfig({ testTimeout: 20_000 });
it("라벨 없이 접근 이름이 있고 16 크기·포커스·disabled를 보존한다", async () => {
  const change = vi.fn(); const user = userEvent.setup();
  const view = await render(<Checkbox aria-label="Include i18n" onCheckedChange={change} />);
  const control = find<HTMLElement>(view.container, '[role="checkbox"][aria-label="Include i18n"]');
  expect(control.className).toContain("size-4"); expect(control.className).toContain("focus-visible:ring-2");
  await act(async () => { await user.click(control); }); expect(change).toHaveBeenCalledWith(true);
  await view.rerender(<Checkbox aria-label="Include i18n" disabled onCheckedChange={change} />);
  expect(control.matches(":disabled")).toBe(true);
  await act(async () => { await user.click(control); }); expect(change).toHaveBeenCalledTimes(1);
});
