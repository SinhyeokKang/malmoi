import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { loadPullState, saveLastPulledAt } from "@/lib/pull/load";
import { applyProtectedPush, applyPush } from "@/lib/push/apply";
import { hashPushToken } from "@/lib/push/token";
import { countUnpublished, loadKeys, loadProjectListAggregates } from "@/lib/keys/query";
import { isUnpublished } from "@/lib/keys/view";
import { backfillPendingEditTokens } from "@/lib/protection/backfill";

/**
 * **sync-edit-protection의 조건부 쓰기를 실제 PostgreSQL로 잰다.**
 *
 * ⚠️ **이 파일이 `lib/keys/__tests__/`에 있는 이유는 코드 위치가 아니라** `vitest.projects.config.ts`의 include가
 * 이 디렉터리로 박혀 있어서다 — 다른 곳에 두면 조용히 0건 수집된다 (2026-09-10).
 *
 * ⚠️ **"0행/불변" 단언마다 같은 픽스처의 양성 대조를 둔다** (POSTMORTEM 2026-09-14 "방어선 셋 다 지워도 green").
 * 조건부 UPDATE는 조건이 틀려도 에러 없이 0행이라, 대조가 없으면 경로가 안 돌아도 참이다.
 */

// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-protection-"));
let binaries: string;
const PORT = 55485;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

/** 배포 B의 precondition 마이그레이션 — 이름 접미로 찾는다(타임스탬프는 생성 시각이다). */
const PRECONDITION_SUFFIX = "_pending_edit_token_precondition";

/**
 * @param beforePrecondition 참이면 precondition 마이그레이션 **앞에서 멈춘다.** 픽스처가 매번 전체 마이그레이션을 재생하므로
 *   빈 DB에서는 precondition이 언제나 통과한다 — 실제로 던지는지 보려면 데이터를 심은 뒤 그 SQL만 따로 돌려야 한다.
 */
async function resetSchema(beforePrecondition = false) {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    if (beforePrecondition && name.endsWith(PRECONDITION_SUFFIX)) break;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}

