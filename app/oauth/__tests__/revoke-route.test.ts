import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /oauth/revoke` (RFC 7009 · mcp-oauth design §6). 모르는 토큰도 200이다(§2.2) — 응답이 토큰의 존재를 말하지 않는다.
 * DB 장애는 500 `server_error`다(성공으로 말하면 클라이언트가 옛 토큰이 죽었다고 믿는다). Claude Code가 재인증 때 부른다(T1 실측).
 */
const hoisted = vi.hoisted(() => ({ revoke: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/oauth-server/revoke", () => ({ revokeToken: hoisted.revoke }));

const route = await import("../revoke/route");

const HEADERS = { "content-type": "application/x-www-form-urlencoded", host: "mal-moi.com", "x-forwarded-proto": "https" };
const post = (body: string, headers: Record<string, string> = HEADERS) => route.POST(new Request("https://mal-moi.com/oauth/revoke", { method: "POST", headers, body }));

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.revoke.mockResolvedValue(undefined);
});

describe("POST /oauth/revoke", () => {
  it("POST만 내보낸다", () => {
    expect(Object.keys(route).filter(k => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });

  it("token + client_id → 200 · 현재 엔드포인트로 코어를 부른다", async () => {
    const res = await post("token=mlr_x&token_type_hint=refresh_token&client_id=c");
    expect(res.status).toBe(200);
    expect(hoisted.revoke).toHaveBeenCalledWith(expect.anything(), { token: "mlr_x", clientId: "c" }, { issuer: "https://mal-moi.com", resource: "https://mal-moi.com/api/mcp" });
  });

  it("token·client_id 없음 → 400 invalid_request, 코어를 부르지 않는다", async () => {
    const res = await post("token=mlr_x");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(hoisted.revoke).not.toHaveBeenCalled();
  });

  it("허용 밖 호스트 → 400 invalid_request", async () => {
    expect((await post("token=mlr_x&client_id=c", { ...HEADERS, host: "evil.example" })).status).toBe(400);
    expect(hoisted.revoke).not.toHaveBeenCalled();
  });

  it("코어가 던지면 500 server_error", async () => {
    hoisted.revoke.mockRejectedValue(new Error("P1001"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("token=mlr_x&client_id=c");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
  });
});
