import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  session: { status: "ok", userId: "u1" } as { status: "ok"; userId: string } | { status: "none" } | { status: "unavailable" },
  host: "localhost:3000" as string | null,
  issue: vi.fn(),
  deny: vi.fn(),
  read: vi.fn(),
  signOut: vi.fn(),
  log: vi.fn(),
}));
/** Next의 `redirect`처럼 던진다 — 호출부의 `try/catch`가 그것을 삼키면 테스트가 "unavailable"을 받아 red가 된다. */
class Redirect extends Error {
  constructor(readonly url: string) { super("NEXT_REDIRECT"); }
}
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Redirect(url); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(s.host === null ? {} : { host: s.host, "x-forwarded-proto": "http" }) }));
vi.mock("@/auth", () => ({ signOut: s.signOut }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => s.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/github-connect/log", () => ({ logFailure: s.log }));
vi.mock("@/lib/oauth-server/authorize", () => ({ issueAuthorizationCode: s.issue, denyAuthorizationRequest: s.deny, readAuthorizationRequest: s.read }));

import { authorizeOAuthRequest, checkOAuthRequest, denyOAuthRequest, switchOAuthAccount } from "../actions";

/**
 * `/oauth/authorize`의 Action (mcp-oauth design §4.2 · 핸드오프 §10.4). 보안 경계다:
 * - 세션을 **다시** 읽는다 — 무세션은 요청을 소비하지 않고 같은 요청의 로그인 화면으로(`e=signed-out`), 장애·허용 밖 origin은 명시 실패.
 * - 콜백 redirect는 코어가 `issued`·`denied`를 낸 경우에만이고 **try 밖**이다 — 안에 두면 Next의 redirect 예외가 "unavailable"로 삼켜진다.
 * - 요청이 없거나 끝났으면 같은 주소로 돌려보내 화면이 종료를 말한다.
 */

const VALID = { requestId: "req_1", expiresInDays: 90, grants: ["translation:write"], scope: { kind: "all" } };
const ENDPOINT = { issuer: "http://localhost:3000", resource: "http://localhost:3000/api/mcp" };
async function thrownUrl(run: () => Promise<unknown>): Promise<string | undefined> {
  try { await run(); } catch (error) { if (error instanceof Redirect) return error.url; throw error; }
  return undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  s.session = { status: "ok", userId: "u1" };
  s.host = "localhost:3000";
});

describe("authorizeOAuthRequest", () => {
  it("발급되면 코어가 준 콜백으로 redirect — 세션의 userId · 이 요청의 발급 환경으로 부른다", async () => {
    s.issue.mockResolvedValue({ status: "issued", redirect: "http://localhost:51234/callback?code=c&state=st" });
    expect(await thrownUrl(() => authorizeOAuthRequest(VALID))).toBe("http://localhost:51234/callback?code=c&state=st");
    expect(s.issue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      requestId: "req_1", userId: "u1", endpoint: ENDPOINT, consent: { expiresInDays: 90, grants: ["translation:write"], scope: { kind: "all" } },
    }));
  });

  it("무세션 → 같은 요청의 로그인 화면(e=signed-out) · 코어를 부르지 않는다(요청 소비 없음)", async () => {
    s.session = { status: "none" };
    expect(await thrownUrl(() => authorizeOAuthRequest(VALID))).toBe("/oauth/authorize?request=req_1&e=signed-out");
    expect(s.issue).not.toHaveBeenCalled();
  });

  it("세션 장애 · 허용 밖 origin → unavailable · 코어를 부르지 않는다", async () => {
    s.session = { status: "unavailable" };
    expect(await authorizeOAuthRequest(VALID)).toEqual({ ok: false, reason: "unavailable" });
    s.session = { status: "ok", userId: "u1" };
    s.host = "evil.test";
    expect(await authorizeOAuthRequest(VALID)).toEqual({ ok: false, reason: "unavailable" });
    expect(s.issue).not.toHaveBeenCalled();
  });

  it("입력 모양이 틀리면 invalid — 세션·코어를 보기 전에", async () => {
    for (const bad of [null, { ...VALID, requestId: "" }, { ...VALID, scope: { kind: "some" } }, { ...VALID, grants: "x" }]) {
      expect(await authorizeOAuthRequest(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(s.issue).not.toHaveBeenCalled();
  });

  it("코어의 동의 입력 거부는 invalid · 코어 장애는 unavailable(로그) — 둘 다 redirect 없음", async () => {
    s.issue.mockResolvedValueOnce({ status: "invalid", field: "scope" });
    expect(await authorizeOAuthRequest(VALID)).toEqual({ ok: false, reason: "invalid" });
    s.issue.mockRejectedValueOnce(new Error("db down"));
    expect(await authorizeOAuthRequest(VALID)).toEqual({ ok: false, reason: "unavailable" });
    expect(s.log).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "expired", "consumed"])("요청이 %s면 같은 주소로 — 화면이 종료를 말한다(콜백으로 가지 않는다)", async (reason) => {
    s.issue.mockResolvedValue({ status: "unavailable", reason });
    expect(await thrownUrl(() => authorizeOAuthRequest(VALID))).toBe("/oauth/authorize?request=req_1");
  });
});

describe("denyOAuthRequest", () => {
  it("거부되면 코어가 준 콜백(access_denied)으로 redirect", async () => {
    s.deny.mockResolvedValue({ status: "denied", redirect: "http://localhost:51234/callback?error=access_denied&state=st" });
    expect(await thrownUrl(() => denyOAuthRequest("req_1"))).toBe("http://localhost:51234/callback?error=access_denied&state=st");
    expect(s.deny).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ requestId: "req_1", endpoint: ENDPOINT }));
  });

  it("무세션 → 로그인 화면 · 장애/허용 밖 origin → unavailable · 모양이 틀리면 invalid — 코어 호출 없음", async () => {
    s.session = { status: "none" };
    expect(await thrownUrl(() => denyOAuthRequest("req_1"))).toBe("/oauth/authorize?request=req_1&e=signed-out");
    s.session = { status: "unavailable" };
    expect(await denyOAuthRequest("req_1")).toEqual({ ok: false, reason: "unavailable" });
    s.session = { status: "ok", userId: "u1" };
    s.host = null;
    expect(await denyOAuthRequest("req_1")).toEqual({ ok: false, reason: "unavailable" });
    expect(await denyOAuthRequest(42)).toEqual({ ok: false, reason: "invalid" });
    expect(s.deny).not.toHaveBeenCalled();
  });

  it("코어 장애는 unavailable · 끝난 요청은 같은 주소", async () => {
    s.deny.mockRejectedValueOnce(new Error("db down"));
    expect(await denyOAuthRequest("req_1")).toEqual({ ok: false, reason: "unavailable" });
    s.deny.mockResolvedValueOnce({ status: "unavailable", reason: "consumed" });
    expect(await thrownUrl(() => denyOAuthRequest("req_1"))).toBe("/oauth/authorize?request=req_1");
  });
});

