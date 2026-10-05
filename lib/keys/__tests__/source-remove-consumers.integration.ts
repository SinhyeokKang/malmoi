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
import type { GitClient } from "@/lib/pull/client";
import { createFakeGitClient } from "@/lib/pull/__tests__/fake-client";
import { countPending } from "@/lib/protection/where";
import { previewSurfaceRemoval, removeSurface } from "@/lib/surfaces/remove";
import { loadSources } from "@/lib/sources/query";
import { loadMemberships, loadProjectListAggregates } from "@/lib/keys/query";
import { surfaceQueues } from "@/lib/home/cards";
import { loadAttentionInbox } from "@/lib/inbox/load";
import { searchKeys } from "@/lib/keys/search";
import { toNavProjects } from "@/lib/shell/nav";
import { loadTranslationTree, translationLinkFor } from "@/lib/keys/translation-list";
import { loadPreviewSnapshot, loadPullState } from "@/lib/pull/load";
import { logSourceOptions, parseLogFilter } from "@/lib/events/filter";
import { loadEvents } from "@/lib/events/query";
import { en } from "@/messages/en";

/**
 * **제거된 소스가 소비자 화면에서 사라진다** (sources-add-remove B-T14 · spec B3·B15). 제거 코어를 진짜로 부른 뒤 각 화면이 쓰는 뷰 모델의
 * 출력으로 단언한다 — 행이 `archivedAt`을 가졌다에서 멈추면 어느 소비자가 거르기를 빠뜨렸는지 못 본다(/ship 6.2 · #155).
 *
 * 대조군: 제거 **전에** 같은 단언이 `web`을 본다 — 그래야 "원래 안 보였다"가 green이 되지 않는다.
 * GitHub만 가짜다(야간). ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const db = vi.hoisted(() => ({ client: undefined as GitClient | undefined, reader: undefined as RepoReader | undefined }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: async () => null, loadOpenPrForImportGate: async () => null }));
vi.mock("@/lib/github", () => ({
  createGitClient: async () => { if (db.client === undefined) throw new Error("no fake client"); return db.client; },
  openRepoReader: async () => { if (db.reader === undefined) throw new Error("no fake reader"); return db.reader; },
}));
const { runNightly } = await import("@/lib/nightly/run");

const directory = mkdtempSync(join(tmpdir(), "malmoi-source-remove-consumers-"));
let binaries: string;
const PORT = 55622;
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

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const HEAD = "a".repeat(40);
const COMMIT_AT = new Date("2026-09-10T00:00:00Z");
const REPOSITORY = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };

/**
 * 소스 둘 — `web`(기본, 미전달 편집 하나 · 검토 대기 · 적재 실패)과 `app`. 제거하는 쪽이 Inbox·Home·Publish의 모든 줄을 든다.
 */
async function seedSurface(id: string, slug: string, over: { pending?: boolean; failed?: boolean } = {}) {
  await prisma.translationSurface.create({ data: {
    id, projectId: "p", slug, adapterName: "json-catalog", pathTemplate: `${slug}/{locale}.json`, baseLocale: "en",
    lastCommitSha: HEAD, lastCommitAt: COMMIT_AT, lastImportedAt: COMMIT_AT,
    ...(over.failed ? { lastImportError: "parse-failed", lastImportFailedAt: COMMIT_AT } : {}),
  } });
  for (const code of ["en", "ko"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: id, code, name: code, isBase: code === "en" } });
  await prisma.stringKey.create({ data: { id: `${id}-hello`, projectId: "p", surfaceId: id, key: "greeting.hello", namespace: "greeting", sourceText: `Hello ${slug}`, sourceHash: "h" } });
  await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-hello`, localeCode: "en", value: `Hello ${slug}` } });
  await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-hello`, localeCode: "ko", value: `안녕 ${slug}`,
    ...(over.pending ? { updatedBy: "owner", pendingEditToken: `tok-${id}`, needsReview: true } : {}) } });
}

