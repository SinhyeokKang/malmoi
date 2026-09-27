import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { optionalEnv } from "@/lib/env";

/**
 * **public 스키마 USAGE 회수 마이그레이션이 두 모양의 DB에서 모두 도는가** (sec-audit-3 #2).
 *
 * Supabase 롤이 **없는** DB(격리 PostgreSQL·Prisma shadow)에서는 조용히 지나가야 하고, **있는** DB에서는 직접 GRANT를
 * 걷어야 한다. 실제 dev·prod 판정은 코드가 아니라 카탈로그 재조회다 — 여기서는 SQL 자체만 잰다.
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 공유 dev/prod 접속 변수는 읽지 않는다.
 */

const MIGRATION = readFileSync("prisma/migrations/20260926175555_revoke_public_schema_usage_from_api_roles/migration.sql", "utf8");
const ROLES = ["anon", "authenticated"] as const;

const directory = mkdtempSync(join(tmpdir(), "malmoi-schema-usage-"));
let binaries: string;
const PORT = 55551;
let pool: Pool;
let started = false;

async function privilege(role: string, kind: "USAGE" | "CREATE"): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>("SELECT has_schema_privilege($1, 'public', $2) AS ok", [role, kind]);
  return rows[0]!.ok;
}

beforeAll(() => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  pool = new Pool({ host: directory, port: PORT, user: "postgres", database: "postgres" });
});

beforeEach(async () => {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
  // 스키마를 먼저 지워 권한 의존이 사라진 뒤라 롤을 바로 지울 수 있다.
  for (const role of [...ROLES, "app_runtime"]) await pool.query(`DROP ROLE IF EXISTS ${role}`);
});

afterAll(async () => {
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

it("Supabase 롤이 없는 DB에서 적용이 성공한다", async () => {
  await expect(pool.query(MIGRATION)).resolves.toBeDefined();
});

it("두 롤의 직접 GRANT(USAGE·CREATE)를 걷는다", async () => {
  // 새로 만든 public은 PUBLIC 권한이 없다 — 직접 GRANT만 남긴 Supabase 모양.
  for (const role of ROLES) {
    await pool.query(`CREATE ROLE ${role} NOLOGIN`);
    await pool.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${role}`);
    expect(await privilege(role, "USAGE")).toBe(true);
  }
  await pool.query(MIGRATION);
  for (const role of ROLES) {
    expect(await privilege(role, "USAGE")).toBe(false);
    expect(await privilege(role, "CREATE")).toBe(false);
  }
});

it("PUBLIC의 USAGE도 걷는다 — 두 롤이 상속으로 되찾지 못하고, 직접 GRANT를 가진 앱 롤은 그대로 쓴다", async () => {
  // prod 모양(2026-09-27 카탈로그): nspacl에 =U(PUBLIC)와 롤별 직접 U가 함께 있다. 런타임 롤은 직접 U를 든다.
  await pool.query("GRANT USAGE ON SCHEMA public TO PUBLIC");
  for (const role of ROLES) {
    await pool.query(`CREATE ROLE ${role} NOLOGIN`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  }
  await pool.query("CREATE ROLE app_runtime NOLOGIN");
  await pool.query("GRANT USAGE ON SCHEMA public TO app_runtime");
  await pool.query('CREATE TABLE public."Probe" (id int); INSERT INTO public."Probe" VALUES (1); GRANT SELECT ON public."Probe" TO app_runtime');

  await pool.query(MIGRATION);

  for (const role of ROLES) expect(await privilege(role, "USAGE")).toBe(false);
  expect(await privilege("app_runtime", "USAGE")).toBe(true);
  const client = await pool.connect();
  try {
    await client.query("SET ROLE app_runtime");
    const { rows } = await client.query<{ id: number }>('SELECT id FROM public."Probe"');
    expect(rows).toEqual([{ id: 1 }]);
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
});
