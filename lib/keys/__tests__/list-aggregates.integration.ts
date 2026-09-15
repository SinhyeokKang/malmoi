import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { optionalEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";
import { applyPush } from "@/lib/push/apply";
import { finishImportRun, markImportStarted, recordReportedFailure } from "@/lib/projects/import-status-store";
import { isUnpublished } from "@/lib/keys/view";
import { reviewByLocale } from "@/lib/projects/list";
import { countUnpublished, loadKeys, loadProjectListAggregates, loadReviewAttention } from "../query";
import { loadPullState } from "@/lib/pull/load";
import { addSurfaceFromSnapshot } from "@/lib/surfaces/create";

/**
 * **raw 집계 둘이 기준 판정과 같은 답을 내는가** (projects-list design §3.2 · tasks T3).
 *
 * ⚠️ **가짜 클라이언트의 호출 수만으로 raw SQL이 맞다고 판정하지 않는다.** `list-aggregates.test.ts`가
 * 재는 것은 "다섯 번만 보냈나"이고, 여기서 재는 것은 **"⑤와 `countUnpublished`가 같은 행을 세나"**다 —
 * 술어가 세 벌(`isUnpublished` 값 판정 / `countUnpublished` 집계 / 이 SQL)이 됐으므로 그중 하나가
 * 낡으면 화면의 숫자와 배너가 갈린다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 로컬 PostgreSQL 바이너리를 요구하고
 * 실제 클러스터를 띄운다 — `lib/credentials/__tests__/postgres.integration.ts`와 같은 패턴이고,
 * 공유 dev/prod 접속 변수는 읽지 않는다.
 */

// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-projects-"));
let binaries: string;
const PORT = 55483;
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

const PULLED = new Date("2026-09-10T00:00:00Z");
const BEFORE = new Date("2026-09-09T00:00:00Z");
const AFTER = new Date("2026-09-11T00:00:00Z");

it("셀 미발송 판정의 표면 보관 시각은 실제 쿼리가 생산한다", async () => {
  await seed({ id: "archived-cell", lastPulledAt: PULLED, archived: false });
  await prisma.translationSurface.update({ where: { id: "surface-archived-cell" }, data: { archivedAt: AFTER } });
  const rows = await loadKeys(prisma, "archived-cell", "surface-archived-cell");
  const cells = rows.flatMap(row => Object.values(row.cells)).filter(cell => cell !== undefined);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every(cell => "surfaceArchivedAt" in cell && cell.surfaceArchivedAt?.getTime() === AFTER.getTime())).toBe(true);
  expect(cells.some(cell => isUnpublished(cell, PULLED))).toBe(false);
});

async function addFixture() {
  await seed({ id: "add", lastPulledAt: PULLED, archived: false });
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.projectMember.create({ data: { projectId: "add", userId: "owner", role: "OWNER" } });
  const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };
  await prisma.project.update({ where: { id: "add" }, data: repository });
  return { projectId: "add", userId: "owner", repository,
    format: { adapter: "json-catalog" as const, pathTemplate: "second/{locale}.json", locales: ["en", "ko"] },
    baseLocale: "en", headSha: "c".repeat(40), headCommittedAt: AFTER.toISOString(),
    paths: ["i18n/en.json", "i18n/ko.json", "second/en.json", "second/ko.json"],
    targets: ["second/en.json", "second/ko.json"],
    blobs: new Map([["second/en.json", '{"old":"Hello"}'], ["second/ko.json", '{"old":"Translated"}']]),
  };
}

async function existingSurface() {
  return prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-add" },
    include: { locales: true, keys: { include: { refs: true } }, translations: true } });
}

