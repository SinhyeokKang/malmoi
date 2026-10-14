import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { signSampleConfirmation } from "@/lib/onboarding/sample-confirmation";

import type { TokenGrant } from "../grant";
import { hashApiToken } from "../token";
import { toToolResult, type ToolOutcome } from "../result";
import type { ApiTokenSubject } from "../token-store";

/**
 * **MCP 쓰기 도구 × 실제 잠금** (mcp-connector T7 — design §1.25 · §2.2). 도구가 입구를 지난 뒤 잠금을 기다리는 동안 토큰이 폐기·만료·재발급되면
 * 잠금 뒤 재읽기(`userId` AND `tokenHash`)가 그것을 보고 **번역·설정·사건·생성을 남기지 않는다**. 별도 연결이 잠금을 쥔 채 변경하고, 도구가
 * **실제로 잠금을 기다리는 것을 관측한 뒤** 커밋한다 — 타이머로 순서를 흉내 내면 잠금 전 값을 읽는 회귀를 못 잡는다.
 * ⚠️ 거부 단언마다 같은 픽스처의 성공 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const SECRET = "s".repeat(64);
const HEAD = "d".repeat(40);
const h = vi.hoisted(() => ({ snapshotHead: "d".repeat(40) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/github-connect/token-store", () => ({ ensureUserToken: async () => ({ status: "ok", accessToken: "user-token" }) }));
vi.mock("@/lib/github-connect/user", async (orig) => ({
  ...(await orig<typeof import("@/lib/github-connect/user")>()),
  listUserInstallations: async () => ["77"],
  listInstallationRepos: async () => [{ fullName: "acme/web", pushedAt: null, push: true }],
}));
const FILES = ["i18n/en.json", "i18n/ko.json", "second/en.json", "second/ko.json"];
vi.mock("@/lib/github", async (orig) => ({
  ...(await orig<typeof import("@/lib/github")>()),
  probeRepo: async () => ({ status: "ok", installationId: "77", repositoryId: "123", fullName: "acme/web", defaultBranch: "main" }),
}));
vi.mock("@/lib/repo-host", async (orig) => {
  const { sizesFromSnapshot } = await import("@/lib/repo-host/reader");
  return {
    ...(await orig<typeof import("@/lib/repo-host")>()),
    openRepoReader: async () => ({
      snapshot: async () => ({ status: "ok", headSha: h.snapshotHead, headCommittedAt: "2026-09-28T00:00:00Z", files: FILES.map(path => ({ path, sha: path, size: 20 })) }),
      blob: async () => '{"hello":"Hello"}',
      sizes: async (snapshot: Parameters<typeof sizesFromSnapshot>[0], paths: readonly string[]) => sizesFromSnapshot(snapshot, paths),
    }),
  };
});

// 소스 제거 미리보기의 열린 PR 줄 — GitHub 없이 "없음"이다. 이 파일의 다른 도구는 이 함수를 부르지 않는다.
vi.mock("@/lib/projects/open-pr", async (orig) => ({ ...(await orig<object>()), loadOpenPrUrl: async () => null }));

const { TOOLS } = await import("../tools");
const { resolveBearer } = await import("../token-store");

const directory = mkdtempSync(join(tmpdir(), "malmoi-mcp-tools-"));
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
  vi.stubEnv("APP_SIGNING_SECRET", SECRET);
  h.snapshotHead = HEAD;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  for (const id of ["owner", "editor"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
  await prisma.project.create({ data: { id: "p", slug: "p", name: "Before", repoOwner: "o", repoName: "r", baseBranch: "main", repoHost: "github", gitlabConnectionId: null, installationId: "1", repositoryId: "100" } });
  await prisma.projectMember.createMany({ data: [{ projectId: "p", userId: "owner", role: "OWNER" }, { projectId: "p", userId: "editor", role: "EDITOR" }] });
  await prisma.translationSurface.create({ data: { id: "s", projectId: "p", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "c1" } });
  await prisma.locale.createMany({ data: ["en", "ko"].map(code => ({ projectId: "p", surfaceId: "s", code, name: code, isBase: code === "en" })) });
  await prisma.stringKey.create({ data: { id: "k1", projectId: "p", surfaceId: "s", key: "greet", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
  await prisma.translation.create({ data: { id: "k1-ko", projectId: "p", surfaceId: "s", keyId: "k1", localeCode: "ko", value: "안녕" } });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const ALL: TokenGrant[] = ["translation:write", "project:settings", "member:manage", "project:create"];
async function token(userId: string, over: { grants?: TokenGrant[]; allProjects?: boolean; projectIds?: string[] } = {}): Promise<ApiTokenSubject> {
  const row = { userId, tokenHash: `hash-${userId}`, grants: over.grants ?? ALL, allProjects: over.allProjects ?? true, projectIds: over.projectIds ?? [], expiresAt: new Date(Date.now() + 86_400_000) };
  await prisma.apiToken.create({ data: row });
  return { userId, credential: { kind: "api-token", tokenHash: row.tokenHash }, grants: row.grants, scope: row.allProjects ? { kind: "all" } : { kind: "projects", projectIds: row.projectIds } };
}
const call = (name: string, subject: ApiTokenSubject, input: Record<string, unknown>, origin: string | null = null): Promise<ToolOutcome> =>
  TOOLS.find(t => t.name === name)!.run({ prisma, subject, now: new Date(), origin }, input as never);
const code = (outcome: ToolOutcome) => outcome.status === "refused" ? outcome.code : outcome.status;
const koValue = async () => (await prisma.translation.findUniqueOrThrow({ where: { id: "k1-ko" } })).value;
const events = () => prisma.projectEvent.count({ where: { projectId: "p" } });

type Change = "revoked" | "expired" | "reissued";
const CHANGE: Record<Change, (userId: string) => [string, unknown[]]> = {
  revoked: userId => ['DELETE FROM "ApiToken" WHERE "userId" = $1', [userId]],
  // ⚠️ 컬럼이 `timestamp`(시간대 없음)라 `now()`는 서버 시간대의 벽시계로 저장된다 — UTC로 못 박는다(안 그러면 +9h 미래가 된다).
  expired: userId => [`UPDATE "ApiToken" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE "userId" = $1`, [userId]],
  // 재발급 = 같은 사용자 행을 새 해시로 — 권한은 그대로다. 옛 해시로 기다리던 쓰기가 새 행으로 통과하면 안 된다.
  reissued: userId => ['UPDATE "ApiToken" SET "tokenHash" = $2 WHERE "userId" = $1', [userId, "new-hash"]],
};

/** 다른 연결이 `table`의 행 잠금을 쥔 채 토큰을 바꾸고, `run`이 잠금을 기다리는 것을 본 뒤 커밋한다. */
async function race<T>(lock: { table: "Project" | "User"; id: string }, change: Change, userId: string, run: () => Promise<T>): Promise<T> {
  const blocker = await pool.connect();
  let pending: Promise<T> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query(`SELECT "id" FROM "${lock.table}" WHERE "id" = $1 FOR UPDATE`, [lock.id]);
    const [sql, values] = CHANGE[change](userId);
    await blocker.query(sql, values);
    pending = run();
    pending.catch(() => undefined);
    await expect.poll(async () => (await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> $1", [(blocker as unknown as { processID: number }).processID])).rows[0].n, { timeout: 10_000 }).toBeGreaterThan(0);
    await blocker.query("COMMIT");
    return await pending;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pending?.catch(() => undefined);
  }
}

describe("잠금 대기 중 토큰 변경 — 쓰기가 아무것도 남기지 않는다", () => {
  const save = (subject: ApiTokenSubject) => call("set_translations", subject, { slug: "p", surfaceSlug: "default", entries: [{ keyId: "k1", changes: [{ localeCode: "ko", value: "새 값" }] }] });

  it.each(["revoked", "expired", "reissued"] as const)("set_translations — %s면 unauthorized · 번역·사건 불변", async change => {
    const subject = await token("editor");
    expect(code(await race({ table: "Project", id: "p" }, change, "editor", () => save(subject)))).toBe("unauthorized");
    expect(await koValue()).toBe("안녕");
    expect(await events()).toBe(0);
  });

  it("대조: 경합이 없으면 저장되고 사건이 남는다", async () => {
    expect(code(await save(await token("editor")))).toBe("ok");
    expect(await koValue()).toBe("새 값");
    expect(await events()).toBe(1);
  });

  it("update_project — 재발급되면 이름이 바뀌지 않는다 (대조: 경합 없으면 바뀐다)", async () => {
    const subject = await token("owner");
    expect(code(await race({ table: "Project", id: "p" }, "reissued", "owner", () => call("update_project", subject, { slug: "p", name: "After" })))).toBe("unauthorized");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).name).toBe("Before");
    await prisma.apiToken.deleteMany({});
    expect(code(await call("update_project", await token("owner"), { slug: "p", name: "After" }))).toBe("ok");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).name).toBe("After");
  });

  it("archive_project — 폐기되면 보관되지 않고 사건도 없다", async () => {
    const subject = await token("owner");
    expect(code(await race({ table: "Project", id: "p" }, "revoked", "owner", () => call("archive_project", subject, { slug: "p" })))).toBe("unauthorized");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).archivedAt).toBeNull();
    expect(await events()).toBe(0);
  });
});

