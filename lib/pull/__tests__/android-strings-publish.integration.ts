import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { detectFormat } from "@/lib/adapters";
import { optionalEnv } from "@/lib/env";
import { blobSha } from "@/lib/githash";
import { applyKeySave } from "@/lib/keys/save-key";
import { addLocale, previewLocaleRemoval, removeLocale } from "@/lib/locales/change";
import { loadPreview } from "@/lib/publish/load-preview";
import { readPublishPreview } from "@/lib/publish/read";
import { applyPush } from "@/lib/push/apply";
import { assemblePushInput } from "@/lib/push/assemble";
import { buildPushPayload } from "@/lib/push/payload";
import { hashPushToken } from "@/lib/push/token";
import { runSync } from "@/lib/sync/run";

import { loadPullState } from "@/lib/pull/load";
import { projectFormats, renderProject } from "@/lib/pull/run";

import { createFakeGitClient, isGitMutation } from "./fake-client";

const github = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/repo-host", async importOriginal => ({ ...(await importOriginal<object>()), createGitClient: async () => github.client }));

/**
 * **Android `strings.xml` 소스의 전 경로 — 탐지 → 첫 적재(basePath) → 번역 → Publish(기준 파일 = `values/`) → 언어 추가 → 다른 키 번역 → 두 번째 Publish**
 * (android-strings T3.1 · /ship 6.2). 실제 탐지(`detectFormat`) · 적재 깔때기(`assemblePushInput` → `buildPushPayload` → `applyPush`) · 언어 변경 코어 ·
 * `runSync`를 지나고, 끝 단언은 Publish 미리보기와 스냅샷이 싣는 **파일 바이트**다. 기준 언어 코드는 리포에 없어 호출부가 정한다 — CLI `--base`·
 * 온보딩 ③ 입력(T3.2b)이 할 일을 여기서는 포맷의 언어 목록에 직접 더한다. `create_project`/`add_sources`로 basePath를 싣는 갈래는 그 입력이 들어온 뒤다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-android-strings-publish-"));
let binaries: string;
const PORT = 55746;
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
const TEMPLATE = "app/src/main/res/values-{locale}/strings.xml";
const BASE_PATH = "app/src/main/res/values/strings.xml";
const KO_PATH = "app/src/main/res/values-ko/strings.xml";
const FR_PATH = "app/src/main/res/values-fr/strings.xml";

/** 기준 — 라이선스 주석·translatable=false·plurals·string-array·자식 태그·CDATA·비정규 `'`가 바이트 그대로 남아야 한다. */
const BASE = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<!-- Copyright 2026 -->",
  '<resources xmlns:tools="http://schemas.android.com/tools" xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">',
  '    <string name="app_id" translatable="false">com.example</string>',
  "    <!-- Home screen -->",
  '    <string name="title">Home</string>',
  '    <string name="greet">Hi <xliff:g id="name" example="Bob">%1$s</xliff:g>!</string>',
  '    <string name="logout">Log out</string>',
  "",
  '    <plurals name="items">',
  '        <item quantity="one">%d item</item>',
  '        <item quantity="other">%d items</item>',
  "    </plurals>",
  '    <string-array name="days"><item>Mon</item></string-array>',
  '    <string name="html"><![CDATA[<b>Bold</b>]]></string>',
  "</resources>",
  "",
].join("\n");
/** 번역 — CRLF. `logout`·`html`이 없다(두 번째 Publish가 삽입한다). */
const KO = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">',
  '    <string name="title">홈</string>',
  '    <string name="greet">안녕 <xliff:g id="name" example="Bob">%1$s</xliff:g>!</string>',
  '    <plurals name="items"><item quantity="other">%d개</item></plurals>',
  "</resources>",
  "",
].join("\r\n");
const FILES: Record<string, string> = { [BASE_PATH]: BASE, [KO_PATH]: KO };

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken("android-strings-publish-fixture"), members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, baseLocale: "en" } } } });

  // 탐지 → 첫 적재. 탐지는 기준 언어 코드를 모른다 — 입력(T3.2b)이 정한 en을 언어 목록에 더한다.
  const paths = [...Object.keys(FILES), "app/src/main/res/values/colors.xml", "app/build.gradle"];
  const probe = (path: string) => FILES[path];
  const detected = detectFormat(paths, probe);
  expect(detected).toEqual({ adapter: "android-strings", pathTemplate: TEMPLATE, basePath: BASE_PATH, locales: ["ko"] });
  const format = { ...detected!, locales: [...detected!.locales, "en"] };
  const { read, baseLocale } = assemblePushInput({ paths, probe, format, baseLocale: "en" });
  const { payload } = buildPushPayload({ projectSlug: "fixture", surfaceSlug: "default", executionId: null, commitSha: "1".repeat(40), commitAt: "2026-10-19T00:00:00.000Z", format, read, baseLocale, scanRefs: [] });
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, payload, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
});

