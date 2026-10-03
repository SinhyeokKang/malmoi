// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SEGMENT, SELECTED, TRACK, UNSELECTED } from "@/components/ui/segment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { find, render } from "./helpers/dom";

// ⚠️ Radix + user-event는 jsdom에서 실시간 지연이 있다(POSTMORTEM 2026-09-13) — 이 파일에만 건다.
vi.setConfig({ testTimeout: 20_000 });

/**
 * Tabs는 `SegmentedControl`(radiogroup)과 **같은 모양의 tablist**다 — 패널 연결과 `tab`·`tabpanel` 역할이 이유다.
 * 선택 칸의 클래스는 jsdom이 CSS를 안 만들어 class 문자열만 보이므로, **JS가 붙인 `SELECTED` 상수**로 단언한다
 * (`data-[state=active]:`로 걸면 Tailwind가 CSS를 안 만드는데 이 테스트는 green이 난다).
 */
const PANELS = [
  { value: "project", label: "Project", body: "Project facts" },
  { value: "sync", label: "Sync", body: "Sync facts" },
  { value: "publish", label: "Publish", body: "Publish facts" },
] as const;

async function setup(defaultValue = "project") {
  const { container } = await render(
    <>
      <Tabs defaultValue={defaultValue}>
        <TabsList label="Project details">
          {PANELS.map((panel) => <TabsTrigger key={panel.value} value={panel.value} label={panel.label} />)}
        </TabsList>
        {PANELS.map((panel) => <TabsContent key={panel.value} value={panel.value}>{panel.body}</TabsContent>)}
      </Tabs>
      <a href="#after">After</a>
    </>,
  );
  const user = userEvent.setup();
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const selected = () => find<HTMLButtonElement>(container, '[role="tab"][aria-selected="true"]');
  const expectSelected = (label: string) => {
    expect(selected().textContent).toBe(label);
    expect(document.activeElement).toBe(selected());
  };
  const press = async (keys: string) => { await act(async () => { await user.keyboard(keys); }); };
  return { container, user, tabs, selected, expectSelected, press };
}

describe("Tabs — roles and panels", () => {
  it("exposes a named tablist, three tabs and only the selected tabpanel", async () => {
    const { container, tabs } = await setup();
    expect(find(container, '[role="tablist"]').getAttribute("aria-label")).toBe("Project details");
    expect(tabs().map((tab) => tab.textContent)).toEqual(["Project", "Sync", "Publish"]);
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });

  it("labels the panel with its tab's name", async () => {
    const { container, selected } = await setup("sync");
    const panel = find(container, '[role="tabpanel"]');
    expect(panel.textContent).toBe("Sync facts");
    expect(panel.getAttribute("aria-labelledby")).toBe(selected().id);
    expect(selected().textContent).toBe("Sync");
  });

  it("unmounts inactive panels instead of hiding them", async () => {
    const { container, user, tabs } = await setup();
    expect(container.textContent).toContain("Project facts");
    expect(container.textContent).not.toContain("Sync facts");
    await act(async () => user.click(tabs()[1]!));
    expect(container.textContent).toContain("Sync facts");
    expect(container.textContent).not.toContain("Project facts");
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });
});

describe("Tabs — keyboard", () => {
  it("Tab enters the selected tab once and moves on to the panel", async () => {
    const { container, user, tabs, expectSelected } = await setup("sync");
    await act(async () => user.tab());
    expectSelected("Sync");
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    await act(async () => user.tab());
    expect(document.activeElement).toBe(find(container, '[role="tabpanel"]'));
  });

  it("ArrowRight selects and focuses the next tab, wrapping at the end", async () => {
    const { user, press, expectSelected } = await setup();
    await act(async () => user.tab());
    for (const label of ["Sync", "Publish", "Project"]) {
      await press("{ArrowRight}");
      expectSelected(label);
    }
  });

  it("ArrowLeft selects and focuses the previous tab, wrapping at the start", async () => {
    const { user, press, expectSelected } = await setup();
    await act(async () => user.tab());
    for (const label of ["Publish", "Sync", "Project"]) {
      await press("{ArrowLeft}");
      expectSelected(label);
    }
  });

  it("Home and End select and focus the first and last tabs", async () => {
    const { user, press, expectSelected } = await setup("sync");
    await act(async () => user.tab());
    await press("{End}");
    expectSelected("Publish");
    await press("{Home}");
    expectSelected("Project");
  });

  it("selecting with the mouse swaps the panel", async () => {
    const { container, user, tabs, selected } = await setup();
    await act(async () => user.click(tabs()[2]!));
    expect(selected().textContent).toBe("Publish");
    expect(find(container, '[role="tabpanel"]').textContent).toBe("Publish facts");
  });
});

describe("Tabs — segment shape", () => {
  it("the track and cells use the shared segment constants", async () => {
    const { container, tabs } = await setup();
    const list = find(container, '[role="tablist"]');
    for (const cls of TRACK.split(" ")) expect(list.classList.contains(cls)).toBe(true);
    expect(list.classList.contains("flex")).toBe(true);
    for (const tab of tabs()) {
      for (const cls of SEGMENT.split(" ")) expect(tab.classList.contains(cls)).toBe(true);
      expect(tab.classList.contains("flex-1")).toBe(true);
    }
  });

  it("only the selected cell carries the SELECTED classes — attached by JS, not data-[state]", async () => {
    const { user, tabs } = await setup();
    const check = (index: number) => tabs().forEach((tab, i) => {
      for (const cls of SELECTED.split(" ")) expect(tab.classList.contains(cls), `${tab.textContent} ${cls}`).toBe(i === index);
      for (const cls of UNSELECTED.split(" ")) expect(tab.classList.contains(cls), `${tab.textContent} ${cls}`).toBe(i !== index);
    });
    check(0);
    await act(async () => user.click(tabs()[1]!));
    check(1);
  });

  it("never styles selection with data-[state=active]: (Tailwind emits no CSS for the interpolated form)", () => {
    expect(readFileSync("components/ui/tabs.tsx", "utf8")).not.toMatch(/data-\[state=active\]/);
  });

  it("renders the segment body — icon, label and count in order", async () => {
    const { container } = await render(
      <Tabs defaultValue="a">
        <TabsList label="View">
          <TabsTrigger value="a" label="All" icon={<svg aria-hidden />} count={2} countLabel="2 keys" />
        </TabsList>
      </Tabs>,
    );
    const tab = find(container, '[role="tab"]');
    expect(tab.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(tab.children[1]?.textContent).toBe("All");
    expect(tab.lastElementChild?.querySelector(".sr-only")?.textContent).toBe("2 keys");
  });
});
