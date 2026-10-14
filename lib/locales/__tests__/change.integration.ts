import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { parseLogFilter } from "@/lib/events/filter";
import { loadEvents } from "@/lib/events/query";
import { eventMeta, eventSentence } from "@/lib/events/view";
import { applyKeySave } from "@/lib/keys/save-key";
import { previewKeyRevert } from "@/lib/keys/revert";
import { hashPushToken } from "@/lib/push/token";
import { declareBaseLocale } from "@/lib/sources/base-locale";
import { deliveryContextFingerprint } from "@/lib/translations/context";
import { en } from "@/messages/en";

import { addLocale, cancelLocaleRemoval, previewLocaleRemoval, removeLocale } from "../change";
import { countLocaleWork } from "../work";
import { waitForLockWait } from "./lock-wait";

/**
 * **언어 추가·제거·취소의 공통 코어** (locale-add tasks §3 — design §1·§3).
 *
 * 가짜로는 못 보는 것을 여기서 본다: `Project`→`TranslationSurface` 잠금의 직렬화 · Locale/LocaleChange/토큰/사건 한 tx의 롤백 ·
 * 잠금 뒤 재판정(경합) · 기존 쓰기 경로(저장·Revert·기준 언어)의 제거 상태 거부. 끝 단언은 Logs 뷰 모델 출력이다(/ship 6.2).
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPrisma: () => db.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-change-"));
let binaries: string;
const PORT = 55641;
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

const OWNER = { userId: "owner" };
const EDITOR = { userId: "editor" };
const WEB = { slug: "p", surfaceSlug: "web" };

async function seedSurface(id: string, slug: string, adapterName = "json-catalog") {
  await prisma.translationSurface.create({ data: { id, projectId: "p", slug, adapterName, pathTemplate: `${slug}/{locale}.json`, baseLocale: "en" } });
  for (const code of ["en", "ko"]) await prisma.locale.create({ data: { projectId: "p", surfaceId: id, code, name: code, isBase: code === "en" } });
  for (const key of ["hello", "bye"]) {
    await prisma.stringKey.create({ data: { id: `${id}-${key}`, projectId: "p", surfaceId: id, key, namespace: "", sourceText: key, sourceHash: key } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-${key}`, localeCode: "en", value: key } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: id, keyId: `${id}-${key}`, localeCode: "ko", value: `${key}-ko` } });
  }
  await prisma.stringKey.create({ data: { id: `${id}-gone`, projectId: "p", surfaceId: id, key: "gone", namespace: "", sourceText: "gone", sourceHash: "g", orphaned: true } });
}

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main", pushTokenHash: hashPushToken("locale-change-fixture") } });
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.user.create({ data: { id: "editor", email: "editor-fixture" } });
  await prisma.projectMember.create({ data: { projectId: "p", userId: "owner", role: "OWNER" } });
  await prisma.projectMember.create({ data: { projectId: "p", userId: "editor", role: "EDITOR" } });
  await seedSurface("s-web", "web");
  await seedSurface("s-app", "app");
  await prisma.project.update({ where: { id: "p" }, data: { defaultSurfaceId: "s-web" } });
});

/** 번역 화면 저장과 같은 코어(`applyKeySave`). */
const save = (surfaceId: string, key: string, localeCode: string, value: string, userId = "editor") =>
  applyKeySave(prisma, { projectId: "p", surfaceId, surfaceSlug: surfaceId.slice(2), keyId: `${surfaceId}-${key}`, userId, credential: undefined, changes: [{ localeCode, value }] });

async function cells(surfaceId: string, localeCode: string) {
  return prisma.translation.findMany({ where: { projectId: "p", surfaceId, localeCode }, orderBy: { keyId: "asc" },
    select: { keyId: true, value: true, updatedBy: true, pendingEditToken: true } });
}

