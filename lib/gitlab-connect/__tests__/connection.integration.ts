import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { changeMemberRole } from "@/lib/auth/members";
import { optionalEnv } from "@/lib/env";
import { createFakeGitLabFetch, json, type FakeRoute } from "@/lib/gitlab/__tests__/fake-fetch";
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { reconnectGitLabProject } from "@/lib/onboarding-run/gitlab-reconnect";
import { rotateToken } from "@/lib/onboarding-run/rotate-token";
import { projectStatus } from "@/lib/projects/list";
import { sizesFromSnapshot, type RepoReader } from "@/lib/repo-host/reader";
import { REPO_COLUMNS, repoTargetOf } from "@/lib/repo-host/target";

import { connectGitLabAccount, disconnectGitLabAccount, openGitLabConnection, readGitLabConnection } from "../connection";

/**
 * **계정 GitLab 연결의 수명** (gitlab-repositories tasks §2 B2 — 연결 저장·재연결·identity 배선). 진입점 코어 → 가짜 GitLab fetch → 격리 PG →
 * **뷰 모델 출력**(목록 `projectStatus` · Sync 결과 `RepositoryImportOutcome` · 경계 입력 `repoTargetOf`)으로 단언한다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 공유 dev/prod 접속 변수는 읽지 않는다. 토큰 봉투 키는 `vitest.setup.ts`의 테스트 키다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-gitlab-connection-"));
let binaries: string;
const PORT = 55571;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 콘솔 넷을 엿본다 — 원문 PAT가 로그에 0건이어야 한다(spec 완료 조건 11). 원래 출력은 막는다. */
function spyConsole() {
  return (["error", "warn", "log", "info"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
}
function logged(spies: ReturnType<typeof spyConsole>): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls), (_key, value: unknown) => (value instanceof Error ? `${value.name}: ${value.message}` : value));
}

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const REPO = "87515176";
const TOKEN_A = "glpat-owner-a-original";
const TOKEN_A2 = "glpat-owner-a-replaced";
const TOKEN_B = "glpat-owner-b";

/** `/personal_access_tokens/self` + `/user` — 레거시 PAT, 스코프 `api`. */
function patRoutes(userId: number, username: string): Record<string, FakeRoute> {
  return {
    "GET /personal_access_tokens/self": { status: 200, body: { id: 1, name: "malmoi", scopes: ["api"], expires_at: "2027-01-01", user_id: userId, active: true, revoked: false, granular: false, last_used_ips: ["203.0.113.9"] } },
    "GET /user": { status: 200, body: { id: userId, username, state: "active" } },
  };
}

/** 호출자 권한 조회 — `GET /projects/<id>` + `members/all/<user id>`. */
function accessRoutes(userId: number, level: number, meta: Partial<{ archived: boolean; inherited: boolean }> = {}): Record<string, FakeRoute> {
  return {
    [`GET /projects/${REPO}`]: { status: 200, body: { id: Number(REPO), path_with_namespace: "group/sub/app", default_branch: "main", archived: meta.archived ?? false,
      repository_object_format: "sha1", runners_token: "GR1348941-never-stored",
      // 그룹에서 상속한 권한은 project_access가 null로 온다 — 판정은 members/all만 본다.
      permissions: { project_access: meta.inherited ? null : { access_level: level }, group_access: meta.inherited ? { access_level: level } : null } } },
    [`GET /projects/${REPO}/members/all/${userId}`]: { status: 200, body: { id: userId, username: `u${userId}`, access_level: level } },
  };
}

async function seedUsers() {
  for (const id of ["owner-a", "owner-b", "editor-c"]) await prisma.user.create({ data: { id, email: `${id}@example.test` } });
}

async function connect(userId: string, token: string, gitlabUserId: number, username: string) {
  const fake = createFakeGitLabFetch(patRoutes(gitlabUserId, username));
  return connectGitLabAccount(prisma, userId, token, { fetch: fake.fetch });
}

/** 연결자 owner-a의 GitLab 프로젝트 하나 — 첫 적재가 끝난 상태(목록 `active`). */
async function seedGitLabProject(id: string, connectionId: string, members: { userId: string; role: "OWNER" | "EDITOR" }[]) {
  await prisma.project.create({ data: {
    id, slug: id, name: id, repoHost: "gitlab", repoOwner: "group/sub", repoName: "app", repositoryId: REPO, gitlabConnectionId: connectionId, baseBranch: "main",
    members: { create: members },
    surfaces: { create: { id: `${id}-s`, slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastCommitSha: "a".repeat(40) } },
  } });
}

