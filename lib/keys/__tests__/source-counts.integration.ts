import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { optionalEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";
import { loadSurfaceCounts } from "../query";
// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-source-counts-"));
let binaries: string;
const PORT = 55491;
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


it.each([1, 5])("%i표면 집계의 정답과 적재 직후/ANALYZE 뒤 500ms 상한", async size => {
  process.stdout.write(JSON.stringify({ version: (await pool.query("SHOW server_version")).rows[0], environment: process.platform + "/" + process.arch, surfaces: size }) + "\n");
  for (let round = 0; round < 5; round++) {
    await resetSchema();
    for (const table of ["TranslationSurface", "StringKey", "Locale", "Translation"]) await pool.query(`ALTER TABLE "${table}" SET (autovacuum_enabled=false)`);
    // 측정 대상은 SELECT다. 검증된 fixture의 FK 트리거 비용은 적재 시간에서만 제외한다.
    await pool.query("SET session_replication_role = replica");
    await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('p','p','P','o','r',now()),('other','other','Other','o','r',now());
      INSERT INTO "TranslationSurface" (id,"projectId",slug) VALUES ('empty','p','empty'),('foreign','other','foreign'),('archived','p','archived');
      UPDATE "TranslationSurface" SET "archivedAt"=now() WHERE id='archived'`);
    for (let index = 0; index < size; index++) {
      const id = `s${index}`;
      await pool.query(`INSERT INTO "TranslationSurface" (id,"projectId",slug) VALUES ($1,'p',$1)`, [id]);
      await pool.query(`INSERT INTO "Locale" ("projectId","surfaceId",code,name,orphaned) SELECT 'p',$1,'l'||n,'L',n=201 FROM generate_series(1,201) n`, [id]);
      await pool.query(`INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash",orphaned,"updatedAt") SELECT $1||'-k'||n,'p',$1,'k'||n,'root','Hello','hash',n=20001,now() FROM generate_series(1,20001) n`, [id]);
      await pool.query(`INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"updatedAt") SELECT $1||'-t'||n,'p',$1,$1||'-k'||(((n-1)%20000)+1),'l'||(((n-1)/20000)+1),'value',now() FROM generate_series(1,200000) n`, [id]);
    }
    await pool.query(`INSERT INTO "Locale" ("projectId","surfaceId",code,name) VALUES ('other','foreign','en','English');
      INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash","updatedAt") VALUES ('other-k','other','foreign','key','root','Other','hash',now())`);
    await pool.query("SET session_replication_role = origin");
    const spy = vi.spyOn(prisma, "$queryRaw");
    const result = await loadSurfaceCounts(prisma, "p");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(size + 1);
    expect(result.find(row => row.surfaceId === "empty")).toMatchObject({ keys: 0, locales: 0 });
    for (let index = 0; index < size; index++) expect(result.find(row => row.surfaceId === `s${index}`)).toMatchObject({ keys: 20000, locales: 200 });
    const [template, ...values] = spy.mock.calls[0]!;
    if (!Array.isArray(template)) throw new Error("Expected tagged query");
    const sql = template.map((part, index) => part + (index < values.length ? `$${index + 1}` : "")).join("");
    spy.mockRestore();
    const stats = (await pool.query(`SELECT relname, n_live_tup, last_analyze, last_autoanalyze FROM pg_stat_user_tables WHERE relname IN ('StringKey','Locale','Translation')`)).rows;
    for (const phase of ["before", "after"]) {
      if (phase === "after") await pool.query('ANALYZE');
      const explain = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, values);
      const plan = explain.rows[0]["QUERY PLAN"][0];
      process.stdout.write(JSON.stringify({ size, round, phase, keys: size * 20000, locales: size * 200, translations: size * 200000, stats, plan }) + "\n");
      expect(plan["Execution Time"]).toBeLessThanOrEqual(500);
    }
  }
}, 300000);
