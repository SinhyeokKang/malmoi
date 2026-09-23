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

const props = { slug: "alpha", sources: [{ slug: "web" }], actors: [], refreshable: true };
beforeEach(() => { mocks.push.mockReset(); });

const trigger = (axis: string) => {
  const node = document.querySelector<HTMLButtonElement>(`button[aria-label^="${axis}:"]`);
  if (!node) throw new Error(`no ${axis} trigger`);
  return node;
};
/** 라벨로 칸을 찾는다 — `aria-label`만 있으면 눈으로 보는 사람에게 두 칸이 무엇인지 안 보인다(r1). */
const field = (label: string) => {
  const node = [...document.querySelectorAll<HTMLLabelElement>('[role="dialog"] label')].find(l => l.textContent?.trim() === label);
  const target = node?.htmlFor ? document.getElementById(node.htmlFor) : null;
  if (!(target instanceof HTMLInputElement)) throw new Error(`no field ${label}`);
  return target;
};
const dialogButton = (label: string) => {
  const node = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.trim() === label);
  if (!node) throw new Error(`no dialog button ${label}`);
  return node;
};
async function openCustom(user: ReturnType<typeof userEvent.setup>) {
  trigger("Date").focus();
  await act(async () => user.keyboard("{Enter}"));
  const menu = document.querySelector('[role="menu"]');
  const item = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find(node => node.textContent === m.logs.range.customOpen);
  if (!item) throw new Error("no custom item");
  for (let i = 0; i < 8 && document.activeElement !== item; i++) await act(async () => user.keyboard("{ArrowDown}"));
  expect(document.activeElement).toBe(item);
  await act(async () => user.keyboard("{Enter}"));
}
const lastUrl = () => new URL(String(mocks.push.mock.calls.at(-1)?.[0]), "http://x");

it("기간 메뉴 안에 입력 칸이 없고, 키보드로 고른 항목이 라벨 달린 두 칸의 Dialog를 연다", async () => {
  const user = userEvent.setup();
  await render(<LogFilters {...props} filter={parseLogFilter({})} />);
  trigger("Date").focus();
  await act(async () => user.keyboard("{Enter}"));
  expect(document.querySelector('[role="menu"]')?.querySelector("input")).toBeNull();
  await act(async () => user.keyboard("{Escape}"));
  await openCustom(user);

  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  // Radix가 설명 없는 Dialog에 경고를 낸다 — 설명이 실재하고 그것을 가리킨다.
  expect(document.getElementById(dialog!.getAttribute("aria-describedby") ?? "")?.textContent).toBe(m.logs.range.description);
  const from = field(m.logs.range.from);
  const to = field(m.logs.range.to);
  expect(from.type).toBe("date");
  expect(to.type).toBe("date");
  await input(from, "2026-09-01");
  await input(to, "2026-09-10");
  // 칸을 바꾸는 것만으로는 이동하지 않는다 — 날짜를 한 칸씩 고치는 동안 목록이 매번 다시 그려지지 않는다.
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => user.click(dialogButton(m.logs.range.apply)));
  expect(mocks.push).toHaveBeenCalledOnce();
  expect(lastUrl().searchParams.get("from")).toBe("2026-09-01");
  expect(lastUrl().searchParams.get("to")).toBe("2026-09-10");
  // 닫히면 Date 트리거로 돌아온다 — 연 항목은 메뉴와 함께 사라졌다.
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger("Date")));
});

/**
 * **다시 열면 URL의 현재 값에서 시작한다** (r1). 전엔 초기화가 한 번만 돌아 취소한 입력이 다음 열기에 남았고,
 * 프리셋으로 바꾼 뒤 다시 열어 Apply하면 **옛 범위가 조용히 되돌아왔다.**
 */
it("취소한 입력은 다시 열 때 남지 않는다", async () => {
  const user = userEvent.setup();
  await render(<LogFilters {...props} filter={parseLogFilter({ from: "2026-09-01", to: "2026-09-10" })} />);
  await openCustom(user);
  await input(field(m.logs.range.from), "2026-01-01");
  await act(async () => user.click(dialogButton(m.common.cancel)));
  expect(mocks.push).not.toHaveBeenCalled();
  await openCustom(user);
  expect(field(m.logs.range.from).value).toBe("2026-09-01");
  expect(field(m.logs.range.to).value).toBe("2026-09-10");
});

it("프리셋으로 바꾼 뒤 다시 열면 그 프리셋의 범위에서 시작한다 — 옛 범위를 되살리지 않는다", async () => {
  const user = userEvent.setup();
  const view = await render(<LogFilters {...props} filter={parseLogFilter({ from: "2026-09-01", to: "2026-09-10" })} />);
  await openCustom(user);
  await act(async () => user.click(dialogButton(m.common.cancel)));
  // 프리셋을 고른 뒤 서버가 새 URL로 다시 그린 상태를 재현한다.
  await view.rerender(<LogFilters {...props} filter={parseLogFilter({ from: "2026-09-20", to: "2026-09-24" })} />);
  await openCustom(user);
  expect(field(m.logs.range.from).value).toBe("2026-09-20");
  await act(async () => user.click(dialogButton(m.logs.range.apply)));
  expect(lastUrl().searchParams.get("from")).toBe("2026-09-20");
  expect(lastUrl().searchParams.get("to")).toBe("2026-09-24");
});

/**
 * **다섯 메뉴가 전부 자기 트리거를 이름으로 든다** (r1). 트리거에 `id`를 펼치면 Radix의 `context.triggerId`를 덮어
 * `aria-labelledby`가 없는 id를 가리킨다 — Date는 우리 id로, 나머지 넷은 `id={undefined}`로 덮여 있었다.
 */
it.each(["Kind", "Date", "Actor", "Source", "Result"])("%s 메뉴의 aria-labelledby가 자기 트리거를 가리킨다", async (axis) => {
  const user = userEvent.setup();
  await render(<LogFilters {...props} filter={parseLogFilter({})} />);
  const node = trigger(axis);
  node.focus();
  await act(async () => user.keyboard("{Enter}"));
  const menu = document.querySelector('[role="menu"]');
  expect(menu).not.toBeNull();
  expect(document.getElementById(menu!.getAttribute("aria-labelledby") ?? "")).toBe(node);
});
