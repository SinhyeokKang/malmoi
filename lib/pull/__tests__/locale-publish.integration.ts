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
import { planPublishView } from "@/lib/publish/plan";
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
/**
 * 미확정 창(300초)을 지나게 한다 — 남는 장벽은 확인 무효화뿐이다. 실행과 언어 요청을 **같은 폭으로** 민다 — 확인보다 뒤에 낸 요청은 전달로 세지
 * 않으므로(F1 fix1) 실행만 밀면 그 전에 낸 요청이 확인 뒤의 요청이 된다. SQL 안의 상대 이동이라 세션 시간대와 무관하다.
 */
const ageRuns = async () => {
  await pool.query(`UPDATE "SyncRun" SET "startedAt" = "startedAt" - interval '400 seconds', "finishedAt" = "finishedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
  await pool.query(`UPDATE "LocaleChange" SET "requestedAt" = "requestedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
};

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
    // 보류된 언어의 편집은 파일 보류 수에 들되 언어 보류로도 센다 — 화면이 "파일이 아직 없다"에서 빼고 Held 행이 이유를 말한다(R-E3 Y1). 미리보기 == 실행.
    expect(preview).toMatchObject({ locales: reason, withoutFile: 1, withoutFileLanguage: 1, sendable: { total: 1 } });
    const made = fake(files, open);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 1, withheld: { file: 1, key: 0, language: 1 }, locales: reason });
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
    const openPr = { url: "https://github.com/o/r/pull/9", number: 9, title: "t", base: "main" };
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { refSha: { [SYNC]: "stale" }, openPr });
    const preview = await readPublishPreview(prisma, "p", "fixture");
    const made = fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { refSha: { [SYNC]: "stale" }, openPr });
    // 결과도 거둔 언어를 싣는다 — 미리보기의 `withdrawnLocales`와 같은 함수·같은 입력이다(#281). 화면이 "같은 값이 동기화됐거나 편집을 되돌렸다"로 말하지 않는다.
    const result = await publish();
    expect(result).toMatchObject({ status: "skipped", reason: "no-changes", closedPr: { number: 9 }, withdrawn: [{ surfaceSlug: "default", localeCode: "ko", effect: "delete", path: "i18n/ko.json" }] });
    expect("withdrawn" in result ? result.withdrawn : undefined).toEqual(preview.withdrawnLocales);
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
  }, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace", localeChanges: { kind: "expire", pullRequest: "none-open", actor: { kind: "AUTOMATION" }, via: "ci" } });
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

    // 앞의 실행들(no-edits 포함)이 남긴 간격 게이트를 지난다. 요청 시각도 움직이므로 지문을 받기 전에 민다.
    await ageRuns();
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    fake(files);
    const shown = await readPublishPreview(prisma, "p", "fixture");
    expect(shown.fileChanges).toEqual([{ path: "i18n/ko.json", kind: "removed" }]);
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
 * **확인보다 뒤에 낸 요청의 효과는 전달로 세지 않는다** (F1 fix1 — design §1). 전달 후 취소는 행 없이 전달 목록만 남기고, PR이 머지 없이 닫혀도
 * 만료할 행이 없어 그 목록은 그대로다. 그 뒤 같은 언어를 다시 요청하면 현재 = 전달이 되어 Publish가 싣지 않고, 다음 방문이 새 요청을 지웠다(#266과 같은 결과).
 */
describe("전달 후 취소 → 미머지 종료 → 같은 언어 재요청 (F1 fix1)", () => {
  it("확인 뒤에 낸 요청은 옛 전달 목록과 견주지 않는다 — 미리보기 delivered:false·작업 1·적재 방문이 만료하지 않고 Publish가 삭제를 싣고 다음 방문이 남긴다", async () => {
    await deliveredRemoval();
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: true });
    // PR이 머지 없이 닫혔다 — 만료할 행이 없어 전달 목록은 옛 삭제를 든 채 남는다.
    expect(await delivered()).toEqual([{ localeCode: "ko", effect: "delete" }]);

    const preview = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    expect(preview).toMatchObject({ ok: true, kind: "request-removal", delivered: false });
    if (!preview.ok) throw new Error("preview refused");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: preview.approval })).toMatchObject({ ok: true, kind: "request-removal" });
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    // 적재 방문(열린 PR 없음) — 새 요청은 아직 어느 PR에도 실리지 않았으니 만료하지 않는다.
    await ciImport(["en", "ko"]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);

    // 간격 게이트를 지난다 — 요청 시각도 움직이므로 지문을 받기 전에 민다.
    await ageRuns();
    const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
    fake(files);
    const shown = await readPublishPreview(prisma, "p", "fixture");
    expect(shown.fileChanges).toEqual([{ path: "i18n/ko.json", kind: "removed" }]);
    expect(shown).not.toHaveProperty("withdrawnLocales");
    const made = fake(files);
    expect(await publish(shown.fingerprint)).toMatchObject({ status: "committed", files: [{ path: "i18n/ko.json", kind: "removed" }] });
    expect(snapshot(made)?.changes).toEqual([{ kind: "delete", path: "i18n/ko.json" }]);
    expect(await delivered()).toEqual([{ localeCode: "ko", effect: "delete" }]);
    // 이 Publish의 확인은 요청 뒤에 시작했다 — 이제 전달로 센다.
    expect(await countLocaleWork(prisma, "p")).toBe(0);

    await ageRuns();
    fake(files, { openPr: { url: "https://github.com/o/r/pull/11", number: 11, title: "chore(i18n): sync [skip ci]", base: "main" } });
    await cron();
    expect(await prisma.localeChange.findMany({ where: { projectId: "p" }, select: { localeCode: true, operation: true } })).toEqual([{ localeCode: "ko", operation: "REMOVE" }]);
  });
});

