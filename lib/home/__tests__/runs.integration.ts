import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";

import { loadHomeRuns } from "../runs";

/**
 * **Home 보류 한 줄은 최신 적재 종류 사건이 정한다** (Codex 교차 리뷰 🟡). 결과로 거른 조회는 PR이 닫힌 뒤의 실패·upToDate를 건너뛰고 옛
 * `open-pr` 보류를 읽어, 이미 닫힌 PR을 "머지할 때까지 보류"라고 계속 말했다. 주체(`Last sync … · manual`)는 여전히 최근 **성공** 적재가 정한다.
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
async function importEvent(at: string, over: { subtype: string; result: string | null; actor: "USER" | "AUTOMATION"; payload: object }) {
  seq += 1;
  await prisma.projectEvent.create({ data: {
    ref: `evt_${seq}`, projectId: "p", kind: "IMPORT", subtype: over.subtype, result: over.result, occurredAt: new Date(at),
    finishedAt: over.result === null ? null : new Date(at), actorKind: over.actor, actorUserId: over.actor === "USER" ? "u1" : null,
    surfaceIds: [], surfaceScope: "project-wide", searchText: `evt_${seq}`,
    payload: { kind: "IMPORT", surfaceSlugs: [], keys: null, pendingEdits: null, surfaces: [], errorCode: null, refusal: null, ...over.payload },
  } });
}

const manualSuccess = () => importEvent("2026-09-27T10:00:00Z", { subtype: "import.run", result: "imported", actor: "USER", payload: { source: "manual" } });
const heldOpenPr = () => importEvent("2026-09-28T18:00:00Z", { subtype: "nightly.skip", result: "deferred", actor: "AUTOMATION", payload: { source: "nightly", deferReason: "open-pr" } });

/**
 * ⚠️ **보류 한 줄은 사건에서 오지 않는다** (ux-drift-unify Q6) — 지금의 판정(`planHoldNotice`)이다. 최신 사건이 보류여도 주체는 마지막 성공 적재의 것이다.
 */
it("open-pr 보류가 최신이어도 주체는 마지막 성공 적재의 것이다", async () => {
  await manualSuccess();
  await heldOpenPr();
  expect(await loadHomeRuns(prisma, "p")).toEqual({ sync: "manual", publish: null });
});

it.each([
  ["야간 적재 실패", { subtype: "import.nightly", result: "failed", actor: "AUTOMATION" as const, payload: { source: "nightly", errorCode: "ingest-failed" } }],
  ["야간 스킵 upToDate", { subtype: "nightly.skip", result: "upToDate", actor: "AUTOMATION" as const, payload: { source: "nightly" } }],
])("PR이 닫힌 뒤 %s가 최신이어도 주체는 마지막 성공 적재의 것이다", async (_name, latest) => {
  await manualSuccess();
  await heldOpenPr();
  await importEvent("2026-09-29T18:00:00Z", latest);
  expect(await loadHomeRuns(prisma, "p")).toEqual({ sync: "manual", publish: null });
});
