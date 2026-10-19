import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { arbCatalog } from "@/lib/adapters";
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

import { createFakeGitClient } from "./fake-client";

const github = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/repo-host", async importOriginal => ({ ...(await importOriginal<object>()), createGitClient: async () => github.client }));

/**
 * **ARB 소스의 전 경로 — 확정 → 첫 적재 → 언어 추가·제거 → Publish 미리보기·실행** (arb 리뷰 R5 · /ship 6.2).
 *
 * 실제 확정(`planConfirmedFormat`) · 적재(`buildPushPayload` → `applyPush`) · 언어 변경 코어 · `runSync`를 지나고, 끝 단언은 Publish 미리보기와
 * 스냅샷이 싣는 **파일 바이트**다. 실호스트 PR 생성·머지와 `flutter gen-l10n`만 T1.5 실물 검증으로 남는다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-arb-publish-"));
let binaries: string;
const PORT = 55743;
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
const TEMPLATE = "lib/l10n/app_{locale}.arb";
const EN_PATH = "lib/l10n/app_en.arb";
const KO_PATH = "lib/l10n/app_ko.arb";
const FR_PATH = "lib/l10n/app_fr.arb";

/** base — `@greeting`이 키보다 앞에 있다(첫 Publish에 한 번 키 뒤로 옮겨지는 허용 정규화). ICU 복수형은 통짜 문자열이다. */
const EN = [
  "{",
  '  "@@locale": "en",',
  '  "@greeting": {',
  '    "description": "Shown on the home screen"',
  "  },",
  '  "greeting": "Hello",',
  '  "count": "{n, plural, =1{one item} other{{n} items}}",',
  '  "@count": {',
  '    "placeholders": {',
  '      "n": {}',
  "    }",
  "  }",
  "}",
  "",
].join("\n");
/** 번역 — Weblate처럼 `@key`를 복제해 두고, 미번역 `count`의 `@count`도 남아 있다(fix1 — 살아 있는 키의 메타데이터는 남는다). */
const KO = [
  "{",
  '  "@@locale": "ko",',
  '  "greeting": "안녕",',
  '  "@greeting": {',
  '    "description": "Shown on the home screen"',
  "  },",
  '  "@count": {}',
  "}",
  "",
].join("\n");
const FILES = { [EN_PATH]: EN, [KO_PATH]: KO };

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.create({ data: { id: "owner", email: "owner-fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repoHost: "github", repositoryId: "1", installationId: "2", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken("arb-publish-fixture"), members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "arb-catalog", pathTemplate: TEMPLATE, baseLocale: "en" } } } });

  // 확정 → 첫 적재 — 온보딩이 지나는 판정 그대로다.
  const files = Object.entries(FILES).map(([path, content]) => ({ path, content }));
  const confirmed = planConfirmedFormat({ adapter: "arb-catalog", pathTemplate: TEMPLATE, baseLocale: "en" }, files);
  if (confirmed.status !== "ok") throw new Error(`confirm ${JSON.stringify(confirmed)}`);
  const { payload } = buildPushPayload({
    projectSlug: "fixture", surfaceSlug: "default", executionId: null, commitSha: "1".repeat(40), commitAt: "2026-10-19T00:00:00.000Z",
    format: confirmed.format, read: arbCatalog.read(confirmed.format, files), baseLocale: confirmed.baseLocale, scanRefs: [],
  });
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
const changesOf = (made: ReturnType<typeof fake>) =>
  (made.calls.find(call => call.method === "publishSnapshot")?.args[0] as { changes: { kind: string; path: string; content?: string }[] } | undefined)?.changes ?? [];
const save = async (key: string, localeCode: string, value: string) => {
  const keyId = (await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } })).id;
  return applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId, userId: "owner", credential: undefined, changes: [{ localeCode, value }] });
};
/** 미확정 창(300초) 밖으로 민다 — `locale-publish.integration.ts`와 같은 이유다. */
const ageRuns = async () => {
  await pool.query(`UPDATE "SyncRun" SET "startedAt" = "startedAt" - interval '400 seconds', "finishedAt" = "finishedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
  await pool.query(`UPDATE "LocaleChange" SET "requestedAt" = "requestedAt" - interval '400 seconds' WHERE "projectId" = 'p'`);
};
/** 두 텍스트에서 바뀐 줄만 — 첫/둘째 Publish의 셀 외 diff를 줄 단위로 잰다. */
const changedLines = (before: string, after: string) => {
  const a = before.split("\n");
  const b = after.split("\n");
  return { lengthSame: a.length === b.length, lines: b.flatMap((line, i) => (line === a[i] ? [] : [[a[i], line]])) };
};

describe("ARB 확정 → 첫 적재", () => {
  it("엔트리 둘과 ko 번역 하나가 적재되고 `@key`·`@@*`는 키가 아니다", async () => {
    expect((await prisma.stringKey.findMany({ where: { projectId: "p" }, orderBy: { sortIndex: "asc" } })).map(k => [k.key, k.sourceText])).toEqual([
      ["greeting", "Hello"],
      ["count", "{n, plural, =1{one item} other{{n} items}}"],
    ]);
    const ids = new Map((await prisma.stringKey.findMany({ where: { projectId: "p" } })).map(k => [k.id, k.key]));
    const ko = await prisma.translation.findMany({ where: { projectId: "p", localeCode: "ko" } });
    expect(ko.map(t => [ids.get(t.keyId), t.value])).toEqual([["greeting", "안녕"]]);
  });
});

describe("ARB Publish — 첫째와 둘째의 바이트 diff", () => {
  it("첫 Publish는 고친 셀 + base의 `@greeting` 이동뿐이고, 둘째 Publish는 고친 셀만이다", async () => {
    await save("greeting", "ko", "안녕하세요");
    fake(FILES);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 1 });
    expect([...preview.changedFiles].sort()).toEqual([EN_PATH, KO_PATH]);

    const first = fake(FILES);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed" });
    const firstFiles = Object.fromEntries(changesOf(first).map(change => [change.path, change.content!]));
    // base: 값은 그대로이고 `@greeting`만 키 바로 뒤로 한 번 옮겨진다(spec 완료 조건 1의 허용 정규화).
    expect(firstFiles[EN_PATH]).toBe(EN.replace(
      '  "@greeting": {\n    "description": "Shown on the home screen"\n  },\n  "greeting": "Hello",\n',
      '  "greeting": "Hello",\n  "@greeting": {\n    "description": "Shown on the home screen"\n  },\n',
    ));
    // ko: 고친 셀 한 줄뿐 — 복제된 `@greeting`과 미번역 키의 `@count`가 남는다.
    expect(changedLines(KO, firstFiles[KO_PATH]!)).toEqual({ lengthSame: true, lines: [['  "greeting": "안녕",', '  "greeting": "안녕하세요",']] });

    // 첫 PR이 머지됐다 — 다음 Publish의 base는 첫 출력이다.
    await ageRuns();
    const merged = { [EN_PATH]: firstFiles[EN_PATH]!, [KO_PATH]: firstFiles[KO_PATH]! };
    await save("greeting", "ko", "반가워요");
    const second = fake(merged);
    expect(await publish()).toMatchObject({ status: "committed" });
    const secondChanges = changesOf(second);
    expect(secondChanges.map(change => change.path)).toEqual([KO_PATH]);
    expect(changedLines(merged[KO_PATH], secondChanges[0]!.content!)).toEqual({ lengthSame: true, lines: [['  "greeting": "안녕하세요",', '  "greeting": "반가워요",']] });
  });
});

describe("ARB 언어 추가·제거 → Publish 미리보기·실행", () => {
  it("추가: 미리보기와 실행이 같은 새 파일을 말하고, 새 파일은 base 표현 + `@@locale`이고 base의 `@key`는 싣지 않는다", async () => {
    expect(await addLocale(prisma, OWNER, { ...WEB, localeCode: "fr" })).toMatchObject({ ok: true });
    await save("greeting", "fr", "Bonjour");
    // base 정규화(`@greeting` 이동)가 같은 실행에 실리지 않도록 이미 정규화된 base에서 시작한다.
    const normalized = arbCatalog.write({ adapter: "arb-catalog", pathTemplate: TEMPLATE, locales: ["en"], currentFiles: [{ path: EN_PATH, content: EN }] }, {
      locale: "en", entries: [{ key: "greeting", message: "Hello", order: 0 }, { key: "count", message: "{n, plural, =1{one item} other{{n} items}}", order: 1 }],
    })!;
    const files = { [EN_PATH]: normalized, [KO_PATH]: KO };
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview.fileChanges).toEqual([{ path: FR_PATH, kind: "new" }]);

    const made = fake(files);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", delivered: 1 });
    expect(changesOf(made)).toEqual([{ kind: "upsert", path: FR_PATH, content: '{\n  "@@locale": "fr",\n  "greeting": "Bonjour"\n}\n', inBase: false }]);
  });

  it("제거: 미리보기와 실행이 그 언어 파일 삭제 하나를 말한다", async () => {
    const approval = await previewLocaleRemoval(prisma, OWNER, { ...WEB, localeCode: "ko" });
    if (!approval.ok) throw new Error(JSON.stringify(approval));
    expect(await removeLocale(prisma, OWNER, { ...WEB, localeCode: "ko", approval: approval.approval })).toMatchObject({ ok: true, kind: "request-removal" });
    const normalized = EN.replace(
      '  "@greeting": {\n    "description": "Shown on the home screen"\n  },\n  "greeting": "Hello",\n',
      '  "greeting": "Hello",\n  "@greeting": {\n    "description": "Shown on the home screen"\n  },\n',
    );
    const files = { [EN_PATH]: normalized, [KO_PATH]: KO };
    fake(files);
    const preview = await readPublishPreview(prisma, "p", "fixture");
    expect(preview).toMatchObject({ total: 0, fileChanges: [{ path: KO_PATH, kind: "removed" }] });

    const made = fake(files);
    expect(await publish(preview.fingerprint)).toMatchObject({ status: "committed", files: [{ path: KO_PATH, kind: "removed" }] });
    expect(changesOf(made)).toEqual([{ kind: "delete", path: KO_PATH }]);
  });
});
