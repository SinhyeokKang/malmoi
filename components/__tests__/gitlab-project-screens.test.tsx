// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoHostScope } from "@/components/i18n/messages-provider";
import { withRepoHost } from "@/lib/i18n/host";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { metaTabs, type MetaTabsInput } from "@/lib/home/meta";
import { en } from "@/messages/en";

import { find, render } from "./helpers/dom";

vi.setConfig({ testTimeout: 20_000 });

const mocks = vi.hoisted(() => ({
  connectRepository: vi.fn(), reconnectGitLabRepository: vi.fn(), updateRepositorySettings: vi.fn(), listProjectBranches: vi.fn(),
  connectGitLab: vi.fn(), rotatePushToken: vi.fn(),
  router: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({
  connectRepository: mocks.connectRepository, reconnectGitLabRepository: mocks.reconnectGitLabRepository, updateRepositorySettings: mocks.updateRepositorySettings,
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ listProjectBranches: mocks.listProjectBranches, rotatePushToken: mocks.rotatePushToken }));
vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: mocks.connectGitLab }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }));

const { MetaColumn } = await import("@/components/home/meta-column");
const { RepositoryCard } = await import("@/components/settings/repository-card");
const { CiCard } = await import("@/components/settings/ci-card");

/**
 * **GitLab 프로젝트 스코프 화면** (gitlab-repositories tasks §5 [자동]) — 그 프로젝트의 화면에 `GitHub`·`pull request`·`github.com`이 0건이고
 * (말모이 자체 링크·로그인 공급자는 이 조각들에 없다), 호스트가 글리프만이 아니라 글자로 드러난다. 프로젝트 화면은 `withRepoHost`/`RepoHostScope`로
 * 사전 전체를 덮는다 — 컴포넌트가 낱말마다 호스트를 고르지 않는다.
 */
const GITHUB_WORDS = /github|pull request|\bPRs?\b/i;
const now = new Date("2026-10-12T12:00:00Z");
const gl = withRepoHost(en, "gitlab");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProjectBranches.mockResolvedValue({ ok: true, names: ["main"], defaultBranch: "main" });
});

const meta: MetaTabsInput = {
  repository: { owner: "group/sub", name: "very-long-project-name", branch: "main", connection: "connected", host: "gitlab" },
  ciConfigured: true, surfaceCount: 1, keys: 10, members: 2, pendingInvites: 0, createdAt: new Date("2026-08-01T00:00:00Z"), archivedAt: null,
  lastSync: null,
  lastPublish: { trigger: "manual", at: now, prUrl: "https://gitlab.com/group/sub/very-long-project-name/-/merge_requests/128", changedValues: 3, surfaceSlugs: ["web"] },
  held: null, prState: "absent",
};