describe("create_project", () => {
  const confirmation = (format: { adapter: string; pathTemplate: string }, head = HEAD, userId = "owner") => signSampleConfirmation(
    { userId, repositoryId: "123", connection: "github:77", ref: "main", headSha: head, format: { ...format, locales: ["en", "ko"] } }, SECRET, new Date());
  const I18N = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json" };
  const SECOND = { adapter: "json-catalog", pathTemplate: "second/{locale}.json" };
  const input = (surfaces: { adapter: string; pathTemplate: string; confirmation: string }[]) =>
    ({ owner: "acme", repo: "web", slug: "created", name: "Created", baseBranch: "main", surfaces: surfaces.map(s => ({ ...s, baseLocale: "en" })) });
  const created = () => prisma.project.findUnique({ where: { slug: "created" } });

  it("User 잠금 대기 중 project:create 없는 토큰으로 재발급되면 Project·OWNER·projectIds가 생기지 않는다", async () => {
    const subject = await token("owner", { allProjects: false, projectIds: ["p"] });
    const run = () => call("create_project", subject, input([{ ...I18N, confirmation: confirmation(I18N) }]));
    const [sql, values] = ['UPDATE "ApiToken" SET "tokenHash" = $2, "grants" = $3 WHERE "userId" = $1', ["owner", "new-hash", ["translation:write"]]];
    const blocker = await pool.connect();
    let outcome: ToolOutcome;
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE`, ["owner"]);
      await blocker.query(sql, values);
      const pending = run();
      await expect.poll(async () => (await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> $1", [(blocker as unknown as { processID: number }).processID])).rows[0].n, { timeout: 10_000 }).toBeGreaterThan(0);
      await blocker.query("COMMIT");
      outcome = await pending;
    } finally { blocker.release(); }
    expect(code(outcome)).toBe("unauthorized");
    expect(await created()).toBeNull();
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { userId: "owner" } })).projectIds).toEqual(["p"]);
  });

  it("대조: 고른-범위 토큰의 생성은 새 프로젝트를 그 토큰의 범위에 더한다", async () => {
    const subject = await token("owner", { allProjects: false, projectIds: ["p"] });
    expect(code(await call("create_project", subject, input([{ ...I18N, confirmation: confirmation(I18N) }])))).toBe("ok");
    const project = await created();
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { userId: "owner" } })).projectIds).toEqual(["p", project!.id]);
  });

  it("다른 head에 서명된 확인값은 sample-expired — 검증 뒤 ref가 움직여도 다른 head를 적재하지 않는다", async () => {
    const subject = await token("owner");
    const stale = confirmation(I18N, "e".repeat(40));
    expect(code(await call("create_project", subject, input([{ ...I18N, confirmation: stale }])))).toBe("sample-expired");
    expect(await created()).toBeNull();
  });

  it("다른 사용자에게 서명된 확인값도 sample-expired", async () => {
    expect(code(await call("create_project", await token("owner"), input([{ ...I18N, confirmation: confirmation(I18N, HEAD, "editor") }])))).toBe("sample-expired");
  });

  it("서명된 포맷과 고른 경로가 다르면 manual-no-match", async () => {
    expect(code(await call("create_project", await token("owner"), input([{ ...SECOND, confirmation: confirmation(I18N) }])))).toBe("manual-no-match");
    expect(await created()).toBeNull();
  });

  it("후보 둘 중 하나만 실패해도 쓰기 0건이다 — Project·Surface·번역·사건·projectIds", async () => {
    const subject = await token("owner", { allProjects: false, projectIds: ["p"] });
    expect(code(await call("create_project", subject, input([{ ...I18N, confirmation: confirmation(I18N) }, { ...SECOND, confirmation: "tampered.sig" }])))).toBe("sample-expired");
    expect(await created()).toBeNull();
    expect(await prisma.translationSurface.count({ where: { projectId: { not: "p" } } })).toBe(0);
    expect(await prisma.projectEvent.count()).toBe(0);
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { userId: "owner" } })).projectIds).toEqual(["p"]);
  });

  it("같은 head에 서명된 두 후보는 한 tx로 생성된다", async () => {
    expect(await call("create_project", await token("owner"), input([{ ...I18N, confirmation: confirmation(I18N) }, { ...SECOND, confirmation: confirmation(SECOND) }])))
      .toMatchObject({ status: "ok", data: { keys: 2 } });
    expect(await prisma.translationSurface.count({ where: { project: { slug: "created" } } })).toBe(2);
  });
});

describe("add_sources", () => {
  const sign = (format: { adapter: string; pathTemplate: string }, head = HEAD) => signSampleConfirmation(
    { userId: "owner", repositoryId: "123", connection: "github:77", ref: "main", headSha: head, format: { ...format, locales: ["en", "ko"] } }, SECRET, new Date());
  beforeEach(async () => {
    // 리포 확인이 고정된 신원과 대조한다 — 가짜 GitHub의 리포로 프로젝트를 맞춘다.
    await prisma.project.update({ where: { id: "p" }, data: { repoOwner: "acme", repoName: "web", installationId: "77", repositoryId: "123" } });
  });
  const SECOND = { adapter: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "en" };

  it("후보의 확인값이 실패하면 Surface·번역·사건 쓰기 0건 (대조: 유효하면 추가된다)", async () => {
    const subject = await token("owner");
    expect(await call("add_sources", subject, { slug: "p", picks: [{ ...SECOND, confirmation: sign(SECOND, "e".repeat(40)) }] }))
      .toMatchObject({ status: "refused", code: "sample-expired", detail: { index: 0 } });
    expect(await prisma.translationSurface.count({ where: { projectId: "p" } })).toBe(1);
    expect(await prisma.translation.count({ where: { projectId: "p", surfaceId: { not: "s" } } })).toBe(0);
    expect(await events()).toBe(0);
    expect(code(await call("add_sources", subject, { slug: "p", picks: [{ ...SECOND, confirmation: sign(SECOND) }] }))).toBe("ok");
    expect(await prisma.translationSurface.count({ where: { projectId: "p" } })).toBe(2);
  });
});

/**
 * **생성 워크플로는 만든 앱을 가리킨다** (preview QA T9). 도구 컨텍스트의 `origin`(route가 `requestOrigin`으로 검증한 값)이 프로덕션이 아니면
 * `api-url`을 박는다 — 안 박으면 dev에서 만든 프로젝트의 CI가 프로덕션으로 push해 401이다. 프로덕션·없음은 오늘과 같은 출력이다.
 */
describe("get_workflow — api-url은 요청 origin을 따른다", () => {
  const yamlOf = (outcome: ToolOutcome) => (outcome.status === "ok" ? String(outcome.data.yaml) : JSON.stringify(outcome));
  it("dev origin → api-url 한 줄 · 프로덕션·없음 → 없음(두 출력이 같다)", async () => {
    const owner = await token("owner");
    const dev = yamlOf(await call("get_workflow", owner, { slug: "p" }, "https://dev.mal-moi.com"));
    expect(dev.split("\n").filter(l => l.includes("api-url"))).toEqual(['          api-url: "https://dev.mal-moi.com"']);
    const prod = yamlOf(await call("get_workflow", owner, { slug: "p" }, "https://mal-moi.com"));
    const none = yamlOf(await call("get_workflow", owner, { slug: "p" }, null));
    expect(prod).not.toContain("api-url");
    expect(prod).toBe(none);
  });
});

describe("set_translations — 100키 한 tx", () => {
  it("1번 키 not-found가 나머지 99를 막지 않고, 100키가 30초 tx 안에 끝난다(실측 기록)", async () => {
    await prisma.stringKey.createMany({ data: Array.from({ length: 99 }, (_, i) => ({ id: `b${i}`, projectId: "p", surfaceId: "s", key: `bulk.${i}`, namespace: "_root", sourceText: `S${i}`, sourceHash: `h${i}` })) });
    const entries = [{ keyId: "missing", changes: [{ localeCode: "ko", value: "x" }] },
      ...Array.from({ length: 99 }, (_, i) => ({ keyId: `b${i}`, changes: [{ localeCode: "ko", value: `값 ${i}` }] }))];
    const started = performance.now();
    const outcome = await call("set_translations", await token("editor"), { slug: "p", surfaceSlug: "default", entries });
    const elapsed = Math.round(performance.now() - started);
    console.info("set_translations 100 keys ms", elapsed);
    expect(outcome.status).toBe("ok");
    const results = outcome.status === "ok" ? outcome.data.results as { keyId: string; status: string; error?: string }[] : [];
    expect(results[0]).toMatchObject({ keyId: "missing", status: "rejected", error: "key-unavailable" });
    expect(results.filter(r => r.status === "saved")).toHaveLength(99);
    expect(await prisma.translation.count({ where: { projectId: "p", keyId: { startsWith: "b" } } })).toBe(99);
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "translation.saved" } })).toBe(99);
    expect(elapsed).toBeLessThan(30_000);
  });
});

/**
 * **OAuth 연결 주체 × 실제 잠금** (mcp-oauth T5 — design §5). 개인 토큰과 **같은 잠금 뒤 재읽기**를 지나되 키가 연결 id다: 대기 중 끊기·재동의
 * (행 삭제·새 id)는 쓰기 0건이고, 대기 중 refresh 회전(같은 행의 해시 교체)은 같은 연결의 정당한 쓰기로 통과한다.
 * 고른 범위의 연결로 만든 프로젝트는 같은 tx에서 **그 연결에만** 편입된다.
 */
describe("OAuth 연결 주체", () => {
  const ENDPOINT = { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" };

  async function connection(userId: string, over: { clientId?: string; grants?: TokenGrant[]; allProjects?: boolean; projectIds?: string[] } = {}) {
    const clientId = over.clientId ?? "https://claude.ai/oauth/claude-code-client-metadata";
    const access = `mlo_${userId}-${clientId.length}-${Math.random().toString(36).slice(2)}`;
    const row = await prisma.oAuthConnection.create({ data: {
      userId, clientId, clientName: "Claude Code", redirectUri: "http://localhost/callback", ...ENDPOINT,
      grants: over.grants ?? ALL, allProjects: over.allProjects ?? true, projectIds: over.projectIds ?? [],
      accessTokenHash: hashApiToken(access), accessExpiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenHash: hashApiToken(`mlr_${access}`), expiresAt: new Date(Date.now() + 86_400_000),
    } });
    return { id: row.id, access };
  }
  /** 입구와 같은 경로로 주체를 만든다 — 요청마다 새로 읽는 것까지 흉내 낸다. */
  const subjectOf = async (access: string) => (await resolveBearer(prisma, access, new Date(), ENDPOINT))!;

  async function hold(sql: string, values: unknown[], run: () => Promise<ToolOutcome>): Promise<ToolOutcome> {
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE`, ["p"]);
      await blocker.query(sql, values);
      const pending = run();
      pending.catch(() => undefined);
      await expect.poll(async () => (await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> $1", [(blocker as unknown as { processID: number }).processID])).rows[0].n, { timeout: 10_000 }).toBeGreaterThan(0);
      await blocker.query("COMMIT");
      return await pending;
    } finally {
      blocker.release();
    }
  }
  const save = (subject: ApiTokenSubject) => call("set_translations", subject, { slug: "p", surfaceSlug: "default", entries: [{ keyId: "k1", changes: [{ localeCode: "ko", value: "새 값" }] }] });

  it("잠금 대기 중 끊기(행 삭제) → unauthorized · 번역·사건 불변", async () => {
    const { id, access } = await connection("editor");
    const subject = await subjectOf(access);
    expect(code(await hold('DELETE FROM "OAuthConnection" WHERE "id" = $1', [id], () => save(subject)))).toBe("unauthorized");
    expect(await koValue()).toBe("안녕");
    expect(await events()).toBe(0);
  });

  it("잠금 대기 중 재동의(삭제 + 새 id) → unauthorized — 새 연결의 권한으로 옛 쓰기가 통과하지 않는다", async () => {
    const { id, access } = await connection("editor");
    const subject = await subjectOf(access);
    const reconsent = 'WITH gone AS (DELETE FROM "OAuthConnection" WHERE "id" = $1 RETURNING *) INSERT INTO "OAuthConnection" SELECT \'new-id\', "userId", "clientId", "clientName", "redirectUri", "issuer", "resource", "grants", "allProjects", "projectIds", \'new-a\', "accessExpiresAt", \'new-r\', "expiresAt", "createdAt", "lastUsedAt" FROM gone';
    expect(code(await hold(reconsent, [id], () => save(subject)))).toBe("unauthorized");
    expect(await koValue()).toBe("안녕");
  });

  it("잠금 대기 중 refresh 회전(같은 행의 해시 교체) → 저장된다", async () => {
    const { id, access } = await connection("editor");
    const subject = await subjectOf(access);
    expect(code(await hold('UPDATE "OAuthConnection" SET "accessTokenHash" = $2, "refreshTokenHash" = $3 WHERE "id" = $1', [id, "rotated-a", "rotated-r"], () => save(subject)))).toBe("ok");
    expect(await koValue()).toBe("새 값");
  });

  it("개인 토큰과 같은 인가 결과 — grant 없는 쓰기는 token-scope, 범위 밖은 not-found", async () => {
    const narrow = await subjectOf((await connection("editor", { grants: [] })).access);
    expect(code(await save(narrow))).toBe("token-scope");
    const outside = await subjectOf((await connection("owner", { allProjects: false, projectIds: ["other"] })).access);
    expect(code(await call("update_project", outside, { slug: "p", name: "After" }))).toBe("not-found");
  });

  describe("create_project — 고른 범위 편입", () => {
    const confirmation = (format: { adapter: string; pathTemplate: string }, head = HEAD) => signSampleConfirmation(
      { userId: "owner", repositoryId: "123", connection: "github:77", ref: "main", headSha: head, format: { ...format, locales: ["en", "ko"] } }, SECRET, new Date());
    const I18N = { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json" };
    const input = (surfaceConfirmation: string) => ({ owner: "acme", repo: "web", slug: "created", name: "Created", baseBranch: "main",
      surfaces: [{ ...I18N, baseLocale: "en", confirmation: surfaceConfirmation }] });

    it("그 연결에만 편입되고, 다음 요청의 주체로 즉시 조회·편집한다 — 다른 연결·개인 토큰은 그대로", async () => {
      const mine = await connection("owner", { allProjects: false, projectIds: ["p"] });
      const other = await connection("owner", { clientId: "https://chatgpt.com/oauth/codex/x/client.json", allProjects: false, projectIds: ["p"] });
      await token("owner", { allProjects: false, projectIds: ["p"] });
      expect(code(await call("create_project", await subjectOf(mine.access), input(confirmation(I18N))))).toBe("ok");
      const project = await prisma.project.findUniqueOrThrow({ where: { slug: "created" } });
      expect((await prisma.oAuthConnection.findUniqueOrThrow({ where: { id: mine.id } })).projectIds).toEqual(["p", project.id]);
      expect((await prisma.oAuthConnection.findUniqueOrThrow({ where: { id: other.id } })).projectIds).toEqual(["p"]);
      expect((await prisma.apiToken.findUniqueOrThrow({ where: { userId: "owner" } })).projectIds).toEqual(["p"]);

      const next = await subjectOf(mine.access);
      expect(code(await call("get_project", next, { slug: "created" }))).toBe("ok");
      expect(code(await call("update_project", next, { slug: "created", name: "Renamed" }))).toBe("ok");
      expect(code(await call("get_project", await subjectOf(other.access), { slug: "created" }))).toBe("not-found");
    });

    it("생성이 실패하면 범위 추가도 롤백된다", async () => {
      const mine = await connection("owner", { allProjects: false, projectIds: ["p"] });
      expect(code(await call("create_project", await subjectOf(mine.access), input(confirmation(I18N, "e".repeat(40)))))).toBe("sample-expired");
      expect(await prisma.project.findUnique({ where: { slug: "created" } })).toBeNull();
      expect((await prisma.oAuthConnection.findUniqueOrThrow({ where: { id: mine.id } })).projectIds).toEqual(["p"]);
    });
  });

  it("whoami는 연결 수명을 말한다", async () => {
    const { id, access } = await connection("owner");
    const outcome = await call("whoami", await subjectOf(access), {});
    const { expiresAt } = await prisma.oAuthConnection.findUniqueOrThrow({ where: { id } });
    expect(outcome).toMatchObject({ status: "ok", data: { token: { expiresAt: expiresAt.toISOString() } } });
  });
});

/**
 * **적재 lease 중 `set_translations`** (sync-lock C4) — 실제 코어·잠금·결과 변환까지. 에이전트가 받는 출력이 `sync-running` + `retryable` + 다시
 * 열리는 시각이고, 모르는 코드로 접혀 `unavailable`이 되지 않는다. 번역·사건은 그대로다.
 */
describe("적재 lease 중 set_translations", () => {
  const entries = [{ keyId: "k1", changes: [{ localeCode: "ko", value: "새 값" }] }];

  it("호출 전체가 sync-running(retryable · 시각)이고 아무것도 안 쓴다 — lease가 풀리면 같은 호출이 저장한다", async () => {
    const subject = await token("editor");
    const startedAt = new Date(Date.now() - 100_000);
    await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "live", repositoryImportStartedAt: startedAt } });
    const refused = toToolResult(await call("set_translations", subject, { slug: "p", surfaceSlug: "default", entries }));
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toEqual({
      status: "sync-running", message: expect.any(String), retryable: true,
      startedAt: startedAt.toISOString(), reopensBy: expect.stringMatching(/:00\.000Z$/),
    });
    expect(Date.parse(refused.structuredContent.reopensBy as string)).toBeGreaterThan(startedAt.getTime() + 300_000);
    expect(await koValue()).toBe("안녕");
    expect(await events()).toBe(0);

    await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: null, repositoryImportStartedAt: null } });
    expect(toToolResult(await call("set_translations", subject, { slug: "p", surfaceSlug: "default", entries })).isError).toBe(false);
    expect(await koValue()).toBe("새 값");
  });
});

