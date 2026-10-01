import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import type { RepoReader } from "@/lib/github";
import { readDiscardApproval } from "@/lib/import/approval";
import { runAutomationImport, runRepositoryImportFromReader } from "@/lib/import/run";
import { loadProject } from "@/lib/keys/query";
import { applyKeySave, applyKeySaveBatch } from "@/lib/keys/save-key";
import { loadPullState, saveLastPulledAt } from "@/lib/pull/load";

/**
 * **적재 lease 중 번역 쓰기 거부** (sync-lock spec 완료 조건 1·8 · design §2).
 *
 * - 수동 Sync·야간 적재가 세운 `Project` lease가 살아 있으면 저장(단건·배치)은 `sync-running`이고 **아무 행도 바꾸지 않는다.**
 * - 판정은 `Project` 잠금 **안에서** 읽은 lease다 — 적재의 `acquire`와 직렬이라 창이 없다(두 순서를 별도 PG 연결로 만든다).
 * - CI 표면 표시·Publish RUNNING은 판정에 들지 않는다(C2 · 비목표) — 저장이 된다.
 * ⚠️ 거부 단언마다 같은 픽스처의 성공 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-sync-lock-"));
let binaries: string;
const PORT = 55611;
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

const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  for (const id of ["owner", "editor"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository,
    members: { create: [{ userId: "owner", role: "OWNER" }, { userId: "editor", role: "EDITOR" }] },
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "a".repeat(40) } },
  } });
  await prisma.locale.createMany({ data: ["en", "ko"].map(code => ({ projectId: "p", surfaceId: "s", code, name: code, isBase: code === "en" })) });
  for (const key of ["k1", "k2"]) {
    await prisma.stringKey.create({ data: { id: key, projectId: "p", surfaceId: "s", key, namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s", keyId: key, localeCode: "en", value: "Hello" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s", keyId: key, localeCode: "ko", value: "안녕" } });
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const target = { projectId: "p", surfaceId: "s", surfaceSlug: "default", userId: "editor", credential: undefined };
const save = (value = "새 값", keyId = "k1") => applyKeySave(prisma, { ...target, keyId, changes: [{ localeCode: "ko", value }] });
const batch = (value = "배치 값") => applyKeySaveBatch(prisma, { ...target, entries: ["k1", "k2"].map(keyId => ({ keyId, changes: [{ localeCode: "ko", value }] })) });
const lease = (startedAt: Date | null, token: string | null = "live-sync") =>
  prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: token, repositoryImportStartedAt: startedAt } });

/** 쓰기 거부가 건드리면 안 되는 전부 — 값·토큰·저자·검토 표시, 복원 기준, 사건. */
async function writable() {
  return {
    translations: await prisma.translation.findMany({ where: { projectId: "p" }, orderBy: [{ keyId: "asc" }, { localeCode: "asc" }],
      select: { keyId: true, localeCode: true, value: true, pendingEditToken: true, updatedBy: true, needsReview: true } }),
    baselines: await prisma.translationBaseline.findMany({ where: { projectId: "p" } }),
    events: await prisma.projectEvent.count({ where: { projectId: "p" } }),
  };
}

