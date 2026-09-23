import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import type { RepoReader } from "@/lib/github";
import { blobSha } from "@/lib/githash";
import { readDiscardApproval } from "@/lib/import/approval";
import { runRepositoryImportFromReader } from "@/lib/import/run";
import { countPending } from "@/lib/protection/where";
import { invalidateDeliveryConfirmations, loadPullState, saveLastPulledAt } from "@/lib/pull/load";
import { runPull } from "@/lib/pull/run";
import { createFakeGitClient } from "@/lib/pull/__tests__/fake-client";
import { applyProtectedPush, applyPush } from "@/lib/push/apply";
import { hashPushToken } from "@/lib/push/token";

import { applyKeySave } from "../save-key";
import { executeKeyRevert, previewKeyRevert } from "../revert";

/**
 * **전달 층 불변식** (delivery-invariants — 감사 B1 #1·#58·#59·#3). 각 "0건·불변" 단언은 같은 픽스처의 허용 경로에서
 * N > 0을 짝으로 든다(POSTMORTEM 2026-09-14 "조건 불일치 0행은 조용하다").
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-delivery-invariants-"));
let binaries: string;
const PORT = 55540;
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

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const repository = { repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" };
const pulled = new Date("2026-09-10T00:00:00Z");
const pushToken = "isolated-delivery-invariants";
const LOCALES = ["en", "ko", "fr"];

async function seed(surface: { adapterName: string; pathTemplate: string } = { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json" }) {
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", ...repository, pushTokenHash: hashPushToken(pushToken), lastPulledAt: pulled,
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", ...surface, baseLocale: "en", lastCommitSha: "a".repeat(40), lastCommitAt: pulled } },
  } });
}

let commits = 0;
/** CI push 페이로드. `translations`를 주면 그것만 싣는다(기본: 모든 키 × 로케일에 `value`). */
function payload(keys: string[], opts: { value?: string; locales?: string[]; translations?: { key: string; locale: string; value: string }[]; adapter?: "json-catalog" | "yaml-catalog"; pathTemplate?: string } = {}) {
  const locales = opts.locales ?? LOCALES;
  commits += 1;
  return {
    projectSlug: "fixture", surfaceSlug: "default", commitSha: String(commits).padStart(40, "0"),
    commitAt: new Date(Date.UTC(2026, 8, 20, 0, commits)).toISOString(),
    format: { adapter: opts.adapter ?? "json-catalog" as const, pathTemplate: opts.pathTemplate ?? "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales,
    keys: keys.map(key => ({ key, namespace: "_root", sourceText: `Source ${key}` })),
    translations: opts.translations ?? keys.flatMap(key => locales.map(locale => ({ key, locale, value: opts.value ?? "CI" }))),
    refs: [],
  };
}
const ci = (p: ReturnType<typeof payload>) => applyPush(prisma, { projectId: "p", surfaceId: "s" }, p, { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
const protectedCi = (p: ReturnType<typeof payload>) => applyProtectedPush(prisma, { projectId: "p", surfaceId: "s" }, p,
  { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace", pushTokenHash: hashPushToken(pushToken) });

const cellOf = async (key: string, locale: string) => {
  const k = await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key } });
  return prisma.translation.findUnique({ where: { keyId_localeCode: { keyId: k.id, localeCode: locale } }, select: { value: true, updatedBy: true, pendingEditToken: true } });
};
const tokensOf = async (key: string) => (await prisma.translation.findMany({ where: { projectId: "p", stringKey: { key }, pendingEditToken: { not: null } } })).length;

/** 수동 Sync의 리포 — 경로별 내용. 함수면 호출 순서로 다르게 줄 수 있다. */
function reader(files: Record<string, string | undefined | (() => string | undefined)>, pause?: { entered: () => void; release: Promise<void> }): RepoReader {
  return {
    snapshot: vi.fn<RepoReader["snapshot"]>(async () => {
      if (pause) { pause.entered(); await pause.release; }
      return { status: "ok", headSha: "c".repeat(40), headCommittedAt: "2026-09-16T00:00:00Z", files: Object.keys(files).map(path => ({ path, sha: path, size: 100 })) };
    }),
    blob: vi.fn(async (sha: string) => { const entry = files[sha]; return typeof entry === "function" ? entry() : entry; }),
  };
}
const approve = async () => (await readDiscardApproval(prisma, { projectId: "p", userId: "owner" })).fingerprint;
const sync = (repo: RepoReader, approval: string | null) =>
  runRepositoryImportFromReader(prisma, { projectId: "p", userId: "owner", repository, approval }, async () => repo);
const edit = (key: string, locales: string[], tag = "tok") =>
  pool.query(`UPDATE "Translation" t SET "value" = 'Edited', "updatedBy" = 'owner', "pendingEditToken" = $1 || '-' || t."localeCode"
    FROM "StringKey" k WHERE k."id" = t."keyId" AND k."key" = $2 AND t."projectId" = 'p' AND t."localeCode" = ANY($3::text[])`, [`${tag}-${key}`, key, locales]);

// ── #1 유령 보류 · D1 ─────────────────────────────────────────────────────────────────────────────

describe("#1 · D1 — 폐기 승인 Sync가 이번 적재로 orphan이 된 승인 셀의 토큰을 비운다", () => {
  const onlyKey0 = () => reader(Object.fromEntries(LOCALES.map(l => [`i18n/${l}.json`, '{"key0":"Repository"}'])));

  it("키 key1을 orphan시킨 뒤 key1을 되살리는 CI push가 applied이고 그 뒤 countPending 0이다", async () => {
    await seed(); await ci(payload(["key0", "key1"]));
    await edit("key1", ["ko", "fr"]);
    expect(await sync(onlyKey0(), await approve())).toMatchObject({ ok: true, remainingEdits: 0 });
    expect(await tokensOf("key1")).toBe(0);
    expect(await protectedCi(payload(["key0", "key1"]))).toMatchObject({ status: "applied" });
    expect(await countPending(prisma, "p")).toBe(0);
  });

  it("[a] 표면 A 적재 · 표면 B 실패 → A의 orphan 승인 토큰만 해제, B 토큰은 남는다 (N > 0 짝)", async () => {
    await seed(); await ci(payload(["key0", "key1"]));
    await prisma.translationSurface.create({ data: { id: "second", projectId: "p", slug: "second", adapterName: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "en", lastCommitSha: "a".repeat(40), lastCommitAt: pulled } });
    await applyPush(prisma, { projectId: "p", surfaceId: "second" }, { ...payload(["b0"]), surfaceSlug: "second", format: { adapter: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "en", nested: false } },
      { token: "ci", startedAt: new Date(), previousBaseLocale: "en", refsMode: "replace" });
    await edit("key1", ["ko", "fr"]);
    await edit("b0", ["ko", "fr"]);
    const repo = reader({
      ...Object.fromEntries(LOCALES.map(l => [`i18n/${l}.json`, '{"key0":"Repository"}'])),
      ...Object.fromEntries(LOCALES.map(l => [`second/${l}.json`, "{"])),
    });
    expect(await sync(repo, await approve())).toMatchObject({ ok: true, surfaces: [{ status: "imported" }, { status: "failed" }], remainingEdits: 2 });
    expect(await tokensOf("key1")).toBe(0);
    expect(await tokensOf("b0")).toBe(2);
  });

  it("[c] orphan 아닌 승인 셀 중 페이로드가 안 덮은 셀(fr 파일에 key0 없음)은 토큰이 남고 remainingEdits가 그 수다", async () => {
    await seed(); await ci(payload(["key0", "key1"]));
    await edit("key0", ["ko", "fr"]);
    await edit("key1", ["ko"]);
    const repo = reader({ "i18n/en.json": '{"key0":"Repository"}', "i18n/ko.json": '{"key0":"Repository"}', "i18n/fr.json": "{}" });
    expect(await sync(repo, await approve())).toMatchObject({ ok: true, remainingEdits: 1 });
    expect(await cellOf("key0", "fr")).toMatchObject({ pendingEditToken: "tok-key0-fr" });
    expect(await tokensOf("key1")).toBe(0);
  });

  it("[d] 승인 뒤 새로 저장된 셀은 orphan이 돼도 토큰이 남는다 — 승인하지 않은 편집이다 (승인 셀 해제 대조)", async () => {
    await seed(); await ci(payload(["key0", "key1"]));
    await edit("key1", ["ko", "fr"]);
    const approval = await approve();
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const running = sync(reader(Object.fromEntries(LOCALES.map(l => [`i18n/${l}.json`, '{"key0":"Repository"}'])), { entered, release: gate }), approval);
    await ready;
    await edit("key1", ["ko"], "late");
    release();
    expect(await running).toMatchObject({ ok: true });
    expect(await cellOf("key1", "ko")).toMatchObject({ pendingEditToken: "late-key1-ko" });
    expect(await cellOf("key1", "fr")).toMatchObject({ pendingEditToken: null });
  });
});

// ── #58 orphan 셀 덮기 · D5 ──────────────────────────────────────────────────────────────────────

describe("#58 · D5 — 비-base 셀은 이번 페이로드의 base 키 집합으로 거른다", () => {
  it("비-base 파일에만 남은 기존 orphan 키 z의 셀은 값·저자·행 존재가 불변이다 · 같은 파일의 base 키 셀은 덮인다 (짝)", async () => {
    await seed();
    await ci(payload(["key0", "z"], { value: "V1" }));
    await ci(payload(["key0"], { value: "V2" }));
    await pool.query(`UPDATE "Translation" t SET "updatedBy" = 'someone' FROM "StringKey" k WHERE k."id" = t."keyId" AND k."key" = 'z' AND t."localeCode" = 'fr'`);
    await ci(payload(["key0"], { locales: ["en", "ko", "fr", "ja"], translations: [
      ...["en", "ko", "fr", "ja"].map(locale => ({ key: "key0", locale, value: "V3" })),
      { key: "z", locale: "fr", value: "V3" }, { key: "z", locale: "ja", value: "V3" },
    ] }));
    expect(await cellOf("z", "fr")).toEqual({ value: "V1", updatedBy: "someone", pendingEditToken: null });
    expect(await cellOf("z", "ja")).toBeNull();
    expect(await cellOf("key0", "fr")).toMatchObject({ value: "V3", updatedBy: null });
  });
});

// ── #59 일시 실패가 로케일을 지운다 · D6 ───────────────────────────────────────────────────────────

describe("#59 · D6 — 수동 Sync에서 fr blob 첫 다운로드가 실패해도 fr을 orphan시키지 않는다", () => {
  it("재시도 성공 → fr 적재 · orphaned false", async () => {
    await seed(); await ci(payload(["key0"]));
    let calls = 0;
    const repo = reader({ "i18n/en.json": '{"key0":"Repo"}', "i18n/ko.json": '{"key0":"Repo"}', "i18n/fr.json": () => (++calls === 1 ? undefined : '{"key0":"Repo fr"}') });
    expect(await sync(repo, null)).toMatchObject({ ok: true, surfaces: [{ status: "imported" }] });
    expect(await prisma.locale.findFirstOrThrow({ where: { projectId: "p", code: "fr" } })).toMatchObject({ orphaned: false });
    expect(await cellOf("key0", "fr")).toMatchObject({ value: "Repo fr" });
  });

  it("재시도도 실패 → fr orphaned false · partial-import (ko는 적재된다 — 짝)", async () => {
    await seed(); await ci(payload(["key0"]));
    const repo = reader({ "i18n/en.json": '{"key0":"Repo"}', "i18n/ko.json": '{"key0":"Repo ko"}', "i18n/fr.json": () => undefined });
    expect(await sync(repo, null)).toMatchObject({ ok: true, surfaces: [{ status: "partial" }] });
    expect(await prisma.locale.findFirstOrThrow({ where: { projectId: "p", code: "fr" } })).toMatchObject({ orphaned: false });
    expect(await prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" } })).toMatchObject({ lastImportError: "partial-import" });
    expect(await cellOf("key0", "ko")).toMatchObject({ value: "Repo ko" });
  });
});

// ── #3 · D3 — 보류 셀이 있는 Publish 뒤의 Revert와 대가 ─────────────────────────────────────────

describe("#3 · D3 — 보류 셀이 있는 Publish 뒤에도 OWNER Revert가 살고, 보류가 0이 되면 CI가 다시 적재된다", () => {
  const yaml = { adapterName: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml" };
  const EN = "en:\n  a: one\n";
  const KO = "ko:\n  a: 하나\n";
  const yamlPayload = () => payload(["a"], { adapter: "yaml-catalog", pathTemplate: yaml.pathTemplate, value: "Repo" });
  let runs = 0;

  /** 실제 Publish — 로드·렌더·성공 확정이 전부 실물이고 GitHub만 fake다. */
  async function publish(tree: { path: string; content: string }[]) {
    const id = `run-${++runs}`;
    await prisma.syncRun.create({ data: { id, projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
    const { client } = createFakeGitClient({
      refSha: { "heads/main": "basehead" },
      tree: { basehead: tree.map(f => ({ path: f.path, sha: blobSha(f.content) })) },
      blobs: Object.fromEntries(tree.map(f => [blobSha(f.content), f.content])),
    });
    const result = await runPull({
      loadState: () => loadPullState(prisma, "fixture"),
      createClient: async () => client,
      saveLastPulledAt: (projectId, at, published, delivered, contexts, withheld) =>
        saveLastPulledAt(prisma, projectId, at, published, delivered, { runId: id, contexts, withheld }),
      invalidateDelivery: projectId => invalidateDeliveryConfirmations(prisma, projectId),
      syncBranch: "malmoi-i18n/sync-fixture",
    });
    await prisma.syncRun.update({ where: { id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    return result;
  }
  const target = async () => ({ projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId: (await prisma.stringKey.findFirstOrThrow({ where: { projectId: "p", key: "a" } })).id, userId: "owner" });

  async function withheldFixture() {
    await seed(yaml);
    await ci(yamlPayload());
    // 편집 전 전달 확인을 세운다 — Save가 기준을 기록하려면 유효한 확인이 있어야 한다(편집 0이면 Publish가 1층에서 끝나므로 확정만 직접 부른다).
    await prisma.syncRun.create({ data: { id: "confirm", projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
    const state = await loadPullState(prisma, "fixture");
    await saveLastPulledAt(prisma, "p", new Date(), undefined, [], { runId: "confirm", contexts: state.deliveryContexts ?? [] });
    await prisma.syncRun.update({ where: { id: "confirm" }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    const t = await target();
    expect(await applyKeySave(prisma, { ...t, changes: [{ localeCode: "ko", value: "하나!" }, { localeCode: "fr", value: "un!" }] })).toMatchObject({ ok: true });
    // fr.yml이 base에 없다 — fr 셀은 보류되고 ko는 나간다.
    expect(await publish([{ path: "config/locales/en.yml", content: EN }, { path: "config/locales/ko.yml", content: KO }]))
      .toMatchObject({ status: "committed", delivered: 1 });
    expect(await cellOf("a", "ko")).toMatchObject({ pendingEditToken: null });
    expect((await cellOf("a", "fr"))?.pendingEditToken).not.toBeNull();
    return t;
  }

  it("보류된 fr을 OWNER가 마지막 전달 값으로 되돌릴 수 있다", async () => {
    const t = await withheldFixture();
    const preview = await previewKeyRevert(prisma, t);
    expect(preview).toMatchObject({ status: "ready", locales: [{ code: "fr", after: "Repo" }] });
    if (preview.status !== "ready") throw new Error("expected ready");
    expect(await executeKeyRevert(prisma, { ...t, confirmation: preview.confirmation })).toMatchObject({ status: "reverted" });
    expect(await cellOf("a", "fr")).toMatchObject({ value: "Repo", pendingEditToken: null });
  });

  it("대가 — 보류 fr이 남은 동안 CI push는 deferred, Revert로 0이 되면 다음 CI push가 applied", async () => {
    const t = await withheldFixture();
    expect(await protectedCi(yamlPayload())).toMatchObject({ status: "deferred", pendingCount: 1 });
    const preview = await previewKeyRevert(prisma, t);
    if (preview.status !== "ready") throw new Error(`expected ready, got ${JSON.stringify(preview)}`);
    await executeKeyRevert(prisma, { ...t, confirmation: preview.confirmation });
    expect(await countPending(prisma, "p")).toBe(0);
    expect(await protectedCi(yamlPayload())).toMatchObject({ status: "applied" });
  });
});
