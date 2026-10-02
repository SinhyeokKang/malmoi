// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectSearch, useProjectQuery } from "@/components/projects/search-input";
import { FilterMenu } from "@/components/translations/workspace/filter-menu";
import { render, find, key } from "./helpers/dom";

const locationState = vi.hoisted(() => ({ query: "fixture" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ q: locationState.query }) }));
afterEach(() => { vi.restoreAllMocks(); locationState.query = "fixture"; });

function ProjectFixture() {
  const [q, search] = useProjectQuery();
  return <ProjectSearch q={q} onSearch={search} />;
}

it.each(["clear", "escape"])("actual ProjectSearch %s clears the local query and URL exactly once", async method => {
  const replace = vi.spyOn(window.history, "replaceState");
  const { container } = await render(<ProjectFixture />);
  const field = find<HTMLInputElement>(container, "input");
  expect(field.value).toBe("fixture");
  await act(async () => field.focus());
  if (method === "clear") await act(async () => { await userEvent.setup().click(find(container, 'button[aria-label="Clear search"]')); });
  else await key(field, "Escape");
  expect(field.value).toBe("");
  expect(replace).toHaveBeenCalledExactlyOnceWith(null, "", "/projects");
  expect(document.activeElement).toBe(field);
});

it("actual ProjectSearch keeps trimmed URL submission, IME guards and external query synchronization", async () => {
  const replace = vi.spyOn(window.history, "replaceState");
  const { container, rerender } = await render(<ProjectFixture />);
  const field = find<HTMLInputElement>(container, "input");
  const user = userEvent.setup();
  await act(async () => { await user.clear(field); await user.type(field, " translated "); });
  await key(field, "Enter", { isComposing: true });
  await key(field, "Enter", { keyCode: 229 });
  expect(replace).not.toHaveBeenCalled();
  await key(field, "Enter");
  expect(replace).toHaveBeenCalledExactlyOnceWith(null, "", "/projects?q=translated");
  locationState.query = "external";
  await rerender(<ProjectFixture />);
  expect(field.value).toBe("external");
  expect(replace).toHaveBeenCalledTimes(1);
});

const options = [{ value: "all", label: "All", group: "State" }, { value: "pending", label: "Pending", group: "State" }];
it("actual small FilterMenu keeps one slotted trigger, end alignment, keyboard selection and focus return", async () => {
  const select = vi.fn();
  const { container } = await render(<FilterMenu axis="Completeness" label="Pending" on size="sm" options={options} value="pending" onSelect={select} align="end" hint="Fixture hint" />);
  const trigger = find<HTMLButtonElement>(container, 'button[aria-label="Completeness: Pending"]');
  expect(container.querySelectorAll("button")).toHaveLength(1);
  expect(trigger.classList.contains("h-7")).toBe(true);
  expect(trigger.classList.contains("border-foreground")).toBe(true);
  expect(trigger.classList.contains("focus-visible:ring-2")).toBe(true);
  expect(trigger.querySelector("svg")?.classList.contains("group-data-[state=open]:rotate-180")).toBe(true);
  const user = userEvent.setup();
  await act(async () => { trigger.focus(); await user.keyboard("{Enter}"); });
  const menu = find<HTMLElement>(document.body, '[role="menu"]');
  expect(menu.getAttribute("data-align")).toBe("end");
  expect(menu.textContent).toContain("Fixture hint");
  expect(trigger.getAttribute("data-state")).toBe("open");
  await act(async () => { await user.keyboard("{Home}{Enter}"); });
  expect(select).toHaveBeenCalledExactlyOnceWith("all");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("actual disabled FilterMenu blocks pointer and keyboard opening", async () => {
  const select = vi.fn();
  const { container } = await render(<FilterMenu axis="Completeness" label="All" on={false} size="md" options={options} value="all" onSelect={select} disabled />);
  const trigger = find<HTMLButtonElement>(container, "button");
  expect(trigger.disabled).toBe(true);
  expect(trigger.classList.contains("h-9")).toBe(true);
  const user = userEvent.setup();
  await act(async () => { await user.click(trigger); });
  await key(trigger, "Enter");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(select).not.toHaveBeenCalled();
});
