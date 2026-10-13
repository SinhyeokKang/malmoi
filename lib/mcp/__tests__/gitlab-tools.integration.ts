import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { sealGitLabToken } from "@/lib/credentials/storage";
import { optionalEnv } from "@/lib/env";
import { createFakeGitLabRepo } from "@/lib/gitlab/__tests__/fake-repo";
import { GITLAB_CI_RELEASE } from "@/lib/onboarding/gitlab-ci";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

import type { TokenGrant } from "../grant";
import type { ToolResult } from "../result";
import type { ApiTokenSubject } from "../token-store";

/**
 * **GitLab 프로젝트 × MCP 도구 — 실제 코어** (gitlab-repositories tasks §4 둘째 항목). 도구 → 웹과 같은 코어 → 가짜 GitLab(전역 fetch) → 격리 PG.
 * 끝 단언은 **MCP 결과**(`executeTool`이 직렬화한 바이트)다 — 에이전트가 받는 것이 정본이다.
 *
 * - 인가: 연결 없는 사용자·만료된 연결은 브라우저로 보낸다(원격 호출 0) · EDITOR는 설정 도구가 forbidden · 멤버 아님은 not-found.
 * - **PAT는 응답·로그에 0건**(spec 완료 조건 11) — 결과 바이트와 콘솔 출력 전부에서 `glpat-`를 센다. 실제로 PAT가 원격에 실렸음도 함께 본다
 *   (아무것도 안 불러서 0건인 거짓 green을 막는다).
 * - GitLab 대상 응답에 `GitHub`·`pull request`·`github.com` 0건(spec 완료 조건 9).
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`의 `lib/mcp/__tests__/*.integration.ts`).
 */

const SECRET = "s".repeat(64);
const directory = mkdtempSync(join(tmpdir(), "malmoi-mcp-gitlab-"));
let binaries: string;
const PORT = 55657;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { TOOLS } = await import("../tools");
const { executeTool } = await import("../tools/execute");

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});

