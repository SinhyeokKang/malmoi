import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { blobSha } from "@/lib/githash";
import { applyKeySave } from "@/lib/keys/save-key";
import { addLocale, cancelLocaleRemoval, previewLocaleRemoval, removeLocale } from "@/lib/locales/change";
import { countLocaleWork, deliveredOf } from "@/lib/locales/work";
import { readPublishPreview } from "@/lib/publish/read";
import { applyPush } from "@/lib/push/apply";
import { hashPushToken } from "@/lib/push/token";
import { runSync } from "@/lib/sync/run";

import { createFakeGitClient, isGitMutation, type FakeGitOptions } from "./fake-client";

const github = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/repo-host", async importOriginal => ({ ...(await importOriginal<object>()), createGitClient: async () => github.client }));

/**
 * **언어 변경의 Publish — 진입점부터 확인 tx까지** (locale-add tasks §5 셋째~열째 · /ship 6.2).
 *
 * 실제 B1 코어(`addLocale`·`removeLocale`·`cancelLocaleRemoval`)로 의도를 세우고, 실제 `runSync`가 실행권·무효화·성공 확정을 지나게 한다.
 * 끝 단언은 화면·MCP가 읽는 값 — 언어 작업 수(`countLocaleWork`)·전달 목록(`readLocaleStates`)·미리보기(`readPublishPreview`)·취소 판정이다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-locale-publish-"));
let binaries: string;
const PORT = 55652;
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

const OWNER = { userId: "owner" };
const WEB = { slug: "fixture", surfaceSlug: "default" };
const SYNC = "heads/malmoi-i18n/sync-fixture";
/** 리포 base의 파일 — 4칸 들여쓰기라 새 언어 파일이 그 표현을 빌리는지 보인다. */
const EN = '{\n    "hello": "Hello",\n    "bye": "Bye"\n}\n';
// 비-base 파일은 원본 순서가 아니라 DB 순서로 다시 쓰인다 — 적재 키에 순서가 없어 코드 유닛 순이다. 같은 바이트여야 값 편집 0건이 diff 0이다.
const KO = '{\n    "bye": "잘가",\n    "hello": "안녕"\n}\n';

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken("locale-publish-fixture"), members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" } } } });
  const values: Record<string, Record<string, string>> = { en: { hello: "Hello", bye: "Bye" }, ko: { hello: "안녕", bye: "잘가" } };
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
    projectSlug: "fixture", surfaceSlug: "default", commitSha: "1".repeat(40), commitAt: "2026-10-13T00:00:00.000Z",
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko"],
    keys: ["hello", "bye"].map(key => ({ key, namespace: "_root", sourceText: values.en![key]! })),
    translations: ["en", "ko"].flatMap(locale => ["hello", "bye"].map(key => ({ key, locale, value: values[locale]![key]! }))),
    refs: [],
  }, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
});

function fake(files: Record<string, string>, extra: Partial<FakeGitOptions> = {}) {
  const made = createFakeGitClient({
    refSha: { "heads/main": "basehead", ...extra.refSha },
    tree: { basehead: Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) })) },
    blobs: Object.fromEntries(Object.values(files).map(content => [blobSha(content), content])),
    ...Object.fromEntries(Object.entries(extra).filter(([name]) => name !== "refSha")),
  });
  github.client = made.client;
  return made;
}

const publish = (expectedFingerprint?: string) =>
  runSync(prisma, { projectId: "p", slug: "fixture", trigger: "manual", requestedBy: "owner", credential: undefined, ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }) });
/** 그 소스의 전달 목록 — `[]`는 전달한 것 없음, `null`은 확인 안 됨(취소·작업 수가 읽는 값, `deliveredOf`). */
const delivered = async () => deliveredOf(await prisma.deliveryConfirmation.findUnique({ where: { projectId_surfaceId: { projectId: "p", surfaceId: "s" } } }));
const snapshot = (made: ReturnType<typeof fake>) =>
  made.calls.find(call => call.method === "publishSnapshot")?.args[0] as { changes: { kind: string; path: string; content?: string; inBase?: boolean }[] } | undefined;
const keyId = async (key: string) => (await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } })).id;
const save = async (key: string, localeCode: string, value: string) =>
  applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId: await keyId(key), userId: "owner", credential: undefined, changes: [{ localeCode, value }] });
/** 미확정 창(300초)을 지나게 한다 — 남는 장벽은 확인 무효화뿐이다. */
// 시각은 JS로 넘긴다 — 컬럼이 시간대 없는 timestamp라 SQL `now()`는 세션 시간대만큼 어긋난다.
const ageRuns = () => prisma.syncRun.updateMany({ where: { projectId: "p" }, data: { startedAt: new Date(Date.now() - 400_000), finishedAt: new Date(Date.now() - 390_000) } });

