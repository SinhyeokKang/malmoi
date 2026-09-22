import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ require: vi.fn(), find: vi.fn(), detect: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url); }) }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: state.require }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: state.find } }) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ detectRepoFormats: state.detect }));
vi.mock("next/navigation", () => ({ redirect: state.redirect, notFound: () => { throw new Error("not-found"); } }));
import Page from "../projects/[slug]/surfaces/new/page";
beforeEach(() => { vi.clearAllMocks(); state.require.mockResolvedValue({ projectId: "p1" }); state.find.mockResolvedValue({ archivedAt: null }); });
it("OAuth 복귀의 오류를 보존해 설정 모달로 보내고 리포를 재탐지하지 않는다", async () => {
  await expect(Page({ params: Promise.resolve({ slug: "alpha" }), searchParams: Promise.resolve({ e: "reauthorize" }) })).rejects.toThrow("/projects/alpha/sources?add=sources&e=reauthorize");
  expect(state.require).toHaveBeenCalledWith({ slug: "alpha", permission: "project:settings" });
  expect(state.detect).not.toHaveBeenCalled();
});
it("보관된 프로젝트는 모달로 보내지 않는다", async () => {
  state.find.mockResolvedValue({ archivedAt: new Date() });
  await expect(Page({ params: Promise.resolve({ slug: "alpha" }), searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  expect(state.redirect).not.toHaveBeenCalled();
});