function preconditionSql(): string {
  const name = readdirSync("prisma/migrations").find(n => n.endsWith(PRECONDITION_SUFFIX));
  if (name === undefined) throw new Error("precondition migration missing");
  return readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8");
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
const COMMIT_AT = "2026-09-12T00:00:00Z";

type CellSpec = { key: string; locale: string; value?: string; updatedBy?: string | null; updatedAt?: Date; token?: string | null };

/**
 * 프로젝트 하나 · 표면 하나 · 로케일 `en`·`ko`·`fr` + orphan 로케일 `gone` · 키 `k1`·`k2` + orphan 키 `k3`.
 * 셀은 호출부가 정한다 — 무엇이 활성 셀이고 무엇이 제외 대상인지가 테스트마다 다르다.
 */
async function seed(projectId: string, input: { lastPulledAt: Date | null; cells: CellSpec[] }) {
  const surfaceId = `surface-${projectId}`;
  await prisma.project.create({ select: { id: true }, data: { id: projectId, slug: projectId, name: projectId, repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", lastPulledAt: input.lastPulledAt } });
  await prisma.translationSurface.create({ data: { id: surfaceId, projectId, slug: "default",
    adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en", lastCommitAt: BEFORE } });
  await prisma.project.update({ select: { id: true }, where: { id: projectId }, data: { defaultSurfaceId: surfaceId } });
  await prisma.locale.createMany({ data: [
    ...["en", "ko", "fr"].map(code => ({ projectId, surfaceId, code, name: code, isBase: code === "en", orphaned: false })),
    { projectId, surfaceId, code: "gone", name: "gone", isBase: false, orphaned: true },
  ] });
  for (const key of ["k1", "k2", "k3"]) {
    await prisma.stringKey.create({ data: { id: `${projectId}-${key}`, projectId, surfaceId, key, namespace: "_root",
      sourceText: key, sourceHash: key, orphaned: key === "k3" } });
  }
  for (const cell of input.cells) {
    await prisma.translation.create({ data: {
      id: cellId(projectId, cell.key, cell.locale), projectId, surfaceId, keyId: `${projectId}-${cell.key}`, localeCode: cell.locale,
      value: cell.value ?? `${cell.key}-${cell.locale}`, updatedBy: cell.updatedBy === undefined ? "editor" : cell.updatedBy,
      pendingEditToken: cell.token ?? null,
    } });
    // `@updatedAt`이 create 값을 덮으므로 시각은 SQL로 박는다.
    await pool.query(`UPDATE "Translation" SET "updatedAt" = $1 WHERE "id" = $2`, [cell.updatedAt ?? AFTER, cellId(projectId, cell.key, cell.locale)]);
  }
}

const cellId = (projectId: string, key: string, locale: string) => `${projectId}-${key}-${locale}`;

async function cell(projectId: string, key: string, locale: string) {
  const { rows } = await pool.query<{ value: string; updatedBy: string | null; pendingEditToken: string | null }>(
    // 키·로케일로 찾는다 — 적재가 만든 행은 id가 UUID다.
    `SELECT "value", "updatedBy", "pendingEditToken" FROM "Translation" WHERE "keyId" = $1 AND "localeCode" = $2`, [`${projectId}-${key}`, locale]);
  return rows[0];
}

/** 편집 저장을 흉내 낸다 — `saveTranslation`의 upsert와 같은 컬럼을 같은 문장에서 쓴다. */
async function resave(projectId: string, key: string, locale: string, value: string, token: string, updatedAt?: Date) {
  await pool.query(`UPDATE "Translation" SET "value" = $1, "updatedBy" = 'editor', "pendingEditToken" = $2, "updatedAt" = COALESCE($3, now()) WHERE "id" = $4`,
    [value, token, updatedAt ?? null, cellId(projectId, key, locale)]);
}

function payload(projectId: string, translations: { key: string; locale: string; value: string }[]) {
  return { projectSlug: projectId, surfaceSlug: "default", commitSha: "b".repeat(40), commitAt: COMMIT_AT,
    format: { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko", "fr"],
    keys: ["k1", "k2"].map(key => ({ key, namespace: "_root", sourceText: key })),
    translations, refs: [] };
}

describe("적재의 토큰 정리 (T4)", () => {
  it("[C4] 승인된 토큰의 셀만 덮고 토큰을 비운다 — 페이로드에 없는 셀(실패 파일)은 토큰 유지", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [
      { key: "k1", locale: "ko", token: "tok-ko" },
      { key: "k1", locale: "fr", token: "tok-fr" },
    ] });
    await applyPush(prisma, { projectId: "p", surfaceId: "surface-p" }, payload("p", [{ key: "k1", locale: "ko", value: "repo" }]),
      { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace", approvedTokens: ["tok-ko", "tok-fr"] });

    // 덮인 셀 → null (대조: 안 덮인 셀 → 유지)
    expect(await cell("p", "k1", "ko")).toEqual({ value: "repo", updatedBy: null, pendingEditToken: null });
    expect(await cell("p", "k1", "fr")).toMatchObject({ value: "k1-fr", updatedBy: "editor", pendingEditToken: "tok-fr" });
  });

  it("[C1] 승인 없는 적재는 토큰 있는 셀을 덮지 않는다 (위 승인 → 덮임 대조)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", token: "tok-ko" }] });
    await applyPush(prisma, { projectId: "p", surfaceId: "surface-p" }, payload("p", [{ key: "k1", locale: "ko", value: "repo" }]),
      { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
    expect(await cell("p", "k1", "ko")).toEqual({ value: "k1-ko", updatedBy: "editor", pendingEditToken: "tok-ko" });
  });

  it("적재가 새로 만든 셀은 토큰이 없다", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [] });
    await applyPush(prisma, { projectId: "p", surfaceId: "surface-p" }, payload("p", [{ key: "k2", locale: "ko", value: "repo" }]),
      { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
    expect(await cell("p", "k2", "ko")).toEqual({ value: "repo", updatedBy: null, pendingEditToken: null });
  });
});

describe("Publish 캡처와 전달 확인 CAS (T4)", () => {
  const cells: CellSpec[] = [
    { key: "k1", locale: "ko", token: "tok-1" },
    { key: "k2", locale: "ko", token: "tok-2" },
    // 제외 대상 — orphan 키 · orphan 로케일의 편집은 캡처하지도 해제하지도 않는다 [C9]
    { key: "k3", locale: "ko", token: "tok-orphan-key" },
    { key: "k1", locale: "gone", token: "tok-orphan-locale" },
    // 배포 A 이전 편집 — 토큰이 없다
    { key: "k2", locale: "fr", value: "legacy", token: null },
  ];

  it("[C9] 캡처는 활성 셀의 (id, token)만 담는다 — orphan 키·로케일과 토큰 없는 셀은 없다", async () => {
    await seed("p", { lastPulledAt: PULLED, cells });
    const state = await loadPullState(prisma, "p");
    expect([...state.pendingEdits].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: cellId("p", "k1", "ko"), token: "tok-1" },
      { id: cellId("p", "k2", "ko"), token: "tok-2" },
    ]);
  });

  it("committed → 캡처 토큰만 null, 제외 셀의 값·저자·토큰은 불변", async () => {
    await seed("p", { lastPulledAt: PULLED, cells });
    const state = await loadPullState(prisma, "p");
    await saveLastPulledAt(prisma, "p", AFTER, { prUrl: "https://github.com/o/r/pull/1" }, state.pendingEdits);

    expect((await cell("p", "k1", "ko"))?.pendingEditToken).toBeNull();
    expect((await cell("p", "k2", "ko"))?.pendingEditToken).toBeNull();
    expect(await cell("p", "k3", "ko")).toMatchObject({ updatedBy: "editor", pendingEditToken: "tok-orphan-key" });
    expect(await cell("p", "k1", "gone")).toMatchObject({ updatedBy: "editor", pendingEditToken: "tok-orphan-locale" });
    expect(await cell("p", "k2", "fr")).toEqual({ value: "legacy", updatedBy: "editor", pendingEditToken: null });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).toMatchObject({ lastPulledAt: AFTER, lastPrUrl: "https://github.com/o/r/pull/1" });
  });

  it("no-changes(published 없음) → 캡처 토큰 null, 캡처 뒤 생긴 편집은 유지", async () => {
    await seed("p", { lastPulledAt: PULLED, cells });
    const state = await loadPullState(prisma, "p");
    // 캡처 밖 셀 — 스냅샷 뒤 처음 편집된 셀
    await resave("p", "k2", "fr", "after-capture", "tok-late");
    await saveLastPulledAt(prisma, "p", AFTER, undefined, state.pendingEdits);

    expect((await cell("p", "k1", "ko"))?.pendingEditToken).toBeNull();
    expect(await cell("p", "k2", "fr")).toMatchObject({ value: "after-capture", pendingEditToken: "tok-late" });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).lastPublishedAt).toBeNull();
  });

  it("[C7] Publish 도중 같은 셀 재저장(동일 ms) → 새 토큰 유지, 같은 캡처의 다른 셀은 해제", async () => {
    await seed("p", { lastPulledAt: PULLED, cells });
    const state = await loadPullState(prisma, "p");
    // barrier: 캡처와 해제 사이에 저장이 커밋된다. updatedAt을 그대로 두어 시각으로는 구별이 불가능하게 만든다.
    await resave("p", "k1", "ko", "edited-again", "tok-1b", AFTER);
    await saveLastPulledAt(prisma, "p", AFTER, { prUrl: "u" }, state.pendingEdits);

    expect(await cell("p", "k1", "ko")).toMatchObject({ value: "edited-again", pendingEditToken: "tok-1b" });
    expect((await cell("p", "k2", "ko"))?.pendingEditToken).toBeNull();
  });

  it("다른 프로젝트의 같은 토큰 값은 건드리지 않는다 — 해제가 projectId로 좁혀진다", async () => {
    await seed("a", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", token: "same" }] });
    await seed("b", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", token: "same" }] });
    const state = await loadPullState(prisma, "a");
    // 다른 프로젝트의 행 id를 섞어 넣어도 해제되지 않아야 한다
    await saveLastPulledAt(prisma, "a", AFTER, undefined, [...state.pendingEdits, { id: cellId("b", "k1", "ko"), token: "same" }]);

    expect((await cell("a", "k1", "ko"))?.pendingEditToken).toBeNull();
    expect((await cell("b", "k1", "ko"))?.pendingEditToken).toBe("same");
  });
});

