import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { optionalEnv } from "@/lib/env";

/**
 * **전달 기준 테이블의 테넌트 경계** (translation-rework T5 — ARCHITECTURE §5.8 · 불변식 5).
 *
 * `DeliveryConfirmation`·`TranslationBaseline`의 FK는 전부 `projectId`(·`surfaceId`)를 공유하는 복합 FK다. 단일 FK였다면
 * 프로젝트 A의 확인이 B의 실행을, A의 기준이 B의 키·로케일을 가리키는 행을 DB가 허용한다.
 * ⚠️ 각 거부 단언 옆에 **같은 모양의 정상 행**을 둔다 — 테이블이 아예 없거나 모든 삽입이 실패해도 "거부"는 참이다(POSTMORTEM 2026-09-14).
 * ⚠️ 이 파일이 `lib/keys/__tests__/`에 있는 이유는 `vitest.projects.config.ts`의 include다.
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-baseline-fk-"));
let binaries: string;
const PORT = 55491;
let pool: Pool;
let started = false;

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  pool = new Pool({ host: directory, port: PORT, user: "postgres", database: "postgres" });
});

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  for (const p of ["a", "b"]) {
    await pool.query(`INSERT INTO "Project"(id,slug,name,"repoOwner","repoName","baseBranch","installationId","updatedAt") VALUES ($1,$1,$1,'o',$1,'main','1',now())`, [p]);
    await pool.query(`INSERT INTO "TranslationSurface"(id,"projectId",slug) VALUES ($1,$2,'default')`, [`s-${p}`, p]);
    await pool.query(`INSERT INTO "Locale"("projectId","surfaceId",code,name,"isBase") VALUES ($1,$2,'en','en',true)`, [p, `s-${p}`]);
    await pool.query(`INSERT INTO "StringKey"(id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash","updatedAt") VALUES ($1,$2,$3,'k','_root','Hi','h',now())`, [`k-${p}`, p, `s-${p}`]);
    await pool.query(`INSERT INTO "SyncRun"(id,"projectId",status,trigger) VALUES ($1,$2,'SUCCEEDED','MANUAL')`, [`r-${p}`, p]);
  }
});

afterAll(async () => {
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const confirm = (projectId: string, surfaceId: string, syncRunId: string) => pool.query(
  `INSERT INTO "DeliveryConfirmation"("projectId","surfaceId",revision,"confirmedAt","syncRunId","contextFingerprint") VALUES ($1,$2,'rev',now(),$3,'ctx')`,
  [projectId, surfaceId, syncRunId]);
const baseline = (projectId: string, surfaceId: string, keyId: string, localeCode = "en") => pool.query(
  `INSERT INTO "TranslationBaseline"("projectId","surfaceId","keyId","localeCode","restoreValue",revision) VALUES ($1,$2,$3,$4,'Hi','rev')`,
  [projectId, surfaceId, keyId, localeCode]);

it("전달 확인은 자기 프로젝트의 표면·실행만 가리킨다", async () => {
  await expect(confirm("a", "s-a", "r-a")).resolves.toBeDefined();
  await expect(confirm("b", "s-b", "r-a")).rejects.toThrow(/foreign key/);
  await expect(confirm("b", "s-a", "r-b")).rejects.toThrow(/foreign key/);
});

it("표면마다 전달 확인은 한 행이다", async () => {
  await confirm("a", "s-a", "r-a");
  await expect(confirm("a", "s-a", "r-a")).rejects.toThrow(/duplicate key/);
});

it("복원 기준은 자기 프로젝트·표면의 키와 로케일, 그리고 전달 확인이 있어야 선다", async () => {
  await expect(baseline("a", "s-a", "k-a")).rejects.toThrow(/foreign key/);
  await confirm("a", "s-a", "r-a");
  await confirm("b", "s-b", "r-b");
  await expect(baseline("a", "s-a", "k-a")).resolves.toBeDefined();
  await expect(baseline("b", "s-b", "k-a")).rejects.toThrow(/foreign key/);
  await expect(baseline("a", "s-a", "k-a", "fr")).rejects.toThrow(/foreign key/);
});

it("기준·확인이 달린 키·확인은 지울 수 없다 — Restrict", async () => {
  await confirm("a", "s-a", "r-a");
  await baseline("a", "s-a", "k-a");
  await expect(pool.query(`DELETE FROM "StringKey" WHERE id='k-a'`)).rejects.toThrow(/foreign key/);
  await expect(pool.query(`DELETE FROM "DeliveryConfirmation" WHERE "surfaceId"='s-a'`)).rejects.toThrow(/foreign key/);
  await expect(pool.query(`DELETE FROM "SyncRun" WHERE id='r-a'`)).rejects.toThrow(/foreign key/);
});
