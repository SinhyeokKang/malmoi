import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { readPayload } from "@/lib/events/payload";
import { deferredText } from "@/lib/events/view";
import { summarizeNightly } from "@/lib/nightly/summary";
import { createFakeGitClient, isGitMutation, type FakeGitOptions } from "@/lib/pull/__tests__/fake-client";
import type { GitClient } from "@/lib/pull/client";
import { sizesFromSnapshot, type RepoReader } from "@/lib/repo-host/reader";
import { waitForLockWait } from "@/lib/locales/__tests__/lock-wait";
import { en } from "@/messages/en";

/**
 * **언어 변경과 적재·Sync·수명주기** (locale-add tasks §4 · §3 여섯째의 apply 쪽). 리포 호스트만 가짜이고 DB·적재·사건·Logs 뷰 모델은 진짜다.
 *
 * - 자동 적재(CI `/api/push` · 야간 적재)는 빈 ADD를 orphan하지 않고, 전달 안 된 REMOVE가 있으면 적재 전체를 `locale-change-pending`으로 보류한다.
 * - 만료는 같은 잠금 안에서 적재가 겸하고, 같은 SHA 야간 방문은 행이 있을 때만 PR/MR 조회 → 만료를 먼저 돈다.
 * - 수동 Sync·소스 제거는 언어 변경 행·전달 목록을 승인에 묶고, 성공한 strict 적재·제거만 그것을 지운다.
 * - 기준 브랜치 변경은 언어 변경 행이 있으면 거부한다(이전 삭제를 다른 브랜치로 보내지 않는다).
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). Unix 소켓 전용 새 클러스터 — `DATABASE_URL`·`DIRECT_URL`을 절대 읽지 않는다.
 */