/**
 * **취소의 `delivered`는 저장된 전달 목록으로 판정한다** (F1 fix2 — R-F1 Y1). 취소 뒤에는 행이 없어 판정용 목록이 저장 목록과 같아진다 — 취소 전의
 * 좁힌 목록(확인 뒤 재요청이 옛 효과를 가림)으로 말하면 "보낼 것 없음"처럼 들리는데 취소 뒤 작업은 1이고 열린 PR에는 옛 삭제가 남아 있다.
 */
describe("확인 뒤 재요청을 다시 취소 — 취소 결과는 저장 목록으로 말한다 (F1 fix2)", () => {
  const open = { openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "chore(i18n): sync [skip ci]", base: "main" } };

  it("제거 → Publish → 취소 → (PR 열린 채) 재요청 → 다시 취소 → delivered:true · 작업 1 · 거둘 효과 delete ko", async () => {
    await deliveredRemoval();
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: true });
    await requestRemoval("ko");
    expect(await cancelLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: true, delivered: true });
    expect(await delivered()).toEqual([{ localeCode: "ko", effect: "delete" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, open);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ fileChanges: [], withdrawnLocales: [{ surfaceSlug: "default", localeCode: "ko", effect: "delete" }] });
  });

  it("추가 → Publish → 추가 취소 → 재추가(값 되살림) → 추가 취소 미리보기 delivered:true — 열린 PR에 옛 새 파일이 있다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    const first = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    if (!first.ok) throw new Error("preview refused");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: first.approval })).toMatchObject({ ok: true, kind: "cancel-add" });
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true, kind: "cancel-add", delivered: true });
  });
});

describe("확인 뒤 요청이 현재 효과를 내지 않으면 옛 효과를 남긴다 (F1 fix1)", () => {
  it("전달된 추가 취소 → 재추가 후 값을 비움(값 0개 ADD) → 작업 1·거둘 효과 create fr — 열린 PR의 옛 새 파일을 Publish가 거둔다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO });
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    const removal = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "fr" });
    if (!removal.ok) throw new Error("preview refused");
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "fr", approval: removal.approval })).toMatchObject({ ok: true, kind: "cancel-add" });
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    // 되살린 값을 비운다 — 이 요청은 파일을 내지 않는다(값 0개 ADD).
    await prisma.translation.updateMany({ where: { projectId: "p", localeCode: "fr" }, data: { value: "" } });
    expect(await delivered()).toEqual([{ localeCode: "fr", effect: "create" }]);
    expect(await countLocaleWork(prisma, "p")).toBe(1);
    fake({ "i18n/en.json": EN, "i18n/ko.json": KO }, { openPr: { url: "https://github.com/o/r/pull/9", number: 9, title: "chore(i18n): sync [skip ci]", base: "main" } });
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ fileChanges: [], withdrawnLocales: [{ surfaceSlug: "default", localeCode: "fr", effect: "create" }] });
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
    expect(await prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "surface.localeChangeResolved" }, select: { actorKind: true, payload: true } })).toEqual([{ actorKind: "AUTOMATION", payload: expect.objectContaining({ localeChange: expect.objectContaining({ via: "nightly" }) }) }]);
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
    expect(await loadPreview(prisma, { userId: "owner" }, { slug: "fixture" })).toMatchObject({ status: "refused", reason: "locale-plan-refused", path: "i18n/fr.json", branch: "main",
      plan: { refusal: "path-conflict", surfaceSlug: WEB.surfaceSlug, localeCode: "fr", ownerSlug: "other" } });
    const made = fake(files);
    expect(await publish()).toMatchObject({ status: "failed", code: "locale-plan-refused", retryable: false });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
  });
});

