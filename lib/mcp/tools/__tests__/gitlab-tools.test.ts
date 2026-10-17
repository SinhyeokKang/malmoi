import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness } from "@/app/(edit)/__tests__/harness";
import type { PrismaClient } from "@/generated/prisma/client";
import type { RepoTargetResult } from "@/lib/repo-host/target";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

import type { TokenGrant } from "../../grant";
import { toToolResult, type ToolOutcome } from "../../result";
import type { ApiTokenSubject } from "../../token-store";

/**
 * **GitLab 프로젝트의 MCP 도구** (gitlab-repositories tasks §4 둘째 항목 · D26). 웹과 같은 코어를 부르고(Action을 부르지 않는다), 필드
 * 이름은 **호스트 어휘를 따른다** — GitHub 프로젝트 응답은 그대로(+`repositoryHost`), GitLab 프로젝트는 `newFromGitLab`·
 * `lastPublishMergeRequest`·`mergeRequest`. GitLab 대상 응답에 `GitHub`·`pull request`·`github.com`이 0건이어야 한다(spec 완료 조건 9).
 * 코어는 가짜다 — 여기서 재는 것은 입력 갈래·코어 인자·결과 모양·문장이다.
 */
const h = vi.hoisted(() => ({
  core: vi.fn(),
  health: vi.fn(),
  release: { tag: "malmoi-i18n-push-gitlab-v1", sha: null as string | null },
}));
const core = (name: string) => (...args: unknown[]) => h.core(name, ...args);
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/onboarding-run/repos", async (orig) => ({ ...(await orig<object>()), listRepositories: core("repos") }));
vi.mock("@/lib/onboarding-run/gitlab-repos", () => ({ listGitLabRepositories: core("gitlabRepos") }));
vi.mock("@/lib/onboarding-run/branches", () => ({ listNewRepoBranches: core("branches"), listLinkedBranches: core("linkedBranches") }));
vi.mock("@/lib/onboarding-run/detect", async (orig) => ({ ...(await orig<object>()), detectFormats: core("detect"), detectProjectFormats: core("detectProject") }));
vi.mock("@/lib/onboarding-run/create", async (orig) => ({ ...(await orig<object>()), createProjectFromRepo: core("create") }));
vi.mock("@/lib/onboarding-run/add", async (orig) => ({ ...(await orig<object>()), addSources: core("add") }));
vi.mock("@/lib/onboarding-run/rotate-token", () => ({ rotateToken: core("rotate") }));
vi.mock("@/lib/onboarding-run/import", async (orig) => ({ ...(await orig<object>()), importRepository: core("sync") }));
vi.mock("@/lib/sync/publish", () => ({ publishProject: core("publish") }));
vi.mock("@/lib/publish/load-preview", () => ({ loadPreview: core("preview") }));
vi.mock("@/lib/surfaces/remove", async (orig) => ({ ...(await orig<object>()), previewSurfaceRemoval: core("removalPreview"), removeSurface: core("remove") }));
vi.mock("@/lib/keys/query", async (orig) => ({ ...(await orig<object>()),
  loadProjectListAggregates: async () => ({ locales: [], keyTotals: new Map(), cells: [], newKeys: new Map([["g1", 3], ["p1", 2]]), unsent: new Map(), unsentSurfaces: new Map() }),
  loadSurfaceCounts: async () => [] }));
vi.mock("@/lib/repo-host", async (orig) => ({ ...(await orig<object>()), loadConnectionHealth: (target: RepoTargetResult) => h.health(target) }));
// 릴리스 SHA는 상수다 — 발행 전(`null`)과 발행 뒤(40자)를 둘 다 재려고 값만 바꿔 끼운다.
vi.mock("@/lib/onboarding/gitlab-ci", async (orig) => ({ ...(await orig<object>()), GITLAB_CI_RELEASE: h.release }));

const { TOOLS } = await import("..");
const tool = (name: string) => {
  const found = TOOLS.find(t => t.name === name);
  if (found === undefined) throw new Error(name);
  return found;
};