/**
 * 옛 술어(저자·시각) ∧ 활성 셀. backfill 전후의 **양방향 동등성**을 이 SQL로 잰다 — ARCHITECTURE §3의 "유령 pending"
 * (토큰은 있는데 옛 술어는 0)을 잡는 유일한 그물이다.
 */
async function oldPredicateIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(`
    SELECT t."id" FROM "Translation" t
    JOIN "Project" p ON p."id" = t."projectId"
    JOIN "TranslationSurface" s ON s."projectId" = t."projectId" AND s."id" = t."surfaceId"
    JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
    JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
    WHERE t."updatedBy" IS NOT NULL AND (p."lastPulledAt" IS NULL OR t."updatedAt" > p."lastPulledAt")
      AND s."archivedAt" IS NULL AND k."orphaned" = false AND l."orphaned" = false
    ORDER BY t."id"`);
  return rows.map(r => r.id);
}

async function activeTokenIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(`
    SELECT t."id" FROM "Translation" t
    JOIN "TranslationSurface" s ON s."projectId" = t."projectId" AND s."id" = t."surfaceId"
    JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k."id" = t."keyId"
    JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l."code" = t."localeCode"
    WHERE t."pendingEditToken" IS NOT NULL AND s."archivedAt" IS NULL AND k."orphaned" = false AND l."orphaned" = false
    ORDER BY t."id"`);
  return rows.map(r => r.id);
}