const fakes = vi.hoisted(() => ({ client: undefined as GitClient | undefined, reader: undefined as RepoReader | undefined, prisma: undefined as unknown }));
vi.mock("@/lib/repo-host", () => ({
  createGitClient: async () => { if (fakes.client === undefined) throw new Error("no fake client"); return fakes.client; },
  openRepoReader: async () => { if (fakes.reader === undefined) throw new Error("no fake reader"); return fakes.reader; },
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => fakes.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("@/app/api/push/route");
const { runNightly } = await import("@/lib/nightly/run");
const { applyProtectedPush } = await import("@/lib/push/apply");
const { hashPushToken } = await import("@/lib/push/token");
const { runAutomationImport, runRepositoryImportFromReader } = await import("@/lib/import/run");
const { prepareSync } = await import("@/lib/import/prepare");
const { addLocale, cancelLocaleRemoval, previewLocaleRemoval, removeLocale } = await import("@/lib/locales/change");
const { countLocaleWork, readLocaleStates } = await import("@/lib/locales/work");
const { previewSurfaceRemoval, removeSurface } = await import("@/lib/surfaces/remove");
const { changeBaseBranch } = await import("@/lib/settings/update");
const { applyKeySave } = await import("@/lib/keys/save-key");

const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-lifecycle-"));
let binaries: string;
const PORT = 55689;
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
  fakes.prisma = prisma;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const PUSH_TOKEN = "locale-lifecycle-fixture";
const OLD = "a".repeat(40);
const HEAD = "d".repeat(40);
const OWNER = { userId: "owner" };
const WEB = { slug: "fixture", surfaceSlug: "web" };
const HOSTS = {
  github: { repoHost: "github", repositoryId: "123", installationId: "456", gitlabConnectionId: null },
  gitlab: { repoHost: "gitlab", repositoryId: "77", installationId: null, gitlabConnectionId: "conn" },
} as const;
type Host = keyof typeof HOSTS;
let commitClock = Date.parse("2026-10-01T00:00:00Z");

async function seed(host: Host = "github") {
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  if (host === "gitlab") {
    // 리포 호스트가 가짜라 봉투는 열리지 않는다 — 참조가 서야 `repoTargetOf`가 ok다.
    await prisma.gitLabConnection.create({ data: { id: "conn", userId: "owner", token: "sealed-fixture", gitlabUserId: "1", username: "owner", scopes: ["api"] } });
  }
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...HOSTS[host], repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken(PUSH_TOKEN), members: { create: { userId: "owner", role: "OWNER" } } } });
  for (const [id, slug] of [["s-web", "web"], ["s-app", "app"]] as const) {
    await prisma.translationSurface.create({ data: { id, projectId: "p", slug, adapterName: "json-catalog", pathTemplate: `${slug}/{locale}.json`, baseLocale: "en",
      nested: false, lastCommitSha: OLD, lastCommitAt: new Date(commitClock) } });
    for (const code of ["en", "ko", "ja"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: id, code, name: code, isBase: code === "en" } });
    await prisma.stringKey.create({ data: { id: `${id}-hello`, projectId: "p", surfaceId: id, key: "hello", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
    for (const code of ["en", "ko", "ja"]) await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-hello`, localeCode: code, value: `hello-${code}` } });
  }
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s-web" } });
}

beforeEach(async () => {
  fakes.client = undefined;
  fakes.reader = undefined;
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** 의도 행을 직접 심는다 — ADD는 로케일 행도 같이 세운다(추가 코어가 하는 일). 코어 경로는 아래 시나리오가 `addLocale`·`removeLocale`로 탄다. */
async function request(surfaceId: string, localeCode: string, operation: "ADD" | "REMOVE") {
  if (operation === "ADD") {
    await prisma.locale.upsert({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId, code: localeCode } },
      create: { projectId: "p", surfaceId, code: localeCode, name: localeCode, isBase: false }, update: { orphaned: false } });
  }
  await prisma.localeChange.create({ data: { projectId: "p", surfaceId, localeCode, operation } });
}

/** 성공한 Publish 확인 — 그 확인이 실은 파일 집합 변경(`deliveredLocaleChanges`)까지. */
async function deliver(surfaceId: string, effects: { localeCode: string; effect: "create" | "delete" }[]) {
  const run = await prisma.syncRun.create({ data: { projectId: "p", status: "SUCCEEDED", trigger: "MANUAL", startedAt: new Date(Date.now() - 3_600_000) } });
  await prisma.deliveryConfirmation.create({ data: { projectId: "p", surfaceId, revision: `rev-${surfaceId}-${run.id}`, syncRunId: run.id, contextFingerprint: "ctx", deliveredLocaleChanges: effects } });
}

function github(options: FakeGitOptions = {}) {
  const fake = createFakeGitClient({ refSha: { "heads/main": HEAD }, ...options });
  fakes.client = fake.client;
  return fake.calls;
}

/** base 트리 — `files`의 로케일 파일만 있다. 내용은 `hello`의 값 하나다. */
function tree(files: Record<string, readonly string[]>, options: { headSha?: string; fail?: boolean; unreadable?: readonly string[] } = {}): RepoReader {
  const entries = Object.entries(files).flatMap(([slug, codes]) => codes.map(code => ({ path: `${slug}/${code}.json`, sha: `${slug}:${code}`, size: 40 })));
  return {
    sizes: async (snapshot, paths) => sizesFromSnapshot(snapshot, paths),
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => {
      if (options.fail === true) throw new Error("tree unavailable");
      return { status: "ok", headSha: options.headSha ?? HEAD, headCommittedAt: new Date(commitClock + 86_400_000).toISOString(), files: entries };
    }),
    blob: vi.fn(async (sha: string) => {
      // 파싱 실패 — 그 파일만 빠지는 부분 적재(`partial-import`)가 된다(내려받기 실패는 소스 전체 실패다).
      if (options.unreadable?.includes(sha)) return "{ not json";
      const code = sha.split(":")[1] ?? "";
      return JSON.stringify({ hello: `repo-${code}` });
    }),
  };
}

function payload(locales: readonly string[], surfaceSlug = "web") {
  commitClock += 60_000;
  return { projectSlug: "fixture", surfaceSlug, commitSha: "b".repeat(40), commitAt: new Date(commitClock).toISOString(),
    format: { adapter: "json-catalog" as const, pathTemplate: `${surfaceSlug}/{locale}.json`, baseLocale: "en", nested: false },
    locales: [...locales], keys: [{ key: "hello", namespace: "_root", sourceText: "Hello" }],
    translations: locales.map(locale => ({ key: "hello", locale, value: `repo-${locale}` })), refs: [] };
}

async function ciPush(locales: readonly string[], surfaceSlug = "web") {
  const response = await POST(new Request("http://localhost/api/push", { method: "POST", headers: { authorization: `Bearer ${PUSH_TOKEN}` }, body: JSON.stringify(payload(locales, surfaceSlug)) }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function presence(surfaceId = "s-web") {
  return Object.fromEntries((await prisma.locale.findMany({ where: { projectId: "p", surfaceId }, orderBy: { code: "asc" } })).map(row => [row.code, row.orphaned ? "orphan" : "active"]));
}
const rows = () => prisma.localeChange.findMany({ where: { projectId: "p" }, orderBy: [{ surfaceId: "asc" }, { localeCode: "asc" }], select: { surfaceId: true, localeCode: true, operation: true } });
const resolved = () => prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "surface.localeChangeResolved" }, orderBy: { occurredAt: "asc" } });

/** Logs 보조줄 — 화면이 보류 행에 쓰는 뷰 모델(`deferredText`) 출력이다(/ship 6.2: 끝 단언은 DB 행이 아니라 이것). */
async function heldLine(subtype: string) {
  const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype }, orderBy: { occurredAt: "desc" } });
  const parsed = readPayload("IMPORT", event.payload);
  if (parsed?.kind !== "IMPORT") throw new Error("missing import payload");
  return { result: event.result, deferReason: parsed.deferReason, text: deferredText(en, parsed) };
}

async function removalApproval(localeCode: string, surfaceSlug = "web") {
  const preview = await previewLocaleRemoval(prisma, OWNER, { slug: "fixture", surfaceSlug, localeCode });
  if (!preview.ok) throw new Error(`preview refused: ${preview.error}`);
  return preview.approval;
}

describe("CI /api/push — 언어 변경 게이트·만료", () => {
  it("추가 tx 직후 적재가 빈 ADD를 orphan하지 않는다 (첫 red) — 행 없는 언어는 그대로 orphan된다(대조)", async () => {
    await seed();
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true, action: "create" });
    github();
    const pushed = await ciPush(["en", "ko"]);
    expect(pushed).toMatchObject({ status: 200, body: { status: "applied" } });
    // 대조: 행 없는 `ja`는 리포에 없어 orphan된다 — 게이트가 orphan 문장 전체를 끈 것이 아니다.
    expect(await presence()).toEqual({ en: "active", fr: "active", ja: "orphan", ko: "active" });
    expect(await rows()).toEqual([{ surfaceId: "s-web", localeCode: "fr", operation: "ADD" }]);
    expect(await resolved()).toEqual([]);
  });

  it("ADD 경로가 base에서 관측되면 만료한다 — 관측 그대로 활성, 행 삭제, 사건", async () => {
    await seed();
    await request("s-web", "fr", "ADD");
    github();
    expect(await ciPush(["en", "ko", "ja", "fr"])).toMatchObject({ status: 200, body: { status: "applied" } });
    expect(await rows()).toEqual([]);
    expect(await presence()).toMatchObject({ fr: "active" });
    const [event] = await resolved();
    expect(event).toMatchObject({ actorKind: "AUTOMATION", surfaceIds: ["s-web"] });
    expect(event?.payload).toMatchObject({ localeChange: { locale: "fr", operation: "ADD", outcome: "active" } });
  });

  it("REMOVE tx 직후 적재는 전체 보류 — 200 deferred `locale-change-pending`, 사건·Logs 사유, 아무것도 쓰지 않는다", async () => {
    await seed();
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await removalApproval("ko") })).toMatchObject({ ok: true, kind: "request-removal" });
    const calls = github();
    const before = await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } });
    expect(await ciPush(["en", "ko", "ja"])).toEqual({ status: 200, body: { status: "deferred", reason: "locale-change-pending", projectId: "p", commitSha: "b".repeat(40) } });
    // 보류는 리포 호스트를 부르지 않는다 — 열린 PR 게이트보다 앞이다.
    expect(calls).toEqual([]);
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).toMatchObject({ lastCommitAt: before.lastCommitAt, importRevision: before.importRevision, lastImportStartedAt: null });
    expect(await heldLine("import.ci")).toEqual({ result: "deferred", deferReason: "locale-change-pending", text: en.logs.deferReasons["locale-change-pending"] });
  });

  it("다른 소스의 전달 안 된 REMOVE도 보류한다 — 프로젝트 단위", async () => {
    await seed();
    await request("s-app", "ko", "REMOVE");
    github();
    expect(await ciPush(["en", "ko", "ja"])).toMatchObject({ status: 200, body: { status: "deferred", reason: "locale-change-pending" } });
  });

  it("전달 뒤 취소한 REMOVE(행 없음)는 보류가 아니다", async () => {
    await seed();
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    github();
    expect(await ciPush(["en", "ko", "ja"])).toMatchObject({ status: 200, body: { status: "applied" } });
  });

  it.each<Host>(["github", "gitlab"])("전달된 REMOVE + 열린 PR/MR(%s) → 기존 열린 PR 보류, 행 그대로", async host => {
    await seed(host);
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    github({ openPr: { url: "https://example.test/pr/5", number: 5, title: "t" } });
    expect(await ciPush(["en", "ja"])).toMatchObject({ status: 200, body: { status: "deferred", reason: "open-pr" } });
    expect(await rows()).toEqual([{ surfaceId: "s-web", localeCode: "ko", operation: "REMOVE" }]);
    expect(await presence()).toMatchObject({ ko: "active" });
  });

  it.each<Host>(["github", "gitlab"])("머지 뒤(%s — PR 없음, base에 파일 없음) → 같은 잠금에서 만료 + strict 적재: orphan, 행 삭제, 사건", async host => {
    await seed(host);
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    github();
    expect(await ciPush(["en", "ja"])).toMatchObject({ status: 200, body: { status: "applied" } });
    expect(await rows()).toEqual([]);
    expect(await presence()).toEqual({ en: "active", ja: "active", ko: "orphan" });
    expect((await resolved())[0]?.payload).toMatchObject({ localeChange: { locale: "ko", operation: "REMOVE", outcome: "orphan" } });
    // 값·이력은 남는다 — 파일 삭제는 번역 삭제가 아니다.
    expect(await prisma.translation.count({ where: { projectId: "p", surfaceId: "s-web", localeCode: "ko" } })).toBe(1);
  });

  it("잠금을 기다리는 동안 커밋된 REMOVE를 잠금 뒤 다시 본다 — 같은 Project→Surface 순서, 적재 보류", async () => {
    await seed();
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
      const pending = applyProtectedPush(prisma, { projectId: "p", surfaceId: "s-web" }, payload(["en", "ko", "ja"]), {
        token: "ci", startedAt: new Date(), refsMode: "replace", previousBaseLocale: "en", importOutcome: null,
        pushTokenHash: hashPushToken(PUSH_TOKEN), expectedLastPublishedAt: null, expectedDeliveryRevision: "[]",
      });
      await waitForLockWait(pool);
      await holder.query(`INSERT INTO "LocaleChange" ("projectId", "surfaceId", "localeCode", "operation") VALUES ('p', 's-web', 'ko', 'REMOVE')`);
      await holder.query("COMMIT");
      expect(await pending).toEqual({ status: "deferred", pendingCount: 0, reason: "locale-change-pending" });
    } finally {
      await holder.query("ROLLBACK").catch(() => {});
      holder.release();
    }
    expect(await presence()).toEqual({ en: "active", ja: "active", ko: "active" });
  });
});

describe.each<Host>(["github", "gitlab"])("야간 — 같은 head의 만료 (%s fake)", host => {
  async function target() {
    return prisma.project.findUniqueOrThrow({ where: { id: "p" }, select: {
      id: true, slug: true, repoOwner: true, repoName: true, baseBranch: true, repoHost: true, gitlabConnectionId: true, installationId: true, repositoryId: true, lastNightlyAt: true,
      surfaces: { select: { id: true, slug: true, archivedAt: true, lastCommitSha: true, adapterName: true, pathTemplate: true, baseLocale: true, lastImportError: true, importRevision: true } },
    } });
  }
  const visit = async () => runNightly(prisma, await target(), () => 0);
  const atHead = () => prisma.translationSurface.updateMany({ where: { projectId: "p" }, data: { lastCommitSha: HEAD } });

  it("머지 없이 닫힌 제거 + 같은 head + 다른 편집 없음 → 조회 → 만료(활성), 종료된 요청을 다시 싣지 않는다", async () => {
    await seed(host);
    await atHead();
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    const calls = github({ refSha: { "heads/main": HEAD } });
    fakes.reader = tree({ web: ["en", "ko", "ja"], app: ["en", "ko", "ja"] });
    expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
    expect(calls.map(call => call.method)).toEqual(["getRefSha", "findOpenPr"]);
    expect(calls.some(call => isGitMutation(call.method))).toBe(false);
    expect(await rows()).toEqual([]);
    expect(await presence()).toMatchObject({ ko: "active" });
    expect((await resolved())[0]?.payload).toMatchObject({ localeChange: { locale: "ko", operation: "REMOVE", outcome: "active" } });
    // 재전송 0 — 다음 Publish가 실을 현재 효과에 삭제가 없다(남은 차이는 전달 목록을 비우는 정리다).
    const [state] = await readLocaleStates(prisma, "p", "s-web");
    expect(state?.current).toEqual([]);
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "nightly.skip", result: "upToDate" } })).toBe(1);
  });

  it("PR/MR 조회 실패 → 보류 `pr-check-failed`, 행·로케일 그대로", async () => {
    await seed(host);
    await atHead();
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    github({ refSha: { "heads/main": HEAD }, failOn: "findOpenPr" });
    fakes.reader = tree({ web: ["en", "ko", "ja"] });
    const result = await visit();
    expect(result).toEqual({ action: "skip", outcome: "deferred", reason: "pr-check-failed" });
    expect(await rows()).toEqual([{ surfaceId: "s-web", localeCode: "ko", operation: "REMOVE" }]);
    expect(await resolved()).toEqual([]);
    expect(await heldLine("nightly.skip")).toMatchObject({ result: "deferred", deferReason: "pr-check-failed" });
    expect(summarizeNightly([{ slug: "fixture", ...result }], 0).counts["deferred.pr-check-failed"]).toBe(1);
  });

  it("열린 PR/MR → upToDate, 만료하지 않는다", async () => {
    await seed(host);
    await atHead();
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    github({ refSha: { "heads/main": HEAD }, openPr: { url: "https://example.test/pr/5", number: 5, title: "t" } });
    expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
    expect(await rows()).toHaveLength(1);
  });

  it("base 트리를 못 읽음 → 실패 사건(`base-unreadable`), 만료·orphan 0", async () => {
    await seed(host);
    await atHead();
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    github({ refSha: { "heads/main": HEAD } });
    fakes.reader = tree({}, { fail: true });
    expect(await visit()).toEqual({ action: "skip", outcome: "failed", reason: "base-unreadable", branchMissing: false });
    expect(await rows()).toHaveLength(1);
    expect(await presence()).toMatchObject({ ko: "active" });
    // 일시 실패라 표면 실패 상태를 쓰지 않는다(브랜치는 있다).
    expect(await prisma.translationSurface.count({ where: { projectId: "p", lastImportError: { not: null } } })).toBe(0);
  });

  it("행 없는 프로젝트는 기존 스킵 그대로 — PR/MR 조회 0회", async () => {
    await seed(host);
    await atHead();
    const calls = github({ refSha: { "heads/main": HEAD } });
    expect(await visit()).toEqual({ action: "skip", outcome: "upToDate" });
    expect(calls.map(call => call.method)).toEqual(["getRefSha"]);
  });

  it("head가 앞선 적재가 빈 ADD를 orphan하지 않고, 관측된 ADD는 만료한다", async () => {
    await seed(host);
    await request("s-web", "fr", "ADD");
    await request("s-app", "de", "ADD");
    github({ refSha: { "heads/main": HEAD } });
    fakes.reader = tree({ web: ["en", "ko", "ja"], app: ["en", "ko", "ja", "de"] });
    expect(await visit()).toMatchObject({ action: "import", recorded: true, result: "imported" });
    expect(await presence("s-web")).toMatchObject({ fr: "active" });
    expect(await rows()).toEqual([{ surfaceId: "s-web", localeCode: "fr", operation: "ADD" }]);
    expect(await presence("s-app")).toMatchObject({ de: "active" });
  });
});

describe("야간 적재 — 잠금 안 재판정", () => {
  it("실행권 잠금 뒤 전달 안 된 REMOVE를 보면 적재 전체 보류 — 사건 `deferred`·`locale-change-pending`", async () => {
    await seed();
    await request("s-web", "ko", "REMOVE");
    fakes.reader = tree({ web: ["en", "ko", "ja"], app: ["en", "ko", "ja"] });
    const result = await runAutomationImport(prisma, { projectId: "p", repository: { ...HOSTS.github, repoOwner: "o", repoName: "r", baseBranch: "main" },
      expectedLastPublishedAt: null, expectedDeliveryRevision: "[]", pullRequest: "none-open" }, async () => fakes.reader!);
    expect(result).toEqual({ recorded: true, result: "deferred", deferReason: "locale-change-pending" });
    expect(await heldLine("import.nightly")).toEqual({ result: "deferred", deferReason: "locale-change-pending", text: en.logs.deferReasons["locale-change-pending"] });
    expect(summarizeNightly([{ slug: "fixture", action: "import", ...result }], 0).counts["deferred.locale-change-pending"]).toBe(1);
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).toMatchObject({ lastCommitSha: OLD });
  });
});

describe("수동 Sync — 승인 지문과 의도 정리", () => {
  const repository = { ...HOSTS.github, repoOwner: "o", repoName: "r", baseBranch: "main" };
  const sync = (approval: string | null, reader: RepoReader) =>
    runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval, credential: undefined }, async () => reader);
  const approval = async () => (await prepareSync(prisma, OWNER, { slug: "fixture" }))?.approval ?? null;
  const save = (localeCode: string, value: string) =>
    applyKeySave(prisma, { projectId: "p", surfaceId: "s-web", surfaceSlug: "web", keyId: "s-web-hello", userId: "owner", credential: undefined, changes: [{ localeCode, value }] });

  it("편집 0이어도 언어 변경 행이 있으면 승인 없이는 reconfirm — 행 그대로", async () => {
    await seed();
    await request("s-web", "ko", "REMOVE");
    expect(await sync(null, tree({ web: ["en", "ko", "ja"], app: ["en", "ko", "ja"] }))).toEqual({ ok: false, error: "reconfirm" });
    expect(await rows()).toHaveLength(1);
  });

  it("추가·제거·취소·새 편집·전달 뒤에는 옛 승인이 통하지 않는다", async () => {
    await seed();
    const reader = tree({ web: ["en", "ko", "ja"], app: ["en", "ko", "ja"] });
    const steps: [string, () => Promise<unknown>][] = [
      ["추가", () => addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })],
      ["제거 요청", async () => removeLocale(prisma, OWNER, { ...WEB, localeCode: "ja", approval: await removalApproval("ja") })],
      ["제거 취소", () => cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ja" })],
      ["새 편집", () => save("ko", "edited")],
      ["전달", () => deliver("s-app", [{ localeCode: "ko", effect: "delete" }])],
    ];
    for (const [name, step] of steps) {
      const stale = await approval();
      const done = await step() as { ok?: boolean } | undefined;
      expect(done?.ok, name).not.toBe(false);
      expect(await sync(stale, reader), name).toEqual({ ok: false, error: "reconfirm" });
    }
    expect(await sync(await approval(), reader)).toMatchObject({ ok: true });
  });

  it("승인된 Sync의 성공한 strict 적재만 행·전달 목록을 지운다 — 리포대로 활성/orphan, 사건, 남는 작업 0", async () => {
    await seed();
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    await request("s-web", "fr", "ADD");
    // 머지된 다른 소스의 제거 — 파일이 base에서 사라졌다. 정리 뒤 다음 Publish가 그 파일을 되살리지 않는다(orphan).
    await request("s-app", "ja", "REMOVE");
    await deliver("s-app", [{ localeCode: "ja", effect: "delete" }]);
    expect(await sync(await approval(), tree({ web: ["en", "ko", "ja"], app: ["en", "ko"] }))).toMatchObject({ ok: true });
    expect(await rows()).toEqual([]);
    expect(await prisma.deliveryConfirmation.findMany({ where: { projectId: "p" }, select: { deliveredLocaleChanges: true } })).toEqual([{ deliveredLocaleChanges: null }, { deliveredLocaleChanges: null }]);
    expect(await presence("s-web")).toEqual({ en: "active", fr: "orphan", ja: "active", ko: "active" });
    expect(await presence("s-app")).toMatchObject({ ja: "orphan" });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    expect(await readLocaleStates(prisma, "p")).toEqual([]);
    const events = await resolved();
    expect(events.map(event => [event.actorKind, (event.payload as { localeChange?: unknown }).localeChange])).toEqual(expect.arrayContaining([
      ["USER", expect.objectContaining({ locale: "ko", operation: "REMOVE", outcome: "active" })],
      ["USER", expect.objectContaining({ locale: "fr", operation: "ADD", outcome: "orphan" })],
      ["USER", expect.objectContaining({ locale: "ja", operation: "REMOVE", outcome: "orphan" })],
    ]));
    expect(events).toHaveLength(3);
  });

  it("부분 적재(파싱 못 한 파일)는 의도를 지우지 않고 빈 ADD도 orphan하지 않는다", async () => {
    await seed();
    await request("s-web", "fr", "ADD");
    await request("s-web", "ko", "REMOVE");
    expect(await sync(await approval(), tree({ web: ["en", "ko", "ja"], app: ["en", "ko", "ja"] }, { unreadable: ["web:ja"] }))).toMatchObject({ ok: true,
      surfaces: expect.arrayContaining([expect.objectContaining({ surfaceSlug: "web", status: "partial" })]) });
    expect(await rows()).toEqual([{ surfaceId: "s-web", localeCode: "fr", operation: "ADD" }, { surfaceId: "s-web", localeCode: "ko", operation: "REMOVE" }]);
    expect(await presence("s-web")).toMatchObject({ fr: "active" });
  });
});

describe("소스 제거·재등록", () => {
  const APP = { slug: "fixture", surfaceSlug: "app" };

  it("편집 0이어도 언어 변경이 있으면 승인을 요구하고, 제거가 그 소스의 의도·전달 목록만 지운다 — 되살려도 삭제 의도가 새지 않는다", async () => {
    await seed();
    await request("s-app", "ko", "REMOVE");
    await deliver("s-app", [{ localeCode: "ko", effect: "delete" }]);
    await request("s-web", "ko", "REMOVE");
    const preview = await previewSurfaceRemoval(prisma, OWNER, APP);
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.approval).not.toBeNull();
    expect(await removeSurface(prisma, OWNER, { ...APP, approval: null })).toEqual({ ok: false, error: "stale-approval" });
    // 승인 뒤 같은 소스의 언어 변경 → 옛 승인 거부.
    await request("s-app", "fr", "ADD");
    expect(await removeSurface(prisma, OWNER, { ...APP, approval: preview.approval })).toEqual({ ok: false, error: "stale-approval" });
    const fresh = await previewSurfaceRemoval(prisma, OWNER, APP);
    if (!fresh.ok) throw new Error(fresh.error);
    expect(await removeSurface(prisma, OWNER, { ...APP, approval: fresh.approval })).toEqual({ ok: true });
    expect(await rows()).toEqual([{ surfaceId: "s-web", localeCode: "ko", operation: "REMOVE" }]);
    expect(await prisma.deliveryConfirmation.findFirstOrThrow({ where: { projectId: "p", surfaceId: "s-app" } })).toMatchObject({ deliveredLocaleChanges: null });
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { archivedAt: null } });
    expect(await readLocaleStates(prisma, "p", "s-app")).toEqual([]);
  });

  it("언어 변경이 없으면 편집 0의 제거는 지금처럼 승인 없이 된다", async () => {
    await seed();
    const preview = await previewSurfaceRemoval(prisma, OWNER, APP);
    expect(preview).toMatchObject({ ok: true, approval: null });
    expect(await removeSurface(prisma, OWNER, { ...APP, approval: null })).toEqual({ ok: true });
  });
});

describe("기준 브랜치 변경", () => {
  it("언어 변경 행이 있으면 `locale-change-pending`으로 거부하고 아무것도 바꾸지 않는다 — 행이 없어지면 바뀐다", async () => {
    await seed();
    await request("s-web", "ko", "REMOVE");
    expect(await changeBaseBranch(prisma, OWNER, { slug: "fixture", baseBranch: "release" })).toEqual({ ok: false, error: "locale-change-pending" });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).toMatchObject({ baseBranch: "main" });
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "settings.baseBranchChanged" } })).toBe(0);
    await prisma.localeChange.deleteMany({ where: { projectId: "p" } });
    expect(await changeBaseBranch(prisma, OWNER, { slug: "fixture", baseBranch: "release" })).toEqual({ ok: true });
  });
});
