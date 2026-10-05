// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { Search } from "lucide-react";
import { expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRow, DropdownMenuRowSkeleton, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ListGroup } from "@/components/ui/list-group";
import { ListRow } from "@/components/ui/list-row";

import { find, key, render } from "./helpers/dom";

/**
 * attention-inbox T8a — 전역 검색 목록의 행·그룹을 프리미티브로 떼어 헤더 Inbox와 같이 쓴다(design "재사용 설계").
 * 검색 쪽 회귀는 `command.test.tsx`가 그대로 잰다 — 여기는 새 표면(`hoverFill`·`ListGroup`·`DropdownMenuRow`)만 본다.
 */
const hoverFills = (element: Element) => [...element.classList].filter(token => token.startsWith("hover:bg-"));

it("ListRow hoverFill={false}는 hover 면을 붙이지 않고, 기본값은 그대로다", async () => {
  const { container } = await render(<>
    <ListRow as="button" id="card">Card</ListRow>
    <ListRow as="button" id="canvas" variant="canvas">Canvas</ListRow>
    <ListRow as="button" id="off" variant="canvas" hoverFill={false}>Off</ListRow>
    <ListRow as="button" id="selected" hoverFill={false} selected>Selected</ListRow>
  </>);
  expect(hoverFills(find(container, "#card"))).toEqual(["hover:bg-foreground/[0.02]"]);
  expect(hoverFills(find(container, "#canvas"))).toEqual(["hover:bg-foreground/[0.03]"]);
  expect(hoverFills(find(container, "#off"))).toEqual([]);
  // 활성 면은 hover 규칙과 무관하다 — 끈다고 selected 면까지 사라지지 않는다.
  expect(find(container, "#selected").classList.contains("bg-foreground/[0.07]")).toBe(true);
});

it("ListGroup은 role=group + 머리 id로 이름을 받고, 그룹 사이 선은 두 번째부터다", async () => {
  const { container } = await render(<div>
    <ListGroup heading="One"><span>a</span></ListGroup>
    <ListGroup heading="Two" icon={<span data-testid="thumb" />}><span>b</span></ListGroup>
  </div>);
  const groups = [...container.querySelectorAll<HTMLElement>('[role="group"]')];
  expect(groups).toHaveLength(2);
  expect(groups.map(group => document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["One", "Two"]);
  for (const group of groups) {
    const classes = [...group.classList];
    // 선은 "그룹 뒤의 그룹"에만 붙는다(`[role=group]+&`) — 앞에 상태 줄 같은 다른 형제가 있어도 첫 그룹엔 서지 않는다. 세로 padding은 머리 `pt-4`가 든다.
    expect(classes).toEqual(expect.arrayContaining(["[[role=group]+&]:border-t", "[[role=group]+&]:border-divider"]));
    expect(classes.some(token => token.startsWith("not-first:"))).toBe(false);
    expect(classes.filter(token => /^(?:p|py|pt|pb)-/.test(token) || token === "border-t")).toEqual([]);
    const heading = document.getElementById(group.getAttribute("aria-labelledby")!)!;
    expect([...heading.classList]).toEqual(expect.arrayContaining(["text-gray-dim", "px-4", "pt-4", "pb-1", "text-xs", "font-medium"]));
  }
  expect(groups[0]!.matches('[role="group"] + [role="group"]')).toBe(false);
  expect(groups[1]!.matches('[role="group"] + [role="group"]')).toBe(true);
  const [plain, withIcon] = groups.map(group => document.getElementById(group.getAttribute("aria-labelledby")!)!);
  // 글자만인 머리(검색)는 블록 그대로 — 아이콘이 있을 때만 한 줄 정렬과 이름 자르기가 붙는다.
  expect(plain!.classList.contains("flex")).toBe(false);
  expect([...withIcon!.classList]).toEqual(expect.arrayContaining(["flex", "items-center", "gap-2"]));
  expect(withIcon!.firstElementChild?.getAttribute("data-testid")).toBe("thumb");
  expect(find(withIcon!, ".truncate").textContent).toBe("Two");
});

async function openMenu(onSelect = vi.fn()) {
  await render(<DropdownMenu>
    <DropdownMenuTrigger asChild><Button>Open</Button></DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuRow href="/a" icon={<Search aria-hidden />} title="Alpha" description="first" aside={<span>1m</span>} />
      <DropdownMenuRow icon={<Search aria-hidden />} onSelect={onSelect}>Retry</DropdownMenuRow>
    </DropdownMenuContent>
  </DropdownMenu>);
  const trigger = [...document.querySelectorAll("button")].find(node => node.textContent === "Open")!;
  await act(async () => { await userEvent.setup().click(trigger); });
  const menu = find<HTMLElement>(document, '[role="menu"]');
  return { menu, items: [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] };
}

it("DropdownMenuRow는 menuitem 역할을 행 요소 자체(<a>·<button>)에 얹고 형제 노드를 두지 않는다", async () => {
  const { menu, items } = await openMenu();
  expect(items.map(item => item.tagName.toLowerCase())).toEqual(["a", "button"]);
  expect(items[0]!.getAttribute("href")).toBe("/a");
  // Slot이 행에 직접 붙었다 — 메뉴 면의 직계 자식이 행 둘뿐이다(감싼 div·형제 글리프 없음).
  expect([...menu.children]).toEqual(items);
  expect(items[0]!.textContent).toContain("Alpha");
  expect(items[0]!.textContent).toContain("first");
  expect(items[0]!.textContent).toContain("1m");
});

it("DropdownMenuRow는 검색 행 형이고 활성 면은 data-highlighted 하나다 — hover 면·포커스 링이 없다", async () => {
  const { items } = await openMenu();
  for (const item of items) {
    const classes = [...item.classList];
    expect(classes).toEqual(expect.arrayContaining(["flex", "items-center", "gap-3", "px-4", "py-2.5", "text-sm", "outline-none", "data-[highlighted]:bg-foreground/[0.07]"]));
    expect(classes).not.toContain("py-row-y");
    expect(hoverFills(item)).toEqual([]);
    expect(classes).not.toContain("focus-visible:ring-2");
    for (const gone of ["mx-1", "rounded", "bg-accent", "hover:bg-accent", "focus:bg-accent"]) expect(classes, gone).not.toContain(gone);
  }
  await key(document.activeElement ?? document.body, "ArrowDown");
  const highlighted = items.filter(item => item.hasAttribute("data-highlighted"));
  expect(highlighted).toHaveLength(1);
});

it("DropdownMenuRow 버튼 갈래는 Enter로 onSelect를 부른다", async () => {
  const onSelect = vi.fn();
  const { items } = await openMenu(onSelect);
  const retry = items[1]!;
  await act(async () => { retry.focus(); });
  await key(retry, "Enter");
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it("DropdownMenuRowSkeleton은 실물 행과 같은 상자다 — py-2.5, 제목 줄 text-sm, 보조줄 text-xs + leading-normal", async () => {
  const { container } = await render(<DropdownMenuRowSkeleton widths={["w-1/2", "w-1/3"]} />);
  const row = container.firstElementChild!;
  expect([...row.classList]).toEqual(expect.arrayContaining(["py-2.5", "px-4", "gap-3"]));
  const [title, description] = [...row.querySelectorAll<HTMLElement>("[data-skeleton-line]")];
  expect(title!.classList.contains("text-sm")).toBe(true);
  expect([...description!.classList]).toEqual(expect.arrayContaining(["text-xs", "leading-normal"]));
});
