// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectMenuItem, ProjectMenuItemSkeleton } from "@/components/shell/project-menu-item";
import { UserMenu } from "@/components/shell/user-menu";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { en } from "@/messages/en";
import { routes } from "@/lib/routes";
import { navWorkItems, type NavProject } from "@/lib/shell/nav";

import { render } from "./helpers/dom";

/**
 * **헤더 사용자 메뉴** (2026-09-27 사용자) — 항목이 필터 메뉴와 같은 `DropdownMenuItem` 모양이고, 순서가
 * `Projects · Inbox · MCP connector · Preferences · Account | 내 프로젝트 ≤5 | Changelog · Docs · Privacy Policy | Sign out`이다.
 * LNB와 겹치는 항목은 의도다 — 프로젝트 그룹은 스위처와 겹친다(user-menu-projects, 2026-10-09 사용자).
 */
const nav = vi.hoisted(() => ({ pathname: "/projects", hrefs: [] as string[] }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: { href: string; children: ReactNode; onClick?: (e: unknown) => void }) => (
    <a href={href} {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); nav.hrefs.push(href); }}>
      {children}
    </a>
  ),
}));
const action = vi.hoisted(() => ({ memberships: vi.fn() }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: vi.fn(), loadSearchMembershipsAction: action.memberships }));
beforeEach(() => {
  nav.pathname = "/projects";
  nav.hrefs = [];
  action.memberships.mockReset();
});

const project = (slug: string, name = slug, archived = false): NavProject => ({ slug, name, role: "OWNER", archived, image: null, defaultSurfaceSlug: null });

async function open(memberships: readonly NavProject[] | undefined = []) {
  await render(<UserMenu name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} memberships={memberships} />);
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${en.common.nav.userMenu}"]`)!;
  for (const token of ["size-8", "rounded-full", "px-0"]) expect(trigger.classList.contains(token)).toBe(true);
  await act(async () => userEvent.setup().click(trigger));
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}
const ITEMS = '[role="menuitem"], [role="menuitemradio"]';
/** 메뉴의 줄 — 항목(`menuitem`·`menuitemradio` 둘 다)은 라벨, 구분선은 `---`. */
const rows = (menu: HTMLElement) =>
  [...menu.querySelectorAll<HTMLElement>(`${ITEMS}, [role="separator"]`)].map((node) =>
    node.getAttribute("role") === "separator" ? "---" : (node.textContent ?? "").trim(),
  );
const item = (menu: HTMLElement, label: string) =>
  [...menu.querySelectorAll<HTMLElement>(ITEMS)].find((node) => node.textContent?.trim() === label)!;
/** 프로젝트 그룹의 행 — 프로젝트 Home(`/projects/<slug>`)으로 가는 항목. */
const PROJECT_HOME = /^\/projects\/[^/]+$/;
const projectRows = (menu: HTMLElement) =>
  [...menu.querySelectorAll<HTMLElement>(ITEMS)].filter((node) => PROJECT_HOME.test(node.getAttribute("href") ?? ""));

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

