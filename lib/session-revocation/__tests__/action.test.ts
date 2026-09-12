import { beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ requireUser: vi.fn(), signIn: vi.fn(), begin: vi.fn(), accounts: vi.fn(), set: vi.fn(), get: vi.fn(), headers: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: s.signIn }));
vi.mock("@/lib/auth/session", () => ({ requireUser: s.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ account: { findMany: s.accounts } }) }));
vi.mock("../store", () => ({ beginRevocation: s.begin }));
// 병합 쿠키 정리는 이 테스트의 대상이 아니다 — `exclusive.test.ts`가 그 순서를 따로 센다.
vi.mock("@/lib/login-link/clear-cookies", () => ({ clearLinkCookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: s.get, set: s.set }), headers: s.headers }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { startSessionRevocation } from "@/app/(edit)/account/actions";
beforeEach(() => {
  vi.clearAllMocks();
  s.requireUser.mockResolvedValue({ userId: "u" });
  s.accounts.mockResolvedValue([{ provider: "github", providerAccountId: "gh" }]);
  s.get.mockReturnValue({ value: "raw" });
  s.headers.mockResolvedValue(new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }));
  s.signIn.mockResolvedValue("https://github.com/login/oauth/authorize?state=fresh");
  s.begin.mockResolvedValue("ready");
});
it("server derives identity, requests account selection and redirects only after storing proof", async () => {
  await expect(startSessionRevocation()).rejects.toThrow("REDIRECT:https://github.com");
  expect(s.signIn).toHaveBeenCalledWith("github", { redirect: false, redirectTo: "/account?sessionRevocation=expired" }, { prompt: "select_account" });
  expect(s.begin).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "u", sessionToken: "raw", state: "fresh", provider: "github", providerAccountId: "gh" }));
  expect(s.set).toHaveBeenCalledWith("malmoi-session-revocation", expect.stringMatching(/^[\w-]{43}$/), expect.objectContaining({ httpOnly: true, maxAge: 300 }));
  expect(s.begin.mock.invocationCallOrder[0]).toBeLessThan(s.set.mock.invocationCallOrder[0]!);
});
/** 수단이 둘이어도 회수가 시작된다 — 확인 상대는 서버가 결정적으로 고른다 (github 우선). */
it("two sign-in methods still start a proof, confirmed against github", async () => {
  s.accounts.mockResolvedValue([{ provider: "google", providerAccountId: "g" }, { provider: "github", providerAccountId: "gh" }]);
  await expect(startSessionRevocation()).rejects.toThrow("REDIRECT:https://github.com");
  expect(s.signIn).toHaveBeenCalledWith("github", expect.anything(), expect.anything());
  expect(s.begin).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: "github", providerAccountId: "gh" }));
});

it("missing authentication is never swallowed as an action error", async () => {
  s.requireUser.mockRejectedValue(new Error("REDIRECT:/"));
  await expect(startSessionRevocation()).rejects.toThrow("REDIRECT:/");
  expect(s.signIn).not.toHaveBeenCalled();
});
it.each(["no-cookie", "no-account", "missing-state", "store-failure", "bad-host"])("%s never starts a usable proof or leaks errors", async failure => {
  if (failure === "no-cookie") s.get.mockReturnValue(undefined);
  // ⚠️ **`multiple-accounts`가 갈래에서 빠졌다** (T6) — 수단이 둘이면 회수가 **멈추던** 조건이다.
  if (failure === "no-account") s.accounts.mockResolvedValue([{ provider: "github-app", providerAccountId: "app" }]);
  if (failure === "missing-state") s.signIn.mockResolvedValue("http://localhost:3000/?error=Configuration");
  if (failure === "store-failure") s.begin.mockResolvedValue("unavailable");
  if (failure === "bad-host") s.headers.mockResolvedValue(new Headers({ host: "evil.com" }));
  expect(await startSessionRevocation()).toEqual({ error: "unavailable" });
  expect(s.set).not.toHaveBeenCalled();
});
