import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { appleStrings } from "@/lib/adapters";
import { encodeFileContent, type FileEncoding } from "@/lib/file-encoding";
import { optionalEnv } from "@/lib/env";
import { blobSha } from "@/lib/githash";
import { applyKeySave } from "@/lib/keys/save-key";
import { addLocale, previewLocaleRemoval, removeLocale } from "@/lib/locales/change";
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
 * **Apple `.strings` 소스의 전 경로 — 확정 → 첫 적재 → 언어 추가·제거 → Publish 미리보기·실행** (apple-strings T2.1 · /ship 6.2).
 *
 * 실제 확정(`planConfirmedFormat`) · 적재(`buildPushPayload` → `applyPush`) · 언어 변경 코어 · `runSync`를 지나고, 끝 단언은 Publish 미리보기와
 * 스냅샷이 싣는 **파일 바이트**다(ko는 UTF-16LE + BOM 원본이고 변경도 그 인코딩으로 나간다). 실호스트가 base64 blob을 저장한 바이트와 `xcodebuild`만
 * T2.4 실물 검증으로 남는다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-apple-strings-publish-"));
let binaries: string;
const PORT = 55744;
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
const TEMPLATE = "App/{locale}.lproj/Localizable.strings";
const EN_PATH = "App/en.lproj/Localizable.strings";
const KO_PATH = "App/ko.lproj/Localizable.strings";
const FR_PATH = "App/fr.lproj/Localizable.strings";

/** base — 주석·빈 줄·비정규 이스케이프(`\\A`)·placeholder가 바이트 그대로 남아야 한다. */
const EN = [
  "/* Home screen title */",
  '"title" = "Home";',
  "",
  "/* Sign-out button */",
  '"logout" = "Log out";',
  "",
  '"count" = "%d \\Aitems";',
  "",
].join("\n");
/**
 * 번역 — UTF-16LE + BOM, CRLF. `logout`이 없다(미번역 — 두 번째 Publish가 삽입한다). `title`은 가려진 중복이 앞에 있다 — Apple 의미대로 나중 값이
 * 번역이고(경고 `duplicate-property`), 앞 리터럴은 어떤 Publish에서도 바이트 그대로다.
 */
const KO = ['/* 홈 */', '"title" = "옛 홈";', '"title" = "홈";', '"count" = "%d개";', ""].join("\r\n");
const FILES: Record<string, { content: string; encoding?: FileEncoding }> = { [EN_PATH]: { content: EN }, [KO_PATH]: { content: KO, encoding: "utf-16le-bom" } };

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken("apple-strings-publish-fixture"), members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "apple-strings", pathTemplate: TEMPLATE, baseLocale: "en" } } } });

  // 확정 → 첫 적재 — 온보딩이 지나는 판정 그대로다.
  const files = Object.entries(FILES).map(([path, { content }]) => ({ path, content }));
  const confirmed = planConfirmedFormat({ adapter: "apple-strings", pathTemplate: TEMPLATE, baseLocale: "en" }, files);
  if (confirmed.status !== "ok") throw new Error(`confirm ${JSON.stringify(confirmed)}`);
  const { payload } = buildPushPayload({
    projectSlug: "fixture", surfaceSlug: "default", executionId: null, commitSha: "1".repeat(40), commitAt: "2026-10-19T00:00:00.000Z",
    format: confirmed.format, read: appleStrings.read(confirmed.format, files), baseLocale: confirmed.baseLocale, scanRefs: [],
  });
  await applyPush(prisma, { projectId: "p", surfaceId: "s" }, payload, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
});

function fake(files: Record<string, { content: string; encoding?: FileEncoding }>) {
  const sha = ({ content, encoding }: { content: string; encoding?: FileEncoding }) => blobSha(encodeFileContent(content, encoding ?? "utf-8"));
  const made = createFakeGitClient({
    refSha: { "heads/main": "basehead" },
    tree: { basehead: Object.entries(files).map(([path, file]) => ({ path, sha: sha(file) })) },
    blobs: Object.fromEntries(Object.values(files).map(file => [sha(file), file.content])),
    blobEncodings: Object.fromEntries(Object.values(files).flatMap(file => (file.encoding === undefined ? [] : [[sha(file), file.encoding]]))),
  });
  github.client = made.client;
  return made;
}
const publish = (expectedFingerprint?: string) =>
  runSync(prisma, { projectId: "p", slug: "fixture", trigger: "manual", requestedBy: "owner", credential: undefined, ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }) });
type Change = { kind: string; path: string; content?: string; encoding?: FileEncoding };
const changesOf = (made: ReturnType<typeof fake>) =>
  (made.calls.find(call => call.method === "publishSnapshot")?.args[0] as { changes: Change[] } | undefined)?.changes ?? [];