const GITLAB_PROJECT = { id: "g1", slug: "glab", repoHost: "gitlab", installationId: null, gitlabConnectionId: "conn-1", repositoryId: "87515176" };
const SURFACES = [{ id: "s1", slug: "default", pathTemplate: "i18n/{locale}.json", adapterName: "json-catalog", baseLocale: "en", declaredBaseLocale: null, archivedAt: null, lastCommitSha: "abc", locales: [] }];
const ALL: TokenGrant[] = ["translation:write", "project:settings", "member:manage", "project:create"];
const subject = (userId: string, grants: TokenGrant[] = ALL): ApiTokenSubject => ({ userId, grants, scope: { kind: "all" }, credential: { kind: "api-token", tokenHash: `hash-${userId}` } });
const SUBJECT_CORE = { userId: "owner", credential: { kind: "api-token", tokenHash: "hash-owner" } };

let prisma: PrismaClient;
beforeEach(() => {
  const base = createHarness({
    projects: [GITLAB_PROJECT, { id: "p1", slug: "acme", repositoryId: "10" }],
    members: [{ projectId: "g1", userId: "owner", role: "OWNER" }, { projectId: "p1", userId: "owner", role: "OWNER" }, { projectId: "g1", userId: "editor", role: "EDITOR" }],
    users: [{ id: "owner", email: "o@a.com" }, { id: "editor", email: "e@a.com" }],
  }).prisma as unknown as PrismaClient & { project: { findUnique: (args: { select?: Record<string, unknown> }) => Promise<Record<string, unknown> | null> } };
  // 하네스의 프로젝트 행은 표면을 싣지 않는다 — 표면을 고르는 조회(`get_project`·`get_workflow`)에만 붙인다.
  const findUnique = base.project.findUnique.bind(base.project);
  prisma = { ...base, project: { ...base.project, findUnique: async (args: { select?: Record<string, unknown> }) => {
    const row = await findUnique(args);
    return row !== null && args.select?.["surfaces"] !== undefined ? { ...row, surfaces: SURFACES } : row;
  } } } as unknown as PrismaClient;
  h.core.mockReset();
  h.health.mockReset().mockResolvedValue({ status: "ok" });
  h.release.sha = null;
});

const call = (name: string, who: ApiTokenSubject, input: Record<string, unknown>): Promise<ToolOutcome> =>
  tool(name).run({ prisma, subject: who, now: new Date("2026-10-12T00:00:00Z"), origin: "https://dev.mal-moi.com" }, input as never);
const code = (outcome: ToolOutcome) => outcome.status === "refused" ? outcome.code : outcome.status;
/** 직렬화된 결과 전체(요약·데이터·거부 문장) — 에이전트가 읽는 바이트다. */
const wire = (outcome: ToolOutcome) => JSON.stringify(toToolResult(outcome));
const NO_GITHUB = /github|pull request/i;
const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("list_repositories — 호스트 지정", () => {
  it("host 없이 부르면 GitHub 코어 그대로다 — 기존 클라이언트 호환", async () => {
    h.core.mockResolvedValueOnce({ ok: true, repos: [], pending: false });
    expect(await call("list_repositories", subject("owner"), {})).toMatchObject({ status: "ok", data: { repositories: [], installRequestPending: false } });
    expect(h.core).toHaveBeenCalledExactlyOnceWith("repos", prisma, SUBJECT_CORE);
  });

  it("host: gitlab은 호출자 자신의 연결로 GitLab 목록을 읽고 GitHub 낱말을 싣지 않는다", async () => {
    const repo = { repositoryId: "87515176", fullName: "grp/sub/app", owner: "grp/sub", name: "app", lastActivityAt: null };
    h.core.mockResolvedValueOnce({ ok: true, repos: [repo], truncated: false });
    const outcome = await call("list_repositories", subject("owner"), { host: "gitlab" });
    expect(outcome).toMatchObject({ status: "ok", data: { repositories: [repo], truncated: false } });
    expect(h.core).toHaveBeenCalledExactlyOnceWith("gitlabRepos", prisma, SUBJECT_CORE);
    expect(wire(outcome)).not.toMatch(NO_GITHUB);
  });

  it.each([
    ["gitlab-not-connected", en.mcp.needsBrowser["gitlab-not-connected"]],
    ["gitlab-reconnect", en.mcp.needsBrowser["gitlab-reconnect"]],
  ] as const)("%s는 브라우저(/account)로 보낸다 — PAT를 도구로 받지 않는다", async (error, message) => {
    h.core.mockResolvedValueOnce({ ok: false, error });
    const outcome = await call("list_repositories", subject("owner"), { host: "gitlab" });
    expect(outcome).toEqual({ status: "needs-browser", reason: error, url: `https://dev.mal-moi.com${routes.account()}` });
    expect(wire(outcome)).toContain(message);
    expect(message).not.toMatch(NO_GITHUB);
  });

  it("grant 없는 토큰은 GitLab도 부르지 않는다", async () => {
    expect(code(await call("list_repositories", subject("owner", []), { host: "gitlab" }))).toBe("token-scope");
    expect(h.core).not.toHaveBeenCalled();
  });
});

