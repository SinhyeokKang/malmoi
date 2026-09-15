import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { optionalEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";
import { hashPushToken } from "@/lib/push/token";

// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-repository-"));
let binaries: string;
const PORT = 55484;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

async function resetSchema(beforeSurface = false) {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    if (beforeSurface && name === "20260914042000_add_translation_surfaces") break;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});

beforeEach(() => resetSchema());

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});


const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };
const pulled = new Date("2026-09-10T00:00:00Z");
const commitAt = "2026-09-15T00:00:00Z";
const pushToken = "isolated-repository-sync-fixture";
async function seed() {
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository, pushTokenHash: hashPushToken(pushToken), lastPulledAt: pulled,
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", lastCommitSha: "a".repeat(40), lastCommitAt: pulled } },
  } });
}
function payload(count = 1, value = "Repository") {
  const keys = Array.from({ length: count }, (_, index) => ({ key: `key${index}`, namespace: "_root", sourceText: `Source ${index}` }));
  return { projectSlug: "fixture", surfaceSlug: "default", commitSha: "b".repeat(40), commitAt,
    format: { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko", "fr", "de", "ja", "es"], keys,
    translations: keys.flatMap(key => ["en", "ko", "fr", "de", "ja", "es"].map(locale => ({ key: key.key, locale, value }))),
    refs: keys.map((key, index) => ({ key: key.key, path: "src/app.ts", line: index + 1 })),
  };
}

it("1446키·6로케일의 실제 POST 경로를 격리 PG에서 측정한다", async () => {
  await seed();
  vi.doMock("@/lib/db", () => ({ getPrisma: () => prisma }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  const { POST } = await import("@/app/api/push/route");
  const samples: number[] = [];
  for (let index = 0; index < 4; index++) {
    const started = performance.now();
    const response = await POST(new Request("http://localhost/api/push", { method: "POST", headers: { authorization: `Bearer ${pushToken}` }, body: JSON.stringify(payload(1446)) }));
    samples.push(Math.round(performance.now() - started));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ translationsFilled: 8676 });
  }
  expect(await prisma.stringKey.count({ where: { projectId: "p" } })).toBe(1446);
  writeFileSync(join(tmpdir(), "malmoi-sync-post-timing.json"), JSON.stringify(samples));
});

// Tests below must fail before the repository import implementation exists.
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { applyPush } from "@/lib/push/apply";
import type { RepoReader } from "@/lib/github";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function reader(content = '{"hello":"Repository"}', pause?: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }): RepoReader {
  return {
    snapshot: vi.fn(async () => {
      if (pause) { pause.entered.resolve(); await pause.release.promise; }
      return { status: "ok", headSha: "c".repeat(40), headCommittedAt: commitAt, files: ["en", "ko", "fr"].map(locale => ({ path: `i18n/${locale}.json`, sha: locale, size: 100 })) };
    }),
    blob: vi.fn().mockResolvedValue(content),
  };
}
const run = (repo = reader()) => runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository }, async () => repo);
const ci = (value = "CI") => applyPush(prisma, { projectId: "p", surfaceId: "s" }, payload(1, value), { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
const values = () => prisma.translation.findMany({ where: { projectId: "p" }, orderBy: [{ localeCode: "asc" }, { keyId: "asc" }] });

it("편집 뒤 Sync는 리포 값과 무저자를 쓰고 lastPulledAt·refs를 보존한다", async () => {
  await seed(); await ci();
  await prisma.translation.updateMany({ where: { projectId: "p" }, data: { value: "Edited", updatedBy: "owner" } });
  const refs = await prisma.keyRef.findMany({ where: { projectId: "p" } });
  const repo = reader('{"key0":"Repository"}');
  expect(await run(repo)).toMatchObject({ ok: true, surfaces: [{ status: "imported", count: 1 }] });
  expect(await prisma.translation.findMany({ where: { projectId: "p", localeCode: { in: ["en", "ko", "fr"] } } })).toEqual(expect.arrayContaining([expect.objectContaining({ value: "Repository", updatedBy: null })]));
  expect(await prisma.keyRef.findMany({ where: { projectId: "p" } })).toEqual(refs);
  expect(await prisma.project.findUnique({ where: { id: "p" } })).toMatchObject({ lastPulledAt: pulled, repositoryImportToken: null });
  expect(repo.snapshot).toHaveBeenCalledTimes(1);
  await ci("Next CI");
  expect((await values()).every(row => row.value === "Next CI")).toBe(true);
});

it("정상 0키는 기존 키만 orphan 표시하고 번역·사용처·포맷을 보존한다", async () => {
  await seed(); await ci();
  const before = await values();
  const refs = await prisma.keyRef.findMany({ where: { projectId: "p" } });
  expect(await run(reader("{}"))).toMatchObject({ ok: true, surfaces: [{ status: "imported", count: 0, failed: 0 }] });
  expect(await prisma.stringKey.count({ where: { projectId: "p", orphaned: true } })).toBe(1);
  expect(await values()).toEqual(before);
  expect(await prisma.keyRef.findMany({ where: { projectId: "p" } })).toEqual(refs);
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ importRevision: 2, lastCommitSha: "c".repeat(40), lastImportError: null, baseLocale: "en" });
});

