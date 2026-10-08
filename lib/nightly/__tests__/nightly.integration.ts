import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { en } from "@/messages/en";
import { loadSources } from "@/lib/sources/query";
import { planHomeState } from "@/lib/home/state";
import { loadProjectListAggregates } from "@/lib/keys/query";
import { summaryQueue } from "@/lib/projects/list";
import { isImportFailureCode } from "@/lib/projects/import-status";
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
    surfaces: { select: { id: true, slug: true, archivedAt: true, lastCommitSha: true, adapterName: true, pathTemplate: true, baseLocale: true, lastImportError: true, importRevision: true } },
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
    surfaces: { select: { id: true, slug: true, archivedAt: true, lastCommitSha: true, adapterName: true, pathTemplate: true, baseLocale: true, lastImportError: true, importRevision: true } } } });
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

/**
 * **base 브랜치가 정말 없으면 표면 실패 상태를 쓴다** (#155, 2026-09-30 사용자 판정). 사건만 남기면 Home이 "Nothing needs you"라고 말한다 —
 * Home의 주의 항목·`failed` 접미는 표면 `lastImportError`만 읽는다. 브랜치 부재는 Publish도 못 도는 영구 설정 문제라 수동 Sync와 같은
 * 코드(`import-failed`)를 같은 표면(활성)에 쓴다. ⚠️ **일시 실패(head 조회 throw·마감)는 그대로 사건만**이다 — 야간이 CI로 건강한 프로젝트를 뒤집지 않는다.
 */
it("base 브랜치 없음(sha null) → 활성 표면 lastImportError import-failed + nightly.skip 한 행, 보관 표면은 안 쓴다", async () => {
  await seed();
  await prisma.translationSurface.create({ data: { id: "s-arch", projectId: "p", slug: "old", archivedAt: new Date("2026-09-01T00:00:00Z") } });
  github({ refSha: {} });
  expect(await visit()).toEqual({ action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing: true });
  const rows = await events();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ subtype: "nightly.skip", result: "failed" });
  expect(rows[0]?.payload).toMatchObject({ errorCode: "base-unreadable" });
  const surface = await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } });
  expect(surface).toMatchObject({ lastImportError: "import-failed", lastCommitSha: OLD });
  expect(surface.lastImportFailedAt).not.toBeNull();
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-arch" } })).toMatchObject({ lastImportError: null });
});

it("head 조회 throw → 사건만, 표면 실패 상태 무기록 (짝)", async () => {
  await seed();
  github({ failOn: "getRefSha" });
  expect(await visit()).toMatchObject({ outcome: "failed", branchMissing: false });
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).toMatchObject({ lastImportError: null, lastImportFailedAt: null });
});

it("브랜치가 돌아온 뒤 야간 적재가 성공하면 lastImportError가 지워진다", async () => {
  await seed();
  github({ refSha: {} });
  await visit();
  github({});
  expect(await visit()).toMatchObject({ action: "import", result: "imported" });
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).toMatchObject({ lastImportError: null, lastImportFailedAt: null, lastCommitSha: MERGE });
});

/**
 * **실패 상태가 있는 표면은 같은 head여도 다시 적재한다** (Codex 교차 리뷰 🔴, 2026-09-30 사용자 판정). SHA 일치로 `upToDate`를 내면
 * 부분 적재가 놓친 파일·#155의 표면 실패가 새 커밋 전까지 그대로 남는다.
 */
const valueOf = async (locale: string) => (await prisma.translation.findFirst({ where: { projectId: "p", localeCode: locale } }))?.value ?? null;
const surfaceState = () => prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } });

it("(a) 한 로케일 내려받기 실패 → partial → 같은 head에서 정상화 → 빠진 값이 들어오고 실패 상태가 지워진다", async () => {
  await seed();
  github({});
  // 머리 커밋에 fr 파일이 새로 생겼다 — en·ko는 받고 fr만 못 받는다(부분 적재). ⚠️ 로케일 둘 중 하나가 빠지면 포맷 재확인부터 실패해 전체 실패다.
  const files = ["en", "ko", "fr"].map((locale) => ({ path: `i18n/${locale}.json`, sha: locale, size: 50 }));
  const content: Record<string, string> = { en: '{"hello":"Hello"}', ko: '{"hello":"안녕하세요"}', fr: '{"hello":"Bonjour"}' };
  let frDown = true;
  fakes.reader = {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha: MERGE, headCommittedAt: mergeAt, files })),
    blob: vi.fn(async (sha: string) => (sha === "fr" && frDown ? undefined : content[sha])),
  };
  expect(await visit()).toMatchObject({ action: "import", result: "partial" });
  expect(await surfaceState()).toMatchObject({ lastCommitSha: MERGE, lastImportError: "partial-import" });
  expect(await valueOf("fr")).toBeNull();
  // 둘째 방문 — head는 같다. 옛 판정이면 upToDate로 끝나 fr을 새 커밋 전까지 안 받는다.
  frDown = false;
  expect(await visit()).toMatchObject({ action: "import", result: "imported" });
  expect(await valueOf("fr")).toBe("Bonjour");
  expect(await surfaceState()).toMatchObject({ lastCommitSha: MERGE, lastImportError: null, lastImportFailedAt: null });
  // 셋째 방문 — 실패 상태가 지워졌으니 이제 upToDate다(밤마다 적재하지 않는다).
  expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
});