/** 실제 Publish 성공 확정 — 전달 확인이 있어야 성공 저장이 복원 기준을 쓴다(거부가 그것을 안 쓴다는 대조가 선다). */
async function confirm() {
  await prisma.syncRun.create({ data: { id: "run", projectId: "p", status: "RUNNING", trigger: "MANUAL", startedAt: new Date(Date.now() - 600_000) } });
  const state = await loadPullState(prisma, "fixture");
  await saveLastPulledAt(prisma, "p", new Date(), undefined, state.pendingEdits, { runId: "run", contexts: state.deliveryContexts ?? [] });
  await prisma.syncRun.update({ where: { id: "run" }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function reader(pause?: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }): RepoReader {
  return {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => {
      if (pause) { pause.entered.resolve(); await pause.release.promise; }
      return { status: "ok", headSha: "c".repeat(40), headCommittedAt: "2026-09-15T00:00:00Z", files: ["en", "ko"].map(locale => ({ path: `i18n/${locale}.json`, sha: locale, size: 100 })) };
    }),
    blob: vi.fn().mockResolvedValue('{"k1":"Repository","k2":"Repository"}'),
  };
}

async function waitForLockWaiters(count: number) {
  await expect.poll(async () => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'")).rows[0]?.n ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(count);
}

describe("lease 활성 중 저장", () => {
  it("단건·배치 모두 sync-running이고 행을 하나도 바꾸지 않는다 — lease가 풀리면 같은 저장이 쓴다", async () => {
    await confirm();
    const startedAt = new Date(Date.now() - 100_000);
    await lease(startedAt);
    const before = await writable();

    const refused = { ok: false, error: "sync-running", startedAt, reopensBy: expect.any(Date) };
    expect(await save()).toEqual(refused);
    // 배치는 호출 전체가 한 번 거부된다 — 키별 결과가 없다(C4).
    expect(await batch()).toEqual(refused);
    expect(await writable()).toEqual(before);

    await lease(null, null);
    expect(await save()).toMatchObject({ ok: true, cells: [{ localeCode: "ko", value: "새 값" }] });
    const after = await writable();
    expect(after.translations.find(t => t.keyId === "k1" && t.localeCode === "ko")).toMatchObject({ value: "새 값", updatedBy: "editor", pendingEditToken: expect.any(String) });
    expect(after.baselines).toHaveLength(1);
    expect(after.events).toBe(1);
  });

  it("reopensBy는 시작 + 300초를 다음 분으로 올린 시각이다", async () => {
    const startedAt = new Date(Date.now() - 100_000);
    await lease(startedAt);
    const result = await save();
    if (result.ok || result.error !== "sync-running") throw new Error("expected sync-running");
    const expiry = startedAt.getTime() + 300_000;
    expect(result.reopensBy.getTime()).toBe(Math.floor(expiry / 60_000) * 60_000 + 60_000);
  });

  it("lease가 만료(301초)됐으면 저장이 된다", async () => {
    await lease(new Date(Date.now() - 301_000));
    expect(await save()).toMatchObject({ ok: true });
    expect(await batch()).toMatchObject({ ok: true, results: [{ result: { ok: true } }, { result: { ok: true } }] });
  });

  it("접근 거부가 lease보다 먼저다 — 멤버가 아니면 lease 상태를 흘리지 않는다", async () => {
    await lease(new Date());
    await prisma.user.create({ data: { id: "stranger", email: "fixture-stranger" } });
    expect(await applyKeySave(prisma, { ...target, userId: "stranger", keyId: "k1", changes: [{ localeCode: "ko", value: "x" }] })).toEqual({ ok: false, error: "not-found" });
  });
});

describe("판정에 들지 않는 실행 표시", () => {
  it("CI 표면 표시만 있으면(Project lease 없음) 저장이 된다 — C2", async () => {
    await prisma.translationSurface.update({ where: { id: "s" }, data: { lastImportToken: "ci:x", lastImportStartedAt: new Date() } });
    expect(await save()).toMatchObject({ ok: true });
  });

  it("Publish가 RUNNING이어도 저장이 된다 — 전달 CAS가 처리한다", async () => {
    await prisma.syncRun.create({ data: { id: "live", projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
    expect(await save()).toMatchObject({ ok: true });
  });
});

/**
 * **잠금 경합 두 순서** — 순차 호출로는 "잠금 안에서 읽었나"를 못 잰다(잠금 밖에서 읽어도 순차면 통과한다). 외부 연결이 `Project`를 쥔 채로
 * 두 쪽을 차례로 잠금 대기에 세우고 푼다 — PG 행 잠금 대기는 도착 순서대로 풀린다.
 */
describe("잠금 경합", () => {
  it("(a) 저장이 먼저 잠금을 얻으면 커밋되고, 뒤의 수동 Sync는 지문 재확인으로 멈춘다(reconfirm)", async () => {
    const approval = await readDiscardApproval(prisma, { projectId: "p", userId: "owner" });
    const holder = await pool.connect();
    let saving: ReturnType<typeof save> | undefined;
    let syncing: ReturnType<typeof runRepositoryImportFromReader> | undefined;
    try {
      await holder.query("BEGIN");
      await holder.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
      saving = save("경합 값");
      await waitForLockWaiters(1);
      syncing = runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval: approval.fingerprint, credential: undefined }, async () => reader());
      await waitForLockWaiters(2);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    expect(await saving).toMatchObject({ ok: true });
    expect(await syncing).toEqual({ ok: false, error: "reconfirm" });
    expect((await prisma.translation.findFirst({ where: { keyId: "k1", localeCode: "ko" } }))?.value).toBe("경합 값");
    expect(await prisma.project.findUnique({ where: { id: "p" }, select: { repositoryImportToken: true } })).toEqual({ repositoryImportToken: null });
  });

  it("(b) 수동 Sync가 먼저 잠금을 얻으면 대기하던 저장은 그 lease를 읽고 거부된다", async () => {
    const approval = await readDiscardApproval(prisma, { projectId: "p", userId: "owner" });
    const pause = { entered: deferred(), release: deferred() };
    const holder = await pool.connect();
    let syncing: ReturnType<typeof runRepositoryImportFromReader> | undefined;
    let saving: ReturnType<typeof save> | undefined;
    try {
      await holder.query("BEGIN");
      await holder.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
      syncing = runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval: approval.fingerprint, credential: undefined }, async () => reader(pause));
      await waitForLockWaiters(1);
      saving = save("경합 값");
      await waitForLockWaiters(2);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    try {
      expect(await saving).toEqual({ ok: false, error: "sync-running", startedAt: expect.any(Date), reopensBy: expect.any(Date) });
      // 적재는 reader 앞에서 멈춰 있다 — 리포 값이 아직 안 들어왔으니 셀은 원래 값이고, 저장 사건도 없다.
      await pause.entered.promise;
      expect(await prisma.translation.findFirst({ where: { keyId: "k1", localeCode: "ko" }, select: { value: true, pendingEditToken: true, updatedBy: true } }))
        .toEqual({ value: "안녕", pendingEditToken: null, updatedBy: null });
      expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "translation.saved" } })).toBe(0);
    } finally {
      pause.release.resolve();
      await syncing;
    }
    // 적재가 끝나 lease가 풀리면 저장이 된다.
    expect(await prisma.project.findUnique({ where: { id: "p" }, select: { repositoryImportToken: true } })).toEqual({ repositoryImportToken: null });
    expect(await save("뒤 값")).toMatchObject({ ok: true });
  });
});