it.each(["{", "null"])("읽기 실패 %s는 orphan 상태를 바꾸지 않는다", async content => {
  await seed(); await ci();
  expect(await run(reader(content))).toMatchObject({ ok: true, surfaces: [{ status: "failed" }] });
  expect(await prisma.stringKey.count({ where: { projectId: "p", orphaned: false } })).toBe(1);
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ importRevision: 1 });
});

it("일부 표면 실패와 포맷 누락을 보존하고 성공한 표면은 커밋한다", async () => {
  await seed();
  await prisma.translationSurface.create({ data: { projectId: "p", id: "missing", slug: "missing", adapterName: "json-catalog", pathTemplate: "missing/{locale}.json", baseLocale: "en" } });
  await prisma.translationSurface.create({ data: { projectId: "p", id: "invalid", slug: "invalid" } });
  expect(await run()).toMatchObject({ ok: true, surfaces: [{ surfaceSlug: "default", status: "imported" }, { surfaceSlug: "invalid", status: "failed", reason: "invalid-format" }, { surfaceSlug: "missing", status: "failed" }] });
  expect(await prisma.stringKey.count({ where: { projectId: "p", surfaceId: "s" } })).toBe(1);
});

it("활성 표면 전부 포맷 누락이어도 각 이름·사유를 반환한다", async () => {
  await seed();
  await prisma.translationSurface.update({ where: { id: "s" }, data: { adapterName: null } });
  expect(await run()).toMatchObject({ ok: true, surfaces: [{ surfaceSlug: "default", reason: "invalid-format" }] });
});

it("프로젝트 실행권은 snapshot 대기 중에도 다른 Sync를 거부한다", async () => {
  await seed();
  const pause = { entered: deferred(), release: deferred() };
  const first = run(reader(undefined, pause));
  await pause.entered.promise;
  try { expect(await run()).toEqual({ ok: false, error: "already-running" }); }
  finally { pause.release.resolve(); }
  expect(await first).toMatchObject({ ok: true });
});

it.each([false, true])("Sync 준비 중 CI가 쓴 revision이 우선이다 — 같은 SHA 재실행 %s", async sameSha => {
  await seed(); if (sameSha) await ci();
  const pause = { entered: deferred(), release: deferred() };
  const first = run(reader(undefined, pause));
  await pause.entered.promise;
  await ci("Latest CI");
  const before = await prisma.translationSurface.findUnique({ where: { id: "s" }, include: { keys: { include: { refs: true } }, translations: true } });
  pause.release.resolve();
  expect(await first).toMatchObject({ ok: true, surfaces: [{ status: "superseded", reason: "superseded" }] });
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" }, include: { keys: { include: { refs: true } }, translations: true } })).toEqual(before);
});

it("stale 회수 뒤 옛 실행은 적용·실패 기록·종료를 하지 못한다", async () => {
  await seed();
  const pause = { entered: deferred(), release: deferred() };
  const first = run(reader("{", pause));
  await pause.entered.promise;
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportStartedAt: new Date(Date.now() - 301_000) } });
  expect(await run()).toMatchObject({ ok: true, surfaces: [{ status: "imported" }] });
  const before = await prisma.translationSurface.findUnique({ where: { id: "s" } });
  pause.release.resolve();
  expect(await first).toMatchObject({ ok: true, surfaces: [{ status: "superseded", reason: "lease-lost" }] });
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toEqual(before);
});

it.each(["archive", "permission", "repo", "branch", "format"])("준비 도중 %s 변경을 적용 시 다시 거부한다", async change => {
  await seed(); const pause = { entered: deferred(), release: deferred() };
  const pending = run(reader(undefined, pause)); await pause.entered.promise;
  if (change === "archive") await prisma.project.update({ where: { id: "p" }, data: { archivedAt: new Date() } });
  if (change === "permission") await prisma.projectMember.update({ where: { projectId_userId: { projectId: "p", userId: "owner" } }, data: { role: "EDITOR" } });
  if (change === "repo") await prisma.project.update({ where: { id: "p" }, data: { repositoryId: "other" } });
  if (change === "branch") await prisma.project.update({ where: { id: "p" }, data: { baseBranch: "other" } });
  if (change === "format") await prisma.translationSurface.update({ where: { id: "s" }, data: { pathTemplate: "other/{locale}.json" } });
  pause.release.resolve();
  expect(await pending).toMatchObject({ ok: true, surfaces: [{ status: "superseded" }] });
  expect(await prisma.stringKey.count({ where: { projectId: "p" } })).toBe(0);
});

it("실제 쓰기 실패는 키·revision까지 rollback한다", async () => {
  await seed();
  await pool.query(`CREATE FUNCTION reject_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
    CREATE TRIGGER reject_sync BEFORE INSERT ON "Translation" FOR EACH STATEMENT EXECUTE FUNCTION reject_sync()`);
  expect(await run()).toMatchObject({ ok: true, surfaces: [{ status: "failed" }] });
  expect(await prisma.stringKey.count({ where: { projectId: "p" } })).toBe(0);
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ importRevision: 0 });
  await expect(ci()).rejects.toThrow();
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ importRevision: 0 });
});
