import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import type { RepoReader } from "@/lib/github";
import { readDiscardApproval } from "@/lib/import/approval";
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { countPending } from "@/lib/protection/where";
import { hashPushToken } from "@/lib/push/token";

/**
 * **불완전 적재는 삭제를 확정하지 않는다** (audit #7). 키가 여러 파일에 나뉜 표면(ts-dict `dir/*.ts`)에서 한 파일의
 * 다운로드·파싱이 실패하면 그 파일의 키가 페이로드에서 빠진다 — 그것을 "코드에서 사라졌다"로 읽으면 orphan 표시와
 * 함께 승인 편집 토큰까지 풀린다. 각 "불변" 단언은 같은 픽스처의 깨끗한 Sync가 실제로 orphan시키는 짝을 든다
 * (POSTMORTEM 2026-09-14 "조건 불일치 0행은 조용하다").
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-import-incomplete-"));
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

const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };
const pulled = new Date("2026-09-10T00:00:00Z");

async function seed() {
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository, pushTokenHash: hashPushToken("isolated-import-incomplete"), lastPulledAt: pulled,
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "ts-dict", pathTemplate: "src/i18n/*.ts", baseLocale: "en", lastCommitSha: "a".repeat(40), lastCommitAt: pulled } },
  } });
}

const dict = (key: string, value: string) => `const en = { "${key}": "${value}" };\nconst ko = { "${key}": "${value} ko" };\nexport const ns = { en, ko };\n`;
const A = dict("a.hello", "Hello");
const B = dict("b.bye", "Bye");

let heads = 0;
/** 경로 → 내용. `undefined`는 트리에 있지만 blob을 못 받은 파일이다(재시도 포함 실패). */
function reader(files: Record<string, string | undefined>): RepoReader {
  heads += 1;
  const headSha = String(heads).padStart(40, "c");
  return {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha, headCommittedAt: new Date(Date.UTC(2026, 8, 16, 0, heads)).toISOString(),
      files: Object.keys(files).map(path => ({ path, sha: path, size: 100 })) })),
    blob: vi.fn(async (sha: string) => files[sha]),
  };
}
const sync = async (repo: RepoReader, approve = false) => {
  const approval = approve ? (await readDiscardApproval(prisma, { projectId: "p", userId: "owner" })).fingerprint : null;
  return runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval, credential: undefined }, async () => repo);
};
const keyOf = (key: string) => prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key }, select: { orphaned: true } });
const cellOf = async (key: string, locale: string) => {
  const k = await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } });
  return prisma.translation.findUnique({ where: { keyId_localeCode: { keyId: k.id, localeCode: locale } }, select: { value: true, pendingEditToken: true } });
};

describe("audit #7 — 불완전 수동 Sync의 orphan 판정", () => {
  it.each([
    ["다운로드 실패", undefined],
    ["파싱 실패", "const en = { \"b.bye\": \"Bye\" ;\nconst ko = {"],
  ])("%s로 빠진 파일의 키를 orphan시키지 않고, 승인 편집 토큰·값도 남긴다", async (_label, broken) => {
    await seed();
    expect(await sync(reader({ "src/i18n/a.ts": A, "src/i18n/b.ts": B }))).toMatchObject({ ok: true, surfaces: [{ status: "imported", count: 2 }] });
    await pool.query(`UPDATE "Translation" t SET "value" = 'Edited', "updatedBy" = 'owner', "pendingEditToken" = 'tok-' || t."localeCode"
      FROM "StringKey" k WHERE k."id" = t."keyId" AND k."key" = 'b.bye' AND t."localeCode" = 'ko'`);

    const outcome = await sync(reader({ "src/i18n/a.ts": A, "src/i18n/b.ts": broken }), true);

    expect(outcome).toMatchObject({ ok: true, surfaces: [{ status: "partial" }] });
    expect(await keyOf("b.bye")).toEqual({ orphaned: false });
    // 편집·Publish 대상이 그대로다 — 값·토큰이 남아 미전달로 계속 센다.
    expect(await cellOf("b.bye", "ko")).toEqual({ value: "Edited", pendingEditToken: "tok-ko" });
    expect(await countPending(prisma, "p")).toBe(1);
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).toMatchObject({ lastImportError: "partial-import" });
  });

  it("짝: 깨끗한 Sync에서 실제로 지운 파일의 키는 orphan된다", async () => {
    await seed();
    await sync(reader({ "src/i18n/a.ts": A, "src/i18n/b.ts": B }));
    await sync(reader({ "src/i18n/a.ts": A, "src/i18n/b.ts": undefined }));
    expect(await keyOf("b.bye")).toEqual({ orphaned: false });

    expect(await sync(reader({ "src/i18n/a.ts": A, "src/i18n/c.ts": dict("c.new", "New") }))).toMatchObject({ ok: true, surfaces: [{ status: "imported" }] });
    expect(await keyOf("b.bye")).toEqual({ orphaned: true });
    expect(await keyOf("a.hello")).toEqual({ orphaned: false });
    expect(await keyOf("c.new")).toEqual({ orphaned: false });
  });
});
