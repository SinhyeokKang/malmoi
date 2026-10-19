import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { appleXcstrings } from "@/lib/adapters";
import { optionalEnv } from "@/lib/env";
import { blobSha } from "@/lib/githash";
import { applyKeySave } from "@/lib/keys/save-key";
import { addLocale, previewLocaleRemoval } from "@/lib/locales/change";
import { planConfirmedFormat } from "@/lib/onboarding/confirm";
import { readPublishPreview } from "@/lib/publish/read";
import { applyPush } from "@/lib/push/apply";
import { buildPushPayload } from "@/lib/push/payload";
import { hashPushToken } from "@/lib/push/token";
import { runSync } from "@/lib/sync/run";

import { loadPullState } from "@/lib/pull/load";
import { projectFormats, renderProject } from "@/lib/pull/run";

import { createFakeGitClient, isGitMutation } from "./fake-client";

const github = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/repo-host", async importOriginal => ({ ...(await importOriginal<object>()), createGitClient: async () => github.client }));

/**
 * **Apple String Catalog 소스의 전 경로 — 확정 → 첫 적재 → Publish 미리보기·실행 → 미전달 토큰** (apple-strings T4.1 · /ship 6.2).
 *
 * 실제 확정(`planConfirmedFormat`) · 적재(`buildPushPayload` → `applyPush`) · 저장(`applyKeySave`) · `runSync`를 지나고, 끝 단언은 미리보기와 스냅샷이 싣는
 * **파일 바이트**와 `Translation.pendingEditToken`이다. 핵심은 **셀 삽입 판정이 경로 선택·미리보기·렌더·토큰 해제에서 하나**라는 것이다(design §2.3) —
 * `Bye.ko`는 파일에 셀이 없지만 키가 있어 PR에 들어가고, 미리보기도 전달로 세고, 토큰도 풀린다. 코드가 지운 키의 편집만 보류다.
 * Xcode가 Malmoi PR을 다시 저장했을 때의 바이트만 T4.3 실물(`/roundtrip`)로 남는다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-apple-xcstrings-publish-"));
let binaries: string;
const PORT = 55745;
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
const PATH = "App/Localizable.xcstrings";

const unit = (value: string, state = "translated") => ({ stringUnit: { state, value } });
/** Xcode 서식(2칸 · `" : "` · 끝 개행 없음) — 값에 `": `가 없게 고른다. 키 순서는 코드 유닛 순이다. */
const xcode = (strings: Record<string, unknown>) => JSON.stringify({ sourceLanguage: "en", strings, version: "1.0" }, null, 2).replace(/": /g, '" : ');
const plural = { variations: { plural: { one: unit("%lld item"), other: unit("%lld items") } } };
/**
 * 원본 — `Hello`는 en·ko(`needs_review`), `Save`는 원문 셀이 없다(키 = 원문), `Bye`는 ko 셀이 없다(미번역), `Items %lld`는 복수형(보존만),
 * `Brand`는 번역하지 않는다.
 */
const STRINGS = {
  Brand: { shouldTranslate: false },
  Bye: { localizations: { en: unit("Goodbye") } },
  Hello: { comment: "Greeting", localizations: { en: unit("Hello there"), ko: unit("안녕", "needs_review") } },
  "Items %lld": { localizations: { en: plural, ko: plural } },
  Save: { localizations: { ko: unit("저장") } },
};
const SOURCE = xcode(STRINGS);

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken("apple-xcstrings-publish-fixture"), members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "apple-xcstrings", pathTemplate: PATH, baseLocale: "en" } } } });

  // 확정 → 첫 적재 — 온보딩이 지나는 판정 그대로다.
  const files = [{ path: PATH, content: SOURCE }];
  const confirmed = planConfirmedFormat({ adapter: "apple-xcstrings", pathTemplate: PATH, baseLocale: "en" }, files);
  if (confirmed.status !== "ok") throw new Error(`confirm ${JSON.stringify(confirmed)}`);
  const { payload } = buildPushPayload({
    projectSlug: "fixture", surfaceSlug: "default", executionId: null, commitSha: "1".repeat(40), commitAt: "2026-10-19T00:00:00.000Z",
    format: confirmed.format, read: appleXcstrings.read(confirmed.format, files), baseLocale: confirmed.baseLocale, scanRefs: [],
  });
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, payload, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
});