/**
 * **소스 제거** (sources-add-remove B-T8). 웹 `removeSource`와 같은 코어(`removeSurface` — 판정·승계·사건은 `source-remove.integration.ts`)를
 * 지나는지와, 토큰 주체의 잠금 뒤 재읽기가 실리는지를 본다.
 */
describe("preview_source_removal → remove_source", () => {
  beforeEach(async () => {
    await prisma.translationSurface.create({ data: { id: "s2", projectId: "p", slug: "web", adapterName: "json-catalog", pathTemplate: "web/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "c1" } });
    await prisma.translation.update({ where: { id: "k1-ko" }, data: { value: "Edited", pendingEditToken: "t1" } });
  });
  const source = { slug: "p", surfaceSlug: "default" };

  it("미리보기의 지문으로 제거된다 — 지문 없이는 stale-approval이고 아무것도 안 바뀐다", async () => {
    const owner = await token("owner");
    const preview = await call("preview_source_removal", owner, source);
    expect(preview).toMatchObject({ status: "ok", data: { unsentEdits: 1, pullRequest: "none" } });
    const approval = preview.status === "ok" ? (preview.data as { approval: string }).approval : null;
    expect(await call("remove_source", owner, { ...source, approval: null })).toMatchObject({ status: "refused", code: "stale-approval" });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).archivedAt).toBeNull();
    expect(code(await call("remove_source", owner, { ...source, approval }))).toBe("ok");
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).archivedAt).not.toBeNull();
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "surface.removed" } })).toBe(1);
    expect(await koValue()).toBe("Edited");
  });

  it("잠금 대기 중 토큰이 폐기되면 unauthorized이고 제거·사건이 없다", async () => {
    await prisma.translation.update({ where: { id: "k1-ko" }, data: { pendingEditToken: null } });
    const owner = await token("owner");
    expect(code(await race({ table: "Project", id: "p" }, "revoked", "owner", () => call("remove_source", owner, { ...source, approval: null })))).toBe("unauthorized");
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).archivedAt).toBeNull();
    expect(await events()).toBe(0);
  });

  it("EDITOR는 forbidden — 코어 판정 전 입구에서 끝난다", async () => {
    expect(code(await call("remove_source", await token("editor"), { ...source, approval: null }))).toBe("forbidden");
  });
});

