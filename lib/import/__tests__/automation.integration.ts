import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import type { RepoReader } from "@/lib/github";
import { runAutomationImport } from "@/lib/import/run";
import { applyPush } from "@/lib/push/apply";

/**
 * **서버 적재의 자동화 갈래** (nightly-sync C1). 사용자 없이 도는 적재가 편집을 덮지 않는가 — 잠금 안 사전 판정(`pending-edits`)과
 * **표면별 사후 재집계**(표면 트랜잭션 사이에 들어온 저장)가 그 두 방어선이다. 예산 초과는 `too-large` 보류이고 표면 실패 상태를 안 쓴다.
 *
 * Unix 소켓 전용 새 클러스터. `DATABASE_URL`·`DIRECT_URL`을 절대 읽지 않는다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-automation-import-"));
let binaries: string;
const PORT = 55601;
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
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };
const OLD = "a".repeat(40);
const HEAD = "c".repeat(40);
const oldAt = new Date("2026-09-10T00:00:00Z");
const headAt = "2026-09-15T00:00:00Z";
const LOCALES = ["en", "ko"] as const;
const SURFACES = ["a", "b"] as const;

async function seed() {
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository,
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: SURFACES.map(slug => ({ id: `s-${slug}`, slug, adapterName: "json-catalog", pathTemplate: `i18n/${slug}/{locale}.json`,
      baseLocale: "en", lastCommitSha: OLD, lastCommitAt: oldAt })) },
  } });
  // 기존 값 — CI가 한 번 적재한 상태.
  for (const slug of SURFACES) {
    await applyPush(prisma, { projectId: "p", surfaceId: `s-${slug}` }, {
      projectSlug: "fixture", surfaceSlug: slug, commitSha: OLD, commitAt: oldAt.toISOString(),
      format: { adapter: "json-catalog", pathTemplate: `i18n/${slug}/{locale}.json`, baseLocale: "en", nested: false },
      locales: [...LOCALES], keys: [{ key: "hello", namespace: "_root", sourceText: "Old" }],
      translations: LOCALES.map(locale => ({ key: "hello", locale, value: "Old" })), refs: [],
    }, { token: "seed", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
  }
}

/** 표면·로케일마다 파일 하나. `onBlob`이 blob 읽기 **전에** 돈다 — 표면 트랜잭션 사이에 저장을 끼우는 자리다. */
function reader(options: { onBlob?: (slug: string) => Promise<void>; size?: number } = {}): RepoReader {
  return {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({
      status: "ok", headSha: HEAD, headCommittedAt: headAt,
      files: SURFACES.flatMap(slug => LOCALES.map(locale => ({ path: `i18n/${slug}/${locale}.json`, sha: `${slug}:${locale}`, size: options.size ?? 100 }))),
    })),
    blob: vi.fn(async (sha: string) => {
      const slug = sha.split(":")[0] ?? "";
      await options.onBlob?.(slug);
      return '{"hello":"Repository"}';
    }),
  };
}

const run = (repo: RepoReader) => runAutomationImport(prisma, { projectId: "p", repository }, async () => repo);

/** 편집 저장 한 번 — 셀 값과 편집 토큰을 함께 쓴다(`saveTranslationKey`가 남기는 모양). */
async function edit(slug: string) {
  const key = await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", surfaceId: `s-${slug}`, key: "hello" } });
  await prisma.translation.update({ where: { keyId_localeCode: { keyId: key.id, localeCode: "ko" } },
    data: { value: "Edited", updatedBy: "owner", pendingEditToken: `edit-${slug}` } });
}
const koValue = async (slug: string) => {
  const key = await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", surfaceId: `s-${slug}`, key: "hello" } });
  return (await prisma.translation.findUniqueOrThrow({ where: { keyId_localeCode: { keyId: key.id, localeCode: "ko" } } })).value;
};
const surface = (slug: string) => prisma.translationSurface.findUniqueOrThrow({ where: { id: `s-${slug}` } });
const events = () => prisma.projectEvent.findMany({ where: { projectId: "p", kind: "IMPORT" }, orderBy: { occurredAt: "asc" } });

it("pending 0 → 적재하고 표면마다 lastCommitSha·lastCommitAt이 head로 전진한다", async () => {
  await seed();
  expect(await run(reader())).toEqual({ recorded: true, result: "imported", deferReason: null });
  for (const slug of SURFACES) {
    expect(await koValue(slug)).toBe("Repository");
    expect(await surface(slug)).toMatchObject({ lastCommitSha: HEAD, lastCommitAt: new Date(headAt), lastImportError: null });
  }
});