/** 거부가 DB를 바꾸지 않았음을 보는 스냅샷 — 로케일·의도·토큰·사건. */
async function state() {
  return {
    locales: await prisma.locale.findMany({ where: { projectId: "p" }, orderBy: [{ surfaceId: "asc" }, { code: "asc" }], select: { surfaceId: true, code: true, orphaned: true } }),
    changes: await prisma.localeChange.findMany({ where: { projectId: "p" }, orderBy: [{ surfaceId: "asc" }, { localeCode: "asc" }] }),
    tokens: await prisma.translation.findMany({ where: { projectId: "p" }, orderBy: [{ surfaceId: "asc" }, { keyId: "asc" }, { localeCode: "asc" }], select: { localeCode: true, keyId: true, pendingEditToken: true, value: true } }),
    events: await prisma.projectEvent.count({ where: { projectId: "p" } }),
  };
}

/** Logs 화면이 그리는 문장·메타 — 끝 단언은 DB 행이 아니라 이 출력이다(/ship 6.2). */
async function logLines() {
  const page = await loadEvents(prisma, en, "p", parseLogFilter({ kind: "sources" }), { timeZone: "UTC" });
  return page.rows.map(row => ({
    subtype: row.subtype,
    sentence: renderToStaticMarkup(eventSentence(en, "en", row, { actor: "Owner", key: null })),
    meta: eventMeta(en, row, false).map(part => (typeof part === "string" ? part : "text" in part ? String(part.text) : "code" in part ? part.code : "")).join(" | "),
  }));
}

async function approvalFor(localeCode: string, subject = OWNER) {
  const preview = await previewLocaleRemoval(prisma, subject, { ...WEB, localeCode });
  if (!preview.ok) throw new Error(`preview refused: ${preview.error}`);
  return preview.approval;
}

/**
 * 유효한 전달 확인 — 실제 지문이라 그 뒤의 저장이 복원 기준(`TranslationBaseline`)을 남긴다(Revert와 같은 전제).
 * `effects`는 그 확인이 실은 파일 집합 변경이다.
 */
async function confirm(surfaceId: string, effects: { localeCode: string; effect: "create" | "delete" }[] = []) {
  const run = await prisma.syncRun.create({ data: { projectId: "p", status: "SUCCEEDED", trigger: "MANUAL", startedAt: new Date(Date.now() - 600_000), finishedAt: new Date(Date.now() - 590_000) } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: "p" } });
  const surface = await prisma.translationSurface.findUniqueOrThrow({ where: { id: surfaceId } });
  const contextFingerprint = deliveryContextFingerprint({ repoHost: project.repoHost, repositoryId: project.repositoryId, baseBranch: project.baseBranch, surface });
  const data = { revision: `rev-${run.id}`, syncRunId: run.id, contextFingerprint, deliveredLocaleChanges: effects, invalidatedAt: null };
  await prisma.deliveryConfirmation.upsert({ where: { projectId_surfaceId: { projectId: "p", surfaceId } }, create: { projectId: "p", surfaceId, ...data }, update: data });
}

/** Publish 성공 확정을 흉내 낸다 — 그 소스의 미전달 토큰·기준을 풀고 확인을 새로 세운다. */
async function publishConfirmed(surfaceId: string, effects: { localeCode: string; effect: "create" | "delete" }[]) {
  await prisma.translation.updateMany({ where: { projectId: "p", surfaceId }, data: { pendingEditToken: null } });
  await prisma.translationBaseline.deleteMany({ where: { projectId: "p", surfaceId } });
  await confirm(surfaceId, effects);
}

/** 다음 Publish가 첫 외부 쓰기 전에 거는 무효화(또는 설정 변경의 무효화) — 다음 성공 확인만 푼다. */
async function invalidate(surfaceId: string) {
  await prisma.deliveryConfirmation.updateMany({ where: { projectId: "p", surfaceId }, data: { invalidatedAt: new Date() } });
}