async function listRow(id: string) {
  const row = await prisma.project.findUniqueOrThrow({ where: { id }, select: { ...REPO_COLUMNS, archivedAt: true, gitlabConnection: { select: { expiresAt: true } }, surfaces: { select: { archivedAt: true, lastCommitSha: true } } } });
  return { row, status: projectStatus({ ...row, gitlabTokenExpiresAt: row.gitlabConnection?.expiresAt ?? null }) };
}

describe("PAT 입력·교체·해제", () => {
  beforeEach(seedUsers);

  it("검증한 PAT를 봉해 둔다 — 원문은 행·화면 결과·사건 어디에도 없고, 봉투는 그 사용자 맥락에서만 열린다", async () => {
    const result = await connect("owner-a", TOKEN_A, 101, "alice");
    expect(result).toMatchObject({ ok: true, connection: { username: "alice", scopes: ["api"], expiresAt: new Date("2027-01-01T00:00:00Z") } });
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);

    const { rows } = await pool.query(`SELECT * FROM "GitLabConnection"`);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(TOKEN_A);
    // ⚠️ IP 목록은 저장하지 않는다.
    expect(JSON.stringify(rows)).not.toContain("203.0.113.9");
    expect((await openGitLabConnection(prisma, { userId: "owner-a" }))?.token).toBe(TOKEN_A);

    // 다른 사용자의 행으로 옮긴 봉투는 열리지 않는다(AAD가 userId를 든다).
    await pool.query(`INSERT INTO "GitLabConnection" ("id","userId","token","gitlabUserId","username","scopes","updatedAt") SELECT 'moved','owner-b',"token",'202','bob',"scopes",now() FROM "GitLabConnection" WHERE "userId"='owner-a'`);
    await expect(openGitLabConnection(prisma, { userId: "owner-b" })).rejects.toThrow();
    const events = await prisma.projectEvent.findMany();
    expect(JSON.stringify(events)).not.toContain(TOKEN_A);
  });

  it("⚠️ 같은 GitLab 계정의 교체는 연결 id를 유지한다 — 참조하는 프로젝트 전부가 다음 쓰기부터 새 토큰을 쓴다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const before = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", before.id, [{ userId: "owner-a", role: "OWNER" }]);
    await seedGitLabProject("p2", before.id, [{ userId: "owner-a", role: "OWNER" }]);

    expect(await connect("owner-a", TOKEN_A2, 101, "alice-renamed")).toMatchObject({ ok: true, connection: { username: "alice-renamed" } });
    const after = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    expect(after.id).toBe(before.id);
    for (const id of ["p1", "p2"]) {
      const target = repoTargetOf((await listRow(id)).row);
      expect(target.status).toBe("ok");
      if (target.status !== "ok" || target.target.host !== "gitlab") throw new Error("unreachable");
      // 쓰기 경로는 프로젝트가 참조하는 연결로 연다 — 그 토큰이 새 토큰이다.
      expect((await openGitLabConnection(prisma, { connectionId: target.target.connectionId }))?.token).toBe(TOKEN_A2);
    }
  });

  it("⚠️ 다른 GitLab 계정의 PAT로는 교체하지 않는다(D19) — account-mismatch, 토큰·명의 그대로", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    expect(await connect("owner-a", TOKEN_B, 202, "bob")).toEqual({ ok: false, error: "account-mismatch" });
    expect(await readGitLabConnection(prisma, "owner-a")).toMatchObject({ username: "alice" });
    expect((await openGitLabConnection(prisma, { userId: "owner-a" }))?.token).toBe(TOKEN_A);
  });

  it("검증 실패는 저장하지 않는다 — 401은 token-invalid, 5xx는 unavailable(무효로 접지 않는다)", async () => {
    const invalid = createFakeGitLabFetch({ "GET /personal_access_tokens/self": { status: 401, body: { message: "401 Unauthorized" } } });
    expect(await connectGitLabAccount(prisma, "owner-a", TOKEN_A, { fetch: invalid.fetch })).toEqual({ ok: false, error: "token-invalid" });
    const down = createFakeGitLabFetch({ "GET /personal_access_tokens/self": { status: 503 } });
    expect(await connectGitLabAccount(prisma, "owner-a", TOKEN_A, { fetch: down.fetch })).toEqual({ ok: false, error: "unavailable" });
    expect(await prisma.gitLabConnection.count()).toBe(0);
  });

  it("⚠️ 해제하면 행이 0이고 참조하던 프로젝트의 참조를 같은 tx에서 명시적으로 비운다(사건은 D20 절) — 목록이 needs_reconnect를 말한다(setup이 아니다)", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const { id } = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", id, [{ userId: "owner-a", role: "OWNER" }]);
    expect((await listRow("p1")).status).toBe("active");

    expect(await disconnectGitLabAccount(prisma, "owner-a")).toEqual({ ok: true, disconnected: true });
    expect(await prisma.gitLabConnection.count()).toBe(0);
    const { row, status } = await listRow("p1");
    expect(status).toBe("needs_reconnect");
    // D21 — 설치 없음(`not-connected`)이 아니라 연결 참조 비움이다(모든 화면에서 Disconnected).
    expect(repoTargetOf(row)).toEqual({ status: "connection-removed" });
    // 이미 없는 연결의 해제도 성공이다.
    expect(await disconnectGitLabAccount(prisma, "owner-a")).toEqual({ ok: true, disconnected: false });
  });
});

