import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { encodeUserFields } from "@/lib/credentials/records";
import { optionalEnv } from "@/lib/env";

import { runTokenFor, type EventPayload } from "../payload";
import { finishRun, recordEvent, recordRun } from "../record";

/**
 * **실행 하나가 한 줄이고, 늦은 종료가 남의 결과를 덮지 않는다** (logs-rework T5a·T5b-0·T5b-2).
 *
 * ⚠️ **가짜로는 원리적으로 못 보는 셋을 여기서 본다**: 실제 롤백 · `Project` 잠금이 만드는 직렬화 ·
 * `@@unique([projectId, runToken])`의 마지막 그물.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`).
 */

const actionDb = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPrisma: () => actionDb.prisma }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: "ok", userId: "owner" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const directory = mkdtempSync(join(tmpdir(), "malmoi-events-record-"));
let binaries: string;
const PORT = 55485;
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
  actionDb.prisma = prisma;
});

beforeEach(async () => {
  await resetSchema();
  await prisma.project.create({ data: { id: "p1", slug: "p1", name: "p1", repoOwner: "o", repoName: "r" } });
  await prisma.project.create({ data: { id: "p2", slug: "p2", name: "p2", repoOwner: "o", repoName: "r2" } });
  await prisma.translationSurface.create({ data: { id: "s1", projectId: "p1", slug: "web" } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const IMPORT: EventPayload = {
  kind: "IMPORT", source: "ci", surfaceSlugs: ["web"], keys: null, pendingEdits: null,
  surfaces: [], errorCode: null, refusal: null,
};

const token = runTokenFor({ kind: "ci", surfaceId: "s1", executionId: "11111111-2222-4333-8444-555555555555" });

function runInput(over: Partial<Parameters<typeof recordRun>[1]> = {}) {
  return {
    projectId: "p1", subtype: "import.ci", actor: { kind: "AUTOMATION" } as const,
    surfaceIds: ["s1"], runToken: token, payload: IMPORT, ...over,
  };
}

describe("실행은 행 하나다 (결정 12)", () => {
  it("같은 runToken의 재전달은 한 건이고 완료된 결과를 덮지 않는다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ result: "imported" })));
    await prisma.$transaction(tx => recordRun(tx, runInput({ result: "failed" })));

    const rows = await prisma.projectEvent.findMany({ where: { projectId: "p1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toBe("imported");
  });

  /** ⚠️ **다른 프로젝트·다른 소스는 별개 실행이다** — 외부 식별자가 같아도 서버가 범위를 붙인다. */
  it("프로젝트가 다르면 같은 식별자라도 별개다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ result: "imported" })));
    await prisma.$transaction(tx => recordRun(tx, runInput({ projectId: "p2", surfaceIds: [], result: "imported" })));
    expect(await prisma.projectEvent.count()).toBe(2);
  });

  it("같은 커밋의 새 실행은 새 식별자라 두 건이다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ result: "imported" })));
    const second = runTokenFor({ kind: "ci", surfaceId: "s1", executionId: "99999999-8888-4777-8666-555555555555" });
    await prisma.$transaction(tx => recordRun(tx, runInput({ runToken: second, result: "imported" })));
    expect(await prisma.projectEvent.count()).toBe(2);
  });

  /** ⚠️ **약속이 깨져도 두 줄이 되지 않는다** — 잠금을 안 들고 동시에 들어오면 DB가 막는다. */
  it("unique 인덱스가 마지막 그물이다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ result: "imported" })));
    await expect(
      pool.query(
        `INSERT INTO "ProjectEvent" (id, ref, "projectId", kind, subtype, "actorKind", "surfaceScope", payload, "runToken")
         VALUES ('x', 'x', 'p1', 'IMPORT', 's', 'AUTOMATION', 'sources', '{}'::jsonb, $1)`,
        [token],
      ),
    ).rejects.toThrow(/unique/i);
  });
});

describe("finishRun — 늦은 종료가 남의 결과를 덮지 않는다 (T5b-0)", () => {
  const importToken = runTokenFor({ kind: "import", token: "lease-1" });

  it("미종료 행만 닫는다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ runToken: importToken })));
    expect(await prisma.$transaction(tx => finishRun(tx, { projectId: "p1", runToken: importToken, result: "imported" }))).toBe(true);

    // 죽은 실행이 뒤늦게 돌아왔다 — 이미 닫힌 결과를 되살리지 않는다.
    expect(await prisma.$transaction(tx => finishRun(tx, { projectId: "p1", runToken: importToken, result: "failed" }))).toBe(false);
    const row = await prisma.projectEvent.findFirst({ where: { projectId: "p1" } });
    expect(row?.result).toBe("imported");
  });

  it("다른 실행을 덮지 않는다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ runToken: importToken })));
    const other = runTokenFor({ kind: "import", token: "lease-2" });
    expect(await prisma.$transaction(tx => finishRun(tx, { projectId: "p1", runToken: other, result: "failed" }))).toBe(false);
    expect((await prisma.projectEvent.findFirst({ where: { projectId: "p1" } }))?.result).toBe(null);
  });

  it("다른 프로젝트의 같은 토큰도 안 닫는다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ runToken: importToken })));
    expect(await prisma.$transaction(tx => finishRun(tx, { projectId: "p2", runToken: importToken, result: "failed" }))).toBe(false);
  });

  /** 종료가 payload를 채워도 **참조로 검색되는 성질**이 남는다 — 그게 빠지면 조용한 누락이다. */
  it("종료가 검색 문자열을 다시 조립해도 참조가 남는다", async () => {
    await prisma.$transaction(tx => recordRun(tx, runInput({ runToken: importToken })));
    const before = await prisma.projectEvent.findFirst({ where: { projectId: "p1" } });
    await prisma.$transaction(tx => finishRun(tx, {
      projectId: "p1", runToken: importToken, result: "imported",
      payload: { ...IMPORT, source: "manual", keys: 12 },
    }));
    const after = await prisma.projectEvent.findFirst({ where: { projectId: "p1" } });
    expect(after?.searchText).toContain(before?.ref ?? "MISSING");
    expect(after?.searchText).toContain("manual");
  });
});

