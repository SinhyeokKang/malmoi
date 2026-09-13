import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
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
const binaries = process.env["CREDENTIAL_PG_BIN"] ?? "/opt/homebrew/opt/postgresql@17/bin";
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
