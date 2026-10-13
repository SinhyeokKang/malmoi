// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoHostScope } from "@/components/i18n/messages-provider";
import { withRepoHost } from "@/lib/i18n/host";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { metaTabs, type MetaTabsInput } from "@/lib/home/meta";
import type { TimeZone } from "@/lib/time-zone/zones";
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
vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: mocks.connectGitLab, disconnectGitLab: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }));

const { MetaColumn } = await import("@/components/home/meta-column");
const { RepositoryCard } = await import("@/components/settings/repository-card");
const { CiCard } = await import("@/components/settings/ci-card");
const { GitLabSection } = await import("@/components/account/gitlab-section");

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
  async function card(health: ConnectionHealth, gitlab: Parameters<typeof RepositoryCard>[0]["gitlab"], timeZone?: TimeZone) {
    const { container } = await render(
      <RepoHostScope host="gitlab">
        <RepositoryCard slug="acme" owner="group/sub" repo="very-long-project-name" branch="main" archived={false} health={Promise.resolve(health)} gitlab={gitlab} />
      </RepoHostScope>,
      timeZone === undefined ? {} : { timeZone },
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return container;
  }

  const day = 86_400_000;
  const future = (days: number) => new Date(Date.now() + days * day).toISOString();
  const rows = (c: HTMLElement) => c.querySelectorAll("[data-gitlab-row]").length;

  /** #250 — 정상은 **한 행**이다: 보조줄에 토큰 주인·만료일, 버튼은 [Open on GitLab]뿐. 교체 컨트롤은 임박·만료에만 선다. */
  it("연결됨은 한 행 — 보조줄 `Connected with @user's token · expires …` + [Open on GitLab]뿐이다 (G6a · #250)", async () => {
    const c = await card({ status: "ok" } as ConnectionHealth, { token: { username: "ox", expiresAt: "2027-03-04T00:00:00.000Z", viewerIsOwner: false, projectCount: 2 }, viewer: { username: "me" } });
    expect(rows(c)).toBe(1);
    expect(c.textContent).toContain(en.settings.repository.gitlab.connectedWith("ox", "Mar 4, 2027"));
    const open = [...c.querySelectorAll("a")].find((a) => a.textContent === gl.settings.openRepo)!;
    expect(open.href).toBe("https://gitlab.com/group/sub/very-long-project-name");
    expect([...c.querySelectorAll("button")].map((b) => b.textContent)).not.toContain(en.account.gitlab.replace);
    expect(c.querySelector('input[type="password"]')).toBeNull();
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });

  it("토큰 주인이 보면 `your token`이다 (G6b1·G6c1 · #250)", async () => {
    const c = await card({ status: "ok" } as ConnectionHealth, { token: { username: "ox", expiresAt: "2027-03-04T00:00:00.000Z", viewerIsOwner: true, projectCount: 1 }, viewer: { username: "ox" } });
    expect(c.textContent).toContain(en.settings.repository.gitlab.connectedWithYours("Mar 4, 2027"));
  });

  /** #251 — 만료 임박(주인): 머리 warning Alert(남은 일수·날짜) · 행 칩 호박 + `Expires soon` 배지 · 인라인 PAT 폼(Replace token + 사용 프로젝트 수). */
  it("만료 임박(주인)은 warning Alert · 행 Expires soon(호박) · 인라인 교체 폼이다 (G6b1 · #251)", async () => {
    const c = await card({ status: "ok" } as ConnectionHealth, { token: { username: "ox", expiresAt: future(9), viewerIsOwner: true, projectCount: 3 }, viewer: { username: "ox" } });
    const notice = c.querySelector("[data-card-notice]");
    expect(notice?.textContent).toMatch(/^Your GitLab token expires in \d+ days, on /);
    expect(rows(c)).toBe(1);
    const row = c.querySelector("[data-gitlab-row]")!;
    expect(row.textContent).toContain(en.account.gitlab.expiresSoon);
    expect(row.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("warning");
    const input = c.querySelector<HTMLInputElement>('input[type="password"]');
    expect(input).not.toBeNull();
    expect(c.textContent).toContain(en.settings.repository.gitlab.usedByUpdates(3));
    expect([...c.querySelectorAll("button")].map((b) => b.textContent)).toContain(en.account.gitlab.replace);
    expect(c.textContent).not.toContain(en.settings.repository.gitlab.useMine);
  });

  /** #252 — 만료(주인): 머리 Alert가 만료일을 말하고 인라인 교체 폼이 선다. Base branch 행은 Select 그대로다(빨간 계정 안내로 바뀌지 않는다). */
  it("만료(주인)은 만료일 Alert · Disconnected · 인라인 교체 폼이고 Base branch는 Select 그대로다 (G6c1 · #252)", async () => {
    mocks.listProjectBranches.mockResolvedValue({ ok: false, error: "gitlab-reconnect" });
    const c = await card({ status: "connection-unusable" } as ConnectionHealth, { token: { username: "ox", expiresAt: "2026-10-09T00:00:00.000Z", viewerIsOwner: true, projectCount: 1 }, viewer: { username: "ox" } });
    expect(c.querySelector("[data-card-notice]")?.textContent).toContain(en.settings.repository.gitlab.expiredYours("Oct 9, 2026"));
    expect(c.textContent).toContain(en.settings.repository.disconnected);
    expect(c.textContent).toContain(en.settings.repository.gitlab.usedByReconnects(1));
    expect(c.querySelector("#base-branch")?.getAttribute("role")).toBe("combobox");
    expect(c.querySelector("[data-field-error]")).toBeNull();
  });

  /**
   * audit U5 · 결정 R1 — PAT 만료일은 GitLab이 날짜로만 주는 값이라(그날 00:00 UTC로 저장) 보는 사람 시간대로 옮기면 서쪽에선 하루 이르다.
   * GitLab 토큰 화면과 같은 날짜여야 대조가 된다.
   */
  it.each(["America/Los_Angeles", "Pacific/Honolulu"] as const)("%s에서도 만료일은 GitLab과 같은 날짜다 — 연결 줄·만료 Alert (U5)", async (timeZone) => {
    const ok = await card({ status: "ok" } as ConnectionHealth, { token: { username: "ox", expiresAt: "2027-03-04T00:00:00.000Z", viewerIsOwner: true, projectCount: 1 }, viewer: { username: "ox" } }, timeZone);
    expect(ok.textContent).toContain(en.settings.repository.gitlab.connectedWithYours("Mar 4, 2027"));
    mocks.listProjectBranches.mockResolvedValue({ ok: false, error: "gitlab-reconnect" });
    const expired = await card({ status: "connection-unusable" } as ConnectionHealth, { token: { username: "ox", expiresAt: "2026-10-09T00:00:00.000Z", viewerIsOwner: true, projectCount: 1 }, viewer: { username: "ox" } }, timeZone);
    expect(expired.querySelector("[data-card-notice]")?.textContent).toContain(en.settings.repository.gitlab.expiredYours("Oct 9, 2026"));
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
    const c = await card({ status: "connection-unusable" } as ConnectionHealth, { token: { username: "ox", expiresAt: null, viewerIsOwner: false, projectCount: 1 }, viewer: null });
    expect(c.textContent).toContain(en.settings.repository.gitlab.unusable);
    expect(c.querySelector('input[type="password"]')).not.toBeNull();
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });

  /**
   * R-Eui 🟡2 — 같은 id·다른 경로(`repo-moved`)는 GitHub 카드와 같은 형이다: 새 주소 Alert · `movedHint` · [Reconnect](새 이름 저장 — GitLab 재연결) ·
   * [Open on GitLab]은 새 주소. 복구 컨트롤 0개 상태 금지(POSTMORTEM 2026-09-19).
   */
  it("주소가 바뀌면 새 주소 Alert와 GitLab [Reconnect]가 서고 링크는 새 주소다 (repo-moved)", async () => {
    mocks.reconnectGitLabRepository.mockResolvedValue({ ok: true });
    const c = await card({ status: "repo-moved", fullName: "group/renamed-project" } as ConnectionHealth, { token: { username: "ox", expiresAt: null, viewerIsOwner: true, projectCount: 1 }, viewer: { username: "ox" } });
    // 새 주소 Alert — GitHub 카드와 같은 사전 문장(`health.moved`)이다.
    expect(c.querySelector("[data-card-notice]")?.textContent).toBe("This repository moved to group/renamed-project");
    expect(c.textContent).toContain(en.settings.repository.movedHint);
    const open = [...c.querySelectorAll("a")].find((a) => a.textContent === gl.settings.openRepo)!;
    expect(open.href).toBe("https://gitlab.com/group/renamed-project");
    const reconnect = [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(en.settings.repository.reconnect))!;
    await act(async () => { reconnect.click(); });
    expect(mocks.reconnectGitLabRepository).toHaveBeenCalledWith({ slug: "acme" });
    expect(mocks.connectRepository).not.toHaveBeenCalled();
    expect(c.textContent).not.toMatch(GITHUB_WORDS);
  });

  it("조회 실패는 Couldn't check이고 끊김으로 접지 않는다 — 복구 컨트롤이 없다", async () => {
    const c = await card({ status: "unknown" } as ConnectionHealth, { token: { username: "ox", expiresAt: null, viewerIsOwner: false, projectCount: 1 }, viewer: { username: "me" } });
    expect(c.textContent).toContain(en.settings.repository.unknown);
    expect(c.textContent).not.toContain(en.settings.repository.gitlab.useMine);
  });
});

