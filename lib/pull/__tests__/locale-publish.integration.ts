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

/** 제거를 요청하고 한 번 Publish해 전달까지 확인한다. 실행 시각은 미확정 창 밖으로 민다. */
async function deliveredRemoval() {
  await requestRemoval("ko");
  fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
  expect(await publish()).toMatchObject({ status: "committed" });
  await ageRuns();
}
const cron = () => runSync(prisma, { projectId: "p", slug: "fixture", trigger: "cron", requestedBy: null, credential: undefined });

describe("전달 뒤 — 다음 스냅샷·취소·만료", () => {

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

/** CI 적재(`/api/push`의 자동 적재) — 같은 잠금 안에서 만료를 먼저 돈다. 관측은 페이로드의 로케일이다. */
let commitClock = Date.parse("2026-10-13T00:00:00.000Z");
async function ciImport(locales: string[]) {
  commitClock += 60_000;
  const values: Record<string, Record<string, string>> = { en: { hello: "Hello", bye: "Bye" }, ko: { hello: "안녕", bye: "잘가" } };
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, {
    projectSlug: "fixture", surfaceSlug: "default", commitSha: "2".repeat(40), commitAt: new Date(commitClock).toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales,
    keys: ["hello", "bye"].map(key => ({ key, namespace: "_root", sourceText: values.en![key]! })),
    translations: locales.flatMap(locale => ["hello", "bye"].map(key => ({ key, locale, value: values[locale]![key]! }))),
    refs: [],
  }, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace", localeChanges: { kind: "expire", pullRequest: "none-open", actor: { kind: "AUTOMATION" } } });
}

/**
 * **미머지 종료 → 만료 → 같은 언어 재요청** (#266 — design §1 "만료는 그 행의 효과를 전달 목록에서도 뺀다"). 만료가 전달 목록을 남기면 새 요청의
 * 현재 효과가 옛 전달 목록과 같아져 미리보기는 삭제를 보여 주는데 Publish는 `no-edits`로 끝나고, 다음 방문이 그 요청을 지운다.
 * 만료 계기는 CI 적재다 — Publish 경로의 만료는 같은 실행이 수렴 Publish로 목록을 비워 이 결함을 가린다.
 */
describe("미머지 종료 뒤 같은 언어를 다시 제거 요청 (#266)", () => {
  it("만료가 전달 목록에서 그 삭제를 빼므로 재요청은 미전달이다 — 미리보기·실행이 삭제를 싣고, 다음 방문은 열린 PR을 보고 만료하지 않는다", async () => {
    await deliveredRemoval();
    // PR이 머지 없이 닫혔다 — CI 적재가 열린 PR 없음 + 파일 관측으로 요청을 만료하고 ko는 활성으로 돌아온다.
    await ciImport(["en", "ko"]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);
    expect(await delivered()).toEqual([]);
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    // 만료 뒤 수렴용 Publish가 남지 않는다 — 원격 호출 0으로 끝난다.
    const idle = fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toEqual({ status: "skipped", reason: "no-edits" });
    expect(idle.calls).toEqual([]);

    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    expect(preview).toMatchObject({ ok: true, kind: "request-removal", delivered: false });
    if (!preview.ok) throw new Error("preview refused");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: preview.approval })).toMatchObject({ ok: true, kind: "request-removal" });
    expect(await countLocaleWork(prisma, "p")).toBe(1);

    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    fake(files);
    const shown = await readPublishPreview(prisma, "p", "fixture");
    expect(shown.fileChanges).toEqual([{ path: "i18n/ko.json", kind: "removed" }]);
    // 앞의 실행들(no-edits 포함)이 남긴 간격 게이트를 지난다.
    await ageRuns();
    const made = fake(files);
    expect(await publish(shown.fingerprint)).toMatchObject({ status: "committed", files: [{ path: "i18n/ko.json", kind: "removed" }] });
    expect(snapshot(made)?.changes).toEqual([{ kind: "delete", path: "i18n/ko.json" }]);
    expect(await delivered()).toEqual([{ localeCode: "ko", effect: "delete" }]);

    // 다음 방문 — 새 PR이 열려 있으니 요청이 살아 있다(이슈의 6단계).
    await ageRuns();
    fake(files, { openPr: { url: "https://github.com/o/r/pull/10", number: 10, title: "chore(i18n): sync [skip ci]", base: "main" } });
    await cron();
    expect(await prisma.localeChange.findMany({ where: { projectId: "p" }, select: { localeCode: true, operation: true } })).toEqual([{ localeCode: "ko", operation: "REMOVE" }]);
  });
});

/**
 * **전달된 의도를 취소하면 파일 diff가 0이어도 Publish할 일이 있다** (#265 — design-brief 프레임 13 "이전 변경 거두기"). 취소로 되돌린 파일은 base와
 * 같아 `fileChanges`에 없지만, 열린 PR에는 옛 삭제·새 파일이 남아 있다. 미리보기가 그 거둘 효과를 데이터로 싣는다 — MCP 문장과 화면이 같은 신호를 읽는다.
 */
