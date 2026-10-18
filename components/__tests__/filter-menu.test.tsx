// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act, createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { FilterMenu } from "@/components/ui/filter-menu";
import { DropdownMenuCheckboxItem, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { find, key, render } from "./helpers/dom";

vi.setConfig({ testTimeout: 20_000 });

describe("FilterMenu 공통 껍데기", () => {
  it("직속 버튼의 전체 접근 이름·기본 크기·메뉴 라벨 연결을 보존한다", async () => {
    const { container } = await render(
      <div data-row><FilterMenu axis="Kind" label="All activity" on={false}>
        <DropdownMenuItem selected>All activity</DropdownMenuItem>
      </FilterMenu></div>,
    );
    const trigger = find<HTMLButtonElement>(container, "[data-row] > button");
    expect(trigger.getAttribute("aria-label")).toBe("Kind: All activity");
    for (const token of ["h-9", "shrink-0", "border-border", "text-muted-foreground"]) expect(trigger.classList.contains(token)).toBe(true);
    const user = userEvent.setup();
    await act(async () => { await user.click(trigger); });
    const menu = find(document.body, '[role="menu"]');
    expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);
    expect(trigger.id).not.toBe("");
    expect(menu.getAttribute("data-align")).toBe("start");
    expect(menu.classList.contains("min-w-53")).toBe(true);
    expect(find(document.body, '[role="menuitemradio"]').getAttribute("aria-checked")).toBe("true");
  });

  it("단일 선택으로 닫히고 ref와 닫힘 알림을 전달한다", async () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const onCloseAutoFocus = vi.fn();
    const onSelect = vi.fn();
    const { container } = await render(
      <FilterMenu axis="Status" label="Needs review" on size="sm" align="end" triggerRef={triggerRef} onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuItem selected onSelect={onSelect}>Needs review</DropdownMenuItem>
      </FilterMenu>,
    );
    const trigger = find<HTMLButtonElement>(container, "button");
    expect(triggerRef.current).toBe(trigger);
    for (const token of ["h-7", "shrink-0", "border-foreground", "font-medium"]) expect(trigger.classList.contains(token)).toBe(true);
    const user = userEvent.setup();
    await act(async () => { trigger.focus(); await user.keyboard("{Enter}"); });
    expect(find(document.body, '[role="menu"]').getAttribute("data-align")).toBe("end");
    await act(async () => { await user.keyboard("{Enter}"); });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onCloseAutoFocus).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("체크박스 변경 뒤 재렌더해도 메뉴를 유지하며 Esc는 트리거로 돌아간다", async () => {
    const onCheckedChange = vi.fn();
    const view = (checked: boolean) => <FilterMenu axis="Source" label={checked ? "web" : "Any source"} on={checked}>
      <DropdownMenuCheckboxItem checked={checked} onCheckedChange={onCheckedChange}>web</DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem checked={false}>docs</DropdownMenuCheckboxItem>
    </FilterMenu>;
    const { container, rerender } = await render(view(false));
    const trigger = find<HTMLButtonElement>(container, "button");
    const user = userEvent.setup();
    await act(async () => { await user.click(trigger); });
    await act(async () => { await user.click(find(document.body, '[role="menuitemcheckbox"]')); });
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
    await rerender(view(true));
    expect(document.querySelectorAll('[role="menuitemcheckbox"]').length).toBe(2);
    expect(find(document.body, '[role="menuitemcheckbox"]').getAttribute("aria-checked")).toBe("true");
    expect(trigger.getAttribute("aria-label")).toBe("Source: web");
    await act(async () => { await user.keyboard("{Escape}"); });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("비활성 트리거는 포인터와 키보드로 열리지 않는다", async () => {
    const { container } = await render(<FilterMenu axis="Status" label="All keys" on={false} disabled>
      <DropdownMenuItem>All keys</DropdownMenuItem>
    </FilterMenu>);
    const trigger = find<HTMLButtonElement>(container, "button");
    expect(trigger.disabled).toBe(true);
    await act(async () => { await userEvent.setup().click(trigger); });
    await key(trigger, "Enter");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