describe("/account › GitLab PAT 카드 — 만료일은 날짜 그대로 (audit U5 · 결정 R1)", () => {
  it.each(["America/Los_Angeles", "Pacific/Honolulu"] as const)("%s에서도 `Expires`·`Expired` 날짜가 GitLab 화면과 같다", async (timeZone) => {
    const valid = await render(<GitLabSection connection={{ username: "ox", expiresAt: "2099-03-04T00:00:00.000Z", projectCount: 1 }} />, { timeZone });
    expect(valid.container.textContent).toContain(en.account.gitlab.expires("Mar 4, 2099"));
    const expired = await render(<GitLabSection connection={{ username: "ox", expiresAt: "2026-10-09T00:00:00.000Z", projectCount: 1 }} />, { timeZone });
    expect(expired.container.textContent).toContain(en.account.gitlab.expiredOn("Oct 9, 2026"));
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

describe("Publish 결과 카드 — 리뷰 번호 (#254)", () => {
  it("GitLab 범위의 열린 MR 카드는 `!3`이고 GitHub은 `#3`이다", async () => {
    const { PrCard } = await import("@/components/publish-button");
    const gitlab = await render(<RepoHostScope host="gitlab"><PrCard repo="group/app" number={3} note="n" /></RepoHostScope>);
    expect(gitlab.container.textContent).toContain("group/app !3");
    expect(gitlab.container.textContent).not.toContain("#3");
    const github = await render(<RepoHostScope host="github"><PrCard repo="o/r" number={3} note="n" /></RepoHostScope>);
    expect(github.container.textContent).toContain("o/r #3");
  });
});

describe("설정 › CI 모달 — 훅 안내 (fix3)", () => {
  async function openModal(host: "github" | "gitlab") {
    const { container } = await render(<RepoHostScope host={host}><CiCard slug="acme" host={host} archived={false} stale={[]}><p>yaml</p></CiCard></RepoHostScope>);
    const row = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(host === "gitlab" ? gl.settings.ci.workflow : en.settings.ci.workflow))!;
    await act(async () => { await userEvent.setup().click(row); });
    return document.querySelector<HTMLElement>('[role="dialog"]')!;
  }

  it("GitLab 프로젝트는 생성 job의 MALMOI_I18N_WRAPPER 변수를 말한다 — action 입력 `wrapper`가 아니다", async () => {
    const dialog = await openModal("gitlab");
    expect(dialog.textContent).toContain("MALMOI_I18N_WRAPPER");
    expect(dialog.textContent).toContain("useTranslations()");
    expect(dialog.textContent).not.toMatch(/\bwrapper input\b/);
    expect(dialog.textContent).not.toMatch(GITHUB_WORDS);
  });

  it("GitHub 프로젝트는 그대로 action 입력 `wrapper`다", async () => {
    const dialog = await openModal("github");
    expect(dialog.textContent).toContain("also need the wrapper input");
    expect(dialog.textContent).not.toContain("MALMOI_I18N_WRAPPER");
  });
});