describe("addLocale — 새 언어", () => {
  it("Locale·ADD 행·사건이 한 tx에 생기고 바로 편집할 수 있다", async () => {
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: true, action: "create", path: "web/fr.json", reissued: 0 });
    expect(await prisma.locale.findUniqueOrThrow({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-web", code: "fr" } } }))
      .toMatchObject({ orphaned: false, isBase: false });
    expect(await prisma.localeChange.findMany({ where: { projectId: "p" } })).toMatchObject([{ surfaceId: "s-web", localeCode: "fr", operation: "ADD" }]);
    // 값 0개 ADD는 파일을 내지 않는다 — Publish 작업이 아니다.
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    expect(await save("s-web", "hello", "fr", "Bonjour")).toMatchObject({ ok: true });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    const lines = await logLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.subtype).toBe("surface.localeAdded");
    expect(lines[0]!.sentence).not.toContain("added the web source");
    expect(lines[0]!.meta).toContain("fr");
  });

  it("orphan 행을 되살린다 — 값 있는 활성 셀에만 새 토큰, 값·저자 유지, 기준 행 없음", async () => {
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-web", code: "de", name: "de", orphaned: true } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "de", value: "Hallo", updatedBy: "editor" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-bye", localeCode: "de", value: "" } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-web", keyId: "s-web-gone", localeCode: "de", value: "Weg" } });
    // 소스 경계 그물(R-B1 Y2 · M8) — 다른 소스의 같은 코드 orphan 셀은 토큰을 받지 않는다.
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s-app", code: "de", name: "de", orphaned: true } });
    await prisma.translation.create({ data: { projectId: "p", surfaceId: "s-app", keyId: "s-app-hello", localeCode: "de", value: "App-Hallo" } });
    const before = await cells("s-web", "de");

    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "de" })).toEqual({ ok: true, action: "revive", path: "web/de.json", reissued: 1 });
    const after = await cells("s-web", "de");
    expect(after.map(({ pendingEditToken, ...rest }) => rest)).toEqual(before.map(({ pendingEditToken, ...rest }) => rest));
    expect(after.find(cell => cell.keyId === "s-web-hello")!.pendingEditToken).not.toBeNull();
    expect(after.find(cell => cell.keyId === "s-web-bye")!.pendingEditToken).toBeNull();
    expect(after.find(cell => cell.keyId === "s-web-gone")!.pendingEditToken).toBeNull();
    expect(await prisma.translationBaseline.count({ where: { projectId: "p" } })).toBe(0);
    expect((await prisma.locale.findUniqueOrThrow({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-web", code: "de" } } })).orphaned).toBe(false);
    expect(await cells("s-app", "de")).toMatchObject([{ keyId: "s-app-hello", pendingEditToken: null }]);
    expect((await prisma.locale.findUniqueOrThrow({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-app", code: "de" } } })).orphaned).toBe(true);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "surface.localeAdded" } });
    expect(event.payload).toMatchObject({ localeChange: { locale: "de", operation: "ADD", revived: true } });
  });

  it.each<[string, { userId: string }, string, string]>([
    ["EDITOR", EDITOR, "fr", "forbidden"],
    ["이미 활성", OWNER, "ko", "already-active"],
    ["대소문자 충돌", OWNER, "KO", "locale-collision"],
    ["경로 이탈", OWNER, "../x", "invalid-code"],
    ["로케일 아닌 코드", OWNER, "package", "invalid-code"],
    ["__proto__", OWNER, "__proto__", "invalid-code"],
  ])("%s는 거부하고 DB를 바꾸지 않는다", async (_label, subject, localeCode, error) => {
    const before = await state();
    expect(await addLocale(prisma, subject, { ...WEB, localeCode })).toEqual({ ok: false, error });
    expect(await state()).toEqual(before);
  });

  it("보관된 프로젝트·비지원 포맷은 거부한다", async () => {
    await prisma.translationSurface.update({ where: { id: "s-app" }, data: { adapterName: "ts-dict" } });
    let before = await state();
    expect(await addLocale(prisma, OWNER, { slug: "p", surfaceSlug: "app", localeCode: "fr" })).toEqual({ ok: false, error: "unsupported-format" });
    expect(await state()).toEqual(before);
    await prisma.project.update({ where: { id: "p" }, data: { archivedAt: new Date() } });
    before = await state();
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: false, error: "archived" });
    expect(await state()).toEqual(before);
  });

  it("사건 쓰기가 실패하면 Locale·ADD 행이 함께 롤백된다", async () => {
    await pool.query(`CREATE FUNCTION reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;
      CREATE TRIGGER reject_event BEFORE INSERT ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION reject_event()`);
    const before = await state();
    await expect(addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).rejects.toThrow();
    expect(await state()).toEqual(before);
  });
});

describe("제거 미리보기·실행", () => {
  it("미리보기는 쓰지 않고 대상 경로·번역 수·그 언어 미전달 수·지문을 돌려준다", async () => {
    await confirm("s-web");
    await save("s-web", "hello", "ko", "안녕");
    await save("s-web", "hello", "en", "Hi");
    // 소스 경계 그물(R-B1 Y2 · M1) — 다른 소스의 같은 코드 편집은 이 소스의 미전달 수가 아니다.
    await save("s-app", "hello", "ko", "앱");
    const before = await state();
    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    expect(preview).toMatchObject({ ok: true, kind: "request-removal", path: "web/ko.json", translations: 2, pendingCount: 1, delivered: false });
    expect(await state()).toEqual(before);
  });

  it("승인 없음·낡은 승인은 거부하고, 유효한 승인은 REMOVE 행 + 그 언어 편집만 마지막 전달 값으로 폐기 + 사건", async () => {
    await confirm("s-web");
    await save("s-web", "hello", "ko", "안녕");
    await save("s-web", "hello", "en", "Hi");
    const stale = await approvalFor("ko");
    await save("s-web", "bye", "ko", "잘가");
    let before = await state();
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: null })).toEqual({ ok: false, error: "approval-required" });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: stale })).toEqual({ ok: false, error: "stale-approval" });
    expect(await state()).toEqual(before);

    const enBefore = await cells("s-web", "en");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await approvalFor("ko") })).toEqual({ ok: true, kind: "request-removal", discarded: 2 });
    expect((await cells("s-web", "ko")).every(cell => cell.pendingEditToken === null)).toBe(true);
    // 폐기는 Revert와 같은 의미다 — 마지막 전달 값으로 되돌리고 기준 행을 지운다(design §3, R-B1 Y1).
    expect((await cells("s-web", "ko")).map(cell => [cell.keyId, cell.value])).toEqual([["s-web-bye", "bye-ko"], ["s-web-hello", "hello-ko"]]);
    // 저자는 되돌린 사람이다 — Revert와 같다(R-B1b Z1).
    expect((await cells("s-web", "ko")).map(cell => cell.updatedBy)).toEqual(["owner", "owner"]);
    expect(await prisma.translationBaseline.count({ where: { projectId: "p", surfaceId: "s-web", localeCode: "ko" } })).toBe(0);
    expect(await cells("s-web", "en")).toEqual(enBefore);
    // 제거 요청은 바로 orphan하지 않는다 — 취소하면 편집을 다시 허용해야 한다.
    expect((await prisma.locale.findUniqueOrThrow({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-web", code: "ko" } } })).orphaned).toBe(false);
    expect(await prisma.localeChange.findMany({ where: { projectId: "p" } })).toMatchObject([{ surfaceId: "s-web", localeCode: "ko", operation: "REMOVE" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "surface.localeRemovalRequested" } });
    expect(event.payload).toMatchObject({ localeChange: { locale: "ko", operation: "REMOVE", discarded: 2 } });

    before = await state();
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: "x" })).toEqual({ ok: false, error: "removal-pending" });
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "removal-pending" });
    expect(await state()).toEqual(before);
  });

  it("기준 언어·선언된 기준 언어·EDITOR·없는 언어는 거부한다", async () => {
    const before = await state();
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "en" })).toEqual({ ok: false, error: "base-locale" });
    expect(await previewLocaleRemoval(prisma, EDITOR, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "forbidden" });
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: false, error: "not-found" });
    expect(await removeLocale(prisma, EDITOR, { ...WEB, localeCode: "ko", approval: "x" })).toEqual({ ok: false, error: "forbidden" });
    await prisma.translationSurface.update({ where: { id: "s-web" }, data: { declaredBaseLocale: "ko" } });
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "base-locale" });
    await prisma.translationSurface.update({ where: { id: "s-web" }, data: { declaredBaseLocale: null } });
    expect(await state()).toEqual(before);
  });

  it("승인 뒤 기준 언어로 선언되면 잠금 뒤 재판정이 막는다", async () => {
    const approval = await approvalFor("ko");
    await prisma.translationSurface.update({ where: { id: "s-web" }, data: { declaredBaseLocale: "ko" } });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval })).toEqual({ ok: false, error: "base-locale" });
    expect(await prisma.localeChange.count()).toBe(0);
  });

  it("제거 → 제거 취소 뒤 폐기한 셀은 마지막 전달 값이고 추적이 없다 — 다음 Publish에 조용히 실리지 않는다", async () => {
    await confirm("s-web");
    await save("s-web", "hello", "ko", "미전달");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await approvalFor("ko") })).toEqual({ ok: true, kind: "request-removal", discarded: 1 });
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: false });
    expect((await cells("s-web", "ko")).find(cell => cell.keyId === "s-web-hello")).toMatchObject({ value: "hello-ko", pendingEditToken: null });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    const reverted = await prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "translation.reverted" } });
    expect(reverted.map(event => event.payload)).toMatchObject([{ key: "hello", locale: "ko", before: "미전달", after: "hello-ko" }]);
  });

  it("복원 기준이 없는 미전달 셀이 있으면 제거를 거부한다 — 미리보기와 실행 모두, 쓰기 0", async () => {
    // 확인 없이 저장 — 기준이 남지 않는다(Revert의 baseline-unknown과 같은 상태).
    await save("s-web", "hello", "ko", "안녕");
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "baseline-unknown" });
    // 승인을 받은 뒤 기준이 사라진 경우 — 실행이 잠금 뒤 다시 본다.
    await prisma.translation.updateMany({ where: { projectId: "p", surfaceId: "s-web", localeCode: "ko" }, data: { pendingEditToken: null } });
    await confirm("s-web");
    await save("s-web", "hello", "ko", "다시");
    const approval = await approvalFor("ko");
    await prisma.translationBaseline.deleteMany({ where: { projectId: "p", surfaceId: "s-web", localeCode: "ko" } });
    const before = await state();
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval })).toEqual({ ok: false, error: "baseline-unknown" });
    expect(await state()).toEqual(before);
  });

  it("적재 lease 동안은 제거를 거부한다 — Revert와 같은 판정, 미리보기·실행 모두 쓰기 0 (R-B1b Z2)", async () => {
    await confirm("s-web");
    await save("s-web", "hello", "ko", "안녕");
    const approval = await approvalFor("ko");
    await prisma.project.update({ where: { id: "p" }, data: { repositoryImportToken: "lease", repositoryImportStartedAt: new Date() } });
    const before = await state();
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "sync-running" });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval })).toEqual({ ok: false, error: "sync-running" });
    expect(await state()).toEqual(before);
    // 창이 지난 lease는 막지 않는다(`planWriteLock`).
    await prisma.project.update({ where: { id: "p" }, data: { repositoryImportStartedAt: new Date(Date.now() - 600_000) } });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval })).toMatchObject({ ok: true, kind: "request-removal" });
  });

  it("확인이 무효화된 뒤의 미전달 편집은 기준이 낡아 제거를 거부한다", async () => {
    await confirm("s-web");
    await save("s-web", "hello", "ko", "안녕");
    await invalidate("s-web");
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "baseline-stale" });
  });
});

