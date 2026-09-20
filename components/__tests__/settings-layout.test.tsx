// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { render } from "./helpers/dom";
const state = vi.hoisted(() => ({ archived: false, image: null as string | null, find: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p1", userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: state.find } }) }));
vi.mock("@/lib/github", () => ({ loadConnectionHealth: async () => ({ status: "ok" }) }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: async () => ({ status: "ok", login: "owner" }) }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: async () => null }));
vi.mock("@/lib/keys/query", () => ({ loadSurfaceCounts: async () => [] }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: vi.fn(), addSurfaces: vi.fn(), detectRepoFormats: vi.fn(), confirmManualFormat: vi.fn(), loadCandidateSample: vi.fn(), rotatePushToken: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn(), connectRepository: vi.fn(), updateProjectName: vi.fn(), updateRepositorySettings: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
import SettingsPage from "@/app/(edit)/projects/[slug]/settings/page";
beforeEach(() => { state.archived = false; state.image = null; state.find.mockImplementation(async () => ({ name: "Acme", image: state.image, repoOwner: "owner", repoName: "repo", installationId: "1", repositoryId: "r1", baseBranch: "main", archivedAt: state.archived ? new Date("2026-09-20") : null, surfaces: [] })); });
const page = () => SettingsPage({ params: Promise.resolve({ slug: "acme" }), searchParams: Promise.resolve({}) });
it.each([false, true])("활성·보관 상태 모두 다섯 카드이고 복원이 첫 자리다: %s", async archived => {
  state.archived = archived;
  const { container } = await render(await page());
  expect([...container.querySelectorAll("section > header h2")].map(n => n.textContent)).toEqual(archived ? ["Restore project", "General", "Repository", "Translation sources", "CI integration"] : ["General", "Repository", "Translation sources", "CI integration", "Archive project"]);
  expect(container.querySelector("pre")).toBeNull();
  if (archived) for (const button of container.querySelectorAll<HTMLButtonElement>('section button')) {
    expect(button.disabled || button.matches(':disabled')).toBe(button.textContent !== "Restore project");
  }
});
it.each(["/saved.webp", "/replaced.webp", null])("설정 서버 조회가 보낸 최신 이미지 %s를 미리보기에 쓴다", async image => {
  state.image = image;
  const { container } = await render(await page());
  expect(container.querySelector("img")?.getAttribute("src") ?? null).toBe(image);
  expect(state.find).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ image: true }) }));
});