describe("backfill (T5)", () => {
  const mixed: CellSpec[] = [
    { key: "k1", locale: "ko", updatedAt: AFTER, token: null },            // 대상 → 발급
    { key: "k1", locale: "fr", updatedAt: AFTER, token: "dual-written" },  // 이미 토큰 → 재발급 0
    { key: "k2", locale: "ko", updatedAt: BEFORE, token: null },           // pull 이전 편집 → 대상 아님
    { key: "k2", locale: "fr", updatedAt: AFTER, updatedBy: null },        // push가 쓴 행 → 대상 아님
    { key: "k3", locale: "ko", updatedAt: AFTER, token: null },            // orphan 키 → 발급 0
    { key: "k1", locale: "gone", updatedAt: AFTER, token: null },          // orphan 로케일 → 발급 0
  ];

  it("[C9] 첫 실행 > 0행 · 둘째 0행, 뒤에 활성 토큰 집합 = 옛 술어 집합 (양방향)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: mixed });
    expect(await activeTokenIds()).not.toEqual(await oldPredicateIds()); // 전: 토큰 없는 기존-미전달이 있다

    expect(await backfillPendingEditTokens(prisma)).toBe(1);
    expect(await backfillPendingEditTokens(prisma)).toBe(0);

    expect(await activeTokenIds()).toEqual(await oldPredicateIds());
    expect(await oldPredicateIds()).toEqual([cellId("p", "k1", "fr"), cellId("p", "k1", "ko")]);
  });

  it("[C9] orphan 키·로케일은 값·저자 불변 + 토큰 발급 0 (같은 픽스처의 활성 셀은 발급 > 0)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: mixed });
    await backfillPendingEditTokens(prisma);

    expect(await cell("p", "k3", "ko")).toEqual({ value: "k3-ko", updatedBy: "editor", pendingEditToken: null });
    expect(await cell("p", "k1", "gone")).toEqual({ value: "k1-gone", updatedBy: "editor", pendingEditToken: null });
    expect((await cell("p", "k1", "ko"))?.pendingEditToken).toEqual(expect.any(String));
  });

  it("이미 토큰 있는 행은 재발급 0 (같은 픽스처의 토큰 없는 행은 발급 > 0)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: mixed });
    await backfillPendingEditTokens(prisma);
    expect((await cell("p", "k1", "fr"))?.pendingEditToken).toBe("dual-written");
    expect((await cell("p", "k1", "ko"))?.pendingEditToken).not.toBeNull();
  });

  it("lastPulledAt이 null이면 사람이 만진 활성 행이 전부 대상이다", async () => {
    await seed("p", { lastPulledAt: null, cells: [
      { key: "k1", locale: "ko", updatedAt: BEFORE },
      { key: "k2", locale: "ko", updatedAt: BEFORE, updatedBy: null },
    ] });
    expect(await backfillPendingEditTokens(prisma)).toBe(1);
    expect((await cell("p", "k2", "ko"))?.pendingEditToken).toBeNull();
  });

  it("A/B 격리 — A에만 대상이 있을 때 B의 행 불변 (A는 변경 > 0)", async () => {
    await seed("a", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", updatedAt: AFTER }] });
    await seed("b", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", updatedAt: BEFORE }, { key: "k2", locale: "ko", updatedAt: AFTER, updatedBy: null }] });
    const before = await prisma.translation.findMany({ where: { projectId: "b" }, orderBy: { id: "asc" } });

    expect(await backfillPendingEditTokens(prisma)).toBeGreaterThan(0);
    expect(await prisma.translation.findMany({ where: { projectId: "b" }, orderBy: { id: "asc" } })).toEqual(before);
    expect((await cell("a", "k1", "ko"))?.pendingEditToken).not.toBeNull();
  });

  /**
   * ⚠️ **ARCHITECTURE §3의 유령 pending.** 배포 A 기간에 편집 → 원복 → cron이 2층 `no-changes`로 끝나면 옛 술어는
   * `lastPulledAt` 전진으로 0이 된다. 그 경로가 캡처를 해제하지 않으면 토큰만 남고, backfill은 더하기만 하므로 못 지운다.
   */
  it("[C5] 편집 → no-changes 전달 확인 뒤 옛 술어 0 = 활성 토큰 0 — 유령 pending이 없다", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", updatedAt: AFTER, token: "tok" }] });
    expect(await activeTokenIds()).toEqual(await oldPredicateIds()); // 전: 둘 다 1
    expect(await oldPredicateIds()).toHaveLength(1);

    const state = await loadPullState(prisma, "p");
    await saveLastPulledAt(prisma, "p", state.maxUpdatedAt!, undefined, state.pendingEdits);

    expect(await oldPredicateIds()).toEqual([]);
    expect(await activeTokenIds()).toEqual([]);
    expect(await backfillPendingEditTokens(prisma)).toBe(0);
  });
});