function fake(files: Record<string, string>) {
  const made = createFakeGitClient({
    refSha: { "heads/main": "basehead" },
    tree: { basehead: Object.entries(files).map(([path, content]) => ({ path, sha: blobSha(content) })) },
    blobs: Object.fromEntries(Object.values(files).map(content => [blobSha(content), content])),
  });
  github.client = made.client;
  return made;
}
const publish = (expectedFingerprint?: string) =>
  runSync(prisma, { projectId: "p", slug: "fixture", trigger: "manual", requestedBy: "owner", credential: undefined, ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }) });
type Change = { kind: string; path: string; content?: string };
const changesOf = (made: ReturnType<typeof fake>) =>
  ((made.calls.find(call => call.method === "publishSnapshot")?.args[0] as { changes: Change[] } | undefined)?.changes ?? []).map(({ kind, path, content }) => ({ kind, path, content }));
const save = async (key: string, localeCode: string, value: string) => {
  const keyId = (await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } })).id;
  return applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId, userId: "owner", credential: undefined, changes: [{ localeCode, value }] });
};
const ageRuns = async () => {
  await pool.query(`UPDATE "SyncRun" SET "startedAt" = "startedAt" - interval '400 seconds', "finishedAt" = "finishedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
  await pool.query(`UPDATE "LocaleChange" SET "requestedAt" = "requestedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
};

describe("Android 탐지 → 첫 적재", () => {
  it("기준 파일(values/)의 번역 대상 엔트리가 파일 순서로, ko 번역 둘이 적재된다 — translatable=false·plurals·string-array는 키가 아니다", async () => {
    expect((await prisma.stringKey.findMany({ where: { projectId: "p" }, orderBy: { sortIndex: "asc" } })).map(k => [k.key, k.sourceText])).toEqual([
      ["title", "Home"],
      ["greet", 'Hi <xliff:g id="name" example="Bob">%1$s</xliff:g>!'],
      ["logout", "Log out"],
      ["html", "&lt;b>Bold&lt;/b>"],
    ]);
    expect((await prisma.locale.findMany({ where: { projectId: "p" }, orderBy: { code: "asc" } })).map(l => l.code)).toEqual(["en", "ko"]);
    expect((await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).basePath).toBe(BASE_PATH);
  });

  it("무편집이면 미리보기·실행이 보낼 것이 없고 렌더 바이트가 원본 그대로다", async () => {
    fake(FILES);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ total: 0, changedFiles: [], fileChanges: [] });
    const made = fake(FILES);
    expect(await publish()).toMatchObject({ status: "skipped", reason: "no-edits" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);

    const state = await loadPullState(prisma, "fixture");
    const { rendered, changes } = await renderProject(state.project, projectFormats(state.surfaces), fake(FILES).client);
    expect(changes).toEqual([]);
    expect(rendered.flatMap(surface => surface.files).map(file => [file.path, file.content, file.errors ?? []])).toEqual([[BASE_PATH, BASE, []], [KO_PATH, KO, []]]);
  });
});

describe("Android Publish — 기준 파일은 basePath, 첫째와 둘째의 바이트", () => {
  it("기준 값 편집은 values/에, ko 편집·누락 키 삽입은 values-ko/에 그 셀만 나가고 둘째는 고친 셀만이다", async () => {
    await save("title", "en", "Start");
    await save("title", "ko", "시작");
    await save("logout", "ko", "로그아웃");
    fake(FILES);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect([...preview.changedFiles].sort()).toEqual([KO_PATH, BASE_PATH]);
    // 없던 `values-en/`을 만들지 않는다.
    expect(preview.fileChanges.some(change => change.path.includes("values-en/"))).toBe(false);

    const first = fake(FILES);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed" });
    const firstKo = KO.replace("홈", "시작").replace("!</string>\r\n", '!</string>\r\n    <string name="logout">로그아웃</string>\r\n');
    expect(changesOf(first)).toEqual([
      { kind: "upsert", path: KO_PATH, content: firstKo },
      { kind: "upsert", path: BASE_PATH, content: BASE.replace(">Home<", ">Start<") },
    ]);

    await ageRuns();
    const merged = { [BASE_PATH]: BASE.replace(">Home<", ">Start<"), [KO_PATH]: firstKo };
    await save("logout", "ko", "로그 아웃");
    const second = fake(merged);
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(changesOf(second)).toEqual([{ kind: "upsert", path: KO_PATH, content: firstKo.replace(">로그아웃<", ">로그 아웃<") }]);
  });
});

