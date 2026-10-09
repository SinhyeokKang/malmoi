import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { optionalEnv } from "@/lib/env";

/**
 * **셀프 호스팅 DB의 런타임 롤 bootstrap** (self-hosting SH-02 · design §4).
 *
 * 마이그레이션 `20260926175555`가 `public`의 PUBLIC USAGE를 걷으므로 런타임 롤은 명시 권한 없이는 쿼리 자체가 실패한다.
 * `deploy/bootstrap.sql`이 그 권한과 이후 마이그레이션의 기본 권한을 세운다.
 *
 * ⚠️ **`postgres`(superuser)로 SQL을 붓지 않는다** — superuser는 권한 검사를 건너뛰어, 소유자가 아닌 롤이 GRANT를 못 하거나
 * 기본 권한이 다른 롤에 걸리는 결함을 가린다. superuser는 클러스터·롤·DB를 만드는 픽스처에만 쓰고, 마이그레이션과 bootstrap은
 * DB를 소유한 비-superuser 롤이 psql로 실행한다(설치가 하는 그대로).
 *
 * ⚠️ **`pnpm test`에 없다** (`vitest.projects.config.ts`). 공유 dev/prod 접속 변수는 읽지 않는다.
 */

const MIGRATE = "malmoi_migrate";
const RUNTIME = "malmoi_app";
const DATABASE = "malmoi";
const PORT = 55631;

const directory = mkdtempSync(join(tmpdir(), "malmoi-bootstrap-"));
let binaries: string;
let started = false;
let admin: Pool;
let migrate: Pool;
let runtime: Pool;

// 셸의 RUNTIME_DB_PASSWORD가 "비밀번호 없음" 사례를 가리지 않게 뺀다.
const inherited = { ...process.env };
delete inherited.RUNTIME_DB_PASSWORD;

type Run = { env?: Record<string, string>; vars?: Record<string, string>; user?: string };
const PASSWORD = { RUNTIME_DB_PASSWORD: "fixture-runtime" };

function bootstrap({ env = PASSWORD, vars = { runtime_role: RUNTIME, migrate_role: MIGRATE }, user = MIGRATE }: Run = {}): void {
  execFileSync(join(binaries, "psql"), [
    "-X", "-q", "-h", directory, "-p", String(PORT), "-U", user, "-d", DATABASE,
    ...Object.entries(vars).flatMap(([name, value]) => ["-v", `${name}=${value}`]), "-f", "deploy/bootstrap.sql",
  ], { stdio: "pipe", env: { ...inherited, ...env } });
}

/** 실패 사유 코드(`bootstrap: <code>`)를 돌려준다 — 문법 오류로 멈춘 것과 판정으로 멈춘 것을 가른다. */
function refusal(run: Run): string | undefined {
  try { bootstrap(run); return undefined; } catch (error) {
    return /bootstrap: ([a-z-]+)/.exec(String((error as { stderr?: Buffer }).stderr ?? ""))?.[1] ?? "unclassified";
  }
}

async function roleExists(name: string): Promise<boolean> {
  return (await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name])).rowCount === 1;
}

async function code(query: Promise<unknown>): Promise<string | undefined> {
  try { await query; return undefined; } catch (error) { return (error as { code?: string }).code; }
}

beforeAll(async () => {
  binaries = optionalEnv("CREDENTIAL_PG_BIN") ?? "/opt/homebrew/opt/postgresql@17/bin";
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p ${PORT} -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  admin = new Pool({ host: directory, port: PORT, user: "postgres", database: "postgres" });
  // 설치 모양: DB를 소유한 비-superuser 마이그레이션 롤. 런타임 롤을 만들 수 있어야 해서 CREATEROLE만 준다.
  await admin.query(`CREATE ROLE ${MIGRATE} LOGIN CREATEROLE`);
  await admin.query(`CREATE DATABASE ${DATABASE} OWNER ${MIGRATE}`);
  migrate = new Pool({ host: directory, port: PORT, user: MIGRATE, database: DATABASE });
  // `prisma migrate deploy`가 마이그레이션보다 먼저 만드는 이력 테이블(모양만).
  await migrate.query(`CREATE TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY, migration_name varchar(255) NOT NULL)`);
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml") continue;
    await migrate.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
  runtime = new Pool({ host: directory, port: PORT, user: RUNTIME, database: DATABASE });
});

