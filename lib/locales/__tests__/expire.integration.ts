import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { parseLogFilter } from "@/lib/events/filter";
import { loadEvents } from "@/lib/events/query";
import { eventSentence } from "@/lib/events/view";
import { en } from "@/messages/en";

import { expireLocaleChanges, type LocaleExpiryInput } from "../expire";
import { countLocaleWork, readLocaleStates } from "../work";

/**
 * **언어 변경 의도 만료와 작업 수** (locale-add design §1 "만료와 strict 적재" · orch O4). 순수 판정(`planLocaleExpiry`)은 표 테스트가 덮고,
 * 여기서는 I/O 껍데기가 잠금 뒤 다시 읽은 행·목록으로 판정하고, 결과대로 행·orphan·사건을 한 tx에 쓰는지를 본다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-expire-"));
let binaries: string;
const PORT = 55642;
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

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main" } });
  for (const [id, slug] of [["s-web", "web"], ["s-app", "app"]] as const) {
    await prisma.translationSurface.create({ data: { id, projectId: "p", slug, adapterName: "json-catalog", pathTemplate: `${slug}/{locale}.json`, baseLocale: "en" } });
    for (const code of ["en", "ko", "fr"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: id, code, name: code, isBase: code === "en" } });
    await prisma.stringKey.create({ data: { id: `${id}-hello`, projectId: "p", surfaceId: id, key: "hello", namespace: "", sourceText: "Hello", sourceHash: "h" } });
    await prisma.stringKey.create({ data: { id: `${id}-gone`, projectId: "p", surfaceId: id, key: "gone", namespace: "", sourceText: "Gone", sourceHash: "g", orphaned: true } });
  }
});

async function request(surfaceId: string, localeCode: string, operation: "ADD" | "REMOVE") {
  await prisma.localeChange.create({ data: { projectId: "p", surfaceId, localeCode, operation } });
}

async function deliver(surfaceId: string, effects: { localeCode: string; effect: "create" | "delete" }[] | null, invalidated = false) {
  const run = await prisma.syncRun.create({ data: { projectId: "p", status: "SUCCEEDED", trigger: "MANUAL" } });
  await prisma.deliveryConfirmation.create({ data: { projectId: "p", surfaceId, revision: `rev-${surfaceId}`, syncRunId: run.id, contextFingerprint: "ctx",
    ...(effects === null ? {} : { deliveredLocaleChanges: effects }), invalidatedAt: invalidated ? new Date() : null } });
}

const expire = (over: Partial<LocaleExpiryInput>) => prisma.$transaction(tx => expireLocaleChanges(tx, {
  projectId: "p", surfaceId: "s-web", surfaceSlug: "web", pullRequest: "none-open",
  observed: { status: "observed", locales: ["en", "ko", "fr"] }, actor: { kind: "AUTOMATION" }, ...over,
}));

async function locales(surfaceId = "s-web") {
  return prisma.locale.findMany({ where: { projectId: "p", surfaceId }, orderBy: { code: "asc" }, select: { code: true, orphaned: true } });
}

async function sentences() {
  const page = await loadEvents(prisma, en, "p", parseLogFilter({}), { timeZone: "UTC" });
  return page.rows.map(row => renderToStaticMarkup(eventSentence(en, "en", row, { actor: "Malmoi", key: null })));
}

describe("expireLocaleChanges", () => {
  it("머지된 제거 — 전달 확인·열린 PR 없음·base에 파일 없음 → 행 삭제 + orphan + 사건", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    expect(await expire({ observed: { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [{ localeCode: "ko", operation: "REMOVE", presence: "orphan" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
    expect(await locales()).toEqual([{ code: "en", orphaned: false }, { code: "fr", orphaned: false }, { code: "ko", orphaned: true }]);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "surface.localeChangeResolved" } });
    expect(event).toMatchObject({ kind: "SURFACE", actorKind: "AUTOMATION", surfaceIds: ["s-web"], result: null });
    expect(event.payload).toMatchObject({ surfaceSlug: "web", localeChange: { locale: "ko", operation: "REMOVE", outcome: "orphan" } });
    expect((await sentences())[0]).not.toContain("added the web source");
    // 다른 소스는 그대로다.
    expect(await locales("s-app")).toEqual([{ code: "en", orphaned: false }, { code: "fr", orphaned: false }, { code: "ko", orphaned: false }]);
  });

  it("머지 없이 닫힌 제거 — 파일이 남았으면 활성으로 돌아오고 요청이 사라진다", async () => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    expect(await expire({})).toEqual({ expired: [{ localeCode: "ko", operation: "REMOVE", presence: "active" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
    expect(await locales()).toContainEqual({ code: "ko", orphaned: false });
  });

  it.each<[string, Partial<LocaleExpiryInput>, string]>([
    ["열린 PR", { pullRequest: "open" }, "pr-open"],
    ["PR 조회 실패", { pullRequest: "failed" }, "pr-check-failed"],
    ["base 읽기 실패", { observed: { status: "unreadable" } }, "base-unreadable"],
    // 관측 0개는 "비었다"가 아니다 — 사건·Logs에는 base 읽기 실패와 같은 보류로 나간다(A1 handoff).
    ["관측 로케일 0개", { observed: { status: "observed", locales: [] } }, "base-unreadable"],
  ])("%s → 보류, 아무것도 바꾸지 않는다", async (_label, over, held) => {
    await request("s-web", "ko", "REMOVE");
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }]);
    const before = await locales();
    expect(await expire({ ...over, observed: over.observed ?? { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [], held });
    expect(await prisma.localeChange.count()).toBe(1);
    expect(await locales()).toEqual(before);
    expect(await prisma.projectEvent.count()).toBe(0);
  });

  it("전달 전 요청·무효화 중인 확인은 만료하지 않는다", async () => {
    await request("s-web", "ko", "REMOVE");
    expect(await expire({ observed: { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [], held: "undelivered" });
    await deliver("s-web", [{ localeCode: "ko", effect: "delete" }], true);
    expect(await expire({ observed: { status: "observed", locales: ["en", "fr"] } })).toEqual({ expired: [], held: "undelivered" });
    expect(await prisma.localeChange.count()).toBe(1);
  });

  it("값 0개 ADD는 첫 값 저장 전 적재에 만료·orphan되지 않는다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await request("s-web", "de", "ADD");
    expect(await expire({})).toEqual({ expired: [], held: "undelivered" });
    expect(await locales()).toContainEqual({ code: "de", orphaned: false });
    expect(await prisma.localeChange.count()).toBe(1);
  });

  it("전달된 ADD가 base에 관측되면 일반 언어로 만료한다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo" } });
    await request("s-web", "de", "ADD");
    await deliver("s-web", [{ localeCode: "de", effect: "create" }]);
    expect(await expire({ observed: { status: "observed", locales: ["en", "ko", "fr", "de"] } }))
      .toEqual({ expired: [{ localeCode: "de", operation: "ADD", presence: "active" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
  });

  it("orphan인데 ADD 행(구버전 롤백 잔재)은 열린 PR이 있어도 만료한다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await request("s-web", "de", "ADD");
    expect(await expire({ pullRequest: "open" })).toEqual({ expired: [{ localeCode: "de", operation: "ADD", presence: "orphan" }], held: null });
    expect(await prisma.localeChange.count()).toBe(0);
  });

  it("행이 없으면 읽기만 하고 아무것도 쓰지 않는다", async () => {
    expect(await expire({})).toEqual({ expired: [], held: null });
    expect(await prisma.projectEvent.count()).toBe(0);
  });
});

describe("readLocaleStates · countLocaleWork", () => {
  it("값 수는 활성 키의 비지 않은 값만 센다 — 값 0개 ADD는 작업이 아니다", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de" } });
    await request("s-web", "de", "ADD");
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-gone", localeCode: "de", value: "Weg" } });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "" } });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    await prisma.translation.updateMany({ where: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de" }, data: { value: "Hallo" } });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    const [web] = await readLocaleStates(prisma, "p");
    expect(web).toMatchObject({ surfaceId: "s-web", current: [{ localeCode: "de", effect: "create" }], delivered: [], work: [{ localeCode: "de", current: "create", delivered: null }] });
    expect(web!.valueCounts.get("de")).toBe(1);
  });

  it("행 없이 전달 목록만 남은 소스(전달 후 취소)도 작업이다 — 보관된 소스는 세지 않는다", async () => {
    await deliver("s-app", [{ localeCode: "ko", effect: "delete" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    expect((await readLocaleStates(prisma, "p")).map(state => state.surfaceId)).toEqual(["s-app"]);
    expect(await countLocaleWork(prisma, "p", "s-web")).toBe(0);
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { archivedAt: new Date() } });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
  });

  it("호출자의 tx 스냅샷에서 읽는다", async () => {
    await request("s-web", "ko", "REMOVE");
    const counted = await prisma.$transaction(async tx => {
      const first = await countLocaleWork(tx, "p");
      await tx.localeChange.deleteMany({ where: { projectId: "p" } });
      return [first, await countLocaleWork(tx, "p")];
    });
    expect(counted).toEqual([1, 0]);
  });
});
