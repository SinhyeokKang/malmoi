import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { optionalEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";
import { hashPushToken } from "@/lib/push/token";

/**
 * **동시 CI push의 결과 표시** (launch-readiness L3.7). 두 요청이 사전 가드를 함께 지나면 진행 표시의
 * 토큰은 나중 요청의 것이 되고, 먼저 잠금을 잡은 요청의 성공 기록이 토큰 대조에서 0행이 됐다 — 이어서 뒤
 * 요청이 트랜잭션 안에서 `stale-commit`을 받아 `import-failed`로 닫으면 **성공한 적재가 실패로 그려졌다.**
 *
 * 교차는 barrier로 만든다: 외부 연결이 `Project` 행을 잠근 채로 A·B를 차례로 잠금 대기에 세우고 푼다.
 */
const directory = mkdtempSync(join(tmpdir(), "malmoi-concurrent-"));
let binaries: string;
const PORT = 55486;
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
  vi.doMock("@/lib/db", () => ({ getPrisma: () => prisma }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await prisma.user.create({ data: { id: "owner", email: "fixture" } });
  await prisma.project.create({ data: { id: "p", slug: "fixture", name: "Fixture", repositoryId: "123", installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main",
    pushTokenHash: hashPushToken(PUSH_TOKEN),
    members: { create: { userId: "owner", role: "OWNER" } },
    surfaces: { create: { id: "s", slug: "default", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en",
      lastCommitSha: "a".repeat(40), lastCommitAt: new Date("2026-09-10T00:00:00Z"),
      // 이전 실행의 실패가 남아 있다 — 성공이 그것을 지우는지가 판정이다.
      lastImportError: "import-failed", lastImportFailedAt: new Date("2026-09-11T00:00:00Z") } },
  } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const PUSH_TOKEN = "isolated-concurrent-import-fixture";

function push(sha: string, commitAt: string, value: string) {
  const body = { projectSlug: "fixture", surfaceSlug: "default", commitSha: sha.repeat(40), commitAt,
    format: { adapter: "json-catalog" as const, pathTemplate: "i18n/{locale}.json", baseLocale: "en", nested: false },
    locales: ["en", "ko"], keys: [{ key: "hello", namespace: "_root", sourceText: "Hello" }],
    translations: [{ key: "hello", locale: "en", value: "Hello" }, { key: "hello", locale: "ko", value }],
    refs: [] };
  return new Request("http://localhost/api/push", { method: "POST", headers: { authorization: `Bearer ${PUSH_TOKEN}` }, body: JSON.stringify(body) });
}

async function waitForLockWaiters(count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock'");
    if ((rows[0]?.n ?? 0) >= count) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`lock waiters never reached ${count}`);
}

const surfaceState = () => prisma.translationSurface.findUniqueOrThrow({ where: { id: "s" },
  select: { lastImportError: true, lastImportStartedAt: true, lastImportToken: true, lastCommitSha: true } });

it("교차한 두 push — 새 커밋이 적재되면 옛 커밋의 stale-commit이 그 성공을 실패로 덮지 않는다", async () => {
  const { POST } = await import("@/app/api/push/route");
  const holder = await pool.connect();
  await holder.query("BEGIN");
  await holder.query(`SELECT "id" FROM "Project" WHERE "id" = 'p' FOR UPDATE`);
  const newer = POST(push("c", "2026-09-15T00:00:00Z", "새 값"));
  await waitForLockWaiters(1);
  const older = POST(push("b", "2026-09-14T00:00:00Z", "옛 값"));
  await waitForLockWaiters(2);
  await holder.query("ROLLBACK");
  holder.release();

  const [a, b] = await Promise.all([newer, older]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(409);
  expect(await surfaceState()).toEqual({ lastImportError: null, lastImportStartedAt: null, lastImportToken: null, lastCommitSha: "c".repeat(40) });
  const ko = await prisma.translation.findFirstOrThrow({ where: { projectId: "p", localeCode: "ko" }, select: { value: true } });
  expect(ko.value).toBe("새 값");
});

it("순차 두 push는 둘 다 적재되고 결과가 성공이다 (짝)", async () => {
  const { POST } = await import("@/app/api/push/route");
  expect((await POST(push("b", "2026-09-14T00:00:00Z", "옛 값"))).status).toBe(200);
  expect((await POST(push("c", "2026-09-15T00:00:00Z", "새 값"))).status).toBe(200);
  expect(await surfaceState()).toEqual({ lastImportError: null, lastImportStartedAt: null, lastImportToken: null, lastCommitSha: "c".repeat(40) });
});
