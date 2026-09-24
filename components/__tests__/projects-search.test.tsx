// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { find, input, key, render } from "./helpers/dom";

/**
 * **프로젝트 검색은 서버를 기다리지 않는다** (audit-ux #17). 검색은 이미 받은 목록을 거르는 일인데
 * `router.push`로 서버 왕복을 탔고, 그 왕복이 원격 신호(최대 8초)를 기다리는 동안 목록이 굳어 있었다.
 * 이제 거르기는 로컬이고 URL은 `history.replaceState`로만 맞춘다.
 */
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => navigation.params,
}));
vi.mock("next/link", () => ({
  default: ({ href, onNavigate, children, ...props }: Omit<ComponentProps<"a">, "href"> & {
    href: string; children: ReactNode; onNavigate?: (event: { preventDefault(): void }) => void;
  }) => <a {...props} href={href} onClick={(event) => {
    event.preventDefault();
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; } });
    if (!prevented) navigation.push(href);
  }}>{children}</a>,
}));

import { ProjectList } from "@/components/projects/project-list";
import { m } from "@/lib/i18n";
import type { ProjectListRow } from "@/lib/keys/query";

const BASE: ProjectListRow = {
  image: null,
  slug: "admin-console",
  name: "admin-console",
  role: "OWNER",
  installationId: "i",
  surfaces: [{ archivedAt: null, lastCommitSha: "s" }],
  archivedAt: null,
  repoOwner: "day1company",
  repoName: "admin-console",
  repositoryId: "9001",
  memberCount: 6,
  baseBranch: "main",
  lastPrUrl: null,
  reviewSurfaceSlug: null,
  unsentSurfaceSlug: null,
  repoAheadFrom: null,
  meters: [],
  review: 0,
  unsent: 0,
  openPr: null,
  repoAheadFiles: 0,
  importError: null,
  importing: false,
};
const ALL: ProjectListRow[] = [
  BASE,
  { ...BASE, slug: "chrome-extension", name: "chrome-extension" },
  { ...BASE, slug: "old-landing", name: "old-landing" },
];

let replaceState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.params = new URLSearchParams();
  replaceState = vi.spyOn(window.history, "replaceState");
  replaceState.mockClear();
});

const rows = (container: HTMLElement) => [...container.querySelectorAll('a[href^="/projects/"]:not([href^="/projects/new"])')].map((a) => a.getAttribute("href"));
const search = (container: HTMLElement) => find<HTMLInputElement>(container, `input[aria-label="${m.projects.search.label}"]`);

it("Enter가 곧바로 거르고 서버로 이동하지 않는다 — URL은 `replaceState`로만 따라간다", async () => {
  const { container } = await render(<ProjectList all={ALL} />);
  expect(rows(container)).toHaveLength(3);

  const field = search(container);
  await input(field, "chrome");
  await key(field, "Enter");

  expect(rows(container)).toEqual(["/projects/chrome-extension"]);
  expect(container.textContent).toContain(m.projects.resultsFor("chrome"));
  expect(navigation.push).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(replaceState).toHaveBeenCalledTimes(1);
  expect(replaceState.mock.calls[0]?.[2]).toBe("/projects?q=chrome");
});

it("주소에 `?q=`를 들고 들어오면 첫 렌더부터 걸러져 있다", async () => {
  navigation.params = new URLSearchParams("q=old");
  const { container } = await render(<ProjectList all={ALL} />);
  expect(rows(container)).toEqual(["/projects/old-landing"]);
  expect(search(container).value).toBe("old");
  expect(replaceState).not.toHaveBeenCalled();
});

it("뒤로·앞으로 가기로 주소의 `q`가 바뀌면 목록과 입력이 주소를 따른다", async () => {
  const { container, rerender } = await render(<ProjectList all={ALL} />);
  const field = search(container);
  await input(field, "chrome");
  await key(field, "Enter");
  expect(rows(container)).toHaveLength(1);

  navigation.params = new URLSearchParams("q=admin");
  await rerender(<ProjectList all={ALL} />);
  expect(rows(container)).toEqual(["/projects/admin-console"]);
  expect(search(container).value).toBe("admin");

  navigation.params = new URLSearchParams();
  await rerender(<ProjectList all={ALL} />);
  expect(rows(container)).toHaveLength(3);
  expect(search(container).value).toBe("");
});

it("[Clear search]도 로컬로 되돌린다 — 새 탭 열기용 href는 그대로 `/projects`다", async () => {
  navigation.params = new URLSearchParams("q=chrome");
  const { container } = await render(<ProjectList all={ALL} />);
  const clear = [...container.querySelectorAll("a")].find((a) => a.textContent === m.projects.clearSearch);
  expect(clear?.getAttribute("href")).toBe("/projects");
  await act(async () => clear?.click());

  expect(rows(container)).toHaveLength(3);
  expect(search(container).value).toBe("");
  expect(navigation.push).not.toHaveBeenCalled();
  expect(replaceState.mock.calls.at(-1)?.[2]).toBe("/projects");
});

it("0건 카드의 출구도 로컬이다", async () => {
  const { container } = await render(<ProjectList all={ALL} />);
  const field = search(container);
  await input(field, "zzz");
  await key(field, "Enter");
  const reset = [...container.querySelectorAll("a")].find((a) => a.textContent === m.projects.narrowed.reset);
  await act(async () => reset?.click());
  expect(rows(container)).toHaveLength(3);
  expect(navigation.push).not.toHaveBeenCalled();
});

it("[New project]가 지금 걸러진 검색어를 싣는다 — 모달 뒤 목록이 같아야 한다", async () => {
  const { container } = await render(<ProjectList all={ALL} />);
  const field = search(container);
  await input(field, "chrome");
  await key(field, "Enter");
  const button = [...container.querySelectorAll("a")].find((a) => a.textContent === m.common.nav.newProject);
  expect(button?.getAttribute("href")).toBe("/projects/new?q=chrome");
});
