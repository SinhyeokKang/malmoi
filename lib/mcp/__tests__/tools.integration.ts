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
import type { ToolOutcome } from "../result";
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
  openRepoReader: async () => ({
    snapshot: async () => ({ status: "ok", headSha: h.snapshotHead, headCommittedAt: "2026-09-28T00:00:00Z", files: FILES.map(path => ({ path, sha: path, size: 20 })) }),
    blob: async () => '{"hello":"Hello"}',
  }),
}));

const { TOOLS } = await import("../tools");

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
  await prisma.project.create({ data: { id: "p", slug: "p", name: "Before", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "100" } });
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
  return { userId, tokenId: row.tokenHash, grants: row.grants, scope: row.allProjects ? { kind: "all" } : { kind: "projects", projectIds: row.projectIds } };
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
    { userId, repositoryId: "123", installationId: "77", ref: "main", headSha: head, format: { ...format, locales: ["en", "ko"] } }, SECRET, new Date());
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
    { userId: "owner", repositoryId: "123", installationId: "77", ref: "main", headSha: head, format: { ...format, locales: ["en", "ko"] } }, SECRET, new Date());
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
