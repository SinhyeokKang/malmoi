// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectMenuItem, ProjectMenuItemSkeleton } from "@/components/shell/project-menu-item";
import { UserMenu } from "@/components/shell/user-menu";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
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
    en.common.nav.inbox,
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

/**
 * **프로젝트 행 조각** (user-menu-projects D3) — 스위처와 사용자 메뉴가 같은 행을 쓴다. 골격은 행과 같은 파일에 서고
 * 같은 패딩·gap·썸네일 슬롯이다(POSTMORTEM 2026-09-16 · 2026-10-08 — 골격이 실물과 따로 떠내려갔다).
 */
describe("ProjectMenuItem", () => {
  const project = { slug: "demo", name: "Demo", archived: false, image: null };
  async function menu(children: ReactNode) {
    await render(<DropdownMenu open><DropdownMenuContent>{children}</DropdownMenuContent></DropdownMenu>);
    return document.querySelector<HTMLElement>('[role="menu"]')!;
  }
  const ROW = ["mx-1", "flex", "items-center", "gap-2", "px-2", "py-1.5", "text-sm"];

  it("골격 줄과 실물 행이 같은 패딩·gap이고, 첫 자식이 같은 16 썸네일 슬롯이다", async () => {
    const root = await menu(<><ProjectMenuItem project={project} /><ProjectMenuItemSkeleton /></>);
    const row = root.querySelector<HTMLElement>('[role="menuitem"]')!;
    const skeleton = root.querySelector<HTMLElement>("[data-project-menu-item-skeleton]")!;
    for (const cls of ROW) {
      expect(row.classList.contains(cls)).toBe(true);
      expect(skeleton.classList.contains(cls)).toBe(true);
    }
    for (const node of [row, skeleton]) {
      const slot = node.firstElementChild as HTMLElement;
      expect(slot.classList.contains("size-4")).toBe(true);
      expect(slot.classList.contains("shrink-0")).toBe(true);
    }
    // 이름 줄은 text-sm line box 하나다 — 골격도 `Skeleton size="sm"`이 같은 줄 높이를 세운다.
    expect(skeleton.querySelector("[data-skeleton-line]")?.classList.contains("text-sm")).toBe(true);
    // 골격은 한 줄이다 — 실물보다 길지 않다.
    expect(skeleton.querySelectorAll("[data-skeleton-line]")).toHaveLength(1);
  });

  it("골격은 메뉴 항목이 아니고 포커스를 받지 않으며 스크린리더에 숨는다", async () => {
    const root = await menu(<ProjectMenuItemSkeleton />);
    const skeleton = root.querySelector<HTMLElement>("[data-project-menu-item-skeleton]")!;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.getAttribute("role")).toBeNull();
    expect(skeleton.hasAttribute("tabindex")).toBe(false);
    expect(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')).toHaveLength(0);
  });

  it("`selected`를 안 주면 일반 `menuitem`이고, 주면 `menuitemradio` + `aria-checked`다", async () => {
    const root = await menu(<>
      <ProjectMenuItem project={project} />
      <ProjectMenuItem project={{ ...project, slug: "a", name: "A" }} selected={false} />
      <ProjectMenuItem project={{ ...project, slug: "b", name: "B" }} selected />
    </>);
    expect([...root.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')].map((n) => [n.getAttribute("role"), n.getAttribute("aria-checked")])).toEqual([
      ["menuitem", null],
      ["menuitemradio", "false"],
      ["menuitemradio", "true"],
    ]);
  });

  it("행은 그 프로젝트 Home 링크이고 이름은 줄여 쓰며, 보관이면 Archived 배지를 단다", async () => {
    const root = await menu(<>
      <ProjectMenuItem project={project} />
      <ProjectMenuItem project={{ ...project, slug: "old", name: "Old", archived: true }} />
    </>);
    const [live, old] = [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(live!.tagName).toBe("A");
    expect(live!.getAttribute("href")).toBe(routes.project("demo"));
    const name = [...live!.children].find((n) => n.textContent === "Demo") as HTMLElement;
    for (const cls of ["min-w-0", "flex-1", "truncate"]) expect(name.classList.contains(cls)).toBe(true);
    expect(live!.textContent).not.toContain(en.projects.status.archived);
    expect(old!.textContent).toContain(en.projects.status.archived);
  });

  it("나머지 props를 항목으로 넘긴다 — 스위처의 포인터 핸들러가 닿는다", async () => {
    const onPointerMove = vi.fn();
    const root = await menu(<ProjectMenuItem project={project} onPointerMove={onPointerMove} />);
    const row = root.querySelector<HTMLElement>('[role="menuitem"]')!;
    await act(async () => { row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" })); });
    expect(onPointerMove).toHaveBeenCalled();
  });
});