describe("Home 메타 — GitLab 프로젝트 (시안 G5)", () => {
  async function column() {
    const { container } = await render(<MetaColumn tabs={metaTabs(meta)} slug="acme" now={now} canOpenSettings uiLocale="en" m={gl} />);
    return container;
  }

  it("Platform 행이 GitLab을 글자로 말하고 리포 링크는 gitlab.com이다 — GitHub 낱말 0건", async () => {
    const c = await column();
    const platform = [...c.querySelectorAll("dl > div")].find((row) => row.querySelector("dt")?.textContent === en.home.meta.platform)!;
    expect(platform.querySelector("dd")!.textContent).toBe("GitLab");
    expect(platform.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(find<HTMLAnchorElement>(c, 'a[target="_blank"]').href).toBe("https://gitlab.com/group/sub/very-long-project-name");
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });

  it("Publish 탭은 Merge request 행과 `!128` 링크다 (G5b1)", async () => {
    const c = await column();
    const tab = [...c.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === en.home.meta.tabs.publish)!;
    await act(async () => { await userEvent.setup().click(tab); });
    const shown = find<HTMLElement>(c, '[role="tabpanel"]:not([hidden])');
    const row = [...shown.querySelectorAll("dl > div")].find((r) => r.querySelector("dt")?.textContent === gl.home.meta.pullRequest)!;
    expect(gl.home.meta.pullRequest).toBe("Merge request");
    expect(row.querySelector("a")!.textContent).toBe("!128");
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });
});

describe("설정 › Repository — GitLab 카드 (시안 G6)", () => {
  async function card(health: ConnectionHealth, gitlab: Parameters<typeof RepositoryCard>[0]["gitlab"]) {
    const { container } = await render(
      <RepoHostScope host="gitlab">
        <RepositoryCard slug="acme" owner="group/sub" repo="very-long-project-name" branch="main" archived={false} health={Promise.resolve(health)} gitlab={gitlab} />
      </RepoHostScope>,
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return container;
  }
  const soon = new Date(now.getTime() + 5 * 86_400_000).toISOString();

  it("연결됨은 연결자·만료일 줄과 [Open on GitLab]이고 GitHub 낱말이 없다 (G6a)", async () => {
    const c = await card({ status: "ok" } as ConnectionHealth, { token: { username: "ox", expiresAt: null, viewerIsOwner: false }, viewer: { username: "me" } });
    expect(c.textContent).toContain(en.settings.repository.gitlab.connectedVia("ox"));
    expect(c.textContent).toContain(en.settings.repository.gitlab.tokenLine("ox"));
    const open = [...c.querySelectorAll("a")].find((a) => a.textContent === gl.settings.openRepo)!;
    expect(open.href).toBe("https://gitlab.com/group/sub/very-long-project-name");
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });

  it("만료 임박은 토큰 줄에 Expires soon이고, 토큰 주인은 [Replace token]이다 (G6b)", async () => {
    const c = await card({ status: "ok" } as ConnectionHealth, { token: { username: "ox", expiresAt: soon, viewerIsOwner: true }, viewer: { username: "ox" } });
    expect(c.textContent).toContain(en.account.gitlab.expiresSoon);
    expect([...c.querySelectorAll("button")].map((b) => b.textContent)).toContain(en.account.gitlab.replace);
    expect(c.textContent).not.toContain(en.settings.repository.gitlab.useMine);
  });

  it("참조가 비면 Disconnected + 사유이고, 다른 OWNER는 명의 문장 뒤 [Use my GitLab connection]이 GitLab 재연결을 부른다 (G6c · D21)", async () => {
    mocks.reconnectGitLabRepository.mockResolvedValue({ ok: true });
    const c = await card({ status: "connection-removed" } as ConnectionHealth, { token: null, viewer: { username: "me" } });
    expect(c.textContent).toContain(en.settings.repository.disconnected);
    expect(c.textContent).toContain(en.settings.repository.gitlab.removed);
    expect(c.textContent).toContain(en.settings.repository.gitlab.useMineHint(null, "me"));
    const use = [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(en.settings.repository.gitlab.useMine))!;
    await act(async () => { use.click(); });
    expect(mocks.reconnectGitLabRepository).toHaveBeenCalledWith({ slug: "acme" });
    expect(mocks.connectRepository).not.toHaveBeenCalled();
  });

  it("토큰을 못 쓰고(D22) 보는 사람이 연결이 없으면 PAT 입력이 선다", async () => {
    const c = await card({ status: "connection-unusable" } as ConnectionHealth, { token: { username: "ox", expiresAt: null, viewerIsOwner: false }, viewer: null });
    expect(c.textContent).toContain(en.settings.repository.gitlab.unusable);
    expect(c.querySelector('input[type="password"]')).not.toBeNull();
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });

  it("조회 실패는 Couldn't check이고 끊김으로 접지 않는다 — 복구 컨트롤이 없다", async () => {
    const c = await card({ status: "unknown" } as ConnectionHealth, { token: { username: "ox", expiresAt: null, viewerIsOwner: false }, viewer: { username: "me" } });
    expect(c.textContent).toContain(en.settings.repository.unknown);
    expect(c.textContent).not.toContain(en.settings.repository.gitlab.useMine);
  });
});

describe("설정 › CI — GitLab (G7)", () => {
  it("파일 자리는 .gitlab-ci.yml이고 문장이 CI job이다", async () => {
    const { container } = await render(<RepoHostScope host="gitlab"><CiCard slug="acme" host="gitlab" archived={false} stale={[]}><p>yaml</p></CiCard></RepoHostScope>);
    expect(container.textContent).toContain(".gitlab-ci.yml");
    expect(container.textContent).toContain(gl.settings.ci.workflow);
    expect(gl.settings.ci.workflow).toBe("CI file");
    expect(container.textContent).not.toMatch(GITHUB_WORDS);
  });
});

describe("RepoHostScope — 클라이언트 조각의 사전", () => {
  it("GitLab 범위 아래 useMessages()가 merge request 문장이고, GitHub 범위는 그대로다", async () => {
    const { useMessages } = await import("@/components/i18n/messages-provider");
    function Probe() {
      const m = useMessages();
      return <p>{m.translations.publish.openPr} · {m.home.meta.pr(128)}</p>;
    }
    const gitlab = await render(<RepoHostScope host="gitlab"><Probe /></RepoHostScope>);
    expect(gitlab.container.textContent).toBe("Open merge request · !128");
    const github = await render(<RepoHostScope host="github"><Probe /></RepoHostScope>);
    expect(github.container.textContent).toBe("Open pull request · #128");
  });
});
