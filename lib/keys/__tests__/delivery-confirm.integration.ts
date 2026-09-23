import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { invalidateDeliveryConfirmations, loadPullState, saveLastPulledAt } from "@/lib/pull/load";

/**
 * **Publish 성공 확정과 전달 기준** (translation-rework T6·T7 — ARCHITECTURE §5.8 · design §10.3).
 *
 * - 성공 확정 tx 하나가 `lastPulledAt` · 토큰 CAS · 기준 해제/교체 · 소스별 전달 확인을 함께 쓴다. 하나라도 실패하면 전부 롤백이다.
 * - 캡처 뒤 재편집된 셀(A 전송 중 B 저장)은 pending이 남고 기준은 **캡처값 A**다 — 현재 DB의 B를 기준으로 쓰지 않는다.
 * - 실행권을 잃었거나(SyncRun이 RUNNING이 아니다) 캡처 뒤 context가 바뀌었으면 그 확인을 쓰지 않는다 — 늦은 Publish가 무효화를 덮지 않는다.
 * ⚠️ 쓰지 않는다는 단언마다 같은 픽스처의 **쓰는 경로**를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-delivery-confirm-"));
let binaries: string;
const PORT = 55493;
let pool: Pool;
let prisma: PrismaClient;
let started = false;
const AFTER = new Date("2026-09-23T00:00:00Z");

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
  await seed("p");
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

/** 프로젝트 `p` · 표면 `s` · 로케일 en(base)·ko · 키 k1·k2 · 편집 넷(전부 pending) · RUNNING 실행 `run`. */
async function seed(p: string) {
  await prisma.project.create({ data: { id: p, slug: p, name: p, repoOwner: "o", repoName: p, baseBranch: "main", installationId: "1", repositoryId: "100" } });
  await prisma.translationSurface.create({ data: { id: `${p}-s`, projectId: p, slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en" } });
  await prisma.locale.createMany({ data: ["en", "ko"].map(code => ({ projectId: p, surfaceId: `${p}-s`, code, name: code, isBase: code === "en" })) });
  for (const key of ["k1", "k2"]) {
    await prisma.stringKey.create({ data: { id: `${p}-${key}`, projectId: p, surfaceId: `${p}-s`, key, namespace: "_root", sourceText: `src-${key}`, sourceHash: key } });
    for (const locale of ["en", "ko"]) {
      // k2/en은 빈 값 — base의 복원값은 원문이어야 한다(export 폴백).
      const value = key === "k2" && locale === "en" ? "" : `v-${key}-${locale}`;
      await prisma.translation.create({ data: { id: `${p}-${key}-${locale}`, projectId: p, surfaceId: `${p}-s`, keyId: `${p}-${key}`, localeCode: locale, value, pendingEditToken: `tok-${key}-${locale}` } });
    }
  }
  await prisma.syncRun.create({ data: { id: `${p}-run`, projectId: p, status: "RUNNING", trigger: "MANUAL" } });
}

const confirmation = (surfaceId = "p-s") => prisma.deliveryConfirmation.findUnique({ where: { projectId_surfaceId: { projectId: "p", surfaceId } } });
const baselines = () => prisma.translationBaseline.findMany({ where: { projectId: "p" }, orderBy: [{ keyId: "asc" }, { localeCode: "asc" }] });
const token = async (id: string) => (await prisma.translation.findUnique({ where: { id } }))?.pendingEditToken ?? null;

describe("loadPullState — 캡처한 편집에 복원 정보와 context를 싣는다", () => {
  it("각 캡처 셀이 좌표와 export 폴백 복원값을 든다", async () => {
    const state = await loadPullState(prisma, "p");
    const byId = new Map(state.pendingEdits.map(edit => [edit.id, edit]));
    expect(byId.get("p-k1-ko")?.cell).toEqual({ surfaceId: "p-s", keyId: "p-k1", localeCode: "ko", restoreValue: "v-k1-ko" });
    expect(byId.get("p-k2-en")?.cell).toEqual({ surfaceId: "p-s", keyId: "p-k2", localeCode: "en", restoreValue: "src-k2" });
  });

  it("활성 표면마다 context 지문이 하나다", async () => {
    const state = await loadPullState(prisma, "p");
    expect(state.deliveryContexts?.map(c => c.surfaceId)).toEqual(["p-s"]);
    expect(state.deliveryContexts?.[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("saveLastPulledAt — 성공 확정 tx", () => {
  it("전달이 확인되면 소스 확인 행을 새 revision으로 쓰고 해제된 셀에는 기준이 남지 않는다", async () => {
    const state = await loadPullState(prisma, "p");
    await saveLastPulledAt(prisma, "p", AFTER, { prUrl: "u" }, state.pendingEdits, { runId: "p-run", contexts: state.deliveryContexts ?? [] });
    const row = await confirmation();
    expect(row).toMatchObject({ syncRunId: "p-run", invalidatedAt: null, contextFingerprint: state.deliveryContexts?.[0]?.fingerprint });
    expect(row?.revision).toMatch(/^[0-9a-f-]{36}$/);
    expect(await baselines()).toEqual([]);
    expect(await token("p-k1-ko")).toBeNull();
  });

  it("A 전송 중 B 저장 → B는 pending으로 남고 기준은 캡처값 A다 (같은 픽스처의 해제 셀은 기준 0)", async () => {
    const state = await loadPullState(prisma, "p");
    await prisma.translation.update({ where: { id: "p-k1-ko" }, data: { value: "B", pendingEditToken: "tok-B" } });
    await saveLastPulledAt(prisma, "p", AFTER, { prUrl: "u" }, state.pendingEdits, { runId: "p-run", contexts: state.deliveryContexts ?? [] });
    const row = await confirmation();
    expect(await token("p-k1-ko")).toBe("tok-B");
    expect(await baselines()).toEqual([expect.objectContaining({ keyId: "p-k1", localeCode: "ko", restoreValue: "v-k1-ko", revision: row?.revision })]);
    expect(await token("p-k1-en")).toBeNull();
  });

  it("다시 확인하면 revision이 바뀐다 — 같은 값의 재확인도 다른 관측이다", async () => {
    const first = await loadPullState(prisma, "p");
    await saveLastPulledAt(prisma, "p", AFTER, undefined, first.pendingEdits, { runId: "p-run", contexts: first.deliveryContexts ?? [] });
    const before = (await confirmation())?.revision;
    await saveLastPulledAt(prisma, "p", AFTER, undefined, [], { runId: "p-run", contexts: first.deliveryContexts ?? [] });
    expect((await confirmation())?.revision).not.toBe(before);
  });

  it("실행권을 잃었으면(RUNNING 아님) 확인을 쓰지 않는다 — lastPulledAt·CAS는 기존대로 간다", async () => {
    const state = await loadPullState(prisma, "p");
    await prisma.syncRun.update({ where: { id: "p-run" }, data: { status: "FAILED", errorCode: "stale", finishedAt: new Date() } });
    await saveLastPulledAt(prisma, "p", AFTER, undefined, state.pendingEdits, { runId: "p-run", contexts: state.deliveryContexts ?? [] });
    expect(await confirmation()).toBeNull();
    expect(await token("p-k1-ko")).toBeNull();
    expect((await prisma.project.findUnique({ where: { id: "p" } }))?.lastPulledAt).toEqual(AFTER);
  });

  it("캡처 뒤 적재가 context를 바꿨으면(importRevision 증가) 확인을 쓰지 않는다 — 늦은 Publish가 무효화를 덮지 않는다", async () => {
    const state = await loadPullState(prisma, "p");
    await prisma.translationSurface.update({ where: { id: "p-s" }, data: { importRevision: { increment: 1 } } });
    await saveLastPulledAt(prisma, "p", AFTER, undefined, state.pendingEdits, { runId: "p-run", contexts: state.deliveryContexts ?? [] });
    expect(await confirmation()).toBeNull();
  });

  it("delivery를 안 넘기면 확인·기준을 건드리지 않는다 — 기존 호출부와 같다", async () => {
    const state = await loadPullState(prisma, "p");
    await saveLastPulledAt(prisma, "p", AFTER, undefined, state.pendingEdits);
    expect(await confirmation()).toBeNull();
    expect(await token("p-k1-ko")).toBeNull();
  });

  it("한 문장이라도 실패하면 lastPulledAt·CAS·확인이 전부 롤백된다", async () => {
    const state = await loadPullState(prisma, "p");
    await prisma.translation.update({ where: { id: "p-k1-ko" }, data: { value: "B", pendingEditToken: "tok-B" } });
    // 재편집 셀의 좌표를 없는 로케일로 바꿔 기준 upsert가 FK로 실패하게 한다.
    const broken = state.pendingEdits.map(edit => edit.id === "p-k1-ko" && edit.cell ? { ...edit, cell: { ...edit.cell, localeCode: "zz" } } : edit);
    await expect(saveLastPulledAt(prisma, "p", AFTER, { prUrl: "u" }, broken, { runId: "p-run", contexts: state.deliveryContexts ?? [] })).rejects.toThrow();
    expect(await confirmation()).toBeNull();
    expect(await token("p-k1-en")).toBe("tok-k1-en");
    expect((await prisma.project.findUnique({ where: { id: "p" } }))?.lastPulledAt).toBeNull();
  });
});

describe("invalidateDeliveryConfirmations", () => {
  it("유효한 확인에만 무효화 시각을 쓰고, 이미 무효인 행의 시각은 바꾸지 않는다", async () => {
    const state = await loadPullState(prisma, "p");
    await saveLastPulledAt(prisma, "p", AFTER, undefined, state.pendingEdits, { runId: "p-run", contexts: state.deliveryContexts ?? [] });
    expect((await confirmation())?.invalidatedAt).toBeNull();
    await invalidateDeliveryConfirmations(prisma, "p");
    const first = (await confirmation())?.invalidatedAt;
    expect(first).toBeInstanceOf(Date);
    await invalidateDeliveryConfirmations(prisma, "p");
    expect((await confirmation())?.invalidatedAt).toEqual(first);
  });

  it("다른 프로젝트의 확인은 건드리지 않는다", async () => {
    await seed("q");
    const q = await loadPullState(prisma, "q");
    await saveLastPulledAt(prisma, "q", AFTER, undefined, q.pendingEdits, { runId: "q-run", contexts: q.deliveryContexts ?? [] });
    await invalidateDeliveryConfirmations(prisma, "p");
    const row = await prisma.deliveryConfirmation.findUnique({ where: { projectId_surfaceId: { projectId: "q", surfaceId: "q-s" } } });
    expect(row?.invalidatedAt).toBeNull();
  });
});
