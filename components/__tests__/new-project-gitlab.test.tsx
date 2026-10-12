// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/messages/en";
import { NewProject } from "@/components/onboarding/new-project";
import type { RepoOption } from "@/lib/onboarding/types";

import userEvent from "@testing-library/user-event";

import { find, input, render } from "./helpers/dom";

/**
 * ①의 GitHub / GitLab 탭 (gitlab-repositories 시안 G1·G2 · design-brief "동작 주석"). GitHub 탭은 현행 그대로이고, GitLab 탭은 PAT 입력 →
 * Maintainer 이상 프로젝트 목록이다. ⚠️ 탭을 바꿔도 각 탭의 검색어·선택이 남는다. ⚠️ GitLab 행은 Action에 숫자 id로만 간다.
 * ⚠️ App 없는 설치(D4a)는 탭 줄 없이 GitLab 단독이다.
 */
vi.setConfig({ testTimeout: 20_000 });
const user = userEvent.setup();

const mocks = vi.hoisted(() => ({
  listRepoBranches: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(), listConnectableGitLabRepos: vi.fn(),
  createProject: vi.fn(), confirmManualFormat: vi.fn(), runFirstIngest: vi.fn(), startGithubConnectForUser: vi.fn(),
  connectGitLab: vi.fn(),
  router: { back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("@/app/(edit)/projects/actions", () => mocks);
vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: mocks.connectGitLab }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

const repos: RepoOption[] = ["web", "mobile"].map((repo) => ({ owner: "acme", repo, fullName: `acme/${repo}`, suggestedSlug: `acme-${repo}`, pushedAt: null }));
const GITLAB = [{ repositoryId: "42", fullName: "group/sub/very-long-project-name", owner: "group/sub", name: "very-long-project-name", lastActivityAt: null }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listRepoBranches.mockResolvedValue({ ok: true, names: ["main"], defaultBranch: "main" });
  mocks.listConnectableGitLabRepos.mockResolvedValue({ ok: true, repos: GITLAB, truncated: false });
});

async function mount({ githubEnabled = true, gitlab = { username: "ox", expiresAt: null } as { username: string; expiresAt: string | null } | null } = {}) {
  await render(<NewProject repos={repos} listError={undefined} installUrl={null} now="2026-10-12T00:00:00Z"
    initialError={undefined} backQuery={{}} closeMode="list" githubEnabled={githubEnabled} gitlab={gitlab}
    adapters={[{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "i18n/{locale}.json" }]} />);
}
const tab = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.trim() === name)!;
const panel = () => find<HTMLElement>(document.body, '[role="tabpanel"]:not([hidden])');
async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }

it("탭 줄이 이름을 들고 GitHub이 기본이다 — 호스트는 글리프가 아니라 탭 이름으로 드러난다", async () => {
  await mount();
  const list = find(document.body, '[role="tablist"]');
  expect(list.getAttribute("aria-label")).toBe(en.newProject.host.label);
  expect(tab("GitHub").getAttribute("aria-selected")).toBe("true");
  expect(tab("GitLab").getAttribute("aria-selected")).toBe("false");
  expect(mocks.listConnectableGitLabRepos).not.toHaveBeenCalled();
});

it("GitLab 연결이 없으면 GitLab 탭이 PAT 입력이고 목록을 부르지 않는다 (G2a)", async () => {
  await mount({ gitlab: null });
  await act(async () => { await user.click(tab("GitLab")); });
  expect(panel().textContent).toContain(en.newProject.gitlab.connect.title);
  expect(panel().querySelector('input[type="password"]')).not.toBeNull();
  expect(mocks.listConnectableGitLabRepos).not.toHaveBeenCalled();
});

it("GitLab 탭은 계정 줄 + 목록이고, 행을 고르면 숫자 id로 브랜치를 묻는다 — GitHub·pull request 낱말이 없다", async () => {
  await mount();
  await act(async () => { await user.click(tab("GitLab")); });
  await flush();
  expect(mocks.listConnectableGitLabRepos).toHaveBeenCalledOnce();
  expect(panel().textContent).toContain(en.newProject.gitlab.account("ox", null));
  await act(async () => { await user.click(find(panel(), '[role="radio"]')); });
  await flush();
  expect(mocks.listRepoBranches).toHaveBeenLastCalledWith({ host: "gitlab", repositoryId: "42" });
  expect(panel().textContent).not.toMatch(/github|pull request/i);
});

it("탭을 바꿔도 GitHub 탭의 검색어·선택이 남는다", async () => {
  await mount();
  await input(find<HTMLInputElement>(panel(), "input"), "web");
  await act(async () => { await user.click(find(panel(), '[role="radio"]')); });
  await flush();
  await act(async () => { await user.click(tab("GitLab")); });
  await flush();
  await act(async () => { await user.click(tab("GitHub")); });
  await flush();
  expect(find<HTMLInputElement>(panel(), "input").value).toBe("web");
  expect(find(panel(), '[role="radio"][aria-checked="true"]').getAttribute("value")).toBe("acme/web");
  expect(mocks.listRepoBranches).toHaveBeenLastCalledWith({ owner: "acme", repo: "web" });
});

