import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { executeKeyRevert, previewKeyRevert } from "@/lib/keys/revert";
import { applyKeySave } from "@/lib/keys/save-key";
import { invalidateDeliveryConfirmations, loadPullState, saveLastPulledAt } from "@/lib/pull/load";

/**
 * **Revert to last sent** (translation-rework T11 — spec §3.6 · ARCHITECTURE §5.8).
 *
 * 기준값은 **전달 확인된 DB 스냅샷** 하나다 — 현재 리포를 읽지 않는다. 대상은 그 키의 활성 미전달 셀 **전부**이고,
 * 한 셀이라도 기준이 없거나 낡았으면 쓰기 0건이다. 확인창 뒤 상태가 바뀌면 옛 승인으로 새 값을 버리지 않는다(reconfirm).
 * ⚠️ 거부 단언마다 같은 픽스처의 성공 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-revert-key-"));
let binaries: string;
const PORT = 55497;
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
  // 사건의 행위자 FK(`ProjectEvent.actorUserId`)가 실재하는 사용자를 요구한다.
  for (const id of ["editor", "owner", "other", "other-owner"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
  await prisma.project.create({ data: { id: "p", slug: "p", name: "p", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "100" } });
  await prisma.translationSurface.create({ data: { id: "s", projectId: "p", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "c1" } });
  await prisma.locale.createMany({ data: ["en", "ko", "ja"].map(code => ({ projectId: "p", surfaceId: "s", code, name: code, isBase: code === "en" })) });
  await prisma.stringKey.create({ data: { id: "k1", projectId: "p", surfaceId: "s", key: "greet", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
  await prisma.translation.create({ data: { id: "k1-en", projectId: "p", surfaceId: "s", keyId: "k1", localeCode: "en", value: "Hi" } });
  await prisma.translation.create({ data: { id: "k1-ko", projectId: "p", surfaceId: "s", keyId: "k1", localeCode: "ko", value: "안녕" } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

let runs = 0;
/** 실제 Publish 성공 확정. `startedAt`을 주면 그 실행 시각으로 선다(종료 판정용). */
async function confirm(startedAt = new Date()) {
  const id = `run-${++runs}`;
  await prisma.syncRun.create({ data: { id, projectId: "p", status: "RUNNING", trigger: "MANUAL", startedAt } });
  const state = await loadPullState(prisma, "p");
  await saveLastPulledAt(prisma, "p", new Date(), undefined, state.pendingEdits, { runId: id, contexts: state.deliveryContexts ?? [] });
  await prisma.syncRun.update({ where: { id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
}
const save = (changes: { localeCode: string; value: string }[], userId = "editor") =>
  applyKeySave(prisma, { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId: "k1", userId, changes });
const target = { projectId: "p", surfaceId: "s", surfaceSlug: "default", keyId: "k1", userId: "owner" };
const cell = (locale: string) => prisma.translation.findUnique({ where: { keyId_localeCode: { keyId: "k1", localeCode: locale } } });

async function edited() {
  await confirm();
  await save([{ localeCode: "ko", value: "새 값" }, { localeCode: "ja", value: "やあ" }]);
}

describe("previewKeyRevert", () => {
  it("미전달 언어 전부를 전·후 값과 함께 보이고 확인 지문을 발급한다", async () => {
    await edited();
    const preview = await previewKeyRevert(prisma, target);
    expect(preview).toMatchObject({ status: "ready", locales: [
      { code: "ja", before: "やあ", after: "" },
      { code: "ko", before: "새 값", after: "안녕" },
    ] });
    expect(preview.status === "ready" ? preview.confirmation : "").toMatch(/^[0-9a-f]{64}$/);
  });

  it("미전달이 없으면 되돌릴 것이 없다", async () => {
    await confirm();
    expect(await previewKeyRevert(prisma, target)).toEqual({ status: "blocked", reason: "nothing" });
  });

  it("전달 확인 전에 편집된 셀이 있으면 전체 불가다 — 부분 복원 없음", async () => {
    await save([{ localeCode: "ja", value: "early" }]);
    await confirm();
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "k1", localeCode: "ja" } }, data: { pendingEditToken: "still" } });
    await save([{ localeCode: "ko", value: "late" }]);
    expect(await previewKeyRevert(prisma, target)).toEqual({ status: "blocked", reason: "baseline-unknown", localeCodes: ["ja"] });
  });

  it("설정 변경으로 무효화된 확인이면 stale이다", async () => {
    await edited();
    await invalidateDeliveryConfirmations(prisma, "p");
    expect(await previewKeyRevert(prisma, target)).toEqual({ status: "blocked", reason: "baseline-stale" });
  });

  it("Publish·Sync가 진행 중이면 busy다", async () => {
    await edited();
    await prisma.syncRun.create({ data: { id: "live", projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
    expect(await previewKeyRevert(prisma, target)).toEqual({ status: "blocked", reason: "busy" });
  });

  it("확인 직전 300초 안에 시작해 실패한 실행이 있으면 종료 미확인으로 막는다 (그보다 오래되면 연다)", async () => {
    const now = Date.now();
    await prisma.syncRun.create({ data: { id: "failed", projectId: "p", status: "FAILED", trigger: "MANUAL", startedAt: new Date(now - 100_000), finishedAt: new Date(now - 90_000) } });
    await confirm(new Date(now));
    await save([{ localeCode: "ko", value: "x" }]);
    expect(await previewKeyRevert(prisma, target)).toEqual({ status: "blocked", reason: "unsettled" });
    await prisma.syncRun.update({ where: { id: "failed" }, data: { startedAt: new Date(now - 400_000) } });
    expect((await previewKeyRevert(prisma, target)).status).toBe("ready");
  });

  it("다른 프로젝트의 키 id는 대상이 아니다", async () => {
    await edited();
    expect(await previewKeyRevert(prisma, { ...target, projectId: "other" })).toEqual({ status: "blocked", reason: "key-unavailable" });
  });
});

describe("executeKeyRevert", () => {
  it("기준값으로 되돌리고 미전달을 풀며 검토 표시는 남기고 사건을 남긴다", async () => {
    await edited();
    await prisma.translation.update({ where: { keyId_localeCode: { keyId: "k1", localeCode: "ko" } }, data: { needsReview: true } });
    const preview = await previewKeyRevert(prisma, target);
    if (preview.status !== "ready") throw new Error("unreachable");
    const result = await executeKeyRevert(prisma, { ...target, confirmation: preview.confirmation });
    expect(result).toEqual({ status: "reverted", cells: [{ localeCode: "ja", value: "" }, { localeCode: "ko", value: "안녕" }] });
    expect(await cell("ko")).toMatchObject({ value: "안녕", pendingEditToken: null, needsReview: true, updatedBy: "owner" });
    expect(await cell("ja")).toMatchObject({ value: "", pendingEditToken: null });
    expect(await prisma.translationBaseline.count({ where: { projectId: "p" } })).toBe(0);
    const events = await prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "translation.reverted" } });
    expect(events.map(e => e.payload).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      expect.objectContaining({ locale: "ja", before: "やあ", after: "" }),
      expect.objectContaining({ locale: "ko", before: "새 값", after: "안녕" }),
    ]);
  });

  it("값이 같아도 미전달을 푼다 — 일반 저장의 no-op과 다르다", async () => {
    await confirm();
    await save([{ localeCode: "ko", value: "잠깐" }]);
    await save([{ localeCode: "ko", value: "안녕" }]);
    const preview = await previewKeyRevert(prisma, target);
    if (preview.status !== "ready") throw new Error("unreachable");
    await executeKeyRevert(prisma, { ...target, confirmation: preview.confirmation });
    expect(await cell("ko")).toMatchObject({ value: "안녕", pendingEditToken: null });
  });

  it("확인창 뒤 누가 저장했으면 쓰기 0건으로 재확인을 요구한다 (위 성공 경로 대조)", async () => {
    await edited();
    const preview = await previewKeyRevert(prisma, target);
    if (preview.status !== "ready") throw new Error("unreachable");
    await save([{ localeCode: "ko", value: "더 새 값" }], "other");
    expect(await executeKeyRevert(prisma, { ...target, confirmation: preview.confirmation })).toEqual({ status: "reconfirm" });
    expect((await cell("ko"))?.value).toBe("더 새 값");
  });

  it("지문을 위조하거나 다른 사용자가 재사용하면 재확인이다", async () => {
    await edited();
    const preview = await previewKeyRevert(prisma, target);
    if (preview.status !== "ready") throw new Error("unreachable");
    expect(await executeKeyRevert(prisma, { ...target, confirmation: "0".repeat(64) })).toEqual({ status: "reconfirm" });
    expect(await executeKeyRevert(prisma, { ...target, userId: "other-owner", confirmation: preview.confirmation })).toEqual({ status: "reconfirm" });
    expect((await cell("ko"))?.pendingEditToken).not.toBeNull();
  });

  it("실행 시점에 막히면(Publish 시작) 쓰기 0건이다", async () => {
    await edited();
    const preview = await previewKeyRevert(prisma, target);
    if (preview.status !== "ready") throw new Error("unreachable");
    await prisma.syncRun.create({ data: { id: "live", projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
    expect(await executeKeyRevert(prisma, { ...target, confirmation: preview.confirmation })).toEqual({ status: "blocked", reason: "busy" });
    expect((await cell("ko"))?.value).toBe("새 값");
  });

  it("같은 확인으로 두 번 실행하면 둘째는 되돌릴 것이 없다 — 재시도가 새 편집을 버리지 않는다", async () => {
    await edited();
    const preview = await previewKeyRevert(prisma, target);
    if (preview.status !== "ready") throw new Error("unreachable");
    await executeKeyRevert(prisma, { ...target, confirmation: preview.confirmation });
    expect(await executeKeyRevert(prisma, { ...target, confirmation: preview.confirmation })).toEqual({ status: "blocked", reason: "nothing" });
  });
});
