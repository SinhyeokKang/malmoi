import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), surfaceGuard: vi.fn(), read: vi.fn(), project: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }), screen: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: mocks.guard }));
vi.mock("@/lib/surfaces/access", () => ({ requireSurfaceAccess: mocks.surfaceGuard }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: mocks.project } }) }));
vi.mock("@/lib/sources/query", () => ({ loadSources: mocks.read }));
vi.mock("@/components/sources/sources-screen", () => ({ SourcesScreen: (props: unknown) => { mocks.screen(props); return <div>Sources</div>; } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: () => { throw new Error("not-found"); } }));
import Page from "../projects/[slug]/sources/page";
import Legacy from "../projects/[slug]/locales/page";
import SurfaceLegacy from "../projects/[slug]/surfaces/[surfaceSlug]/locales/page";
beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ projectId: "p", role: "OWNER", archived: false }); mocks.surfaceGuard.mockResolvedValue({ projectId: "p", role: "OWNER", archived: false }); mocks.read.mockResolvedValue({ installed: true, sources: [] }); mocks.project.mockResolvedValue({ archivedAt: new Date("2026-09-18T00:00:00Z") }); });
it("반복 add/e는 첫 값만 읽고 source 쿼리는 상세 선택에 사용하지 않는다", async () => {
  renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "p" }), searchParams: Promise.resolve({ add: ["sources", "other"], e: ["reauthorize", "other"], source: "web" }) }));
  expect(mocks.guard).toHaveBeenCalledWith({ slug: "p", permission: "translation:write" });
  expect(mocks.screen.mock.calls[0]?.[0]).toMatchObject({ initialOpen: true });
  expect(mocks.screen.mock.calls[0]?.[0]).not.toHaveProperty("selectedSurfaceSlug");
});
it("EDITOR의 직접 add 진입은 모달을 열지 않는다", async () => {
  mocks.guard.mockResolvedValue({ projectId: "p", role: "EDITOR", archived: false });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "p" }), searchParams: Promise.resolve({ add: "sources" }) }));
  expect(mocks.screen.mock.calls[0]?.[0]).toMatchObject({ initialOpen: false, adapters: [] });
  expect(html).toContain("owner");
});
it.each(["OWNER", "EDITOR"])("보관 %s는 목록을 조회하지 않고 복원 링크를 역할로 나눈다", async role => {
  mocks.guard.mockResolvedValue({ projectId: "p", role, archived: true });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: "p" }), searchParams: Promise.resolve({ add: "sources" }) }));
  expect(mocks.read).not.toHaveBeenCalled();
  expect(html).toContain("Archived");
  expect(html).toContain("2026-09-18");
  expect(html.includes('/projects/p/settings')).toBe(role === "OWNER");
});
it("옛 두 Locales 주소는 인가 뒤 Sources 목록으로 간다", async () => {
  await expect(Legacy({ params: Promise.resolve({ slug: "p" }) })).rejects.toThrow('/projects/p/sources');
  await expect(SurfaceLegacy({ params: Promise.resolve({ slug: "p", surfaceSlug: "web" }) })).rejects.toThrow('/projects/p/sources');
  expect(mocks.surfaceGuard).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", permission: "translation:write" });
});
