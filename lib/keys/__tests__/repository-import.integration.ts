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
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => {
      if (pause) { pause.entered.resolve(); await pause.release.promise; }
      return { status: "ok", headSha: "c".repeat(40), headCommittedAt: commitAt, files: ["en", "ko", "fr"].map(locale => ({ path: `i18n/${locale}.json`, sha: locale, size: 100 })) };
    }),
    blob: vi.fn().mockResolvedValue(content),
  };
}
const run = (repo = reader(), approval: string | null = null) => runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval }, async () => repo);
const ci = (value = "CI") => applyPush(prisma, { projectId: "p", surfaceId: "s" }, payload(1, value), { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
const values = () => prisma.translation.findMany({ where: { projectId: "p" }, orderBy: [{ localeCode: "asc" }, { keyId: "asc" }] });

it("편집 뒤 Sync는 리포 값과 무저자를 쓰고 lastPulledAt·refs를 보존한다", async () => {
  await seed(); await ci();
  await prisma.translation.updateMany({ where: { projectId: "p" }, data: { value: "Edited", updatedBy: "owner" } });
  const refs = await prisma.keyRef.findMany({ where: { stringKey: { projectId: "p" } } });
  const repo = reader('{"key0":"Repository"}');
  expect(await run(repo)).toMatchObject({ ok: true, surfaces: [{ status: "imported", count: 1 }] });
  expect(await prisma.translation.findMany({ where: { projectId: "p", localeCode: { in: ["en", "ko", "fr"] } } })).toEqual(expect.arrayContaining([expect.objectContaining({ value: "Repository", updatedBy: null })]));
  expect(await prisma.keyRef.findMany({ where: { stringKey: { projectId: "p" } } })).toEqual(refs);
  expect(await prisma.project.findUnique({ where: { id: "p" } })).toMatchObject({ lastPulledAt: pulled, repositoryImportToken: null });
  expect(repo.snapshot).toHaveBeenCalledTimes(1);
  await ci("Next CI");
  expect((await values()).every(row => row.value === "Next CI")).toBe(true);
});

it("정상 0키는 기존 키만 orphan 표시하고 번역·사용처·포맷을 보존한다", async () => {
  await seed(); await ci();
  const before = await values();
  const refs = await prisma.keyRef.findMany({ where: { stringKey: { projectId: "p" } } });
  expect(await run(reader("{}"))).toMatchObject({ ok: true, surfaces: [{ status: "imported", count: 0, failed: 0 }] });
  expect(await prisma.stringKey.count({ where: { projectId: "p", orphaned: true } })).toBe(1);
  expect(await values()).toEqual(before);
  expect(await prisma.keyRef.findMany({ where: { stringKey: { projectId: "p" } } })).toEqual(refs);
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

/**
 * ⚠️ **`reason`까지 박는다** (launch-readiness L4.3). 전에는 다섯이 `superseded` 상태만 봐서 서로 구별되지 않았다 —
 * 인가·보관은 실행권을 잃은 것(`lease-lost`)이고 설정 변경은 다른 스냅샷이 된 것(`superseded`)이다.
 */
it.each([["archive", "lease-lost"], ["permission", "lease-lost"], ["repo", "superseded"], ["branch", "superseded"], ["format", "superseded"]] as const)("준비 도중 %s 변경을 적용 시 다시 거부한다 (%s)", async (change, reason) => {
  await seed(); const pause = { entered: deferred(), release: deferred() };
  const pending = run(reader(undefined, pause)); await pause.entered.promise;
  if (change === "archive") await prisma.project.update({ where: { id: "p" }, data: { archivedAt: new Date() } });
  if (change === "permission") await prisma.projectMember.update({ where: { projectId_userId: { projectId: "p", userId: "owner" } }, data: { role: "EDITOR" } });
  if (change === "repo") await prisma.project.update({ where: { id: "p" }, data: { repositoryId: "other" } });
  if (change === "branch") await prisma.project.update({ where: { id: "p" }, data: { baseBranch: "other" } });
  if (change === "format") await prisma.translationSurface.update({ where: { id: "s" }, data: { pathTemplate: "other/{locale}.json" } });
  pause.release.resolve();
  expect(await pending).toMatchObject({ ok: true, surfaces: [{ status: "superseded", reason }] });
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

it("설정 변경으로 거부돼도 자기 진행 표시는 정리한다", async () => {
  await seed(); const entered = deferred(); const release = deferred();
  const repo = reader();
  repo.blob = vi.fn(async () => { entered.resolve(); await release.promise; return '{"hello":"Hello"}'; });
  const pending = run(repo); await entered.promise;
  await prisma.project.update({ where: { id: "p" }, data: { baseBranch: "changed" } });
  release.resolve();
  expect(await pending).toMatchObject({ ok: true, surfaces: [{ status: "superseded", reason: "superseded" }] });
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ lastImportStartedAt: null, lastImportToken: null });
});

it("표면의 예산 초과 사유를 결과까지 보존한다", async () => {
  await seed(); const repo = reader();
  repo.snapshot = vi.fn().mockResolvedValue({ status: "ok", headSha: "c".repeat(40), headCommittedAt: commitAt, files: [{ path: "i18n/en.json", sha: "en", size: 2_000_001 }] });
  expect(await run(repo)).toMatchObject({ ok: true, surfaces: [{ status: "failed", reason: "resource-limit" }] });
});

it("stale 실행은 새 실행이 없어도 실행권 해제를 못 한다", async () => {
  await seed(); const pause = { entered: deferred(), release: deferred() };
  const pending = run(reader(undefined, pause)); await pause.entered.promise;
  const before = await prisma.project.findUniqueOrThrow({ where: { id: "p" } });
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportStartedAt: new Date(Date.now() - 301_000) } });
  pause.release.resolve();
  expect(await pending).toMatchObject({ ok: true, surfaces: [{ status: "superseded", reason: "lease-lost" }] });
  expect(await prisma.project.findUnique({ where: { id: "p" } })).toMatchObject({ repositoryImportToken: before.repositoryImportToken });
});

it("CI slug의 앞뒤 공백 허용을 적용 트랜잭션에서도 유지한다", async () => {
  await seed();
  await expect(applyPush(prisma, { projectId: "p", surfaceId: "s" }, { ...payload(), projectSlug: " fixture\n" }, { token: "ci", startedAt: new Date(), refsMode: "replace", previousBaseLocale: "en" })).resolves.toMatchObject({ inserted: 1 });
});

it("Sync 적용이 먼저 잠금을 잡아도 뒤따르는 CI가 최종 값을 쓴다", async () => {
  await seed(); const syncEntered = deferred(); const ciEntered = deferred(); const releaseSync = deferred();
  const syncClient = prisma.$extends({ query: { stringKey: { async findMany({ args, query }) {
    syncEntered.resolve(); await releaseSync.promise; return query(args);
  } } } });
  const ciClient = prisma.$extends({ query: { async $executeRaw({ args, query }) {
    ciEntered.resolve(); return query(args);
  } } });
  const pendingSync = runRepositoryImportFromReader(syncClient as unknown as PrismaClient, { projectId: "p", userId: "owner", repository, approval: null }, async () => reader('{"key0":"Sync"}'));
  await syncEntered.promise;
  const pendingCi = applyPush(ciClient as unknown as PrismaClient, { projectId: "p", surfaceId: "s" }, payload(1, "Final CI"), { token: "ci", startedAt: new Date(), refsMode: "replace", previousBaseLocale: "en" });
  await ciEntered.promise; releaseSync.resolve();
  expect(await pendingSync).toMatchObject({ ok: true, surfaces: [{ status: "imported" }] });
  await pendingCi;
  expect((await values()).every(row => row.value === "Final CI")).toBe(true);
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ importRevision: 2 });
});

