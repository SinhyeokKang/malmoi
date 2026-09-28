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
import { readDiscardApproval } from "@/lib/import/approval";
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { applyPush } from "@/lib/push/apply";
import { hashPushToken } from "@/lib/push/token";

/**
 * **폐기 승인은 승인한 리포·브랜치에만 통한다** (audit #3). `runRepositoryImport`는 실행 **시점**의 Project로 `repository`를 만들어
 * 넘기므로 승인과 실행 사이에 설정이 바뀌면 `repo-replaced`가 안 선다 — 그 틈을 지문이 막는다. 각 거부 줄은 새 지문 → 적용 대조를 든다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 공유 dev/prod 접속 변수는 읽지 않는다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-discard-approval-"));
let binaries: string;
const PORT = 55561;
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

const commitAt = "2026-09-15T00:00:00Z";
const LOCALES = ["en", "ko", "fr"];

async function editedFixture() {
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken("fixture-token"),
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" } },
  } });
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
    projectSlug: "fixture", surfaceSlug: "default", commitSha: "b".repeat(40), commitAt,
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: LOCALES, keys: [{ key: "key0", namespace: "_root", sourceText: "Source" }],
    translations: LOCALES.map(locale => ({ key: "key0", locale, value: "CI" })), refs: [],
  }, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
  await pool.query(`UPDATE "Translation" SET "value" = 'Edited', "updatedBy" = 'owner', "pendingEditToken" = 'tok-' || "localeCode" WHERE "projectId" = 'p' AND "localeCode" = 'ko'`);
}

function reader(): RepoReader {
  return {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha: "c".repeat(40), headCommittedAt: commitAt,
      files: LOCALES.map(locale => ({ path: `i18n/${locale}.json`, sha: locale, size: 100 })) })),
    blob: vi.fn().mockResolvedValue('{"key0":"Repository"}'),
  };
}
const approve = async () => (await readDiscardApproval(prisma, { projectId: "p", userId: "owner" })).fingerprint;
/** Action과 같이 **실행 시점의** Project로 `repository`를 만든다 — 그래서 설정 변경 뒤에도 `repo-replaced`가 안 선다. */
async function run(approval: string | null) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: "p" } });
  const repository = { repositoryId: project.repositoryId!, installationId: project.installationId!, repoOwner: project.repoOwner, repoName: project.repoName, baseBranch: project.baseBranch };
  return runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval, tokenId: undefined }, async () => reader());
}
const ko = () => prisma.translation.findFirstOrThrow({ where: { projectId: "p", localeCode: "ko" }, select: { value: true, updatedBy: true, pendingEditToken: true } });

it("[audit #3] main 기준 승인 뒤 기준 브랜치를 release로 바꾸면 reconfirm이고 편집이 남는다 — 새 지문이면 적용", async () => {
  await editedFixture();
  const stale = await approve();
  await prisma.project.update({ where: { id: "p" }, data: { baseBranch: "release" } });
  expect(await run(stale)).toEqual({ ok: false, error: "reconfirm" });
  expect(await ko()).toEqual({ value: "Edited", updatedBy: "owner", pendingEditToken: "tok-ko" });
  expect(await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).toMatchObject({ repositoryImportToken: null });
  expect(await run(await approve())).toMatchObject({ ok: true, remainingEdits: 0, surfaces: [{ status: "imported" }] });
  expect(await ko()).toEqual({ value: "Repository", updatedBy: null, pendingEditToken: null });
});

it("[audit #3] 승인 뒤 리포 재연결(owner·name·id·설치)도 reconfirm이다", async () => {
  await editedFixture();
  const stale = await approve();
  await prisma.project.update({ where: { id: "p" }, data: { repoOwner: "o2", repoName: "r2", repositoryId: "999", installationId: "789" } });
  expect(await run(stale)).toEqual({ ok: false, error: "reconfirm" });
  expect(await ko()).toMatchObject({ value: "Edited", pendingEditToken: "tok-ko" });
});

it("[audit #3] 설정이 그대로면 같은 승인이 통한다 — 편집 0건이면 승인 없이도 일반 Sync다", async () => {
  await editedFixture();
  expect(await run(await approve())).toMatchObject({ ok: true, remainingEdits: 0 });
  await prisma.project.update({ where: { id: "p" }, data: { baseBranch: "release" } });
  expect(await run(null)).toMatchObject({ ok: true, remainingEdits: 0 });
});