describe("연결자가 떠나면 끊긴다 · 다른 OWNER의 재연결", () => {
  beforeEach(seedUsers);

  it("⚠️ 참조 주인이 멤버에서 빠지면 같은 tx에서 그 프로젝트의 참조만 빈다 — 그 사람이 남은 다른 프로젝트는 그대로다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const { id } = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    await seedGitLabProject("p2", id, [{ userId: "owner-a", role: "OWNER" }]);

    expect(await changeMemberRole(prisma, { userId: "owner-b" }, { slug: "p1", targetUserId: "owner-a", nextRole: null })).toEqual({ ok: true });
    expect((await listRow("p1")).status).toBe("needs_reconnect");
    expect((await listRow("p2")).status).toBe("active");
  });

  it("역할 변경은 떠나는 것이 아니다 — 참조가 남는다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const { id } = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    expect(await changeMemberRole(prisma, { userId: "owner-b" }, { slug: "p1", targetUserId: "owner-a", nextRole: "EDITOR" })).toEqual({ ok: true });
    expect((await listRow("p1")).status).toBe("active");
  });

  it("⚠️ 다른 OWNER의 재연결이 참조를 자기 연결로 바꾼다 — 상속한 Maintainer(project_access: null)도 통과하고 사건이 남는다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    const b = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-b" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    const fake = createFakeGitLabFetch(accessRoutes(202, 40, { inherited: true }));
    vi.stubGlobal("fetch", fake.fetch);

    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: true });
    const target = repoTargetOf((await listRow("p1")).row);
    expect(target).toEqual({ status: "ok", target: { host: "gitlab", owner: "group/sub", name: "app", repositoryId: REPO, connectionId: b.id } });
    // 호출자 권한은 호출자 자신의 PAT로 물었다 — 옛 연결자의 토큰을 쓰지 않는다.
    expect(fake.calls.every((call) => call.headers.get("PRIVATE-TOKEN") === TOKEN_B)).toBe(true);
    const events = await prisma.projectEvent.findMany({ where: { projectId: "p1", subtype: "settings.repositoryConnected" } });
    expect(events).toHaveLength(1);
    // 사건은 주소만 싣는다 — 토큰·러너 토큰·연결 id·GitLab 사용자 id 없음.
    expect(JSON.stringify(events)).not.toMatch(/glpat-|GR1348941/);
    expect(JSON.stringify(events.map((event) => event.payload))).not.toContain(b.id);
    expect(events[0]?.payload).toMatchObject({ kind: "SETTINGS", field: "repository", value: { before: "group/sub/app", after: "group/sub/app" } });
  });

  it("Developer OWNER의 재연결은 repo-read-only, Guest는 repo-forbidden — 참조가 바뀌지 않는다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    for (const [level, error] of [[30, "repo-read-only"], [10, "repo-forbidden"]] as const) {
      vi.stubGlobal("fetch", createFakeGitLabFetch(accessRoutes(202, level)).fetch);
      expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error });
      expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).gitlabConnectionId).toBe(a.id);
    }
  });

  it("호출자에게 GitLab 연결이 없으면 원격 호출 0으로 gitlab-not-connected — 서버가 가진 연결로 호출자의 권한을 인정하지 않는다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "gitlab-not-connected" });
    expect(fake.calls).toEqual([]);
  });

  /** 재연결 경합 픽스처 — owner-a가 연결자, owner-b가 재연결하는 OWNER, editor-c의 연결은 "다른 OWNER가 먼저 붙인" 연결로만 쓴다. */
  async function seedReconnectRace() {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    await connect("editor-c", "glpat-editor-c", 303, "carol");
    const [a, c] = await Promise.all(["owner-a", "editor-c"].map((userId) => prisma.gitLabConnection.findUniqueOrThrow({ where: { userId } })));
    await seedGitLabProject("p1", a!.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    return { a: a!, c: c! };
  }
  const reconnectEvents = () => prisma.projectEvent.count({ where: { projectId: "p1", subtype: "settings.repositoryConnected" } });

  it("⚠️ 원격 왕복 동안 참조가 바뀌면 잠금 뒤 조건부 쓰기가 0행이다 — repo-forbidden, 먼저 끝난 참조를 덮지 않고 사건 0(audit E2)", async () => {
    const { c } = await seedReconnectRace();
    const routes = accessRoutes(202, 40);
    const member = routes[`GET /projects/${REPO}/members/all/202`] as { status: number; body: unknown };
    routes[`GET /projects/${REPO}/members/all/202`] = async () => {
      // 다른 OWNER의 재연결이 이 왕복 사이에 끝났다.
      await prisma.project.update({ where: { id: "p1" }, data: { gitlabConnectionId: c.id } });
      return json(member.body, member.status);
    };
    vi.stubGlobal("fetch", createFakeGitLabFetch(routes).fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "repo-forbidden" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).gitlabConnectionId).toBe(c.id);
    expect(await reconnectEvents()).toBe(0);
  });

  it("⚠️ 원격 왕복 동안 강등되면 잠금 안 재인가가 거부한다 — forbidden, 참조·사건 그대로", async () => {
    const { a } = await seedReconnectRace();
    const routes = accessRoutes(202, 40);
    const member = routes[`GET /projects/${REPO}/members/all/202`] as { status: number; body: unknown };
    routes[`GET /projects/${REPO}/members/all/202`] = async () => {
      await prisma.projectMember.update({ where: { projectId_userId: { projectId: "p1", userId: "owner-b" } }, data: { role: "EDITOR" } });
      return json(member.body, member.status);
    };
    vi.stubGlobal("fetch", createFakeGitLabFetch(routes).fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "forbidden" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).gitlabConnectionId).toBe(a.id);
    expect(await reconnectEvents()).toBe(0);
  });

  it("GitHub 프로젝트는 원격 호출 0으로 invalid input이다 — GitLab 참조를 박은 혼종 행이 생기지 않는다", async () => {
    await connect("owner-b", TOKEN_B, 202, "bob");
    await prisma.project.create({ data: {
      id: "gh", slug: "gh", name: "gh", repoHost: "github", repoOwner: "acme", repoName: "app", repositoryId: REPO, installationId: "9", baseBranch: "main",
      members: { create: [{ userId: "owner-b", role: "OWNER" }] },
    } });
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "gh" })).toEqual({ ok: false, error: "invalid input" });
    expect(fake.calls).toEqual([]);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "gh" } })).gitlabConnectionId).toBeNull();
  });

  it("호출자 PAT 401·저장 만료는 gitlab-reconnect, GitLab에서 보관된 리포는 gitlab-repo-archived다 — 참조 그대로", async () => {
    const { a } = await seedReconnectRace();
    vi.stubGlobal("fetch", createFakeGitLabFetch({ [`GET /projects/${REPO}`]: { status: 401, body: { message: "401 Unauthorized" } } }).fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "gitlab-reconnect" });
    vi.stubGlobal("fetch", createFakeGitLabFetch(accessRoutes(202, 40, { archived: true })).fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "gitlab-repo-archived" });
    await prisma.gitLabConnection.update({ where: { userId: "owner-b" }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "gitlab-reconnect" });
    expect(fake.calls).toEqual([]);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).gitlabConnectionId).toBe(a.id);
    expect(await reconnectEvents()).toBe(0);
  });

  it("제거된 멤버·EDITOR·보관 프로젝트는 원격 호출 전에 거부된다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "editor-c", role: "EDITOR" }]);
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "not-found" });
    expect(await reconnectGitLabProject(prisma, { userId: "editor-c" }, { slug: "p1" })).toEqual({ ok: false, error: "forbidden" });
    await prisma.project.update({ where: { id: "p1" }, data: { archivedAt: new Date() } });
    expect(await reconnectGitLabProject(prisma, { userId: "owner-a" }, { slug: "p1" })).toEqual({ ok: false, error: "archived" });
    expect(fake.calls).toEqual([]);
  });
});