function fake(content: string) {
  const sha = blobSha(Buffer.from(content, "utf8"));
  const made = createFakeGitClient({ refSha: { "heads/main": "basehead" }, tree: { basehead: [{ path: PATH, sha }] }, blobs: { [sha]: content } });
  github.client = made.client;
  return made;
}
const publish = (expectedFingerprint?: string) =>
  runSync(prisma, { projectId: "p", slug: "fixture", trigger: "manual", requestedBy: "owner", credential: undefined, ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }) });
type Change = { kind: string; path: string; content?: string };
const changesOf = (made: ReturnType<typeof fake>) =>
  (made.calls.find(call => call.method === "publishSnapshot")?.args[0] as { changes: Change[] } | undefined)?.changes ?? [];
const keyId = async (key: string) => (await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } })).id;
const save = async (key: string, localeCode: string, value: string) =>
  applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId: await keyId(key), userId: "owner", credential: undefined, changes: [{ localeCode, value }] });
/** 키 → 로케일 → 미전달 토큰이 남았는가. */
const pending = async () => {
  const ids = new Map((await prisma.stringKey.findMany({ where: { projectId: "p" } })).map(k => [k.id, k.key]));
  const rows = await prisma.translation.findMany({ where: { projectId: "p", pendingEditToken: { not: null } } });
  return rows.map(r => `${ids.get(r.keyId)}.${r.localeCode}`).sort();
};

describe("Apple String Catalog 확정 → 첫 적재", () => {
  it("기준 언어가 sourceLanguage이고, 원문 셀 없는 키는 키가 원문이며, 복수형·번역하지 않는 키는 적재하지 않는다", async () => {
    expect((await prisma.stringKey.findMany({ where: { projectId: "p" }, orderBy: { key: "asc" } })).map(k => [k.key, k.sourceText])).toEqual([
      ["Bye", "Goodbye"],
      ["Hello", "Hello there"],
      ["Save", "Save"],
    ]);
    const ids = new Map((await prisma.stringKey.findMany({ where: { projectId: "p" } })).map(k => [k.id, k.key]));
    const ko = await prisma.translation.findMany({ where: { projectId: "p", localeCode: "ko" } });
    expect(ko.map(t => [ids.get(t.keyId), t.value]).sort()).toEqual([["Hello", "안녕"], ["Save", "저장"]]);
  });

  it("무편집이면 미리보기·실행이 보낼 것이 없고 렌더 바이트가 원본 그대로다", async () => {
    fake(SOURCE);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ total: 0, changedFiles: [], fileChanges: [] });
    const made = fake(SOURCE);
    expect(await publish()).toMatchObject({ status: "skipped", reason: "no-edits" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);

    const state = await loadPullState(prisma, "fixture");
    const { rendered, changes } = await renderProject(state.project, projectFormats(state.surfaces), fake(SOURCE).client);
    expect(changes).toEqual([]);
    expect(rendered.flatMap(surface => surface.files).map(file => [file.path, file.content, file.errors ?? []])).toEqual([[PATH, SOURCE, []]]);
  });
});

