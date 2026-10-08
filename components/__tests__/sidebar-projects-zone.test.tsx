// @vitest-environment jsdom
import { act, createContext, useContext, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/shell/sidebar";
import { SidebarCollapseContext } from "@/components/shell/sidebar-collapse";
import { setUnread } from "@/lib/inbox/unread-store";
import { routes } from "@/lib/routes";
import type { NavProject } from "@/lib/shell/nav";
import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * **프로젝트 밖 사이드바의 둘째 구역 = 내 프로젝트 목록** (2026-10-09 사용자, sidebar-projects). 지금 프로젝트가 없는 자리
 * (`/projects`·`/projects/new`·`/inbox`·`/mcp`·`/preferences`·`/account`)에서 사용자 구역 아래 구분선 다음에 머리 없는 목록 구역이 선다 —
 * 아바타 메뉴와 같은 앞 5개 + 끝 행 `New project`. 프로젝트 라우트의 구역은 그대로다(`sidebar-identity` 등 무수정).
 *
 * `useLinkStatus`는 App Router 밖(jsdom)에서 늘 `pending: false`라 `sidebar-pending.test.tsx`처럼 가짜 `Link`가 문맥으로 만든다.
 */
const path = vi.hoisted(() => ({ value: "/inbox" }));
const pendingHref = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.value }));
vi.mock("next/link", () => {
  const Status = createContext(false);
  return {
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
      <Status.Provider value={href === pendingHref.value}>
        <a href={href} {...props}>{children}</a>
      </Status.Provider>
    ),
    useLinkStatus: () => ({ pending: useContext(Status) }),
  };
});

const project = (slug: string, extra: Partial<NavProject> = {}): NavProject => ({
  slug, name: `${slug[0]!.toUpperCase()}${slug.slice(1)}`, role: "EDITOR", archived: false, image: null, ...extra,
});
// 멤버십은 slug 오름차순으로 온다(`loadMemberships`). 보관은 목록 구역에서 빠진다.
const memberships: NavProject[] = [
  project("acme", { role: "OWNER", image: "https://blob.example/acme.webp", defaultSurfaceSlug: "app" }),
  project("beta"), project("cargo", { archived: true }), project("delta"), project("echo"), project("fox"), project("golf"),
];