describe("연결이 끊기면 사건이 남는다 (D20)", () => {
  beforeEach(seedUsers);

  const disconnectedEvents = (projectId: string) =>
    prisma.projectEvent.findMany({ where: { projectId, subtype: "settings.repositoryDisconnected" }, select: { actorUserId: true, payload: true } });

  it("⚠️ 계정 연결 해제는 참조하던 프로젝트마다 같은 tx에서 사건을 남긴다 — 행위자는 해제한 사람, 남의 연결을 쓰는 프로젝트는 그대로", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    const b = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-b" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }]);
    await seedGitLabProject("p2", a.id, [{ userId: "owner-a", role: "OWNER" }]);
    await seedGitLabProject("p3", b.id, [{ userId: "owner-b", role: "OWNER" }]);

    expect(await disconnectGitLabAccount(prisma, "owner-a")).toEqual({ ok: true, disconnected: true });
    for (const id of ["p1", "p2"]) {
      expect(await disconnectedEvents(id)).toEqual([{ actorUserId: "owner-a", payload: { kind: "SETTINGS", field: "repository", value: { before: "group/sub/app", after: null } } }]);
      expect((await listRow(id)).status).toBe("needs_reconnect");
    }
    expect(await disconnectedEvents("p3")).toEqual([]);
    expect((await listRow("p3")).status).toBe("active");
    // 이미 없는 연결의 해제는 사건을 더하지 않는다.
    await disconnectGitLabAccount(prisma, "owner-a");
    expect(await disconnectedEvents("p1")).toHaveLength(1);
  });

  it("⚠️ 연결자 제거는 `member.removed`와 같은 tx에서 같은 사건을 남긴다 — 행위자는 제거한 사람", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    await seedGitLabProject("p2", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);

    expect(await changeMemberRole(prisma, { userId: "owner-b" }, { slug: "p1", targetUserId: "owner-a", nextRole: null })).toEqual({ ok: true });
    expect(await disconnectedEvents("p1")).toEqual([{ actorUserId: "owner-b", payload: { kind: "SETTINGS", field: "repository", value: { before: "group/sub/app", after: null } } }]);
    expect(await prisma.projectEvent.count({ where: { projectId: "p1", subtype: "member.removed" } })).toBe(1);
    expect(await disconnectedEvents("p2")).toEqual([]);
    // 연결자가 아닌 멤버의 제거는 연결 사건을 남기지 않는다.
    expect(await changeMemberRole(prisma, { userId: "owner-a" }, { slug: "p2", targetUserId: "owner-b", nextRole: null })).toEqual({ ok: true });
    expect(await disconnectedEvents("p2")).toEqual([]);
  });
});