afterAll(async () => {
  await runtime?.end();
  await migrate?.end();
  await admin?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

it("비밀번호가 없거나 비었으면 실패하고 롤을 만들지 않는다", async () => {
  expect(refusal({ env: {} })).toBe("password-missing");
  expect(refusal({ env: { RUNTIME_DB_PASSWORD: "" } })).toBe("password-empty");
  expect(await roleExists(RUNTIME)).toBe(false);
});

it("롤 이름 변수가 없으면 실패하고 롤을 만들지 않는다", async () => {
  expect(refusal({ vars: { migrate_role: MIGRATE } })).toBe("runtime-role-missing");
  expect(refusal({ vars: { runtime_role: RUNTIME } })).toBe("migrate-role-missing");
  expect(await roleExists(RUNTIME)).toBe(false);
});

it("런타임 롤을 마이그레이션 롤로 주면 거절한다", () => {
  expect(refusal({ vars: { runtime_role: MIGRATE, migrate_role: MIGRATE } })).toBe("runtime-role-is-migrate-role");
});

it.each(["SUPERUSER", "CREATEROLE", "CREATEDB", "BYPASSRLS"])("이미 있는 런타임 롤이 %s면 거절하고 권한을 주지 않는다", async (attribute) => {
  const role = `held_${attribute.toLowerCase()}`;
  await admin.query(`CREATE ROLE ${role} LOGIN ${attribute}`);
  expect(refusal({ vars: { runtime_role: role, migrate_role: MIGRATE } })).toBe("runtime-role-privileged");
  // 권한은 DB마다다 — `admin`은 `postgres` DB에 붙어 있으므로 설치 DB 연결로 잰다.
  const { rows } = await migrate.query<{ ok: boolean }>("SELECT has_schema_privilege($1, 'public', 'USAGE') AS ok", [role]);
  expect(rows).toEqual([{ ok: attribute === "SUPERUSER" }]);
});

it("현재 롤이 롤을 만들 수 없으면 CREATE ROLE 전에 거절한다 — 비밀번호가 서버 로그에 남지 않는다", async () => {
  await admin.query("CREATE ROLE weak_owner LOGIN");
  const secret = "weak-owner-secret-7f3a";
  expect(refusal({ user: "weak_owner", env: { RUNTIME_DB_PASSWORD: secret } })).toBe("cannot-create-role");
  expect(await roleExists(RUNTIME)).toBe(false);
  expect(readFileSync(join(directory, "postgres.log"), "utf8")).not.toContain(secret);
});

it("① 두 번 실행해도 성공한다 — 런타임 롤은 비밀번호를 가진 최소권한 LOGIN 롤이다", async () => {
  expect(refusal({})).toBeUndefined();
  expect(refusal({})).toBeUndefined();
  const { rows } = await admin.query<{ rolcanlogin: boolean; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean; password: boolean }>(
    "SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolpassword IS NOT NULL AS password FROM pg_authid WHERE rolname = $1", [RUNTIME],
  );
  expect(rows).toEqual([{ rolcanlogin: true, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, password: true }]);
});

it("② 런타임 롤은 기존 테이블에 CRUD를 하고 DDL은 거부된다", async () => {
  await runtime.query(`INSERT INTO "User" (id, email) VALUES ('u1', 'sealed')`);
  await runtime.query(`UPDATE "User" SET "uiLocale" = 'ko' WHERE id = 'u1'`);
  expect((await runtime.query(`SELECT id, "uiLocale" FROM "User"`)).rows).toEqual([{ id: "u1", uiLocale: "ko" }]);
  await runtime.query(`DELETE FROM "User" WHERE id = 'u1'`);
  expect((await runtime.query(`SELECT count(*)::int AS n FROM "User"`)).rows).toEqual([{ n: 0 }]);

  expect(await code(runtime.query("CREATE TABLE public.intruder (id int)"))).toBe("42501");
  expect(await code(runtime.query(`ALTER TABLE "User" ADD COLUMN intruder int`))).toBe("42501");
  expect(await code(runtime.query(`DROP TABLE "User"`))).toBe("42501");
  expect(await code(runtime.query(`TRUNCATE "User"`))).toBe("42501");
  // 마이그레이션 이력은 런타임 롤 밖이다.
  expect(await code(runtime.query(`SELECT * FROM "_prisma_migrations"`))).toBe("42501");
});

it("③ bootstrap 뒤 새 마이그레이션이 만든 테이블·sequence에도 런타임 롤 CRUD가 된다", async () => {
  // 다음 업그레이드의 마이그레이션 — 마이그레이션 롤이 만든다. sequence는 serial로 기본 권한까지 잰다.
  await migrate.query(`CREATE TABLE "LaterTable" (id serial PRIMARY KEY, value text NOT NULL)`);
  const { rows } = await runtime.query<{ id: number }>(`INSERT INTO "LaterTable" (value) VALUES ('a') RETURNING id`);
  expect(rows).toEqual([{ id: 1 }]);
  await runtime.query(`UPDATE "LaterTable" SET value = 'b' WHERE id = 1`);
  expect((await runtime.query(`SELECT value FROM "LaterTable"`)).rows).toEqual([{ value: "b" }]);
  await runtime.query(`DELETE FROM "LaterTable"`);
  expect(await code(runtime.query(`DROP TABLE "LaterTable"`))).toBe("42501");
});

it("④ PUBLIC에 USAGE가 되살아난 DB(`pg_restore --no-acl` 뒤)도 bootstrap이 다시 회수하고 런타임 롤의 명시 USAGE는 남긴다", async () => {
  const publicUsage = async () =>
    (await migrate.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_namespace, aclexplode(nspacl) a WHERE nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'USAGE'`)).rows[0]?.n;
  await migrate.query("GRANT USAGE ON SCHEMA public TO PUBLIC");
  expect(await publicUsage()).toBe(1);
  expect(refusal({})).toBeUndefined();
  expect(await publicUsage()).toBe(0);
  expect((await migrate.query<{ ok: boolean }>("SELECT has_schema_privilege($1, 'public', 'USAGE') AS ok", [RUNTIME])).rows).toEqual([{ ok: true }]);
});
