import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";
import NextAuth, { customFetch } from "next-auth";
import { NextRequest } from "next/server";
import { credentialAdapter } from "../adapter";
import { convertCredentials } from "../conversion";
import { encodeUserFields, decodeUser } from "../records";
import { refreshVerifiedEmail } from "../access";
import { hashSessionToken } from "../crypto";
import { lookupEmail, openToken } from "../storage";
import { FINALIZE_MIGRATION } from "../finalize";
import { noteAuthError, withOutageFlag } from "@/lib/auth/outage";
import { publicSession } from "@/lib/auth/public-session";
import { beginRevocation, finishRevocation } from "@/lib/session-revocation/store";
import { authorizeRevocation, withRevocation, withRevocationStart, revocationAuthCookies } from "@/lib/session-revocation/http";

// A fresh Unix-socket-only cluster; never reads DATABASE_URL/DIRECT_URL or a shared DB.
const directory = mkdtempSync(join(tmpdir(), "malmoi-credentials-"));
const binaries = process.env.CREDENTIAL_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
let pool: Pool;
let prisma: PrismaClient;
vi.mock("@/lib/db", () => ({ getPrisma: () => prisma }));
let started = false;
const cutover = { apply: true, trafficBlocked: true, writersDrained: true };
const ids = { u1: "u1", u2: "u2", p1: "p1", i1: "i1" };
/**
 * 픽스처 DB를 **R1 상태**로 세운다.
 *
 * ⚠️ **finalize는 일부러 뺀다** (2026-09-10 R2 배송). 그 파일이 `prisma/migrations`로 옮겨진 뒤로는
 * 전부 적용하면 여기가 곧 R2가 되어 **평문 unique 인덱스가 사라진 채로 시작한다** — 그러면 R1의
 * additive 성질(옛 writer가 그대로 동작하고 중복 이메일이 거부된다)을 잴 수 없다. 이 스위트가
 * 재는 것은 R1→backfill→R2의 **경로**이므로 출발점은 언제나 R1이다.
 */
