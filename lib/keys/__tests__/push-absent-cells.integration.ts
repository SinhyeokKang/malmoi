import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { loadPullState } from "@/lib/pull/load";
import { formatFromProject, resolveLocalePaths } from "@/lib/pull/plan";
import { renderLocaleFiles } from "@/lib/pull/render";
import { applyPush } from "@/lib/push/apply";

/**
 * **push의 `""`·부재는 "모름"이지 "삭제"가 아니다** (launch-readiness L1.3, ARCHITECTURE §0 불변식 3 · §5.5.2).
 *
 * 코드에서 번역을 지우는 길은 없다 — 리포에서 비우거나 지운 셀은 DB에서 그대로 남고, 다음 pull이 그 값을 다시 낸다.
 * 뒤집으려면 export가 명시적 빈값과 미번역 빈값을 구별하는 수단이 먼저다(PRODUCT §10).
 *
 * ⚠️ **"유지" 단언마다 같은 픽스처에서 덮인 셀을 대조로 둔다** (POSTMORTEM 2026-09-14) — 적재가 통째로 안 돌아도
 * "유지"는 참이기 때문이다.
 * ⚠️ **이 파일이 `lib/keys/__tests__/`에 있는 이유**는 `vitest.projects.config.ts`의 include다(2026-09-10).
 */

// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-absent-cells-"));
let binaries: string;
const PORT = 55487;
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

/** 프로젝트 `p` · 로케일 `en`(base)·`ko`·`fr` · 키 `k1`·`k2`·`k3`, 전 셀에 편집자가 쓴 값. */
async function seed() {
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1" } });
  await prisma.translationSurface.create({ data: { id: "s", projectId: "p", slug: "default",
    adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" } });
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s" } });
  await prisma.locale.createMany({ data: ["en", "ko", "fr"].map(code => ({ projectId: "p", surfaceId: "s", code, name: code, isBase: code === "en", orphaned: false })) });
  for (const key of ["k1", "k2", "k3"]) {
    await prisma.stringKey.create({ data: { id: key, projectId: "p", surfaceId: "s", key, namespace: "_root", sourceText: key, sourceHash: key } });
    for (const locale of ["en", "ko", "fr"]) {
      await prisma.translation.create({ data: { id: `${key}-${locale}`, projectId: "p", surfaceId: "s", keyId: key, localeCode: locale,
        value: `db-${key}-${locale}`, updatedBy: "editor" } });
    }
  }
}

async function cell(key: string, locale: string) {
  const { rows } = await pool.query<{ value: string; updatedBy: string | null }>(
    `SELECT "value", "updatedBy" FROM "Translation" WHERE "keyId" = $1 AND "localeCode" = $2`, [key, locale]);
  return rows[0];
}

it("리포의 `\"\"` · 키 부재 · 로케일 파일 부재 · orphaned 키는 DB 셀을 건드리지 않고, 값이 있는 셀만 덮는다", async () => {
  await seed();
  // 리포: base에 k1·k2만 있다(k3는 코드에서 사라져 orphan). ko 파일은 k1을 `""`로 비웠고 k2가 없다. fr 파일은 통째로 없다.
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
    projectSlug: "p", surfaceSlug: "default", commitSha: "b".repeat(40), commitAt: "2026-09-18T00:00:00Z",
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko"],
    keys: ["k1", "k2"].map(key => ({ key, namespace: "_root", sourceText: `repo-${key}-en` })),
    translations: [
      { locale: "en", key: "k1", value: "repo-k1-en" },
      { locale: "en", key: "k2", value: "repo-k2-en" },
      { locale: "ko", key: "k1", value: "" },
    ],
    refs: [],
  }, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });

  // 대조 — 값이 있는 셀은 리포 값으로 덮이고 저자가 비워진다.
  expect(await cell("k1", "en")).toEqual({ value: "repo-k1-en", updatedBy: null });
  expect(await cell("k2", "en")).toEqual({ value: "repo-k2-en", updatedBy: null });
  // 네 갈래 — 전부 유지.
  expect(await cell("k1", "ko")).toEqual({ value: "db-k1-ko", updatedBy: "editor" });
  expect(await cell("k2", "ko")).toEqual({ value: "db-k2-ko", updatedBy: "editor" });
  expect(await cell("k1", "fr")).toEqual({ value: "db-k1-fr", updatedBy: "editor" });
  expect(await cell("k3", "ko")).toEqual({ value: "db-k3-ko", updatedBy: "editor" });
  expect((await prisma.stringKey.findUniqueOrThrow({ where: { id: "k3" } })).orphaned).toBe(true);

  // 뒤이은 pull이 유지된 셀을 그대로 낸다 — 비운 셀이 PR에서 되살아나는 것이 이 결정의 관측 가능한 결과다.
  const state = await loadPullState(prisma, "p");
  const surface = state.surfaces[0]!;
  const format = formatFromProject(surface, surface.localeCodes);
  const files = renderLocaleFiles(format, "per-locale", resolveLocalePaths(format, "per-locale", []), surface.keys, "en", new Map());
  const ko = files.find(f => f.path === "i18n/ko.json")?.content;
  expect(ko === null || ko === undefined ? undefined : JSON.parse(ko)).toEqual({ k1: "db-k1-ko", k2: "db-k2-ko" });
});
