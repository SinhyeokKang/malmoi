import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";

import { loadWriteLock } from "../write-lock";

/**
 * **Home 착지의 적재 lease** (sync-lock R5) — 페이지가 `loadWriteLock`의 결과를 `HomeActions`로 넘겨 [Sync]·배너 [Try again]을 멈춘다. 진입점 →
 * 격리 DB → 뷰 모델로 잰다(POSTMORTEM 2026-09-14 — select 누락은 typecheck가 못 본다). ⚠️ 실행권 토큰은 뷰 모델에 실리지 않는다.
 *
 * Unix 소켓 전용 새 클러스터. `DATABASE_URL`·`DIRECT_URL`을 절대 읽지 않는다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-home-write-lock-"));
let binaries: string;
const PORT = 55612;
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

const lease = (startedAt: Date | null, token: string | null = "live-sync") =>
  prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: token, repositoryImportStartedAt: startedAt } });

it("lease가 살아 있으면 시작·다시 열리는 시각만 싣고 토큰은 없다", async () => {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 100_000);
  await lease(startedAt);
  const lock = await loadWriteLock(prisma, "p", now);
  expect(lock).toEqual({ startedAt, reopensBy: expect.any(Date) });
  expect(lock?.reopensBy.getTime()).toBeGreaterThan(startedAt.getTime() + 300_000);
  expect(JSON.stringify(lock)).not.toContain("live-sync");
});

it("lease가 없거나 만료됐거나 토큰이 없으면 null이다", async () => {
  const now = new Date();
  expect(await loadWriteLock(prisma, "p", now)).toBeNull();
  await lease(new Date(now.getTime() - 301_000));
  expect(await loadWriteLock(prisma, "p", now)).toBeNull();
  await lease(new Date(now.getTime() - 100_000), null);
  expect(await loadWriteLock(prisma, "p", now)).toBeNull();
});