it("Add surface는 첫 적재와 생성이 원자적이며 같은 경로 동시 요청은 하나만 성공한다", async () => {
  const input = await addFixture();
  const before = await existingSurface();
  const results = await Promise.allSettled([addSurfaceFromSnapshot(prisma, input), addSurfaceFromSnapshot(prisma, input)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find(r => r.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ code: "path-conflict" });
  expect(await prisma.translationSurface.count({ where: { projectId: "add" } })).toBe(2);
  expect(await existingSurface()).toEqual(before);
  expect(await prisma.translation.count({ where: { projectId: "add", surfaceId: { not: "surface-add" } } })).toBe(2);
});

it.each(["TranslationSurface", "Locale", "StringKey", "Translation", "KeyRef"])("Add surface는 %s 쓰기 실패 때 새 표면 전부를 롤백한다", async (table) => {
  const input = await addFixture();
  const before = await existingSurface();
  await pool.query(`CREATE FUNCTION reject_add() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected write failure'; END $$;
    CREATE TRIGGER reject_add BEFORE INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION reject_add()`);
  await expect(addSurfaceFromSnapshot(prisma, input)).rejects.toThrow();
  expect(await prisma.translationSurface.count({ where: { projectId: "add" } })).toBe(1);
  expect(await existingSurface()).toEqual(before);
});

it.each(["repo-replaced", "path-conflict", "forbidden", "archived", "ingest-failed"])("Add surface는 %s 거부에서 기존 표면을 보존한다", async (reason) => {
  const input = await addFixture();
  if (reason === "repo-replaced") input.repository.repositoryId = "other";
  if (reason === "path-conflict") { input.format.pathTemplate = "i18n/{locale}.json"; input.targets = ["i18n/en.json"]; input.blobs = new Map([["i18n/en.json", '{"old":"Hello"}']]); }
  if (reason === "forbidden") await prisma.projectMember.update({ where: { projectId_userId: { projectId: "add", userId: "owner" } }, data: { role: "EDITOR" } });
  if (reason === "archived") await prisma.project.update({ where: { id: "add" }, data: { archivedAt: AFTER } });
  if (reason === "ingest-failed") input.blobs = new Map([["second/en.json", "{}"]]);
  const before = await existingSurface();
  await expect(addSurfaceFromSnapshot(prisma, input)).rejects.toMatchObject({ code: reason });
  expect(await prisma.translationSurface.count({ where: { projectId: "add" } })).toBe(1);
  expect(await existingSurface()).toEqual(before);
});

it("Add surface는 일부 파일 실패를 partial-import로 남기고 성공으로 숨기지 않는다", async () => {
  const input = await addFixture();
  input.blobs.delete("second/ko.json");
  const result = await addSurfaceFromSnapshot(prisma, input);
  expect(result).toMatchObject({ count: 1, failed: 1, surfaceSlug: "second" });
  expect(await prisma.translationSurface.findUnique({ where: { id: result.surfaceId } })).toMatchObject({ lastImportError: "partial-import" });
});

it("같은 key와 locale 이름이 두 표면에 공존하고 재push가 이웃 표면을 바꾸지 않는다", async () => {
  await seed({ id: "same", lastPulledAt: PULLED, archived: false });
  await prisma.translationSurface.create({ data: { id: "same-b", projectId: "same", slug: "b" } });
  const payload = {
    projectSlug: "same", surfaceSlug: "b", commitSha: "b".repeat(40), commitAt: AFTER.toISOString(),
    format: { adapter: "json-catalog" as const, pathTemplate: "b/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko"], keys: [{ key: "old", namespace: "_root", sourceText: "B" }],
    translations: [{ key: "old", locale: "ko", value: "B translation" }], refs: [],
  };
  const readA = () => prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-same" },
    include: { locales: true, keys: { include: { refs: true } }, translations: true } });
  const before = await readA();
  await applyPush(prisma, { projectId: "same", surfaceId: "same-b" }, payload, { refsMode: "replace", previousBaseLocale: null, token: "fixture-run", startedAt: AFTER });
  await applyPush(prisma, { projectId: "same", surfaceId: "same-b" }, payload, { refsMode: "replace", previousBaseLocale: "en", token: "fixture-run", startedAt: AFTER });
  expect(await readA()).toEqual(before);
  expect(await prisma.locale.count({ where: { projectId: "same", code: "ko" } })).toBe(2);
  expect(await prisma.stringKey.count({ where: { projectId: "same", key: "old" } })).toBe(2);
  await expect(prisma.translation.create({ data: { projectId: "same", surfaceId: "same-b",
    keyId: "same-old", localeCode: "en", value: "crossed key" } })).rejects.toThrow();
});

