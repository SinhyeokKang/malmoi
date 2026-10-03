import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";

import { pendingInvitationWhere } from "@/lib/auth/pending-invitation";

import { advancedSyncTime, homeLastSync } from "../meta";
import { ADVANCED_IMPORT_WHERE, loadHomeRuns } from "../runs";

/**
 * Home 메타 열 Sync·Publish 탭의 조회 (project-card-tabs §2.2) — 실제 Postgres로 잰다. jsonb 경로 필터(`array_contains`)·복합 FK 조인은
 * 가짜 Prisma가 못 본다(POSTMORTEM 2026-09-14 — tsc는 select·where의 실행을 못 본다).
 *
 * Unix 소켓 전용 새 클러스터. `DATABASE_URL`·`DIRECT_URL`을 절대 읽지 않는다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-home-runs-"));
let binaries: string;
const PORT = 55604;
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
  await prisma.user.create({ data: { id: "u1", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "p", name: "P", repoOwner: "o", repoName: "r" } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

let seq = 0;
async function importEvent(at: string, over: { subtype: string; result: string | null; actor: "USER" | "AUTOMATION"; payload: object; finishedAt?: string }) {
  seq += 1;
  await prisma.projectEvent.create({ data: {
    ref: `evt_${seq}`, projectId: "p", kind: "IMPORT", subtype: over.subtype, result: over.result, occurredAt: new Date(at),
    finishedAt: over.result === null ? null : new Date(over.finishedAt ?? at), actorKind: over.actor, actorUserId: over.actor === "USER" ? "u1" : null,
    surfaceIds: [], surfaceScope: "project-wide", searchText: `evt_${seq}`,
    payload: { kind: "IMPORT", surfaceSlugs: [], keys: null, pendingEdits: null, surfaces: [], errorCode: null, refusal: null, ...over.payload },
  } });
}

const outcome = (surfaceSlug: string, status: string) => ({ surfaceSlug, status, count: status === "failed" ? null : 1, reason: status === "imported" ? null : "partial-import" });

const manualSuccess = () => importEvent("2026-09-27T10:00:00Z", {
  subtype: "import.run", result: "imported", actor: "USER", finishedAt: "2026-09-27T10:02:00Z",
  payload: { source: "manual", surfaceSlugs: ["web"], keys: 12, changedValues: 3 },
});
const heldOpenPr = () => importEvent("2026-09-28T18:00:00Z", { subtype: "nightly.skip", result: "deferred", actor: "AUTOMATION", payload: { source: "nightly", deferReason: "open-pr" } });

/** ⚠️ **보류는 사건에서 오지 않는다** (ux-drift-unify Q6) — 지금의 판정(`planHoldNotice`)이다. 최신 사건이 보류여도 실행은 마지막 성공 적재다. */
it("open-pr 보류가 최신이어도 Sync 실행은 마지막 성공 적재다", async () => {
  await manualSuccess();
  await heldOpenPr();
  expect(await loadHomeRuns(prisma, "p")).toEqual({
    sync: { trigger: "manual", at: new Date("2026-09-27T10:02:00Z"), result: "imported", changedValues: 3, keys: 12, surfaceSlugs: ["web"] },
    publish: null,
  });
});

it.each([
  ["야간 적재 실패", { subtype: "import.nightly", result: "failed", actor: "AUTOMATION" as const, payload: { source: "nightly", errorCode: "ingest-failed" } }],
  ["야간 스킵 upToDate", { subtype: "nightly.skip", result: "upToDate", actor: "AUTOMATION" as const, payload: { source: "nightly" } }],
  ["표면이 전부 실패한 partial", { subtype: "import.nightly", result: "partial", actor: "AUTOMATION" as const,
    payload: { source: "nightly", surfaces: [outcome("web", "partial"), outcome("app", "failed")] } }],
])("%s가 최신이면 건너뛰고 그 앞 성공 적재를 고른다", async (_name, latest) => {
  await manualSuccess();
  await heldOpenPr();
  await importEvent("2026-09-29T18:00:00Z", latest);
  expect((await loadHomeRuns(prisma, "p")).sync).toMatchObject({ trigger: "manual", at: new Date("2026-09-27T10:02:00Z") });
});

