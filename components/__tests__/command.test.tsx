// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Search } from "lucide-react";

import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandStatus } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Highlight } from "@/components/ui/highlight";
import { find, input, key, render } from "./helpers/dom";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const noNavigation = (event: MouseEvent) => event.preventDefault();
const initial = ["project/a", "menu/settings", "docs/a"];
function Fixture({ ids = initial, query = "", onValueChange = () => {}, onNavigate = noNavigation }: {
  ids?: readonly string[]; query?: string; onValueChange?: (value: string) => void; onNavigate?: (event: MouseEvent) => void;
}) {
  return <Command ids={ids} query={query}>
    <CommandInput value={query} onValueChange={onValueChange} label="Search" placeholder="Search…" />
    <CommandStatus>Searching keys…</CommandStatus>
    <CommandList label="Search results">
      <CommandGroup heading="Projects">
        {ids.map(id => <CommandItem key={id} id={id} href={`/${id}`} title={id} onNavigate={onNavigate} />)}
      </CommandGroup>
    </CommandList>
  </Command>;
}
function active(container: ParentNode): HTMLElement {
  const combobox = find<HTMLInputElement>(container, '[role="combobox"]');
  const id = combobox.getAttribute("aria-activedescendant");
  expect(id).not.toBeNull();
  const option = document.getElementById(id!);
  expect(option).not.toBeNull(); // 존재 단언 없이는 끊긴 참조가 통과한다(POSTMORTEM 2026-09-14).
  expect(option!.getAttribute("role")).toBe("option");
  expect(option!.getAttribute("aria-selected")).toBe("true");
  return option!;
}

it("combobox·listbox·group·option의 ARIA 참조가 실제 요소를 가리킨다", async () => {
  const { container } = await render(<Fixture />);
  const combobox = find<HTMLInputElement>(container, '[role="combobox"]');
  const listbox = find(container, '[role="listbox"]');
  expect(combobox.getAttribute("aria-label")).toBe("Search");
  expect(combobox.getAttribute("aria-expanded")).toBe("true");
  expect(combobox.getAttribute("aria-autocomplete")).toBe("list");
  expect(document.getElementById(combobox.getAttribute("aria-controls")!)).toBe(listbox);
  expect(listbox.getAttribute("aria-label")).toBe("Search results");
  expect(combobox.hasAttribute("data-initial-focus")).toBe(true);
  const group = find(listbox, '[role="group"]');
  const heading = document.getElementById(group.getAttribute("aria-labelledby")!);
  expect(heading).not.toBeNull();
  expect(heading!.textContent).toBe("Projects");
  expect(active(container).textContent).toContain(initial[0]);
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(3);
  expect(container.querySelectorAll('[role="option"][aria-selected="false"]')).toHaveLength(2);
  expect(container.querySelectorAll("form")).toHaveLength(0);
});

it("status는 listbox 밖에 서고 listbox의 직계 자식은 option/group뿐이다", async () => {
  const { container } = await render(<Fixture />);
  const listbox = find(container, '[role="listbox"]');
  const status = find(container, '[role="status"]');
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(listbox.contains(status)).toBe(false);
  expect([...listbox.children].every(node => ["option", "group"].includes(node.getAttribute("role") ?? ""))).toBe(true);
  const group = find(listbox, '[role="group"]');
  const heading = document.getElementById(group.getAttribute("aria-labelledby")!);
  expect(heading).not.toBeNull();
  expect(heading!.classList.contains("text-xs")).toBe(true);
  expect(heading!.classList.contains("font-medium")).toBe(true);
});

it("입력은 공통 Input 글리프 슬롯·전폭 선·테두리 없는 형을 쓴다", async () => {
  const { container } = await render(<Fixture />);
  const combobox = find<HTMLInputElement>(container, "input");
  expect(combobox.classList.contains("border-0")).toBe(true);
  expect(find(container, "svg").closest('[aria-hidden="true"]')).not.toBeNull();
  expect(combobox.closest(".border-b")).not.toBeNull();
});

it("↑↓가 DOM 순서대로 순환하고 선택 힌트는 활성 행에만 선다", async () => {
  const { container } = await render(<Fixture />);
  const combobox = find<HTMLInputElement>(container, "input");
  await key(combobox, "ArrowUp");
  expect(active(container).textContent).toContain(initial[2]);
  await key(combobox, "ArrowDown");
  expect(active(container).textContent).toContain(initial[0]);
  await key(combobox, "ArrowDown");
  expect(active(container).textContent).toContain(initial[1]);
  expect(container.querySelectorAll("kbd")).toHaveLength(1);
  expect(find(active(container), "kbd").textContent).toBe("↵");
  expect(active(container).textContent).toContain("Go to");
});

