// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { input, render } from "./helpers/dom";

/**
 * **사용자 지정 기간은 키보드로 닿는다** (audit #8 — WCAG 2.1.1). 전엔 From/To `<input type="date">`가 Radix
 * `DropdownMenuContent` 안에 있었다 — 메뉴의 roving focus는 `menuitem`만 들르고 Tab은 메뉴를 닫으므로 키보드로는
 * 그 두 칸에 **도달할 수 없었다.** 이제 메뉴는 항목 하나를 들고, 두 칸은 그 항목이 여는 Dialog에 산다.
 */
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

import { LogFilters } from "@/components/logs/log-filters";
import { parseLogFilter } from "@/lib/events/filter";
import { m } from "@/lib/i18n";

const props = { slug: "alpha", sources: [], actors: [], refreshable: true };
beforeEach(() => { mocks.push.mockReset(); });

it("기간 메뉴 안에 입력 칸이 없고, 키보드로 고른 항목이 두 칸을 든 Dialog를 연다", async () => {
  const user = userEvent.setup();
  await render(<LogFilters {...props} filter={parseLogFilter({})} />);
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label^="Date"]');
  if (!trigger) throw new Error("no date trigger");
  trigger.focus();
  await act(async () => user.keyboard("{Enter}"));
  const menu = document.querySelector('[role="menu"]');
  expect(menu).not.toBeNull();
  expect(menu!.querySelector("input")).toBeNull();
  const item = [...menu!.querySelectorAll('[role="menuitem"]')].find(node => node.textContent?.startsWith(m.logs.range.custom));
  expect(item).toBeDefined();
  // 메뉴 끝 항목까지 화살표로 간다 — 포인터 없이 닿는다는 것이 이 테스트의 요지다.
  for (let i = 0; i < 8 && document.activeElement !== item; i++) await act(async () => user.keyboard("{ArrowDown}"));
  expect(document.activeElement).toBe(item);
  await act(async () => user.keyboard("{Enter}"));

  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const from = dialog!.querySelector<HTMLInputElement>(`input[type="date"][aria-label="${m.logs.range.from}"]`);
  const to = dialog!.querySelector<HTMLInputElement>(`input[type="date"][aria-label="${m.logs.range.to}"]`);
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await input(from!, "2026-09-01");
  await input(to!, "2026-09-10");
  // 칸을 바꾸는 것만으로는 이동하지 않는다 — 날짜를 한 칸씩 고치는 동안 목록이 매번 다시 그려지지 않는다.
  expect(mocks.push).not.toHaveBeenCalled();
  const apply = [...dialog!.querySelectorAll("button")].find(b => b.textContent?.trim() === m.logs.range.apply);
  await act(async () => user.click(apply!));
  expect(mocks.push).toHaveBeenCalledOnce();
  const url = new URL(String(mocks.push.mock.calls[0]?.[0]), "http://x");
  expect(url.searchParams.get("from")).toBe("2026-09-01");
  expect(url.searchParams.get("to")).toBe("2026-09-10");
});