it("야간 적재가 세운 lease도 저장을 막는다 — C1, 같은 acquire다", async () => {
  const pause = { entered: deferred(), release: deferred() };
  const nightly = runAutomationImport(prisma, { projectId: "p", repository }, async () => reader(pause));
  try {
    await pause.entered.promise;
    const before = await writable();
    expect(await save()).toMatchObject({ ok: false, error: "sync-running" });
    expect(await writable()).toEqual(before);
  } finally {
    pause.release.resolve();
    await nightly;
  }
  expect(await save()).toMatchObject({ ok: true });
});

/**
 * **번역 화면 착지의 lease** (sync-lock S4 · R1) — 페이지가 `loadProject`의 `writeLock`을 화면 prop으로 넘긴다. 진입점 → 격리 DB → 뷰 모델로
 * 잰다(POSTMORTEM 2026-09-14 — select 누락은 typecheck가 못 본다). ⚠️ **실행권 토큰은 뷰 모델에 실리지 않는다** — 클라이언트로 가는 값이다.
 */
describe("착지 뷰 모델의 writeLock", () => {
  it("lease가 살아 있으면 시작·다시 열리는 시각만 싣고 토큰은 없다", async () => {
    const startedAt = new Date(Date.now() - 100_000);
    await lease(startedAt);
    const project = await loadProject(prisma, "p", "s");
    expect(project?.writeLock).toEqual({ startedAt, reopensBy: expect.any(Date) });
    expect(project?.writeLock?.reopensBy.getTime()).toBeGreaterThan(startedAt.getTime() + 300_000);
    expect(JSON.stringify(project)).not.toContain("live-sync");
    expect(project).not.toHaveProperty("repositoryImportToken");
  });

  it("lease가 없거나 만료됐으면 null이다", async () => {
    expect((await loadProject(prisma, "p", "s"))?.writeLock).toBeNull();
    await lease(new Date(Date.now() - 301_000));
    expect((await loadProject(prisma, "p", "s"))?.writeLock).toBeNull();
  });
});