/**
 * ⚠️ **최신 N건 + 상한 방식이 아니다** — 실패만 있는 partial이 여럿 쌓여도 그 앞 성공을 고른다. 상한이 있었다면 사건이 있는데
 * `"unrecorded"`로 떨어졌다.
 */
it("실패만 있는 partial이 많이 쌓여도 그 앞 성공을 고른다", async () => {
  await manualSuccess();
  for (let day = 1; day <= 30; day += 1)
    await importEvent(`2026-10-${String(day).padStart(2, "0")}T18:00:00Z`, { subtype: "import.nightly", result: "partial", actor: "AUTOMATION",
      payload: { source: "nightly", surfaces: [outcome("web", "partial")] } });
  expect((await loadHomeRuns(prisma, "p")).sync).toMatchObject({ trigger: "manual" });
});

it("imported 표면이 하나 있는 partial은 실행이다 — 결과 partial", async () => {
  await manualSuccess();
  await importEvent("2026-09-29T18:00:00Z", { subtype: "import.nightly", result: "partial", actor: "AUTOMATION", finishedAt: "2026-09-29T18:04:00Z",
    payload: { source: "nightly", surfaceSlugs: ["app", "web"], surfaces: [outcome("app", "imported"), outcome("web", "failed")] } });
  expect((await loadHomeRuns(prisma, "p")).sync).toEqual({
    trigger: "nightly", at: new Date("2026-09-29T18:04:00Z"), result: "partial", changedValues: null, keys: null, surfaceSlugs: ["app", "web"],
  });
});

/** SQL 술어(`ADVANCED_IMPORT_WHERE`)가 `advancedSyncTime`과 **같은 행**을 고른다 — 갈리면 Sync 탭이 시각을 전진시키지 못한 실행을 말한다. */
it("SQL 술어가 advancedSyncTime과 같은 행을 고른다", async () => {
  const cases = [
    { result: "imported", surfaces: [] },
    { result: "imported", surfaces: [outcome("web", "failed")] },
    { result: "partial", surfaces: [] },
    { result: "partial", surfaces: [outcome("web", "partial")] },
    { result: "partial", surfaces: [outcome("web", "failed"), outcome("app", "partial")] },
    { result: "partial", surfaces: [outcome("web", "imported")] },
    { result: "partial", surfaces: [outcome("web", "partial"), outcome("app", "imported")] },
    { result: "failed", surfaces: [outcome("web", "imported")] },
    { result: "deferred", surfaces: [] },
    { result: "superseded", surfaces: [] },
    { result: "upToDate", surfaces: [] },
    { result: null, surfaces: [] },
  ];
  for (const [index, c] of cases.entries())
    await importEvent(`2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`, { subtype: "import.nightly", result: c.result, actor: "AUTOMATION",
      payload: { source: "nightly", surfaces: c.surfaces } });
  // 옛 행 — payload에 `surfaces`가 아예 없다.
  seq += 1;
  await prisma.projectEvent.create({ data: { ref: `evt_${seq}`, projectId: "p", kind: "IMPORT", subtype: "import.nightly", result: "partial",
    occurredAt: new Date("2026-09-20T00:00:00Z"), actorKind: "AUTOMATION", surfaceScope: "not-recorded", payload: { kind: "IMPORT" } } });

  const all = await prisma.projectEvent.findMany({ where: { projectId: "p", kind: "IMPORT" }, select: { id: true, actorKind: true, kind: true, subtype: true, result: true, payload: true } });
  const picked = await prisma.projectEvent.findMany({ where: { projectId: "p", ...ADVANCED_IMPORT_WHERE }, select: { id: true } });
  expect(picked.map((row) => row.id).sort()).toEqual(all.filter(advancedSyncTime).map((row) => row.id).sort());
  // imported 둘 + imported 표면이 있는 partial 둘 — 대조가 공허하지 않음을 고정한다.
  expect(picked).toHaveLength(4);
});

