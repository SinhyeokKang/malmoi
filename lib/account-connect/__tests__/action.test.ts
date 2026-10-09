import { afterEach, beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ requireUser: vi.fn(), signIn: vi.fn(), begin: vi.fn(), count: vi.fn(), clear: vi.fn(), set: vi.fn(), get: vi.fn(), headers: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: s.signIn }));
vi.mock("@/lib/auth/session", () => ({ requireUser: s.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ account: { count: s.count } }) }));
vi.mock("../store", () => ({ beginConnect: s.begin }));
vi.mock("@/lib/auth/roundtrip-cookies", () => ({ clearAuthRoundtripCookies: s.clear }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: s.get, set: s.set }), headers: s.headers }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { startLoginMethodConnect } from "@/app/(edit)/account/actions";
import { connectAuthCookies } from "../http";
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.resetAllMocks();
  s.requireUser.mockResolvedValue({ userId: "u" });
  s.count.mockResolvedValue(0);
  s.get.mockReturnValue({ value: "raw-session" });
  s.headers.mockResolvedValue(new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }));
  s.signIn.mockImplementation(async () => {
    expect(connectAuthCookies()?.state.name).toBe("malmoi-connect-state");
    return "https://github.com/login/oauth/authorize?state=fresh";
  });
  s.begin.mockResolvedValue("ready");
});
it("clears all purposes before signIn and persists session/state proof before redirect", async () => {
  await expect(startLoginMethodConnect("github")).rejects.toThrow("REDIRECT:https://github.com");
  expect(s.signIn).toHaveBeenCalledWith("github", { redirect: false, redirectTo: "/account?connect=expired" }, { prompt: "select_account" });
  expect(s.begin).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "u", provider: "github", sessionToken: "raw-session", state: "fresh" }));
  expect(s.set).toHaveBeenCalledWith("malmoi-account-connect", expect.stringMatching(/^[\w-]{43}$/), expect.objectContaining({ httpOnly: true, maxAge: 300 }));
  expect(s.clear.mock.invocationCallOrder[0]).toBeLessThan(s.signIn.mock.invocationCallOrder[0]!);
  expect(s.begin.mock.invocationCallOrder[0]).toBeLessThan(s.set.mock.invocationCallOrder[0]!);
  expect(connectAuthCookies()).toBeUndefined();
});
it("rejects a direct start for an already connected provider before OAuth", async () => {
  s.count.mockResolvedValue(1);
  await expect(startLoginMethodConnect("google")).rejects.toThrow("REDIRECT:/account?connect=already-connected");
  expect(s.count).toHaveBeenCalledWith({ where: { userId: "u", provider: "google" } });
  expect(s.signIn).not.toHaveBeenCalled();
});
it("keeps the authentication redirect outside error handling", async () => {
  s.requireUser.mockRejectedValue(new Error("REDIRECT:/signin"));
  await expect(startLoginMethodConnect("google")).rejects.toThrow("REDIRECT:/signin");
  expect(s.count).not.toHaveBeenCalled();
});
it.each(["invalid-provider", "missing-session", "missing-state", "store-failure", "bad-host", "db-error"])("%s cannot issue a usable challenge cookie", async failure => {
  if (failure === "missing-session") s.get.mockReturnValue(undefined);
  if (failure === "missing-state") s.signIn.mockResolvedValue("http://localhost:3000/api/auth/error?error=Configuration");
  if (failure === "store-failure") s.begin.mockResolvedValue("failed");
  if (failure === "bad-host") s.headers.mockResolvedValue(new Headers({ host: "evil.com" }));
  if (failure === "db-error") s.count.mockRejectedValue(new Error("private details"));
  await expect(startLoginMethodConnect(failure === "invalid-provider" ? "github-app" : "google")).rejects.toThrow("REDIRECT:/account?connect=failed");
  expect(s.set).not.toHaveBeenCalled();
  if (failure === "missing-state" || failure === "store-failure") expect(s.clear).toHaveBeenCalledTimes(2);
});
it("OAuth failure after writing state clears the abandoned purpose again", async () => {
  s.signIn.mockRejectedValue(new Error("provider secret"));
  await expect(startLoginMethodConnect("google")).rejects.toThrow("REDIRECT:/account?connect=failed");
  expect(s.clear).toHaveBeenCalledTimes(2);
  expect(s.set).not.toHaveBeenCalled();
});
it("failed OAuth initiation records only the fixed stage", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  s.signIn.mockRejectedValue(new Error("provider secret"));
  await expect(startLoginMethodConnect("google")).rejects.toThrow("REDIRECT:/account?connect=failed");
  expect(log).toHaveBeenCalledExactlyOnceWith("Account connect start failed.", { stage: "oauth", cause: "Error" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("provider secret");
});

/**
 * 꺼진 공급자로는 연결을 시작하지 않는다 (optional-login-providers spec §4.6) — 화면에 그 행이 없으므로 직접 Action 호출에서만 닿는다.
 * Auth.js `providers`에도 없지만, 그쪽에 닿기 전에 거부해 쿠키·challenge 행을 만들지 않는다.
 */
it("a disabled provider never starts OAuth, writes no challenge and no cookie", async () => {
  vi.stubEnv("AUTH_GITHUB_ID", "");
  try {
    await expect(startLoginMethodConnect("github")).rejects.toThrow("REDIRECT:/account?connect=failed");
    expect(s.signIn).not.toHaveBeenCalled();
    expect(s.begin).not.toHaveBeenCalled();
    expect(s.set).not.toHaveBeenCalled();
    expect(s.clear).not.toHaveBeenCalled();
    expect(s.count).not.toHaveBeenCalled();
    // 켜진 쪽은 그대로 시작한다.
    await expect(startLoginMethodConnect("google")).rejects.toThrow("REDIRECT:https://github.com");
  } finally {
    vi.unstubAllEnvs();
  }
});
