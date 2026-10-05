// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Search } from "lucide-react";

import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandStatus } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { en } from "@/messages/en";
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
    <CommandStatus lines={[{ tone: "muted", text: "Searching keys…" }]} />
    <CommandList label="Search results">
      <CommandGroup heading="Projects">
        {ids.map(id => <CommandItem key={id} id={id} href={`/${id}`} icon={<Search />} title={id} onNavigate={onNavigate} />)}
      </CommandGroup>
    </CommandList>
  </Command>;
}
/** 실제 포인터 움직임 — 활성 이동은 mousemove에서만 일어난다(#173). */
async function move(target: Element) { await act(async () => { target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true })); }); }
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

/** search-ux-unify C15·C16 — 그룹은 세로 padding 0 + 두 번째부터 위쪽 선 하나, 머리는 `text-gray-dim`(D15). */
it("그룹 머리는 gray-dim·pt-4 pb-1이고 그룹은 세로 padding 없이 사이 선 하나다", async () => {
  const { container } = await render(<Command ids={["a", "b"]} query="">
    <CommandInput value="" onValueChange={() => {}} label="Search" placeholder="Search…" />
    <CommandList label="Results">
      <CommandGroup heading="One"><CommandItem id="a" href="/a" icon={<Search />} title="A" onNavigate={noNavigation} /></CommandGroup>
      <CommandGroup heading="Two"><CommandItem id="b" href="/b" icon={<Search />} title="B" onNavigate={noNavigation} /></CommandGroup>
    </CommandList>
  </Command>);
  const groups = [...container.querySelectorAll<HTMLElement>('[role="group"]')];
  expect(groups).toHaveLength(2);
  for (const group of groups) {
    const classes = [...group.classList];
    expect(classes.filter(token => /^(?:p|py|pt|pb)-/.test(token)), group.className).toEqual([]);
    expect(classes).toEqual(expect.arrayContaining(["not-first:border-t", "not-first:border-divider"]));
    const heading = document.getElementById(group.getAttribute("aria-labelledby")!)!;
    expect([...heading.classList]).toEqual(expect.arrayContaining(["px-4", "pt-4", "pb-1", "text-xs", "font-medium", "text-gray-dim"]));
    expect(heading.classList.contains("text-foreground")).toBe(false);
  }
  expect(find(container, '[role="listbox"]').classList.contains("py-2")).toBe(true);
});

/** C15·C16·C19 — 행은 `ListRow`(폭을 꽉 채우는 `px-4 py-row-y`), 활성은 `selected` 7% 하나, 힌트는 늘 자리를 차지한다. */
it("행은 option 안의 ListRow이고 활성 면만 칠하며 힌트가 모든 행에 자리를 지킨다", async () => {
  const { container } = await render(<Fixture />);
  const options = [...container.querySelectorAll<HTMLElement>('[role="option"]')];
  const links = options.map(option => find<HTMLAnchorElement>(option, "a[href]"));
  for (const link of links) {
    expect([...link.classList]).toEqual(expect.arrayContaining(["flex", "items-center", "gap-3", "px-4", "py-row-y", "text-sm"]));
    for (const gone of ["border", "border-ring", "rounded-md", "mx-2", "bg-accent", "hover:bg-foreground/[0.03]"]) expect(link.classList.contains(gone), gone).toBe(false);
    expect(link.getAttribute("aria-current")).not.toBe("true");
  }
  expect(links[0]!.classList.contains("bg-foreground/[0.07]")).toBe(true);
  // 비활성 행엔 hover 면 자체가 없다(`ListRow hoverFill={false}` — 예전 `hover:bg-transparent` 덮어쓰기와 같은 계산값).
  expect(links.slice(1).every(link => !link.classList.contains("bg-foreground/[0.07]") && ![...link.classList].some(token => token.startsWith("hover:bg-")))).toBe(true);
  expect(container.querySelectorAll('[role="option"] kbd')).toHaveLength(options.length);
  const hints = options.map(option => find(option, "kbd").parentElement!);
  const before = hints.map(hint => hint.className.replace(/\binvisible\b/, "").trim());
  expect(hints.map(hint => hint.classList.contains("invisible"))).toEqual([false, true, true]);
  for (const hint of hints) expect([...hint.classList]).toEqual(expect.arrayContaining(["hidden", "sm:flex"]));
  await key(find(container, "input"), "ArrowDown");
  expect(hints.map(hint => hint.classList.contains("invisible"))).toEqual([true, false, true]);
  // 폭 분기(`hidden sm:flex`)는 활성과 무관하다 — 활성을 바꿔도 invisible 말고는 클래스가 그대로다.
  expect(hints.map(hint => hint.className.replace(/\binvisible\b/, "").trim())).toEqual(before);
});