describe("전달된 의도 취소 뒤 미리보기 — 거둘 언어 효과 (#265)", () => {
  const open = { openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "chore(i18n): sync [skip ci]", base: "main" } };

  it("전달된 제거 취소 → 파일 변경 0, 거둘 효과 delete ko", async () => {
    await deliveredRemoval();
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: true });
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, open);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ sendable: { total: 0 }, fileChanges: [], withdrawnLocales: [{ surfaceSlug: "default", localeCode: "ko", effect: "delete" }] });
  });

  it("전달된 추가 취소 → 파일 변경 0, 거둘 효과 create fr", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    const removal = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    expect(removal).toMatchObject({ ok: true, kind: "cancel-add", delivered: true });
    if (!removal.ok) throw new Error("preview refused");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: removal.approval })).toMatchObject({ ok: true, kind: "cancel-add" });
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, open);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ sendable: { total: 0 }, fileChanges: [], withdrawnLocales: [{ surfaceSlug: "default", localeCode: "fr", effect: "create" }] });
  });

  it("전달된 의도가 그대로면 거둘 것이 없다 — 필드가 없다", async () => {
    await deliveredRemoval();
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, open);
    expect(await readPublishPreview(prisma, "p", "fixture")).not.toHaveProperty("withdrawnLocales");
  });
});

/**
 * **야간 cron Publish도 스냅샷 전에 만료한다** (R-B2 🔴 R1 — design §1 "모든 Publish"). 사람 주체가 없으니 AUTOMATION으로 만료한다.
 * 안 하면 머지 없이 닫힌 삭제가 다른 셀 편집 하나에 실려 새 PR로 다시 나가고, 보류된 ADD는 영영 풀리지 않는다.
 */
describe("cron Publish의 스냅샷 전 만료", () => {
  it("머지 없이 닫힌 삭제 + 다른 셀 편집 1 → 삭제 재전송 0, 행 만료, 언어 활성, 사건 주체는 AUTOMATION", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await cron()).toMatchObject({ status: "committed" });
    expect(snapshot(made)?.changes.map(change => [change.kind, change.path])).toEqual([["upsert", "i18n/en.json"]]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "ko" } })).toMatchObject({ orphaned: false });
    expect(await prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "surface.localeChangeResolved" }, select: { actorKind: true } })).toEqual([{ actorKind: "AUTOMATION" }]);
  });

  it("보류된 ADD + PR 닫힘 + cron → 관측된 파일로 활성 만료되고 그 언어 편집이 나간다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO, "i18n/fr.json": '{\n    "hello": "Salut"\n}\n' };
    const made = fake(files);
    expect(await cron()).toMatchObject({ status: "committed", delivered: 1 });
    expect(snapshot(made)?.changes).toEqual([{ kind: "upsert", path: "i18n/fr.json", content: '{\n    "hello": "Bonjour"\n}\n', inBase: true }]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "fr" } })).toMatchObject({ orphaned: false });
  });

  it("열린 PR 조회가 실패하면 cron Publish도 실패한다 — 만료·쓰기 0(fail-closed)", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { failOn: "findOpenPr" });
    expect(await cron()).toMatchObject({ status: "failed" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);
  });
});

/**
 * **결정적 언어 계획 거부는 재시도 실패가 아니다** (R-B2 🟡 Y2 — POSTMORTEM 2026-10-07 #200 계열). 다른 소스가 추가한 언어의 경로를 쥐면
 * 실행은 `locale-plan-refused`(재시도 불가)로, 미리보기는 같은 코드의 `refused`로 끝난다 — Try again이 아니다.
 */
describe("언어 계획 거부 코드", () => {
  it("다른 소스가 같은 경로를 쥐면 실행 결과 코드가 locale-plan-refused·재시도 불가이고 미리보기는 refused다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    // 추가 뒤에 다른 소스가 같은 템플릿으로 들어온다 — 추가 시점의 경로 판정은 이 경우를 못 본다.
    await prisma.translationSurface.create({ data: { id: "s2", projectId: "p", slug: "other", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "fr" } });
    await prisma.locale.create({ data: { projectId: "p", surfaceId: "s2", code: "fr", name: "fr", isBase: true } });
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    fake(files);
    const { loadPreview } = await import("@/lib/publish/load-preview");
    expect(await loadPreview(prisma, { userId: "owner" }, { slug: "fixture" })).toMatchObject({ status: "refused", reason: "locale-plan-refused", path: "i18n/fr.json", branch: "main" });
    const made = fake(files);
    expect(await publish()).toMatchObject({ status: "failed", code: "locale-plan-refused", retryable: false });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });
});