/** 사건 기록(2026-09-20) 이전에 적재된 프로젝트 — 사건이 없는데 `notSyncedYet`으로 접으면 거짓이다. */
it("사건 없음 + 적재됨 = unrecorded · 둘 다 없으면 첫 Sync 전", async () => {
  await prisma.translationSurface.create({ data: { id: "s1", projectId: "p", slug: "web" } });
  const surfaces = () => prisma.translationSurface.findMany({ where: { projectId: "p" }, select: { lastImportedAt: true, archivedAt: true } });
  const runs = await loadHomeRuns(prisma, "p");
  expect(runs.sync).toBeNull();
  expect(homeLastSync(runs.sync, await surfaces())).toBeNull();
  await prisma.translationSurface.update({ where: { id: "s1" }, data: { lastImportedAt: new Date("2026-09-01T00:00:00Z") } });
  expect(homeLastSync(runs.sync, await surfaces())).toBe("unrecorded");
});

async function publishEvent(at: string, over: { status: "SUCCEEDED" | "SKIPPED" | "FAILED"; prUrl?: string; changedValues?: number | null; actor?: "USER" | "AUTOMATION" }) {
  seq += 1;
  const run = await prisma.syncRun.create({ data: {
    projectId: "p", status: over.status, trigger: "MANUAL", startedAt: new Date(at), finishedAt: new Date(new Date(at).getTime() + 60_000),
    prUrl: over.prUrl ?? null, changed: over.status === "FAILED" ? null : 1, changedValues: over.changedValues ?? null,
  } });
  await prisma.projectEvent.create({ data: {
    ref: `evt_${seq}`, projectId: "p", kind: "PUBLISH", subtype: "publish.run", result: null, occurredAt: new Date(at),
    actorKind: over.actor ?? "USER", actorUserId: (over.actor ?? "USER") === "USER" ? "u1" : null, syncRunId: run.id,
    surfaceIds: [], surfaceScope: "project-wide", payload: { kind: "PUBLISH", surfaceSlugs: ["app", "web"], refusal: null },
  } });
}

/** 한 실행의 사실만 — 시각·PR·값 수가 고른 사건과 조인한 `SyncRun`에서 온다. 실패·스킵 Publish는 건너뛴다. */
it("마지막 성공 Publish와 그 SyncRun을 고른다 — 뒤의 실패·스킵은 건너뛴다", async () => {
  await publishEvent("2026-10-01T09:00:00Z", { status: "SUCCEEDED", prUrl: "https://github.com/o/r/pull/127", changedValues: 24, actor: "AUTOMATION" });
  await publishEvent("2026-10-02T09:00:00Z", { status: "SKIPPED", changedValues: 0 });
  await publishEvent("2026-10-03T09:00:00Z", { status: "FAILED" });
  expect((await loadHomeRuns(prisma, "p")).publish).toEqual({
    trigger: "nightly", at: new Date("2026-10-01T09:01:00Z"), prUrl: "https://github.com/o/r/pull/127", changedValues: 24, surfaceSlugs: ["app", "web"],
  });
});

it("기록 이전 실행의 changedValues는 null이다", async () => {
  await publishEvent("2026-10-01T09:00:00Z", { status: "SUCCEEDED", prUrl: "https://github.com/o/r/pull/1" });
  expect((await loadHomeRuns(prisma, "p")).publish).toMatchObject({ changedValues: null, trigger: "manual" });
});

/** Home `Members (N)`의 괄호 — 멤버 화면 목록과 같은 술어(수락·만료 둘 다 제외)를 `_count`로 센다. */
it("대기 초대 수는 수락·만료를 뺀다", async () => {
  const now = new Date("2026-10-04T00:00:00Z");
  const invite = (id: string, expiresAt: string, acceptedAt: string | null) => prisma.projectInvitation.create({ data: {
    id, projectId: "p", email: `${id}@fixture`, role: "EDITOR", tokenHash: id, invitedBy: "u1",
    expiresAt: new Date(expiresAt), acceptedAt: acceptedAt === null ? null : new Date(acceptedAt),
  } });
  await invite("live", "2026-10-10T00:00:00Z", null);
  await invite("accepted", "2026-10-10T00:00:00Z", "2026-10-02T00:00:00Z");
  await invite("expired", "2026-10-01T00:00:00Z", null);
  await invite("edge", "2026-10-04T00:00:00Z", null);
  const row = await prisma.project.findUnique({ where: { id: "p" }, select: { _count: { select: { invitations: { where: pendingInvitationWhere(now) } } } } });
  expect(row?._count.invitations).toBe(1);
});