it("(b) base 브랜치 부재 → 같은 SHA로 되살림 → 다음 방문이 적재해 Home 실패가 지워진다 (#155)", async () => {
  await seed();
  github({ refSha: {} });
  await visit();
  expect(await surfaceState()).toMatchObject({ lastImportError: "import-failed", lastCommitSha: OLD });
  // 같은 커밋(OLD)으로 브랜치를 되살렸다 — reader도 그 커밋의 트리를 낸다.
  github({ refSha: { "heads/main": OLD } });
  fakes.reader = { ...fakes.reader!, snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha: OLD, headCommittedAt: oldAt.toISOString(),
    files: ["en", "ko"].map((locale) => ({ path: `i18n/${locale}.json`, sha: locale, size: 50 })) })) };
  expect(await visit()).toMatchObject({ action: "import", result: "imported" });
  expect(await surfaceState()).toMatchObject({ lastImportError: null, lastImportFailedAt: null, lastCommitSha: OLD });
});

it("실패 상태 없는 같은 head는 여전히 upToDate다 (짝)", async () => {
  await seed();
  github({ refSha: { "heads/main": OLD } });
  expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
});

/**
 * **적재에 들어가지 않는 방문도 만료된 `import:` 행을 닫는다** (Codex 교차 리뷰 🟡). 마지막 표면까지 커밋한 뒤 사건 종료 전에 함수가 죽으면
 * 모든 SHA가 head라 다음 밤이 `upToDate`로 끝나고, 만료 닫기가 `acquire` 안에만 있어 `Running…`이 영영 남았다. 살아 있는 lease는 닫지 않는다.
 * 새 사건은 만들지 않는다(기존 행을 닫을 뿐 — 방문당 새 사건 최대 하나는 그대로).
 */
async function openRun(ref: string, startedAt: Date) {
  await prisma.projectEvent.create({ data: { ref, projectId: "p", kind: "IMPORT", subtype: "import.nightly", actorKind: "AUTOMATION",
    surfaceIds: ["s"], surfaceScope: "sources", runToken: `import:${ref}`, occurredAt: startedAt, searchText: ref,
    payload: { kind: "IMPORT", source: "nightly", surfaceSlugs: ["default"] } } });
}

it("모든 SHA가 head(upToDate)여도 만료된 running 적재 행을 닫는다 — 새 사건은 스킵 한 행뿐", async () => {
  await seed();
  const deadAt = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "dead", repositoryImportStartedAt: deadAt } });
  await openRun("evt_dead", deadAt);
  github({ refSha: { "heads/main": OLD } });
  expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
  const dead = await prisma.projectEvent.findFirstOrThrow({ where: { ref: "evt_dead" } });
  expect(dead).toMatchObject({ result: "failed" });
  expect(dead.finishedAt).not.toBeNull();
  expect(await prisma.projectEvent.count({ where: { projectId: "p", NOT: { ref: "evt_dead" } } })).toBe(1);
});

it("살아 있는 lease의 running 행은 건드리지 않는다 (짝)", async () => {
  await seed();
  const liveAt = new Date(Date.now() - 5_000);
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "live", repositoryImportStartedAt: liveAt } });
  await openRun("evt_live", liveAt);
  github({ refSha: { "heads/main": OLD } });
  await visit();
  const live = await prisma.projectEvent.findFirstOrThrow({ where: { ref: "evt_live" } });
  expect(live).toMatchObject({ result: null, finishedAt: null });
});

it("첫 적재가 표면 진행 표시만 세운 채 도는 중이면 그 행도 건드리지 않는다", async () => {
  await seed();
  const liveAt = new Date(Date.now() - 5_000);
  await prisma.translationSurface.update({ where: { id: "s" }, data: { lastImportStartedAt: liveAt, lastImportToken: "first" } });
  await openRun("evt_first", liveAt);
  github({ refSha: { "heads/main": OLD } });
  await visit();
  expect(await prisma.projectEvent.findFirstOrThrow({ where: { ref: "evt_first" } })).toMatchObject({ finishedAt: null });
});

/**
 * ⚠️ **다른 트랜잭션이 `Project` 잠금을 쥐고 있으면 정리를 건너뛴다** (Codex 교차 리뷰 r2 🟡). 잠금을 쥔 쪽은 살아 있는 실행(CI 적재·수동 Sync·
 * 저장)이다 — 기다리면 방문이 30초 timeout까지 매달려 그 밤의 Publish가 안 나간다. `SKIP LOCKED`로 바로 돌아오고 정리는 다음 밤이 한다.
 */
