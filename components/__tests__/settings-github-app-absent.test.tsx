// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { en } from "@/messages/en";

import { render } from "./helpers/dom";

/**
 * **GitHub App 없는 설치의 설정 화면** (gitlab-repositories D4a · R-Eui 🟡3) — 쓸 수 없는 컨트롤을 그리지 않는다. App이 없으면 GitHub 계정 조회
 * (`loadAccountView`)가 0회이고 GitHub 승인 복구 줄이 서지 않는다. App이 있으면 지금 그대로다(대조).
 */
const mocks = vi.hoisted(() => ({ loadAccountView: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: async () => ({ projectId: "p1", userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findUnique: async () => ({
  name: "Acme", image: null, repoOwner: "owner", repoName: "repo", repoHost: "github", installationId: "1", gitlabConnectionId: null, repositoryId: "r1",
  baseBranch: "main", archivedAt: null, surfaces: [], gitlabConnection: null,
}) } }) }));
vi.mock("@/lib/repo-host", () => ({ loadConnectionHealth: async () => ({ status: "ok" }) }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: mocks.loadAccountView }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: async () => null }));
vi.mock("@/app/(edit)/projects/actions", () => ({ listProjectBranches: vi.fn(async () => ({ ok: true, names: ["main"], defaultBranch: "main", truncated: false })), rotatePushToken: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn(), connectRepository: vi.fn(), reconnectGitLabRepository: vi.fn(), updateProjectName: vi.fn(), updateRepositorySettings: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn() }));
vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getDateStyle: async () => ({ uiLocale: "en", timeZone: "UTC" }), getMessages: async () => (await import("@/messages/en")).en }));

const { default: SettingsPage } = await import("@/app/(edit)/projects/[slug]/settings/page");
const APP = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_SLUG"];

beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.loadAccountView.mockReset();
  // 연결이 끊긴 GitHub 사용자 토큰 — App이 있으면 복구 줄("Manage your GitHub authorization in Account")이 선다.
  mocks.loadAccountView.mockResolvedValue({ status: "reauthorize" });
});

async function screen() {
  await render(await SettingsPage({ params: Promise.resolve({ slug: "acme" }), searchParams: Promise.resolve({}) }));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return document.body;
}

it("App이 없으면 GitHub 계정 조회가 0회이고 GitHub 복구 줄이 없다", async () => {
  for (const name of APP) vi.stubEnv(name, "");
  const body = await screen();
  expect(mocks.loadAccountView).not.toHaveBeenCalled();
  expect(body.textContent).not.toContain(en.settings.recovery);
});

it("대조 — App이 있으면 GitHub 계정을 읽고 복구 줄이 선다", async () => {
  for (const name of APP) vi.stubEnv(name, "x");
  const body = await screen();
  expect(mocks.loadAccountView).toHaveBeenCalledOnce();
  expect(body.textContent).toContain(en.settings.recovery);
});