describe("checkOAuthRequest", () => {
  it("대기 → pending · 끝남 → ended · 장애 → unavailable — 읽기만 한다", async () => {
    s.read.mockResolvedValueOnce({ status: "ok", request: {} });
    expect(await checkOAuthRequest("req_1")).toEqual({ status: "pending" });
    s.read.mockResolvedValueOnce({ status: "unavailable", reason: "consumed" });
    expect(await checkOAuthRequest("req_1")).toEqual({ status: "ended" });
    s.read.mockRejectedValueOnce(new Error("db down"));
    expect(await checkOAuthRequest("req_1")).toEqual({ status: "unavailable" });
    expect(s.read).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ requestId: "req_1", endpoint: ENDPOINT }));
    expect(s.issue).not.toHaveBeenCalled();
    expect(s.deny).not.toHaveBeenCalled();
  });

  it("모양이 틀리거나 허용 밖 origin이면 ended — 조회하지 않는다", async () => {
    expect(await checkOAuthRequest("")).toEqual({ status: "ended" });
    s.host = "evil.test";
    expect(await checkOAuthRequest("req_1")).toEqual({ status: "ended" });
    expect(s.read).not.toHaveBeenCalled();
  });
});

describe("switchOAuthAccount", () => {
  it("로그아웃 뒤 같은 요청의 로그인 화면(e=switch) — 모양이 틀리면 /signin", async () => {
    await switchOAuthAccount("req_1");
    expect(s.signOut).toHaveBeenCalledWith({ redirectTo: "/oauth/authorize?request=req_1&e=switch" });
    await switchOAuthAccount({});
    expect(s.signOut).toHaveBeenLastCalledWith({ redirectTo: "/signin" });
  });
});