const save = async (key: string, localeCode: string, value: string) => {
  const keyId = (await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } })).id;
  return applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId, userId: "owner", credential: undefined, changes: [{ localeCode, value }] });
};
/** 미확정 창(300초) 밖으로 민다 — `locale-publish.integration.ts`와 같은 이유다. */
const ageRuns = async () => {
  await pool.query(`UPDATE "SyncRun" SET "startedAt" = "startedAt" - interval '400 seconds', "finishedAt" = "finishedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
  await pool.query(`UPDATE "LocaleChange" SET "requestedAt" = "requestedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
};

describe("Apple strings 확정 → 첫 적재", () => {
  it("base 엔트리 셋이 파일 순서(sortIndex)로, ko 번역 둘이 적재되고 값은 이스케이프를 푼 문자열이다", async () => {
    expect((await prisma.stringKey.findMany({ where: { projectId: "p" }, orderBy: { sortIndex: "asc" } })).map(k => [k.key, k.sourceText])).toEqual([
      ["title", "Home"],
      ["logout", "Log out"],
      ["count", "%d Aitems"],
    ]);
    const ids = new Map((await prisma.stringKey.findMany({ where: { projectId: "p" } })).map(k => [k.id, k.key]));
    const ko = await prisma.translation.findMany({ where: { projectId: "p", localeCode: "ko" }, orderBy: { value: "asc" } });
    expect(ko.map(t => [ids.get(t.keyId), t.value]).sort()).toEqual([["count", "%d개"], ["title", "홈"]]);
  });

  /**
   * 리뷰 Y4 — 첫 적재 시나리오가 DB 행에서 멈췄다. 무편집이면 미리보기도 실행도 보낼 것이 없고, 실행과 같은 렌더(`renderProject`)의 바이트가 원본이다:
   * base의 비정규 리터럴(`\A`)·ko의 가려진 중복·UTF-16LE + BOM·CRLF가 그대로이고 바뀐 파일이 0이다.
   */
  it("무편집이면 미리보기·실행이 보낼 것이 없고 렌더 바이트가 원본 그대로다 — 비정규 리터럴·가려진 중복·인코딩", async () => {
    fake(FILES);
    expect(await readPublishPreview(prisma, "p", "fixture")).toMatchObject({ total: 0, changedFiles: [], fileChanges: [] });
    const made = fake(FILES);
    expect(await publish()).toMatchObject({ status: "skipped", reason: "no-edits" });
    expect(made.calls.filter(call => isGitMutation(call.method))).toEqual([]);

    const state = await loadPullState(prisma, "fixture");
    const { rendered, changes } = await renderProject(state.project, projectFormats(state.surfaces), fake(FILES).client);
    expect(changes).toEqual([]);
    expect(rendered.flatMap(surface => surface.files).map(file => [file.path, file.content, file.encoding, file.errors ?? []])).toEqual([
      [EN_PATH, EN, undefined, []],
      [KO_PATH, KO, "utf-16le-bom", []],
    ]);
  });
});

describe("Apple strings Publish — 첫째와 둘째의 바이트", () => {
  it("첫 Publish는 고친 셀과 누락 키 삽입뿐이고 UTF-16LE + BOM·CRLF로 나가며, 둘째는 고친 셀만이다", async () => {
    await save("title", "ko", "홈 화면");
    await save("logout", "ko", "로그아웃");
    fake(FILES);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 2 });
    expect([...preview.changedFiles]).toEqual([KO_PATH]);

    const first = fake(FILES);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed" });
    const firstKo = ['/* 홈 */', '"title" = "옛 홈";', '"title" = "홈 화면";', '"logout" = "로그아웃";', '"count" = "%d개";', ""].join("\r\n");
    expect(changesOf(first)).toEqual([{ kind: "upsert", path: KO_PATH, content: firstKo, encoding: "utf-16le-bom", inBase: true }]);

    // 첫 PR이 머지됐다 — 다음 Publish의 base는 첫 출력이다.
    await ageRuns();
    const merged = { ...FILES, [KO_PATH]: { content: firstKo, encoding: "utf-16le-bom" as const } };
    await save("logout", "ko", "로그 아웃");
    const second = fake(merged);
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(changesOf(second)).toEqual([{ kind: "upsert", path: KO_PATH, content: firstKo.replace('"로그아웃"', '"로그 아웃"'), encoding: "utf-16le-bom", inBase: true }]);
  });
});

describe("Apple strings 언어 추가·제거 → Publish 미리보기·실행", () => {
  it("추가: 새 파일은 값 있는 키만 담고 base의 주석·값을 싣지 않으며, 다음 번역은 그 파일에 삽입된다", async () => {
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    await save("title", "fr", "Accueil");
    fake(FILES);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview.fileChanges).toEqual([{ path: FR_PATH, kind: "new" }]);

    const made = fake(FILES);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 1 });
    const created = '"title" = "Accueil";\n';
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: FR_PATH, content: created, inBase: false }]);

    await ageRuns();
    const merged = { ...FILES, [FR_PATH]: { content: created } };
    await save("count", "fr", "%d éléments");
    fake(merged);
    const nextPreview = await readPublishPreview(prisma, "p", "fixture");
    expect(nextPreview).toMatchObject({ total: 1 });
    expect([...nextPreview.changedFiles]).toEqual([FR_PATH]);
    // 지문 없이 실행한다 — 실행이 스냅샷 전에 ADD 요청을 만료하므로(PR이 머지됐다) 만료 전 미리보기의 지문은 reconfirm이다(`lib/pull/run.ts`).
    const next = fake(merged);
    expect(await publish()).toMatchObject({ status: "committed" });
    expect(changesOf(next)).toEqual([{ kind: "upsert", path: FR_PATH, content: '"title" = "Accueil";\n"count" = "%d éléments";\n', inBase: true }]);
  });

  it("제거: 미리보기와 실행이 그 언어 파일 삭제 하나를 말한다", async () => {
    const approval = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    if (!approval.ok) throw new Error(JSON.stringify(approval));
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: approval.approval })).toMatchObject({ ok: true, kind: "request-removal" });
    fake(FILES);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 0, fileChanges: [{ path: KO_PATH, kind: "removed" }] });

    const made = fake(FILES);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", files: [{ path: KO_PATH, kind: "removed" }] });
    expect(changesOf(made)).toEqual([{ kind: "delete", path: KO_PATH }]);
  });
});