describe("제거 상태의 쓰기 거부 (저장 · Revert · 기준 언어)", () => {
  beforeEach(async () => {
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await approvalFor("ko") })).toMatchObject({ ok: true });
  });

  it("제거 예정 언어의 저장은 키 전체를 거부하고, 다른 언어는 저장된다", async () => {
    const before = await state();
    expect(await save("s-web", "hello", "ko", "새 값")).toEqual({ ok: false, error: "locale-removal-pending", localeCodes: ["ko"] });
    expect(await applyKeySave(prisma, { projectId: "p", surfaceId: "s-web", surfaceSlug: "web", keyId: "s-web-hello", userId: "editor", credential: undefined,
      changes: [{ localeCode: "en", value: "Hey" }, { localeCode: "ko", value: "새 값" }] })).toEqual({ ok: false, error: "locale-removal-pending", localeCodes: ["ko"] });
    expect(await state()).toEqual(before);
    expect(await save("s-web", "hello", "en", "Hey")).toMatchObject({ ok: true });
    // 같은 코드의 다른 소스는 영향이 없다.
    expect(await save("s-app", "hello", "ko", "앱")).toMatchObject({ ok: true });
  });

  it("제거 예정 언어 셀의 Revert는 거부한다", async () => {
    // 폐기 승인이 토큰을 비웠으므로 정상 경로로는 생기지 않는 셀이다 — 서버 가드가 마지막 방어선이다.
    await prisma.translation.updateMany({ where: { projectId: "p", surfaceId: "s-web", keyId: "s-web-hello", localeCode: "ko" }, data: { pendingEditToken: "ghost" } });
    expect(await previewKeyRevert(prisma, { projectId: "p", surfaceId: "s-web", surfaceSlug: "web", keyId: "s-web-hello", userId: "owner" }))
      .toMatchObject({ status: "blocked", reason: "locale-removal-pending", localeCodes: ["ko"] });
  });

  it("제거 예정·추가 중 언어는 기준 언어로 선언할 수 없다", async () => {
    expect(await declareBaseLocale(prisma, OWNER, { ...WEB, baseLocale: "ko" })).toEqual({ ok: false, error: "locale-change-pending" });
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    expect(await declareBaseLocale(prisma, OWNER, { ...WEB, baseLocale: "fr" })).toEqual({ ok: false, error: "locale-change-pending" });
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s-web" } })).declaredBaseLocale).toBeNull();
  });

  it("제거 취소는 행을 지우고 편집을 다시 허용한다 — 전달 전이면 작업 0", async () => {
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: false });
    expect(await prisma.localeChange.count()).toBe(0);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    expect(await save("s-web", "hello", "ko", "다시")).toMatchObject({ ok: true });
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "no-removal" });
    const lines = await logLines();
    expect(lines.map(line => line.subtype)).toEqual(["surface.localeChangeCancelled", "surface.localeRemovalRequested"]);
    for (const line of lines) expect(line.sentence).not.toContain("added the web source");
  });

  it("전달된 제거를 취소하면 작업 1로 남는다 — 다음 Publish가 이전 삭제를 지운다", async () => {
    await publishConfirmed("s-web", [{ localeCode: "ko", effect: "delete" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: true });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    // 다른 소스·언어는 바뀌지 않는다.
    expect(await prisma.locale.count({ where: { projectId: "p", orphaned: true } })).toBe(0);
  });

  it("EDITOR는 제거를 취소할 수 없다", async () => {
    expect(await cancelLocaleRemoval(prisma, EDITOR, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "forbidden" });
    expect(await prisma.localeChange.count()).toBe(1);
  });
});