/**
 * **언어 추가·제거·취소** (locale-add tasks §7). 도구 넷은 웹 Action과 같은 코어(`lib/locales/change.ts`)의 형제 껍데기다 — 판정·잠금·사건의 정본 시나리오는
 * `lib/locales/__tests__/change.integration.ts`이고, 여기서는 토큰 주체가 그 코어를 지나 **조회 도구(`get_project`·`list_keys`·`preview_sync`)가 같은 상태를
 * 말하는지**를 뷰 출력으로 잰다. 거부 단언마다 같은 픽스처의 성공 대조를 둔다.
 */
describe("언어 변경 도구 × 조회 도구", () => {
  const target = (localeCode: string) => ({ slug: "p", surfaceSlug: "default", localeCode });
  const data = (outcome: ToolOutcome) => (outcome.status === "ok" ? outcome.data : {}) as Record<string, unknown>;
  const sourceOf = async (subject: ApiTokenSubject) =>
    (data(await call("get_project", subject, { slug: "p" })).sources as { slug: string; languageChanges: unknown[]; languageChangesToSend: number }[])[0]!;
  const rows = () => prisma.localeChange.findMany({ where: { projectId: "p" }, select: { localeCode: true, operation: true }, orderBy: { localeCode: "asc" } });

  it("add_locale → get_project가 추가 중인 언어를 싣고, 값이 생기면 보낼 언어 변경이 1이 된다", async () => {
    const owner = await token("owner");
    const added = await call("add_locale", owner, target("fr"));
    expect(added).toMatchObject({ status: "ok", data: { language: "fr", path: "i18n/fr.json", revived: false } });
    expect(await rows()).toEqual([{ localeCode: "fr", operation: "ADD" }]);
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "surface.localeAdded" } })).toBe(1);
    const before = await sourceOf(owner);
    expect(before.languageChanges).toEqual([{ language: "fr", change: "add", requestedAt: expect.any(String), delivered: false, editable: true }]);
    // 값 0개 ADD는 파일을 내지 않는다 — 보낼 것이 없다.
    expect(before.languageChangesToSend).toBe(0);
    expect(code(await call("set_translations", owner, { slug: "p", surfaceSlug: "default", entries: [{ keyId: "k1", changes: [{ localeCode: "fr", value: "Bonjour" }] }] }))).toBe("ok");
    expect((await sourceOf(owner)).languageChangesToSend).toBe(1);
    expect(data(await call("get_project", owner, { slug: "p" })).languageChangesToSend).toBe(1);
  });

  it.each(["__proto__", "../x", "constructor"])("add_locale %s는 영어 거부이고 행·사건이 없다", async localeCode => {
    const outcome = await call("add_locale", await token("owner"), target(localeCode));
    expect(outcome).toMatchObject({ status: "refused", code: "invalid-code" });
    expect(toToolResult(outcome).content[0]?.text).toMatch(/^[\x20-\x7E—’]+$/);
    expect(await prisma.locale.count({ where: { projectId: "p" } })).toBe(2);
    expect(await rows()).toEqual([]);
    expect(await events()).toBe(0);
  });

  it("EDITOR는 forbidden · project:settings grant 없는 OWNER 토큰은 token-scope — 둘 다 아무것도 안 바뀐다(대조: 같은 OWNER의 전체 grant는 된다)", async () => {
    expect(code(await call("add_locale", await token("editor"), target("fr")))).toBe("forbidden");
    expect(code(await call("preview_locale_removal", await token("editor"), target("ko")))).toBe("forbidden");
    const narrow = await token("owner", { grants: ["translation:write"] });
    for (const [name, input] of [["add_locale", target("fr")], ["remove_locale", { ...target("ko"), approval: null }], ["cancel_locale_removal", target("ko")]] as const) {
      expect(code(await call(name, narrow, input)), name).toBe("token-scope");
    }
    expect(await rows()).toEqual([]);
    expect(await events()).toBe(0);
    await prisma.apiToken.deleteMany({ where: { userId: "owner" } });
    expect(code(await call("add_locale", await token("owner"), target("fr")))).toBe("ok");
  });

  it("remove_locale는 서버가 준 지문을 요구한다 — 없으면 approval-required, 미리보기 지문이면 제거 예정이 되고 조회·저장이 그것을 말한다", async () => {
    const owner = await token("owner");
    expect(await call("remove_locale", owner, { ...target("ko"), approval: null })).toMatchObject({ status: "refused", code: "approval-required" });
    expect(await call("remove_locale", owner, { ...target("ko"), approval: "x".repeat(64) })).toMatchObject({ status: "refused", code: "stale-approval" });
    expect(await rows()).toEqual([]);

    const preview = await call("preview_locale_removal", owner, target("ko"));
    expect(preview).toMatchObject({ status: "ok", data: { change: "remove", path: "i18n/ko.json", translations: 1, unsentEdits: 0, delivered: false } });
    expect(await events()).toBe(0);
    expect(await call("remove_locale", owner, { ...target("ko"), approval: data(preview).approval })).toMatchObject({ status: "ok", data: { language: "ko", change: "remove", discardedEdits: 0 } });
    expect(await rows()).toEqual([{ localeCode: "ko", operation: "REMOVE" }]);

    // 조회 — 세 도구가 같은 상태를 말한다.
    const removing = { language: "ko", change: "remove", requestedAt: expect.any(String), delivered: false, editable: false, reason: "removal-pending" };
    expect(await sourceOf(owner)).toMatchObject({ languageChanges: [removing], languageChangesToSend: 1 });
    expect(data(await call("list_keys", owner, { slug: "p", surfaceSlug: "default" }))).toMatchObject({ languageChanges: [removing], languageChangesToSend: 1 });
    const sync = await call("preview_sync", owner, { slug: "p" });
    expect(data(sync)).toMatchObject({ languageChanges: [{ source: "default", language: "ko", change: "remove" }] });
    expect(sync.status === "ok" && sync.summary).toBe(en.mcp.summary.syncPreview(0, 1));

    // 저장 — 웹과 같은 거부, 영어 문장.
    const saved = await call("set_translations", owner, { slug: "p", surfaceSlug: "default", entries: [{ keyId: "k1", changes: [{ localeCode: "ko", value: "새" }] }] });
    expect(data(saved).results).toEqual([{ keyId: "k1", status: "rejected", error: "locale-removal-pending", localeCodes: ["ko"], message: en.mcp.errors.languages["locale-removal-pending"](["ko"]) }]);
    expect(await koValue()).toBe("안녕");

    // 기준 브랜치 — 언어 변경이 남은 동안 바꾸지 않는다.
    expect(toToolResult(await call("update_project", owner, { slug: "p", baseBranch: "next" })).structuredContent)
      .toMatchObject({ status: "locale-change-pending", message: en.mcp.errors.languages["locale-change-pending"] });

    // 취소 — 보내지 않은 제거라 delivered: false, 행이 사라진다.
    expect(await call("cancel_locale_removal", owner, target("ko"))).toMatchObject({ status: "ok", data: { language: "ko", delivered: false } });
    expect(await rows()).toEqual([]);
    expect((await sourceOf(owner)).languageChanges).toEqual([]);
    expect(await call("cancel_locale_removal", owner, target("ko"))).toMatchObject({ status: "refused", code: "no-removal" });
  });

  it("미리보기 뒤 새 편집이 생기면 옛 지문은 stale-approval이고 아무것도 버리지 않는다", async () => {
    const owner = await token("owner");
    const approval = data(await call("preview_locale_removal", owner, target("ko"))).approval;
    await prisma.translation.update({ where: { id: "k1-ko" }, data: { value: "Edited", pendingEditToken: "t1" } });
    expect(await call("remove_locale", owner, { ...target("ko"), approval })).toMatchObject({ status: "refused", code: "stale-approval" });
    expect(await rows()).toEqual([]);
    expect(await koValue()).toBe("Edited");
  });

  it("기준 언어는 제거할 수 없다 — base-locale 영어 거부", async () => {
    const outcome = await call("preview_locale_removal", await token("owner"), target("en"));
    expect(outcome).toMatchObject({ status: "refused", code: "base-locale" });
    expect(toToolResult(outcome).content[0]?.text).toBe(en.mcp.errors.languages["base-locale"]);
  });

  it("잠금 대기 중 토큰이 폐기되면 unauthorized이고 언어 행·사건이 없다", async () => {
    const owner = await token("owner");
    expect(code(await race({ table: "Project", id: "p" }, "revoked", "owner", () => call("add_locale", owner, target("fr"))))).toBe("unauthorized");
    expect(await rows()).toEqual([]);
    expect(await events()).toBe(0);
  });
});