describe("list_branches · detect_formats — GitLab 새 리포 입력", () => {
  it("{ host: gitlab, repositoryId }는 웹 Action과 같은 코어 입력으로 간다", async () => {
    h.core.mockResolvedValueOnce({ ok: true, names: ["main", "malmoi-i18n/sync-x"], defaultBranch: "main", truncated: false });
    expect(await call("list_branches", subject("owner"), { host: "gitlab", repositoryId: "87515176" })).toMatchObject({ status: "ok", data: { branches: ["main"] } });
    expect(h.core).toHaveBeenCalledExactlyOnceWith("branches", prisma, SUBJECT_CORE, { host: "gitlab", repositoryId: "87515176" });

    h.core.mockResolvedValueOnce({ ok: true, candidates: [] });
    expect(code(await call("detect_formats", subject("owner"), { host: "gitlab", repositoryId: "87515176", ref: "main" }))).toBe("ok");
    expect(h.core).toHaveBeenLastCalledWith("detect", prisma, SUBJECT_CORE, { host: "gitlab", repositoryId: "87515176", ref: "main" });
  });

  it.each([
    ["list_branches", { host: "gitlab" }],
    ["list_branches", { repositoryId: "1" }],
    ["list_branches", { host: "gitlab", repositoryId: "1", owner: "o" }],
    ["list_branches", { host: "gitlab", repositoryId: "1", slug: "glab" }],
    ["detect_formats", { host: "gitlab", repositoryId: "1", repo: "r" }],
  ] as const)("%s %j는 invalid-input — 어느 코어도 부르지 않는다", async (name, input) => {
    expect(code(await call(name, subject("owner"), input))).toBe("invalid-input");
    expect(h.core).not.toHaveBeenCalled();
  });

  it("repositoryId는 숫자만 받는다 — 이름·경로로 GitLab 리포를 찾지 않는다", () => {
    const schema = tool("list_branches").inputSchema as { safeParse(v: unknown): { success: boolean } };
    expect(schema.safeParse({ host: "gitlab", repositoryId: "87515176" }).success).toBe(true);
    expect(schema.safeParse({ host: "gitlab", repositoryId: "grp/app" }).success).toBe(false);
    expect(schema.safeParse({ host: "gitlab", repositoryId: "0" }).success).toBe(false);
    expect(schema.safeParse({ host: "bitbucket", repositoryId: "1" }).success).toBe(false);
  });

  it("GitLab 연결 없음은 needs-browser, 보관된 리포는 문장이 있는 거부다(장애로 접지 않는다)", async () => {
    h.core.mockResolvedValueOnce({ ok: false, error: "gitlab-not-connected" });
    expect(await call("detect_formats", subject("owner"), { host: "gitlab", repositoryId: "1" })).toMatchObject({ status: "needs-browser", reason: "gitlab-not-connected" });
    h.core.mockResolvedValueOnce({ ok: false, error: "gitlab-repo-archived" });
    const archived = toToolResult(await call("detect_formats", subject("owner"), { host: "gitlab", repositoryId: "1" }));
    expect(archived.structuredContent).toMatchObject({ status: "gitlab-repo-archived", message: en.mcp.errors.gitlab["gitlab-repo-archived"] });
    expect(JSON.stringify(archived)).not.toMatch(NO_GITHUB);
  });
});

