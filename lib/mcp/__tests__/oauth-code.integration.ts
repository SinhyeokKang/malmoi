import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { optionalEnv } from "@/lib/env";

/**
 * **동의 → code → 교환 × 실제 PostgreSQL** (mcp-oauth T6 · design §4 · §4.2). 요청 저장·code 발급·거부는 T7의 동의 Action이 부를 서버 코어
 * (`lib/oauth-server/authorize.ts`)이고, 교환·폐기는 `/oauth/token`·`/oauth/revoke`의 코어다. 셋을 같은 DB에 태워:
 * - code는 **발급 스냅샷**으로만 교환된다 — 요청 행이 만료·정리돼도 code 수명 안이면 통과하고, 바인딩 검사는 그대로다(spec 조건 6).
 * - 요청당 code 하나 · 동시 교환 한 건 · 교체 실패는 기존 연결 유지 · 새 동의가 옛 code를 · 끊기가 미교환 code를 무효로 한다(spec 조건 14).
 * - 같은 DB를 보는 다른 origin은 code를 교차 승인하지 않는다(spec 조건 13).
 * ⚠️ 거부 단언마다 같은 픽스처의 성공 경로를 대조로 둔다 (POSTMORTEM 2026-09-14).
 */
vi.mock("server-only", () => ({}));

const { storeAuthorizationRequest, issueAuthorizationCode, denyAuthorizationRequest, readAuthorizationRequest } = await import("@/lib/oauth-server/authorize");
const { exchangeAuthorizationCode } = await import("@/lib/oauth-server/token");
const { revokeToken, disconnectConnection } = await import("@/lib/oauth-server/revoke");
const { hashApiToken } = await import("../token");
const { resolveBearer } = await import("../token-store");

