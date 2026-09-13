import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { optionalEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";
import { applyPush } from "@/lib/push/apply";
import { finishImportRun, markImportStarted, recordReportedFailure } from "@/lib/projects/import-status-store";
import { isUnpublished } from "@/lib/keys/view";
import { countUnpublished, loadProjectListAggregates } from "../query";

/**
 * **raw 집계 둘이 기준 판정과 같은 답을 내는가** (projects-list design §3.2 · tasks T3).
 *
 * ⚠️ **가짜 클라이언트의 호출 수만으로 raw SQL이 맞다고 판정하지 않는다.** `list-aggregates.test.ts`가
 * 재는 것은 "다섯 번만 보냈나"이고, 여기서 재는 것은 **"⑤와 `countUnpublished`가 같은 행을 세나"**다 —
 * 술어가 세 벌(`isUnpublished` 값 판정 / `countUnpublished` 집계 / 이 SQL)이 됐으므로 그중 하나가
 * 낡으면 화면의 숫자와 배너가 갈린다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 로컬 PostgreSQL 바이너리를 요구하고
 * 실제 클러스터를 띄운다 — `lib/credentials/__tests__/postgres.integration.ts`와 같은 패턴이고,
 * 공유 dev/prod 접속 변수는 읽지 않는다.
 */

// Unix 소켓 전용 새 클러스터. DATABASE_URL·DIRECT_URL을 절대 읽지 않는다.
const directory = mkdtempSync(join(tmpdir(), "malmoi-projects-"));
let binaries: string;
const PORT = 55483;
let pool: Pool;
let prisma: PrismaClient;
let started = false;

async function resetSchema() {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: PORT, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});

beforeEach(resetSchema);

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const PULLED = new Date("2026-09-10T00:00:00Z");
const BEFORE = new Date("2026-09-09T00:00:00Z");
const AFTER = new Date("2026-09-11T00:00:00Z");

/**
 * 프로젝트 하나 + 키 셋 + 번역 넷. **경계의 세 시각을 전부 심는다** — 기준 시각 이전·동일·이후이고,
 * 동일은 배타적 비교라 세지 않는 쪽이다.
 */
async function seed(input: { id: string; lastPulledAt: Date | null; archived: boolean }) {
  await prisma.project.create({
    data: {
      id: input.id,
      slug: input.id,
      name: input.id,
      repoOwner: "o",
      repoName: "r",
      lastPulledAt: input.lastPulledAt,
      archivedAt: input.archived ? new Date("2026-09-01T00:00:00Z") : null,
      locales: { create: [{ code: "en", name: "en", isBase: true }, { code: "ko", name: "ko" }] },
    },
  });
  for (const [index, spec] of [
    { key: "old", createdAt: BEFORE, orphaned: false },
    { key: "same", createdAt: PULLED, orphaned: false },
    { key: "new", createdAt: AFTER, orphaned: false },
    { key: "gone", createdAt: AFTER, orphaned: true },
  ].entries()) {
    await prisma.stringKey.create({
      data: {
        id: `${input.id}-${spec.key}`,
        projectId: input.id,
        key: spec.key,
        namespace: "a",
        sourceText: spec.key,
        sourceHash: spec.key,
        orphaned: spec.orphaned,
        createdAt: spec.createdAt,
      },
    });
    // 사람이 만진 편집(저자 있음)과 push가 쓴 행(저자 null)을 같은 시각대에 섞는다.
    await prisma.translation.create({
      data: {
        projectId: input.id,
        keyId: `${input.id}-${spec.key}`,
        localeCode: "ko",
        value: `v${index}`,
        updatedBy: spec.key === "old" ? null : "u1",
        updatedAt: spec.createdAt,
      },
    });
  }
}

it("⑤가 countUnpublished와, 그리고 행별 isUnpublished의 합과 같다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });

  const { unsent } = await loadProjectListAggregates(prisma, ["p1"]);
  const counted = await countUnpublished(prisma, "p1", PULLED);
  const cells = await prisma.translation.findMany({
    where: { projectId: "p1" },
    select: { updatedBy: true, updatedAt: true },
  });
  const byRow = cells.filter((c) => isUnpublished(c, PULLED)).length;

  // 저자 null은 빠지고, 기준 시각과 같은 행도 빠진다 — 남는 것은 `new`와 `gone` 둘이다.
  expect(unsent.get("p1")).toBe(2);
  expect(unsent.get("p1")).toBe(counted);
  expect(unsent.get("p1")).toBe(byRow);
});