it("첫 표면을 확정한 뒤 둘째 표면을 읽는 동안에도 실행권을 유지한다", async () => {
  await seed();
  await prisma.translationSurface.create({ data: { id: "second", projectId: "p", slug: "second", adapterName: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "en" } });
  const entered = deferred(); const release = deferred();
  const repo: RepoReader = {
    snapshot: vi.fn().mockResolvedValue({ status: "ok", headSha: "c".repeat(40), headCommittedAt: commitAt,
      files: ["i18n", "second"].flatMap(dir => ["en", "ko"].map(locale => ({ path: `${dir}/${locale}.json`, sha: `${dir}-${locale}`, size: 100 }))),
    }),
    blob: vi.fn(async sha => { if (sha.startsWith("second")) { entered.resolve(); await release.promise; } return '{"key0":"Sync"}'; }),
  };
  const pending = run(repo); await entered.promise;
  expect(await prisma.translationSurface.findUnique({ where: { id: "s" } })).toMatchObject({ lastImportStartedAt: null, importRevision: 1 });
  try { expect(await run()).toEqual({ ok: false, error: "already-running" }); } finally { release.resolve(); }
  expect(await pending).toMatchObject({ ok: true, surfaces: [{ status: "imported" }, { status: "imported" }] });
});


// ── sync-edit-protection T9 — 수동 Sync 폐기 승인 ───────────────────────────────────────────────────────
import { readDiscardApproval } from "@/lib/import/approval";
import { runSync } from "@/lib/sync/run";