beforeEach(async () => {
  db.client = undefined;
  db.reader = undefined;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.project.create({ data: { id: "p", slug: "p", name: "P", ...REPOSITORY } });
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.projectMember.create({ data: { projectId: "p", userId: "owner", role: "OWNER" } });
  await seedSurface("s-web", "web", { pending: true, failed: true });
  await seedSurface("s-app", "app");
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s-web" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** 확인 창과 같은 길 — 미리보기의 지문을 받아 제거한다(미전달이 있다). */
async function removeWeb() {
  const preview = await previewSurfaceRemoval(prisma, { userId: "owner" }, { slug: "p", surfaceSlug: "web" });
  if (!preview.ok) throw new Error(`preview refused: ${preview.error}`);
  expect(preview.pendingCount).toBe(1);
  expect(await removeSurface(prisma, { userId: "owner" }, { slug: "p", surfaceSlug: "web", approval: preview.approval })).toEqual({ ok: true });
}

/** 각 소비자가 지금 보는 소스 slug — 화면이 그리는 뷰 모델의 출력에서 읽는다. */
async function seen() {
  const sources = await loadSources(prisma, en, "p", "OWNER");
  const aggregates = await loadProjectListAggregates(prisma, ["p"]);
  const inbox = await loadAttentionInbox(prisma, "owner");
  const hits = await searchKeys(prisma, { userId: "owner", q: "Hello", activeSlug: null });
  const nav = toNavProjects(await loadMemberships(prisma, "owner")).find(row => row.slug === "p");
  const tree = await loadTranslationTree(prisma, "p");
  const pull = await loadPullState(prisma, "p");
  const preview = await loadPreviewSnapshot(prisma, "p", 50);
  const all = [{ id: "s-web", slug: "web" }, { id: "s-app", slug: "app" }];
  return {
    sources: sources?.sources.map(row => row.slug),
    // Home 카드 줄 — 화면은 활성 소스만 넘기지만, 집계가 제거된 소스를 세지 않는지를 보려고 둘 다 넘긴다.
    home: surfaceQueues("p", all, aggregates).filter(row => Object.values(row.counts).some(count => count > 0)).map(row => row.slug),
    homeUnsent: aggregates.unsent.get("p") ?? 0,
    homeUnsentSurface: aggregates.unsentSurfaces.get("p") ?? null,
    inbox: inbox.groups.flatMap(group => group.items.map(item => "surfaceSlug" in item ? item.surfaceSlug : null)).filter(slug => slug !== null),
    search: hits.map(hit => hit.surfaceSlug),
    shell: { sources: nav?.counts.sources, default: nav?.defaultSurfaceSlug },
    tree: tree.surfaces.map(surface => surface.slug),
    publish: pull.surfaces.map(surface => surface.slug),
    publishUnsent: pull.unpublished,
    publishRows: preview.rows.map(row => row.surfaceId),
  };
}

it("제거 전에는 web이 모든 소비자에 보인다 — 아래 단언의 대조군", async () => {
  const before = await seen();
  expect(before.sources).toEqual(["app", "web"]);
  expect(before.home).toContain("web");
  expect(before.homeUnsent).toBe(1);
  expect(before.homeUnsentSurface).toBe("web");
  expect(before.inbox).toContain("web");
  expect(before.search).toEqual(expect.arrayContaining(["web", "app"]));
  expect(before.shell).toEqual({ sources: 2, default: "web" });
  expect(before.tree).toEqual(["app", "web"]);
  expect(before.publish).toEqual(expect.arrayContaining(["web", "app"]));
  expect(before.publishUnsent).toBe(1);
  expect(before.publishRows).toEqual(["s-web"]);
});

it("제거 뒤 Sources·Home·Inbox·검색·셸·번역 트리·Publish에서 사라지고, 기본은 app으로 승계된다", async () => {
  await removeWeb();
  const after = await seen();
  expect(after.sources).toEqual(["app"]);
  expect(after.home).not.toContain("web");
  expect(after.homeUnsent).toBe(0);
  expect(after.homeUnsentSurface).toBeNull();
  expect(after.inbox).not.toContain("web");
  expect(after.search).toEqual(["app"]);
  expect(after.shell).toEqual({ sources: 1, default: "app" });
  expect(after.tree).toEqual(["app"]);
  expect(after.publish).toEqual(["app"]);
  // 미전달은 화면 수와 원장이 같은 수를 말한다 — 제거된 소스의 토큰은 남지만 세지 않는다(되살림 적재가 덮는다).
  expect(after.publishUnsent).toBe(0);
  expect(after.publishUnsent).toBe(await countPending(prisma, "p"));
  expect(after.publishRows).toEqual([]);
  expect(await prisma.translation.count({ where: { surfaceId: "s-web", pendingEditToken: { not: null } } })).toBe(1);
});

it("야간 방문은 제거된 소스를 대상에 넣지 않는다", async () => {
  await removeWeb();
  const fake = createFakeGitClient({ refSha: { "heads/main": HEAD } });
  db.client = fake.client;
  db.reader = { snapshot: vi.fn(), blob: vi.fn() } as unknown as RepoReader;
  const target = await prisma.project.findUniqueOrThrow({ where: { id: "p" }, select: {
    id: true, slug: true, repoOwner: true, repoName: true, baseBranch: true, installationId: true, repositoryId: true, lastNightlyAt: true,
    surfaces: { select: { id: true, slug: true, archivedAt: true, lastCommitSha: true, adapterName: true, pathTemplate: true, baseLocale: true, lastImportError: true } },
  } });
  expect(target.surfaces.map(surface => surface.slug).sort()).toEqual(["app", "web"]);
  expect(await runNightly(prisma, target, () => 0)).toEqual({ action: "skip", outcome: "upToDate" });
  const rows = await prisma.projectEvent.findMany({ where: { projectId: "p", kind: "IMPORT" } });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.surfaceIds).toEqual(["s-app"]);
  // 적재 실패 표시가 남은 제거된 소스를 야간이 건드리지 않는다.
  expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).lastImportError).toBe("parse-failed");
});

it("Logs는 제거된 소스를 필터 항목으로 남기고 그 소스로 걸러지며, 번역 링크는 그리지 않는다", async () => {
  await removeWeb();
  const surfaces = await prisma.translationSurface.findMany({ where: { projectId: "p" }, select: { slug: true, archivedAt: true } });
  expect(logSourceOptions(surfaces)).toEqual([{ slug: "app", removed: false }, { slug: "web", removed: true }]);
  const page = await loadEvents(prisma, en, "p", parseLogFilter({ source: "web" }), { timeZone: "UTC" });
  expect(page.rows.map(row => row.subtype)).toContain("surface.removed");
  expect(await translationLinkFor(prisma, { projectId: "p", slug: "p", surfaceSlug: "web", key: "greeting.hello" })).toBeNull();
  expect(await translationLinkFor(prisma, { projectId: "p", slug: "p", surfaceSlug: "app", key: "greeting.hello" })).not.toBeNull();
});
