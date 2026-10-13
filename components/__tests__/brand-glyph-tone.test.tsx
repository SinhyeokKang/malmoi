// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { RepoHostScope } from "@/components/i18n/messages-provider";
import { BrandGlyph } from "@/components/signin/brand-icons";
import { IconTile } from "@/components/ui/icon-tile";
import type { ConnectionHealth } from "@/lib/github-connect/health";

import { render } from "./helpers/dom";

vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: vi.fn(), disconnectGitLab: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn(), listProjectBranches: vi.fn(async () => ({ ok: true, names: ["main"], defaultBranch: "main" })), rotatePushToken: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn(), connectRepository: vi.fn(), reconnectGitLabRepository: vi.fn(), updateRepositorySettings: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), unstable_rethrow: () => {} }));

const { LoginMethods } = await import("@/components/account/login-methods");
const { GithubSection } = await import("@/components/account/github-section");
const { GitLabSection } = await import("@/components/account/gitlab-section");
const { RepositoryCard } = await import("@/components/settings/repository-card");

/**
 * **카드 칸의 브랜드 글리프는 칸의 색을 받지 않는다** (gitlab-oauth D6). `IconTile`은 글자색으로 회색(`muted`)·상태 색(`tone`)을 싣는다 —
 * 단색 글리프는 그것을 `currentColor`로 받아 회색·호박색 로고가 됐다. 이제 GitHub는 `text-foreground` 잉크로 상속을 끊고, GitLab·Google은
 * path `fill`이 hex다. **`tone`은 칸의 면만 칠한다.** 다섯 자리(수단 행 · GitHub App · GitLab PAT · 설정 리포 카드 GitHub·GitLab)를 실제로 그려 센다.
 */
type Brand = "github" | "gitlab" | "google";

/** 칸 하나의 글리프가 브랜드 색인가 — 어느 브랜드인지는 호출부가 안다(칸에는 이름이 없다, `aria-hidden`). */
function expectBrand(tile: Element, brand: Brand) {
  const svg = tile.querySelector("svg")!;
  expect(svg, brand).not.toBeNull();
  if (brand === "github") {
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.classList.contains("text-foreground"), "GitHub는 잉크로 칸의 글자색 상속을 끊는다").toBe(true);
  } else {
    expect(svg.outerHTML).not.toContain("currentColor");
    const paths = [...svg.querySelectorAll("path")];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path.getAttribute("fill")).toMatch(/^#[0-9A-F]{6}$/i);
  }
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

it("BrandGlyph — 경고·실패 칸 안에서도 브랜드 색이다", async () => {
  for (const tone of ["warning", "danger"] as const) {
    for (const brand of ["github", "gitlab", "google"] as const) {
      const { container } = await render(<IconTile tone={tone}><BrandGlyph brand={brand} /></IconTile>);
      const tile = container.querySelector("[data-tone]")!;
      expect(tile.getAttribute("data-tone")).toBe(tone);
      expectBrand(tile, brand);
    }
  }
});

it("/account 로그인 수단 행 — 세 공급자 칸이 브랜드 색이다 (GitHub는 회색이 아니라 잉크)", async () => {
  const { container } = await render(<LoginMethods rows={[{ provider: "github", connected: true }, { provider: "gitlab", connected: false }, { provider: "google", connected: true }]} />);
  const rows = [...container.querySelectorAll("li")];
  expect(rows).toHaveLength(3);
  rows.forEach((row, i) => expectBrand(row.querySelector("svg")!.parentElement!, (["github", "gitlab", "google"] as const)[i]!));
});

it("/account GitHub App 카드 — 연결 상태에서 잉크다", async () => {
  const { container } = await render(<GithubSection account={{ status: "ok", login: "octocat" }} installedRepoCount={1} settingsUrl={null} />);
  expectBrand(container.querySelector("li svg")!.parentElement!, "github");
});

it("/account GitLab PAT 카드 — 만료 임박(경고 칸)에서도 tanuki는 3색이다", async () => {
  const { container } = await render(<GitLabSection connection={{ username: "ox", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), projectCount: 1 }} />);
  const tile = container.querySelector("li [data-tone]")!;
  expect(tile.getAttribute("data-tone")).toBe("warning");
  expectBrand(tile, "gitlab");
});

describe("설정 리포 카드 — 경고·실패 칸에서도 글리프는 브랜드 색이다", () => {
  // 확인 실패(`unknown`) = 호박 · 다른 리포(`repo-replaced`) = 빨강 — 둘 다 글리프가 남는 상태다(끊김은 `Unplug`가 상태 색을 받는다).
  const STATES = [["unknown", "warning"], ["repo-replaced", "danger"]] as const;

  it.each(STATES)("GitHub — %s", async (status, tone) => {
    const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve({ status } as ConnectionHealth)} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" />);
    await flush();
    const tile = container.querySelector(`[data-tone="${tone}"]`)!;
    expect(tile, tone).not.toBeNull();
    expectBrand(tile, "github");
  });

  it.each(STATES)("GitLab — %s", async (status, tone) => {
    const { container } = await render(
      <RepoHostScope host="gitlab">
        <RepositoryCard slug="acme" owner="group" repo="web" branch="main" archived={false} health={Promise.resolve({ status } as ConnectionHealth)} gitlab={{ token: { username: "ox", expiresAt: null, viewerIsOwner: true, projectCount: 1 }, viewer: { username: "ox" } }} />
      </RepoHostScope>,
    );
    await flush();
    const tile = container.querySelector(`[data-gitlab-row] [data-tone="${tone}"]`)!;
    expect(tile, tone).not.toBeNull();
    expectBrand(tile, "gitlab");
  });
});

it("끊긴 상태는 브랜드 글리프 대신 상태 아이콘이 칸의 색을 받는다 — 비교 대상", async () => {
  const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve({ status: "unpinned" } as ConnectionHealth)} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" />);
  await flush();
  const tile = container.querySelector('[data-tone="warning"]')!;
  expect(tile.querySelector("svg")!.classList.contains("text-foreground")).toBe(false);
});