/** 첫 pull 전에는 사람이 만진 행이 전부 미발송이다 — 비교 대상이 없다. */
it("첫 pull 전에도 세 판정이 같다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });

  const { unsent } = await loadProjectListAggregates(prisma, ["p1"]);
  const counted = await countUnpublished(prisma, "p1", null);
  expect(unsent.get("p1")).toBe(3);
  expect(unsent.get("p1")).toBe(counted);
});

/**
 * ④는 **마지막 pull 이후 추가된 활성 키**다. 기준 시각과 같은 `same`은 빠지고, orphaned인 `gone`도
 * 빠진다 — 남는 것은 `new` 하나다.
 */
it("④가 보관 제외 활성 키 기준과 같다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });

  const { newKeys } = await loadProjectListAggregates(prisma, ["p1"]);
  const counted = await prisma.stringKey.count({
    where: { projectId: "p1", orphaned: false, createdAt: { gt: PULLED } },
  });

  expect(newKeys.get("p1")).toBe(1);
  expect(newKeys.get("p1")).toBe(counted);
});

/** 첫 pull 전에는 활성 키 전체가 신규다 (승인된 정의) — orphaned만 빠진다. */
it("첫 pull 전에는 활성 키 전체를 센다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  const { newKeys } = await loadProjectListAggregates(prisma, ["p1"]);
  expect(newKeys.get("p1")).toBe(3);
});

/** 보관은 Summary의 네 값에서 빠진다 — 행과 Meter는 목록에 남는다(2026-09-13 사용자). */
it("보관 프로젝트는 ④⑤에 기여하지 않는다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: true });

  const { newKeys, unsent, locales, keyTotals } = await loadProjectListAggregates(prisma, ["p1"]);

  expect(newKeys.get("p1")).toBeUndefined();
  expect(unsent.get("p1")).toBeUndefined();
  // ①②는 보관 행의 Meter를 위해 전체 멤버십으로 조회한다 — 여기서 빠지면 보관 행이 빈 바가 된다.
  expect(locales.map((l) => l.code).sort()).toEqual(["en", "ko"]);
  expect(keyTotals.get("p1")).toBe(3);
});

/** `in`이 테넌트 경계다 — 인가 집합 밖의 프로젝트는 어느 집계에도 안 들어온다. */
it("인가 집합 밖의 프로젝트는 섞이지 않는다", async () => {
  await seed({ id: "p1", lastPulledAt: PULLED, archived: false });
  await seed({ id: "p2", lastPulledAt: PULLED, archived: false });

  const got = await loadProjectListAggregates(prisma, ["p1"]);

  expect(got.newKeys.get("p2")).toBeUndefined();
  expect(got.unsent.get("p2")).toBeUndefined();
  expect(got.locales.every((l) => l.projectId === "p1")).toBe(true);
  expect(got.cells.every((c) => c.projectId === "p1")).toBe(true);
});


it("먼저 시작한 적재가 성공해도 나중 실행의 진행 표시와 실패 기록을 빼앗지 않는다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  await markImportStarted(prisma, "p1", AFTER);
  const options = { previousBaseLocale: "en", startedAt: BEFORE };
  await applyPush(prisma, "p1", {
    projectSlug: "p1", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [], locales: ["en", "ko"], translations: [], refs: [],
  }, options);
  expect((await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).lastImportStartedAt).toEqual(AFTER);
  await finishImportRun(prisma, { projectId: "p1", startedAt: AFTER, code: "import-failed" });
  expect(await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).toMatchObject({
    lastImportStartedAt: null, lastImportError: "import-failed",
  });
});

