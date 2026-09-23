import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { loadTranslationList } from "@/lib/keys/translation-list";
import { DEFAULT_TRANSLATION_QUERY } from "@/lib/translations/query";

const directory = mkdtempSync(join(tmpdir(), "malmoi-list-stats-"));
const binaries = process.env.CREDENTIAL_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
const PORT = 55512;
let pool: Pool;
let prisma: PrismaClient;
let started = false;
const captured: { query: string; params: string }[] = [];

beforeAll(async () => {
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F -c autovacuum=off`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres", options: "-c statement_timeout=5000" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [{ emit: "event", level: "query" }] });
  (prisma as unknown as { $on(event: "query", cb: (e: { query: string; params: string }) => void): void }).$on("query", e => captured.push(e));
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

async function resetSchema() {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}

const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 2 ** 32; };

/** createProject + applyPush 모양 — unnest 대량 INSERT. */
async function seedProject(id: string, nKeys: number, locales: string[], fill: number, pendingRate = 0) {
  await prisma.project.create({ data: { id, slug: id, name: id, repoOwner: "o", repoName: id, baseBranch: "main", installationId: "1", lastPulledAt: new Date("2026-09-20T00:00:00Z") } });
  const surfaceId = `${id}-web`;
  await prisma.translationSurface.create({ data: { id: surfaceId, projectId: id, slug: "web", adapterName: "json-catalog", pathTemplate: "web/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "c1" } });
  await prisma.$executeRaw`INSERT INTO "Locale" ("projectId","surfaceId","code","name","isBase")
    SELECT * FROM unnest(${locales.map(() => id)}::text[], ${locales.map(() => surfaceId)}::text[], ${locales}::text[], ${locales}::text[], ${locales.map(l => l === "en")}::boolean[])`;
  const keyIds = Array.from({ length: nKeys }, () => randomUUID());
  const keyNames = keyIds.map((_, i) => `ns${i % 12}.key_${String(i).padStart(4, "0")}`);
  const now = new Date();
  await prisma.$executeRaw`INSERT INTO "StringKey" ("id","projectId","surfaceId","key","namespace","sourceText","sourceHash","description","sortIndex","orphaned","createdAt","updatedAt")
    SELECT * FROM unnest(${keyIds}::text[], ${keyIds.map(() => id)}::text[], ${keyIds.map(() => surfaceId)}::text[], ${keyNames}::text[],
      ${keyNames.map(k => k.split(".")[0]!)}::text[], ${keyNames.map(k => `Source ${k}`)}::text[], ${keyIds}::text[], ${keyIds.map(() => null)}::text[],
      ${keyIds.map((_, i) => i)}::int[], ${keyIds.map(() => false)}::boolean[], ${keyIds.map(() => now)}::timestamp[], ${keyIds.map(() => now)}::timestamp[])`;
  const rows: { keyId: string; loc: string; value: string; pending: string | null }[] = [];
  keyIds.forEach((k, i) => {
    for (const loc of locales) {
      if (loc !== "en" && hash(`${id}${k}${loc}`) > fill) continue;
      rows.push({ keyId: k, loc, value: `${loc} value ${i}`, pending: pendingRate > 0 && hash(`p${k}${loc}`) < pendingRate ? randomUUID() : null });
    }
  });
  for (let off = 0; off < rows.length; off += 20000) {
    const chunk = rows.slice(off, off + 20000);
    await prisma.$executeRaw`INSERT INTO "Translation" ("id","projectId","surfaceId","keyId","localeCode","value","needsReview","pendingEditToken","updatedAt")
      SELECT * FROM unnest(${chunk.map(() => randomUUID())}::text[], ${chunk.map(() => id)}::text[], ${chunk.map(() => surfaceId)}::text[],
        ${chunk.map(r => r.keyId)}::text[], ${chunk.map(r => r.loc)}::text[], ${chunk.map(r => r.value)}::text[], ${chunk.map(() => false)}::boolean[],
        ${chunk.map(r => r.pending)}::text[], ${chunk.map(() => now)}::timestamp[])`;
  }
  return { surfaceId, keyIds, translations: rows.length };
}

const LOCALES57 = ["en", ...Array.from({ length: 56 }, (_, i) => `l${String(i).padStart(2, "0")}`)];

// Old statistics must not turn each key into a full scan of every translation.
it.each(["never", "small", "busy"])("loads count and page with %s statistics", async (scenario) => {
  await resetSchema();
  if (scenario === "small") {
    await seedProject("small1", 20, ["en", "ko", "ja"], 0.8);
    await seedProject("small2", 30, ["en", "ko"], 0.8);
  }
  if (scenario === "busy") {
    for (let i = 0; i < 30; i++) await seedProject(`other${i}`, 800, ["en", "ko", "ja", "fr", "de", "es"], 0.8);
  }
  if (scenario !== "never") await pool.query("ANALYZE");
  const target = await seedProject("target", 619, LOCALES57, 0.703);
  captured.length = 0;
  const first = await loadTranslationList(prisma, { projectId: "target", routeSurfaceId: target.surfaceId, query: DEFAULT_TRANSLATION_QUERY });
  expect(first.matchedKeyCount).toBe(619);
  expect(first.rows).toHaveLength(100);
  expect(first.nextCursor).not.toBeNull();
  await expectBoundedScans();
  const second = await loadTranslationList(prisma, { projectId: "target", routeSurfaceId: target.surfaceId, query: { ...DEFAULT_TRANSLATION_QUERY, cursor: first.nextCursor! } });
  expect(second.rows).toHaveLength(100);
  expect(second.rows.some(row => first.rows.some(previous => previous.keyId === row.keyId))).toBe(false);
  captured.length = 0;
  const searched = await loadTranslationList(prisma, { projectId: "target", routeSurfaceId: target.surfaceId, query: { ...DEFAULT_TRANSLATION_QUERY, q: "value 1" } });
  expect(searched.matchedKeyCount).toBe(111);
  await expectBoundedScans();
});

type PlanNode = {
  "Relation Name"?: string; "Actual Rows": number; "Actual Loops": number;
  "Rows Removed by Filter"?: number; "Rows Removed by Index Recheck"?: number; Plans?: PlanNode[];
};
function translationVisits(node: PlanNode): number {
  const own = node["Relation Name"] === "Translation"
    ? (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0) + (node["Rows Removed by Index Recheck"] ?? 0)) * node["Actual Loops"] : 0;
  return own + (node.Plans ?? []).reduce((sum, child) => sum + translationVisits(child), 0);
}

async function expectBoundedScans() {
  const queries = captured.filter(q => q.query.includes("WITH lc"));
  expect(queries).toHaveLength(2);
  const total = Number((await pool.query('SELECT count(*) FROM "Translation"')).rows[0].count);
  for (const q of queries) {
    const explained = await pool.query('EXPLAIN (ANALYZE, FORMAT JSON) ' + q.query, JSON.parse(q.params));
    // A scan of the whole target surface per key is wrong even on hardware fast enough to beat the timeout.
    expect(translationVisits(explained.rows[0]["QUERY PLAN"][0].Plan)).toBeLessThan(total * 4);
  }
}