/**
 * **미머지 종료 뒤·만료 방문 전의 Publish** (#267 — RT2). 전달된 제거의 PR/MR이 머지 없이 닫혔고 아직 아무 방문도 만료하지 않은 창이다. 그 창의
 * 작업 수는 0이라(현재 = 전달) 1층이 스냅샷 전 만료 앞에서 `no-edits`로 끝났고("리포에 이미 있다" — 거짓), 미리보기는 base 트리와 견줘 삭제를
 * 약속했다. 이제 실행이 1층 앞에서 만료를 돌고, 미리보기는 같은 판정을 읽기만 해 "닫혀서 버려질 요청"으로 말하고 삭제를 싣지 않는다.
 * 두 호스트 — 판정은 호스트 경계(`GitClient`) 위에 서므로 같은 가짜로 GitHub·GitLab 프로젝트를 다 지난다.
 */
describe.each(["github", "gitlab"] as const)("미머지 종료 뒤 만료 전 Publish (#267) — %s", host => {
  const files = { "i18n/en.json": EN, "i18n/ko.json": KO };
  const closedPr = { url: "https://example.test/o/r/pull/9", number: 9, title: "chore(i18n): sync [skip ci]", base: "main" };
  const EXPIRED = [{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE", presence: "active" }];

  beforeEach(async () => {
    if (host === "github") return;
    const connection = await prisma.gitLabConnection.create({ data: { userId: "owner", token: "sealed-fixture", gitlabUserId: "101", username: "owner", scopes: ["api"] } });
    await prisma.project.update({ where: { id: "p" }, data: { repoHost: "gitlab", installationId: null, repositoryId: "87515176", gitlabConnectionId: connection.id } });
  });

  it("전달된 제거만 남은 창 — 미리보기가 버려질 요청을 말하고 삭제를 싣지 않으며, 같은 지문의 Publish가 요청을 만료하고 PR 없이 그 사실을 말한다", async () => {
    await deliveredRemoval();
    expect(await countLocaleWork(prisma, "p")).toBe(0);

    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 0, sendable: { total: 0 }, changedFiles: [], fileChanges: [], expiringLocales: EXPIRED });
    expect(preview.withdrawnLocales).toBeUndefined();

    const made = fake(files);
    expect(await publish(preview.fingerprint)).toEqual({ status: "skipped", reason: "no-edits", expired: EXPIRED });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "ko" } })).toMatchObject({ orphaned: false });
    expect(await delivered()).toEqual([]);
    expect(await prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "surface.localeChangeResolved" }, select: { actorKind: true, payload: true } })).toEqual([{ actorKind: "USER", payload: expect.objectContaining({ localeChange: expect.objectContaining({ via: "publish" }) }) }]);

    // 만료 뒤에는 행이 없다 — 다음 미리보기·Publish는 원격 호출 없이 보낼 것이 없다.
    await ageRuns();
    fake(files);
    const after = await readPublishPreview(prisma, "p", "fixture");
    expect(after.expiringLocales).toBeUndefined();
    const idle = fake(files);
    expect(await publish(after.fingerprint)).toEqual({ status: "skipped", reason: "no-edits" });
    expect(idle.calls).toEqual([]);
  });

  it("열린 PR이 있으면 만료하지 않는다 — 미리보기에 버려질 요청이 없고 Publish는 요청을 남긴다", async () => {
    await deliveredRemoval();
    fake(files, { openPr: closedPr });
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview.expiringLocales).toBeUndefined();
    const made = fake(files, { openPr: closedPr });
    const outcome = await publish(preview.fingerprint);
    expect(outcome).toMatchObject({ status: "skipped", reason: "no-edits" });
    expect(outcome).not.toHaveProperty("expired");
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);
  });

  it("다른 셀 편집과 함께면 미리보기는 그 편집만 싣고(삭제 없음), 지문 Publish는 만료 뒤 다시 확인을 요구하고, 새 미리보기로 편집만 나간다", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ sendable: { total: 1 }, fileChanges: [{ path: "i18n/en.json", kind: "updated" }], expiringLocales: EXPIRED });

    const made = fake(files);
    expect(await publish(preview.fingerprint)).toEqual({ status: "skipped", reason: "reconfirm" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(0);

    await ageRuns();
    fake(files);
    const again = await readPublishPreview(prisma, "p", "fixture");
    expect(again.expiringLocales).toBeUndefined();
    expect(again.fileChanges).toEqual([{ path: "i18n/en.json", kind: "updated" }]);
    const sent = fake(files);
    expect(await publish(again.fingerprint)).toMatchObject({ status: "committed", files: [{ path: "i18n/en.json", kind: "updated" }] });
    expect(snapshot(sent)?.changes.map(change => [change.kind, change.path])).toEqual([["upsert", "i18n/en.json"]]);
  });

  it("미리보기 뒤 PR이 다시 열렸으면 지문이 다르다 — 버려질 요청이라 말한 지문으로 삭제를 싣지 않는다", async () => {
    await deliveredRemoval();
    await save("hello", "en", "Hello!");
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview.expiringLocales).toEqual(EXPIRED);
    const made = fake(files, { openPr: closedPr });
    expect(await publish(preview.fingerprint)).toEqual({ status: "skipped", reason: "reconfirm" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);
  });

  /**
   * **fix1 R1** — 머지된 제거 PR 뒤 방문 전 창(흔하다 — Malmoi PR은 `[skip-malmoi-i18n]`라 머지가 CI 적재를 깨우지 않는다). 만료는 ko를 orphan으로
   * 둔다(파일이 base에 없다). 미리보기가 ko를 활성으로 남기면 지운 파일을 new로 다시 약속한다.
   */
  it("머지된 제거 — 미리보기가 파일을 약속하지 않고 요청이 리포에 반영됐다고 말한다(orphan), Publish가 같은 판정으로 끝난다", async () => {
    await deliveredRemoval();
    const merged = { "i18n/en.json": EN };
    fake(merged);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    const reached = [{ surfaceSlug: "default", localeCode: "ko", operation: "REMOVE", presence: "orphan" }];
    expect(preview).toMatchObject({ sendable: { total: 0 }, changedFiles: [], fileChanges: [], expiringLocales: reached });
    const made = fake(merged);
    expect(await publish(preview.fingerprint)).toEqual({ status: "skipped", reason: "no-edits", expired: reached });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "ko" } })).toMatchObject({ orphaned: true });
  });

  /** **fix1 R2** — 전달된 추가의 PR/MR이 머지 없이 닫혔다. 만료는 fr을 orphan으로 둔다 — 미리보기가 fr.json new를 약속하면 같은 응답이 모순이다. */
  it("미머지 종료된 추가 — 미리보기가 새 파일을 약속하지 않는다, 만료 뒤 fr은 비활성", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake(files);
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    const dropped = [{ surfaceSlug: "default", localeCode: "fr", operation: "ADD", presence: "orphan" }];
    expect(preview).toMatchObject({ total: 0, sendable: { total: 0 }, changedFiles: [], fileChanges: [], expiringLocales: dropped });
    const made = fake(files);
    expect(await publish(preview.fingerprint)).toEqual({ status: "skipped", reason: "no-edits", expired: dropped });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "fr" } })).toMatchObject({ orphaned: true });
  });

  /**
   * **버튼의 DB 판정이 이 창을 안다** (#282 ①) — 셀·언어 작업이 0이라 꺼졌던 창이다. `readLocaleWork`가 `awaiting`을 내고(서버가 그때만 열린 PR을 묻는다),
   * 정리 Publish 뒤에는 행이 없어 창이 닫힌다.
   */
  it("미머지 종료된 추가 · 편집 0 — 버튼 판정은 작업 0 · awaiting, 정리 뒤에는 둘 다 닫힌다 (#282 ①)", async () => {
    const { readLocaleWork } = await import("@/lib/locales/work");
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake(files);
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    expect(await readLocaleWork(prisma, "p")).toMatchObject({ work: 0, awaiting: true });
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    fake(files);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "skipped", reason: "no-edits", expired: [{ localeCode: "fr", presence: "orphan" }] });
    expect(await readLocaleWork(prisma, "p")).toMatchObject({ work: 0, awaiting: false });
  });

  /** fix1 R2 변형 — 버려질 언어에 전달 뒤 편집이 더 있다. 만료 뒤 그 편집은 비활성 언어의 셀이라 나가지 않는다 — 미리보기가 보낼 수로 세지 않는다. 보류도 아니라 웹은 요청을 닫았다 틀이다(#289). */
  it("미머지 종료된 추가 + 그 언어의 미발송 편집 — 미리보기 보낼 것 0·미발송 0, Publish no-edits, 웹 결과는 요청을 닫았다 틀이다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake(files);
    expect(await publish()).toMatchObject({ status: "committed" });
    await ageRuns();
    await save("bye", "fr", "Au revoir");
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 0, keys: 0, sendable: { total: 0, keys: 0 }, fileChanges: [], groups: [] });
    const made = fake(files);
    const outcome = await publish(preview.fingerprint);
    expect(outcome).toMatchObject({ status: "skipped", reason: "no-edits", expired: [{ localeCode: "fr", presence: "orphan" }] });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(planPublishView(outcome)).toBe("request-closed");
  });

  it("머지된 추가 — 파일이 base에 있으면 활성으로 끝나고 미리보기는 아무 파일도 약속하지 않는다", async () => {
    await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" });
    await save("hello", "fr", "Bonjour");
    fake(files);
    const sent = fake(files);
    expect(await publish()).toMatchObject({ status: "committed" });
    const frFile = snapshot(sent)?.changes.find(change => change.path === "i18n/fr.json")?.content;
    if (frFile === undefined) throw new Error("fr.json was not created");
    await ageRuns();
    const merged = { ...files, "i18n/fr.json": frFile };
    fake(merged);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    const reached = [{ surfaceSlug: "default", localeCode: "fr", operation: "ADD", presence: "active" }];
    expect(preview).toMatchObject({ fileChanges: [], expiringLocales: reached });
    fake(merged);
    expect(await publish(preview.fingerprint)).toEqual({ status: "skipped", reason: "no-edits", expired: reached });
    expect(await prisma.locale.findFirst({ where: { projectId: "p", code: "fr" } })).toMatchObject({ orphaned: false });
  });

  it("열린 PR 조회가 실패하면 Publish가 실패한다 — 만료·쓰기 0(fail-closed), 미리보기는 버려진다고 말하지 않는다", async () => {
    await deliveredRemoval();
    fake(files, { failOn: "findOpenPr" });
    expect((await readPublishPreview(prisma, "p", "fixture")).expiringLocales).toBeUndefined();
    const made = fake(files, { failOn: "findOpenPr" });
    expect(await publish()).toMatchObject({ status: "failed" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.localeChange.count({ where: { projectId: "p" } })).toBe(1);
  });
});

