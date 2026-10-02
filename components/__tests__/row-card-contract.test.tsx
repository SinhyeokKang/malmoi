// @vitest-environment jsdom
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";

import { BannerLine } from "@/components/ui/row-card";
import { EmptyState } from "@/components/ui/empty-state";
import { CardList } from "@/components/ui/card";

import { find, render } from "./helpers/dom";

describe("BannerLine root tone contract", () => {
  it.each([
    [undefined, "text-muted-foreground"],
    ["muted", "text-muted-foreground"],
    ["warning", "text-amber-800"],
    ["danger", "text-destructive"],
  ] as const)("tone %s preserves the alpha divider and independent icon/text/action slots", async (tone, color) => {
    const { container } = await render(<BannerLine id="reason" tone={tone} icon={<Inbox aria-hidden />} action={<a href="/account">Reconnect</a>}>
      <em>Connection unavailable</em>
    </BannerLine>);
    const root = find(container, "#reason");
    expect(root.tagName).toBe("DIV");
    expect(root.getAttribute("data-tone")).toBe(tone ?? "muted");
    expect(root.querySelector("span")?.hasAttribute("data-tone")).toBe(false);
    expect(root.children).toHaveLength(3);
    expect(root.children[0]?.tagName.toLowerCase()).toBe("svg");
    expect(root.children[1]?.tagName).toBe("SPAN");
    expect(root.children[1]?.querySelector("em")?.textContent).toBe("Connection unavailable");
    expect(root.children[2]?.getAttribute("href")).toBe("/account");
    expect(root.children[1]?.classList.contains("truncate")).toBe(true);
    for (const token of [color, "pl-14", "border-foreground/[0.06]", "bg-foreground/[0.02]", "border-t", "text-xs"]) expect(root.classList.contains(token), token).toBe(true);
    expect(root.getAttribute("role")).toBeNull();
  });

  it("avatar indent changes only alignment, and absent slots leave just the description", async () => {
    const { container } = await render(<BannerLine indent="avatar">Last owner</BannerLine>);
    const root = find(container, "div");
    expect(root.getAttribute("data-tone")).toBe("muted");
    expect(root.classList.contains("pl-15")).toBe(true);
    expect(root.classList.contains("pl-14")).toBe(false);
    expect(root.children).toHaveLength(1);
    expect(root.firstElementChild?.textContent).toBe("Last owner");
  });
});

describe("EmptyRowCard before the API rename", () => {
  it.each([false, true])("inset=%s keeps the distinct card shape and two paragraph slots", async (inset) => {
    const { container } = await render(<EmptyState placement={inset ? "inset" : "card"} icon={Inbox} title="No invitations" description="Invite someone to get started." action={<a href="/invite">Invite</a>} />);
    const root = find(container, "div");
    const [tile, copy, action] = [...root.children];
    expect(root.children).toHaveLength(3);
    expect(tile?.classList.contains("size-10")).toBe(true);
    expect(tile?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(copy?.tagName).toBe("DIV");
    expect([...copy!.children].map(node => [node.tagName, node.textContent])).toEqual([
      ["P", "No invitations"], ["P", "Invite someone to get started."],
    ]);
    expect(copy?.classList.contains("gap-1.5")).toBe(true);
    expect(copy?.children[0]?.classList.contains("text-base")).toBe(true);
    expect(copy?.children[1]?.classList.contains("max-w-[46ch]")).toBe(true);
    expect(copy?.children[1]?.classList.contains("leading-relaxed")).toBe(true);
    expect(action?.getAttribute("href")).toBe("/invite");
    expect(root.classList.contains("border")).toBe(!inset);
    expect(root.classList.contains("rounded-lg")).toBe(!inset);
    expect(root.classList.contains("border-t")).toBe(false);
    const shape = inset ? ["p-8", "gap-2.5"] : ["px-6", "py-12", "gap-3.5", "bg-background"];
    for (const token of shape) expect(root.classList.contains(token), token).toBe(true);
    expect(root.querySelector('[role="alert"], [role="status"]')).toBeNull();
  });

  it("does not create an action wrapper when no action is supplied", async () => {
    const { container } = await render(<EmptyState placement="card" icon={Inbox} title="No invitations" description="Nothing pending." />);
    const root = find(container, "div");
    expect(root.children).toHaveLength(2);
    expect(root.querySelector("a, button")).toBeNull();
  });
});

it("CardList forwards native aria-labelledby to the unchanged list", async () => {
  const { container } = await render(<><h2 id="members">Members</h2><CardList aria-labelledby="members"><li>Member</li></CardList></>);
  const list = find(container, "ul");
  expect(list.getAttribute("aria-labelledby")).toBe("members");
  expect(document.getElementById(list.getAttribute("aria-labelledby")!)?.textContent).toBe("Members");
  expect(list.classList.contains("@container")).toBe(true);
  expect(list.firstElementChild?.tagName).toBe("LI");
});
