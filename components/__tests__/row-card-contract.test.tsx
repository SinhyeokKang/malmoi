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
    ["warning", "text-warning-soft-foreground"],
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
    // 640 이상은 한 줄 말줄임 그대로, 그릇 640 미만은 줄바꿈이다(#234 — 아래 describe).
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

/**
 * **#234** — 좁은 그릇(컨테이너 640 미만)에서 띠 문장은 말줄임하지 않고 줄바꿈한다. 375에서 `1 unsent edit — pu…`·마지막 오너 사유
 * `A project needs at least one owner. Ma…`처럼 잘렸고 `title`·hover가 없어 터치에서 전문에 닿을 길이 없었다(spec A-02·A-05·A-06).
 * 640 이상은 지금과 같다(1280 한 줄). 액션은 줄지 않는다. 질의는 가장 가까운 컨테이너 — 소비자는 둘 다 `CardList`(`@container`) 안이다.
 * jsdom은 컨테이너 쿼리를 못 재므로 클래스 계약이고, 줄바꿈 실물은 브라우저 프로브가 잰다.
 */
describe("BannerLine — 좁은 그릇에서 줄바꿈 (#234)", () => {
  it("문장 칸이 그릇 640 미만에서 말줄임을 풀고 감긴다", async () => {
    const { container } = await render(<BannerLine id="b" action={<a href="/x">Go</a>}>1 unsent edit — publish to send it.</BannerLine>);
    const text = find(container, "#b").children[0]!;
    for (const cls of ["min-w-0", "truncate", "@max-form:whitespace-normal", "@max-form:text-clip", "@max-form:wrap-break-word"]) {
      expect(text.classList.contains(cls), cls).toBe(true);
    }
  });

  it("글리프와 액션은 줄지 않는다 — 감기는 것은 문장 칸뿐이다", async () => {
    const { container } = await render(<BannerLine id="b" icon={<Inbox aria-hidden />} action={<a href="/x">Go</a>}>text</BannerLine>);
    const root = find(container, "#b");
    expect(root.classList.contains("[&>:not(span)]:shrink-0")).toBe(true);
  });

  it.each(["components/projects/project-list.tsx", "components/members/member-list.tsx", "components/members/pending-invitations.tsx"])("%s — 띠가 `CardList` 컨테이너 안에 선다", async (path) => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(`${process.cwd()}/${path}`, "utf8");
    expect(source).toMatch(/<CardList\b/);
  });

  it("`CardList`가 질의 대상 컨테이너다", async () => {
    const { container } = await render(<CardList><li><BannerLine id="b">x</BannerLine></li></CardList>);
    expect(find(container, "#b").closest("ul")?.classList.contains("@container")).toBe(true);
  });
});