/** 실제 추가/복구 → 저장 → 미리보기 → Publish → 화면 판정, 두 수술적 포맷 공통 계약. */
describe.each([
  ["yaml-catalog", "yml", "en:\n  hello: Hello\n  bye: Bye\n", "ko:\n  hello: 안녕\n  bye: 잘가\n"],
  ["code-dict", "ts", "export default { hello: 'Hello', bye: 'Bye' };\n", "export default { hello: '안녕', bye: '잘가' };\n"],
])("%s 새 언어 전달", (adapterName, ext, en, ko) => {
  it.each([false, true])("복구=%s — 미리보기와 실행 파일·전달 수가 같고 머지 뒤 관측은 활성이다", async revive => {
    await prisma.translationSurface.update({ where: { id: "s" }, data: { adapterName, pathTemplate: `i18n/{locale}.${ext}` } });
    if (revive) await prisma.locale.create({ data: { projectId: "p", surfaceId: "s", code: "fr", name: "fr", orphaned: true } });
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    await save("hello", "fr", "Bonjour");
    const files = { [`i18n/en.${ext}`]: en, [`i18n/ko.${ext}`]: ko };
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ withoutFile: 0, sendable: { total: 1 }, fileChanges: [{ path: `i18n/fr.${ext}`, kind: "new" }] });
    const made = fake(files);
    const result = await publish(preview.fingerprint);
    expect(result).toMatchObject({ status: "committed", delivered: preview.sendable.total, files: preview.fileChanges });
    expect(await countLocaleWork(prisma, "p")).toBe(0);
    const content = snapshot(made)?.changes.find(c => c.path === `i18n/fr.${ext}`)?.content;
    expect(content).toContain("Bonjour");
    expect(content).not.toContain("Hello");
    await ageRuns();
    const merged = { ...files, [`i18n/fr.${ext}`]: content! };
    fake(merged);
    const after = await readPublishPreview(prisma, "p", "fixture");
    expect(after).toMatchObject({ fileChanges: [], expiringLocales: [{ localeCode: "fr", presence: "active" }] });
    fake(merged);
    const settled = await publish(after.fingerprint);
    expect(settled).toMatchObject({ status: "skipped", reason: "no-edits" });
    expect(planPublishView(settled)).toBe("request-closed");
  });
});