it("단계 B는 null 자식을 거부하고 Surface의 앞선 상태를 재백필하지 않는다", async () => {
  const sql = readFileSync("prisma/migrations/20260914070000_finalize_translation_surfaces/migration.sql", "utf8");
  await resetSchema(true);
  await pool.query(readFileSync("prisma/migrations/20260914042000_add_translation_surfaces/migration.sql", "utf8"));
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('guard','guard','Guard','o','r',now());
    INSERT INTO "TranslationSurface" (id,"projectId",slug,"lastCommitSha") VALUES ('guard-s','guard','default','new-surface');
    UPDATE "Project" SET "defaultSurfaceId"='guard-s',"lastCommitSha"='stale-project' WHERE id='guard';
    INSERT INTO "Locale" ("projectId",code,name) VALUES ('guard','en','English')`);
  const client = await pool.connect();
  try {
    await expect(client.query(sql)).rejects.toThrow(/precondition failed/);
    await client.query("ROLLBACK");
    await client.query(`UPDATE "Locale" SET "surfaceId"='guard-s' WHERE "projectId"='guard'`);
    await client.query(sql);
    expect((await client.query(`SELECT "lastCommitSha" FROM "TranslationSurface" WHERE id='guard-s'`)).rows)
      .toEqual([{ lastCommitSha: "new-surface" }]);
    await expect(client.query(`INSERT INTO "Locale" ("projectId",code,name) VALUES ('guard','ko','Korean')`)).rejects.toThrow(/null/);
  } finally { client.release(); }
});

it.each(["null", "archived"])("단계 B는 유효한 기본 표면이 없는 Project를 거부한다: %s", async (state) => {
  await resetSchema(true);
  await pool.query(readFileSync("prisma/migrations/20260914042000_add_translation_surfaces/migration.sql", "utf8"));
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","updatedAt") VALUES ('invalid','invalid','Invalid','o','r',now())`);
  if (state === "archived") await pool.query(`INSERT INTO "TranslationSurface" (id,"projectId",slug,"archivedAt") VALUES ('invalid-s','invalid','default',now()); UPDATE "Project" SET "defaultSurfaceId"='invalid-s' WHERE id='invalid'`);
  const client = await pool.connect();
  try {
    await expect(client.query(readFileSync("prisma/migrations/20260914070000_finalize_translation_surfaces/migration.sql", "utf8"))).rejects.toThrow(/precondition failed/);
    await client.query("ROLLBACK");
    expect((await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='Project' AND column_name='pathTemplate'`)).rows).toEqual([{ n: 1 }]);
  } finally { client.release(); }
});

it("backfills an existing project into exactly one default surface", async () => {
  await resetSchema(true);
  await pool.query(`INSERT INTO "Project" (id,slug,name,"repoOwner","repoName","adapterName","pathTemplate","baseLocale","lastCommitSha","updatedAt")
    VALUES ('old','old','Old','o','r','json-catalog','i18n/{locale}.json','en','old-sha',now());
    INSERT INTO "Locale" ("projectId",code,name) VALUES ('old','en','English');
    INSERT INTO "StringKey" (id,"projectId",key,namespace,"sourceText","sourceHash","updatedAt") VALUES ('old-key','old','hello','_root','Hello','hash',now());
    INSERT INTO "Translation" (id,"projectId","keyId","localeCode",value,"updatedAt") VALUES ('old-t','old','old-key','en','Hello',now())`);
  await pool.query(readFileSync("prisma/migrations/20260914042000_add_translation_surfaces/migration.sql", "utf8"));
  expect((await pool.query(`SELECT id,slug,"lastCommitSha","pathTemplate" FROM "TranslationSurface" WHERE "projectId"='old'`)).rows)
    .toEqual([{ id: "surface-old", slug: "default", lastCommitSha: "old-sha", pathTemplate: "i18n/{locale}.json" }]);
  await pool.query(`INSERT INTO "Locale" ("projectId",code,name) VALUES ('old','ko','Korean');
    UPDATE "Project" SET "lastCommitSha"='late-old-writer',"lastCommitAt"='2026-09-11' WHERE id='old'`);
  const catchup = readFileSync("prisma/maintenance/backfill-surfaces.sql", "utf8");
  await pool.query(catchup);
  await pool.query(catchup);
  expect((await pool.query(`SELECT count(*)::int n FROM "Locale" WHERE "surfaceId" IS NULL`)).rows).toEqual([{ n: 0 }]);
  expect((await pool.query(`SELECT "lastCommitSha" FROM "TranslationSurface" WHERE id='surface-old'`)).rows)
    .toEqual([{ lastCommitSha: "late-old-writer" }]);
});

it("A push leaves B locales, keys, translations, refs and import state untouched", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });
  await prisma.translationSurface.create({ data: { id: "b", projectId: "p1", slug: "b", pathTemplate: "other/{locale}.json", adapterName: "json-catalog", baseLocale: "fr", declaredBaseLocale: "de", lastCommitSha: "b-sha" } });
  await prisma.locale.create({ data: { projectId: "p1", surfaceId: "b", code: "fr", name: "French" } });
  await prisma.stringKey.create({ data: { id: "b-key", projectId: "p1", surfaceId: "b", key: "b.key", namespace: "b", sourceText: "B", sourceHash: "b" } });
  await prisma.translation.create({ data: { projectId: "p1", surfaceId: "b", keyId: "b-key", localeCode: "fr", value: "B", updatedBy: "human", updatedAt: AFTER } });
  await prisma.keyRef.create({ data: { keyId: "b-key", path: "b.ts", line: 1 } });
  const readB = () => prisma.translationSurface.findUniqueOrThrow({ where: { id: "b" }, include: { locales: true, keys: { include: { refs: true } }, translations: true } });
  const before = await readB();
  await expect(applyPush(prisma, { projectId: "p1", surfaceId: "surface-p1" }, {
    projectSlug: "p1", surfaceSlug: "default", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "fr"], keys: [], translations: [], refs: [],
  }, { refsMode: "replace", previousBaseLocale: "en", token: "fixture-run", startedAt: AFTER })).resolves.toMatchObject({ translationsFilled: 0 });
  expect(await readB()).toEqual(before);
  await applyPush(prisma, { projectId: "p1", surfaceId: "surface-p1" }, {
    projectSlug: "p1", surfaceSlug: "default", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [{ key: "old", sourceText: "Changed", namespace: "a" }], locales: ["en", "ko"],
    translations: [{ key: "old", locale: "ko", value: "Repository" }], refs: [{ key: "old", path: "a.ts", line: 1 }],
  }, { refsMode: "replace", previousBaseLocale: "en", token: "fixture-run", startedAt: AFTER });
  expect(await readB()).toEqual(before);
  expect(await prisma.translation.findUnique({ where: { keyId_localeCode: { keyId: "p1-old", localeCode: "ko" } } })).toMatchObject({ value: "Repository", updatedBy: null });
  // Phase A retains the old PK, but it must never allow a cell to cross surface ownership.
  await expect(prisma.translation.create({ data: { projectId: "p1", surfaceId: "b", keyId: "b-key", localeCode: "en", value: "wrong surface" } })).rejects.toThrow();
  const unpublished = await countUnpublished(prisma, "p1", PULLED);
  await prisma.translationSurface.update({ where: { id: "b" }, data: { archivedAt: AFTER } });
  expect(await countUnpublished(prisma, "p1", PULLED)).toBe(unpublished - 1);
  const aggregate = await loadProjectListAggregates(prisma, ["p1"]);
  expect(aggregate.locales.some(l => l.surfaceId === "b")).toBe(false);
  expect(aggregate.unsent.get("p1") ?? 0).toBe(await countUnpublished(prisma, "p1", PULLED));
  const newest = new Date("2099-01-01T00:00:00Z");
  await prisma.translation.update({ where: { keyId_localeCode: { keyId: "b-key", localeCode: "fr" } }, data: { updatedAt: newest } });
  const state = await loadPullState(prisma, "p1");
  expect(state.surfaces.map(s => s.slug)).toEqual(["default"]);
  expect(state.maxUpdatedAt).toEqual(newest);
  expect(isUnpublished({ updatedAt: newest, updatedBy: "human", surfaceArchivedAt: AFTER }, PULLED)).toBe(false);
});

/**
 * 프로젝트 하나 + 키 셋 + 번역 넷. **경계의 세 시각을 전부 심는다** — 기준 시각 이전·동일·이후이고,
 * 동일은 배타적 비교라 세지 않는 쪽이다.
 */
async function seed(input: { id: string; lastPulledAt: Date | null; archived: boolean }) {
  await prisma.project.create({
    data: {
      id: input.id,
      slug: input.id,
      name: input.id,
      repoOwner: "o",
      repoName: "r",
      lastPulledAt: input.lastPulledAt,
      archivedAt: input.archived ? new Date("2026-09-01T00:00:00Z") : null,
    },
  });
  await prisma.translationSurface.create({ data: { id: `surface-${input.id}`, projectId: input.id, slug: "default",
    adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" } });
  await prisma.project.update({ where: { id: input.id }, data: { defaultSurfaceId: `surface-${input.id}` } });
  await prisma.locale.createMany({ data: ["en", "ko"].map(code => ({ projectId: input.id, surfaceId: `surface-${input.id}`, code, name: code, isBase: code === "en" })) });
  for (const [index, spec] of [
    { key: "old", createdAt: BEFORE, orphaned: false },
    { key: "same", createdAt: PULLED, orphaned: false },
    { key: "new", createdAt: AFTER, orphaned: false },
    { key: "gone", createdAt: AFTER, orphaned: true },
  ].entries()) {
    await prisma.stringKey.create({
      data: {
        id: `${input.id}-${spec.key}`,
        projectId: input.id,
        surfaceId: `surface-${input.id}`,
        key: spec.key,
        namespace: "a",
        sourceText: spec.key,
        sourceHash: spec.key,
        orphaned: spec.orphaned,
        createdAt: spec.createdAt,
      },
    });
    // 사람이 만진 편집(저자 있음)과 push가 쓴 행(저자 null)을 같은 시각대에 섞는다.
    await prisma.translation.create({
      data: {
        projectId: input.id,
        surfaceId: `surface-${input.id}`,
        keyId: `${input.id}-${spec.key}`,
        localeCode: "ko",
        value: `v${index}`,
        updatedBy: spec.key === "old" ? null : "u1",
        updatedAt: spec.createdAt,
      },
    });
  }
}

it("⑤가 countUnpublished와, 그리고 행별 isUnpublished의 합과 같다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });

  const { unsent } = await loadProjectListAggregates(prisma, ["p1"]);
  const counted = await countUnpublished(prisma, "p1", PULLED);
  const cells = await prisma.translation.findMany({
    where: { projectId: "p1" },
    select: { updatedBy: true, updatedAt: true },
  });
  const byRow = cells.filter((c) => isUnpublished(c, PULLED)).length;

  // 저자 null은 빠지고, 기준 시각과 같은 행도 빠진다 — 남는 것은 `new`와 `gone` 둘이다.
  expect(unsent.get("p1")).toBe(2);
  expect(unsent.get("p1")).toBe(counted);
  expect(unsent.get("p1")).toBe(byRow);
});

/** 첫 pull 전에는 사람이 만진 행이 전부 미발송이다 — 비교 대상이 없다. */
it("첫 pull 전에도 세 판정이 같다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });

  const { unsent } = await loadProjectListAggregates(prisma, ["p1"]);
  const counted = await countUnpublished(prisma, "p1", null);
  expect(unsent.get("p1")).toBe(3);
  expect(unsent.get("p1")).toBe(counted);
});

/**
 * ④는 **마지막 pull 이후 추가된 활성 키**다. 기준 시각과 같은 `same`은 빠지고, orphaned인 `gone`도
 * 빠진다 — 남는 것은 `new` 하나다.
 */
it("④가 보관 제외 활성 키 기준과 같다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });

  const { newKeys } = await loadProjectListAggregates(prisma, ["p1"]);
  const counted = await prisma.stringKey.count({
    where: { projectId: "p1", orphaned: false, createdAt: { gt: PULLED } },
  });

  expect(newKeys.get("p1")).toBe(1);
  expect(newKeys.get("p1")).toBe(counted);
});

/** 첫 pull 전에는 활성 키 전체가 신규다 (승인된 정의) — orphaned만 빠진다. */
it("첫 pull 전에는 활성 키 전체를 센다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  const { newKeys } = await loadProjectListAggregates(prisma, ["p1"]);
  expect(newKeys.get("p1")).toBe(3);
});

/** 보관은 Summary의 네 값에서 빠진다 — 행과 Meter는 목록에 남는다(2026-09-13 사용자). */
it("보관 프로젝트는 ④⑤에 기여하지 않는다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: true });

  const { newKeys, unsent, locales, keyTotals } = await loadProjectListAggregates(prisma, ["p1"]);

  expect(newKeys.get("p1")).toBeUndefined();
  expect(unsent.get("p1")).toBeUndefined();
  // ①②는 보관 행의 Meter를 위해 전체 멤버십으로 조회한다 — 여기서 빠지면 보관 행이 빈 바가 된다.
  expect(locales.map((l) => l.code).sort()).toEqual(["en", "ko"]);
  expect(keyTotals.get("surface-p1")).toBe(3);
});

/** `in`이 테넌트 경계다 — 인가 집합 밖의 프로젝트는 어느 집계에도 안 들어온다. */
it("인가 집합 밖의 프로젝트는 섞이지 않는다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });
  await seed({ id: "p2", lastPulledAt: PULLED, archived: false });

  const got = await loadProjectListAggregates(prisma, ["p1"]);

  expect(got.newKeys.get("p2")).toBeUndefined();
  expect(got.unsent.get("p2")).toBeUndefined();
  expect(got.locales.every((l) => l.projectId === "p1")).toBe(true);
  expect(got.cells.every((c) => c.projectId === "p1")).toBe(true);
});


it("먼저 시작한 적재가 성공해도 나중 실행의 진행 표시와 실패 기록을 빼앗지 않는다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  await markImportStarted(prisma, { projectId: "p1", surfaceId: "surface-p1" }, AFTER, "fixture-run");
  const options = { refsMode: "replace" as const, previousBaseLocale: "en", startedAt: BEFORE, token: "old-run" };
  await applyPush(prisma, { projectId: "p1", surfaceId: "surface-p1" }, {
    projectSlug: "p1", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    surfaceSlug: "default",
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [], locales: ["en", "ko"], translations: [], refs: [],
  }, options);
  expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p1" } })).lastImportStartedAt).toEqual(AFTER);
  await finishImportRun(prisma, { projectId: "p1", surfaceId: "surface-p1", token: "fixture-run", code: "import-failed" });
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p1" } })).toMatchObject({
    lastImportStartedAt: null, lastImportError: "import-failed",
  });
});

it.each(["newer-success", "rotated-token", "archived", "same-commit"])(
  "실패 보고의 UPDATE가 현재 DB 조건을 대조한다: %s", async (scenario) => {
    await seed({ id: "p1", lastPulledAt: null, archived: false });
    await seed({ id: "p2", lastPulledAt: null, archived: false });
    await prisma.project.update({ where: { id: "p1" }, data: {
      pushTokenHash: scenario === "rotated-token" ? "new" : "original",
      archivedAt: scenario === "archived" ? AFTER : null,
    } });
    await prisma.translationSurface.update({ where: { id: "surface-p1" }, data: {
      lastCommitAt: scenario === "newer-success" ? AFTER : PULLED,
      lastCommitSha: "b".repeat(40), lastImportStartedAt: AFTER,
    } });
    expect(await recordReportedFailure(prisma, {
      projectId: "p1", surfaceId: "surface-p1", tokenHash: "original", commitAt: PULLED, code: "parse-failed",
    })).toBe(scenario === "same-commit" ? "recorded" : "rejected");
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p1" } })).toMatchObject({
      lastImportError: scenario === "same-commit" ? "parse-failed" : null,
      lastImportStartedAt: AFTER, lastCommitSha: "b".repeat(40),
    });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p2" } })).lastImportError).toBeNull();
  },
);

it.each([null, "partial-import"] as const)("자기 실행의 적재 결과 %s가 데이터와 함께 확정된다", async (importOutcome) => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  await prisma.translationSurface.update({ where: { id: "surface-p1" }, data: { lastImportError: "parse-failed" } });
  await markImportStarted(prisma, { projectId: "p1", surfaceId: "surface-p1" }, AFTER, "fixture-run");
  await applyPush(prisma, { projectId: "p1", surfaceId: "surface-p1" }, {
    projectSlug: "p1", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    surfaceSlug: "default",
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [{ key: "added", sourceText: "Added", namespace: "_root" }],
    locales: ["en", "ko"], translations: [{ key: "added", locale: "ko", value: "추가" }], refs: [],
  }, { refsMode: "replace", previousBaseLocale: "en", token: "fixture-run", startedAt: AFTER, importOutcome });
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p1" } })).toMatchObject({
    lastImportStartedAt: null, lastImportError: importOutcome, lastCommitSha: "a".repeat(40),
  });
  expect(await prisma.translation.count({ where: { projectId: "p1", value: "추가", updatedBy: null } })).toBe(1);
});

it("적재 트랜잭션이 실패하면 진행·오류와 기존 데이터도 함께 보존된다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  await prisma.translationSurface.update({ where: { id: "surface-p1" }, data: { lastImportError: "parse-failed" } });
  await markImportStarted(prisma, { projectId: "p1", surfaceId: "surface-p1" }, AFTER, "fixture-run");
  await expect(applyPush(prisma, { projectId: "p1", surfaceId: "surface-p1" }, {
    projectSlug: "p1", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    surfaceSlug: "default",
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [{ key: "added", sourceText: "Added", namespace: "_root" }],
    // 없는 로케일의 번역은 실제 FK 위반이다 — 가짜의 성공 응답으로 원자성을 판단하지 않는다.
    locales: ["en"], translations: [{ key: "added", locale: "missing", value: "x" }], refs: [],
  }, { refsMode: "replace", previousBaseLocale: "en", token: "fixture-run", startedAt: AFTER })).rejects.toThrow();
  expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p1" } })).toMatchObject({
    lastImportStartedAt: AFTER, lastImportError: "parse-failed", lastCommitSha: null,
  });
  expect(await prisma.stringKey.count({ where: { projectId: "p1", key: "added" } })).toBe(0);
  expect(await prisma.stringKey.count({ where: { projectId: "p1", orphaned: false } })).toBe(3);
});

it.each([PULLED, null])("미발송 세 술어의 저자·시각·빈 값·고아 로케일 경계를 대조한다: %s", async (lastPulledAt) => {
  await seed({ id: "p1", lastPulledAt, archived: false });
  await prisma.translation.deleteMany({ where: { projectId: "p1" } });
  await prisma.locale.update({ where: { projectId_surfaceId_code: { projectId: "p1", surfaceId: "surface-p1", code: "ko" } }, data: { orphaned: true } });
  for (const updatedBy of [null, "user"]) {
    for (const [index, updatedAt] of [BEFORE, PULLED, AFTER].entries()) {
      await prisma.translation.create({ data: {
        projectId: "p1", surfaceId: "surface-p1", keyId: `p1-${["old", "same", "new"][index]}`,
        localeCode: updatedBy === null ? "en" : "ko", value: "", updatedBy, updatedAt,
      } });
    }
  }
  const cells = await prisma.translation.findMany({ where: { projectId: "p1" } });
  const expected = lastPulledAt === null ? 3 : 1;
  expect(cells.filter((cell) => isUnpublished(cell, lastPulledAt))).toHaveLength(expected);
  expect(await countUnpublished(prisma, "p1", lastPulledAt)).toBe(expected);
  expect((await loadProjectListAggregates(prisma, ["p1"])).unsent.get("p1")).toBe(expected);
});

it("단계 B 복합 인덱스는 표면 목록과 미발송 범위를 자연 계획으로 좁힌다", async () => {
  await seed({ id: "plans", lastPulledAt: PULLED, archived: false });
  await pool.query(`INSERT INTO "TranslationSurface" (id,"projectId",slug)
    SELECT 's-'||i,'plans','s-'||i FROM generate_series(1,40) i;
    INSERT INTO "Locale" ("projectId","surfaceId",code,name,"isBase") SELECT 'plans','s-'||i,'ko','ko',false FROM generate_series(1,40) i;
    INSERT INTO "StringKey" (id,"projectId","surfaceId",key,namespace,"sourceText","sourceHash","updatedAt")
    SELECT 'k-'||s||'-'||k,'plans','s-'||s,'key-'||k,'a','v','h',now() FROM generate_series(1,40) s CROSS JOIN generate_series(1,500) k;
    INSERT INTO "Translation" (id,"projectId","surfaceId","keyId","localeCode",value,"updatedBy","updatedAt")
    SELECT 't-'||id,"projectId","surfaceId",id,'ko','v','u',now() FROM "StringKey" WHERE "surfaceId" LIKE 's-%';
    ANALYZE "StringKey"; ANALYZE "Translation";`);
  const plans = [];
  for (const sql of [
    `SELECT id,key FROM "StringKey" WHERE "projectId"='plans' AND "surfaceId"='s-20' AND namespace='a' ORDER BY key`,
    `SELECT count(*) FROM "Translation" WHERE "projectId"='plans' AND "surfaceId"='s-20' AND "updatedAt">'2026-01-01' AND "updatedBy" IS NOT NULL`,
  ]) {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
    const plan = JSON.stringify(result.rows[0]["QUERY PLAN"]);
    expect(plan).not.toContain('"Node Type":"Seq Scan"');
    expect(plan).toMatch(/projectId_surfaceId/);
    plans.push(result.rows[0]["QUERY PLAN"]);
  }
  console.info("surface index plans", JSON.stringify(plans));
});

it("적재 예산 초과도 생성한 표면과 자식을 전부 롤백한다", async () => {
  const input = await addFixture(); const before = await existingSurface();
  input.blobs.set("second/en.json", '"' + 'a'.repeat(2_000_001) + '"');
  await expect(addSurfaceFromSnapshot(prisma, input)).rejects.toThrow("resource limits");
  expect(await prisma.translationSurface.count({ where: { projectId: "add" } })).toBe(1);
  expect(await existingSurface()).toEqual(before);
});

async function creationFixture() {
  vi.resetModules();
  await prisma.user.create({ data: { id: "create-owner", email: "fixture" } });
  vi.doMock("@/auth", () => ({ auth: async () => ({ user: { id: "create-owner" } }) }));
  vi.doMock("@/lib/db", () => ({ getPrisma: () => prisma }));
  vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
  vi.doMock("@/lib/github-connect/token-store", () => ({ ensureUserToken: async () => ({ status: "ok", accessToken: "fixture" }) }));
  vi.doMock("@/lib/github-connect/user", () => ({ listUserInstallations: async () => ["77"],
    listInstallationRepos: async () => [{ fullName: "acme/web" }] }));
  const paths = ["i18n/en.json", "i18n/ko.json", "second/en.json", "second/ko.json"];
  const blobs = new Map(paths.map(path => [path, '{"hello":"Hello"}']));
  const snapshot = vi.fn(async () => ({ status: "ok", headSha: "a".repeat(40), headCommittedAt: AFTER.toISOString(),
    files: paths.map(path => ({ path, sha: path, size: 20 })) }));
  vi.doMock("@/lib/github", () => ({
    probeRepo: async () => ({ status: "ok", installationId: "77", repositoryId: "123", fullName: "acme/web", defaultBranch: "main" }),
    openRepoReader: async () => ({ snapshot, blob: async (sha: string) => blobs.get(sha) }),
  }));
  const { createProject } = await import("@/app/(edit)/projects/actions");
  const input = { slug: "create-action", name: "Create", owner: "acme", repo: "web", baseBranch: "main",
    surfaces: [
      { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" },
      { adapter: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "ko" },
    ] };
  return { createProject, input, blobs, snapshot };
}
async function expectNoCreation() {
  for (const table of ["Project", "ProjectMember", "TranslationSurface", "Locale", "StringKey", "Translation", "KeyRef"]) {
    expect((await pool.query(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count, table).toBe(0);
  }
}
it("실제 생성 Action은 두 표면의 모든 적재와 기본 포인터를 함께 커밋한다", async () => {
  const { createProject, input, snapshot } = await creationFixture();
  expect(await createProject(input)).toMatchObject({ ok: true, count: 2 });
  expect(snapshot).toHaveBeenCalledTimes(1);
  const project = await prisma.project.findUniqueOrThrow({ where: { slug: input.slug }, include: {
    defaultSurface: true, members: true, surfaces: { orderBy: { slug: "asc" }, include: { locales: true, keys: true, translations: true } },
  } });
  expect(project.id).toBeTruthy();
  expect(project.defaultSurface).toMatchObject({ projectId: project.id, slug: "i18n" });
  expect(project.members).toMatchObject([{ userId: "create-owner", role: "OWNER" }]);
  expect(project.surfaces.map(s => s.baseLocale)).toEqual(["en", "ko"]);
  for (const surface of project.surfaces) {
    expect(surface.lastCommitSha).toBe("a".repeat(40));
    expect(surface.lastImportError).toBeNull();
    expect(surface.keys).toHaveLength(1); expect(surface.locales).toHaveLength(2); expect(surface.translations).toHaveLength(2);
    expect(surface.locales.find(l => l.isBase)?.code).toBe(surface.baseLocale);
  }
});
it.each(["second-write", "last-write", "timeout"])("실제 생성의 %s 실패는 토큰 해시와 모든 자식까지 롤백한다", async kind => {
  const { createProject, input } = await creationFixture();
  if (kind === "timeout") {
    await pool.query(`CREATE FUNCTION fail_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(31); RETURN NEW; END $$;
      CREATE TRIGGER fail_create BEFORE INSERT ON "Translation" FOR EACH STATEMENT EXECUTE FUNCTION fail_create()`);
  } else if (kind === "second-write") {
    await pool.query(`CREATE FUNCTION fail_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM "TranslationSurface" WHERE id=NEW."surfaceId" AND slug='second') THEN RAISE EXCEPTION 'second write'; END IF;
      RETURN NEW; END $$; CREATE TRIGGER fail_create BEFORE INSERT ON "Translation" FOR EACH ROW EXECUTE FUNCTION fail_create()`);
  } else {
    await pool.query(`CREATE FUNCTION fail_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deferred last write'; END $$;
      CREATE CONSTRAINT TRIGGER fail_create AFTER INSERT ON "ProjectMember" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_create()`);
  }
  expect(await createProject(input)).toMatchObject({ ok: false, error: "ingest-failed" });
  await expectNoCreation();
}, 45_000);
it.each(["missing", "partial", "conflict"])("실제 Action의 %s 준비 거부는 PG에 아무 행도 남기지 않는다", async kind => {
  const { createProject, input, blobs } = await creationFixture();
  if (kind === "missing") blobs.delete("second/ko.json");
  if (kind === "partial") blobs.set("second/ko.json", '{"hello":"Hello","bad":12}');
  if (kind === "conflict") input.surfaces[1] = input.surfaces[0]!;
  expect(await createProject(input)).toMatchObject({ ok: false });
  await expectNoCreation();
});
it("같은 사용자의 동시 생성은 OWNER 한도를 넘지 않고 같은 slug는 하나만 성공한다", async () => {
  const { createProject, input } = await creationFixture();
  const same = await Promise.all([createProject(input), createProject(input)]);
  expect(same.filter(r => r.ok)).toHaveLength(1);
  expect(same.find(r => !r.ok)).toMatchObject({ error: "slug-taken" });
  const results = await Promise.all([1, 2, 3].map(n => createProject({ ...input, slug: `project-${n}` })));
  expect(results.filter(r => r.ok)).toHaveLength(2);
  expect(results.find(r => !r.ok)).toMatchObject({ error: "limit-reached" });
  expect(await prisma.project.count()).toBe(3);
});

it("별도 연결에는 적재 중인 부분 프로젝트가 보이지 않는다", async () => {
  const { createProject, input } = await creationFixture();
  const blocker = await pool.connect();
  await blocker.query("SELECT pg_advisory_lock(718241)");
  await pool.query(`CREATE FUNCTION wait_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock(718241); RETURN NEW; END $$;
    CREATE TRIGGER wait_create BEFORE INSERT ON "Translation" FOR EACH STATEMENT EXECUTE FUNCTION wait_create()`);
  const pending = createProject(input);
  try {
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event = 'advisory'");
      if (state.rowCount) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await expectNoCreation();
  } finally {
    await blocker.query("SELECT pg_advisory_unlock(718241)"); blocker.release();
  }
  expect(await pending).toMatchObject({ ok: true });
  expect(await prisma.translation.count()).toBe(4);
});

/**
 * **Home의 할 일 항목과 `To review` 카드가 같은 로케일 집합을 센다** (project-home — code-review 🔴1).
 *
 * ⚠️ **orphaned 로케일은 일이 아니다.** 그 파일은 리포에서 사라졌고 번역 화면에서 그 행의 입력이
 * `disabled`다(ARCHITECTURE §5.5.16) — 항목으로 세우면 번역자를 **편집할 수 없는 행**으로 데려간다.
 * `foldCells`는 이미 그것을 빼므로, 이 조회가 안 빼면 **pill의 수와 카드의 수가 어긋난다.**
 */
it("검토 항목이 orphaned 로케일을 빼고 `reviewByLocale`과 같은 답을 낸다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });
  // `ko`는 살아 있고 `fr`은 리포에서 사라졌다 — 둘 다 검토 대기 셀을 든다.
  await prisma.locale.create({ data: { projectId: "p1", surfaceId: "surface-p1", code: "fr", name: "French", isBase: false, orphaned: true } });
  for (const key of ["old", "same", "new"]) {
    await prisma.translation.create({ data: { projectId: "p1", surfaceId: "surface-p1", keyId: `p1-${key}`,
      localeCode: "fr", value: "valeur", needsReview: true, updatedBy: "u1", updatedAt: AFTER } });
  }
  await prisma.translation.updateMany({ where: { projectId: "p1", localeCode: "ko" }, data: { needsReview: true } });

  const rows = await loadReviewAttention(prisma, "p1");
  const aggregates = await loadProjectListAggregates(prisma, ["p1"]);
  const byLocale = reviewByLocale(aggregates.locales, aggregates.cells).get("p1") ?? [];

  expect(rows.map((r) => r.localeCode)).toEqual(["ko"]);
  expect(rows.map((r) => r.count)).toEqual(byLocale.map((l) => l.count));
  expect(byLocale.map((l) => l.code)).toEqual(["ko"]);
});

/** ⚠️ 보조 키가 없으면 같은 시각의 편집 둘 중 어느 저자가 뽑힐지가 요청마다 달라진다. */
it("검토 항목의 대표 행이 결정적이다 — 같은 시각이면 keyId 순이다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });
  await prisma.translation.updateMany({ where: { projectId: "p1", localeCode: "ko" },
    data: { needsReview: true, updatedAt: AFTER, updatedBy: "u-late" } });
  await prisma.translation.update({ where: { keyId_localeCode: { keyId: "p1-new", localeCode: "ko" } },
    data: { updatedBy: "u-first" } });

  const first = await loadReviewAttention(prisma, "p1");
  const again = await loadReviewAttention(prisma, "p1");
  expect(first).toEqual(again);
  // `p1-gone`·`p1-new`·`p1-old`·`p1-same` 중 orphaned 키는 빠지고 남은 셋의 최소 keyId가 `p1-new`다.
  expect(first[0]).toMatchObject({ localeCode: "ko", updatedBy: "u-first", count: 3 });
});