async function requestRemoval(code: string) {
  const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: code });
  if (!preview.ok) throw new Error(`preview ${JSON.stringify(preview)}`);
  return removeLocale(prisma, OWNER, { ...WEB, localeCode: code, approval: preview.approval });
}

describe("제거 → Publish — 삭제만 있는 실행이 확인되고 작업이 0이 된다", () => {
  it("미리보기와 실행이 같은 삭제를 말하고, 성공 확정이 캡처 목록을 전달 목록으로 쓴다", async () => {
    expect(await requestRemoval("ko")).toMatchObject({ ok: true, kind: "request-removal" });
    expect(await countLocaleWork(prisma, "p")).toBe(1);

    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 0, changedFiles: ["i18n/ko.json"], fileChanges: [{ path: "i18n/ko.json", kind: "removed" }] });

    const made = fake(files);
    const outcome = await publish(preview.fingerprint);
    expect(outcome).toMatchObject({ status: "committed", delivered: 0, changedValues: 0, files: [{ path: "i18n/ko.json", kind: "removed" }] });
    expect(snapshot(made)?.changes).toEqual([{ kind: "delete", path: "i18n/ko.json" }]);
    expect(made.calls.find(call => call.method === "createPr")?.args[3]).toMatch(/\(removed\)/);
    expect(await delivered()).toEqual([{ localeCode: "ko", effect: "delete" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    expect(await prisma.syncRun.findFirst({ where: { projectId: "p" } })).toMatchObject({ status: "SUCCEEDED", changed: 1, changedValues: 0 });
  });

  it("PR 생성이 실패하면 전달 목록을 쓰지 않고 확인 안 됨으로 남는다 — 작업도 그대로다", async () => {
    await requestRemoval("ko");
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { failOn: "createPr" });
    expect(await publish()).toMatchObject({ status: "failed" });
    expect(await delivered()).toBeNull();
    expect(await countLocaleWork(prisma, "p")).toBe(1);
  });
});

describe("확인 행이 없는 소스의 첫 Publish가 미확인으로 끝나면 확인 안 됨이다 (review-B1b Y5)", () => {
  it("첫 외부 쓰기 전 무효화가 행 없는 캡처 소스에 무효화된 행을 만든다 → 추가 취소가 publish-unsettled로 거부된다", async () => {
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    await save("hello", "fr", "Bonjour");
    expect(await prisma.deliveryConfirmation.count({ where: { projectId: "p" } })).toBe(0);

    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { failOn: "createPr" });
    expect(await publish()).toMatchObject({ status: "failed" });
    await ageRuns();
    expect(await prisma.deliveryConfirmation.findFirst({ where: { projectId: "p", surfaceId: "s" } })).toMatchObject({ invalidatedAt: expect.any(Date) });
    expect(await delivered()).toBeNull();
    const before = await prisma.localeChange.findMany({ where: { projectId: "p" } });
    // 실패한 실행이 fr.json을 원격에 실었을 수 있다 — 취소가 작업을 0으로 접으면 열린 PR에 stale 파일이 남는다.
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: false, error: "publish-unsettled" });
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: "x" })).toEqual({ ok: false, error: "publish-unsettled" });
    expect(await prisma.localeChange.findMany({ where: { projectId: "p" } })).toEqual(before);

    // 짝 — 다음 Publish가 확인되면 취소가 열린다.
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    expect(await delivered()).toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true, kind: "cancel-add" });
  });
});

