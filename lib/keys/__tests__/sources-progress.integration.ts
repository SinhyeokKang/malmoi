import { en } from "@/messages/en";
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
import { meterValue } from "@/lib/sources/meters";
import { localeRole } from "@/lib/translations/summary";

it("실제 DB에서 소스 격리·고아 키 제외·검토를 포함한 89%를 보존한다", async () => {
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('p','p','P','o','r',now()),('other','other','Other','o','r',now());
    INSERT INTO "TranslationSurface" (id,"projectId",slug) VALUES ('s','p','web'),('s2','p','other'),('foreign','other','web'),('empty','p','empty');
    INSERT INTO "Locale" ("projectId","surfaceId",code,name) VALUES ('p','s','en','English'),('p','s2','en','English'),('other','foreign','en','English');
    INSERT INTO "Locale" ("projectId","surfaceId",code,name,orphaned) VALUES ('p','s','ja','Japanese',true);
    INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash",orphaned,"updatedAt") SELECT 'k'||n,'p','s','k'||n,'root','Hello','hash',n=249,now() FROM generate_series(1,249) n;
    INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"needsReview","updatedAt") SELECT 't'||n,'p','s','k'||n,'en','value',n>210 AND n<=222,now() FROM generate_series(1,249) n WHERE n<=222 OR n=249`);
  const detail = await loadSource(prisma, en, "p", "s", "OWNER");
  expect(detail?.languages.find(row => row.code === "en")).toMatchObject({ translated: 210, needsReview: 12, untranslated: 26, total: 248, percent: 89 });
  expect((210 + 12) / 248 * 100).toBeCloseTo(89.516, 2);
  expect(detail?.languages.some(row => row.code === "ja" && row.orphaned)).toBe(true);
  expect((await loadSource(prisma, en, "p", "s2", "OWNER"))?.languages[0]).toMatchObject({ total: 0, percent: 0 });
  expect(await loadSource(prisma, en, "p", "foreign", "OWNER")).toBeNull();
  const list = await loadSources(prisma, en, "p", "EDITOR");
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
  const detail = await loadSource(prisma, en, "p", "s", "OWNER");
  process.stdout.write(JSON.stringify({ sourcesDetailBeforeAnalyzeMs: performance.now() - start, keys: 1446, cells: 8676 }) + "\n");
  expect(detail?.languages).toHaveLength(6);
  expect(detail?.languages.every(row => row.total === 1446 && row.percent === 100)).toBe(true);
});

it("작업 언어의 행 막대는 상세와 같고 제거 예정·고아·키 0·보관 소스는 제외한다", async () => {
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('p','p','P','o','r',now()),('other','other','Other','o','r',now());
    INSERT INTO "TranslationSurface" (id,"projectId",slug) VALUES ('s','p','web'),('empty','p','empty'),('archived','p','archived'),('foreign','other','web');
    UPDATE "TranslationSurface" SET "archivedAt"=now() WHERE id='archived';
    UPDATE "TranslationSurface" SET "lastImportedAt"=now(), "lastImportFailedAt"=now(), "lastImportError"='failed' WHERE id='s';
    INSERT INTO "Locale" ("projectId","surfaceId",code,name,"isBase",orphaned)
      SELECT 'p','s',code,code,code='ko',code='ja' FROM unnest(ARRAY['ko','de','en','es','fr','it','ja','zh']) code;
    INSERT INTO "Locale" ("projectId","surfaceId",code,name) VALUES ('p','empty','en','English'),('p','archived','en','English'),('other','foreign','en','English');
    INSERT INTO "LocaleChange" ("projectId","surfaceId","localeCode",operation) VALUES ('p','s','de','ADD'),('p','s','zh','REMOVE');
    INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash",orphaned,"updatedAt")
      SELECT 'k'||n,'p','s','k'||n,'root','Hello','hash',n=3,now() FROM generate_series(1,3) n;
    INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash","updatedAt") VALUES ('foreign-key','other','foreign','key','root','Hello','hash',now()),('archived-key','p','archived','key','root','Hello','hash',now());
    INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"needsReview","updatedAt")
      SELECT code||n,'p','s','k'||n,code,CASE WHEN code='en' AND n=2 THEN '' ELSE 'value' END,n=2,now()
      FROM unnest(ARRAY['ko','de','en','es','fr','ja','zh']) code CROSS JOIN generate_series(1,3) n;
    INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"updatedAt") VALUES ('foreign-value','other','foreign','foreign-key','en','value',now()),('archived-value','p','archived','archived-key','en','value',now())`);
  const list = await loadSources(prisma, en, "p", "EDITOR");
  expect(list?.sources.map(source => source.id).sort()).toEqual(["empty", "s"]);
  const detail = await loadSource(prisma, en, "p", "s", "EDITOR");
  expect(detail).not.toBeNull();
  const work = detail!.languages.filter(locale => localeRole(locale) === "work");
  const source = list?.sources.find(source => source.id === "s");
  expect(source?.meters).toEqual({ shown: work.slice(0, 5).map(meterValue), hidden: 1 });
  expect(source?.meters.shown.map(meter => meter.code)).toEqual(["ko", "de", "en", "es", "fr"]);
  expect(source?.meters.shown[0]).toEqual({ code: "ko", total: 2, done: 1, review: 1, percent: 100 });
  expect(source?.meters.shown[2]).toEqual({ code: "en", total: 2, done: 1, review: 0, percent: 50 });
  expect(source).toMatchObject({ locales: 6, orphanedLocales: 1, progress: { total: 12, done: 5, review: 4, percent: 41 } });
  expect(detail?.languages.find(locale => locale.code === "zh")).toMatchObject({ change: { operation: "REMOVE" }, percent: 100 });
  expect(detail?.languages.find(locale => locale.code === "ja")).toMatchObject({ orphaned: true, percent: 100 });
  expect(detail?.languages.find(locale => locale.code === "it")).toMatchObject({ translated: 0, needsReview: 0, untranslated: 2, percent: 0 });
  expect(list?.sources.find(source => source.id === "empty")?.meters).toEqual({ shown: [], hidden: 0 });
  expect((await loadSource(prisma, en, "p", "empty", "EDITOR"))?.languages[0]).toMatchObject({ total: 0, percent: 0 });
  expect(await loadSource(prisma, en, "p", "archived", "EDITOR")).toBeNull();
  expect(await loadSource(prisma, en, "p", "foreign", "EDITOR")).toBeNull();
});
