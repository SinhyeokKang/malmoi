// @vitest-environment jsdom
import { createRef } from "react";
import { Search } from "lucide-react";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { Card, CardList, CardRows } from "@/components/ui/card";
import { EmptyState, NoMatch } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Fact } from "@/components/ui/facts";
import { render } from "./helpers/dom";

it.each([undefined, null, <p>Notice</p>])("Card owns exactly one header boundary (%s)", async notice => {
  const { container } = await render(<Card title="Members" titleId="members-title" count={2} countLabel="2 members" badge={<b>Team</b>} description={<em>Description</em>} action={<button>Add</button>} notice={notice}><CardList aria-labelledby="members-title"><li>First</li><li>Second</li></CardList></Card>);
  const section = container.querySelector("section")!;
  expect(section.getAttribute("aria-labelledby")).toBe("members-title");
  const head = container.querySelector("h2")!; head.focus(); expect(document.activeElement).toBe(head);
  expect(head.nextElementSibling?.querySelector("[aria-hidden]")?.textContent).toBe("2");
  expect(container.querySelector("header")?.classList.contains("flex-wrap")).toBe(true);
  expect([...section.children].filter(n => n.classList.contains("border-b"))).toHaveLength(1);
  expect(container.querySelector("li")?.classList.contains("border-t")).toBe(false);
});
it("CardRows retains noninteractive list ownership", async () => {
  const { container } = await render(<Card title="Account"><CardRows><li>One</li></CardRows></Card>);
  expect(container.querySelectorAll("ul > li")).toHaveLength(1);
});
it.each(["page", "card", "inset"] as const)("EmptyState preserves placement %s and node slots", async placement => {
  const { container } = await render(<Card title="Empty"><EmptyState placement={placement} icon={Search} title="Nothing" description={<em>Details</em>} action={<button>Go</button>} /></Card>);
  const root = container.querySelector("section > div")!;
  expect(root.classList.contains("border-t")).toBe(false);
  expect(root.querySelectorAll("p")).toHaveLength(2);
  expect(root.querySelector("p")?.classList.contains(placement === "page" ? "text-lg" : "text-base")).toBe(true);
  expect(root.querySelector("em")?.textContent).toBe("Details");
  expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(root.classList.contains(placement === "inset" ? "p-8" : "py-12")).toBe(true);
});
it("NoMatch has an accessible working exit and SearchX", async () => {
  const clear = vi.fn(); const { container } = await render(<NoMatch title="No match" description="Try again" action={<button onClick={clear}>Clear</button>} />);
  await act(async () => container.querySelector("button")!.click());
  expect(clear).toHaveBeenCalledOnce(); expect(container.querySelector("svg.lucide-search-x")).not.toBeNull();
});
it("ListRow forwards ref, disabled guards, native current and two-line nodes", async () => {
  const ref = createRef<HTMLButtonElement>(); const click = vi.fn();
  const { container, rerender } = await render(<ListRow ref={ref} onClick={click} selected description={<em>Second</em>} aside={<b>Aside</b>}>First</ListRow>);
  expect(ref.current).toBe(container.querySelector("button"));
  expect(ref.current?.getAttribute("aria-current")).toBe("true");
  expect(container.querySelector("[data-row-copy]")?.children[0]?.textContent).toBe("First");
  expect(container.querySelector("[data-row-copy]")?.children[1]?.textContent).toBe("Second");
  await rerender(<ListRow onClick={click} aria-disabled>Blocked</ListRow>);
  await act(async () => container.querySelector("button")!.click());
  expect(click).not.toHaveBeenCalled();
  expect(container.querySelector("button")?.className).not.toContain("hover:");
});
it("ListRow keeps links direct and static rows noninteractive", async () => {
  const { container } = await render(<ul><li id="return"><ListRow href="/logs" ringInset>Event</ListRow></li><ListRow as="li" description="Account">Static</ListRow></ul>);
  expect(container.querySelector("#return > a")?.className).toContain("focus-visible:ring-inset");
  expect(container.querySelector("ul > li:last-child")?.className).not.toContain("hover:");
});
it("Facts preserve fixed widths, stacked slots and table row headers", async () => {
  const { container } = await render(<><dl><Fact width={96} label="Home"><a href="/">Long value</a></Fact><Fact width={120} label="Token">Token value</Fact><Fact layout="stacked" label="Source"><b>Path</b></Fact><Fact layout="inline" label="App">Grants</Fact></dl><table><tbody><Fact as="tr" label="Actor">Name</Fact></tbody></table></>);
  expect(container.querySelectorAll("dt")).toHaveLength(4);
  expect(container.querySelector("dt")?.className).toContain("w-24");
  expect(container.querySelectorAll("dt")[1]?.className).toContain("w-[120px]");
  expect(container.querySelector("th")?.getAttribute("scope")).toBe("row");
  expect(container.querySelector("th")?.className).toContain("w-[104px]");
  for (const label of container.querySelectorAll("dt,th")) expect(label.className).toContain("text-gray-dim");
});

it("Fact right-aligns its value only when asked, and leaves existing consumers unchanged", async () => {
  const { container } = await render(<dl><Fact width={96} label="Plain">Left</Fact><Fact width={96} align="end" label="Meta">Right</Fact></dl>);
  const [plain, aligned] = [...container.querySelectorAll("dd")];
  expect(plain?.className).not.toContain("text-right");
  expect(aligned?.className).toContain("text-right");
  // 라벨 폭은 그대로 고정이라 값의 끝이 한 열로 선다.
  expect(container.querySelectorAll("dt")[1]?.className).toContain("w-24");
  expect(aligned?.className).toContain("min-w-0 flex-1");
});

it("Fact align=end also pushes a block flex child to the end — the primitive owns the whole alignment", async () => {
  const { container } = await render(<dl><Fact width={96} align="end" label="Meta"><span className="flex flex-wrap items-center gap-2"><b>a</b><i>b</i></span></Fact><Fact width={96} label="Plain"><span className="flex flex-wrap gap-2">c</span></Fact></dl>);
  const [aligned, plain] = [...container.querySelectorAll("dd")];
  // 직속 자식의 flex 줄은 `text-right`를 따르지 않는다 — `*:justify-end`가 그 줄을 끝으로 민다.
  expect(aligned?.className).toContain("*:justify-end");
  expect(plain?.className).not.toContain("justify-end");
});

it("translation NoMatch retains text14, py40, gap8 and both exit nodes", async () => {
  const { container } = await render(<NoMatch layout="list" title="No results" action={<><button>Search all</button><button>Clear filters</button></>} />);
  const root = container.firstElementChild!;
  expect(root.classList.contains("py-10")).toBe(true);
  expect(root.classList.contains("gap-2")).toBe(true);
  expect(root.querySelector("p")?.className).toBe("text-sm");
  expect(root.querySelectorAll("button")).toHaveLength(2);
  expect(root.querySelector("svg.lucide-search-x")).not.toBeNull();
});