describe("push 토큰 회전 — GitLab 쓰기 권한 (tasks §2 B2)", () => {
  beforeEach(seedUsers);

  it("⚠️ Developer OWNER는 repo-read-only, Maintainer OWNER는 통과한다 — 호출자 자신의 PAT로 묻는다", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);

    vi.stubGlobal("fetch", createFakeGitLabFetch(accessRoutes(202, 30)).fetch);
    expect(await rotateToken(prisma, { userId: "owner-b" }, { slug: "p1" })).toEqual({ ok: false, error: "repo-read-only" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).pushTokenHash).toBeNull();

    const fake = createFakeGitLabFetch(accessRoutes(101, 40));
    vi.stubGlobal("fetch", fake.fetch);
    const rotated = await rotateToken(prisma, { userId: "owner-a" }, { slug: "p1" });
    expect(rotated).toMatchObject({ ok: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).pushTokenHash).not.toBeNull();
    expect(fake.calls.every((call) => call.headers.get("PRIVATE-TOKEN") === TOKEN_A)).toBe(true);
  });

  it("참조가 빈 프로젝트는 원격 호출 0으로 gitlab-project-disconnected다(D21)", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }]);
    await prisma.project.update({ where: { id: "p1" }, data: { gitlabConnectionId: null } });
    const fake = createFakeGitLabFetch({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await rotateToken(prisma, { userId: "owner-a" }, { slug: "p1" })).toEqual({ ok: false, error: "gitlab-project-disconnected" });
    expect(fake.calls).toEqual([]);
  });
});