describe("추가 취소", () => {
  /**
   * 추가 취소는 **토큰만 비우고 값은 남긴다** (design §3 2026-10-14 정정 — 지휘자 fix2). 언어가 orphan으로 돌아가 렌더에서 빠지므로 값이 새지 않고,
   * 재추가가 값 있는 셀에 토큰을 다시 발급해 되살린다. 마지막 전달 값으로 되돌리는 폐기는 제거(REMOVE)에만 적용한다.
   */
  it("ADD 행 삭제 + orphan + 그 언어 미전달 토큰만 폐기 — 값과 다른 언어는 그대로, 재추가가 값을 되살린다", async () => {
    await confirm("s-web");
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("s-web", "hello", "fr", "x");
    await save("s-web", "hello", "ko", "안녕");
    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    expect(preview).toMatchObject({ ok: true, kind: "cancel-add", path: "web/fr.json", translations: 1, pendingCount: 1, delivered: false });
    const koBefore = await cells("s-web", "ko");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: preview.ok ? preview.approval : null })).toEqual({ ok: true, kind: "cancel-add", discarded: 1 });
    expect(await prisma.localeChange.count()).toBe(0);
    expect((await prisma.locale.findUniqueOrThrow({ where: { projectId_surfaceId_code: { projectId: "p", surfaceId: "s-web", code: "fr" } } })).orphaned).toBe(true);
    expect(await cells("s-web", "fr")).toMatchObject([{ keyId: "s-web-hello", value: "x", pendingEditToken: null }]);
    expect(await cells("s-web", "ko")).toEqual(koBefore);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    // 값을 바꾸지 않았으므로 복원 사건이 없다.
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "translation.reverted" } })).toBe(0);
    const event = await prisma.projectEvent.findFirstOrThrow({ where: { projectId: "p", subtype: "surface.localeChangeCancelled" } });
    expect(event.payload).toMatchObject({ localeChange: { locale: "fr", operation: "ADD", discarded: 1 } });

    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: true, action: "revive", path: "web/fr.json", reissued: 1 });
    expect(await cells("s-web", "fr")).toMatchObject([{ keyId: "s-web-hello", value: "x", pendingEditToken: expect.any(String) }]);
  });

  it("한 번도 확인되지 않은 소스에서도 미전달 편집이 있는 추가 취소는 된다 — 기준 판정은 제거에만 걸린다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("s-web", "hello", "fr", "x");
    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    expect(preview).toMatchObject({ ok: true, kind: "cancel-add", pendingCount: 1 });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: preview.ok ? preview.approval : null })).toEqual({ ok: true, kind: "cancel-add", discarded: 1 });
    expect(await cells("s-web", "fr")).toMatchObject([{ value: "x", pendingEditToken: null }]);
    // 같은 상태의 제거는 여전히 기준이 없어 거부된다.
    await save("s-web", "hello", "ko", "안녕");
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "baseline-unknown" });
  });

  it("전달된 추가의 취소는 미리보기가 전달됨을 말하고 작업 1로 남는다", async () => {
    await confirm("s-web");
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("s-web", "hello", "fr", "Bonjour");
    await publishConfirmed("s-web", [{ localeCode: "fr", effect: "create" }]);
    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    expect(preview).toMatchObject({ ok: true, kind: "cancel-add", delivered: true });
    await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: preview.ok ? preview.approval : null });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
  });
});

