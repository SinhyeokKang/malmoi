import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";
import { applyKeySave } from "@/lib/keys/save-key";
import { loadPullState, saveLastPulledAt } from "@/lib/pull/load";

/**
 * **키 단위 저장** (translation-rework T10 — spec §3.4 · design §4 · ARCHITECTURE §5.8).
 *
 * - 바뀐 로케일 전부가 **한 트랜잭션**이다 — 하나라도 무효면 쓰기 0건, 사건 기록이 실패해도 전부 롤백이다.
 * - no-op 셀은 값·토큰·사건을 쓰지 않는다. 나중 저장이 최종 값이다(충돌 비교 없음).
 * - 미전달이 아니던 셀이 미전달이 되는 순간에만 직전 값을 복원 기준으로 남긴다 — 전달 확인이 유효하고 Publish가 진행 중이 아닐 때.
 * ⚠️ "쓰지 않는다" 단언마다 같은 픽스처의 쓰는 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-save-key-"));
let binaries: string;
const PORT = 55495;
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
  for (const id of ["u1", "u2"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
  await seed("p");
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

/** 프로젝트 · 표면 `s` · en(base)·ko·ja · 키 k1(en "Hi" · ko "안녕" · ja 없음) · 오펀 키 k0 · 편집 없음. */
async function seed(p: string) {
  await prisma.project.create({ data: { id: p, slug: p, name: p, repoOwner: "o", repoName: p, baseBranch: "main", installationId: "1", repositoryId: `r-${p}` } });
  // 저장이 잠금 뒤 저자의 멤버십을 다시 본다 (감사 #10) — 저자 둘을 EDITOR로 둔다.
  await prisma.projectMember.createMany({ data: ["u1", "u2"].map(userId => ({ projectId: p, userId, role: "EDITOR" as const })) });
  await prisma.translationSurface.create({ data: { id: `${p}-s`, projectId: p, slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, baseLocale: "en", lastCommitSha: "c1" } });
  await prisma.locale.createMany({ data: ["en", "ko", "ja"].map(code => ({ projectId: p, surfaceId: `${p}-s`, code, name: code, isBase: code === "en" })) });
  await prisma.stringKey.create({ data: { id: `${p}-k1`, projectId: p, surfaceId: `${p}-s`, key: "greet", namespace: "_root", sourceText: "Hello", sourceHash: "h" } });
  await prisma.stringKey.create({ data: { id: `${p}-k0`, projectId: p, surfaceId: `${p}-s`, key: "gone", namespace: "_root", sourceText: "Gone", sourceHash: "g", orphaned: true } });
  await prisma.translation.create({ data: { id: `${p}-k1-en`, projectId: p, surfaceId: `${p}-s`, keyId: `${p}-k1`, localeCode: "en", value: "Hi" } });
  await prisma.translation.create({ data: { id: `${p}-k1-ko`, projectId: p, surfaceId: `${p}-s`, keyId: `${p}-k1`, localeCode: "ko", value: "안녕", needsReview: true } });
}

const input = (changes: { localeCode: string; value: string }[], over: Partial<Parameters<typeof applyKeySave>[1]> = {}) =>
  ({ projectId: "p", surfaceId: "p-s", surfaceSlug: "default", keyId: "p-k1", userId: "u1", changes, ...over });
const cell = (locale: string) => prisma.translation.findUnique({ where: { keyId_localeCode: { keyId: "p-k1", localeCode: locale } } });
const events = () => prisma.projectEvent.findMany({ where: { projectId: "p", subtype: "translation.saved" }, orderBy: { occurredAt: "asc" } });
const baselines = () => prisma.translationBaseline.findMany({ where: { projectId: "p" }, orderBy: { localeCode: "asc" } });