const sidebar = (list: NavProject[] = memberships, collapsed = false) => (
  <SidebarCollapseContext.Provider value={{ collapsed, toggle: () => {} }}>
    <Sidebar memberships={list} userName="Kim" />
  </SidebarCollapseContext.Provider>
);
const zone = (container: ParentNode) => container.querySelector<HTMLElement>(`nav[aria-label="${en.common.nav.yourProjects}"]`);
const rows = (container: ParentNode) => [...(zone(container)?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];

afterEach(() => { setUnread(0); pendingHref.value = ""; });

describe("사이드바 — 프로젝트 밖 목록 구역", () => {
  it("/inbox에서 사용자 구역 / 구분선 / 목록 구역 / 하단 순이다 — 랜드마크 이름은 사용자 이름 · Your projects", async () => {
    path.value = "/inbox";
    const { container } = await render(sidebar());
    const navs = [...container.querySelectorAll("aside > nav")];
    expect(navs.map((nav) => nav.getAttribute("aria-label"))).toEqual(["Kim", "Your projects"]);
    // 구분선은 기존 구역 사이 선 하나다.
    expect(navs[1]?.className.split(" ")).toEqual(expect.arrayContaining(["border-t", "pt-2"]));
    expect(navs[1]?.nextElementSibling?.getAttribute("data-sidebar-zone")).toBe("footer");
  });

  it("행은 보관을 뺀 앞 5개 + New project이고 href는 routes.*다", async () => {
    path.value = "/inbox";
    const { container } = await render(sidebar());
    expect(rows(container).map((a) => a.getAttribute("href"))).toEqual([
      routes.project("acme"), routes.project("beta"), routes.project("delta"), routes.project("echo"), routes.project("fox"), routes.newProject(),
    ]);
    expect(rows(container).map((a) => a.textContent)).toEqual(["Acme", "Beta", "Delta", "Echo", "Fox", en.common.nav.newProject]);
  });

  it("머리 줄이 없다 — 머리 없음이 '지금 프로젝트 아님'의 표시다", async () => {
    path.value = "/projects";
    const { container } = await render(sidebar());
    expect(zone(container)?.querySelector("[data-zone-head]")).toBeNull();
    expect(zone(container)?.querySelector("[data-zone-rail]")).toBeNull();
    expect(zone(container)?.querySelector('[aria-label="Switch project"]')).toBeNull();
    // `/projects`에서는 위 `Projects`만 현재 페이지다.
    expect(container.querySelector('nav[aria-label="Kim"] a[href="/projects"]')?.getAttribute("aria-current")).toBe("page");
    expect(zone(container)?.querySelector("[aria-current]")).toBeNull();
  });

  it("/projects/new에서는 New project만 현재 페이지다 — Projects는 아니다", async () => {
    path.value = routes.newProject();
    const { container } = await render(sidebar());
    expect([...container.querySelectorAll('aside [aria-current="page"]')].map((a) => a.getAttribute("href"))).toEqual([routes.newProject()]);
  });

  it("보관 안 된 프로젝트가 0이면 New project 한 행이다 — 소속 없음 · 보관만", async () => {
    path.value = "/inbox";
    for (const list of [[], [project("old", { archived: true })]]) {
      const { container } = await render(sidebar(list));
      expect(rows(container).map((a) => a.getAttribute("href"))).toEqual([routes.newProject()]);
    }
  });

  it("New project를 누르면 응답 전에 그 행이 pending 면을 든다 (POSTMORTEM 2026-09-17)", async () => {
    path.value = "/inbox";
    pendingHref.value = routes.newProject();
    const { container } = await render(sidebar());
    const last = rows(container).at(-1)!;
    expect(last.querySelector("[data-nav-pending]")).not.toBeNull();
    expect(last.className).toContain("has-[[data-nav-pending]]:bg-foreground/[0.07]");
    expect(container.querySelectorAll("[data-nav-pending]")).toHaveLength(1);
  });
});

/**
 * **프로젝트 행의 얼굴은 `ProjectThumbnail xs`(16)이다** — 아이콘 자리(`span.size-4`)에 아이콘 대신 선다. 라벨 시작점이 아이콘 항목과
 * 같은 세로선에 서야 한다(`sidebar-identity.test.tsx`의 머리 판정과 같은 틀). 굵기는 더하지 않는다(`sidebar-selection`).
 */
describe("사이드바 — 목록 구역 행의 썸네일", () => {
  it("이미지가 있으면 이미지, 없으면 이름 색 폴백 타일이다 — 아이콘 svg가 아니다", async () => {
    path.value = "/inbox";
    const { container } = await render(sidebar());
    const [acme, beta] = rows(container);
    const slotOf = (a: HTMLAnchorElement | undefined) => a?.querySelector(":scope > span.size-4");
    const acmeTile = slotOf(acme)?.firstElementChild;
    expect(acmeTile?.className.split(" ")).toEqual(expect.arrayContaining(["size-4", "rounded"]));
    expect(acmeTile?.querySelector("img")?.getAttribute("src")).toBe("https://blob.example/acme.webp");
    const betaTile = slotOf(beta)?.firstElementChild;
    expect(betaTile?.className.split(" ")).toEqual(expect.arrayContaining(["size-4", "rounded"]));
    expect(betaTile?.querySelector("img")).toBeNull();
    // 폴백은 이름 색 위의 `Box` 글리프 12다 — 항목 아이콘(16 `lucide-box`가 슬롯의 직계 자식)이 아니다.
    expect(slotOf(beta)?.querySelector(":scope > svg")).toBeNull();
    expect(betaTile?.querySelector("svg")?.getAttribute("class")).toContain("size-3");
  });

  it("행 틀과 라벨 시작점이 아이콘 항목과 같다 — 굵기를 더하지 않는다", async () => {
    path.value = "/inbox";
    const { container } = await render(sidebar());
    const thumbRow = rows(container)[0]!;
    // `/inbox`에서 `Projects`는 비선택이라 둘의 틀이 글자 하나 다르지 않아야 한다.
    const iconRow = container.querySelector<HTMLAnchorElement>('nav[aria-label="Kim"] a[href="/projects"]')!;
    expect(thumbRow.className).toBe(iconRow.className);
    expect(thumbRow.querySelector(":scope > span:nth-of-type(2)")?.className).toBe(iconRow.querySelector(":scope > span:nth-of-type(2)")?.className);
    expect(thumbRow.className).not.toContain("font-medium");
  });

  it("New project 행은 Plus 글리프다 — 헤더 버튼·검색 색인과 같은 목적지 = 같은 글리프", async () => {
    path.value = "/inbox";
    const { container } = await render(sidebar());
    expect(rows(container).at(-1)?.querySelector(":scope > span.size-4 > svg.lucide-plus")).not.toBeNull();
  });
});

/**
 * **접힌 레일** (POSTMORTEM 2026-09-08 — 접힌 상태에서만 그려지는 가지가 셸을 죽였다). 프로젝트 밖에서는 썸네일 ≤5 + `Plus`가 이동
 * 링크이고 이름은 `title`이 댄다. 머리 줄·레일 스위처는 없다.
 */
describe("사이드바 — 접힌 레일의 목록 구역", () => {
  it("행마다 title이 이름이고 머리·스위처가 없다", async () => {
    path.value = "/inbox";
    const { container } = await render(sidebar(memberships, true));
    expect(rows(container).map((a) => a.getAttribute("title"))).toEqual(["Acme", "Beta", "Delta", "Echo", "Fox", en.common.nav.newProject]);
    expect(zone(container)?.querySelector("[data-zone-head], [data-zone-rail]")).toBeNull();
    for (const a of rows(container)) expect(a.querySelector(":scope > span.size-4")).not.toBeNull();
  });
});

/**
 * **구역이 바뀐 뒤 포커스가 `body`로 빠지지 않는다** (sidebar-projects D2 · POSTMORTEM 2026-09-20·09-24). 프로젝트 행을 누르면 둘째
 * 구역이 `projects` → `project`로 바뀌어 `<nav key>`가 다시 마운트되고 누른 링크가 사라진다. 그 뒤 새 구역의 현재 항목(Home)에 앉는다.
 *
 * ⚠️ **pathname을 바꿔 실제로 재마운트시킨다** — 제자리 렌더 테스트는 언마운트를 못 본다(POSTMORTEM 2026-09-24).
 * ⚠️ **jsdom에는 focus fixup이 없다** (POSTMORTEM 2026-09-20) — 포커스된 노드가 문서에서 떨어지면 브라우저는 `activeElement`를 `body`로
 * 돌린다. 아래 observer가 그것을 흉내 낸다 — 없으면 "떨어진 링크 위에 남은 포커스"를 잰다.
 */
describe("사이드바 — 구역이 바뀐 뒤 포커스 착지", () => {
  let fixup: MutationObserver | undefined;
  beforeEach(() => {
    fixup = new MutationObserver(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !active.isConnected) active.blur();
    });
    fixup.observe(document.body, { childList: true, subtree: true });
  });
  afterEach(() => { fixup?.disconnect(); });

  async function navigate(rerender: (node: ReactNode) => Promise<void>, to: string) {
    path.value = to;
    await rerender(sidebar());
    // observer 콜백(microtask)까지 흘린다.
    await act(async () => { await Promise.resolve(); });
  }

  it("프로젝트 행에서 이동하면 새 프로젝트 구역의 Home에 앉는다", async () => {
    path.value = "/inbox";
    const { container, rerender } = await render(sidebar());
    const acme = rows(container)[0]!;
    acme.focus();
    expect(document.activeElement).toBe(acme);
    await navigate(rerender, routes.project("acme"));
    expect(acme.isConnected).toBe(false);
    const home = container.querySelector<HTMLAnchorElement>(`nav[aria-label="Acme"] a[href="${routes.project("acme")}"]`)!;
    expect(home.getAttribute("aria-current")).toBe("page");
    expect(document.activeElement).toBe(home);
  });

  it("프로젝트 구역에서 New project 모달 경로로 가면 목록 구역의 New project에 앉는다 — 다른 전이도 같은 규칙", async () => {
    path.value = routes.project("acme");
    const { container, rerender } = await render(sidebar());
    container.querySelector<HTMLAnchorElement>(`nav[aria-label="Acme"] a[href="${routes.project("acme")}"]`)!.focus();
    await navigate(rerender, routes.newProject());
    expect(document.activeElement).toBe(rows(container).at(-1));
  });

  it("포커스가 사이드바 밖에 있으면 옮기지 않는다 — 사용자가 옮긴 포커스를 뺏지 않는다", async () => {
    path.value = "/inbox";
    const { container, rerender } = await render(sidebar());
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await navigate(rerender, routes.project("acme"));
    expect(document.activeElement).toBe(outside);
    expect(container.querySelector('nav[aria-label="Acme"]')).not.toBeNull();
    outside.remove();
  });

  it("구역이 그대로인 이동(사용자 구역 안)은 포커스를 건드리지 않는다", async () => {
    path.value = "/inbox";
    const { container, rerender } = await render(sidebar());
    const mcp = container.querySelector<HTMLAnchorElement>(`nav[aria-label="Kim"] a[href="${routes.mcp()}"]`)!;
    mcp.focus();
    await navigate(rerender, routes.mcp());
    expect(document.activeElement).toBe(mcp);
  });
});