/**
 * **폐기는 서버가 발급한 지문을 되돌려 받았을 때만 열린다** (ARCHITECTURE §5.5.2). 각 거부 줄은 같은 픽스처의 성공 대조를 든다.
 * 편집은 `saveTranslationKey`와 같은 컬럼(값·저자·토큰)을 SQL로 심는다.
 */
async function editedFixture() {
  await seed(); await ci();
  await pool.query(`UPDATE "Translation" SET "value" = 'Edited', "updatedBy" = 'owner', "pendingEditToken" = 'tok-' || "localeCode" WHERE "projectId" = 'p' AND "localeCode" IN ('ko', 'fr')`);
}
const approve = async () => (await readDiscardApproval(prisma, { projectId: "p", userId: "owner" })).fingerprint;
const repoValues = () => reader('{"key0":"Repository"}');
async function cellOf(locale: string) {
  return prisma.translation.findFirstOrThrow({ where: { projectId: "p", localeCode: locale }, select: { value: true, updatedBy: true, pendingEditToken: true } });
}

it("[C4] OWNER가 승인한 지문 → 편집을 리포 값으로 덮고 토큰·저자를 비운다, 남은 편집 0", async () => {
  await editedFixture();
  expect(await run(repoValues(), await approve())).toMatchObject({ ok: true, remainingEdits: 0, surfaces: [{ status: "imported" }] });
  expect(await cellOf("ko")).toEqual({ value: "Repository", updatedBy: null, pendingEditToken: null });
});

it("[C4] 승인 없이(지문 null) → reconfirm, 편집 불변 (위 승인 → 덮임 대조)", async () => {
  await editedFixture();
  expect(await run(repoValues(), null)).toEqual({ ok: false, error: "reconfirm" });
  expect(await cellOf("ko")).toEqual({ value: "Edited", updatedBy: "owner", pendingEditToken: "tok-ko" });
  expect(await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).toMatchObject({ repositoryImportToken: null });
});

it("[C4] EDITOR 직접 호출 → forbidden, OWNER의 지문을 들고 와도 (OWNER → 적용 대조는 첫 줄)", async () => {
  await editedFixture();
  const approval = await approve();
  await prisma.projectMember.update({ where: { projectId_userId: { projectId: "p", userId: "owner" } }, data: { role: "EDITOR" } });
  expect(await run(repoValues(), approval)).toEqual({ ok: false, error: "forbidden" });
  expect(await cellOf("ko")).toMatchObject({ value: "Edited" });
});

it("[C4] 같은 건수 다른 편집(Dialog 뒤 재저장) → reconfirm, 새로 받은 지문 → 적용", async () => {
  await editedFixture();
  const stale = await approve();
  await pool.query(`UPDATE "Translation" SET "value" = 'Edited again', "pendingEditToken" = 'tok-ko-2' WHERE "projectId" = 'p' AND "localeCode" = 'ko'`);
  expect(await run(repoValues(), stale)).toEqual({ ok: false, error: "reconfirm" });
  expect(await cellOf("ko")).toMatchObject({ value: "Edited again", pendingEditToken: "tok-ko-2" });
  expect(await run(repoValues(), await approve())).toMatchObject({ ok: true, remainingEdits: 0 });
});

it("[C4] 설정 변경 뒤 옛 지문 → reconfirm (새 지문이면 reconfirm이 아니다)", async () => {
  await editedFixture();
  const stale = await approve();
  await prisma.translationSurface.update({ where: { id: "s" }, data: { baseLocale: "ko" } });
  expect(await run(repoValues(), stale)).toEqual({ ok: false, error: "reconfirm" });
  expect(await run(repoValues(), await approve())).not.toEqual({ ok: false, error: "reconfirm" });
});