it.each(["newer-success", "rotated-token", "archived", "same-commit"])(
  "실패 보고의 UPDATE가 현재 DB 조건을 대조한다: %s", async (scenario) => {
    await seed({ id: "p1", lastPulledAt: null, archived: false });
    await seed({ id: "p2", lastPulledAt: null, archived: false });
    await prisma.project.update({ where: { id: "p1" }, data: {
      pushTokenHash: scenario === "rotated-token" ? "new" : "original",
      archivedAt: scenario === "archived" ? AFTER : null,
      lastCommitAt: scenario === "newer-success" ? AFTER : PULLED,
      lastCommitSha: "b".repeat(40), lastImportStartedAt: AFTER,
    } });
    expect(await recordReportedFailure(prisma, {
      projectId: "p1", tokenHash: "original", commitAt: PULLED, code: "parse-failed",
    })).toBe(scenario === "same-commit" ? "recorded" : "rejected");
    expect(await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).toMatchObject({
      lastImportError: scenario === "same-commit" ? "parse-failed" : null,
      lastImportStartedAt: AFTER, lastCommitSha: "b".repeat(40),
    });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: "p2" } })).lastImportError).toBeNull();
  },
);

it.each([null, "partial-import"] as const)("자기 실행의 적재 결과 %s가 데이터와 함께 확정된다", async (importOutcome) => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  await prisma.project.update({ where: { id: "p1" }, data: { lastImportError: "parse-failed" } });
  await markImportStarted(prisma, "p1", AFTER);
  await applyPush(prisma, "p1", {
    projectSlug: "p1", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [{ key: "added", sourceText: "Added", namespace: "_root" }],
    locales: ["en", "ko"], translations: [{ key: "added", locale: "ko", value: "추가" }], refs: [],
  }, { previousBaseLocale: "en", startedAt: AFTER, importOutcome });
  expect(await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).toMatchObject({
    lastImportStartedAt: null, lastImportError: importOutcome, lastCommitSha: "a".repeat(40),
  });
  expect(await prisma.translation.count({ where: { projectId: "p1", value: "추가", updatedBy: null } })).toBe(1);
});

it("적재 트랜잭션이 실패하면 진행·오류와 기존 데이터도 함께 보존된다", async () => {
  await seed({ id: "p1", lastPulledAt: null, archived: false });
  await prisma.project.update({ where: { id: "p1" }, data: { lastImportError: "parse-failed" } });
  await markImportStarted(prisma, "p1", AFTER);
  await expect(applyPush(prisma, "p1", {
    projectSlug: "p1", commitSha: "a".repeat(40), commitAt: AFTER.toISOString(),
    format: { adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    keys: [{ key: "added", sourceText: "Added", namespace: "_root" }],
    // 없는 로케일의 번역은 실제 FK 위반이다 — 가짜의 성공 응답으로 원자성을 판단하지 않는다.
    locales: ["en"], translations: [{ key: "added", locale: "missing", value: "x" }], refs: [],
  }, { previousBaseLocale: "en", startedAt: AFTER })).rejects.toThrow();
  expect(await prisma.project.findUniqueOrThrow({ where: { id: "p1" } })).toMatchObject({
    lastImportStartedAt: AFTER, lastImportError: "parse-failed", lastCommitSha: null,
  });
  expect(await prisma.stringKey.count({ where: { projectId: "p1", key: "added" } })).toBe(0);
  expect(await prisma.stringKey.count({ where: { projectId: "p1", orphaned: false } })).toBe(3);
});

it.each([PULLED, null])("미발송 세 술어의 저자·시각·빈 값·고아 로케일 경계를 대조한다: %s", async (lastPulledAt) => {
  await seed({ id: "p1", lastPulledAt, archived: false });
  await prisma.translation.deleteMany({ where: { projectId: "p1" } });
  await prisma.locale.update({ where: { projectId_code: { projectId: "p1", code: "ko" } }, data: { orphaned: true } });
  for (const updatedBy of [null, "user"]) {
    for (const [index, updatedAt] of [BEFORE, PULLED, AFTER].entries()) {
      await prisma.translation.create({ data: {
        projectId: "p1", keyId: `p1-${["old", "same", "new"][index]}`,
        localeCode: updatedBy === null ? "en" : "ko", value: "", updatedBy, updatedAt,
      } });
    }
  }
  const cells = await prisma.translation.findMany({ where: { projectId: "p1" } });
  const expected = lastPulledAt === null ? 3 : 1;
  expect(cells.filter((cell) => isUnpublished(cell, lastPulledAt))).toHaveLength(expected);
  expect(await countUnpublished(prisma, "p1", lastPulledAt)).toBe(expected);
  expect((await loadProjectListAggregates(prisma, ["p1"])).unsent.get("p1")).toBe(expected);
});
