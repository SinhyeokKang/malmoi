// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { UserMenu } from "@/components/shell/user-menu";
import { en } from "@/messages/en";
import { routes } from "@/lib/routes";
import { navWorkItems } from "@/lib/shell/nav";

import { render } from "./helpers/dom";

/**
 * **헤더 사용자 메뉴** (2026-09-27 사용자) — 항목이 필터 메뉴와 같은 `DropdownMenuItem` 모양이고, 순서가
 * `Projects · MCP connector · Preferences · Account | Changelog · Docs · Privacy Policy | Sign out`이다. LNB와 겹치는 항목은 의도다.
 */
async function open() {
  await render(<UserMenu name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} />);
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${en.common.nav.userMenu}"]`)!;
  for (const token of ["size-8", "rounded-full", "px-0"]) expect(trigger.classList.contains(token)).toBe(true);
  await act(async () => userEvent.setup().click(trigger));
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}
/** 메뉴의 줄 — 항목은 라벨, 구분선은 `---`. */
const rows = (menu: HTMLElement) =>
  [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="separator"]')].map((node) =>
    node.getAttribute("role") === "separator" ? "---" : (node.textContent ?? "").trim(),
  );
const item = (menu: HTMLElement, label: string) =>
  [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) => node.textContent?.trim() === label)!;

it("머리 뒤 항목 순서와 구분선이 사용자가 정한 그대로다", async () => {
  const menu = await open();
  expect(menu.textContent).toContain("kim@acme.com");
  expect(rows(menu)).toEqual([
    "---",
    en.common.nav.projects,
    en.common.nav.mcp,
    en.common.nav.preferences,
    en.common.nav.account,
    "---",
    en.changelog.title,
    en.publicDocs.docs.title,
    en.publicDocs.privacy.title,
    "---",
    en.common.nav.signOut,
  ]);
});

/** ⚠️ **New project가 메뉴에 없다** (2026-09-30 사용자) — 앱 셸 헤더의 아바타 왼쪽 버튼으로 옮겼다. */
it("New project 항목이 없다", async () => {
  const menu = await open();
  expect(rows(menu)).not.toContain(en.common.nav.newProject);
  expect(menu.querySelector(`a[href="${routes.newProject()}"]`)).toBeNull();
});

it("항목이 전부 앱 라우트이고 새 탭이 없다 — Changelog도 앱 안 `/changelog`다", async () => {
  const menu = await open();
  expect(item(menu, en.common.nav.projects).getAttribute("href")).toBe(routes.projects());
  expect(item(menu, en.common.nav.account).getAttribute("href")).toBe(routes.account());
  expect(item(menu, en.publicDocs.docs.title).getAttribute("href")).toBe(routes.docs());
  expect(item(menu, en.publicDocs.privacy.title).getAttribute("href")).toBe(routes.privacy());
  const release = item(menu, en.changelog.title);
  expect(release.getAttribute("href")).toBe(routes.changelog());
  // 아이콘은 사이드바 하단의 같은 항목과 같은 `Compass`다 (2026-09-27 사용자).
  expect(release.querySelector("svg")?.getAttribute("class")).toContain("lucide-compass");
  for (const label of [en.common.nav.projects, en.common.nav.account, en.changelog.title, en.publicDocs.docs.title, en.publicDocs.privacy.title]) {
    expect(item(menu, label).hasAttribute("target")).toBe(false);
  }
});

it("모든 항목이 앞 아이콘 하나를 들고, 외부 링크 글리프를 따로 달지 않는다", async () => {
  const menu = await open();
  for (const node of menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
    const icons = node.querySelectorAll("svg");
    expect(icons).toHaveLength(1);
    expect(icons[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(icons[0]!.getAttribute("class")).toContain("size-4");
    expect(node.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  }
});

it("Sign out도 필터 메뉴와 같은 항목 모양이다 — ghost 버튼의 높이·색·radius를 들지 않는다", async () => {
  const menu = await open();
  const signOut = item(menu, en.common.nav.signOut);
  // 항목 자체가 감싼 폼을 제출한다 — 안에 버튼이 없다.
  expect(signOut.querySelector("button")).toBeNull();
  expect(signOut.closest("form")).not.toBeNull();
  const projects = item(menu, en.common.nav.projects);
  // 같은 항목 클래스(`DropdownMenuItem`)를 받고 Button의 크기·색은 없다.
  for (const cls of ["mx-1", "rounded", "px-2", "py-1.5", "text-sm", "hover:bg-accent"]) {
    expect(signOut.classList.contains(cls)).toBe(true);
    expect(projects.classList.contains(cls)).toBe(true);
  }
  for (const cls of ["h-9", "rounded-md", "text-muted-foreground"]) expect(signOut.classList.contains(cls)).toBe(false);
});

/** 첫 묶음이 사이드바 사용자 구역과 같은 목록이다 — 두 벌로 두면 한쪽에만 항목이 는다 (2026-09-27 사용자). */
it("첫 묶음이 `navWorkItems`와 같은 라벨·주소·순서다", async () => {
  const menu = await open();
  const first = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].slice(0, navWorkItems(en).length);
  expect(first.map((node) => [node.textContent?.trim(), node.getAttribute("href")])).toEqual(navWorkItems(en).map((i) => [i.label, i.href]));
  // 메뉴엔 개수 배지가 없다.
  expect(navWorkItems(en).every((i) => i.badge === undefined)).toBe(true);
});
