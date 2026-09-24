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
 * **chrome `"placeholders": null`이 push → pull 왕복에서 살아남는다** (audit #52).
 *
 * push는 그 값을 JSON `null`로 적재하는데(`'null'::jsonb`), Prisma는 Json 컬럼의 SQL NULL과 JSON null을 **둘 다 `null`로**
 * 읽는다. 그래서 `load.ts`가 부재로 접어 write가 필드를 빼고, 값 편집 0건인 Publish가 그 줄을 지우는 diff를 냈다.
 * ⚠️ 대조로 **부재**(SQL NULL) 셀은 그대로 부재여야 한다 — 둘을 같게 만드는 것으로는 안 닫힌다 (POSTMORTEM 2026-09-14).
 * ⚠️ **이 파일이 `lib/keys/__tests__/`에 있는 이유**는 `vitest.projects.config.ts`의 include다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-placeholders-null-"));
let binaries: string;
const PORT = 55541;
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

const TEMPLATE = "_locales/{locale}/messages.json";

it("placeholders가 null인 엔트리는 null로, 없는 엔트리는 없는 채로 다시 나간다", async () => {
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1" } });
  await prisma.translationSurface.create({ data: { id: "s", projectId: "p", slug: "default", adapterName: "chrome-locales", pathTemplate: TEMPLATE, nested: false, baseLocale: "en" } });
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s" } });

  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
    projectSlug: "p", surfaceSlug: "default", commitSha: "c".repeat(40), commitAt: "2026-09-24T00:00:00Z",
    format: { adapter: "chrome-locales", pathTemplate: TEMPLATE, baseLocale: "en", nested: false },
    locales: ["en"],
    keys: ["absent", "nulled", "object"].map(key => ({ key, namespace: "_root", sourceText: key })),
    translations: [
      { locale: "en", key: "absent", value: "absent" },
      { locale: "en", key: "nulled", value: "nulled", placeholders: null },
      { locale: "en", key: "object", value: "object", placeholders: { n: { content: "$1" } } },
    ],
    refs: [],
  }, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });

  const state = await loadPullState(prisma, "p");
  const surface = state.surfaces[0]!;
  const cells = Object.fromEntries(surface.keys.map(k => [k.key, k.cells["en"]]));
  expect(cells["absent"]).toEqual({ value: "absent" });
  expect(cells["nulled"]).toEqual({ value: "nulled", placeholders: null });
  expect(cells["object"]).toEqual({ value: "object", placeholders: { n: { content: "$1" } } });

  const format = formatFromProject(surface, surface.localeCodes);
  const [file] = renderLocaleFiles(format, "per-locale", resolveLocalePaths(format, "per-locale", []), surface.keys, "en", new Map());
  expect(JSON.parse(file!.content!)).toEqual({
    absent: { message: "absent" },
    nulled: { message: "nulled", placeholders: null },
    object: { message: "object", placeholders: { n: { content: "$1" } } },
  });
});