it("긴 제목·맥락·설명은 각각 한 줄로 자른다", async () => {
  const { container } = await render(<Command ids={["long"]} query="">
    <CommandList label="Results"><CommandItem id="long" href="/long" icon={<Search />} title={"x".repeat(300)} context="project · source" description={"y".repeat(300)} onNavigate={noNavigation} /></CommandList>
  </Command>);
  const option = find(container, '[role="option"]');
  const title = [...option.querySelectorAll("span")].find(span => span.textContent?.startsWith("xxx") && span.classList.contains("truncate"));
  expect(title).toBeDefined();
  expect(title!.classList.contains("block")).toBe(true);
  expect(title!.textContent).toContain(" · project · source");
  const description = [...option.querySelectorAll("span")].find(span => span.textContent === "y".repeat(300) && span.classList.contains("truncate"));
  expect(description?.classList.contains("block")).toBe(true);
});

/** C18·C19 — 입력 줄 `h-12 pl-3 pr-4`, 지우기 X, 맨 끝 Esc 칩(좁은 폭에선 숨김). */
it("입력 줄은 h-12 pl-3 pr-4이고 지우기 X와 끝의 Esc 칩을 든다", async () => {
  const onValueChange = vi.fn();
  const { container } = await render(<Command ids={[]} query="abc">
    <CommandInput value="abc" onValueChange={onValueChange} label="Search" placeholder="Search…" />
    <CommandList label="Results">{null}</CommandList>
  </Command>);
  const combobox = find<HTMLInputElement>(container, '[role="combobox"]');
  const row = combobox.closest(".border-b")!;
  expect([...row.classList]).toEqual(expect.arrayContaining(["flex", "h-12", "items-center", "gap-2", "pl-3", "pr-4", "border-divider"]));
  const esc = find(row, "kbd");
  expect(esc.textContent).toBe(en.common.keys.esc);
  expect([...esc.parentElement!.classList]).toEqual(expect.arrayContaining(["hidden", "sm:inline-flex"]));
  expect(row.lastElementChild).toBe(esc.parentElement);
  const clear = find<HTMLButtonElement>(row, `button[aria-label="${en.common.clearSearch}"]`);
  expect(clear.type).toBe("button");
  await act(async () => { clear.click(); });
  expect(onValueChange).toHaveBeenLastCalledWith("");
});

/**
 * ⚠️ **Enter·↑↓의 주인은 combobox 입력이다** (R-B1 R1) — 루트가 대상과 무관하게 Enter를 잡으면, Tab으로 닿는 지우기 X에서
 * Enter를 눌렀을 때 버튼 활성화가 취소되고 활성 결과로 이동한다(POSTMORTEM 2026-09-08과 같은 축: Enter의 주인이 누구인가).
 */
it("지우기 X에서 Enter·↑↓는 그 버튼의 것이다 — 결과로 이동하지 않는다", async () => {
  const onValueChange = vi.fn();
  const onNavigate = vi.fn(noNavigation);
  const { container } = await render(<Command ids={["a", "b"]} query="abc">
    <CommandInput value="abc" onValueChange={onValueChange} label="Search" placeholder="Search…" />
    <CommandList label="Results">
      <CommandItem id="a" href="/a" icon={<Search />} title="A" onNavigate={onNavigate} />
      <CommandItem id="b" href="/b" icon={<Search />} title="B" onNavigate={onNavigate} />
    </CommandList>
  </Command>);
  const clear = find<HTMLButtonElement>(container, `button[aria-label="${en.common.clearSearch}"]`);
  const user = userEvent.setup();
  clear.focus();
  await act(async () => { await user.keyboard("{ArrowDown}"); });
  expect(active(container).textContent).toContain("A");
  await act(async () => { await user.keyboard("{Enter}"); });
  expect(onNavigate).not.toHaveBeenCalled();
  expect(onValueChange).toHaveBeenCalledTimes(1);
  expect(onValueChange).toHaveBeenLastCalledWith("");
});