describe("precondition 마이그레이션 (T6)", () => {
  it("backfill 전: 토큰 없는 옛-미전달 활성 셀이 있으면 실제로 던진다 → backfill 뒤 같은 SQL은 통과한다", async () => {
    await resetSchema(true);
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", updatedAt: AFTER, token: null }] });

    await expect(pool.query(preconditionSql())).rejects.toThrow(/precondition/);
    expect(await backfillPendingEditTokens(prisma)).toBe(1);
    await expect(pool.query(preconditionSql())).resolves.toBeDefined();
  });

  it("orphan 셀·이미 보낸 셀만 있으면 통과한다 — 대상 조건이 backfill과 같다", async () => {
    await resetSchema(true);
    await seed("p", { lastPulledAt: PULLED, cells: [
      { key: "k3", locale: "ko", updatedAt: AFTER, token: null },
      { key: "k1", locale: "gone", updatedAt: AFTER, token: null },
      { key: "k1", locale: "ko", updatedAt: BEFORE, token: null },
    ] });
    await expect(pool.query(preconditionSql())).resolves.toBeDefined();
  });
});

/** 앱의 모든 테이블 — "쓰기 0회"를 행 스냅샷 동일성으로 잰다(조건부 쓰기의 0행 무음까지 포함한다). */
async function dump() {
  const out: Record<string, unknown[]> = {};
  for (const table of ["Project", "TranslationSurface", "StringKey", "Translation", "Locale", "KeyRef", "SyncRun"]) {
    out[table] = (await pool.query(`SELECT * FROM "${table}" x ORDER BY x::text`)).rows;
  }
  return out;
}