let consoleLines: () => string;
beforeEach(async () => {
  vi.stubEnv("APP_SIGNING_SECRET", SECRET);
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  const spies = (["error", "warn", "log", "info"] as const).map(level => vi.spyOn(console, level).mockImplementation(() => {}));
  consoleLines = () => JSON.stringify(spies.flatMap(spy => spy.mock.calls), (_key, value: unknown) => value instanceof Error ? `${value.name}: ${value.message}` : value);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const REPO = "87515176";
const BASE = "b".repeat(40);
const TOKEN_A = "glpat-mcp-owner-a";
const EN = '{\n  "hello": "Hello"\n}\n';
const KO = '{\n  "hello": "안녕"\n}\n';
const NO_GITHUB = /github|pull request/i;

/** 연결자 owner-a(GitLab 101, Maintainer) · EDITOR editor · 연결 없는 stranger. 연결은 봉투로 바로 넣는다(검증 왕복은 `lib/gitlab-connect`가 잰다). */
async function seed(options: { expiresAt?: Date | null } = {}) {
  for (const id of ["owner-a", "editor", "stranger"]) await prisma.user.create({ data: { id, email: `${id}@example.test` } });
  const connection = await prisma.gitLabConnection.create({ data: {
    userId: "owner-a", token: sealGitLabToken(TOKEN_A, { userId: "owner-a" }), gitlabUserId: "101", username: "alice", scopes: ["api"], expiresAt: options.expiresAt ?? null,
  } });
  await prisma.project.create({ data: {
    id: "p1", slug: "p1", name: "p1", repoHost: "gitlab", repoOwner: "g/sub", repoName: "app", repositoryId: REPO, gitlabConnectionId: connection.id, baseBranch: "main",
    members: { create: [{ userId: "owner-a", role: "OWNER" }, { userId: "editor", role: "EDITOR" }] },
    surfaces: { create: { id: "p1-s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false, lastCommitSha: "a".repeat(40), lastCommitAt: new Date("2026-10-01T00:00:00Z") } },
  } });
  await prisma.project.update({ where: { id: "p1" }, data: { defaultSurfaceId: "p1-s" } });
}

/** 가짜 GitLab 리포 + ①의 목록(`GET /projects?membership=true…`) 하나 — 리포 가짜는 숫자 id 주소만 받는다. */
function serve() {
  const repo = createFakeGitLabRepo({ repositoryId: REPO, branches: { main: BASE }, commits: { [BASE]: { "i18n/en.json": EN, "i18n/ko.json": KO } }, members: { 101: 50 } });
  const listed: string[] = [];
  vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/api/v4/projects") {
      listed.push(new Headers(init?.headers).get("PRIVATE-TOKEN") ?? "");
      return new Response(JSON.stringify([{ id: Number(REPO), path_with_namespace: "g/sub/app", last_activity_at: "2026-10-12T00:00:00.000Z" }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return repo.fetch(input, init);
  }) as typeof fetch);
  return { repo, listed, tokens: () => [...new Set([...listed, ...repo.calls.map(call => call.headers.get("PRIVATE-TOKEN") ?? "")])] };
}

const ALL: TokenGrant[] = ["translation:write", "project:settings", "member:manage", "project:create"];
async function token(userId: string): Promise<ApiTokenSubject> {
  const row = { userId, tokenHash: `hash-${userId}`, grants: ALL, allProjects: true, projectIds: [], expiresAt: new Date(Date.now() + 86_400_000) };
  await prisma.apiToken.create({ data: row });
  return { userId, credential: { kind: "api-token", tokenHash: row.tokenHash }, grants: row.grants, scope: { kind: "all" } };
}
const ORIGIN = "https://dev.mal-moi.com";
const exec = (name: string, subject: ApiTokenSubject, input: Record<string, unknown>): Promise<ToolResult> =>
  executeTool(TOOLS.find(t => t.name === name)!, () => ({ prisma, subject, now: new Date(), origin: ORIGIN }), input);
const data = (result: ToolResult) => result.structuredContent;
/** 결과 바이트 + 그동안의 콘솔 출력에 PAT가 없다. */
function expectNoPat(...results: ToolResult[]) {
  for (const result of results) expect(JSON.stringify(result)).not.toContain("glpat-");
  expect(consoleLines()).not.toContain("glpat-");
}

describe("새 GitLab 리포 — 목록·탐지·생성이 웹과 같은 코어로 간다", () => {
  it("list_repositories → detect_formats → create_project: 호출자 PAT로 읽고 응답엔 PAT·GitHub 낱말이 없다", async () => {
    await seed();
    const server = serve();
    const owner = await token("owner-a");

    const listed = await exec("list_repositories", owner, { host: "gitlab" });
    expect(listed.isError).toBe(false);
    expect(data(listed)).toMatchObject({ repositories: [{ repositoryId: REPO, fullName: "g/sub/app" }], truncated: false });

    const detected = await exec("detect_formats", owner, { host: "gitlab", repositoryId: REPO });
    expect(detected.isError).toBe(false);
    const candidate = (data(detected).candidates as { adapter: string; pathTemplate: string; baseLocale: string; confirmation: string }[])[0];
    expect(candidate).toMatchObject({ adapter: "json-catalog", pathTemplate: "i18n/{locale}.json" });

    const created = await exec("create_project", owner, {
      host: "gitlab", repositoryId: REPO, slug: "p2", name: "App", baseBranch: "main",
      surfaces: [{ adapter: candidate!.adapter, pathTemplate: candidate!.pathTemplate, baseLocale: candidate!.baseLocale, confirmation: candidate!.confirmation }],
    });
    expect(created.isError).toBe(false);
    // CI 원본은 발행됐다(`GITLAB_CI_RELEASE.sha` — v1, `89b27c21`) — 생성 결과에 `.gitlab-ci.yml`이 실리고 그 job이 박힌 SHA를 든다.
    // 발행 전 갈래(`workflow: null` · `createdWithoutCi`)는 릴리스를 mock하는 단위 테스트(`lib/mcp/tools/__tests__/gitlab-tools.test.ts`)가 잰다.
    expect(created.structuredContent).toMatchObject({ slug: "p2", variableName: "PUSH_TOKEN", workflow: { path: ".gitlab-ci.yml" }, keys: 1 });
    const workflow = created.structuredContent.workflow as { yaml: string };
    expect(workflow.yaml).toContain("malmoi-i18n-p2-i18n:");
    expect(workflow.yaml).toContain(`MALMOI_I18N_PUSH_SHA: "${GITLAB_CI_RELEASE.sha}"`);
    expect(created.content[0].text).toBe(en.mcp.summary.gitlab.created("p2", 1));
    expect(await prisma.project.findUniqueOrThrow({ where: { slug: "p2" }, select: { repoHost: true, repositoryId: true } })).toEqual({ repoHost: "gitlab", repositoryId: REPO });

    // CI 파일은 말모이 리포를 clone한다 — 그 URL(github.com)만 예외다(spec 9 "말모이 자체 리포를 가리키는 링크"). 나머지 바이트엔 GitHub이 없다.
    const { workflow: _workflow, ...createdRest } = created.structuredContent;
    for (const result of [listed, detected, { ...created, structuredContent: createdRest }]) expect(JSON.stringify(result)).not.toMatch(NO_GITHUB);
    // 대조: PAT가 실제로 원격에 실렸다 — 그 위에서 응답·로그 0건이다.
    expect(server.tokens()).toEqual([TOKEN_A]);
    expectNoPat(listed, detected, created);
  });

  it("연결 없는 사용자 · 만료된 연결은 브라우저(/account)로 보내고 GitLab을 부르지 않는다", async () => {
    await seed({ expiresAt: new Date("2026-01-01T00:00:00Z") });
    const server = serve();
    const stranger = await token("stranger");
    const missing = await exec("list_repositories", stranger, { host: "gitlab" });
    expect(missing.structuredContent).toEqual({ status: "needs-browser", reason: "gitlab-not-connected", url: `${ORIGIN}${routes.account()}`, message: en.mcp.needsBrowser["gitlab-not-connected"] });

    const expired = await exec("detect_formats", await token("owner-a"), { host: "gitlab", repositoryId: REPO });
    expect(expired.structuredContent).toMatchObject({ status: "needs-browser", reason: "gitlab-reconnect" });
    expect(server.tokens()).toEqual([]);
    expectNoPat(missing, expired);
  });
});

describe("연결된 GitLab 프로젝트", () => {
  it("get_project는 GitLab 어휘로 싣고 연결이 끊기면 not-connected다", async () => {
    await seed();
    const server = serve();
    const owner = await token("owner-a");
    const project = await exec("get_project", owner, { slug: "p1" });
    expect(project.isError).toBe(false);
    expect(data(project)).toMatchObject({ repositoryHost: "gitlab", repository: "g/sub/app", connection: "ok", newFromGitLab: 0, lastPublishMergeRequest: null });
    expect(JSON.stringify(project)).not.toMatch(NO_GITHUB);
    expect(server.tokens()).toEqual([TOKEN_A]);

    // 연결자가 연결을 해제했다(D20·D21) — 화면은 Disconnected, MCP는 GitHub `unpinned`과 같은 `not-connected`다(D26).
    await prisma.project.update({ where: { id: "p1" }, data: { gitlabConnectionId: null } });
    expect(data(await exec("get_project", owner, { slug: "p1" }))).toMatchObject({ connection: "not-connected" });
    expectNoPat(project);
  });

  it("preview_sync → sync_repository가 연결 PAT로 적재하고 결과에 GitHub 낱말·PAT가 없다", async () => {
    await seed();
    const server = serve();
    const owner = await token("owner-a");
    const preview = await exec("preview_sync", owner, { slug: "p1" });
    expect(preview.isError).toBe(false);
    const synced = await exec("sync_repository", owner, { slug: "p1", approval: String(data(preview).approval) });
    expect(synced.isError).toBe(false);
    expect(synced.content[0].text).toBe(en.mcp.summary.synced(0));
    expect(await prisma.translation.findFirstOrThrow({ where: { projectId: "p1", localeCode: "ko" }, select: { value: true } })).toEqual({ value: "안녕" });
    for (const result of [preview, synced]) expect(JSON.stringify(result)).not.toMatch(NO_GITHUB);
    expect(server.tokens()).toEqual([TOKEN_A]);
    expectNoPat(preview, synced);
  });

  it("인가는 호스트와 무관하다 — EDITOR의 설정 도구는 forbidden, 멤버 아님은 not-found(원격 0)", async () => {
    await seed();
    const server = serve();
    const editor = await token("editor");
    for (const [name, input] of [["get_workflow", { slug: "p1" }], ["preview_sync", { slug: "p1" }], ["list_branches", { slug: "p1" }]] as const) {
      expect((await exec(name, editor, input)).structuredContent).toMatchObject({ status: "forbidden" });
    }
    expect((await exec("get_project", await token("stranger"), { slug: "p1" })).structuredContent).toMatchObject({ status: "not-found" });
    expect(server.tokens()).toEqual([]);
  });

  /** CI 원본이 발행됐다(`GITLAB_CI_RELEASE.sha`) — 발행 전의 `workflow-unavailable` 거부는 릴리스를 mock하는 단위 테스트가 잰다. */
  it("get_workflow는 .gitlab-ci.yml과 CI/CD 변수 이름을 낸다(GitHub 워크플로를 내지 않는다)", async () => {
    await seed();
    serve();
    const result = await exec("get_workflow", await token("owner-a"), { slug: "p1" });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: en.mcp.summary.gitlab.workflow }]);
    const { yaml, ...rest } = result.structuredContent as { yaml: string };
    expect(rest).toEqual({ path: ".gitlab-ci.yml", variableName: "PUSH_TOKEN" });
    expect(yaml).toContain(`MALMOI_I18N_PUSH_SHA: "${GITLAB_CI_RELEASE.sha}"`);
    expect(yaml).not.toContain(".github/workflows");
    expect(JSON.stringify({ rest, content: result.content })).not.toMatch(NO_GITHUB);
  });
});