/** C3 — 상태 줄은 한 묶음(`px-4 pt-2` · 줄 사이 4)이고 실패 줄만 빨강이다. 줄이 없으면 묶음도 없다. */
it("상태 줄 묶음과 톤", async () => {
  const view = await render(<Command ids={[]} query="">
    <CommandStatus lines={[{ tone: "muted", text: "Loading docs…" }, { tone: "danger", text: "Keys failed." }]} />
  </Command>);
  const status = find(view.container, '[role="status"]');
  expect([...status.classList]).toEqual(expect.arrayContaining(["flex", "flex-col", "gap-1", "px-4", "pt-2", "text-xs", "leading-normal"]));
  const lines = [...status.querySelectorAll<HTMLElement>("[data-tone]")];
  expect(lines.map(line => [line.dataset.tone, line.textContent])).toEqual([["muted", "Loading docs…"], ["danger", "Keys failed."]]);
  expect(lines[0]!.classList.contains("text-muted-foreground")).toBe(true);
  expect(lines[1]!.classList.contains("text-destructive")).toBe(true);
  await view.rerender(<Command ids={[]} query=""><CommandStatus lines={[]} /></Command>);
  // 줄이 없어도 live region은 숨김 없이 남는다 — 숨은 영역이 내용과 함께 나타나는 순간은 낭독이 보장되지 않는다(R-B1 Y4).
  // 빈 묶음은 높이만 없앤다(`pt-2`는 줄이 있을 때만).
  const empty = find(view.container, '[role="status"]');
  expect(empty.textContent).toBe("");
  for (const token of empty.classList) expect(token, token).not.toMatch(/(?:^|:)hidden$/);
  expect(empty.classList.contains("pt-2")).toBe(false);
  expect(empty.getAttribute("aria-live")).toBe("polite");
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
  expect(container.querySelectorAll('[role="option"] kbd')).toHaveLength(initial.length);
  expect(find(active(container), "kbd").textContent).toBe(en.common.keys.enter);
  expect(find(active(container), "kbd").parentElement?.classList.contains("invisible")).toBe(false);
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
  await move(options[2]!);
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

/**
 * **멈춘 포인터 아래 행이 그려져도 활성은 옮겨지지 않는다** (#173 — QA2). Chrome은 렌더 뒤 포인터 아래 새 요소에 mouseover·mouseenter를
 * 쏜다(mousemove 0). 그것으로 활성을 옮기면 ⌘K 직전에 커서가 놓인 자리의 행이 활성이 되고 `moved`가 서서 첫 행 규칙이 꺼진다.
 */
it("mouseover·mouseenter만으로는 활성이 첫 행 그대로이고, mousemove가 와야 그 행으로 옮겨 늦은 그룹에도 지킨다", async () => {
  const view = await render(<Fixture ids={["docs/a", "docs/b", "docs/go"]} />);
  const options = () => view.container.querySelectorAll<HTMLElement>('[role="option"]');
  await act(async () => {
    options()[2]!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    options()[2]!.dispatchEvent(new MouseEvent("mouseenter"));
    find(options()[2]!, "a").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  expect(active(view.container).textContent).toContain("docs/a");
  // 아직 "옮기지 않음"이라 늦게 온 그룹이 위에 끼면 첫 행을 따른다.
  await view.rerender(<Fixture ids={["key/1", "docs/a", "docs/b", "docs/go"]} />);
  expect(active(view.container).textContent).toContain("key/1");
  await move(find(options()[3]!, "a"));
  expect(active(view.container).textContent).toContain("docs/go");
  await view.rerender(<Fixture ids={["project/x", "key/1", "docs/a", "docs/b", "docs/go"]} />);
  expect(active(view.container).textContent).toContain("docs/go");
});

// 첫 행 위에서 포인터를 움직인 것도 선택이다 — 그 뒤 늦은 그룹이 위에 끼어도 그 행을 지킨다.
it("이미 활성인 첫 행 위의 mousemove도 옮김으로 친다", async () => {
  const view = await render(<Fixture ids={["docs/a", "docs/go"]} />);
  await move(view.container.querySelectorAll('[role="option"]')[0]!);
  await view.rerender(<Fixture ids={["key/1", "docs/a", "docs/go"]} />);
  expect(active(view.container).textContent).toContain("docs/a");
});

/**
 * **사용자가 옮기기 전엔 활성이 첫 행을 따라간다** (2026-10-03 사용자 — QA: 첫 열림에 늦게 온 Docs·Keys 때문에 활성이 `Go to docs`나
 * 아래 Docs 행에 머물러 Enter의 목적지가 응답 순서에 달렸다). ↑↓·hover로 옮긴 뒤에만 늦은 그룹 도착에도 그 id를 지킨다.
 */
it("옮기기 전엔 늦게 온 그룹이 위에 끼어도 활성이 첫 행이고, hover로 옮기면 그 id를 지킨다", async () => {
  const view = await render(<Fixture ids={["docs/go"]} />);
  expect(active(view.container).textContent).toContain("docs/go");
  await view.rerender(<Fixture ids={["docs/a", "docs/b", "docs/go"]} />);
  expect(active(view.container).textContent).toContain("docs/a");
  await view.rerender(<Fixture ids={["key/1", "docs/a", "docs/b", "docs/go"]} />);
  expect(active(view.container).textContent).toContain("key/1");
  const options = view.container.querySelectorAll<HTMLElement>('[role="option"]');
  await move(options[2]!);
  expect(active(view.container).textContent).toContain("docs/b");
  await view.rerender(<Fixture ids={["project/x", "key/1", "docs/a", "docs/b", "docs/go"]} />);
  expect(active(view.container).textContent).toContain("docs/b");
  // 질의가 바뀌면 다시 "옮기지 않음" — 첫 행이고, 이어서 늦게 온 그룹도 첫 행을 따른다.
  await view.rerender(<Fixture ids={["docs/b", "docs/go"]} query="b" />);
  expect(active(view.container).textContent).toContain("docs/b");
  await view.rerender(<Fixture ids={["key/b", "docs/b", "docs/go"]} query="b" />);
  expect(active(view.container).textContent).toContain("key/b");
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