it("사건은 AUTOMATION · import.nightly · source nightly 한 행이다", async () => {
  await seed();
  await run(reader());
  const rows = await events();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ actorKind: "AUTOMATION", actorUserId: null, subtype: "import.nightly", result: "imported" });
  expect(rows[0]?.finishedAt).not.toBeNull();
  expect(rows[0]?.payload).toMatchObject({ source: "nightly", surfaceSlugs: ["a", "b"], deferReason: null });
});

it("시작 전 미전달 편집 → deferred pending-edits, 아무것도 안 덮고 표면도 안 움직인다", async () => {
  await seed();
  await edit("a");
  const repo = reader();
  expect(await run(repo)).toEqual({ recorded: true, result: "deferred", deferReason: "pending-edits" });
  expect(await koValue("a")).toBe("Edited");
  expect(await koValue("b")).toBe("Old");
  expect(await surface("b")).toMatchObject({ lastCommitSha: OLD });
  expect(repo.snapshot).not.toHaveBeenCalled();
  const rows = await events();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ actorKind: "AUTOMATION", subtype: "import.nightly", result: "deferred" });
  expect(rows[0]?.payload).toMatchObject({ source: "nightly", deferReason: "pending-edits", pendingEdits: 1 });
});

it("첫 표면 트랜잭션 전에 저장 → 첫 표면 롤백 · 뒤 표면 미시작 · deferred pending-edits", async () => {
  await seed();
  let saved = false;
  const repo = reader({ onBlob: async slug => { if (slug === "a" && !saved) { saved = true; await edit("a"); } } });
  expect(await run(repo)).toEqual({ recorded: true, result: "deferred", deferReason: "pending-edits" });
  expect(await koValue("a")).toBe("Edited");
  expect(await koValue("b")).toBe("Old");
  expect(await surface("a")).toMatchObject({ lastCommitSha: OLD, lastImportError: null });
  expect(await surface("b")).toMatchObject({ lastCommitSha: OLD });
  expect((await events())[0]?.payload).toMatchObject({ deferReason: "pending-edits" });
});

it("두 번째 표면 트랜잭션 전에 저장 → 첫 표면만 커밋 · 결과 partial · 편집은 안 덮인다", async () => {
  await seed();
  let saved = false;
  const repo = reader({ onBlob: async slug => { if (slug === "b" && !saved) { saved = true; await edit("b"); } } });
  expect(await run(repo)).toEqual({ recorded: true, result: "partial", deferReason: null });
  expect(await koValue("a")).toBe("Repository");
  expect(await surface("a")).toMatchObject({ lastCommitSha: HEAD });
  expect(await koValue("b")).toBe("Edited");
  expect(await surface("b")).toMatchObject({ lastCommitSha: OLD, lastImportError: null });
  expect((await events())[0]).toMatchObject({ result: "partial" });
});

it("다른 표면의 편집도 뒤 표면을 멈춘다 — 재집계는 프로젝트 전체다", async () => {
  await seed();
  let saved = false;
  const repo = reader({ onBlob: async slug => { if (slug === "b" && !saved) { saved = true; await edit("a"); } } });
  expect(await run(repo)).toEqual({ recorded: true, result: "partial", deferReason: null });
  // 이미 커밋된 a는 편집 뒤에 저장된 값이 그대로 남는다 — 적재가 그 셀을 다시 덮지 않는다.
  expect(await koValue("a")).toBe("Edited");
  expect(await surface("b")).toMatchObject({ lastCommitSha: OLD });
});

it("resource-limit → deferred too-large, 표면 lastImportError를 쓰지 않는다", async () => {
  await seed();
  expect(await run(reader({ size: 20_000_000 }))).toEqual({ recorded: true, result: "deferred", deferReason: "too-large" });
  for (const slug of SURFACES) {
    expect(await surface(slug)).toMatchObject({ lastImportError: null, lastImportFailedAt: null, lastCommitSha: OLD });
    expect(await koValue(slug)).toBe("Old");
  }
  const rows = await events();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ result: "deferred", subtype: "import.nightly" });
  expect(rows[0]?.payload).toMatchObject({ deferReason: "too-large" });
});

it("already-running → 사건 0행, 아무것도 안 쓴다", async () => {
  await seed();
  await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "other", repositoryImportStartedAt: new Date() } });
  const repo = reader();
  expect(await run(repo)).toEqual({ recorded: false, error: "already-running" });
  expect(await events()).toHaveLength(0);
  expect(repo.snapshot).not.toHaveBeenCalled();
});

it("실행 뒤 실행권 표시를 지운다 — 다음 수동 Sync가 already-running을 안 받는다", async () => {
  await seed();
  await run(reader());
  expect(await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).toMatchObject({ repositoryImportToken: null, repositoryImportStartedAt: null });
});
