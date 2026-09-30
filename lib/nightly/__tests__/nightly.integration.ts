import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import type { RepoReader } from "@/lib/github";
import { applyPush } from "@/lib/push/apply";
import { createFakeGitClient, type FakeGitOptions } from "@/lib/pull/__tests__/fake-client";
import type { GitClient } from "@/lib/pull/client";

/**
 * **야간 방문의 실제 행** (nightly-sync E1). GitHub만 가짜이고 DB·적재·사건 기록은 진짜다.
 *
 * - 방문마다 사건이 **최대 하나**다(갈래별 subtype·결과·사유).
 * - 편집 없는 밤에 `SyncRun`이 생기지 않는다(옛 동작은 매일 `publish.run` + "nothing to send").
 * - `[skip-malmoi-i18n]` 머지 커밋으로 head가 앞선 프로젝트는 그 밤 야간이 적재한다(완료 조건 13 — CI는 그 커밋을 건너뛴다).
 * - 함수가 죽어 남은 `running` 적재 행은 다음 방문의 만료 닫기가 닫는다.
 *
 * Unix 소켓 전용 새 클러스터. `DATABASE_URL`·`DIRECT_URL`을 절대 읽지 않는다.
 */

const fakes = vi.hoisted(() => ({ client: undefined as GitClient | undefined, reader: undefined as RepoReader | undefined }));
vi.mock("@/lib/github", () => ({
  createGitClient: async () => { if (fakes.client === undefined) throw new Error("no fake client"); return fakes.client; },
  openRepoReader: async () => { if (fakes.reader === undefined) throw new Error("no fake reader"); return fakes.reader; },
}));

const { runNightly } = await import("@/lib/nightly/run");
const { NIGHTLY_IMPORT_START_MS, selectPullTargets } = await import("@/lib/pull/targets");

const directory = mkdtempSync(join(tmpdir(), "malmoi-nightly-"));
let binaries: string;
const PORT = 55603;
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
  fakes.client = undefined;
  fakes.reader = undefined;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const OLD = "a".repeat(40);
const MERGE = "d".repeat(40);
const oldAt = new Date("2026-09-10T00:00:00Z");
const mergeAt = "2026-09-29T09:00:00Z";
const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };

async function seed() {
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository,
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastCommitSha: OLD, lastCommitAt: oldAt } } } });
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
    projectSlug: "fixture", surfaceSlug: "default", commitSha: OLD, commitAt: oldAt.toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko"], keys: [{ key: "hello", namespace: "_root", sourceText: "Hello" }],
    translations: [{ key: "hello", locale: "en", value: "Hello" }, { key: "hello", locale: "ko", value: "안녕" }], refs: [],
  }, { token: "seed", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
}

/** `/api/pull`이 고른 행과 같은 모양 — 라우트의 `select`를 그대로 읽는다. */
async function target() {
  const row = await prisma.project.findUniqueOrThrow({ where: { id: "p" }, select: {
    id: true, slug: true, repoOwner: true, repoName: true, baseBranch: true, installationId: true, repositoryId: true, lastNightlyAt: true,
    surfaces: { select: { id: true, slug: true, archivedAt: true, lastCommitSha: true, adapterName: true, pathTemplate: true, baseLocale: true } },
  } });
  return row;
}

function github(options: FakeGitOptions) {
  const fake = createFakeGitClient({ refSha: { "heads/main": MERGE }, ...options });
  fakes.client = fake.client;
  // 머지 커밋의 트리 — Malmoi PR이 번역을 바꿔 둔 상태다.
  fakes.reader = {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha: MERGE, headCommittedAt: mergeAt,
      files: ["en", "ko"].map((locale) => ({ path: `i18n/${locale}.json`, sha: locale, size: 50 })) })),
    blob: vi.fn(async (sha: string) => sha === "en" ? '{"hello":"Hello"}' : '{"hello":"안녕하세요"}'),
  };
  return fake.calls;
}

const visit = async () => runNightly(prisma, await target(), () => 0);
const events = () => prisma.projectEvent.findMany({ where: { projectId: "p" }, orderBy: { occurredAt: "asc" } });

it("편집 없는 밤, head 같음 → nightly.skip upToDate 한 행 · SyncRun 0행 · lastNightlyAt 기록", async () => {
  await seed();
  github({ refSha: { "heads/main": OLD } });
  expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
  const rows = await events();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "IMPORT", subtype: "nightly.skip", actorKind: "AUTOMATION", result: "upToDate", surfaceIds: ["s"] });
  expect(rows[0]?.finishedAt).not.toBeNull();
  expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(0);
  expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).lastNightlyAt).not.toBeNull();
});

it("[skip-malmoi-i18n] 머지 커밋으로 head가 앞섬 · 열린 PR 없음 → import.nightly 한 행, 표면이 head로 전진", async () => {
  await seed();
  github({});
  expect(await visit()).toEqual({ action: "import", recorded: true, result: "imported", deferReason: null });
  const rows = await events();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ subtype: "import.nightly", actorKind: "AUTOMATION", result: "imported" });
  expect(rows[0]?.payload).toMatchObject({ source: "nightly", changedValues: 1 });
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).toMatchObject({ lastCommitSha: MERGE, lastCommitAt: new Date(mergeAt) });
  expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(0);
});