describe("결과 미확정 Publish와의 상호 배제", () => {
  it.each<[string, { status: "RUNNING" | "FAILED"; errorCode: string | null; ageMs: number }, boolean]>([
    ["실행 중", { status: "RUNNING", errorCode: null, ageMs: 1_000 }, true],
    ["결과 미확인", { status: "FAILED", errorCode: "execution-uncertain", ageMs: 1_000 }, true],
    ["창이 지난 RUNNING", { status: "RUNNING", errorCode: null, ageMs: 600_000 }, false],
    ["일반 실패", { status: "FAILED", errorCode: "github-error", ageMs: 1_000 }, false],
  ])("%s → 거부 %s", async (_label, run, refused) => {
    await prisma.syncRun.create({ data: { projectId: "p", trigger: "MANUAL", status: run.status, errorCode: run.errorCode, startedAt: new Date(Date.now() - run.ageMs) } });
    const approval = await approvalFor("ko").catch(() => null);
    const before = await state();
    const results = [
      await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" }),
      await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval }),
    ];
    if (refused) {
      expect(results).toEqual([{ ok: false, error: "publish-unsettled" }, { ok: false, error: "publish-unsettled" }]);
      expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "publish-unsettled" });
      expect(await state()).toEqual(before);
    } else {
      expect(results.every(result => result.ok)).toBe(true);
    }
  });

  /**
   * R-B1 🔴 R1 — 무효화는 시간으로 풀리지 않는다. 전달된 추가·제거를 그 사이 취소하면 작업이 0으로 접혀 열린 PR의 stale 파일이 남는다.
   * 300초 창이 지난 미확인 실행 · 일반 실패 · 설정 변경 무효화 셋 모두 취소를 거부해야 한다.
   */
  const INVALIDATIONS: [string, () => Promise<void>][] = [
    ["400초 전 미확인 실행 + 무효화", async () => {
      await prisma.syncRun.create({ data: { projectId: "p", trigger: "MANUAL", status: "FAILED", errorCode: "execution-uncertain", startedAt: new Date(Date.now() - 400_000) } });
      await invalidate("s-web");
    }],
    ["일반 실패 + 무효화", async () => {
      await prisma.syncRun.create({ data: { projectId: "p", trigger: "MANUAL", status: "FAILED", errorCode: "github-error", startedAt: new Date(Date.now() - 1_000) } });
      await invalidate("s-web");
    }],
    ["설정 변경 무효화만", () => invalidate("s-web")],
  ];

  it.each(INVALIDATIONS)("%s → 전달된 추가의 취소는 publish-unsettled, 쓰기 0", async (_label, invalidateNow) => {
    await confirm("s-web");
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("s-web", "hello", "fr", "Bonjour");
    await publishConfirmed("s-web", [{ localeCode: "fr", effect: "create" }]);
    const approval = await approvalFor("fr");
    await invalidateNow();
    const before = await state();
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: false, error: "publish-unsettled" });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval })).toEqual({ ok: false, error: "publish-unsettled" });
    expect(await state()).toEqual(before);
  });

  it.each(INVALIDATIONS)("%s → 전달된 제거의 취소는 publish-unsettled, 쓰기 0", async (_label, invalidateNow) => {
    await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await approvalFor("ko") });
    await publishConfirmed("s-web", [{ localeCode: "ko", effect: "delete" }]);
    await invalidateNow();
    const before = await state();
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "publish-unsettled" });
    expect(await state()).toEqual(before);
  });

  it("무효화 중에도 값 0개 ADD의 취소와 새 요청은 막지 않는다", async () => {
    await confirm("s-web");
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await invalidate("s-web");
    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    expect(preview).toMatchObject({ ok: true, kind: "cancel-add", pendingCount: 0 });
    // 확인 안 됨을 "전달 안 됨"으로 말하지 않는다.
    expect(preview.ok && preview.delivered).toBeNull();
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: preview.ok ? preview.approval : null })).toMatchObject({ ok: true, kind: "cancel-add" });
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "de" })).toMatchObject({ ok: true });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await approvalFor("ko") })).toMatchObject({ ok: true, kind: "request-removal" });
  });

  it("제거 취소도 미확정 Publish 중에는 거부한다", async () => {
    await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: await approvalFor("ko") });
    await prisma.syncRun.create({ data: { projectId: "p", trigger: "MANUAL", status: "RUNNING" } });
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "publish-unsettled" });
    expect(await prisma.localeChange.count()).toBe(1);
  });
});

