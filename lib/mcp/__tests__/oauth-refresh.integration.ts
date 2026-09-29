import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";

import { hashApiToken } from "../token";

/**
 * **refresh 회전·재사용 × 실제 PostgreSQL** (mcp-oauth T6 — design §4.1 · §4.2). 판정은 `planRefresh`가, 잠금(User → Connection)·이력·회전·
 * 폐기는 `refreshConnection`이 든다. 겹친 제출이 **실제로 줄을 서는지**, 쓰기가 한 tx로 묶이는지, 실패가 `invalid_grant`로 숨지 않는지를 잰다.
 * ⚠️ 거부 단언마다 같은 픽스처의 성공 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
vi.mock("server-only", () => ({}));

const { refreshConnection } = await import("@/lib/oauth-server/token");
const { resolveBearer } = await import("../token-store");

const directory = mkdtempSync(join(tmpdir(), "malmoi-oauth-refresh-"));
let binaries: string;
const PORT = 55572;
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
  for (const id of ["u1", "u2"]) await prisma.user.create({ data: { id, email: `fixture-${id}` } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});

const PROD = { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" };
const DEV = { issuer: "https://dev.mal-moi.com", resource: "https://dev.mal-moi.com/api/mcp" };
const CLAUDE = "https://claude.ai/oauth/claude-code-client-metadata";
const CODEX = "https://chatgpt.com/oauth/codex/x/client.json";
const T0 = new Date("2026-09-29T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

let serial = 0;
async function connect(userId = "u1", clientId = CLAUDE, over: { expiresAt?: Date; endpoint?: typeof PROD } = {}) {
  serial += 1;
  const access = `mlo_fixture-${serial}`;
  const refresh = `mlr_fixture-${serial}`;
  const row = await prisma.oAuthConnection.create({ data: {
    userId, clientId, clientName: null, redirectUri: "http://localhost/callback", ...(over.endpoint ?? PROD), grants: ["translation:write"], allProjects: true,
    accessTokenHash: hashApiToken(access), accessExpiresAt: at(3_600_000), refreshTokenHash: hashApiToken(refresh), expiresAt: over.expiresAt ?? at(30 * 86_400_000),
  } });
  return { id: row.id, access, refresh };
}
const refresh = (refreshToken: string, now: Date, over: { clientId?: string; resource?: string; endpoint?: typeof PROD } = {}) =>
  refreshConnection(prisma, { refreshToken, clientId: "clientId" in over ? over.clientId : CLAUDE, resource: over.resource }, over.endpoint ?? PROD, now);
const snapshot = async () => ({
  connections: await prisma.oAuthConnection.findMany({ orderBy: { id: "asc" }, select: { id: true, accessTokenHash: true, refreshTokenHash: true } }),
  history: await prisma.oAuthRefreshHistory.count(),
});
const liveAt = async (access: string, now: Date) => (await resolveBearer(prisma, access, now, PROD)) !== null;
async function pendingCode(userId: string, clientId: string, requestId: string) {
  await prisma.oAuthCode.create({ data: {
    codeHash: `code-${requestId}`, requestId, clientId, redirectUri: "http://localhost/callback", codeChallenge: "c".repeat(43), ...PROD, userId,
    grants: [], allProjects: true, connectionExpiresAt: at(86_400_000), expiresAt: at(60_000),
  } });
}

describe("회전", () => {
  it("현재 refresh → 새 토큰 · 옛 해시는 이력에 · 새 access만 산다", async () => {
    const c = await connect();
    const result = await refresh(c.refresh, at(1_000));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.tokens.accessToken).toMatch(/^mlo_/);
    expect(result.tokens.refreshToken).toMatch(/^mlr_/);
    const history = await prisma.oAuthRefreshHistory.findMany();
    expect(history).toEqual([{ tokenHash: hashApiToken(c.refresh), connectionId: c.id, usedAt: at(1_000) }]);
    expect(await liveAt(result.tokens.accessToken, at(2_000))).toBe(true);
    expect(await liveAt(c.access, at(2_000))).toBe(false);
  });

  it("같은 refresh 두 건이 겹치면 회전은 한 건 — 늦은 쪽은 유예 안이라 연결을 건드리지 않고, 앞 응답의 토큰은 계속 유효하다", async () => {
    const c = await connect();
    const results = await Promise.all([refresh(c.refresh, at(1_000)), refresh(c.refresh, at(1_000))]);
    const statuses = results.map(r => r.status).sort();
    expect(statuses).toEqual(["invalid_grant", "ok"]);
    const winner = results.find(r => r.status === "ok");
    expect(winner?.status === "ok" && await liveAt(winner.tokens.accessToken, at(2_000))).toBe(true);
    expect(await prisma.oAuthConnection.count()).toBe(1);
    expect(await prisma.oAuthRefreshHistory.count()).toBe(1);
    // 늦은 쪽은 저장소의 새 refresh로 다시 시도한다(T1 실측 — Claude Code) — 그것은 통과한다.
    expect(winner?.status === "ok" && (await refresh(winner.tokens.refreshToken, at(3_000))).status).toBe("ok");
  });

  it("연결 수명이 끝났으면 회전하지 않는다 — 재동의다", async () => {
    const c = await connect("u1", CLAUDE, { expiresAt: at(1_000) });
    const before = await snapshot();
    expect(await refresh(c.refresh, at(1_000))).toEqual({ status: "invalid_grant" });
    expect(await snapshot()).toEqual(before);
  });

  it("access는 연결 수명을 넘지 않는다", async () => {
    const c = await connect("u1", CLAUDE, { expiresAt: at(120_000) });
    const result = await refresh(c.refresh, at(1_000));
    expect(result.status === "ok" && result.tokens.accessExpiresAt).toEqual(at(120_000));
  });
});

describe("재사용 — 30초 유예", () => {
  it("회전 뒤 30초 안(경계 포함)의 옛 refresh → invalid_grant · 쓰기 0건", async () => {
    const c = await connect();
    const rotated = await refresh(c.refresh, at(0));
    const before = await snapshot();
    expect(await refresh(c.refresh, at(30_000))).toEqual({ status: "invalid_grant" });
    expect(await snapshot()).toEqual(before);
    expect(rotated.status === "ok" && await liveAt(rotated.tokens.accessToken, at(30_001))).toBe(true);
  });

  it("30초를 넘긴 재제출 → 그 연결 폐기 · 현재 access·refresh 모두 거부 · 그 클라이언트의 미교환 code도 무효 · 다른 연결·다른 사용자·개인 토큰은 유지", async () => {
    const c = await connect("u1", CLAUDE);
    const other = await connect("u1", CODEX);
    const stranger = await connect("u2", CLAUDE);
    await prisma.apiToken.create({ data: { userId: "u1", tokenHash: "api", grants: [], allProjects: true, expiresAt: at(86_400_000) } });
    const rotated = await refresh(c.refresh, at(0));
    if (rotated.status !== "ok") throw new Error("setup");
    await pendingCode("u1", CLAUDE, "r-claude");
    await pendingCode("u1", CODEX, "r-codex");

    expect(await refresh(c.refresh, at(30_001))).toEqual({ status: "invalid_grant" });
    expect(await prisma.oAuthConnection.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await prisma.oAuthRefreshHistory.count({ where: { connectionId: c.id } })).toBe(0);
    expect(await liveAt(rotated.tokens.accessToken, at(30_002))).toBe(false);
    expect(await refresh(rotated.tokens.refreshToken, at(30_002))).toEqual({ status: "invalid_grant" });
    expect((await prisma.oAuthCode.findMany({ select: { requestId: true } })).map(r => r.requestId)).toEqual(["r-codex"]);
    expect(await liveAt(other.access, at(30_002))).toBe(true);
    expect(await liveAt(stranger.access, at(30_002))).toBe(true);
    expect(await prisma.apiToken.count()).toBe(1);
  });

  it("여러 번 회전한 뒤의 가장 옛 해시도 폐기를 부른다 — 이력은 최근 하나만이 아니다", async () => {
    const c = await connect();
    let current = c.refresh;
    for (const t of [0, 60_000, 120_000]) {
      const r = await refresh(current, at(t));
      if (r.status !== "ok") throw new Error("setup");
      current = r.tokens.refreshToken;
    }
    expect(await prisma.oAuthRefreshHistory.count()).toBe(3);
    expect(await refresh(c.refresh, at(180_000))).toEqual({ status: "invalid_grant" });
    expect(await prisma.oAuthConnection.count()).toBe(0);
  });

  it("알 수 없는 해시만으로는 아무 연결도 지우지 않는다", async () => {
    await connect();
    const before = await snapshot();
    expect(await refresh("mlr_unknown", at(1_000))).toEqual({ status: "invalid_grant" });
    expect(await refresh("mlm_not-a-refresh", at(1_000))).toEqual({ status: "invalid_grant" });
    expect(await snapshot()).toEqual(before);
  });

  it("재동의로 교체된 연결의 옛 refresh는 새 연결을 건드리지 않는다", async () => {
    const old = await connect();
    await prisma.oAuthConnection.delete({ where: { id: old.id } });
    const fresh = await connect();
    expect(await refresh(old.refresh, at(1_000))).toEqual({ status: "invalid_grant" });
    expect(await liveAt(fresh.access, at(1_000))).toBe(true);
    expect((await refresh(fresh.refresh, at(2_000))).status).toBe("ok");
  });
});

describe("바인딩 — 회전·폐기 전에 거부한다", () => {
  it("다른 client_id · client_id 생략 · 다른 origin · 명시된 다른 resource → invalid_grant · 쓰기 0건 (대조: resource 생략은 통과)", async () => {
    const c = await connect();
    const before = await snapshot();
    expect(await refresh(c.refresh, at(1_000), { clientId: CODEX })).toEqual({ status: "invalid_grant" });
    expect(await refresh(c.refresh, at(1_000), { clientId: undefined })).toEqual({ status: "invalid_grant" });
    expect(await refresh(c.refresh, at(1_000), { endpoint: DEV })).toEqual({ status: "invalid_grant" });
    expect(await refresh(c.refresh, at(1_000), { resource: DEV.resource })).toEqual({ status: "invalid_grant" });
    expect(await snapshot()).toEqual(before);
    expect((await refresh(c.refresh, at(1_000), { resource: undefined })).status).toBe("ok");
  });

  it("다른 client_id로 옛 refresh를 내도 연결을 폐기하지 않는다", async () => {
    const c = await connect();
    await refresh(c.refresh, at(0));
    const before = await snapshot();
    expect(await refresh(c.refresh, at(60_000), { clientId: CODEX })).toEqual({ status: "invalid_grant" });
    expect(await refresh(c.refresh, at(60_000), { endpoint: DEV })).toEqual({ status: "invalid_grant" });
    expect(await snapshot()).toEqual(before);
  });

  it("dev에서 발급된 연결은 prod 엔드포인트에서 회전되지 않는다 — 같은 DB여도", async () => {
    const c = await connect("u1", CLAUDE, { endpoint: DEV });
    expect(await refresh(c.refresh, at(1_000))).toEqual({ status: "invalid_grant" });
    expect((await refresh(c.refresh, at(1_000), { endpoint: DEV })).status).toBe("ok");
  });
});

describe("실패는 숨지 않는다", () => {
  it("해시 교체가 실패하면 이력 삽입도 롤백되고 던진다 — 옛 refresh가 그대로 현재다", async () => {
    const c = await connect();
    await pool.query(`CREATE FUNCTION fail_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_update BEFORE UPDATE ON "OAuthConnection" FOR EACH ROW EXECUTE FUNCTION fail_update();`);
    await expect(refresh(c.refresh, at(1_000))).rejects.toThrow();
    expect(await prisma.oAuthRefreshHistory.count()).toBe(0);
    await pool.query(`DROP TRIGGER fail_update ON "OAuthConnection"`);
    expect((await refresh(c.refresh, at(2_000))).status).toBe("ok");
  });

  it("재사용 폐기의 삭제가 실패하면 invalid_grant가 아니라 던진다(→ server_error) · 연결은 남는다", async () => {
    const c = await connect();
    await refresh(c.refresh, at(0));
    await pool.query(`CREATE FUNCTION fail_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_delete BEFORE DELETE ON "OAuthConnection" FOR EACH ROW EXECUTE FUNCTION fail_delete();`);
    await expect(refresh(c.refresh, at(60_000))).rejects.toThrow();
    expect(await prisma.oAuthConnection.count()).toBe(1);
  });
});