it("Project 잠금이 잡혀 있으면 만료 행 정리가 기다리지 않고 0으로 돌아온다 — 행은 다음 밤이 닫는다", async () => {
  await seed();
  const deadAt = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "dead", repositoryImportStartedAt: deadAt } });
  await openRun("evt_locked", deadAt);
  const holder = await pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
    const { closeExpiredImportRuns } = await import("@/lib/import/run");
    const began = Date.now();
    expect(await closeExpiredImportRuns(prisma, "p")).toBe(0);
    expect(Date.now() - began).toBeLessThan(5_000);
    expect(await prisma.projectEvent.findFirstOrThrow({ where: { ref: "evt_locked" } })).toMatchObject({ finishedAt: null });
  } finally {
    await holder.query("ROLLBACK");
    holder.release();
  }
});

it("잠금이 풀린 뒤의 방문은 같은 행을 닫는다 (짝)", async () => {
  await seed();
  const deadAt = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "dead", repositoryImportStartedAt: deadAt } });
  await openRun("evt_later", deadAt);
  github({ refSha: { "heads/main": OLD } });
  await visit();
  expect(await prisma.projectEvent.findFirstOrThrow({ where: { ref: "evt_later" } })).toMatchObject({ result: "failed" });
});

it.each(["branch", "revision", "project-archive", "surface-archive", "format"] as const)(
  "delayed branch-missing observation cannot overwrite newer %s state", async (change) => {
    await seed();
    github({ refSha: {} });
    const captured = await target();
    const client = fakes.client!;
    fakes.client = { ...client, getRefSha: async () => {
      if (change === "branch") await prisma.project.update({ where: { id: "p" }, data: { baseBranch: "release" } });
      if (change === "revision") await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
        projectSlug: "fixture", surfaceSlug: "default", commitSha: MERGE, commitAt: mergeAt,
        format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
        locales: ["en", "ko"], keys: [{ key: "hello", namespace: "_root", sourceText: "Hello" }],
        translations: [{ key: "hello", locale: "en", value: "Hello" }, { key: "hello", locale: "ko", value: "안녕하세요" }], refs: [],
      }, { token: "new-success", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
      if (change === "project-archive") await prisma.project.update({ where: { id: "p" }, data: { archivedAt: new Date() } });
      if (change === "surface-archive") await prisma.translationSurface.update({ where: { id: "s" }, data: { archivedAt: new Date() } });
      if (change === "format") await prisma.translationSurface.update({ where: { id: "s" }, data: { pathTemplate: "new/{locale}.json" } });
      return null;
    } };
    expect(await runNightly(prisma, captured, () => 0)).toMatchObject({ action: "skip", outcome: "failed", branchMissing: true });
    expect(await surfaceState()).toMatchObject({ lastImportError: null, lastImportFailedAt: null });
    // Read the same Sources query and Home planner used by the pages, not only the DB columns.
    const sources = await loadSources(prisma, en, "p", "OWNER");
    if (change === "project-archive") expect(sources).toBeNull();
    else {
      expect(sources!.sources).toHaveLength(change === "surface-archive" ? 0 : 1);
      for (const source of sources!.sources) expect(source).toMatchObject({ lastImportError: null, lastImportFailedAt: null });
    }
    const project = await prisma.project.findUniqueOrThrow({ where: { id: "p" }, include: { surfaces: { where: { archivedAt: null } } } });
    const aggregates = await loadProjectListAggregates(prisma, ["p"]);
    const health = planHomeState({ archived: project.archivedAt !== null, connection: { status: "ok" },
      counts: summaryQueue({ projects: [{ projectId: "p", archived: false }], ...aggregates }),
      surfaces: project.surfaces.map(surface => ({ importing: surface.lastImportStartedAt !== null,
        importError: isImportFailureCode(surface.lastImportError) ? surface.lastImportError : null })) });
    if (change === "project-archive") expect(health).toBe("archived");
    else expect(["empty", "default"]).toContain(health);
    // The old observation is still an event, never a claim about the newer source health.
    expect(await events()).toHaveLength(1);
  },
);

it("an archived project captured earlier cannot acquire a nightly Publish run", async () => {
  await seed();
  await prisma.translation.updateMany({ where: { projectId: "p", localeCode: "ko" }, data: { pendingEditToken: "unsent" } });
  const captured = await target();
  await prisma.project.update({ where: { id: "p" }, data: { archivedAt: new Date() } });
  const calls = github({});
  expect(await runNightly(prisma, captured, () => 0)).toEqual({ action: "publish", status: "failed", error: "archived", delivery: "not-started", retryable: false });
  expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(0);
  expect(await events()).toEqual([]);
  expect(calls).toEqual([]);
});