/** 실제 Publish 성공 확정으로 전달 확인을 세운다 — 행을 손으로 넣으면 지문 규칙을 우회한다. */
async function confirm() {
  await prisma.syncRun.create({ data: { id: "run", projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
  const state = await loadPullState(prisma, "p");
  await saveLastPulledAt(prisma, "p", new Date(), undefined, state.pendingEdits, { runId: "run", contexts: state.deliveryContexts ?? [] });
  await prisma.syncRun.update({ where: { id: "run" }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
}

describe("applyKeySave — 한 트랜잭션", () => {
  it("바뀐 로케일을 함께 쓰고 셀마다 새 토큰·저자·사건을 남기며 검토 표시를 내린다", async () => {
    const result = await applyKeySave(prisma, input([{ localeCode: "ko", value: "안녕하세요" }, { localeCode: "ja", value: "こんにちは" }]));
    expect(result).toEqual({ ok: true, keyId: "p-k1", cells: [{ localeCode: "ko", value: "안녕하세요" }, { localeCode: "ja", value: "こんにちは" }] });
    const [ko, ja] = [await cell("ko"), await cell("ja")];
    expect(ko).toMatchObject({ value: "안녕하세요", updatedBy: "u1", needsReview: false });
    expect(ja).toMatchObject({ value: "こんにちは", updatedBy: "u1" });
    expect(ko?.pendingEditToken).toEqual(expect.any(String));
    expect(ja?.pendingEditToken).not.toBe(ko?.pendingEditToken);
    // 같은 tx의 사건은 `occurredAt`이 같다 — 순서가 아니라 집합을 본다.
    const payloads = (await events()).map(e => e.payload as { locale: string }).sort((a, b) => a.locale.localeCompare(b.locale));
    expect(payloads).toEqual([
      expect.objectContaining({ locale: "ja", before: null, after: "こんにちは" }),
      expect.objectContaining({ locale: "ko", before: "안녕", after: "안녕하세요" }),
    ]);
  });

  it("무효한 로케일이 하나라도 있으면 유효한 변경까지 쓰지 않는다 (위 성공 경로 대조)", async () => {
    const result = await applyKeySave(prisma, input([{ localeCode: "ko", value: "x" }, { localeCode: "fr", value: "y" }]));
    expect(result).toEqual({ ok: false, error: "unknown-locale", localeCodes: ["fr"] });
    expect((await cell("ko"))?.value).toBe("안녕");
    expect(await events()).toEqual([]);
  });

  it("no-op 셀은 값·토큰·사건을 쓰지 않고, 같은 요청의 바뀐 셀만 쓴다", async () => {
    await applyKeySave(prisma, input([{ localeCode: "en", value: "Hi" }, { localeCode: "ko", value: "새 값" }]));
    expect((await cell("en"))?.pendingEditToken).toBeNull();
    expect((await events()).map(e => (e.payload as { locale: string }).locale)).toEqual(["ko"]);
  });

  it("공백만 입력은 빈 문자열로 저장한다 — 응답도 정규화된 값이다", async () => {
    expect(await applyKeySave(prisma, input([{ localeCode: "ko", value: "   " }]))).toEqual({ ok: true, keyId: "p-k1", cells: [{ localeCode: "ko", value: "" }] });
  });

  it("오펀 키·다른 표면의 키는 쓰지 않는다", async () => {
    expect(await applyKeySave(prisma, input([{ localeCode: "en", value: "x" }], { keyId: "p-k0" }))).toEqual({ ok: false, error: "key-unavailable" });
    await seed("q");
    expect(await applyKeySave(prisma, input([{ localeCode: "en", value: "x" }], { keyId: "q-k1" }))).toEqual({ ok: false, error: "key-unavailable" });
    expect((await prisma.translation.findUnique({ where: { keyId_localeCode: { keyId: "q-k1", localeCode: "en" } } }))?.value).toBe("Hi");
  });

  it("사건 기록이 실패하면 값·토큰까지 전부 롤백된다", async () => {
    await pool.query(`CREATE FUNCTION fail_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'event write failed'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_event BEFORE INSERT ON "ProjectEvent" FOR EACH ROW EXECUTE FUNCTION fail_event();`);
    await expect(applyKeySave(prisma, input([{ localeCode: "ko", value: "x" }, { localeCode: "ja", value: "y" }]))).rejects.toThrow(/event write failed/);
    expect((await cell("ko"))?.value).toBe("안녕");
    expect(await cell("ja")).toBeNull();
  });

  it("두 사용자의 연속 저장은 나중 것이 최종 값이다 — 충돌 비교가 없다", async () => {
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "A" }], { userId: "u1" }));
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "B" }], { userId: "u2" }));
    expect(await cell("ko")).toMatchObject({ value: "B", updatedBy: "u2" });
  });
});

