import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { hashPushToken } from "@/lib/push/token";
import { addSurfacesFromSnapshot, type AddSurfaceSnapshot } from "@/lib/surfaces/create";
import { previewSurfaceRemoval, removeSurface } from "@/lib/surfaces/remove";

/**
 * **소스 제거와 되살림** (sources-add-remove B-T4·B-T5 — ARCHITECTURE §5.9).
 *
 * ⚠️ 가짜로는 원리적으로 못 보는 넷을 여기서 본다: `Project` 잠금이 만드는 직렬화(동시 제거 둘의 `last-source`) ·
 * 복합 FK `(id, defaultSurfaceId)`가 받아들이는 승계 · 사건 실패의 실제 롤백 · strict 첫 적재가 승인 토큰만 덮는 것.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPrisma: () => db.prisma }));
vi.mock("@/lib/projects/open-pr", () => ({ loadOpenPrUrl: async () => null, loadOpenPrForImportGate: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const directory = mkdtempSync(join(tmpdir(), "malmoi-source-remove-"));
let binaries: string;
const PORT = 55621;
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
  db.prisma = prisma;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const PUSH_TOKEN = "isolated-source-remove-fixture";
const REPOSITORY = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };
const OWNER = { userId: "owner" };
const OLD_COMMIT_AT = new Date("2026-12-01T00:00:00Z");
const HEAD_AT = "2026-10-01T00:00:00.000Z";

async function seedSurface(id: string, slug: string, over: { orphanKey?: boolean } = {}) {
  await prisma.translationSurface.create({ data: {
    id, projectId: "p", slug, adapterName: "json-catalog", pathTemplate: `${slug}/{locale}.json`, baseLocale: "en",
    lastCommitSha: "a".repeat(40), lastCommitAt: OLD_COMMIT_AT, lastImportedAt: OLD_COMMIT_AT,
  } });
  for (const code of ["en", "ko"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: id, code, name: code, isBase: code === "en" } });
  await prisma.stringKey.create({ data: { id: `${id}-hello`, projectId: "p", surfaceId: id, key: "hello", namespace: "", sourceText: "Hello", sourceHash: "h" } });
  await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-hello`, localeCode: "en", value: "Hello" } });
  await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-hello`, localeCode: "ko", value: "Old" } });
  if (over.orphanKey) {
    await prisma.stringKey.create({ data: { id: `${id}-gone`, projectId: "p", surfaceId: id, key: "gone", namespace: "", sourceText: "Gone", sourceHash: "g", orphaned: true } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-gone`, localeCode: "en", value: "Gone" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-gone`, localeCode: "ko", value: "Gone-ko" } });
  }
}

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", ...REPOSITORY, pushTokenHash: hashPushToken(PUSH_TOKEN) } });
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.user.create({ data: { id: "editor", email: "editor-fixture" } });
  await prisma.projectMember.create({ data: { projectId: "p", userId: "owner", role: "OWNER" } });
  await prisma.projectMember.create({ data: { projectId: "p", userId: "editor", role: "EDITOR" } });
  await seedSurface("s-web", "web", { orphanKey: true });
  await seedSurface("s-app", "app");
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s-web" } });
});

const remove = (surfaceSlug: string, approval: string | null = null, subject: { userId: string } = OWNER) =>
  removeSurface(prisma, subject, { slug: "p", surfaceSlug, approval });

async function translations(surfaceId: string) {
  return prisma.translation.findMany({ where: { projectId: "p", surfaceId }, orderBy: [{ keyId: "asc" }, { localeCode: "asc" }],
    select: { keyId: true, localeCode: true, value: true, pendingEditToken: true, updatedBy: true } });
}

function snapshot(over: Partial<AddSurfaceSnapshot> & { blobs?: Map<string, string> } = {}): AddSurfaceSnapshot {
  return {
    projectId: "p", userId: "owner", repository: REPOSITORY,
    format: { adapter: "json-catalog", pathTemplate: "web/{locale}.json", locales: ["en", "ko"] },
    baseLocale: "en", headSha: "c".repeat(40), headCommittedAt: HEAD_AT,
    paths: ["web/en.json", "web/ko.json", "app/en.json", "app/ko.json"],
    targets: ["web/en.json", "web/ko.json"],
    blobs: new Map([["web/en.json", '{"hello":"Hello","gone":"Gone"}'], ["web/ko.json", '{"hello":"Repo-ko"}']]),
    ...over,
  };
}
const readd = (input: AddSurfaceSnapshot = snapshot()) => addSurfacesFromSnapshot(prisma, { projectSlug: "p", inputs: [input], credential: undefined });

describe("removeSurface", () => {
  it("기본 소스를 빼면 같은 tx에서 slug 오름차순 첫째가 기본이 되고 사건이 남는다 — 번역 행은 그대로다", async () => {
    const before = await translations("s-web");
    expect(await remove("web")).toEqual({ ok: true });
    const surface = await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } });
    expect(surface.archivedAt).not.toBeNull();
    // 복합 FK가 받아들인 승계다 — 다른 프로젝트 표면이면 UPDATE가 거부된다.
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).defaultSurfaceId).toBe("s-app");
    expect(await translations("s-web")).toEqual(before);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "surface.removed" } });
    expect(event).toMatchObject({ kind: "SURFACE", actorUserId: "owner", surfaceIds: ["s-web"] });
    expect(event.payload).toMatchObject({ surfaceSlug: "web" });
  });

  it("기본이 아닌 소스는 기본을 옮기지 않는다", async () => {
    expect(await remove("app")).toEqual({ ok: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).defaultSurfaceId).toBe("s-web");
  });

  it("남은 활성 둘을 동시에 제거하면 하나만 성공하고 다른 쪽은 last-source다", async () => {
    const results = await Promise.all([remove("web"), remove("app")]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toEqual([{ ok: false, error: "last-source" }]);
    expect(await prisma.translationSurface.count({ where: { projectId: "p", archivedAt: null } })).toBe(1);
  });

  it("살아 있는 적재 표시가 있으면 importing이다 — 만료된 표시는 막지 않는다", async () => {
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { lastImportStartedAt: new Date() } });
    expect(await remove("app")).toEqual({ ok: false, error: "importing" });
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { lastImportStartedAt: new Date("2026-01-01T00:00:00Z") } });
    expect(await remove("app")).toEqual({ ok: true });
  });

  it("EDITOR는 forbidden, 보관된 프로젝트는 archived, 이미 제거된 소스는 not-found다", async () => {
    expect(await remove("app", null, { userId: "editor" })).toEqual({ ok: false, error: "forbidden" });
    expect(await remove("app")).toEqual({ ok: true });
    expect(await remove("app")).toEqual({ ok: false, error: "not-found" });
    await prisma.project.update({ where: { id: "p" }, data: { archivedAt: new Date() } });
    expect(await remove("web")).toEqual({ ok: false, error: "archived" });
    expect(await previewSurfaceRemoval(prisma, OWNER, { slug: "p", surfaceSlug: "web" })).toEqual({ ok: false, error: "archived" });
  });

  it("미전달이 있으면 지문이 필요하다 — orphaned 셀까지 세고, 낡은 지문은 stale-approval이고 아무것도 안 바뀐다", async () => {
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "s-web-hello", localeCode: "ko" } }, data: { value: "Edited", pendingEditToken: "t1", updatedBy: "editor" } });
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "s-web-gone", localeCode: "ko" } }, data: { value: "Gone-edit", pendingEditToken: "t2", updatedBy: "editor" } });
    const preview = await previewSurfaceRemoval(prisma, OWNER, { slug: "p", surfaceSlug: "web" });
    expect(preview).toMatchObject({ ok: true, pendingCount: 2, openPr: "none" });
    if (!preview.ok || preview.approval === null) throw new Error("expected approval");

    expect(await remove("web", null)).toEqual({ ok: false, error: "stale-approval" });
    // 미리보기 뒤 새 편집 — 같은 수가 아니라 다른 토큰이다.
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "s-web-hello", localeCode: "ko" } }, data: { pendingEditToken: "t3" } });
    expect(await remove("web", preview.approval)).toEqual({ ok: false, error: "stale-approval" });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).archivedAt).toBeNull();
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "surface.removed" } })).toBe(0);

    const fresh = await previewSurfaceRemoval(prisma, OWNER, { slug: "p", surfaceSlug: "web" });
    if (!fresh.ok) throw new Error("expected preview");
    expect(await remove("web", fresh.approval)).toEqual({ ok: true });
  });

  it("미전달이 없으면 미리보기의 지문은 null이고 지문 없이 제거된다", async () => {
    expect(await previewSurfaceRemoval(prisma, OWNER, { slug: "p", surfaceSlug: "app" })).toEqual({ ok: true, pendingCount: 0, approval: null, openPr: "none" });
    expect(await remove("app", null)).toEqual({ ok: true });
  });

  it("미리보기도 판정을 지난다 — 마지막 소스는 last-source다", async () => {
    expect(await remove("app")).toEqual({ ok: true });
    expect(await previewSurfaceRemoval(prisma, OWNER, { slug: "p", surfaceSlug: "web" })).toEqual({ ok: false, error: "last-source" });
  });

  it("사건 쓰기가 실패하면 제거·기본 승계가 함께 롤백된다", async () => {
    await pool.query(`CREATE FUNCTION reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;
      CREATE TRIGGER reject_event BEFORE INSERT ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION reject_event()`);
    await expect(remove("web")).rejects.toThrow();
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).archivedAt).toBeNull();
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p" } })).defaultSurfaceId).toBe("s-web");
  });
});

describe("재추가 = 되살림", () => {
  it("같은 경로·어댑터면 같은 행이 되살아난다 — id·slug 유지, 옛 orphaned 키가 리포에 있으면 돌아온다, 옛 lastCommitAt이 막지 않는다", async () => {
    expect(await remove("web")).toEqual({ ok: true });
    expect(await readd()).toEqual([{ pathTemplate: "web/{locale}.json", surfaceSlug: "web", count: 2, failed: 0 }]);
    const surface = await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } });
    expect(surface).toMatchObject({ slug: "web", archivedAt: null, lastCommitSha: "c".repeat(40), lastCommitAt: new Date(HEAD_AT), lastImportError: null });
    expect(await prisma.translationSurface.count({ where: { projectId: "p" } })).toBe(2);
    expect(await prisma.stringKey.findUniqueOrThrow({ where: { id: "s-web-gone" } })).toMatchObject({ orphaned: false });
    // strict 첫 적재 — 토큰 없는 셀은 리포 값으로 덮이고 저자가 비워진다.
    expect(await prisma.translation.findUniqueOrThrow({ where: { keyId_localeCode: { keyId: "s-web-hello", localeCode: "ko" } } })).toMatchObject({ value: "Repo-ko", updatedBy: null });
    // 되살림 사건은 추가 사건과 같다.
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "surface.added", surfaceIds: { has: "s-web" } } })).toBe(1);
  });

  it("그 소스의 미전달 토큰 전부(orphaned 포함)를 승인해 덮는다 — 리포에 값이 없는 칸은 미전달로 남는다", async () => {
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "s-web-hello", localeCode: "ko" } }, data: { value: "Edited", pendingEditToken: "t1", updatedBy: "editor" } });
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "s-web-gone", localeCode: "ko" } }, data: { value: "Gone-edit", pendingEditToken: "t2", updatedBy: "editor" } });
    const preview = await previewSurfaceRemoval(prisma, OWNER, { slug: "p", surfaceSlug: "web" });
    if (!preview.ok) throw new Error("expected preview");
    expect(await remove("web", preview.approval)).toEqual({ ok: true });
    await readd();
    expect(await prisma.translation.findUniqueOrThrow({ where: { keyId_localeCode: { keyId: "s-web-hello", localeCode: "ko" } } }))
      .toMatchObject({ value: "Repo-ko", pendingEditToken: null, updatedBy: null });
    expect(await prisma.translation.findUniqueOrThrow({ where: { keyId_localeCode: { keyId: "s-web-gone", localeCode: "ko" } } }))
      .toMatchObject({ value: "Gone-edit", pendingEditToken: "t2" });
  });

  it("다른 소스의 미전달 편집은 승인하지 않는다", async () => {
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "s-app-hello", localeCode: "ko" } }, data: { value: "App-edit", pendingEditToken: "ta" } });
    expect(await remove("web")).toEqual({ ok: true });
    await readd();
    expect(await prisma.translation.findUniqueOrThrow({ where: { keyId_localeCode: { keyId: "s-app-hello", localeCode: "ko" } } }))
      .toMatchObject({ value: "App-edit", pendingEditToken: "ta" });
  });

  it("기준 언어를 바꿔 되살려도 첫 적재다", async () => {
    expect(await remove("web")).toEqual({ ok: true });
    await readd(snapshot({ baseLocale: "ko" }));
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).toMatchObject({ baseLocale: "ko", archivedAt: null, declaredBaseLocale: null });
    expect(await prisma.locale.findUniqueOrThrow({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-web", code: "ko" } } })).toMatchObject({ isBase: true });
  });

  it("일치 행이 여럿이면 archivedAt이 최신인 같은 어댑터 행이고, 어댑터만 다른 행은 고르지 않는다 — slug 충돌이 없다", async () => {
    expect(await remove("web")).toEqual({ ok: true });
    // 같은 경로를 다른 어댑터로 추가했다가 다시 뺀 행 — 더 최신이지만 어댑터가 다르다.
    await prisma.translationSurface.create({ data: { id: "s-web-ts", projectId: "p", slug: "web-2", adapterName: "ts-dict", pathTemplate: "web/{locale}.json", baseLocale: "en", archivedAt: new Date(Date.now() + 60_000) } });
    expect(await readd()).toMatchObject([{ surfaceSlug: "web" }]);
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).archivedAt).toBeNull();
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web-ts" } })).archivedAt).not.toBeNull();
  });

  it("어댑터가 다르면 새 행이다 — 제거된 slug를 피한다", async () => {
    expect(await remove("web")).toEqual({ ok: true });
    await prisma.translationSurface.update({ where: { id: "s-web" }, data: { adapterName: "ts-dict" } });
    expect(await readd()).toMatchObject([{ surfaceSlug: "web-2" }]);
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).archivedAt).not.toBeNull();
    expect(await prisma.translationSurface.count({ where: { projectId: "p" } })).toBe(3);
  });

  it("되살릴 행의 경로를 다른 활성 소스가 쥐고 있으면 path-conflict이고 되살아나지 않는다", async () => {
    expect(await remove("web")).toEqual({ ok: true });
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { pathTemplate: "web/{locale}.json" } });
    await expect(readd()).rejects.toMatchObject({ code: "path-conflict" });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).archivedAt).not.toBeNull();
  });
});

describe("제거된 소스로 온 CI", () => {
  const ciBody = (surfaceSlug: string) => ({ projectSlug: "p", surfaceSlug, commitSha: "d".repeat(40), commitAt: "2026-12-02T00:00:00Z" });
  const pushRequest = (surfaceSlug = "app") => new Request("http://localhost/api/push", { method: "POST", headers: { authorization: `Bearer ${PUSH_TOKEN}` }, body: JSON.stringify({
    ...ciBody(surfaceSlug), format: { adapter: "json-catalog", pathTemplate: `${surfaceSlug}/{locale}.json`, baseLocale: "en", nested: false },
    locales: ["en", "ko"], keys: [{ key: "hello", namespace: "_root", sourceText: "Hello" }],
    translations: [{ key: "hello", locale: "en", value: "Hello" }, { key: "hello", locale: "ko", value: "From-ci" }], refs: [],
  }) });
  const refusals = () => prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "import.ci" }, select: { result: true, surfaceIds: true, payload: true } });

  it.each(["push", "failure"] as const)("/api/%s는 적재하지 않고 409 surface removed를 돌려주며 거부로 남긴다", async kind => {
    expect(await remove("app")).toEqual({ ok: true });
    const response = kind === "push"
      ? await (await import("@/app/api/push/route")).POST(pushRequest())
      : await (await import("@/app/api/push/failure/route")).POST(new Request("http://localhost/api/push/failure", { method: "POST", headers: { authorization: `Bearer ${PUSH_TOKEN}` }, body: JSON.stringify({ ...ciBody("app"), code: "parse-failed" }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "surface removed" });
    const events = await refusals();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ result: "notStarted", surfaceIds: ["s-app"], payload: { refusal: "surface-removed" } });
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-app" } })).toMatchObject({ lastImportError: null, lastImportStartedAt: null, lastCommitSha: "a".repeat(40) });
    expect((await translations("s-app")).find(row => row.localeCode === "ko")?.value).toBe("Old");
  });

  async function waitForLockWaiters(count: number) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'");
      if ((rows[0]?.n ?? 0) >= count) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`lock waiters never reached ${count}`);
  }

  it("제거와 push가 경합하면 — 사전 가드를 지난 push가 잠금 뒤 제거를 보고 surface removed로 거부된다(archived와 섞지 않는다)", async () => {
    const { POST } = await import("@/app/api/push/route");
    const holder = await pool.connect();
    await holder.query("BEGIN");
    await holder.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
    const pending = POST(pushRequest());
    await waitForLockWaiters(1);
    await holder.query(`UPDATE "TranslationSurface" SET "archivedAt" = now() WHERE "id" = 's-app'`);
    await holder.query("COMMIT");
    holder.release();

    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "surface removed" });
    expect((await refusals())[0]).toMatchObject({ result: "notStarted", payload: { refusal: "surface-removed" } });
    // 실패가 아니다 — 제거된 소스에 import-failed를 남기면 되살린 뒤의 상태가 옛 실패를 말한다.
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-app" } })).toMatchObject({ lastImportError: null, lastImportStartedAt: null, lastImportToken: null });
    expect((await translations("s-app")).find(row => row.localeCode === "ko")?.value).toBe("Old");
  });
});
