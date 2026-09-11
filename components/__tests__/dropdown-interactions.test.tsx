// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, find } from "./helpers/dom";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

it("포털 메뉴가 sticky 헤더 위에 표시되고 가용 높이 안에서 스크롤한다", async () => {
  await render(<DropdownMenu defaultOpen><DropdownMenuTrigger asChild><Button>Locales</Button></DropdownMenuTrigger>
    <DropdownMenuContent><DropdownMenuCheckboxItem checked>en</DropdownMenuCheckboxItem></DropdownMenuContent>
  </DropdownMenu>);
  const menu = find<HTMLElement>(document.body, '[role="menu"]');
  expect(menu.classList.contains("z-50")).toBe(true);
  expect(menu.classList.contains("max-h-[var(--radix-dropdown-menu-content-available-height)]")).toBe(true);
  expect(menu.classList.contains("overflow-y-auto")).toBe(true);
});

it("마지막 선택의 disabled 상태가 시각 스타일에도 전달된다", async () => {
  await render(<DropdownMenu defaultOpen><DropdownMenuTrigger asChild><Button>Locales</Button></DropdownMenuTrigger>
    <DropdownMenuContent><DropdownMenuCheckboxItem checked disabled>en</DropdownMenuCheckboxItem></DropdownMenuContent>
  </DropdownMenu>);
  const item = find<HTMLElement>(document.body, '[role="menuitemcheckbox"]');
  expect(item.getAttribute("aria-disabled")).toBe("true");
  expect(item.classList.contains("data-[disabled]:opacity-50")).toBe(true);
  expect(item.classList.contains("data-[disabled]:pointer-events-none")).toBe(true);
});