it("GitLab 목록이 비면 Maintainer 안내 막힘이고 [Try again]이 다시 부른다", async () => {
  mocks.listConnectableGitLabRepos.mockResolvedValue({ ok: true, repos: [], truncated: false });
  await mount();
  await act(async () => { await user.click(tab("GitLab")); });
  await flush();
  expect(panel().textContent).toContain(en.newProject.gitlab.repos.title);
  const retry = [...panel().querySelectorAll("button")].find((b) => b.textContent === en.newProject.gitlab.repos.action)!;
  await act(async () => { await user.click(retry); });
  await flush();
  expect(mocks.listConnectableGitLabRepos).toHaveBeenCalledTimes(2);
});

it("토큰을 못 쓰면 다시 붙여 넣기 막힘이다 (G2f)", async () => {
  mocks.listConnectableGitLabRepos.mockResolvedValue({ ok: false, error: "gitlab-reconnect" });
  await mount();
  await act(async () => { await user.click(tab("GitLab")); });
  await flush();
  expect(panel().textContent).toContain(en.newProject.gitlab.reconnect.title);
  expect(panel().querySelector('input[type="password"]')).not.toBeNull();
});

it("GitHub App이 없는 설치는 탭 줄 없이 GitLab 단독이다 (D4a)", async () => {
  await mount({ githubEnabled: false });
  await flush();
  expect(document.querySelector('[role="tablist"]')).toBeNull();
  expect(mocks.listConnectableGitLabRepos).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain("very-long-project-name");
  expect(document.body.textContent).not.toMatch(/github|pull request/i);
});

it("GitLab CI 안내는 .gitlab-ci.yml과 CI/CD 변수 단계이고, 릴리스 전(빈 yaml)엔 블록 없이 그 사실을 말한다 (G7 · R-D1)", async () => {
  const { WorkflowBlock } = await import("@/components/onboarding/workflow-block");
  const { container } = await render(<WorkflowBlock m={en} host="gitlab" yaml={"job: x\n"} />);
  expect(container.textContent).toContain(".gitlab-ci.yml");
  expect(container.textContent).toContain(en.settings.workflow.gitlabVariable);
  expect(container.textContent).not.toMatch(/github/i);
  const empty = await render(<WorkflowBlock m={en} host="gitlab" yaml="" />);
  expect(empty.container.textContent).toBe(en.settings.workflow.gitlabUnavailable);
  const github = await render(<WorkflowBlock m={en} yaml={"on: push\n"} />);
  expect(github.container.textContent).toContain(".github/workflows/malmoi-i18n.yml");
});

describe("시안 대조 (G2a·G2e·G2f)", () => {
  it("연결 전 shell의 칩은 key-round다 — 연결하는 것은 플랫폼이 아니라 계정 토큰이다 (#247)", async () => {
    await mount({ gitlab: null });
    await act(async () => { await user.click(tab("GitLab")); });
    const chip = panel().querySelector("svg");
    expect(chip?.getAttribute("class")).toContain("lucide-key-round");
  });

  it("연결됨 — 검색 아래 캡션 슬롯에 계정·만료일·[Replace token], 검색은 GitLab 낱말(projects)이다 (#248)", async () => {
    await mount({ gitlab: { username: "ox", expiresAt: "2026-11-11T00:00:00.000Z" } });
    await act(async () => { await user.click(tab("GitLab")); });
    await flush();
    const search = find<HTMLInputElement>(panel(), "input");
    expect(search.placeholder).toBe(en.newProject.repo.onGitLab.search.placeholder);
    const caption = [...panel().querySelectorAll("p")].find((p) => p.textContent?.includes(en.newProject.gitlab.account("ox", "Nov 11, 2026")))!;
    expect(caption).toBeDefined();
    // 검색 → 캡션 순서(GitHub `Don't see a repository?` 자리)다
    expect(search.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.querySelector("button")?.textContent).toBe(en.account.gitlab.replace);
  });

  it("저장 만료일이 지난 토큰은 `Reconnect GitLab` + 만료일 문장이다 (#249)", async () => {
    mocks.listConnectableGitLabRepos.mockResolvedValue({ ok: false, error: "gitlab-reconnect" });
    await mount({ gitlab: { username: "ox", expiresAt: "2026-10-09T00:00:00.000Z" } });
    await act(async () => { await user.click(tab("GitLab")); });
    await flush();
    expect(panel().textContent).toContain(en.newProject.gitlab.reconnect.title);
    expect(en.newProject.gitlab.reconnect.title).toBe("Reconnect GitLab");
    expect(panel().textContent).toContain(en.newProject.gitlab.reconnect.expiredOn("Oct 9, 2026"));
    expect(panel().querySelector("svg")?.getAttribute("class")).toContain("lucide-key-round");
  });

  it("만료일 전인데 못 쓰는 토큰(철회)은 같은 블록에 설명만 다르다", async () => {
    mocks.listConnectableGitLabRepos.mockResolvedValue({ ok: false, error: "gitlab-reconnect" });
    await mount({ gitlab: { username: "ox", expiresAt: "2099-01-01T00:00:00.000Z" } });
    await act(async () => { await user.click(tab("GitLab")); });
    await flush();
    expect(panel().textContent).toContain(en.newProject.gitlab.reconnect.title);
    expect(panel().textContent).toContain(en.newProject.gitlab.reconnect.description);
  });
});
