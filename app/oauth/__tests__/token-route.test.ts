import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /oauth/token` (mcp-oauth design §1 · §5). 외부 계약이라 Route Handler다. 코어(`lib/oauth-server/token.ts`)는 주입하고 여기는
 * **응답 형**을 센다: RFC 6749 §5.1 성공 · §5.2 오류 · `Cache-Control: no-store`. ⚠️ DB 장애는 `server_error` 500이다 — `invalid_grant`로
 * 접으면 클라이언트가 연결을 버리고 재로그인을 시킨다. 쿠키를 읽지 않는다(`no-cookie-reads.test.ts`).
 */
const hoisted = vi.hoisted(() => ({ exchange: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/oauth-server/token", () => ({ exchangeAuthorizationCode: hoisted.exchange, refreshConnection: hoisted.refresh }));

const route = await import("../token/route");

const FORM = { "content-type": "application/x-www-form-urlencoded" };
const PROD = { host: "mal-moi.com", "x-forwarded-proto": "https" };
const post = (body: string, headers: Record<string, string> = { ...FORM, ...PROD }) =>
  route.POST(new Request("https://mal-moi.com/oauth/token", { method: "POST", headers, body }));
const tokens = { accessToken: "mlo_a", refreshToken: "mlr_r", accessExpiresAt: new Date(Date.now() + 3_600_000) };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.exchange.mockResolvedValue({ status: "ok", tokens });
  hoisted.refresh.mockResolvedValue({ status: "ok", tokens });
});

describe("세그먼트", () => {
  it("POST만 내보낸다", () => {
    expect(Object.keys(route).filter(k => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });
});

describe("성공", () => {
  it("authorization_code → 200 · 토큰 · no-store · 현재 엔드포인트를 코어에 넘긴다", async () => {
    const res = await post("grant_type=authorization_code&code=c&code_verifier=v&client_id=x");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ access_token: "mlo_a", token_type: "Bearer", refresh_token: "mlr_r" });
    expect(hoisted.exchange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: "c", codeVerifier: "v", clientId: "x" }),
      { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" }, expect.any(Date));
  });

  it("refresh_token → 코어의 refresh", async () => {
    const res = await post("grant_type=refresh_token&refresh_token=mlr_x&client_id=x");
    expect(res.status).toBe(200);
    expect(hoisted.refresh).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refreshToken: "mlr_x", clientId: "x" }), expect.anything(), expect.any(Date));
  });
});

describe("오류 — RFC 6749 §5.2", () => {
  it("코어의 invalid_grant → 400 { error: invalid_grant } · no-store", async () => {
    hoisted.exchange.mockResolvedValue({ status: "invalid_grant" });
    const res = await post("grant_type=authorization_code&code=c");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "invalid_grant" });
  });

  it("파싱 실패 → 400 invalid_request / unsupported_grant_type, 코어를 부르지 않는다", async () => {
    expect(await (await post("grant_type=authorization_code")).json()).toEqual({ error: "invalid_request" });
    expect(await (await post("grant_type=password")).json()).toEqual({ error: "unsupported_grant_type" });
    expect(await (await post('{"grant_type":"refresh_token"}', { "content-type": "application/json", ...PROD })).json()).toEqual({ error: "invalid_request" });
    expect(hoisted.exchange).not.toHaveBeenCalled();
    expect(hoisted.refresh).not.toHaveBeenCalled();
  });

  it("본문 상한 초과 → 400 invalid_request", async () => {
    const res = await post(`grant_type=refresh_token&refresh_token=${"x".repeat(9000)}`);
    expect(res.status).toBe(400);
    expect(hoisted.refresh).not.toHaveBeenCalled();
  });

  it("허용 밖 호스트 → 400 invalid_request — 발급 환경을 정할 수 없다", async () => {
    const res = await post("grant_type=refresh_token&refresh_token=mlr_x", { ...FORM, host: "evil.example", "x-forwarded-proto": "https" });
    expect(res.status).toBe(400);
    expect(hoisted.refresh).not.toHaveBeenCalled();
  });

  it("코어가 던지면(DB 장애) 500 server_error — invalid_grant로 접지 않고 예외 문구를 싣지 않는다", async () => {
    hoisted.refresh.mockRejectedValue(new Error("connect ECONNREFUSED 10.1.2.3:6543"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("grant_type=refresh_token&refresh_token=mlr_x");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "server_error" });
    expect(text).not.toContain("ECONNREFUSED");
  });
});