describe("추가 → Publish — 새 파일은 기준 파일의 표현을 빌리고 diff 경로는 서버가 계산한 경로다", () => {
  it("미리보기 셀 경로 = 실행이 만든 파일 경로, 4칸 표현, 전달 목록에 create", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview.fileChanges).toEqual([{ path: "i18n/fr.json", kind: "new" }]);
    expect(preview.groups.map(group => group.path)).toEqual(["i18n/fr.json"]);

    const made = fake(files);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 1 });
    expect(snapshot(made)?.changes).toEqual([{ kind: "upsert", path: "i18n/fr.json", content: '{\n    "hello": "Bonjour"\n}\n', inBase: false }]);
    expect(await delivered()).toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
  });

  /**
   * 열린 PR이 있는 동안이다 — PR이 없으면 수동 Publish의 스냅샷 전 만료가 "리포에 파일이 생겼다"를 관측해 ADD를 활성 언어로 풀고(design §1 Y1),
   * 그 뒤로는 보통의 활성 언어다(아래 짝).
   */
  it("미전달 ADD의 경로가 base에 이미 있으면 그 언어만 보류 — 미리보기와 실행이 같은 이유·수를 말하고 나머지 편집은 나간다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    await save("bye", "ko", "또봐");
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO, "i18n/fr.json": '{\n    "hello": "Salut"\n}\n' };
    const open = { openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "chore(i18n): sync [skip ci]", base: "main" } };
    fake(files, open);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    const reason = { withheld: [{ surfaceSlug: "default", localeCode: "fr", path: "i18n/fr.json", reason: "proposal-path-exists" }], empty: [] };
    expect(preview).toMatchObject({ locales: reason, withoutFile: 1, sendable: { total: 1 } });
    const made = fake(files, open);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 1, withheld: { file: 1, key: 0 }, locales: reason });
    expect(snapshot(made)?.changes.map(change => change.path)).toEqual(["i18n/ko.json"]);
    // 보류된 ADD는 캡처하지 않는다 — 작업으로 남는다.
    expect(await delivered()).toEqual([]);
    expect(await countLocaleWork(prisma, "p")).toBe(1);

    // 짝 — PR이 닫혔으면 스냅샷 전 만료가 관측한 파일로 ADD를 풀고, fr은 보통의 활성 언어로 미전달 편집을 싣는다.
    await ageRuns();
    const after = fake(files);
    expect(await publish()).toMatchObject({ status: "committed", delivered: 1 });
    // ko는 앞 PR이 머지되지 않아 base와 여전히 달라 다시 실린다 — 스냅샷은 늘 DB 전체 상태다.
    expect(snapshot(after)?.changes).toContainEqual({ kind: "upsert", path: "i18n/fr.json", content: '{\n    "hello": "Bonjour"\n}\n', inBase: true });
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
  });

  it("값 0개 ADD만 있으면 원격 호출 0 — 작업이 없다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "de" });
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toEqual({ status: "skipped", reason: "no-edits" });
    expect(made.calls).toEqual([]);
  });
});

describe("전달 뒤 — 다음 스냅샷·취소·만료", () => {
  async function deliveredRemoval() {
    await requestRemoval("ko");
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
  }

  it("삭제 PR이 열린 채 다른 언어를 편집하고 다시 Publish해도 delete가 유지된다", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "chore(i18n): sync [skip ci]", base: "main" } });
    expect(await publish()).toMatchObject({ status: "committed", pr: "updated" });
    expect(snapshot(made)?.changes.map(change => [change.kind, change.path])).toEqual([["upsert", "i18n/en.json"], ["delete", "i18n/ko.json"]]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);
  });

  it("전달된 제거를 취소하면 다음 Publish가 no-changes로 수렴한다 — PR 닫기·되돌림 뒤에만 빈 목록을 확인한다", async () => {
    await deliveredRemoval();
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: true });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { refSha: { [SYNC]: "stale" }, openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "t", base: "main" } });
    expect(await publish()).toMatchObject({ status: "skipped", reason: "no-changes", closedPr: { number: 9 } });
    expect(made.calls.map(call => call.method).filter(method => method === "closePr" || method === "resetSyncBranch")).toEqual(["closePr", "resetSyncBranch"]);
    expect(await delivered()).toEqual([]);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
  });

  it("되돌림이 실패하면 전달 목록을 갱신하지 않는다 — 작업이 남는다", async () => {
    await deliveredRemoval();
    await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    await ageRuns();
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { refSha: { [SYNC]: "stale" }, failOn: "resetSyncBranch" });
    expect(await publish()).toMatchObject({ status: "failed" });
    expect(await delivered()).toBeNull();
  });

  it("PR이 머지 없이 닫혔으면 수동 Publish가 스냅샷 전에 만료한다 — 닫힌 삭제를 다시 싣지 않고, 파일이 base에 있으니 언어는 활성이다", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(snapshot(made)?.changes.map(change => change.kind)).toEqual(["upsert"]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "ko" } })).toMatchObject({ orphaned: false });
    expect(await prisma.projectEvent.count({ where: { projectId: "p", subtype: "surface.localeChangeResolved" } })).toBe(1);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
  });

  it("열린 PR이 있으면 만료하지 않는다 — 삭제가 계속 실린다", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "t", base: "main" } });
    await publish();
    expect(snapshot(made)?.changes.map(change => change.kind)).toEqual(["upsert", "delete"]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);
    expect(made.calls.filter(call => isGitMutation(call.method)).length).toBeGreaterThan(0);
  });
});