const directory = mkdtempSync(join(tmpdir(), "malmoi-oauth-code-"));
let binaries: string;
const PORT = 55573;
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
  await prisma.project.create({ data: { id: "p1", slug: "p1", name: "P1", repoOwner: "o", repoName: "r", baseBranch: "main", installationId: "1", repositoryId: "100" } });
  await prisma.projectMember.create({ data: { projectId: "p1", userId: "u1", role: "EDITOR" } });
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
const REDIRECT = "http://localhost:51234/callback";
const VERIFIER = "v".repeat(43);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const T0 = new Date("2026-09-29T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

const client = (clientId = CLAUDE) => ({ clientId, clientName: clientId === CLAUDE ? "Claude Code" : null, displayName: clientId, redirectUris: ["http://localhost/callback"] });
const authorizeRequest = (clientId = CLAUDE, state: string | null = "st") => ({ clientId, redirectUri: REDIRECT, codeChallenge: CHALLENGE, state, resource: PROD.resource });
async function store(now: Date, clientId = CLAUDE, endpoint = PROD) {
  const stored = await storeAuthorizationRequest(prisma, { request: { ...authorizeRequest(clientId), resource: endpoint.resource }, client: client(clientId), endpoint, now });
  if (!stored.ok) throw new Error("setup: store");
  return stored.requestId;
}
const CONSENT = { expiresInDays: 30, grants: ["translation:write"], scope: { kind: "all" as const } };
async function issue(requestId: string, now: Date, over: { userId?: string; endpoint?: typeof PROD; consent?: typeof CONSENT | { expiresInDays: number; grants: string[]; scope: { kind: "projects"; projectIds: string[] } } } = {}) {
  return issueAuthorizationCode(prisma, { requestId, userId: over.userId ?? "u1", consent: over.consent ?? CONSENT, endpoint: over.endpoint ?? PROD, now });
}
async function issued(requestId: string, now: Date) {
  const result = await issue(requestId, now);
  if (result.status !== "issued") throw new Error(`setup: issue ${result.status}`);
  return result;
}
const codeOf = (redirect: string) => new URL(redirect).searchParams.get("code")!;
const exchange = (code: string, now: Date, over: Partial<{ clientId: string; redirectUri: string; resource: string; codeVerifier: string; endpoint: typeof PROD }> = {}) =>
  exchangeAuthorizationCode(prisma, { code, codeVerifier: over.codeVerifier ?? VERIFIER, clientId: over.clientId ?? CLAUDE, redirectUri: over.redirectUri ?? REDIRECT, resource: over.resource }, over.endpoint ?? PROD, now);

describe("요청 → code → 연결", () => {
  it("발급 스냅샷으로 연결이 서고 access가 산다 · 콜백은 code + 원래 state", async () => {
    const requestId = await store(at(0));
    const result = await issued(requestId, at(MIN));
    const url = new URL(result.redirect);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe("st");
    const tokens = await exchange(codeOf(result.redirect), at(MIN + 1_000));
    expect(tokens.status).toBe("ok");
    const connection = await prisma.oAuthConnection.findFirstOrThrow({ where: { userId: "u1" } });
    expect(connection).toMatchObject({ clientId: CLAUDE, clientName: "Claude Code", redirectUri: REDIRECT, ...PROD, grants: ["translation:write"], allProjects: true, expiresAt: at(MIN + 30 * 86_400_000) });
    expect(tokens.status === "ok" && await resolveBearer(prisma, tokens.tokens.accessToken, at(MIN + 2_000), PROD)).toMatchObject({ userId: "u1", credential: { kind: "oauth", connectionId: connection.id } });
  });

  it("요청 만료 직전에 발급한 code는 요청이 만료·정리된 뒤에도 code 수명 안이면 교환된다 — 경계에서는 거부", async () => {
    const requestId = await store(at(0));
    const result = await issued(requestId, at(10 * MIN - 1));
    // 다른 요청의 저장이 만료 행 정리를 부른다 — 실제 정리 경로로 지운다.
    await store(at(10 * MIN + 1), CODEX);
    expect(await prisma.oAuthAuthorizationRequest.findUnique({ where: { id: requestId } })).toBeNull();
    const code = codeOf(result.redirect);
    expect(await exchange(code, at(10 * MIN - 1 + MIN))).toEqual({ status: "invalid_grant" });
    expect((await exchange(code, at(10 * MIN - 2 + MIN))).status).toBe("ok");
  });

  it("요청이 정리된 뒤에도 잘못된 verifier·clientId·redirectUri·resource·issuer는 거부한다 (대조: 맞으면 통과)", async () => {
    const requestId = await store(at(0));
    const code = codeOf((await issued(requestId, at(9 * MIN))).redirect);
    await store(at(10 * MIN + 1), CODEX);
    const now = at(9 * MIN + 30_000);
    for (const over of [
      { codeVerifier: "w".repeat(43) }, { clientId: CODEX }, { redirectUri: "http://localhost:51235/callback" }, { resource: DEV.resource }, { endpoint: DEV },
    ]) expect(await exchange(code, now, over), JSON.stringify(over)).toEqual({ status: "invalid_grant" });
    expect(await prisma.oAuthConnection.count()).toBe(0);
    expect((await exchange(code, now)).status).toBe("ok");
  });

  it("교환이 성공하면 그 code 행과 그 사용자의 만료 code 행이 지워진다 — 다른 사용자의 행은 그대로", async () => {
    // 다른 클라이언트의 code — 새 code 발급 시점엔 아직 살아 있고(발급의 만료 정리에 안 걸린다) 교환 시점엔 만료다.
    await issued(await store(at(MIN + 30_000), CODEX), at(MIN + 30_000));
    await issue(await store(at(0)), at(0), { userId: "u2" });
    const code = codeOf((await issued(await store(at(2 * MIN)), at(2 * MIN))).redirect);
    expect(await prisma.oAuthCode.count()).toBe(3);
    expect((await exchange(code, at(2 * MIN + 31_000))).status).toBe("ok");
    expect((await prisma.oAuthCode.findMany({ select: { userId: true } })).map(r => r.userId)).toEqual(["u2"]);
    expect(await exchange(code, at(2 * MIN + 32_000))).toEqual({ status: "invalid_grant" });
  });

  it("code는 1회용 — 동시 교환은 한 건만, 재사용은 거부 · 연결은 하나", async () => {
    const code = codeOf((await issued(await store(at(0)), at(1_000))).redirect);
    const results = await Promise.all([exchange(code, at(2_000)), exchange(code, at(2_000))]);
    expect(results.map(r => r.status).sort()).toEqual(["invalid_grant", "ok"]);
    const connection = await prisma.oAuthConnection.findFirstOrThrow({});
    expect(await exchange(code, at(3_000))).toEqual({ status: "invalid_grant" });
    expect(await prisma.oAuthConnection.findFirstOrThrow({})).toEqual(connection);
  });

  it("같은 클라이언트의 재동의는 교환 시점에 기존 연결을 교체한다 — 다른 클라이언트 연결은 그대로", async () => {
    const first = await exchange(codeOf((await issued(await store(at(0)), at(1_000))).redirect), at(2_000));
    const codex = await store(at(0), CODEX);
    const codexCode = codeOf((await issued(codex, at(1_000))).redirect);
    expect((await exchangeAuthorizationCode(prisma, { code: codexCode, codeVerifier: VERIFIER, clientId: CODEX, redirectUri: REDIRECT, resource: undefined }, PROD, at(2_000))).status).toBe("ok");
    const second = await exchange(codeOf((await issued(await store(at(3_000)), at(4_000))).redirect), at(5_000));
    expect(second.status).toBe("ok");
    expect(await prisma.oAuthConnection.count()).toBe(2);
    expect(first.status === "ok" && await resolveBearer(prisma, first.tokens.accessToken, at(6_000), PROD)).toBeNull();
    expect(second.status === "ok" && await resolveBearer(prisma, second.tokens.accessToken, at(6_000), PROD)).not.toBeNull();
  });

  it("교체가 실패하면 기존 연결이 남고 code도 소비되지 않는다", async () => {
    const first = await exchange(codeOf((await issued(await store(at(0)), at(1_000))).redirect), at(2_000));
    const code = codeOf((await issued(await store(at(3_000)), at(4_000))).redirect);
    await pool.query(`CREATE FUNCTION fail_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_insert BEFORE INSERT ON "OAuthConnection" FOR EACH ROW EXECUTE FUNCTION fail_insert();`);
    await expect(exchange(code, at(5_000))).rejects.toThrow();
    expect(first.status === "ok" && await resolveBearer(prisma, first.tokens.accessToken, at(6_000), PROD)).not.toBeNull();
    await pool.query(`DROP TRIGGER fail_insert ON "OAuthConnection"`);
    expect((await exchange(code, at(6_000))).status).toBe("ok");
  });

  it("새 동의가 옛 미교환 code를 무효로 한다", async () => {
    const oldCode = codeOf((await issued(await store(at(0)), at(1_000))).redirect);
    const newCode = codeOf((await issued(await store(at(2_000)), at(3_000))).redirect);
    expect(await exchange(oldCode, at(4_000))).toEqual({ status: "invalid_grant" });
    expect((await exchange(newCode, at(4_000))).status).toBe("ok");
  });

  it("끊기(revoke)는 연결과 그 클라이언트의 미교환 code를 함께 무효로 한다 — 뒤늦은 교환으로 되살리지 못한다", async () => {
    const tokens = await exchange(codeOf((await issued(await store(at(0)), at(1_000))).redirect), at(2_000));
    if (tokens.status !== "ok") throw new Error("setup");
    const pending = codeOf((await issued(await store(at(3_000)), at(4_000))).redirect);
    const codex = codeOf((await issued(await store(at(3_000), CODEX), at(4_000))).redirect);
    await revokeToken(prisma, { token: tokens.tokens.refreshToken, clientId: CLAUDE }, PROD);
    expect(await prisma.oAuthConnection.count()).toBe(0);
    expect(await exchange(pending, at(5_000))).toEqual({ status: "invalid_grant" });
    expect(await prisma.oAuthConnection.count()).toBe(0);
    expect((await exchangeAuthorizationCode(prisma, { code: codex, codeVerifier: VERIFIER, clientId: CODEX, redirectUri: REDIRECT, resource: undefined }, PROD, at(5_000))).status).toBe("ok");
  });
});

describe("요청 소비 — Authorize·Deny는 한 번", () => {
  it("같은 요청의 두 번째 Authorize는 새 code를 만들지 않는다", async () => {
    const requestId = await store(at(0));
    await issued(requestId, at(1_000));
    expect(await issue(requestId, at(2_000))).toEqual({ status: "unavailable", reason: "consumed" });
    expect(await prisma.oAuthCode.count()).toBe(1);
  });

  it("Authorize와 Deny가 겹치면 한 건만 성공한다", async () => {
    const requestId = await store(at(0));
    const [authorized, denied] = await Promise.all([issue(requestId, at(1_000)), denyAuthorizationRequest(prisma, { requestId, endpoint: PROD, now: at(1_000) })]);
    expect([authorized.status === "issued", denied.status === "denied"].filter(Boolean)).toHaveLength(1);
    expect(await prisma.oAuthCode.count()).toBe(authorized.status === "issued" ? 1 : 0);
  });

  it("Deny는 access_denied + 원래 state로 돌려보내고, 그 뒤 Authorize는 unavailable", async () => {
    const requestId = await store(at(0));
    const denied = await denyAuthorizationRequest(prisma, { requestId, endpoint: PROD, now: at(1_000) });
    expect(denied).toEqual({ status: "denied", redirect: `${REDIRECT}?error=access_denied&state=st` });
    expect(await issue(requestId, at(2_000))).toEqual({ status: "unavailable", reason: "consumed" });
  });

  it("만료된 요청 · 없는 요청 · 다른 origin의 요청 → code 없음", async () => {
    const requestId = await store(at(0));
    expect(await issue(requestId, at(10 * MIN))).toEqual({ status: "unavailable", reason: "expired" });
    expect(await issue("missing", at(1_000))).toEqual({ status: "unavailable", reason: "missing" });
    expect(await issue(requestId, at(1_000), { endpoint: DEV })).toEqual({ status: "unavailable", reason: "missing" });
    expect(await prisma.oAuthCode.count()).toBe(0);
    expect((await issue(requestId, at(1_000))).status).toBe("issued");
  });

  it("동의 입력이 틀리면 요청을 소비하지 않는다 — 입력을 고쳐 다시 낼 수 있다", async () => {
    const requestId = await store(at(0));
    expect(await issue(requestId, at(1_000), { consent: { expiresInDays: 30, grants: [], scope: { kind: "projects", projectIds: ["not-mine"] } } }))
      .toEqual({ status: "invalid", field: "scope" });
    expect(await issue(requestId, at(1_000), { consent: { expiresInDays: 7, grants: [], scope: { kind: "all" } } as never })).toEqual({ status: "invalid", field: "expiresIn" });
    expect((await issue(requestId, at(2_000), { consent: { expiresInDays: 90, grants: [], scope: { kind: "projects", projectIds: ["p1"] } } })).status).toBe("issued");
  });

  it("읽기는 요청의 표시 정보만 주고 상태를 가른다", async () => {
    const requestId = await store(at(0));
    expect(await readAuthorizationRequest(prisma, { requestId, endpoint: PROD, now: at(1_000) }))
      .toEqual({ status: "ok", request: { clientId: CLAUDE, clientName: "Claude Code", redirectUri: REDIRECT } });
    expect(await readAuthorizationRequest(prisma, { requestId, endpoint: PROD, now: at(10 * MIN) })).toEqual({ status: "unavailable", reason: "expired" });
    expect(await readAuthorizationRequest(prisma, { requestId, endpoint: DEV, now: at(1_000) })).toEqual({ status: "unavailable", reason: "missing" });
  });

  it("저장은 등록되지 않은 콜백·다른 resource를 받지 않는다", async () => {
    expect(await storeAuthorizationRequest(prisma, { request: { ...authorizeRequest(), redirectUri: "http://127.0.0.1:5/callback" }, client: client(), endpoint: PROD, now: at(0) })).toEqual({ ok: false });
    expect(await storeAuthorizationRequest(prisma, { request: { ...authorizeRequest(), resource: DEV.resource }, client: client(), endpoint: PROD, now: at(0) })).toEqual({ ok: false });
    expect(await storeAuthorizationRequest(prisma, { request: authorizeRequest(CODEX), client: client(), endpoint: PROD, now: at(0) })).toEqual({ ok: false });
    expect(await prisma.oAuthAuthorizationRequest.count()).toBe(0);
  });
});

describe("revoke 바인딩", () => {
  it("다른 client_id · 다른 origin의 revoke는 연결을 끊지 않는다 (대조: 맞으면 끊는다 · access로도)", async () => {
    const tokens = await exchange(codeOf((await issued(await store(at(0)), at(1_000))).redirect), at(2_000));
    if (tokens.status !== "ok") throw new Error("setup");
    await revokeToken(prisma, { token: tokens.tokens.accessToken, clientId: CODEX }, PROD);
    await revokeToken(prisma, { token: tokens.tokens.accessToken, clientId: CLAUDE }, DEV);
    await revokeToken(prisma, { token: "mlr_unknown", clientId: CLAUDE }, PROD);
    expect(await prisma.oAuthConnection.count()).toBe(1);
    await revokeToken(prisma, { token: tokens.tokens.accessToken, clientId: CLAUDE }, PROD);
    expect(await prisma.oAuthConnection.count()).toBe(0);
  });
});

/**
 * **`/mcp`의 연결별 끊기** (spec 조건 8·9·14 · design §4.2). `/oauth/revoke`와 같은 tx 모양을 연결 ID로 — User 잠금 뒤 그 사용자의 행을 다시 읽고,
 * 연결과 같은 클라이언트의 미교환 code를 함께 지운다. 다음 호출부터 401이고, 다른 연결·개인 토큰은 그대로다.
 */
describe("연결별 끊기", () => {
  async function connect(clientId: string, now: Date) {
    const requestId = await store(now, clientId);
    const code = codeOf((await issued(requestId, now)).redirect);
    const tokens = await exchangeAuthorizationCode(prisma, { code, codeVerifier: VERIFIER, clientId, redirectUri: REDIRECT, resource: undefined }, PROD, now);
    if (tokens.status !== "ok") throw new Error("setup: exchange");
    const row = await prisma.oAuthConnection.findFirstOrThrow({ where: { userId: "u1", clientId } });
    return { id: row.id, access: tokens.tokens.accessToken };
  }

  it("끊은 연결의 다음 호출은 거부되고, 다른 연결·개인 토큰은 계속 된다", async () => {
    const claude = await connect(CLAUDE, at(0));
    const codex = await connect(CODEX, at(0));
    const personal = "mlm_personal";
    await prisma.apiToken.create({ data: { userId: "u1", tokenHash: hashApiToken(personal), grants: [], allProjects: true, expiresAt: at(86_400_000) } });
    // 대조: 끊기 전에는 셋 다 산다.
    for (const token of [claude.access, codex.access, personal]) expect(await resolveBearer(prisma, token, at(1_000), PROD), token).not.toBeNull();

    await disconnectConnection(prisma, { userId: "u1", connectionId: claude.id });
    expect(await resolveBearer(prisma, claude.access, at(2_000), PROD)).toBeNull();
    expect(await resolveBearer(prisma, codex.access, at(2_000), PROD)).toMatchObject({ credential: { kind: "oauth", connectionId: codex.id } });
    expect(await resolveBearer(prisma, personal, at(2_000), PROD)).not.toBeNull();
  });

  it("그 클라이언트의 미교환 code도 함께 지운다 — 뒤늦은 교환이 끊긴 연결을 되살리지 못한다 (다른 클라이언트 code는 그대로)", async () => {
    const claude = await connect(CLAUDE, at(0));
    const pending = codeOf((await issued(await store(at(1_000)), at(1_000))).redirect);
    const codexPending = codeOf((await issued(await store(at(1_000), CODEX), at(1_000))).redirect);
    await disconnectConnection(prisma, { userId: "u1", connectionId: claude.id });
    expect(await exchange(pending, at(2_000))).toEqual({ status: "invalid_grant" });
    expect(await prisma.oAuthConnection.count()).toBe(0);
    expect((await exchangeAuthorizationCode(prisma, { code: codexPending, codeVerifier: VERIFIER, clientId: CODEX, redirectUri: REDIRECT, resource: undefined }, PROD, at(2_000))).status).toBe("ok");
  });

  it("다른 사용자의 연결 ID로는 끊지 못한다 · 없는 ID·두 번째 끊기는 아무 일 없이 끝난다", async () => {
    const claude = await connect(CLAUDE, at(0));
    await disconnectConnection(prisma, { userId: "u2", connectionId: claude.id });
    await disconnectConnection(prisma, { userId: "u1", connectionId: "missing" });
    expect(await resolveBearer(prisma, claude.access, at(1_000), PROD)).not.toBeNull();
    await disconnectConnection(prisma, { userId: "u1", connectionId: claude.id });
    await disconnectConnection(prisma, { userId: "u1", connectionId: claude.id });
    expect(await prisma.oAuthConnection.count()).toBe(0);
  });
});