describe("create_project — GitLab", () => {
  const PICK = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", confirmation: "c" };
  const INPUT = { host: "gitlab", repositoryId: "87515176", slug: "glab-new", name: "App", baseBranch: "main", surfaces: [PICK] };
  const CREATED = { ok: true, slug: "glab", defaultSurfaceSlug: "default", pushToken: "raw-token", baseBranch: "main",
    surfaces: [{ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", adapter: "json-catalog", baseLocale: "en" }], count: 4, yaml: "" };

  it("코어 입력은 GitLab 모양이고 owner·repo를 만들지 않는다", async () => {
    h.core.mockResolvedValueOnce(CREATED);
    await call("create_project", subject("owner"), INPUT);
    expect(h.core).toHaveBeenCalledExactlyOnceWith("create", prisma, SUBJECT_CORE,
      { host: "gitlab", repositoryId: "87515176", slug: "glab-new", name: "App", baseBranch: "main", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] },
      { confirmations: ["c"], origin: "https://dev.mal-moi.com" });
  });

  it("릴리스 SHA 전이면 CI 파일을 내지 않고 CI/CD 변수 안내만 한다 — GitHub 낱말 0", async () => {
    h.core.mockResolvedValueOnce(CREATED);
    const outcome = await call("create_project", subject("owner"), INPUT);
    expect(outcome).toMatchObject({ status: "ok", data: { slug: "glab", pushToken: "raw-token", variableName: "PUSH_TOKEN", workflow: null }, summary: en.mcp.summary.gitlab.createdWithoutCi("glab", 4) });
    expect(outcome.status === "ok" && "secretName" in outcome.data).toBe(false);
    expect(wire(outcome)).not.toMatch(NO_GITHUB);
  });

  it("릴리스 SHA가 40자 hex면 .gitlab-ci.yml을 낸다", async () => {
    h.release.sha = SHA;
    h.core.mockResolvedValueOnce(CREATED);
    const outcome = await call("create_project", subject("owner"), INPUT);
    const workflow = outcome.status === "ok" ? outcome.data.workflow as { path: string; yaml: string } : null;
    expect(workflow?.path).toBe(".gitlab-ci.yml");
    expect(workflow?.yaml).toContain("malmoi-i18n-glab-default:");
    expect(outcome.status === "ok" && outcome.summary).toBe(en.mcp.summary.gitlab.created("glab", 4));
  });

  it.each([null, "unreleased", SHA.toUpperCase(), SHA.slice(1)])("릴리스 SHA %j는 발행 전으로 읽는다", async sha => {
    h.release.sha = sha;
    h.core.mockResolvedValueOnce(CREATED);
    const outcome = await call("create_project", subject("owner"), INPUT);
    expect(outcome.status === "ok" && outcome.data.workflow).toBeNull();
  });

  it("GitHub 입력은 기존 모양 그대로다", async () => {
    h.core.mockResolvedValueOnce({ ...CREATED, slug: "acme2", yaml: "on: push" });
    const outcome = await call("create_project", subject("owner"), { owner: "o", repo: "r", slug: "acme2", name: "A", baseBranch: "main", surfaces: [PICK] });
    expect(outcome).toMatchObject({ status: "ok", data: { secretName: "PUSH_TOKEN", workflow: { path: ".github/workflows/malmoi-i18n.yml", yaml: "on: push" } }, summary: en.mcp.summary.created("acme2", 4) });
    expect(h.core.mock.calls[0]?.[3]).toEqual({ owner: "o", repo: "r", slug: "acme2", name: "A", baseBranch: "main", surfaces: [{ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] });
  });

  it.each([
    { ...INPUT, owner: "o" },
    { slug: "x", name: "x", baseBranch: "main", surfaces: [PICK] },
    { owner: "o", repo: "r", repositoryId: "1", slug: "x", name: "x", baseBranch: "main", surfaces: [PICK] },
  ])("섞인 입력 %j는 invalid-input", async input => {
    expect(code(await call("create_project", subject("owner"), input))).toBe("invalid-input");
    expect(h.core).not.toHaveBeenCalled();
  });
});

describe("GitLab 프로젝트 대상 도구 — 호스트 어휘", () => {
  it("get_project는 newFromGitLab·lastPublishMergeRequest·repositoryHost를 싣고 GitHub 이름을 싣지 않는다", async () => {
    await (prisma as unknown as { project: { update: (a: unknown) => Promise<unknown> } }).project.update({ where: { id: "g1" }, data: { lastPrUrl: "https://gitlab.com/grp/app/-/merge_requests/2" } });
    const outcome = await call("get_project", subject("owner"), { slug: "glab" });
    expect(outcome).toMatchObject({ status: "ok", data: { repositoryHost: "gitlab", newFromGitLab: 3, lastPublishMergeRequest: "https://gitlab.com/grp/app/-/merge_requests/2", connection: "ok" } });
    const data = outcome.status === "ok" ? outcome.data : {};
    expect("newFromGitHub" in data || "lastPublishPullRequest" in data).toBe(false);
    expect(wire(outcome)).not.toMatch(NO_GITHUB);
  });

  it("GitHub 프로젝트의 get_project는 기존 이름 그대로 + repositoryHost", async () => {
    const outcome = await call("get_project", subject("owner"), { slug: "acme" });
    expect(outcome).toMatchObject({ status: "ok", data: { repositoryHost: "github", newFromGitHub: 2, lastPublishPullRequest: "https://github.com/o/r/pull/7" } });
    expect(outcome.status === "ok" && "newFromGitLab" in outcome.data).toBe(false);
  });

  // D21·D22·D24 — 참조 비움·못 쓰는 토큰은 화면에서 Disconnected다. 외부 계약은 넓히지 않고 GitHub `unpinned`과 같은 `not-connected`로 접는다(Q12 · D26).
  it.each(["connection-removed", "connection-unusable"])("connection %s는 not-connected로 접는다", async status => {
    h.health.mockResolvedValueOnce({ status });
    const outcome = await call("get_project", subject("owner"), { slug: "glab" });
    expect(outcome.status === "ok" && outcome.data.connection).toBe("not-connected");
  });

  it("list_projects는 프로젝트마다 repositoryHost를 싣는다", async () => {
    const outcome = await call("list_projects", subject("owner"), {});
    const projects = outcome.status === "ok" ? outcome.data.projects as { slug: string; repositoryHost: string }[] : [];
    expect(projects.map(p => [p.slug, p.repositoryHost])).toEqual([["acme", "github"], ["glab", "gitlab"]]);
  });

  it("preview_publish는 mergeRequest로 싣고 요약이 merge request를 말한다", async () => {
    h.core.mockResolvedValueOnce({ status: "ok", preview: { fingerprint: "f", sendable: { total: 2, keys: 1 }, changedFiles: [], fileChanges: [], total: 2, keys: 1, withoutFile: 0, withoutKey: 0, openPr: { number: 2, url: "https://gitlab.com/grp/app/-/merge_requests/2" }, groups: [] } });
    const outcome = await call("preview_publish", subject("owner"), { slug: "glab" });
    expect(outcome).toMatchObject({ status: "ok", data: { mergeRequest: { status: "open", number: 2 } }, summary: en.mcp.summary.gitlab.publishPreview(2) });
    expect(outcome.status === "ok" && "pullRequest" in outcome.data).toBe(false);
    expect(wire(outcome)).not.toMatch(NO_GITHUB);
  });

  it("GitHub 프로젝트의 preview_publish는 pullRequest 그대로다", async () => {
    h.core.mockResolvedValueOnce({ status: "ok", preview: { fingerprint: "f", sendable: { total: 1, keys: 1 }, changedFiles: [], fileChanges: [], total: 1, keys: 1, withoutFile: 0, withoutKey: 0, openPr: null, groups: [] } });
    expect(await call("preview_publish", subject("owner"), { slug: "acme" })).toMatchObject({ status: "ok", data: { pullRequest: { status: "none" } }, summary: en.mcp.summary.publishPreview(1) });
  });

  it.each(["created", "updated"] as const)("publish %s 요약은 merge request를 말한다", async pr => {
    h.core.mockResolvedValueOnce({ outcome: { status: "committed", pr, delivered: 1, commitSha: "c", prUrl: "https://gitlab.com/grp/app/-/merge_requests/2", changed: ["a.json"] }, attempted: true });
    const outcome = await call("publish", subject("owner"), { slug: "glab", fingerprint: "f" });
    expect(outcome.status === "ok" && outcome.summary).toBe(en.mcp.summary.gitlab.published(pr));
    expect(outcome.status === "ok" && outcome.summary).not.toMatch(NO_GITHUB);
  });

  /** R-D2 🟡 — 화면 키를 재사용하는 거부 문장도 그 프로젝트의 호스트 문장이다(`withRepoHost`). GitHub 프로젝트는 그대로다. */
  it("publish too-soon 거부 문장은 GitLab 프로젝트에서 merge request를 말한다", async () => {
    h.core.mockResolvedValueOnce({ outcome: { status: "failed", error: "too-soon", retryable: true, retryAfterSeconds: 5 }, attempted: false });
    const outcome = await call("publish", subject("owner"), { slug: "glab", fingerprint: "f" });
    expect(outcome).toMatchObject({ status: "refused", code: "too-soon", message: en.translations.publish.onGitLab.tooSoonBody });
    expect(JSON.stringify(outcome)).not.toMatch(NO_GITHUB);
  });

  it("preview_source_detach은 mergeRequest로 싣는다 — GitHub 프로젝트는 pullRequest 그대로", async () => {
    h.core.mockResolvedValue({ ok: true, pendingCount: 0, approval: null, openPr: "none" });
    const gitlab = await call("preview_source_detach", subject("owner"), { slug: "glab", surfaceSlug: "default" });
    expect(gitlab).toMatchObject({ status: "ok", data: { mergeRequest: "none" } });
    expect(gitlab.status === "ok" && "pullRequest" in gitlab.data).toBe(false);
    expect(wire(gitlab)).not.toMatch(NO_GITHUB);
    expect(await call("preview_source_detach", subject("owner"), { slug: "acme", surfaceSlug: "default" })).toMatchObject({ status: "ok", data: { pullRequest: "none" } });
  });

  /** 소스를 지운 뒤 할 일은 GitLab에선 `.gitlab-ci.yml`의 그 소스 job을 지우는 것이다 — GitHub 워크플로 step이 아니다(감사 U1 · D26). */
  it("detach_source 요약은 GitLab 프로젝트에서 .gitlab-ci.yml의 job을 말한다 — GitHub 프로젝트는 그대로", async () => {
    h.core.mockResolvedValue({ ok: true });
    const gitlab = await call("detach_source", subject("owner"), { slug: "glab", surfaceSlug: "default", approval: null });
    expect(gitlab).toEqual({ status: "ok", data: { detached: "default" }, summary: en.mcp.summary.gitlab.sourceRemoved("default") });
    expect(en.mcp.summary.gitlab.sourceRemoved("default")).toContain(".gitlab-ci.yml");
    expect(wire(gitlab)).not.toMatch(NO_GITHUB);
    expect(wire(gitlab)).not.toMatch(/workflow|\bstep\b/i);
    expect(await call("detach_source", subject("owner"), { slug: "acme", surfaceSlug: "default", approval: null }))
      .toEqual({ status: "ok", data: { detached: "default" }, summary: en.mcp.summary.sourceRemoved("default") });
  });

  it("rotate_push_token은 CI/CD 변수로 안내한다", async () => {
    h.core.mockResolvedValueOnce({ ok: true, pushToken: "raw" });
    const outcome = await call("rotate_push_token", subject("owner"), { slug: "glab" });
    expect(outcome).toMatchObject({ status: "ok", data: { pushToken: "raw", variableName: "PUSH_TOKEN" }, summary: en.mcp.summary.gitlab.pushToken });
    expect(wire(outcome)).not.toMatch(NO_GITHUB);
  });

  it("sync_repository의 gitlab-project-disconnected는 문장이 있는 거부다", async () => {
    h.core.mockResolvedValueOnce({ outcome: { ok: false, error: "gitlab-project-disconnected" }, attempted: false });
    const result = toToolResult(await call("sync_repository", subject("owner"), { slug: "glab", approval: "a" }));
    expect(result.structuredContent).toMatchObject({ status: "gitlab-project-disconnected", message: en.mcp.errors.gitlab["gitlab-project-disconnected"] });
    expect(JSON.stringify(result)).not.toMatch(NO_GITHUB);
  });

  /**
   * 소스가 늘면 GitLab은 job 파일 전체를 다시 붙인다(ACTIONS §5). 쓰기가 끝난 뒤 표면을 다시 읽는 조회가 실패하면 결과(추가된 소스)가 장애로
   * 접히므로 파일을 싣지 않고 `get_workflow`로 보낸다 — GitHub step(`uses: …/.github/…`)은 GitLab 리포에 붙일 수 없으니 싣지 않는다.
   */
  it("add_sources는 GitHub step을 싣지 않고 get_workflow로 보낸다(발행 전이면 Sync 안내)", async () => {
    const added = { ok: true, results: [{ surfaceSlug: "web" }], yaml: "      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v3" };
    const input = { slug: "glab", picks: [{ adapter: "json-catalog", pathTemplate: "web/{locale}.json", baseLocale: "en", confirmation: "c" }] };
    h.core.mockResolvedValueOnce(added);
    const before = await call("add_sources", subject("owner"), input);
    expect(before).toEqual({ status: "ok", data: { sources: added.results }, summary: en.mcp.summary.gitlab.sourcesAddedWithoutCi(1) });
    expect(wire(before)).not.toMatch(NO_GITHUB);

    h.release.sha = SHA;
    h.core.mockResolvedValueOnce(added);
    const after = await call("add_sources", subject("owner"), input);
    expect(after).toEqual({ status: "ok", data: { sources: added.results }, summary: en.mcp.summary.gitlab.sourcesAdded(1) });
    expect(en.mcp.summary.gitlab.sourcesAdded(1)).toContain("get_workflow");
  });
});

describe("get_workflow — 호스트별 경로", () => {
  it("GitLab 프로젝트는 발행 전이면 workflow-unavailable 거부다", async () => {
    const result = toToolResult(await call("get_workflow", subject("owner"), { slug: "glab" }));
    expect(result.structuredContent).toMatchObject({ status: "workflow-unavailable", message: en.mcp.errors["workflow-unavailable"] });
    expect(JSON.stringify(result)).not.toMatch(NO_GITHUB);
  });

  it("발행 뒤면 .gitlab-ci.yml과 CI/CD 변수 이름이다", async () => {
    h.release.sha = SHA;
    const outcome = await call("get_workflow", subject("owner"), { slug: "glab" });
    expect(outcome).toMatchObject({ status: "ok", data: { path: ".gitlab-ci.yml", variableName: "PUSH_TOKEN" }, summary: en.mcp.summary.gitlab.workflow });
    expect(outcome.status === "ok" && String(outcome.data.yaml)).toContain(`MALMOI_I18N_PUSH_SHA:`);
    // CI 파일은 말모이 리포를 clone한다 — 그 URL(github.com)만 예외다(spec 9 "말모이 자체 리포를 가리키는 링크"). 나머지 바이트엔 GitHub이 없다.
    const { yaml: _yaml, ...rest } = outcome.status === "ok" ? outcome.data : {};
    expect(JSON.stringify({ rest, summary: outcome.status === "ok" ? outcome.summary : "" })).not.toMatch(NO_GITHUB);
  });

  it("GitHub 프로젝트는 기존 경로 그대로다", async () => {
    const outcome = await call("get_workflow", subject("owner"), { slug: "acme" });
    expect(outcome).toMatchObject({ status: "ok", data: { path: ".github/workflows/malmoi-i18n.yml", secretName: "PUSH_TOKEN" }, summary: en.mcp.summary.workflow });
  });

  it("EDITOR는 GitLab 프로젝트에서도 forbidden이다(인가는 호스트와 무관하다)", async () => {
    expect(code(await call("get_workflow", subject("editor"), { slug: "glab" }))).toBe("forbidden");
  });
});

describe("도구 설명 — 호스트 중립", () => {
  it.each(["list_repositories", "list_branches", "detect_formats", "get_workflow", "create_project", "rotate_push_token"] as const)("%s 설명이 GitLab 입력·경로를 말한다", name => {
    expect(en.mcp.tools[name]).toMatch(/GitLab/);
  });
});
