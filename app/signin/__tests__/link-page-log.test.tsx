import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/login-link/view", () => ({ loadChallengeView: state.load }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import Page from "../link/[challenge]/page";

/**
 * 조회 장애는 `Unavailable`로 접혀 로그인 화면으로 간다 — 원인을 볼 곳이 서버 로그 한 줄뿐이다 (launch-readiness L5.2).
 */
let log: { mock: { calls: unknown[][] }; mockRestore: () => void };
beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => log.mockRestore());
const input = { params: Promise.resolve({ challenge: "raw" }), searchParams: Promise.resolve({}) };

it("challenge 조회 장애는 분류 한 줄, 만료는 0줄", async () => {
  state.load.mockResolvedValue(null);
  await expect(Page(input)).rejects.toThrow("REDIRECT:/signin?error=LinkExpired");
  expect(log).not.toHaveBeenCalled();
  state.load.mockRejectedValue(new Error("secret row"));
  await expect(Page(input)).rejects.toThrow("REDIRECT:/signin?error=Unavailable");
  expect(log.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^\[login-link\] \w{8} page: Error$/)]);
});
