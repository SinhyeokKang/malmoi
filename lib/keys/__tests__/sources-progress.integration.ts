import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { optionalEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";
import { loadLocaleCounts } from "../query";
// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-sources-progress-"));
let binaries: string;
const PORT = 55503;
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


import { loadSource, loadSources } from "@/lib/sources/query";
import { localeProgress } from "../view";

it("실제 DB에서 소스 격리·고아 키 제외·84%와 89.5% 차이를 보존한다", async () => {
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('p','p','P','o','r',now()),('other','other','Other','o','r',now());
    INSERT INTO "TranslationSurface" (id,"projectId",slug) VALUES ('s','p','web'),('s2','p','other'),('foreign','other','web'),('empty','p','empty');
    INSERT INTO "Locale" ("projectId","surfaceId",code,name) VALUES ('p','s','en','English'),('p','s2','en','English'),('other','foreign','en','English');
    INSERT INTO "Locale" ("projectId","surfaceId",code,name,orphaned) VALUES ('p','s','ja','Japanese',true);
    INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash",orphaned,"updatedAt") SELECT 'k'||n,'p','s','k'||n,'root','Hello','hash',n=249,now() FROM generate_series(1,249) n;
    INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"needsReview","updatedAt") SELECT 't'||n,'p','s','k'||n,'en','value',n>210 AND n<=222,now() FROM generate_series(1,249) n WHERE n<=222 OR n=249`);
  const detail = await loadSource(prisma, "p", "s", "OWNER");
  expect(detail?.languages.find(row => row.code === "en")).toMatchObject({ translated: 210, needsReview: 12, untranslated: 26, total: 248, percent: 84 });
  expect((210 + 12) / 248 * 100).toBeCloseTo(89.516, 2);
  expect(detail?.languages.some(row => row.code === "ja" && row.orphaned)).toBe(true);
  expect((await loadSource(prisma, "p", "s2", "OWNER"))?.languages[0]).toMatchObject({ total: 0, percent: 0 });
  expect(await loadSource(prisma, "p", "foreign", "OWNER")).toBeNull();
  const list = await loadSources(prisma, "p", "EDITOR");
  expect(list?.sources.find(row => row.id === "s")).toMatchObject({ keys: 248, locales: 1, orphanedLocales: 1 });
  // 분모를 읽은 직후 데이터 변경과 같은 입력이다. 읽기를 직렬화하지 않는다.
  const counts = await loadLocaleCounts(prisma, "p", "s");
  const [concurrent] = localeProgress({ ...counts, total: 1, locales: [{ code: "en", isBase: false, orphaned: false }] });
  expect(concurrent?.percent).toBe(100);
  expect(concurrent?.untranslated).toBe(0);
});

it("대량 적재 직후 ANALYZE 전 상세 쿼리 시간을 기록한다", async () => {
  for (const table of ["StringKey", "Locale", "Translation"]) await pool.query(`ALTER TABLE "${table}" SET (autovacuum_enabled=false)`);
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('p','p','P','o','r',now());
    INSERT INTO "TranslationSurface" (id,"projectId",slug) VALUES ('s','p','web');
    INSERT INTO "Locale" ("projectId","surfaceId",code,name) SELECT 'p','s','l'||n,'L' FROM generate_series(1,6) n;
    INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash","updatedAt") SELECT 'k'||n,'p','s','k'||n,'root','Hello','hash',now() FROM generate_series(1,1446) n;
    INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"updatedAt") SELECT 't'||n,'p','s','k'||(((n-1)%1446)+1),'l'||(((n-1)/1446)+1),'value',now() FROM generate_series(1,8676) n`);
  const start = performance.now();
  const detail = await loadSource(prisma, "p", "s", "OWNER");
  process.stdout.write(JSON.stringify({ sourcesDetailBeforeAnalyzeMs: performance.now() - start, keys: 1446, cells: 8676 }) + "\n");
  expect(detail?.languages).toHaveLength(6);
  expect(detail?.languages.every(row => row.total === 1446 && row.percent === 100)).toBe(true);
});