it("닫힌 PR만 있음(열린 PR 조회 null) → 적재 — `state: open`은 github-app.test.ts가 고정한다", async () => {
  await seed();
  const calls = github({});
  expect(await visit()).toMatchObject({ action: "import", result: "imported" });
  expect(calls.map((c) => c.method)).toEqual(["getRefSha", "findOpenPr"]);
});

it.each([
  ["열린 PR", { openPr: { url: "https://github.com/o/r/pull/5", number: 5, title: "t" } }, { result: "deferred", deferReason: "open-pr" }],
  ["PR 조회 실패", { failOn: "findOpenPr" as const }, { result: "deferred", deferReason: "pr-check-failed" }],
  ["head 조회 실패", { failOn: "getRefSha" as const }, { result: "failed", errorCode: "base-unreadable" }],
])("%s → nightly.skip 한 행, 적재·표면 변화 없음", async (_name, options, expected) => {
  await seed();
  github(options);
  await visit();
  const rows = await events();
  expect(rows).toHaveLength(1);
  const { result, ...payload } = expected;
  expect(rows[0]).toMatchObject({ subtype: "nightly.skip", result });
  expect(rows[0]?.payload).toMatchObject(payload);
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).toMatchObject({ lastCommitSha: OLD, lastImportError: null });
});

it("함수 사망으로 남은 running 적재 행을 다음 방문의 만료 닫기가 닫는다", async () => {
  await seed();
  const deadAt = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "dead", repositoryImportStartedAt: deadAt } });
  await prisma.projectEvent.create({ data: { ref: "evt_dead", projectId: "p", kind: "IMPORT", subtype: "import.nightly", actorKind: "AUTOMATION",
    surfaceIds: ["s"], surfaceScope: "sources", runToken: "import:dead", occurredAt: deadAt, searchText: "evt_dead",
    payload: { kind: "IMPORT", source: "nightly", surfaceSlugs: ["default"] } } });
  github({});
  expect(await visit()).toMatchObject({ action: "import", result: "imported" });
  const dead = await prisma.projectEvent.findFirstOrThrow({ where: { ref: "evt_dead" } });
  expect(dead).toMatchObject({ result: "failed" });
  expect(dead.finishedAt).not.toBeNull();
});

/**
 * ⚠️ **마감으로 멈춘 방문은 방문으로 치지 않는다** (r3). 머리의 방문 기록이 그대로 남으면 그 프로젝트가 다음 밤 **뒤로** 가고, 정렬이 오래된 순이라
 * 같은 프로젝트들이 매일 20초 뒤에 닿아 매일 마감에 걸린다(아사). 마감 갈래만 방문 전 값으로 되돌린다 — 다음 밤 앞으로 온다.
 */
const late = async () => runNightly(prisma, await target(), () => NIGHTLY_IMPORT_START_MS + 1);
const stampOf = async (id: string) => (await prisma.project.findUniqueOrThrow({ where: { id } })).lastNightlyAt;

it.each([
  ["한 번도 방문 안 함(null)", null],
  ["지난 방문 시각", new Date("2026-09-28T18:00:00Z")],
])("마감으로 멈춘 방문은 lastNightlyAt을 방문 전 값으로 둔다 — %s", async (_name, previous) => {
  await seed();
  await prisma.project.update({ where: { id: "p" }, data: { lastNightlyAt: previous } });
  const calls = github({});
  expect(await late()).toEqual({ action: "none", counter: "unprocessed" });
  expect(calls.map((c) => c.method)).toEqual(["getRefSha"]);
  expect(await stampOf("p")).toEqual(previous);
  expect(await events()).toEqual([]);
});

it("마감으로 멈춘 프로젝트는 다음 밤 제때 방문한 프로젝트보다 앞이다", async () => {
  await seed();
  await prisma.project.create({ data: { id: "q", slug: "other", name: "Other", ...repository, repoName: "q",
    surfaces: { create: { id: "sq", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastCommitSha: OLD, lastCommitAt: oldAt } } } });
  const before = new Date("2026-09-28T18:00:00Z");
  await prisma.project.updateMany({ data: { lastNightlyAt: before } });
  github({ refSha: { "heads/main": OLD } });
  // q는 제때 방문했다(upToDate) — 방문 기록이 지금으로 전진한다.
  const q = await prisma.project.findUniqueOrThrow({ where: { id: "q" }, select: {
    id: true, slug: true, repoOwner: true, repoName: true, baseBranch: true, installationId: true, repositoryId: true, lastNightlyAt: true,
    surfaces: { select: { id: true, slug: true, archivedAt: true, lastCommitSha: true, adapterName: true, pathTemplate: true, baseLocale: true } } } });
  expect(await runNightly(prisma, q, () => 0)).toEqual({ action: "skip", outcome: "upToDate" });
  // p는 마감으로 멈췄다.
  github({});
  await late();
  const rows = await prisma.project.findMany({ select: { slug: true, installationId: true, repositoryId: true, archivedAt: true, lastNightlyAt: true,
    surfaces: { select: { archivedAt: true, lastCommitSha: true } } } });
  expect(selectPullTargets(rows, 50).targets).toEqual(["fixture", "other"]);
  expect(await stampOf("q")).not.toEqual(before);
});

it("마감 외 갈래는 방문을 기록한다 — 실패 방문도 (짝)", async () => {
  await seed();
  github({ failOn: "getRefSha" });
  await visit();
  expect(await stampOf("p")).not.toBeNull();
});
