// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/projects", useSearchParams: () => new URLSearchParams() }));

import ProjectsLoading from "@/app/(edit)/projects/(list)/loading";
import { NoProjectsMatch } from "@/components/projects/empty-projects";
import { ProjectList } from "@/components/projects/project-list";
import { en } from "@/messages/en";
import type { ProjectListRow } from "@/lib/keys/query";

vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

/**
 * `/projects`의 링크 색·글리프 (ux-drift-unify T19 · DESIGN §2.4 동작 규칙 · 글리프 열).
 * 🔴 N — 행 띠에서 앱 안 이동과 새 탭 외부 링크가 같은 파랑이었다. 파랑은 새 탭 외부만, 앱 안은 muted + chevron이다.
 */
const BASE: ProjectListRow = {
  image: null, slug: "acme", reviewSurfaceSlug: "default", unsentSurfaceSlug: "default", repoAheadFrom: "s", name: "Acme", role: "OWNER",
  installationId: "i", surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: null, importing: false }], archivedAt: null,
  repoOwner: "o", repoName: "r", repositoryId: "9001", memberCount: 2, baseBranch: "release", lastPrUrl: "https://github.com/o/r/pull/142",
  meters: [], review: 0, unsent: 0, openPr: null, repoAheadFiles: 0,
};
const draw = async (over: Partial<ProjectListRow>) => (await render(<ProjectList all={[{ ...BASE, ...over }]} />)).container;
const link = (container: HTMLElement, text: string) => [...container.querySelectorAll("a")].find((a) => a.textContent?.trim() === text);

describe("띠 링크 — 파랑은 새 탭 외부만", () => {
  it.each([
    ["review", { review: 3 }, en.projects.banner.action.review],
    ["unsent", { unsent: 3 }, en.projects.banner.action.send],
    ["needs_reconnect", { repositoryId: null }, en.projects.banner.action.reconnect],
    ["import_failed", { surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: "parse-failed" as const, importing: false }] }, en.projects.banner.action.viewDetails],
  ] as const)("%s 띠의 앱 안 링크는 파랑이 아니고 chevron을 든다", async (_kind, over, label) => {
    const found = link(await draw(over), label);
    expect(found).toBeDefined();
    expect(found?.className).not.toContain("text-link");
    // 띠 안의 앱 안 링크는 muted 글자다(DESIGN §6.63) — "파랑이 아님"만으로는 무엇이든 통과한다.
    expect(found?.className).toContain("text-muted-foreground");
    expect(found?.getAttribute("target")).toBeNull();
    expect(found?.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    // 12px 화살표가 텍스트 줄 상단에 붙지 않도록 교차축 중앙 정렬을 유지한다.
    expect(found?.classList.contains("inline-flex")).toBe(true);
    expect(found?.classList.contains("items-center")).toBe(true);
  });

  it.each([
    ["열린 PR", { openPr: { number: 142, url: "https://github.com/o/r/pull/142" } }, en.projects.banner.action.viewPr],
    ["원격 변경", { repoAheadFiles: 2 }, en.projects.banner.action.reviewChanges],
  ] as const)("%s 띠의 외부 링크는 파랑 + 새 탭이다", async (_kind, over, label) => {
    const found = link(await draw(over), label);
    expect(found?.className).toContain("text-link");
    expect(found?.getAttribute("target")).toBe("_blank");
  });
});

describe("띠 글리프 — 실패는 CircleX, 경고는 삼각", () => {
  const glyph = async (code: "parse-failed" | "partial-import") =>
    (await draw({ surfaces: [{ archivedAt: null, lastCommitSha: "s", importError: code, importing: false }] })).querySelector("li svg.lucide[class*='size-3.5']")?.getAttribute("class") ?? "";

  it("동기화 실패 띠는 CircleX다", async () => {
    expect(await glyph("parse-failed")).toContain("lucide-circle-x");
  });

  it("일부 반영 띠는 TriangleAlert다 — 실패 원을 빌리지 않는다", async () => {
    expect(await glyph("partial-import")).toContain("lucide-triangle-alert");
  });
});

describe("좁힌 0건 · 검색 결과 머리 — 앱 안 되돌리기", () => {
  it("좁힌 0건의 출구는 default 버튼 + RotateCcw이고 파랑이 아니다", async () => {
    const { container } = await render(<NoProjectsMatch m={en} query="zzz" onReset={vi.fn()} />);
    const reset = link(container, en.projects.narrowed.reset);
    expect(reset?.className).not.toContain("text-link");
    expect(reset?.querySelector("svg.lucide-rotate-ccw")).not.toBeNull();
    expect(reset?.getAttribute("href")).toBe("/projects");
  });
});

describe("목록 골격", () => {
  it("낭독 한 줄이 서고 카운트 원을 예고하지 않는다", async () => {
    const { container } = await render(<ProjectsLoading />);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(en.projects.loading);
    expect(container.querySelector(".size-5.rounded-full")).toBeNull();
  });
});