it("프로젝트 행을 뺀 모든 항목이 앞 아이콘 하나를 들고, 외부 링크 글리프를 따로 달지 않는다", async () => {
  const menu = await open([project("demo")]);
  expect(projectRows(menu)).toHaveLength(1);
  for (const node of menu.querySelectorAll<HTMLElement>(ITEMS)) {
    // 프로젝트 행은 글리프 대신 `ProjectThumbnail xs`다(DESIGN §6.8) — 아래 프로젝트 그룹 케이스가 따로 본다.
    if (PROJECT_HOME.test(node.getAttribute("href") ?? "")) continue;
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
 * **프로젝트 그룹** (user-menu-projects, 2026-10-09 사용자) — 계정 그룹과 공개 그룹 사이, 보관 안 된 멤버 프로젝트 최대 5개를
 * 스위처 순서로. 앱 셸은 헤더가 이미 받은 멤버십을 넘긴다 — 새 조회가 없다.
 */
describe("UserMenu — 프로젝트 그룹 (멤버십을 받는다)", () => {
  const five = ["alpha", "bravo", "charlie", "delta", "echo"];
  const memberships = [project("old", "Old", true), ...five.map((slug) => project(slug)), project("foxtrot")];

  it("다섯 구획 순서다 — 머리 / 계정 / 프로젝트 / 공개 / Sign out, 앞뒤를 구분선이 가른다", async () => {
    const menu = await open(memberships);
    expect(rows(menu)).toEqual([
      "---",
      ...navWorkItems(en).map((i) => i.label),
      "---",
      ...five,
      "---",
      en.changelog.title,
      en.publicDocs.docs.title,
      en.publicDocs.privacy.title,
      "---",
      en.common.nav.signOut,
    ]);
  });

  it("보관을 빼고 최대 5개이며, 각 행은 그 프로젝트 Home이고 썸네일 16을 든다", async () => {
    const menu = await open(memberships);
    const shown = projectRows(menu);
    expect(shown.map((n) => n.getAttribute("href"))).toEqual(five.map((slug) => routes.project(slug)));
    expect(menu.textContent).not.toContain("Old");
    expect(menu.textContent).not.toContain("foxtrot");
    for (const node of shown) expect((node.firstElementChild as HTMLElement).classList.contains("size-4")).toBe(true);
  });

  it("앱 셸에서 지금 보는 프로젝트가 목록에 있으면 그 행이 스위처와 같은 체크다", async () => {
    nav.pathname = "/projects/charlie/sources";
    const menu = await open(memberships);
    expect(projectRows(menu).map((n) => [n.getAttribute("role"), n.getAttribute("aria-checked")])).toEqual(
      five.map((slug) => ["menuitemradio", slug === "charlie" ? "true" : "false"]),
    );
    expect(item(menu, "charlie").querySelectorAll("svg.lucide-check")).toHaveLength(1);
  });

  it.each(["/projects", "/inbox", "/account", "/docs", "/projects/new"])("지금 프로젝트가 없는 %s에서는 프로젝트 행이 전부 일반 menuitem이다", async (pathname) => {
    nav.pathname = pathname;
    const menu = await open(memberships);
    expect(projectRows(menu)).toHaveLength(5);
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0);
  });

  /** design D3 — `selected`는 `current == null ? undefined : slug === current`라, 지금 프로젝트가 있되 목록 밖이면 전부 `aria-checked=false` 라디오다. */
  it.each([
    ["보관", "/projects/old"],
    ["상한 밖(6번째)", "/projects/foxtrot"],
  ])("지금 프로젝트가 목록 밖(%s)이면 다섯 행이 전부 체크 안 된 menuitemradio다", async (_, pathname) => {
    nav.pathname = pathname;
    const menu = await open(memberships);
    expect(menu.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
    expect(projectRows(menu).map((n) => [n.getAttribute("role"), n.getAttribute("aria-checked")])).toEqual(
      five.map(() => ["menuitemradio", "false"]),
    );
  });

  it.each([
    ["멤버십 0", []],
    ["보관만", [project("old", "Old", true)]],
  ] as const)("%s이면 그룹과 그 구분선이 서지 않는다", async (_, list) => {
    const menu = await open(list);
    expect(projectRows(menu)).toHaveLength(0);
    expect(rows(menu).filter((r) => r === "---")).toHaveLength(3);
  });

  it("멤버십을 받으면 로더를 부르지 않는다 — 열고 닫아도", async () => {
    const menu = await open(memberships);
    expect(projectRows(menu)).toHaveLength(5);
    await act(async () => userEvent.setup().keyboard("{Escape}"));
    expect(action.memberships).not.toHaveBeenCalled();
  });

  it("메뉴 폭이 `w-60` 고정이고 긴 이름·이메일은 줄여 쓴다", async () => {
    const long = "a-very-long-project-name-that-would-push-the-menu-wider-than-its-width";
    const menu = await open([project("long", long)]);
    expect(menu.classList.contains("w-60")).toBe(true);
    const name = [...item(menu, long).children].find((n) => n.textContent === long) as HTMLElement;
    expect(name.classList.contains("truncate")).toBe(true);
    const email = [...menu.querySelectorAll<HTMLElement>("span")].find((n) => n.textContent === "kim@acme.com")!;
    expect(email.classList.contains("truncate")).toBe(true);
    const userName = [...menu.querySelectorAll<HTMLElement>("span")].find((n) => n.textContent === "Kim")!;
    expect(userName.classList.contains("truncate")).toBe(true);
  });

  /** ⚠️ POSTMORTEM 2026-09-09 — `asChild` + `selected`가 셸을 죽인 조합이다. 지금 프로젝트 행이 보이는 채로 열고 키보드로 고른다. */
  it("지금 프로젝트 행이 보이는 채로 열고 키보드 Enter로 그 행을 고른다", async () => {
    nav.pathname = "/projects/bravo";
    const menu = await open(memberships);
    const target = item(menu, "bravo");
    expect(target.getAttribute("aria-checked")).toBe("true");
    await act(async () => target.focus());
    await act(async () => userEvent.setup().keyboard("{Enter}"));
    expect(nav.hrefs).toEqual([routes.project("bravo")]);
  });
});

/**
 * **공개 셸 — 열기 직전 읽기** (user-menu-projects D2). 공개 셸 헤더는 멤버십을 안 넘긴다 — 메뉴가 기존 `loadSearchMemberships`로
 * 읽는다. 회차 규칙: ref에 Promise **하나**를 보유하고, hover·focus·열기 중 무엇이 와도 **보유한 것이 없을 때만** 시작하며, **닫힐 때 비운다**.
 * 응답은 `ref.current === 그 Promise`일 때만 그린다(POSTMORTEM 2026-09-13 — 늦은 응답 재사용).
 */
describe("UserMenu — 공개 셸 지연 조회 (멤버십을 안 받는다)", () => {
  type Result = { ok: true; memberships: NavProject[] } | { ok: false; error: "unauthorized" | "unavailable" };
  function deferred() {
    let resolve!: (value: Result) => void;
    const promise = new Promise<Result>((r) => { resolve = r; });
    return { promise, resolve: async (value: Result) => { await act(async () => resolve(value)); } };
  }
  const ok = (...slugs: string[]): Result => ({ ok: true, memberships: slugs.map((slug) => project(slug)) });
  const trigger = () => document.querySelector<HTMLButtonElement>(`button[aria-label="${en.common.nav.userMenu}"]`)!;
  const menuNode = () => document.querySelector<HTMLElement>('[role="menu"]');
  const skeletons = () => document.querySelectorAll("[data-project-menu-item-skeleton]");
  const region = () => menuNode()?.querySelector<HTMLElement>("[data-live-status]") ?? null;
  async function mount() {
    const view = await render(<UserMenu name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} />);
    return { view, user: userEvent.setup() };
  }
  const separators = () => rows(menuNode()!).filter((r) => r === "---").length;

  it("마운트만으로는 부르지 않는다", async () => {
    await mount();
    expect(action.memberships).not.toHaveBeenCalled();
  });

  it("hover 한 번이면 한 번 부른다 — 열지 않고 hover를 반복해도 한 번이다", async () => {
    action.memberships.mockReturnValue(deferred().promise);
    const { user } = await mount();
    await act(async () => user.hover(trigger()));
    expect(action.memberships).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) {
      await act(async () => user.unhover(trigger()));
      await act(async () => user.hover(trigger()));
    }
    expect(action.memberships).toHaveBeenCalledTimes(1);
    expect(menuNode()).toBeNull();
  });

  it("hover 뒤 열면 그 Promise를 쓴다 — 이미 온 응답이면 골격 없이 바로 목록이다", async () => {
    const response = deferred();
    action.memberships.mockReturnValue(response.promise);
    const { user } = await mount();
    await act(async () => user.hover(trigger()));
    await response.resolve(ok("alpha", "bravo"));
    await act(async () => user.click(trigger()));
    expect(action.memberships).toHaveBeenCalledTimes(1);
    expect(skeletons()).toHaveLength(0);
    expect(projectRows(menuNode()!).map((n) => n.getAttribute("href"))).toEqual([routes.project("alpha"), routes.project("bravo")]);
    // 공개 셸엔 지금 프로젝트가 없다 — 체크 없는 일반 menuitem이다.
    expect(menuNode()!.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0);
  });

  it("키보드만으로 — Tab으로 트리거에 닿으면 시작하고, Enter로 열어도 한 번이다", async () => {
    action.memberships.mockReturnValue(deferred().promise);
    const { user } = await mount();
    await act(async () => user.tab());
    expect(document.activeElement).toBe(trigger());
    expect(action.memberships).toHaveBeenCalledTimes(1);
    await act(async () => user.keyboard("{Enter}"));
    expect(menuNode()).not.toBeNull();
    expect(action.memberships).toHaveBeenCalledTimes(1);
  });

  /** 닫으면 Radix가 포커스를 트리거로 돌려준다 — 그 focus는 "열기 직전 신호"가 아니다. 닫을 때마다 조회가 하나씩 새면 안 된다. */
  it("닫혀서 트리거로 돌아온 포커스는 새 조회를 시작하지 않는다", async () => {
    action.memberships.mockReturnValue(deferred().promise);
    const { user } = await mount();
    await act(async () => user.click(trigger()));
    await act(async () => user.keyboard("{Escape}"));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
    expect(menuNode()).toBeNull();
    expect(action.memberships).toHaveBeenCalledTimes(1);
  });

  it.each(["옛 응답이 먼저", "옛 응답이 나중에"])("열기 → 닫기 → 열기 — %s 와도 새 응답만 그린다", async (order) => {
    const old = deferred();
    const fresh = deferred();
    action.memberships.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { user } = await mount();
    await act(async () => user.click(trigger()));
    await act(async () => user.keyboard("{Escape}"));
    await act(async () => user.click(trigger()));
    expect(action.memberships).toHaveBeenCalledTimes(2);
    if (order === "옛 응답이 먼저") {
      await old.resolve(ok("stale"));
      expect(menuNode()!.textContent).not.toContain("stale");
      expect(skeletons()).toHaveLength(1);
      await fresh.resolve(ok("fresh"));
    } else {
      await fresh.resolve(ok("fresh"));
      await old.resolve(ok("stale"));
    }
    expect(projectRows(menuNode()!).map((n) => n.textContent)).toEqual(["fresh"]);
    expect(menuNode()!.textContent).not.toContain("stale");
  });

  it("응답 전엔 골격 한 줄과 그 앞 구분선, 빈 채로 선 polite region이 있고 문장은 뒤에 들어온다 — 성공하면 목록이다", async () => {
    // ⚠️ region의 지연(`LiveStatus`)을 가짜 타이머로 민다 — 실제 시간이면 전체 스위트 부하에서 여는 사이에 100ms가 지나
    // "빈 채로 먼저" 단언이 순서 경주가 된다(#209). 바꾸는 것은 setTimeout뿐이고 user-event의 0ms 대기는 advanceTimers가 민다.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const response = deferred();
      action.memberships.mockReturnValue(response.promise);
      await mount();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await act(async () => user.click(trigger()));
      expect(skeletons()).toHaveLength(1);
      expect(separators()).toBe(4);
      const live = region()!;
      expect(live.getAttribute("role")).toBe("status");
      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(live.closest("[aria-busy]")).toBeNull();
      expect(live.textContent).toBe("");
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(region()!.textContent).toBe(en.projects.loading);
      // 다른 그룹은 응답 전에도 그대로다.
      expect(item(menuNode()!, en.common.nav.signOut)).toBeDefined();
      const busy = (skeletons()[0] as HTMLElement).closest("[aria-busy='true']");
      expect(busy).not.toBeNull();
      await response.resolve(ok("alpha", "bravo", "charlie", "delta", "echo", "foxtrot"));
      expect(skeletons()).toHaveLength(0);
      expect(projectRows(menuNode()!)).toHaveLength(5);
      expect(region()).toBe(live);
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(live.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["unauthorized", "unavailable"] as const)("%s면 그룹·구분선이 사라지고 다른 항목은 그대로다", async (error) => {
    const response = deferred();
    action.memberships.mockReturnValue(response.promise);
    const { user } = await mount();
    await act(async () => user.click(trigger()));
    await response.resolve({ ok: false, error });
    expect(skeletons()).toHaveLength(0);
    expect(projectRows(menuNode()!)).toHaveLength(0);
    expect(rows(menuNode()!)).toEqual([
      "---",
      ...navWorkItems(en).map((i) => i.label),
      "---",
      en.changelog.title,
      en.publicDocs.docs.title,
      en.publicDocs.privacy.title,
      "---",
      en.common.nav.signOut,
    ]);
  });

  it("로더가 던지면(네트워크) unavailable로 접혀 그룹이 사라진다", async () => {
    action.memberships.mockRejectedValue(new Error("offline"));
    const { user } = await mount();
    await act(async () => user.click(trigger()));
    await vi.waitFor(() => expect(skeletons()).toHaveLength(0));
    expect(projectRows(menuNode()!)).toHaveLength(0);
    expect(separators()).toBe(3);
  });

  /** ⚠️ POSTMORTEM 2026-09-20 · 09-24 — "포커스가 남아 있다"는 jsdom에서 공회전한다. 노드 동일성으로 잰다. */
  it("키보드로 연 뒤 응답이 와도 포커스가 같은 노드에 남는다", async () => {
    const response = deferred();
    action.memberships.mockReturnValue(response.promise);
    const { user } = await mount();
    await act(async () => user.tab());
    await act(async () => user.keyboard("{Enter}"));
    await vi.waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("menuitem"));
    const focused = document.activeElement;
    expect(focused?.textContent).toBe(en.common.nav.projects);
    await response.resolve(ok("alpha", "bravo"));
    expect(projectRows(menuNode()!)).toHaveLength(2);
    expect(document.activeElement).toBe(focused);
    expect(document.activeElement).not.toBe(document.body);
  });

  /**
   * ⚠️ 응답으로 바뀌는 것은 그룹 자리이고, 재마운트되면 포커스를 잃는 것은 그 **뒤** 항목이다(리뷰 🟡1). 응답 전에 `End`로 `Sign out`에
   * 가 있다가 성공·실패 응답이 와도 같은 노드다.
   */
  it.each([
    ["성공", ok("alpha", "bravo")],
    ["실패", { ok: false, error: "unavailable" } as Result],
  ])("응답 전에 End로 Sign out에 가 있으면 %s 응답 뒤에도 포커스가 같은 노드다", async (_, result) => {
    const response = deferred();
    action.memberships.mockReturnValue(response.promise);
    const { user } = await mount();
    await act(async () => user.tab());
    await act(async () => user.keyboard("{Enter}"));
    await vi.waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("menuitem"));
    await act(async () => user.keyboard("{End}"));
    const focused = document.activeElement;
    expect(focused?.textContent).toBe(en.common.nav.signOut);
    expect(skeletons()).toHaveLength(1);
    await response.resolve(result);
    expect(skeletons()).toHaveLength(0);
    expect(document.activeElement).toBe(focused);
    expect(document.activeElement).not.toBe(document.body);
  });

  /**
   * 닫힘 포커스 복귀 거름이 **과잉 억제**로 새지 않는다(리뷰 🟡2). Radix는 우클릭 바깥 닫힘에서 트리거로 포커스를 돌려주지 않는다
   * (`hasInteractedOutside`) — 그때 선 플래그는 다음 틱에 풀려야 하고, 안 풀리면 다음 진짜 Tab 포커스의 미리 읽기를 삼킨다.
   */
  it("우클릭 바깥 닫힘 뒤(포커스 복귀 없음) 다음 진짜 Tab 포커스는 조회를 시작한다", async () => {
    action.memberships.mockImplementation(() => deferred().promise);
    const { user } = await mount();
    await act(async () => user.click(trigger()));
    expect(action.memberships).toHaveBeenCalledTimes(1);
    const outside = userEvent.setup({ pointerEventsCheck: 0 });
    await act(async () => outside.pointer({ keys: "[MouseRight]", target: document.body }));
    await vi.waitFor(() => expect(menuNode()).toBeNull());
    // 플래그가 섰다가 포커스 없이 남는 자리 — 복귀 setTimeout(0)이 지나가길 기다린다.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(document.activeElement).not.toBe(trigger());
    await act(async () => user.tab());
    expect(document.activeElement).toBe(trigger());
    expect(action.memberships).toHaveBeenCalledTimes(2);
  });

  it("Escape 닫힘에서 돌아온 포커스는 무시하고, 떠났다 돌아온 다음 진짜 포커스는 조회를 시작한다", async () => {
    action.memberships.mockImplementation(() => deferred().promise);
    await render(<><button type="button">before</button><UserMenu name="Kim" email="kim@acme.com" image={null} signOut={vi.fn()} /></>);
    const user = userEvent.setup();
    await act(async () => user.click(trigger()));
    await act(async () => user.keyboard("{Escape}"));
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
    expect(action.memberships).toHaveBeenCalledTimes(1);
    await act(async () => user.tab({ shift: true }));
    expect(document.activeElement?.textContent).toBe("before");
    await act(async () => user.tab());
    expect(document.activeElement).toBe(trigger());
    expect(action.memberships).toHaveBeenCalledTimes(2);
  });

  // 언마운트 뒤 setState 경고는 React 18+에서 원래 나지 않는다 — 이 케이스는 가드를 재지 못하고 "에러가 없다"만 본다(리뷰 🟢2).
  it("대기 중 언마운트되어도 응답 도착에 에러가 없다", async () => {
    const response = deferred();
    action.memberships.mockReturnValue(response.promise);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user, view } = await mount();
    await act(async () => user.click(trigger()));
    await act(async () => view.rerender(null));
    await response.resolve(ok("alpha"));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
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

/**
 * #218 · 시안 PT5b — 메뉴가 열린 동안 계정 버튼에 3px 링(`foreground` 3%)이 선다. Inbox 트리거의 열림 면과 같은 판단(열림 = `aria-expanded`)이다.
 * jsdom은 box-shadow를 계산하지 않으므로 클래스와 열림 속성으로 든다. 실제 값(`0 0 0 3px`)은 Tailwind `ring-3`이 낸다.
 */
it("열린 동안 계정 버튼이 3px foreground 3% 링을 든다", async () => {
  await open();
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${en.common.nav.userMenu}"]`)!;
  for (const token of ["aria-expanded:ring-3", "aria-expanded:ring-foreground/[0.03]", "rounded-full"]) expect(trigger.classList, token).toContain(token);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
});