describe("잠금 순서 — Project → TranslationSurface (CI 적재·Publish 확정과 같다)", () => {
  async function waitsFor(sql: string, write: () => Promise<unknown>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      let settled = false;
      const pending = write().finally(() => { settled = true; });
      // 고정 sleep이 아니라 잠금 대기를 관측한다(POSTMORTEM 2026-10-09).
      await waitForLockWait(pool);
      expect(settled).toBe(false);
      await client.query("COMMIT");
      await pending;
      expect(settled).toBe(true);
    } finally {
      // 단언이 실패해 COMMIT 전에 빠져나오면 잠금을 쥔 연결이 풀로 돌아가 다음 테스트를 막는다.
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  }

  it("Project 행을 쥔 tx가 끝날 때까지 기다린다", async () => {
    await waitsFor(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`, () => addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" }));
  });

  it("그 소스 행을 쥔 tx가 끝날 때까지 기다린다", async () => {
    const approval = await approvalFor("ko");
    await waitsFor(`SELECT "id" FROM "TranslationSurface" WHERE "projectId" = 'p' AND "id" = 's-web' FOR UPDATE`, () => removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval }));
  });

  it("잠금 대기 중 커밋된 편집은 승인 지문을 낡게 한다", async () => {
    const approval = await approvalFor("ko");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
      const pending = removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval });
      await waitForLockWait(pool);
      await client.query(`UPDATE "Translation" SET "pendingEditToken" = 'late' WHERE "projectId" = 'p' AND "surfaceId" = 's-web' AND "keyId" = 's-web-bye' AND "localeCode" = 'ko'`);
      await client.query("COMMIT");
      expect(await pending).toEqual({ ok: false, error: "stale-approval" });
    } finally {
      // 단언이 실패해 COMMIT 전에 빠져나오면 잠금을 쥔 연결이 풀로 돌아가 다음 테스트를 막는다.
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });
});
