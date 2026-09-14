// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { act } from "react";
import { find, render } from "./helpers/dom";
import userEvent from "@testing-library/user-event";
import { SurfaceSelector } from "../surface-selector";

const surfaces = [
  { slug: "default", pathTemplate: "public/_locales/{locale}/messages.json", unpublished: 3 },
  { slug: "web-2", pathTemplate: "src/web/{locale}.json", unpublished: 7 },
];
it("renders nothing for a single surface", async () => {
  const { container } = await render(<SurfaceSelector value="default" surfaces={surfaces.slice(0, 1)} pending={false} onChange={() => {}} />);
  expect(container.innerHTML).toBe("");
});
it("uses path labels, badges and a named keyboard control", async () => {
  const changed = vi.fn(), user = userEvent.setup();
  const { container } = await render(<SurfaceSelector value="default" surfaces={surfaces} pending={false} onChange={changed} />);
  const trigger = find<HTMLButtonElement>(container, '[role="combobox"]');
  expect(trigger.getAttribute("aria-label")).toBe("Translation surface");
  await act(async () => user.tab()); expect(document.activeElement).toBe(trigger);
  await act(async () => user.keyboard(" "));
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(el => el.textContent?.includes("web"));
  expect(option?.textContent).toContain("7");
  await act(async () => user.click(option!));
  expect(changed).toHaveBeenCalledWith("web-2");
  expect(container.textContent).not.toContain("web-2");
});
it("locks the control while navigation is pending", async () => {
  const { container } = await render(<SurfaceSelector value="default" surfaces={surfaces} pending onChange={() => {}} />);
  expect(find(container, '[role="combobox"]').hasAttribute("disabled")).toBe(true);
});

it("같은 마지막 디렉터리 이름의 표면은 전체 경로로 구별한다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<SurfaceSelector value="a" pending={false} onChange={() => {}} surfaces={[
    { slug: "a", pathTemplate: "apps/a/locales/{locale}.json", unpublished: 0 },
    { slug: "b", pathTemplate: "apps/b/locales/{locale}.json", unpublished: 0 },
  ]} />);
  await act(async () => user.click(find(container, '[role="combobox"]')));
  const options = [...document.querySelectorAll('[role="option"]')];
  expect(options[0]?.textContent).toContain("apps/a/locales/{locale}.json");
  expect(options[1]?.textContent).toContain("apps/b/locales/{locale}.json");
});