describe("applyKeySave — 복원 기준 기록 (design §10.3)", () => {
  it("전달 확인이 유효하면 미전달이 되는 셀의 직전 export 값을 남긴다 — 행이 없던 셀은 비-base라 빈 문자열이다", async () => {
    await confirm();
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "A" }, { localeCode: "ja", value: "J" }]));
    const revision = (await prisma.deliveryConfirmation.findFirst({ where: { projectId: "p" } }))?.revision;
    expect(await baselines()).toEqual([
      expect.objectContaining({ localeCode: "ja", restoreValue: "", revision }),
      expect.objectContaining({ localeCode: "ko", restoreValue: "안녕", revision }),
    ]);
  });

  it("base의 빈 값은 원문을 기준으로 남긴다 (POSTMORTEM 2026-09-09)", async () => {
    await prisma.translation.update({ where: { id: "p-k1-en" }, data: { value: "" } });
    await confirm();
    await applyKeySave(prisma, input([{ localeCode: "en", value: "Hey" }]));
    expect(await baselines()).toEqual([expect.objectContaining({ localeCode: "en", restoreValue: "Hello" })]);
  });

  it("이미 미전달인 셀의 재저장은 기준을 바꾸지 않는다", async () => {
    await confirm();
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "A" }]));
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "B" }]));
    expect(await baselines()).toEqual([expect.objectContaining({ localeCode: "ko", restoreValue: "안녕" })]);
  });

  it("전달 확인이 없거나 무효면 기록하지 않는다 (위 기록 경로 대조)", async () => {
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "A" }]));
    expect(await baselines()).toEqual([]);
    await prisma.translation.update({ where: { id: "p-k1-ko" }, data: { pendingEditToken: null } });
    await confirm();
    await prisma.deliveryConfirmation.updateMany({ where: { projectId: "p" }, data: { invalidatedAt: new Date() } });
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "B" }]));
    expect(await baselines()).toEqual([]);
  });

  it("Publish가 진행 중(RUNNING)이면 기록하지 않는다 — 그 실행이 이 값을 보냈는지 아직 모른다", async () => {
    await confirm();
    await prisma.syncRun.create({ data: { id: "run2", projectId: "p", status: "RUNNING", trigger: "MANUAL" } });
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "A" }]));
    expect(await baselines()).toEqual([]);
  });

  it("캡처 뒤 적재가 context를 바꿨으면(importRevision) 기록하지 않는다", async () => {
    await confirm();
    await prisma.translationSurface.update({ where: { id: "p-s" }, data: { importRevision: { increment: 1 } } });
    await applyKeySave(prisma, input([{ localeCode: "ko", value: "A" }]));
    expect(await baselines()).toEqual([]);
  });
});

/**
 * **수술적 표면의 비-base 비우기 거부** (delivery-invariants D2 · 감사 #2). 수술적 writer는 값을 지울 줄 몰라 비운 셀은 원본 리터럴이
 * 남는데 pull이 토큰을 해제했다. 판정은 잠금 안이고 거부 단위는 키 전체다 — 행·값·토큰·사건 불변.
 */
describe("applyKeySave — 수술적 표면의 비-base 비우기", () => {
  beforeEach(async () => {
    await prisma.translationSurface.update({ where: { id: "p-s" }, data: { adapterName: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml", nested: null } });
  });

  it("비-base ko \"\" → cannot-clear · 그 키의 어떤 셀도 쓰이지 않는다", async () => {
    const before = await cell("ko");
    expect(await applyKeySave(prisma, input([{ localeCode: "ja", value: "J" }, { localeCode: "ko", value: "  " }])))
      .toEqual({ ok: false, error: "cannot-clear", localeCodes: ["ko"] });
    expect(await cell("ko")).toEqual(before);
    expect(await cell("ja")).toBeNull();
    expect(await events()).toEqual([]);
  });

  it("base en \"\"는 기존대로 저장된다 (짝)", async () => {
    expect(await applyKeySave(prisma, input([{ localeCode: "en", value: "" }]))).toEqual({ ok: true, keyId: "p-k1", cells: [{ localeCode: "en", value: "" }] });
    expect(await cell("en")).toMatchObject({ value: "", updatedBy: "u1" });
  });
});