it("[C4][C10] 부분 적용 뒤 같은 지문 재사용 → reconfirm — 리포에 없는 셀의 편집은 남고 결과가 그 수를 말한다", async () => {
  await editedFixture();
  const approval = await approve();
  const partialRepo = reader();
  // fr 파일에는 key0이 없다 — 그 셀은 덮이지 않아 승인된 토큰이 그대로 남는다(빈값·누락 보완은 별도 spec).
  partialRepo.blob = vi.fn(async (sha: string) => sha === "fr" ? "{}" : '{"key0":"Repository"}');
  expect(await run(partialRepo, approval)).toMatchObject({ ok: true, remainingEdits: 1 });
  expect(await cellOf("fr")).toMatchObject({ value: "Edited", pendingEditToken: "tok-fr" });
  expect(await run(repoValues(), approval)).toEqual({ ok: false, error: "reconfirm" });
});

it("일시 실패(스냅샷 못 읽음) 뒤 같은 상태로 같은 지문 재시도 → 적용 — 데이터가 안 바뀌었으니 지문도 같다", async () => {
  await editedFixture();
  const approval = await approve();
  const failing = reader();
  failing.snapshot = vi.fn().mockResolvedValue({ status: "base-branch-missing" });
  expect(await run(failing, approval)).toMatchObject({ ok: false });
  expect(await run(repoValues(), approval)).toMatchObject({ ok: true, remainingEdits: 0 });
});

it("[C4][C7] 지문 대조 뒤·upsert 전 저장 → 그 셀은 새 값·토큰 유지 + 남은 편집 1 (승인 집합 셀은 덮임 대조)", async () => {
  await editedFixture();
  const approval = await approve();
  const pause = { entered: deferred(), release: deferred() };
  const running = run(reader('{"key0":"Repository"}', pause), approval);
  await pause.entered.promise;
  await pool.query(`UPDATE "Translation" SET "value" = 'Saved during sync', "pendingEditToken" = 'tok-late' WHERE "projectId" = 'p' AND "localeCode" = 'ko'`);
  pause.release.resolve();
  expect(await running).toMatchObject({ ok: true, remainingEdits: 1 });
  expect(await cellOf("ko")).toEqual({ value: "Saved during sync", updatedBy: "owner", pendingEditToken: "tok-late" });
  expect(await cellOf("fr")).toEqual({ value: "Repository", updatedBy: null, pendingEditToken: null });
});

it("pending 0이면 지문 없이도 적용한다 — 폐기할 것이 없다", async () => {
  await seed(); await ci();
  expect(await run(repoValues(), null)).toMatchObject({ ok: true, remainingEdits: 0 });
});

it("Publish 진행 중 수동 Sync → already-running, stale Publish면 진행 (양쪽 같은 경계)", async () => {
  await seed(); await ci();
  const row = await prisma.syncRun.create({ data: { projectId: "p", status: "RUNNING", trigger: "MANUAL", startedAt: new Date() } });
  expect(await run(repoValues())).toEqual({ ok: false, error: "already-running" });
  await prisma.syncRun.update({ where: { id: row.id }, data: { startedAt: new Date(Date.now() - 301_000) } });
  expect(await run(repoValues())).toMatchObject({ ok: true });
});

it("수동 Sync 진행 중 Publish 시작 → already-running, stale Sync면 게이트를 지난다", async () => {
  await seed(); await ci();
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "other-sync", repositoryImportStartedAt: new Date() } });
  expect(await runSync(prisma, { projectId: "p", slug: "fixture", trigger: "manual", requestedBy: "owner" })).toMatchObject({ status: "failed", error: "already-running" });
  expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(0);
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportStartedAt: new Date(Date.now() - 301_000) } });
  await runSync(prisma, { projectId: "p", slug: "fixture", trigger: "manual", requestedBy: "owner" });
  // 게이트를 지났다는 증거는 행이다 — 거부에는 행을 만들지 않는다(lib/sync/run.ts). 뒤의 GitHub 호출 실패는 이 테스트 밖이다.
  expect(await prisma.syncRun.count({ where: { projectId: "p" } })).toBe(1);
});