const PUSH_TOKEN = "protection-fixture-token";
vi.doMock("@/lib/db", () => ({ getPrisma: () => prisma }));
vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function post(body: unknown) {
  const { POST } = await import("@/app/api/push/route");
  const response = await POST(new Request("http://localhost/api/push", { method: "POST", headers: { authorization: `Bearer ${PUSH_TOKEN}` }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const ciPayload = () => payload("p", [{ key: "k1", locale: "ko", value: "repo-ko" }, { key: "k2", locale: "fr", value: "repo-fr" }]);

describe("CI 적재 보류 (T7)", () => {
  async function fixture(token: string | null) {
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", value: "edited", token }] });
    await prisma.project.update({ where: { id: "p" }, data: { pushTokenHash: hashPushToken(PUSH_TOKEN) } });
  }

  it("[C1][C2] pending 1 → 200 deferred, 모든 테이블 행 불변(진행 표시·lastCommitAt 포함)", async () => {
    await fixture("tok-edit");
    const before = await dump();
    const res = await post(ciPayload());
    expect(res).toEqual({ status: 200, body: expect.objectContaining({ status: "deferred", reason: "pending-edits", pendingCount: 1 }) });
    expect(await dump()).toEqual(before);
    expect(await cell("p", "k1", "ko")).toEqual({ value: "edited", updatedBy: "editor", pendingEditToken: "tok-edit" });
  });

  it("[C3][C8] 같은 픽스처에서 편집이 전달 확인됐으면(토큰 없음) → applied, 쓰기 > 0, 진행 표시 정리", async () => {
    await fixture(null);
    const before = await dump();
    const res = await post(ciPayload());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "applied", translationsFilled: 2 });
    expect(await dump()).not.toEqual(before);
    expect(await cell("p", "k1", "ko")).toEqual({ value: "repo-ko", updatedBy: null, pendingEditToken: null });
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p" } })).toMatchObject({ lastImportStartedAt: null, lastImportToken: null, lastCommitAt: new Date(COMMIT_AT) });
  });

  it("[C2] 동시 두 CI 요청 → 둘 다 deferred, 행 불변", async () => {
    await fixture("tok-edit");
    const before = await dump();
    const results = await Promise.all([post(ciPayload()), post(ciPayload())]);
    expect(results.map(r => r.body.status)).toEqual(["deferred", "deferred"]);
    expect(await dump()).toEqual(before);
  });

  it("보관 프로젝트 + pending 1 → 409 (보류가 아니다 — 가드가 먼저다)", async () => {
    await fixture("tok-edit");
    await prisma.project.update({ where: { id: "p" }, data: { archivedAt: AFTER } });
    const res = await post(ciPayload());
    expect(res.status).toBe(409);
    expect(res.body.status).toBeUndefined();
  });

  const apply = () => applyProtectedPush(prisma, { projectId: "p", surfaceId: "surface-p" }, ciPayload(),
    { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace", importOutcome: null, pushTokenHash: hashPushToken(PUSH_TOKEN) });

  /**
   * ⚠️ **판정과 upsert 사이에 커밋된 저장** (ARCHITECTURE §5.5.2). 저장 경로엔 잠금이 없으므로, 다른 연결이 `StringKey` 행을 잠가 적용을
   * StringKey UPDATE에서 세우고(판정 count는 이미 끝났다) 그 사이에 저장을 커밋한다 — sleep이 아니라 잠금 대기가 barrier다.
   */
  it("[C1][C7] 판정 뒤·upsert 전 저장 → 재집계로 전체 롤백 → deferred, 저장한 편집 유지 (저장 없음 → applied 대조)", async () => {
    await fixture(null);
    await seed("q", { lastPulledAt: PULLED, cells: [] });
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(`UPDATE "StringKey" SET "namespace" = "namespace" WHERE "id" = 'p-k1'`);
      const running = apply();
      for (let i = 0; i < 200; i++) {
        const { rows } = await pool.query(`SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%StringKey%'`);
        if (rows[0].n > 0) break;
        await new Promise(r => setTimeout(r, 25));
      }
      await resave("p", "k1", "ko", "saved-mid-apply", "tok-mid");
      await blocker.query("COMMIT");
      expect(await running).toEqual({ status: "deferred", pendingCount: 1 });
    } finally {
      blocker.release();
    }
    expect(await cell("p", "k1", "ko")).toMatchObject({ value: "saved-mid-apply", pendingEditToken: "tok-mid" });
    // 롤백이다 — 같은 적재의 다른 셀도 안 들어갔다.
    expect(await cell("p", "k2", "fr")).toBeUndefined();
  });

  it("[C3] 같은 픽스처에서 경합이 없으면 applied", async () => {
    await fixture(null);
    expect(await apply()).toMatchObject({ status: "applied" });
    expect(await cell("p", "k2", "fr")).toMatchObject({ value: "repo-fr" });
  });

  it("[C1] CI가 먼저 커밋되고 저장이 뒤따르면 → applied + 저장 성공·토큰 유지 (양쪽 다 편집이 산다)", async () => {
    await fixture(null);
    expect(await apply()).toMatchObject({ status: "applied" });
    await resave("p", "k1", "ko", "after-ci", "tok-after");
    expect(await cell("p", "k1", "ko")).toMatchObject({ value: "after-ci", pendingEditToken: "tok-after" });
  });

  it("[C1] 토큰 있는 셀은 upsert가 건드리지 않는다 — 가드 자체 (재집계와 별개)", async () => {
    await fixture("tok-edit");
    // 판정을 우회해 가드만 본다: 승인 없는 수동 적재 경로(approvedTokens 빈 목록)로 직접 적용한다.
    await prisma.$transaction(tx => import("@/lib/push/apply").then(m => m.applyPushInTransaction(tx, { projectId: "p", surfaceId: "surface-p" }, ciPayload(),
      { token: "manual", startedAt: new Date(), previousBaseLocale: "en", refsMode: "preserve", approvedTokens: [] })));
    expect(await cell("p", "k1", "ko")).toMatchObject({ value: "edited", pendingEditToken: "tok-edit" });
    expect(await cell("p", "k2", "fr")).toMatchObject({ value: "repo-fr" });
  });
});

describe("미전달 술어 전환 — 사본 넷이 같은 행을 센다 (T8)", () => {
  const cells: CellSpec[] = [
    { key: "k1", locale: "ko", token: "t1", updatedAt: BEFORE },  // 옛 시각이어도 토큰이 있으면 미전달
    { key: "k2", locale: "fr", token: "t2", updatedBy: null },    // 저자 없어도 토큰이 판정한다
    { key: "k1", locale: "fr", token: null },                     // 전달 확인됨
    { key: "k3", locale: "ko", token: "t-orphan-key" },           // orphan 키 [C9]
    { key: "k2", locale: "gone", token: "t-orphan-locale" },      // orphan 로케일 [C9]
  ];

  it("[C9] countUnpublished ② = 목록 raw SQL ③ = 셀 isUnpublished ① = pull 1층 = 2 (활성 편집 > 0)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells });
    const counted = await countUnpublished(prisma, "p");
    const aggregate = (await loadProjectListAggregates(prisma, ["p"])).unsent.get("p") ?? 0;
    const byCell = (await loadKeys(prisma, "p", "surface-p")).flatMap(row => Object.values(row.cells)).filter(c => c !== undefined && isUnpublished(c)).length;
    const state = await loadPullState(prisma, "p");
    expect(counted).toBe(2);
    expect([aggregate, byCell, state.unpublished, state.pendingEdits.length]).toEqual([2, 2, 2, 2]);
  });

  it("[C5] pending 0이면 1층 판정값이 0이다 (pending 1 → 1 대조)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", token: null, updatedAt: AFTER }] });
    expect((await loadPullState(prisma, "p")).unpublished).toBe(0);
    await resave("p", "k1", "ko", "x", "tok");
    expect((await loadPullState(prisma, "p")).unpublished).toBe(1);
  });

  it("셀 RSC 페이로드에 토큰 원문이 없다 (`pending: true`는 있다 대조)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", token: "secret-token-value" }] });
    const serialized = JSON.stringify(await loadKeys(prisma, "p", "surface-p"));
    expect(serialized).not.toContain("secret-token-value");
    expect(serialized).not.toContain("pendingEditToken");
    expect(serialized).toContain('"pending":true');
  });
});