describe("Android 언어 추가·제거 → Publish", () => {
  it("추가: 새 파일은 뼈대와 값 있는 키만, 다른 키를 번역한 두 번째 Publish는 그 파일에 삽입하며 blocking이 없다", async () => {
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    await save("title", "fr", "Accueil");
    fake(FILES);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview.fileChanges).toEqual([{ path: FR_PATH, kind: "new" }]);

    const made = fake(FILES);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 1 });
    const created = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources xmlns:tools="http://schemas.android.com/tools" xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">',
      '    <string name="title">Accueil</string>',
      "</resources>",
      "",
    ].join("\n");
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: FR_PATH, content: created }]);

    await ageRuns();
    const merged = { ...FILES, [FR_PATH]: created };
    await save("logout", "fr", "Se déconnecter");
    fake(merged);
    const nextPreview = await readPublishPreview(prisma, "p", "fixture");
    expect(nextPreview).toMatchObject({ total: 1, withoutFile: 0 });
    expect([...nextPreview.changedFiles]).toEqual([FR_PATH]);
    const next = fake(merged);
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(changesOf(next)).toEqual([{ kind: "upsert", path: FR_PATH, content: created.replace("</resources>", '    <string name="logout">Se déconnecter</string>\n</resources>') }]);
  });

  it("제거: 그 언어 파일 하나만 지운다 — 기준 파일(values/)은 남는다", async () => {
    const approval = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    if (!approval.ok) throw new Error(JSON.stringify(approval));
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: approval.approval })).toMatchObject({ ok: true, kind: "request-removal" });
    fake(FILES);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ total: 0, fileChanges: [{ path: KO_PATH, kind: "removed" }] });
    const made = fake(FILES);
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(changesOf(made)).toEqual([{ kind: "delete", path: KO_PATH, content: undefined }]);
  });
});

/**
 * 리뷰 R2 — 쓸 수 없는 태그(속성 값의 맨 `&`)가 든 기준 값을 저장하면 그 파일은 `write-parse-failed`이고, 미리보기는 blocked · 실행은 writer-warnings ·
 * Git 쓰기 0 · 전달 확인 0이다. 기준 셀은 E의 태그 대조(기준 대비 번역) 대상이 아니라 writer가 막아야 한다.
 */
describe("Android — 쓸 수 없는 태그", () => {
  // 리뷰 R2-3 — XML S 밖 공백(NBSP)이 든 태그도 값 단계의 키가 붙은 실패다. 쓴 파일 재파싱까지 가면 키 없는 실패가 되어 미리보기가 "기준 파일을 못 읽음"으로 오분류한다.
  it.each([
    ['<b a="&">Start</b>', "속성 엔티티가 깨진 태그"],
    ["<b\u00a0>Start</b>", "이름 뒤 NBSP"],
    ['<b a\u00a0=\u00a0"x">Start</b>', "등호 주위 NBSP"],
  ])("기준 값 %j(%s) — 미리보기 blocked(키 있는 writer 경고) · 실행 writer-warnings · 쓰기 0 · 전달 확인 0", async (bad) => {
    await save("title", "en", bad);
    fake(FILES);
    expect(await loadPreview(prisma, OWNER, { slug: "fixture" })).toMatchObject({
      status: "blocked", warnings: [expect.objectContaining({ path: BASE_PATH, code: "write-parse-failed", key: "title" })],
    });
    const made = fake(FILES);
    expect(await publish()).toMatchObject({ status: "skipped", reason: "writer-warnings" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);
    expect(await prisma.deliveryConfirmation.count({ where: { projectId: "p" } })).toBe(0);
  });
});