async function resetSchema() {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public');
  for (const name of readdirSync("prisma/migrations").sort()) {
    if (name === "migration_lock.toml" || name === FINALIZE_MIGRATION) continue;
    await pool.query(readFileSync(join("prisma/migrations", name, "migration.sql"), "utf8"));
  }
}
async function legacy() {
  await prisma.user.createMany({ data: [{ id: ids.u1, email: "Alice@Example.com", name: "Alice", image: "https://images.example/alice" }, { id: ids.u2, email: "bob@example.com", name: null }] });
  await prisma.project.create({ data: { id: ids.p1, slug: "alpha", name: "Alpha", repoOwner: "fixture", repoName: "fixture" } });
  await prisma.projectMember.create({ data: { projectId: ids.p1, userId: ids.u1, role: "OWNER" } });
  await prisma.projectInvitation.create({ data: { id: ids.i1, projectId: ids.p1, invitedBy: ids.u1, email: "bob@example.com", role: "EDITOR", tokenHash: "unchanged-hash", expiresAt: new Date("2030-01-01") } });
  await prisma.account.createMany({ data: [{ userId: ids.u1, type: "oauth", provider: "github", providerAccountId: "login1", access_token: "login-access", id_token: "login-identity" }, { userId: ids.u1, type: "oauth", provider: "github-app", providerAccountId: "app1", access_token: "app-access", refresh_token: "app-refresh", expires_at: 1234 }] });
  await prisma.session.createMany({ data: [{ userId: ids.u1, sessionToken: "old-cookie", expires: new Date("2030-01-01") }, { userId: ids.u1, sessionToken: hashSessionToken("new-cookie"), expires: new Date("2030-01-01") }] });
}
beforeAll(async () => {
  execFileSync(join(binaries, "initdb"), ["-D", join(directory, "data"), "--no-locale", "--encoding=UTF8", "--auth=trust", "-U", "postgres"], { stdio: "pipe" });
  execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p 55479 -F`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const config = { host: directory, port: 55479, user: "postgres", database: "postgres" };
  pool = new Pool(config);
  prisma = new PrismaClient({ adapter: new PrismaPg(config), log: [] });
});
beforeEach(resetSchema);
afterAll(async () => {
  await prisma?.$disconnect(); await pool?.end();
  if (started) execFileSync(join(binaries, "pg_ctl"), ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
});
it("R1 is additive for empty and legacy databases; check-only writes nothing", async () => {
  expect(await convertCredentials(prisma, { mode: "verify" })).toMatchObject({ changes: 0 });
  await legacy();
  const before = await prisma.user.findMany();
  const report = await convertCredentials(prisma, { mode: "backfill" });
  expect(report.applied).toBe(0);
  expect(await prisma.user.findMany()).toEqual(before);
  expect(await prisma.user.findUnique({ where: { id: ids.u1 } })).toMatchObject({ email: "Alice@Example.com", emailLookup: null });
  await expect(pool.query('INSERT INTO "User" (id,email) VALUES ($1,$2)', ["duplicate", "Alice@Example.com"])).rejects.toThrow();
});
it("backfill preserves IDs, FKs, invitations and expiry; a second run is a no-op", async () => {
  await legacy();
  await convertCredentials(prisma, { mode: "backfill", ...cutover });
  const users = await prisma.user.findMany();
  expect(users.map(u => u.id).sort()).toEqual([ids.u1, ids.u2]);
  expect(decodeUser(users.find(u => u.id === ids.u1)!)).toMatchObject({ email: "alice@example.com", name: "Alice" });
  expect(await prisma.projectInvitation.findUnique({ where: { id: ids.i1 } })).toMatchObject({ tokenHash: "unchanged-hash", projectId: ids.p1, invitedBy: ids.u1 });
  expect(await prisma.projectMember.count()).toBe(1);
  expect(await prisma.session.findMany()).toHaveLength(1);
  expect(await credentialAdapter(prisma).getSessionAndUser!("old-cookie")).toBeNull();
  expect(await credentialAdapter(prisma).getSessionAndUser!(hashSessionToken("new-cookie"))).toBeNull();
  const app = await prisma.account.findUniqueOrThrow({ where: { provider_providerAccountId: { provider: "github-app", providerAccountId: "app1" } } });
  expect(app.expires_at).toBe(1234);
  expect(openToken(app.access_token, { userId: ids.u1, providerAccountId: "app1", field: "access_token" })).toBe("app-access");
  expect(await convertCredentials(prisma, { mode: "backfill", ...cutover })).toMatchObject({ changes: 0, applied: 0 });
  expect(await prisma.user.findMany()).toEqual(users);
});
it("interruption after one committed batch resumes without double encryption", async () => {
  await legacy();
  const original = prisma.user.updateMany.bind(prisma.user);
  const spy = vi.spyOn(prisma.user, "updateMany").mockImplementationOnce(original).mockRejectedValueOnce(new Error("interrupted"));
  await expect(convertCredentials(prisma, { mode: "backfill", ...cutover })).rejects.toThrow("credential storage unavailable");
  spy.mockRestore();
  expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.u1 } })).email).toMatch(/^enc:v1:/);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.u2 } })).email).toBe("bob@example.com");
  await convertCredentials(prisma, { mode: "backfill", ...cutover });
  expect(await convertCredentials(prisma, { mode: "verify" })).toMatchObject({ changes: 0 });
});
it("CAS rejects a writer that changed a row after preflight without overwriting it", async () => {
  await legacy();
  const original = prisma.user.updateMany.bind(prisma.user);
  const spy = vi.spyOn(prisma.user, "updateMany").mockImplementationOnce(args => {
    return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('UPDATE "User" SET name=$1 WHERE id=$2', "new writer", ids.u1);
    return tx.user.updateMany(args);
    }) as ReturnType<typeof original>;
  });
  await expect(convertCredentials(prisma, { mode: "backfill", ...cutover })).rejects.toThrow();
  spy.mockRestore();
  expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.u1 } })).name).toBe("new writer");
});
it("real unique index admits only one concurrent signup and one email refresh winner", async () => {
  const adapter = credentialAdapter(prisma);
  const inputs = { id: "ignored-provider-id", email: "same@example.com", emailVerified: null, name: null, image: null };
  const created = await Promise.allSettled([adapter.createUser!(inputs), adapter.createUser!(inputs)]);
  expect(created.filter(r => r.status === "fulfilled")).toHaveLength(1);
  await prisma.user.createMany({ data: [ids.u1, ids.u2].map(id => ({ id, ...encodeUserFields(id, { email: `${id}@example.com` }), email: encodeUserFields(id, { email: `${id}@example.com` }).email! })) });
  await prisma.account.createMany({ data: [ids.u1, ids.u2].map(id => ({ userId: id, provider: "github", providerAccountId: id, type: "oauth" })) });
  const results = await Promise.all([refreshVerifiedEmail(prisma, "github", ids.u1, "fresh@example.com"), refreshVerifiedEmail(prisma, "github", ids.u2, "fresh@example.com")]);
  expect(results.sort()).toEqual(["conflict", "update"]);
  expect(await prisma.user.count({ where: { emailLookup: lookupEmail("fresh@example.com") } })).toBe(1);
});
it("User row lock blocks concurrent additional account linking", async () => {
  const adapter = credentialAdapter(prisma);
  const user = await adapter.createUser!({ id: "ignored-provider-id", email: "u@example.com", emailVerified: null });
  const results = await Promise.allSettled(["github", "google"].map(provider => adapter.linkAccount!({ userId: user.id, provider, providerAccountId: "provider1", type: "oauth", access_token: "must-not-store" })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await prisma.account.findMany()).toEqual([expect.objectContaining({ userId: user.id, access_token: null, refresh_token: null, id_token: null })]);
});
it("PII/token rotation, partial reindex, missing-key recovery and backup restore", async () => {
  await legacy(); await convertCredentials(prisma, { mode: "backfill", ...cutover });
  const lookup = (await prisma.user.findMany()).map(u => u.emailLookup);
  const backup = join(directory, "backup.sql");
  execFileSync(join(binaries, "pg_dump"), ["-h", directory, "-p", "55479", "-U", "postgres", "-f", backup, "postgres"], { stdio: "pipe" });
  for (const kind of ["PII", "TOKEN"]) {
    const old = JSON.parse(process.env[`${kind}_ENCRYPTION_KEYS`]!);
    vi.stubEnv(`${kind}_ENCRYPTION_KEYS`, JSON.stringify({ ...old, next: randomBytes(32).toString("base64") }));
    vi.stubEnv(`${kind}_ENCRYPTION_ACTIVE_KEY_ID`, "next");
  }
  try {
    await convertCredentials(prisma, { mode: "rotate-pii", ...cutover });
    expect((await prisma.user.findMany()).map(u => u.emailLookup)).toEqual(lookup);
    await convertCredentials(prisma, { mode: "rotate-token", ...cutover });
    vi.stubEnv("EMAIL_LOOKUP_KEY", randomBytes(32).toString("base64")); vi.stubEnv("EMAIL_LOOKUP_KEY_ID", "next");
    const original = prisma.user.updateMany.bind(prisma.user);
    const spy = vi.spyOn(prisma.user, "updateMany").mockImplementationOnce(original).mockRejectedValueOnce(new Error("interrupted"));
    await expect(convertCredentials(prisma, { mode: "reindex", ...cutover })).rejects.toThrow(); spy.mockRestore();
    await expect(convertCredentials(prisma, { mode: "verify" })).rejects.toThrow();
    await convertCredentials(prisma, { mode: "reindex", ...cutover });
    expect((await prisma.user.findMany()).every(u => u.emailLookup?.startsWith("hmac:v1:next:"))).toBe(true);
    const good = process.env.PII_ENCRYPTION_KEYS!;
    vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ next: randomBytes(32).toString("base64") }));
    await expect(convertCredentials(prisma, { mode: "verify" })).rejects.toThrow();
    vi.stubEnv("PII_ENCRYPTION_KEYS", good);
    expect(await convertCredentials(prisma, { mode: "verify" })).toMatchObject({ changes: 0 });
  } finally { vi.unstubAllEnvs(); }
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public');
  execFileSync(join(binaries, "psql"), ["-h", directory, "-p", "55479", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", backup], { stdio: "pipe" });
  expect(await convertCredentials(prisma, { mode: "verify" })).toMatchObject({ changes: 0 });
  expect(await prisma.projectMember.count()).toBe(1);
});
function fakeAuth(provider: "github" | "google", identity: string, revocation = false) {
  const handlers = NextAuth(() => ({
    cookies: revocationAuthCookies(),
    trustHost: true, secret: "fixture-secret-fixture-secret-fixture-secret", basePath: "/api/auth",
    adapter: credentialAdapter(prisma), session: { strategy: "database", maxAge: 86400, updateAge: 3600, generateSessionToken: () => randomBytes(32).toString("base64url") },
    providers: [{ id: provider, name: provider, type: "oauth", checks: revocation ? ["pkce", "state"] : ["none"], clientId: "fixture", clientSecret: "fixture",
      authorization: "https://provider.invalid/authorize", token: "https://provider.invalid/token", userinfo: "https://provider.invalid/user",
      [customFetch]: async input => new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname === "/token"
        ? Response.json({ access_token: "oauth-access", refresh_token: "oauth-refresh", token_type: "bearer", expires_in: 3600 })
        : Response.json({ id: identity, email: `${identity}@example.com`, name: "Fixture" }),
      profile: profile => ({ id: String(profile.id), email: String(profile.email), name: String(profile.name), image: null }),
    }],
    callbacks: { session: ({ session, user }) => publicSession({ session, user }), signIn: async ({ account }) => revocation ? (await authorizeRevocation(prisma, account)) ?? true : true },
    logger: { error: noteAuthError },
  })).handlers;
  return revocation ? {
    GET: (req: NextRequest) => withRevocation(req, () => handlers.GET(req)),
    POST: (req: NextRequest) => withRevocation(req, () => handlers.POST(req)),
  } : handlers;
}
it.each(["github", "google"] as const)("installed Auth.js %s callback stores digest, rejects digest-cookie, renews and signs out", async provider => {
  const handlers = fakeAuth(provider, provider);
  const callback = await handlers.GET(new NextRequest(`http://localhost/api/auth/callback/${provider}?code=fixture`));
  expect(callback.headers.get("location")).toBe("http://localhost");
  const cookie = callback.headers.getSetCookie().find(v => v.startsWith("authjs.session-token="))!;
  expect(cookie).toContain("HttpOnly");
  const raw = cookie.split(";")[0]!.split("=")[1]!;
  expect(raw).toMatch(/^[\w-]{43}$/);
  const session = await prisma.session.findUniqueOrThrow({ where: { sessionToken: hashSessionToken(raw) } });
  expect(session.sessionToken).not.toBe(raw);
  const account = await prisma.account.findFirstOrThrow();
  expect(account).toMatchObject({ access_token: null, refresh_token: null, id_token: null });
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  expect(stored.email).toMatch(/^enc:v1:/);
  const read = (value: string) => handlers.GET(new NextRequest("http://localhost/api/auth/session", { headers: { cookie: `authjs.session-token=${value}` } }));
  const publicResponse = await read(raw);
  expect(await publicResponse.json()).toMatchObject({ user: { id: session.userId, email: `${provider}@example.com` } });
  expect(await (await read(session.sessionToken)).json()).toBeNull();
  const relogin = await handlers.GET(new NextRequest(`http://localhost/api/auth/callback/${provider}?code=fixture`, { headers: { cookie: `authjs.session-token=${raw}` } }));
  expect(relogin.headers.get("location")).toBe("http://localhost");
  expect(await prisma.user.count()).toBe(1);
  expect(await prisma.account.count({ where: { userId: session.userId } })).toBe(1);
  await prisma.session.update({ where: { sessionToken: session.sessionToken }, data: { expires: new Date(Date.now() + 10000) } });
  await read(raw);
  expect((await prisma.session.findUniqueOrThrow({ where: { sessionToken: session.sessionToken } })).expires.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
  const csrfResponse = await handlers.GET(new NextRequest("http://localhost/api/auth/csrf"));
  const csrf = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
  const signout = () => handlers.POST(new NextRequest("http://localhost/api/auth/signout", { method: "POST", headers: { cookie: `${csrfCookie}; authjs.session-token=${raw}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken }) }));
  await signout(); await signout();
  expect(await prisma.session.count()).toBe(0);
});
it("R2 refuses legacy rows, then finalizes verified data and rejects missing lookups", async () => {
  await legacy();
  const sql = readFileSync("prisma/credential-cutover/20260910060000_finalize_credential_storage/migration.sql", "utf8");
  const connection = await pool.connect();
  try { await expect(connection.query(sql)).rejects.toThrow("credential finalization precondition failed"); await connection.query("ROLLBACK"); }
  finally { connection.release(); }
  await convertCredentials(prisma, { mode: "backfill", ...cutover });
  await pool.query(sql);
  expect(await convertCredentials(prisma, { mode: "verify" })).toMatchObject({ changes: 0 });
  /**
   * ⚠️ **R2는 `emailLookup`에 NOT NULL을 걸지 않는다** (2026-09-10 판단 — migration.sql의 주석).
   * 그 제약은 전환 도구의 backfill CAS가 안 채워진 행을 `emailLookup: null`로 집는 것을 막아,
   * 컷오버 이전 백업을 복원했을 때 다시 채울 수단을 없앤다. 그래서 **DB가 막는 것은 유일성**이고
   * **값 존재는 유일한 생성자가 증명한다** — 아래 두 줄이 그 분담을 고정한다.
   */
  await expect(pool.query('INSERT INTO "User" (id,email,"emailLookup") VALUES ($1,$2,$3)',
    ["duplicate-lookup", "enc:v1:placeholder", lookupEmail("alice@example.com")])).rejects.toThrow();
  const indices = await pool.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname='public'");
  expect(indices.rows.map(r => r.indexname)).not.toContain("User_email_key");
  expect(indices.rows.map(r => r.indexname)).toContain("User_emailLookup_key");
  const adapter = credentialAdapter(prisma);
  const newUser = await adapter.createUser!({ id: "ignored", email: "fresh@example.com", emailVerified: null });
  expect(await adapter.getUserByEmail!(" FRESH@example.com ")).toMatchObject({ id: newUser.id });
});
it("session renewal cannot revive deletion or erase a concurrently renewed row", async () => {
  const adapter = credentialAdapter(prisma);
  const user = await adapter.createUser!({ id: "ignored", email: "session@example.com", emailVerified: null });
  await adapter.createSession!({ sessionToken: "raw", userId: user.id, expires: new Date(Date.now() + 50000) });
  const digest = hashSessionToken("raw");
  await Promise.all([adapter.deleteSession!("raw"), adapter.updateSession!({ sessionToken: "raw", expires: new Date(Date.now() + 90000) })]);
  expect(await prisma.session.count()).toBe(0);
  await prisma.session.create({ data: { sessionToken: digest, userId: user.id, expires: new Date(0) } });
  const original = prisma.session.deleteMany.bind(prisma.session);
  const spy = vi.spyOn(prisma.session, "deleteMany").mockImplementationOnce(args => prisma.$transaction(async tx => {
    await tx.session.update({ where: { sessionToken: digest }, data: { expires: new Date(Date.now() + 90000) } });
    return tx.session.deleteMany(args);
  }) as ReturnType<typeof original>);
  expect(await adapter.getSessionAndUser!("raw")).toBeNull(); spy.mockRestore();
  expect(await prisma.session.count()).toBe(1);
});
it("expired OAuth cookie cannot attach the new identity to its former user", async () => {
  const adapter = credentialAdapter(prisma);
  const user = await adapter.createUser!({ id: "ignored", email: "original@example.com", emailVerified: null });
  await adapter.linkAccount!({ userId: user.id, provider: "github", providerAccountId: "original", type: "oauth" });
  await adapter.createSession!({ sessionToken: "expired", userId: user.id, expires: new Date(0) });
  const response = await fakeAuth("google", "newcomer").GET(new NextRequest("http://localhost/api/auth/callback/google?code=fixture", { headers: { cookie: "authjs.session-token=expired" } }));
  expect(response.headers.get("location")).toBe("http://localhost");
  const linked = await prisma.account.findUniqueOrThrow({ where: { provider_providerAccountId: { provider: "google", providerAccountId: "newcomer" } } });
  expect(linked.userId).not.toBe(user.id);
  expect(await prisma.account.count({ where: { userId: user.id } })).toBe(1);
});
it("personal-data consumers decrypt on the server and omit ciphertext, lookups and other projects", async () => {
  await legacy(); await convertCredentials(prisma, { mode: "backfill", ...cutover });
  const { loadMembers, loadPendingInvitations } = await import("@/lib/auth/query");
  const { loadSyncRuns } = await import("@/lib/sync/query");
  const { loadActors } = await import("@/lib/keys/query");
  await prisma.syncRun.create({ data: { projectId: ids.p1, trigger: "MANUAL", status: "SUCCEEDED", requestedBy: ids.u1 } });
  const members = await loadMembers(prisma, ids.p1);
  const invitations = await loadPendingInvitations(prisma, ids.p1, new Date("2026-01-01"));
  const logs = await loadSyncRuns(prisma, ids.p1, undefined);
  expect(members[0]).toMatchObject({ name: "Alice" });
  expect(invitations[0]).toMatchObject({ invitedByName: "Alice" });
  expect(logs.rows[0]?.requester).toMatchObject({ name: "Alice" });
  expect((await loadSyncRuns(prisma, "another-project", undefined)).rows).toEqual([]);
  const json = JSON.stringify({ members, invitations, logs });
  for (const secret of ["enc:v1:", "hmac:v1:", "alice@example.com", "bob@example.com"]) expect(json).not.toContain(secret);
  expect((await loadActors(prisma, [ids.u1])).get(ids.u1)?.name).toBe("Alice");
  /**
   * ⚠️ **행 하나가 못 열려도 목록은 산다** (2026-09-10 credential 리뷰). 전에는 여기서 세 로더가
   * 모두 거부했는데, 전환 중에는 **부분 변환이 정상 상태**이고(backfill이 행 단위 CAS다) 키 회전
   * 뒤에는 옛 세대가 남는다 — 그때 멤버 아홉이 멀쩡한데 화면이 통째로 500이 된다.
   *
   * ⚠️ **`null`(정보 없음)로 접지도 않는다.** 못 읽은 행은 자기 문구를 들고, 이름은 비운다 —
   * 옛 값을 그럴듯하게 보여줄 자리가 없다.
   */
  await prisma.user.update({ where: { id: ids.u1 }, data: { name: "damaged" } });
  const damaged = await loadMembers(prisma, ids.p1);
  expect(damaged.find(r => r.userId === ids.u1)).toMatchObject({ name: null, emailLabel: "Unavailable" });
  expect((await loadSyncRuns(prisma, ids.p1, undefined)).rows[0]?.requester).toMatchObject({ name: null, emailLabel: "Unavailable" });
  // 편집자 지도에서는 **빠진다** — `actorLabel`이 그때 `updatedBy` 원문을 내므로 셀이 비지 않는다.
  expect((await loadActors(prisma, [ids.u1])).has(ids.u1)).toBe(false);
  expect(JSON.stringify(damaged)).not.toContain("enc:v1:");

  /** ⚠️ **키 자체가 없으면 장애다** — 행의 손상과 달리 여기서는 던져야 "전원 정보 없음"이 안 된다. */
  vi.stubEnv("PII_ENCRYPTION_KEYS", "");
  await expect(loadMembers(prisma, ids.p1)).rejects.toThrow("credential storage unavailable");
  await expect(loadSyncRuns(prisma, ids.p1, undefined)).rejects.toThrow("credential storage unavailable");
  await expect(loadActors(prisma, [ids.u1])).rejects.toThrow("credential storage unavailable");
  vi.unstubAllEnvs();
});
it("installed Auth.js preserves SessionTokenError outage classification on crypto failure", async () => {
  const handlers = fakeAuth("github", "outage");
  const response = await handlers.GET(new NextRequest("http://localhost/api/auth/callback/github?code=fixture"));
  const cookie = response.headers.getSetCookie().find(v => v.startsWith("authjs.session-token="))!.split(";")[0]!;
  await prisma.user.updateMany({ data: { email: "damaged" } });
  const result = await withOutageFlag(() => handlers.GET(new NextRequest("http://localhost/api/auth/session", { headers: { cookie } })));
  expect(result.outage).toBe(true);
  expect(await result.value.json()).toBeNull();
});
it("R1 adds nullable lookups to existing legacy rows without changing old writer behavior", async () => {
  await pool.query('ALTER TABLE "User" DROP COLUMN "emailLookup"; ALTER TABLE "ProjectInvitation" DROP COLUMN "emailLookup"');
  await pool.query('INSERT INTO "User" (id,email,name) VALUES ($1,$2,$3)', ["legacy-existing", "legacy@example.com", "Legacy"]);
  await pool.query(readFileSync("prisma/migrations/20260910050000_add_email_lookup/migration.sql", "utf8"));
  expect(await prisma.user.findUnique({ where: { id: "legacy-existing" } })).toMatchObject({ name: "Legacy", email: "legacy@example.com", emailLookup: null });
  await pool.query('UPDATE "User" SET name=$1 WHERE email=$2', ["Old writer", "legacy@example.com"]);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: "legacy-existing" } })).name).toBe("Old writer");
});
it("actual Prisma R1/R2 deploy records failed finalize and resumes only after verified rollback", async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const migrations = join(directory, "migrations");
  mkdirSync(migrations);
  // ⚠️ finalize는 **아래에서** 넣는다 — 처음부터 넣으면 R1 deploy가 그것까지 적용해 "실패한 R2"를 못 만든다.
  for (const name of readdirSync("prisma/migrations")) {
    if (name === FINALIZE_MIGRATION) continue;
    cpSync(join("prisma/migrations", name), join(migrations, name), { recursive: true });
  }
  const configPath = join(directory, "prisma.config.ts");
  writeFileSync(configPath, `export default ${JSON.stringify({ schema: join(process.cwd(), "prisma/schema.prisma"), migrations: { path: migrations }, datasource: { url: `postgresql://postgres@localhost:55479/postgres?host=${encodeURIComponent(directory)}` } })};\n`);
  const run = (...args: string[]) => execFileSync("pnpm", ["exec", "prisma", "migrate", ...args, "--config", configPath], { stdio: "pipe" });
  run("deploy");
  await legacy();
  const name = "20260910060000_finalize_credential_storage";
  cpSync(join("prisma/credential-cutover", name), join(migrations, name), { recursive: true });
  expect(() => run("deploy")).toThrow();
  const failed = await pool.query('SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1', [name]);
  expect(failed.rows).toEqual([{ finished_at: null, rolled_back_at: null }]);
  const ddl = await pool.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='emailLookup'");
  expect(ddl.rows).toEqual([{ is_nullable: "YES" }]);
  const index = await pool.query("SELECT count(*)::int AS count FROM pg_indexes WHERE indexname='User_email_key'");
  expect(index.rows[0].count).toBe(1);
  // Resolve only after comparing the failed history with the rolled-back DDL above.
  run("resolve", "--rolled-back", name);
  await convertCredentials(prisma, { mode: "backfill", ...cutover });
  run("deploy");
  const finished = await pool.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL', [name]);
  expect(finished.rows[0].count).toBe(1);
  expect(await convertCredentials(prisma, { mode: "verify" })).toMatchObject({ changes: 0 });
  expect(await prisma.projectMember.count()).toBe(1);
});

async function revocationFixture(provider: "github" | "google" = "github") {
  const adapter = credentialAdapter(prisma);
  const user = await adapter.createUser!({ id: "ignored", email: "revoke@example.com", emailVerified: null });
  const other = await adapter.createUser!({ id: "ignored", email: "other@example.com", emailVerified: null });
  await adapter.linkAccount!({ userId: user.id, provider, providerAccountId: "same", type: "oauth" });
  for (const raw of ["current", "second-device"]) await adapter.createSession!({ userId: user.id, sessionToken: raw, expires: new Date(Date.now() + 600000) });
  await adapter.createSession!({ userId: other.id, sessionToken: "other-device", expires: new Date(Date.now() + 600000) });
  const input = { userId: user.id, provider, providerAccountId: "same", sessionToken: "current", state: "state", nonce: randomBytes(32).toString("base64url") };
  return { user, other, input, adapter };
}
it("revocation atomically consumes one challenge, preserves another user and rejects replay", async () => {
  const { input, other, adapter } = await revocationFixture();
  expect(await beginRevocation(prisma, input)).toBe("ready");
  const outcomes = await Promise.all([finishRevocation(prisma, input), finishRevocation(prisma, input)]);
  expect(outcomes.sort()).toEqual(["invalid", "revoked"]);
  expect(await prisma.verificationToken.count()).toBe(0);
  expect(await prisma.session.findMany()).toEqual([expect.objectContaining({ userId: other.id })]);
  expect(await adapter.getSessionAndUser!("second-device")).toBeNull();
  expect(await prisma.user.count()).toBe(2);
  expect(await prisma.account.count()).toBe(1);
});
it("revocation database failure rolls back both one-use proof and all session deletion", async () => {
  const { input } = await revocationFixture();
  await beginRevocation(prisma, input);
  const before = await prisma.verificationToken.findMany();
  await pool.query(`CREATE FUNCTION fail_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private query data'; END $$;
    CREATE TRIGGER fail_session_delete BEFORE DELETE ON "Session" FOR EACH ROW EXECUTE FUNCTION fail_session_delete();`);
  expect(await finishRevocation(prisma, input)).toBe("unavailable");
  expect(await prisma.session.count()).toBe(3);
  expect(await prisma.verificationToken.findMany()).toEqual(before);
  await pool.query('DROP TRIGGER fail_session_delete ON "Session"');
  expect(await finishRevocation(prisma, input)).toBe("revoked");
});
it("new start replaces old intent but never removes another purpose or user's tokens", async () => {
  const { input } = await revocationFixture();
  await prisma.verificationToken.create({ data: { identifier: "email-verification", token: "other-purpose", expires: new Date(Date.now() + 100000) } });
  await beginRevocation(prisma, input);
  const next = { ...input, nonce: randomBytes(32).toString("base64url"), state: "new-state" };
  await beginRevocation(prisma, next);
  expect(await prisma.verificationToken.count()).toBe(2);
  expect(await finishRevocation(prisma, input)).toBe("invalid");
  expect(await finishRevocation(prisma, next)).toBe("revoked");
  expect(await prisma.verificationToken.findMany()).toEqual([expect.objectContaining({ identifier: "email-verification" })]);
});
async function startOAuthProof(provider: "github" | "google", identity = "same") {
  const fixture = await revocationFixture(provider);
  const handlers = fakeAuth(provider, identity, true);
  const csrf = await handlers.GET(new NextRequest("http://localhost/api/auth/csrf"));
  const csrfToken = (await csrf.json()).csrfToken;
  const csrfCookies = csrf.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const signin = await withRevocationStart(false, () => handlers.POST(new NextRequest(`http://localhost/api/auth/signin/${provider}?prompt=select_account`, { method: "POST", headers: { cookie: csrfCookies, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, callbackUrl: "http://localhost/account?sessionRevocation=expired" }) })));
  const authorize = new URL(signin.headers.get("location")!);
  expect(authorize.searchParams.get("prompt")).toBe("select_account");
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  const state = authorize.searchParams.get("state")!;
  expect(state).toBeTruthy();
  const input = { ...fixture.input, state };
  expect(await beginRevocation(prisma, input)).toBe("ready");
  const cookie = [...signin.headers.getSetCookie().map(c => c.split(";")[0]), `authjs.session-token=current`, `malmoi-session-revocation=${input.nonce}`].join("; ");
  const callback = (query = `code=fixture&state=${encodeURIComponent(state)}`, sentCookie = cookie) => handlers.GET(new NextRequest(`http://localhost/api/auth/callback/${provider}?${query}`, { headers: { cookie: sentCookie } }));
  return { ...fixture, handlers, input, cookie, callback };
}
it.each(["github", "google"] as const)("Auth.js %s state/PKCE callback revokes without minting any replacement session", async provider => {
  const { callback, handlers, other } = await startOAuthProof(provider);
  const response = await callback();
  expect(response.headers.get("location")).toBe("http://localhost/?sessions=revoked");
  expect(response.headers.getSetCookie().some(c => c.startsWith("authjs.session-token=") && c.includes("Max-Age=0"))).toBe(true);
  expect(await prisma.session.findMany()).toEqual([expect.objectContaining({ userId: other.id })]);
  expect(await prisma.user.count()).toBe(2);
  expect(await prisma.account.count()).toBe(1);
  const old = await handlers.GET(new NextRequest("http://localhost/api/auth/session", { headers: { cookie: "authjs.session-token=second-device" } }));
  expect(await old.json()).toBeNull();
  expect((await callback()).headers.get("location")).toBe("http://localhost/account?sessionRevocation=invalid");
});
it("Auth.js callback from a different provider identity cannot revoke, create or link an account", async () => {
  const { callback } = await startOAuthProof("github", "different");
  expect((await callback()).headers.get("location")).toBe("http://localhost/account?sessionRevocation=wrong-account");
  expect(await prisma.session.count()).toBe(3);
  expect(await prisma.user.count()).toBe(2);
  expect(await prisma.account.count()).toBe(1);
});
it.each(["bad-state", "cancelled", "expired", "session-changed"])("Auth.js %s leaves existing sessions intact and never reports success", async failure => {
  const { callback, cookie } = await startOAuthProof("github");
  if (failure === "expired") await prisma.verificationToken.updateMany({ data: { expires: new Date(0) } });
  const response = failure === "bad-state" ? await callback("code=fixture&state=forged")
    : failure === "cancelled" ? await callback("error=access_denied")
    : failure === "session-changed" ? await callback(undefined, cookie.replace("authjs.session-token=current", "authjs.session-token=second-device")) : await callback();
  expect(response.headers.get("location")).not.toContain("sessions=revoked");
  expect(await prisma.session.count()).toBe(3);
  expect(await prisma.user.count()).toBe(2);
  expect(await prisma.account.count()).toBe(1);
});

it("missing nonce cookie cannot turn a revocation OAuth callback into a new login", async () => {
  const { callback, cookie } = await startOAuthProof("github", "different");
  const before = await prisma.user.findMany();
  // Leave state/PKCE intact but remove both the app session and intent cookie: normal auth would sign up.
  const missing = cookie.split("; ").filter(c => !c.startsWith("malmoi-session-revocation=") && !c.startsWith("authjs.session-token=") && !c.startsWith("authjs.callback-url=")).join("; ");
  const response = await callback(undefined, missing);
  expect(response.headers.get("location")).toContain("sessionRevocation=invalid");
  expect(await prisma.user.findMany()).toEqual(before);
  expect(await prisma.account.count()).toBe(1);
  expect(await prisma.session.count()).toBe(3);
});

it.each(["replaced", "consumed"])("a %s proof cannot lose its OAuth purpose when intent cookies disappear", async removed => {
  const { callback, cookie, input } = await startOAuthProof("github", "different");
  if (removed === "replaced") await beginRevocation(prisma, { ...input, nonce: randomBytes(32).toString("base64url"), state: "next" });
  else expect(await finishRevocation(prisma, input)).toBe("revoked");
  const beforeUsers = await prisma.user.findMany();
  const beforeSessions = await prisma.session.findMany();
  const missing = cookie.split("; ").filter(c => !c.startsWith("malmoi-session-revocation=") && !c.startsWith("authjs.session-token=") && !c.startsWith("authjs.callback-url=") && !c.startsWith("malmoi-revocation-state=")).join("; ");
  const response = await callback(undefined, missing);
  expect(response.headers.get("location")).not.toContain("sessions=revoked");
  expect(await prisma.user.findMany()).toEqual(beforeUsers);
  expect(await prisma.session.findMany()).toEqual(beforeSessions);
  expect(await prisma.account.count()).toBe(1);
});

it("renaming encrypted revocation state to an ordinary state cookie cannot turn it into login", async () => {
  const { callback, cookie } = await startOAuthProof("github", "different");
  const before = await prisma.user.findMany();
  await prisma.verificationToken.deleteMany();
  const renamed = cookie.split("; ").filter(c => !c.startsWith("malmoi-session-revocation=") && !c.startsWith("authjs.session-token=") && !c.startsWith("authjs.callback-url=")).map(c => c.replace(/^malmoi-revocation-state=/, "authjs.state=")).join("; ");
  const response = await callback(undefined, renamed);
  expect(response.headers.get("location")).toContain("error=");
  expect(await prisma.user.findMany()).toEqual(before);
  expect(await prisma.session.count()).toBe(3);
});
it.each(["/projects", "/invite/invite-token"])("normal OAuth login returns to %s after an abandoned revocation and cookie cleanup", async destination => {
  const { handlers, cookie } = await startOAuthProof("github");
  // The root Server Action's four cookie deletions are behavior-tested in normal-login.test.tsx.
  const clean = cookie.split("; ").filter(c => !/^(malmoi-session-revocation|malmoi-revocation-state|authjs.session-token)=/.test(c)).join("; ");
  const csrf = await handlers.GET(new NextRequest("http://localhost/api/auth/csrf", { headers: { cookie: clean } }));
  const csrfToken = (await csrf.json()).csrfToken;
  const jar = [clean, ...csrf.headers.getSetCookie().map(c => c.split(";")[0])].join("; ");
  const signin = await handlers.POST(new NextRequest("http://localhost/api/auth/signin/github", { method: "POST", headers: { cookie: jar, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, callbackUrl: `http://localhost${destination}` }) }));
  const state = new URL(signin.headers.get("location")!).searchParams.get("state")!;
  const nextCookies = signin.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  expect(nextCookies).toContain("authjs.state=");
  expect(nextCookies).not.toContain("malmoi-revocation-state=");
  const response = await handlers.GET(new NextRequest(`http://localhost/api/auth/callback/github?code=fixture&state=${encodeURIComponent(state)}`, { headers: { cookie: nextCookies } }));
  expect(response.headers.get("location")).toBe(`http://localhost${destination}`);
  expect(await prisma.session.count()).toBe(4);
  expect(await prisma.user.count()).toBe(2);
});