describe("Publish 전달 확인 실패 (T10)", () => {
  it("[C10] 해제 쓰기가 실패하면 lastPulledAt·토큰이 함께 되돌아간다 — 보낸 것으로 증명되지 않은 편집은 남는다 (성공 → 해제 대조)", async () => {
    await seed("p", { lastPulledAt: PULLED, cells: [{ key: "k1", locale: "ko", token: "tok-1" }] });
    const state = await loadPullState(prisma, "p");
    await pool.query(`CREATE FUNCTION reject_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ack failure'; END $$;
      CREATE TRIGGER reject_ack BEFORE UPDATE ON "Translation" FOR EACH STATEMENT EXECUTE FUNCTION reject_ack()`);
    await expect(saveLastPulledAt(prisma, "p", AFTER, { prUrl: "u" }, state.pendingEdits)).rejects.toThrow();
    expect((await cell("p", "k1", "ko"))?.pendingEditToken).toBe("tok-1");
    expect(await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).toMatchObject({ lastPulledAt: PULLED, lastPrUrl: null });

    await pool.query(`DROP TRIGGER reject_ack ON "Translation"`);
    await saveLastPulledAt(prisma, "p", AFTER, { prUrl: "u" }, state.pendingEdits);
    expect((await cell("p", "k1", "ko"))?.pendingEditToken).toBeNull();
  });
});

