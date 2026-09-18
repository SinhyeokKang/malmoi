import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { withConnect, withConnectStart, connectAuthCookies, authorizeConnect } from "../http";
const finish = vi.hoisted(() => vi.fn());
vi.mock("../store", () => ({ finishConnect: finish }));
const request = (query = "code=ok&state=state", cookie = "malmoi-account-connect=nonce; authjs.session-token=raw") => new NextRequest(`http://localhost/api/auth/callback/google?${query}`, { headers: { cookie } });
beforeEach(() => { vi.clearAllMocks(); finish.mockResolvedValue("connected"); });
afterEach(() => vi.restoreAllMocks());
it("일반 로그인은 그대로 통과하며 state 스코프가 새지 않는다", async () => {
  const run = vi.fn().mockResolvedValue(new Response("ordinary"));
  expect(await (await withConnect(request("", ""), run)).text()).toBe("ordinary");
  expect(connectAuthCookies()).toBeUndefined();
  await withConnectStart(false, async () => expect(connectAuthCookies()?.state.name).toBe("malmoi-connect-state"));
  expect(connectAuthCookies()).toBeUndefined();
});
it("연결은 세션 쿠키를 보존하고 고정 착지로 끝내며 넓은 OAuth 객체를 좁힌다", async () => {
  const response = await withConnect(request(), async () => {
    expect(connectAuthCookies()?.state.name).toBe("malmoi-connect-state");
    // @ts-expect-error OAuth 어댑터 객체의 여분 토큰은 저장 경계에 보내지 않는다.
    expect(await authorizeConnect({} as never, { provider: "google", providerAccountId: "g", access_token: "secret" }, "verified@example.com")).toBe("/account?connect=connected");
    return new Response(null, { headers: { location: "https://evil.test" } });
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost/account?connect=connected");
  expect(finish.mock.calls[0]![1]).toEqual({ nonce: "nonce", sessionToken: "raw", state: "state", provider: "google", providerAccountId: "g", verifiedEmail: "verified@example.com" });
  expect(response.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  expect(response.headers.getSetCookie().join(";")).not.toContain("authjs.session-token");
});
it.each([["error=access_denied", "cancelled"], ["state=wrong", "failed"]])("signIn 전 실패 %s도 카드로 돌아간다", async (query, outcome) => {
  const response = await withConnect(request(query), async () => { throw new Error("secret"); });
  expect(response.headers.get("location")).toBe(`http://localhost/account?connect=${outcome}`);
});
it("nonce가 사라져도 state 쿠키는 연결 목적을 유지한다", async () => {
  const response = await withConnect(request("", "malmoi-connect-state=encrypted"), async () => new Response());
  expect(response.headers.get("location")).toBe("http://localhost/account?connect=failed");
});
// 형식(ref·분류)의 정본은 `lib/__tests__/oauth-callback-contract.test.ts` — 여기선 원문이 새지 않는 것만 본다.
it("callback crashes leave one classified line without OAuth exception details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await withConnect(request(), async () => { throw new Error("OAuth secret"); });
  expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^\[account-connect\] \w{8} callback: Error$/));
});