describe("원문 PAT는 로그에 0건이다 (spec 완료 조건 11)", () => {
  beforeEach(seedUsers);

  it("연결·교체 실패·재연결·회전·해제·원격 실패 전부에서 콘솔에 PAT가 실리지 않는다", async () => {
    const spies = spyConsole();
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    await connect("owner-a", TOKEN_B, 202, "bob");
    for (const status of [401, 403, 500]) {
      await connectGitLabAccount(prisma, "owner-a", TOKEN_A2, { fetch: createFakeGitLabFetch({ "GET /personal_access_tokens/self": { status } }).fetch });
    }
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    vi.stubGlobal("fetch", createFakeGitLabFetch({ [`GET /projects/${REPO}`]: { status: 502 } }).fetch);
    await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" });
    vi.stubGlobal("fetch", createFakeGitLabFetch(accessRoutes(202, 40)).fetch);
    await reconnectGitLabProject(prisma, { userId: "owner-b" }, { slug: "p1" });
    await rotateToken(prisma, { userId: "owner-b" }, { slug: "p1" });
    await disconnectGitLabAccount(prisma, "owner-b");
    // 콘솔이 실제로 무엇인가 받았다 — 원격 실패는 분류를 로그에 남긴다(검사가 공허하지 않게).
    expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
    expect(logged(spies)).not.toMatch(/glpat-/);
  });
});

describe("identity — 잠금 안 재검증", () => {
  beforeEach(seedUsers);

  const reader = (): RepoReader => ({
    sizes: async (snapshot, paths) => sizesFromSnapshot(snapshot, paths),
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha: "c".repeat(40), headCommittedAt: "2026-10-12T00:00:00Z", files: [] })),
    blob: vi.fn(),
  });

  it("⚠️ 같은 숫자 id의 다른 리포 호스트는 다른 리포다 — GitLab 신원으로 읽은 실행이 GitHub 행에 적용되지 않는다(repo-replaced, 리더 0회)", async () => {
    await prisma.project.create({ data: {
      id: "gh", slug: "gh", name: "gh", repoHost: "github", repoOwner: "group", repoName: "app", repositoryId: REPO, installationId: "77", baseBranch: "main",
      members: { create: { userId: "owner-a", role: "OWNER" } },
      surfaces: { create: { id: "gh-s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastCommitSha: "a".repeat(40) } },
    } });
    const open = vi.fn(async () => reader());
    const outcome = await runRepositoryImportFromReader(prisma, { projectId: "gh", userId: "owner-a", approval: null, credential: undefined,
      repository: { repoHost: "gitlab", repoOwner: "group", repoName: "app", repositoryId: REPO, installationId: null, gitlabConnectionId: "conn-x", baseBranch: "main" } }, open);
    expect(outcome).toEqual({ ok: false, error: "repo-replaced" });
    expect(open).not.toHaveBeenCalled();
  });

  it("⚠️ 읽기와 잠금 사이에 다른 OWNER가 재연결하면 옛 연결로 읽은 실행이 적용되지 않는다(repo-replaced)", async () => {
    await connect("owner-a", TOKEN_A, 101, "alice");
    await connect("owner-b", TOKEN_B, 202, "bob");
    const a = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-a" } });
    const b = await prisma.gitLabConnection.findUniqueOrThrow({ where: { userId: "owner-b" } });
    await seedGitLabProject("p1", a.id, [{ userId: "owner-a", role: "OWNER" }, { userId: "owner-b", role: "OWNER" }]);
    const captured = (await listRow("p1")).row;
    await prisma.project.update({ where: { id: "p1" }, data: { gitlabConnectionId: b.id } });

    const open = vi.fn(async () => reader());
    const outcome = await runRepositoryImportFromReader(prisma, { projectId: "p1", userId: "owner-a", approval: null, credential: undefined,
      repository: { ...captured, baseBranch: "main" } }, open);
    expect(outcome).toEqual({ ok: false, error: "repo-replaced" });
    expect(open).not.toHaveBeenCalled();
  });
});