it("Enter는 활성 option 안 실제 링크의 click을 부른다", async () => {
  const onNavigate = vi.fn(noNavigation);
  const { container } = await render(<Fixture onNavigate={onNavigate} />);
  const combobox = find<HTMLInputElement>(container, "input");
  await key(combobox, "ArrowDown");
  const anchor = find<HTMLAnchorElement>(active(container), "a[href]");
  const click = vi.spyOn(anchor, "click");
  await key(combobox, "Enter");
  expect(click).toHaveBeenCalledTimes(1);
  expect(onNavigate).toHaveBeenCalledTimes(1);
});

it("조합 중과 keyCode 229의 Enter·방향키는 무시하고 조합 끝에는 선택한다", async () => {
  const onNavigate = vi.fn(noNavigation);
  const { container } = await render(<Fixture onNavigate={onNavigate} />);
  const combobox = find<HTMLInputElement>(container, "input");
  await key(combobox, "ArrowDown", { isComposing: true });
  await key(combobox, "Enter", { isComposing: true });
  await key(combobox, "Enter", { keyCode: 229 });
  expect(active(container).textContent).toContain(initial[0]);
  expect(onNavigate).not.toHaveBeenCalled();
  await act(async () => { combobox.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
  await key(combobox, "Enter");
  expect(onNavigate).not.toHaveBeenCalled();
  await act(async () => { combobox.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); });
  await key(combobox, "Enter");
  expect(onNavigate).toHaveBeenCalledTimes(1);
});

it("hover와 mousedown이 입력 포커스를 유지하고 활성 항목만 바꾼다", async () => {
  const { container } = await render(<Fixture />);
  const combobox = find<HTMLInputElement>(container, "input");
  combobox.focus();
  const options = container.querySelectorAll<HTMLElement>('[role="option"]');
  const user = userEvent.setup();
  await act(async () => { await user.hover(options[2]!); });
  expect(active(container)).toBe(options[2]);
  expect(document.activeElement).toBe(combobox);
  await act(async () => { await user.pointer({ target: find(options[1]!, "a"), keys: "[MouseLeft>]" }); });
  expect(document.activeElement).toBe(combobox);
});

it("실제 링크는 tabIndex -1이고 Tab·Shift+Tab이 결과 링크를 순회하지 않는다", async () => {
  const { container } = await render(<><button>Before</button><Fixture /><button>After</button></>);
  const combobox = find<HTMLInputElement>(container, "input");
  expect([...container.querySelectorAll<HTMLAnchorElement>("a")].every(anchor => anchor.tabIndex === -1)).toBe(true);
  expect([...container.querySelectorAll<HTMLElement>('[role="option"]')].every(option => option.tabIndex === -1)).toBe(true);
  combobox.focus();
  const user = userEvent.setup();
  await act(async () => { await user.tab(); });
  expect(document.activeElement?.textContent).toBe("After");
  await act(async () => { await user.tab({ shift: true }); await user.tab({ shift: true }); });
  expect(document.activeElement?.textContent).toBe("Before");
});

it("활성 항목 변경을 scrollIntoView nearest로 보낸다", async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  const { container } = await render(<Fixture />);
  await key(find(container, "input"), "ArrowDown");
  expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  expect(scroll.mock.contexts.at(-1)).toBe(active(container));
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

it("그룹이 앞에 도착해도 활성 ID를 유지하고 제거·질의 변경은 첫 ID로 돌아간다", async () => {
  const view = await render(<Fixture />);
  await key(find(view.container, "input"), "ArrowDown");
  const previous = active(view.container).id;
  await view.rerender(<Fixture ids={["project/new", ...initial]} />);
  expect(active(view.container).id).toBe(previous);
  await view.rerender(<Fixture ids={["project/new", initial[2]!]} />);
  expect(active(view.container).textContent).toContain("project/new");
  await key(find(view.container, "input"), "ArrowDown");
  await view.rerender(<Fixture ids={["project/new", initial[2]!]} query="new" />);
  expect(active(view.container).textContent).toContain("project/new");
});

it("0건은 active-descendant를 없애고 Enter·↑↓가 링크를 부르지 않는다", async () => {
  const onNavigate = vi.fn(noNavigation);
  const view = await render(<Fixture onNavigate={onNavigate} />);
  await view.rerender(<Fixture ids={[]} onNavigate={onNavigate} />);
  const combobox = find<HTMLInputElement>(view.container, "input");
  expect(combobox.hasAttribute("aria-activedescendant")).toBe(false);
  await key(combobox, "ArrowUp");
  await key(combobox, "ArrowDown");
  await key(combobox, "Enter");
  expect(onNavigate).not.toHaveBeenCalled();
  await view.rerender(<Fixture ids={["docs/new"]} />);
  expect(active(view.container).textContent).toContain("docs/new");
});

it("여러 Command의 list·group·option DOM ID가 충돌하지 않는다", async () => {
  const { container } = await render(<><Fixture /><Fixture /></>);
  const ids = [...container.querySelectorAll("[id]")].map(node => node.id);
  expect(ids.length).toBeGreaterThan(6);
  expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
  for (const combobox of container.querySelectorAll("input")) {
    expect(document.getElementById(combobox.getAttribute("aria-activedescendant")!)).not.toBeNull();
  }
});

it("결과 수 공지는 디바운스하고 빠른 변경을 마지막 수 하나로 합친다", async () => {
  vi.useFakeTimers();
  const view = await render(<Fixture />);
  const announce = find(view.container, '.sr-only[aria-live="polite"]');
  expect(announce.textContent).toBe("");
  await act(async () => { vi.advanceTimersByTime(200); });
  await view.rerender(<Fixture ids={["a"]} />);
  await act(async () => { vi.advanceTimersByTime(200); });
  await view.rerender(<Fixture ids={[]} />);
  await act(async () => { vi.advanceTimersByTime(300); });
  expect(announce.textContent).toBe("0 results");
  await view.rerender(<Fixture ids={["a"]} />);
  await act(async () => { vi.advanceTimersByTime(300); });
  expect(announce.textContent).toBe("1 result");
});

it("입력 변경은 문자열 그대로 호출부에 돌려준다", async () => {
  const onValueChange = vi.fn();
  const { container } = await render(<Fixture onValueChange={onValueChange} />);
  await input(find<HTMLInputElement>(container, "input"), "a  b\tİ");
  expect(onValueChange).toHaveBeenCalledWith("a  b\tİ");
});

it.each(["mouse", "Enter"])("%s 선택은 document 이탈 가드보다 먼저 알리고 실제 capture 클릭을 보낸다", async mode => {
  const order: string[] = [];
  const onNavigate = () => { order.push("close"); };
  const guard = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
    order.push("guard");
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener("click", guard, true);
  try {
    // 편집 화면의 가드는 검색을 열기 전부터 붙어 있다. 뒤에 붙이면 같은 document capture도 통과한다.
    const view = await render(<Fixture onNavigate={onNavigate} />);
    if (mode === "mouse") await act(async () => { find<HTMLAnchorElement>(active(view.container), "a").click(); });
    else await key(find(view.container, "input"), "Enter");
    expect(order).toEqual(["close", "guard"]);
  } finally { document.removeEventListener("click", guard, true); }
});

it("선택 콜백은 클릭의 기본 동작을 막을 수 있고 중첩 제목 클릭도 한 번 받는다", async () => {
  const onNavigate = vi.fn(noNavigation);
  const view = await render(<Command ids={["key"]} query="">
    <CommandInput value="" onValueChange={() => {}} label="Search" placeholder="Search…" />
    <CommandList label="Search results"><CommandItem id="key" href="/key" icon={<Search />} title={<Highlight segments={[{ text: "key", match: true }]} />}
      context="project · source" description={<Highlight segments={[{ text: "a  b\t\n", match: true }]} />}
      badge={<Badge>Archived</Badge>} onNavigate={onNavigate} /></CommandList>
  </Command>);
  const option = active(view.container);
  expect(option.textContent).toContain(" · project · source");
  expect(find(option, ".truncate.whitespace-nowrap").textContent).toBe("a  b\t\n");
  expect(find(option, "svg").closest('[aria-hidden="true"]')).not.toBeNull();
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { find(option, "mark").dispatchEvent(event); });
  expect(onNavigate).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
});

it("선택 listener는 unmount 뒤 제거되어 예전 href를 열지 않는다", async () => {
  const onNavigate = vi.fn(noNavigation);
  const view = await render(<Fixture onNavigate={onNavigate} />);
  const anchor = find<HTMLAnchorElement>(active(view.container), "a");
  await view.rerender(null);
  document.body.append(anchor);
  anchor.addEventListener("click", event => event.preventDefault());
  try { await act(async () => { anchor.click(); }); expect(onNavigate).not.toHaveBeenCalled(); }
  finally { anchor.remove(); }
});
