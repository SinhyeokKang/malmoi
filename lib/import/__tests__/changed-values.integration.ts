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
import { runAutomationImport, runRepositoryImportFromReader } from "@/lib/import/run";
import { applyPush } from "@/lib/push/apply";
import { hashPushToken } from "@/lib/push/token";

/**
 * **`changedValues` 관측** (nightly-sync C2) — 적재가 실제로 `value`를 바꾼 번역 셀 수. 적재 코어(`applyPushInTransaction`)가 세고
 * 생산자가 사건에 싣는다. ⚠️ **관측값이다** — 여기서 재는 것은 "무엇을 셌나"이지 "무엇을 덮었나"가 아니다(덮기는 strict 그대로).
 *
 * 첫 적재 생산자 둘(`addSurfacesFromSnapshot`·`createProjectFromRepo`)은 픽스처가 있는 `list-aggregates.integration.ts`,
 * 웹 첫 적재 Action은 `onboarding.test.ts`가 잰다.
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-changed-values-"));
let binaries: string;
const PORT = 55602;
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
const pushToken = "isolated-changed-values-fixture";
const format = { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false };
let commitClock = Date.parse("2026-09-10T00:00:00Z");

async function seed() {
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository, pushTokenHash: hashPushToken(pushToken),
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en",
      lastCommitSha: "a".repeat(40), lastCommitAt: new Date(commitClock) } },
  } });
}

type Cell = { key: string; locale: string; value: string; description?: string };
/** 커밋 시각은 매번 전진한다 — CI 경로의 역행 가드(`stale-commit`)를 지나야 한다. */
function payload(cells: readonly Cell[]) {
  commitClock += 60_000;
  const keys = [...new Set(cells.map(cell => cell.key))].map(key => ({ key, namespace: "_root", sourceText: key }));
  return { projectSlug: "fixture", surfaceSlug: "default", commitSha: "b".repeat(40), commitAt: new Date(commitClock).toISOString(), format,
    locales: [...new Set(cells.map(cell => cell.locale))], keys, translations: cells.map(cell => ({ ...cell })), refs: [] };
}
const apply = (cells: readonly Cell[]) =>
  applyPush(prisma, { projectId: "p", surfaceId: "s" }, payload(cells), { token: "t", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });

const BASE: Cell[] = [
  { key: "a", locale: "en", value: "A" }, { key: "a", locale: "ko", value: "가" },
  { key: "b", locale: "en", value: "B" }, { key: "b", locale: "ko", value: "나" },
];

it("새 셀 삽입은 바뀐 값이다 — 첫 적재는 셀 수 그대로", async () => {
  await seed();
  expect(await apply(BASE)).toMatchObject({ changedValues: 4, translationsFilled: 4 });
});

it("같은 값 재적재는 0이다 — strict라 행은 다시 쓰여도(filled) 값은 안 바뀌었다", async () => {
  await seed();
  await apply(BASE);
  expect(await apply(BASE)).toMatchObject({ changedValues: 0, translationsFilled: 4 });
});

it("값 2개 변경 → 2, 새 셀 1개 삽입도 함께 센다", async () => {
  await seed();
  await apply(BASE);
  const next = [...BASE.map(cell => cell.key === "a" ? { ...cell, value: `${cell.value}!` } : cell), { key: "b", locale: "fr", value: "Bé" }];
  expect(await apply(next)).toMatchObject({ changedValues: 3 });
});

it("description만 바뀐 셀은 세지 않는다", async () => {
  await seed();
  await apply(BASE);
  expect(await apply(BASE.map(cell => ({ ...cell, description: "context" })))).toMatchObject({ changedValues: 0 });
});

it("토큰 있어 안 덮인 셀은 세지 않는다 — 쓰이지 않은 행은 관측 대상이 아니다", async () => {
  await seed();
  await apply(BASE);
  await prisma.translation.updateMany({ where: { projectId: "p", localeCode: "ko" }, data: { value: "Edited", pendingEditToken: "edit" } });
  expect(await apply(BASE.map(cell => ({ ...cell, value: `${cell.value}?` })))).toMatchObject({ changedValues: 2, translationsFilled: 2 });
  expect((await prisma.translation.findMany({ where: { projectId: "p", localeCode: "ko" } })).every(row => row.value === "Edited")).toBe(true);
});