describe("상태 변경 — 변경과 사건이 함께 롤백된다 (완료조건 2)", () => {
  const payload: EventPayload = {
    kind: "TRANSLATION", surfaceSlug: "web", key: "k", locale: "ko", before: null, after: "v",
  };

  it("트랜잭션이 되돌아가면 사건도 없다", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = 'p1' FOR UPDATE`;
        await tx.project.update({ where: { id: "p1" }, data: { name: "changed" } });
        await recordEvent(tx, { projectId: "p1", subtype: "translation.saved", actor: { kind: "USER", userId: null }, surfaceIds: ["s1"], payload });
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");

    expect(await prisma.projectEvent.count()).toBe(0);
    expect((await prisma.project.findUnique({ where: { id: "p1" } }))?.name).toBe("p1");
  });

  /**
   * ⚠️ **같은 프로젝트의 두 저장이 직렬화된다** — `Project` 잠금 뒤에 읽은 값이 `before`이므로
   * `A→B`와 `B→C`가 이어진다. 잠금이 없으면 둘 다 `A`를 읽어 사건이 거짓이 된다.
   */
  it("동시 저장의 전후 값이 이어진다", async () => {
    const write = (value: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = 'p1' FOR UPDATE`;
        const current = await tx.project.findUnique({ where: { id: "p1" }, select: { name: true } });
        await tx.project.update({ where: { id: "p1" }, data: { name: value } });
        await recordEvent(tx, {
          projectId: "p1", subtype: "settings.nameChanged", actor: { kind: "USER", userId: null }, scope: "project-wide",
          payload: { kind: "SETTINGS", field: "name", value: { before: current?.name ?? null, after: value } },
        });
      }, { maxWait: 10_000, timeout: 30_000 });

    await Promise.all([write("B"), write("C")]);
    const rows = await prisma.projectEvent.findMany({ where: { projectId: "p1" }, orderBy: { occurredAt: "asc" } });
    expect(rows).toHaveLength(2);
    const chain = rows.map((row) => (row.payload as { value: { before: string | null; after: string } }).value);
    // 어느 쪽이 먼저든 **끊기지 않는다** — 두 번째의 before가 첫 번째의 after다.
    expect(chain[1]?.before).toBe(chain[0]?.after);
    expect(chain[0]?.before).toBe("p1");
    expect((await prisma.project.findUnique({ where: { id: "p1" } }))?.name).toBe(chain[1]?.after);
  });
});

it("Project 잠금 안의 같은 실행 동시 기록은 두 요청 모두 성공하고 한 건이다", async () => {
  const write = () => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = 'p1' FOR UPDATE`;
    await recordRun(tx, runInput({ result: "imported" }));
  });
  await Promise.all([write(), write()]);
  expect(await prisma.projectEvent.count({ where: { projectId: "p1", runToken: token } })).toBe(1);
});

it("수동 Import의 거부 여섯만 기록하고 일시적 거부는 남기지 않는다", async () => {
  const { recordImportRefusal } = await import("../record");
  for (const error of ["already-running", "reconfirm", "invalid input", "forbidden", "not-ready"]) {
    await prisma.$transaction(tx => recordImportRefusal(tx, { projectId: "p1", userId: null, error }));
  }
  const rows = await prisma.projectEvent.findMany({ where: { projectId: "p1" } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ result: "notStarted", payload: { refusal: "not-ready", source: "manual" } });
});

it("실제 번역 Action의 동시 저장도 사건의 전후 값이 끊기지 않는다", async () => {
  await prisma.user.create({ data: { id: "owner", ...encodeUserFields("owner", { email: "owner@example.com" }), email: encodeUserFields("owner", { email: "owner@example.com" }).email! } });
  await prisma.projectMember.create({ data: { projectId: "p1", userId: "owner", role: "OWNER" } });
  await prisma.project.update({ where: { id: "p1" }, data: { installationId: "1" } });
  await prisma.translationSurface.update({ where: { id: "s1", projectId: "p1" }, data: { lastCommitSha: "a".repeat(40) } });
  await prisma.locale.create({ data: { projectId: "p1", surfaceId: "s1", code: "ko", name: "Korean" } });
  await prisma.stringKey.create({ data: { id: "key1", projectId: "p1", surfaceId: "s1", key: "hello", namespace: "_root", sourceText: "Hello", sourceHash: "hash" } });
  const { saveTranslation } = await import("@/app/(edit)/actions");
  const input = { slug: "p1", surfaceSlug: "web", keyId: "key1", localeCode: "ko" };
  expect(await Promise.all([saveTranslation({ ...input, value: "A" }), saveTranslation({ ...input, value: "B" })]))
    .toEqual([{ ok: true, value: "A" }, { ok: true, value: "B" }]);
  const events = await prisma.projectEvent.findMany({ where: { projectId: "p1", kind: "TRANSLATION" } });
  const changes = events.map(event => event.payload as { before: string | null; after: string });
  expect(changes).toHaveLength(2);
  const first = changes.find(change => change.before === null)!;
  const second = changes.find(change => change.before === first.after)!;
  expect(second).toBeDefined();
  expect(await prisma.translation.findFirst({ where: { projectId: "p1", keyId: "key1", localeCode: "ko" } })).toMatchObject({ value: second.after });
});