/**
 * **토큰 회전과 겹친 CI push** (launch-readiness L7.6, audit #46). 라우트는 토큰을 트랜잭션 **밖**에서 조회하므로, 조회 뒤 회전이
 * 커밋되면 옛 토큰의 push 하나가 적재될 수 있었다 — 회전의 목적(유출 토큰을 즉시 끊는다)에 창이 난다.
 * barrier는 sleep이 아니라 **Project 행 잠금**이다: 다른 연결이 그 행을 쥔 동안 라우트는 조회를 통과해 적용 잠금에서 기다리고,
 * 그 사이 회전이 커밋된다.
 */
describe("토큰 회전 경합 (L7.6)", () => {
  async function fixture() {
    await seed("p", { lastPulledAt: PULLED, cells: [] });
    await prisma.project.update({ where: { id: "p" }, data: { pushTokenHash: hashPushToken(PUSH_TOKEN) } });
  }
  async function waitForProjectLock() {
    for (let i = 0; i < 200; i++) {
      const { rows } = await pool.query(`SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%"Project"%FOR UPDATE%'`);
      if (rows[0].n > 0) return;
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error("apply never waited on the Project lock");
  }

  it("조회 뒤 회전이 커밋되면 401이고 아무것도 적재하지 않는다 — 진행 표시도 거둔다", async () => {
    await fixture();
    const blocker = await pool.connect();
    let running: ReturnType<typeof post> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
      running = post(ciPayload());
      await waitForProjectLock();
      await blocker.query(`UPDATE "Project" SET "pushTokenHash" = $1 WHERE "id" = 'p'`, [hashPushToken("rotated-token")]);
      await blocker.query("COMMIT");
    } finally {
      blocker.release();
    }
    expect(await running).toEqual({ status: 401, body: { error: "unauthorized" } });
    expect(await cell("p", "k1", "ko")).toBeUndefined();
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "surface-p" } })).toMatchObject({ lastImportToken: null, lastCommitAt: BEFORE });
  });

  it("회전이 없으면 같은 경로로 적재된다 (짝)", async () => {
    await fixture();
    const blocker = await pool.connect();
    let running: ReturnType<typeof post> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
      running = post(ciPayload());
      await waitForProjectLock();
      await blocker.query("COMMIT");
    } finally {
      blocker.release();
    }
    expect(await running).toMatchObject({ status: 200, body: { status: "applied" } });
    expect(await cell("p", "k1", "ko")).toMatchObject({ value: "repo-ko" });
  });
});