function reader(content: string): RepoReader {
  return {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => ({ status: "ok", headSha: "c".repeat(40), headCommittedAt: new Date(commitClock + 3_600_000).toISOString(),
      files: ["en", "ko"].map(locale => ({ path: `i18n/${locale}.json`, sha: locale, size: 100 })) })),
    blob: vi.fn(async (sha: string) => sha === "en" ? content : '{"a":"가","b":"나"}'),
  };
}
const importEvent = async (subtype: string) => (await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype } })).payload;

it("생산자 — CI `/api/push`의 import.ci 사건", async () => {
  await seed();
  await apply(BASE);
  vi.doMock("@/lib/db", () => ({ getPrisma: () => prisma }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  // 열린 Malmoi PR 없음 — 이 파일은 게이트 뒤(적재)를 잰다. 게이트 자체는 `app/api/__tests__/push-open-pr.test.ts`(nightly-sync D1).
  vi.doMock("@/lib/projects/open-pr", () => ({ loadOpenPrForImportGate: async () => null }));
  const { POST } = await import("@/app/api/push/route");
  const body = payload(BASE.map(cell => cell.key === "b" ? { ...cell, value: `${cell.value}2` } : cell));
  const response = await POST(new Request("http://localhost/api/push", { method: "POST", headers: { authorization: `Bearer ${pushToken}` }, body: JSON.stringify(body) }));
  expect(response.status).toBe(200);
  expect(await importEvent("import.ci")).toMatchObject({ source: "ci", changedValues: 2 });
});

it("생산자 — 수동 Sync의 import.run 사건", async () => {
  await seed();
  await apply(BASE);
  await runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval: null, credential: undefined }, async () => reader('{"a":"A","b":"B changed"}'));
  expect(await importEvent("import.run")).toMatchObject({ source: "manual", changedValues: 1 });
});

it("생산자 — 야간 적재의 import.nightly 사건", async () => {
  await seed();
  await apply(BASE);
  await runAutomationImport(prisma, { projectId: "p", repository }, async () => reader('{"a":"A new","b":"B new"}'));
  expect(await importEvent("import.nightly")).toMatchObject({ source: "nightly", changedValues: 2 });
});

it("실패로 닫힌 실행은 0이 아니라 null이다", async () => {
  await seed();
  await apply(BASE);
  const failing: RepoReader = { snapshot: vi.fn<RepoReader["snapshot"]>(async () => { throw new Error("boom"); }), blob: vi.fn() };
  await runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval: null, credential: undefined }, async () => failing);
  expect(await importEvent("import.run")).toMatchObject({ changedValues: null });
});

it("단일 언어 Sync 후 둘째 언어를 더하면 새 셀만 Logs의 변경 수에 오른다", async () => {
  const { changedValuesText } = await import("@/lib/events/view");
  const { readPayload } = await import("@/lib/events/payload");
  await seed();
  const single = reader('{"a":"A","b":"B"}');
  const snapshot = await single.snapshot();
  if (snapshot.status !== "ok") throw new Error("fixture snapshot");
  single.snapshot = async () => ({ ...snapshot, files: snapshot.files.filter(file => file.path === "i18n/en.json") });
  await runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval: null, credential: undefined }, async () => single);
  const first = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "import.run" }, orderBy: { occurredAt: "desc" } });
  expect(first.payload).toMatchObject({ changedValues: 2 });
  const firstPayload = readPayload("IMPORT", first.payload);
  if (firstPayload?.kind !== "IMPORT") throw new Error("missing import payload");
  expect(changedValuesText(first.result, firstPayload.changedValues)).toBe("2 values changed");
  expect(await prisma.locale.findMany({ where: { projectId: "p", orphaned: false }, select: { code: true } })).toEqual([{ code: "en" }]);

  const next = reader('{"a":"A","b":"B"}');
  next.snapshot = async () => ({ ...snapshot, headSha: "d".repeat(40), headCommittedAt: new Date(commitClock + 7_200_000).toISOString() });
  await runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval: null, credential: undefined }, async () => next);
  const second = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "import.run", id: { not: first.id } } });
  expect(second.payload).toMatchObject({ changedValues: 2 });
  const secondPayload = readPayload("IMPORT", second.payload);
  if (secondPayload?.kind !== "IMPORT") throw new Error("missing import payload");
  expect(changedValuesText(second.result, secondPayload.changedValues)).toBe("2 values changed");
  expect(await prisma.locale.findMany({ where: { projectId: "p", orphaned: false }, select: { code: true }, orderBy: { code: "asc" } })).toEqual([{ code: "en" }, { code: "ko" }]);
});