describe("Apple String Catalog Publish — 셀 삽입이 판정·바이트·토큰에서 하나다", () => {
  it("없는 셀(Bye.ko)·원문 셀(Save.en)·값(Hello.ko)이 미리보기에 전달로 서고, PR이 그 셋만 바꾸고, 토큰이 전부 풀린다", async () => {
    await save("Hello", "ko", "안녕하세요");
    await save("Bye", "ko", "잘 가");
    await save("Save", "en", "Save changes");
    expect(await pending()).toEqual(["Bye.ko", "Hello.ko", "Save.en"]);

    fake(SOURCE);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 3, withoutKey: 0, withoutFile: 0, sendable: { total: 3 }, changedFiles: [PATH], fileChanges: [{ path: PATH, kind: "updated" }] });
    // 넣는 셀은 이전 값이 없다 — 미리보기 행이 그 셀을 "새 값"으로 그린다.
    const rows = preview.groups.flatMap(group => group.rows).map(row => [row.key, row.localeCode, row.before, row.after]);
    expect(rows).toEqual([["Bye", "ko", null, "잘 가"], ["Hello", "ko", "안녕", "안녕하세요"], ["Save", "en", "Save", "Save changes"]]);

    const made = fake(SOURCE);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 3 });
    const expected = xcode({
      ...STRINGS,
      Bye: { localizations: { en: unit("Goodbye"), ko: unit("잘 가") } },
      // 기존 셀의 state는 Malmoi가 풀지 않는다.
      Hello: { comment: "Greeting", localizations: { en: unit("Hello there"), ko: unit("안녕하세요", "needs_review") } },
      Save: { localizations: { en: unit("Save changes"), ko: unit("저장") } },
    });
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: PATH, content: expected, inBase: true }]);
    expect(await pending()).toEqual([]);
  });

  it("다음 Publish의 원본은 삽입된 파일이다 — 넣은 원문 셀을 읽고, 다시 고친 셀만 바뀐다", async () => {
    await save("Save", "en", "Save changes");
    fake(SOURCE);
    expect(await publish()).toMatchObject({ status: "committed" });
    const merged = xcode({ ...STRINGS, Save: { localizations: { en: unit("Save changes"), ko: unit("저장") } } });
    await pool.query(`UPDATE "SyncRun" SET "startedAt" = "startedAt" - interval '400 seconds', "finishedAt" = "finishedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);

    await save("Save", "ko", "저장하기");
    const made = fake(merged);
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: PATH, content: merged.replace('"저장"', '"저장하기"'), inBase: true }]);
  });

  it("코드가 지운 키(파일에 없다)의 편집만 보류다 — 미리보기 withoutKey · PR에 없음 · 토큰 남음", async () => {
    await save("Bye", "ko", "잘 가");
    await save("Hello", "ko", "안녕하세요");
    const withoutBye = xcode(Object.fromEntries(Object.entries(STRINGS).filter(([key]) => key !== "Bye")));

    fake(withoutBye);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ total: 2, withoutKey: 1, sendable: { total: 1 } });
    const made = fake(withoutBye);
    expect(await publish()).toMatchObject({ status: "committed", delivered: 1 });
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: PATH, content: withoutBye.replace('"안녕"', '"안녕하세요"'), inBase: true }]);
    expect(await pending()).toEqual(["Bye.ko"]);
  });
});

/**
 * 지휘자 결정 14 — 같은 이름은 Xcode처럼 앞의 것이다. 정답 리포 HealthGPT의 카탈로그처럼 옛 Xcode가 같은 키를 두 번 쓴 파일(앞: 셀, 뒤: 빈 객체)에서도
 * 미리보기가 막히지 않고, PR은 앞 사본만 고치며 가려진 사본은 바이트 그대로다(Xcode가 다음 저장에서 지운다).
 */
describe("Apple String Catalog — 옛 Xcode가 쓴 중복 키", () => {
  it("미리보기는 경고로 막지 않고, 실행은 앞 사본만 고친다", async () => {
    // HealthGPT 모양 — 셀이 든 사본이 앞이고 빈 사본이 뒤다.
    const healthGpt = SOURCE.replace(/("Hello" : \{[\s\S]*?\n {4}\}),\n/, '$1,\n    "Hello" : {\n\n    },\n');
    expect(healthGpt).not.toBe(SOURCE);
    await save("Hello", "ko", "안녕하세요");
    fake(healthGpt);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ total: 1, sendable: { total: 1 }, changedFiles: [PATH] });
    const made = fake(healthGpt);
    expect(await publish()).toMatchObject({ status: "committed", delivered: 1 });
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: PATH, content: healthGpt.replace('"안녕"', '"안녕하세요"'), inBase: true }]);
    expect(await pending()).toEqual([]);
  });
});

describe("Apple String Catalog — 언어 추가·제거 비지원", () => {
  it("언어 추가·제거 미리보기 둘 다 unsupported-format이다(한 파일에 전 언어가 있다)", async () => {
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toEqual({ ok: false, error: "unsupported-format" });
    expect(await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" })).toEqual({ ok: false, error: "unsupported-format" });
  });
});
