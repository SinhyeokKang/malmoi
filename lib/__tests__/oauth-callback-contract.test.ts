import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/session-revocation/store", () => ({ finishRevocation: vi.fn() }));
vi.mock("@/lib/account-connect/store", () => ({ finishConnect: vi.fn() }));
vi.mock("@/lib/login-link/store", () => ({ finishLink: vi.fn() }));
import { withRevocation } from "@/lib/session-revocation/http";
import { revocationCookie, revocationStateCookie } from "@/lib/session-revocation/policy";
import { withConnect } from "@/lib/account-connect/http";
import { connectCookie, connectStateCookie } from "@/lib/account-connect/policy";
import { withLoginLink } from "@/lib/login-link/http";
import { linkCookie, linkStateCookie } from "@/lib/login-link/policy";

/**
 * **OAuth 콜백 래퍼 셋의 실패 계약** (launch-readiness L5.2, audit #34).
 *
 * 셋은 같은 형(intent 쿠키 → AsyncLocalStorage → 303 고정 착지 + 쿠키 정리)인데 `run()`이 던질 때의 처리가
 * 각자 갈렸다 — 로그가 0줄/원문 없는 한 줄/0줄, `linkStateCookie(false)`·`revocationStateCookie(false)`는 secure일 때
 * 안 지워져 stale state가 남았다. **공유 추상화는 만들지 않는다**(목적·격리가 다르다) — 대신 이 테스트가 셋을 같은 입력으로 잰다.
 *
 * ⚠️ **대체 응답 상태는 500이다** — login-link의 `loginFailed`가 그 값을 소비하므로 200으로 맞추면 병합 뒤 장애가
 * 성공 착지로 덮인다(`lib/login-link/__tests__/http.test.ts`의 "throw" 갈래). 나머지 둘은 그 값을 안 읽지만 같게 둔다.
 */
type Wrapper = (request: NextRequest, run: () => Promise<Response>) => Promise<Response>;
type Cookie = (secure: boolean) => { name: string };
const WRAPPERS: { scope: string; wrap: Wrapper; nonce: Cookie; state: Cookie }[] = [
  { scope: "session-revocation", wrap: withRevocation, nonce: revocationCookie, state: revocationStateCookie },
  { scope: "account-connect", wrap: withConnect, nonce: connectCookie, state: connectStateCookie },
  { scope: "login-link", wrap: (request, run) => withLoginLink(request, () => run()), nonce: linkCookie, state: linkStateCookie },
];

let spy: { mock: { calls: unknown[][] }; mockRestore: () => void };
beforeEach(() => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => spy.mockRestore());
const lines = () => spy.mock.calls.map((call) => String(call[0]));

// 브라우저에 두 변형이 다 남을 수 있다 — 로컬(http)로 시작한 왕복이 secure 호스트에서 끝나거나 그 반대다.
const request = (w: (typeof WRAPPERS)[number]) => new NextRequest("https://localhost/api/auth/callback/github?state=s", {
  headers: { cookie: [w.nonce(true), w.nonce(false), w.state(true), w.state(false)].map((c) => `${c.name}=v`).join("; ") },
});
const cleared = (response: Response) =>
  response.headers.getSetCookie().filter((c) => /Max-Age=0/.test(c)).map((c) => c.slice(0, c.indexOf("=")));

describe.each(WRAPPERS)("$scope", (w) => {
  it("run()이 던지면 303 고정 착지 · 분류 한 줄(원문 없음) · nonce·state 쿠키 두 변형을 전부 지운다", async () => {
    const response = await w.wrap(request(w), async () => { throw new Error("secret prisma argument"); });
    expect(response.status).toBe(303);
    expect(lines()).toEqual([expect.stringMatching(new RegExp(`^\\[${w.scope}\\] \\w{8} callback: Error$`))]);
    expect(lines().join("\n")).not.toContain("secret");
    expect(cleared(response)).toEqual(expect.arrayContaining([w.nonce(true), w.nonce(false), w.state(true), w.state(false)].map((c) => c.name)));
  });

  it("run()이 응답을 돌려주면 로그 0줄이고 쿠키 정리는 같다", async () => {
    const response = await w.wrap(request(w), async () => Response.redirect("https://localhost/signin?error=CallbackRouteError"));
    expect(response.status).toBe(303);
    expect(lines()).toEqual([]);
    expect(cleared(response)).toEqual(expect.arrayContaining([w.nonce(true), w.nonce(false), w.state(true), w.state(false)].map((c) => c.name)));
  });

  /**
   * **판정 못 한 origin은 fail-closed다** (audit #78). 시작 셋은 `requestOrigin`이 `null`이면 쿠키를 심지 않고
   * 멈추는데(`/signin/link` · `startSessionRevocation` · `startAccountConnect`) callback만 `url.protocol`로
   * 떨어져 Auth.js를 돌렸다 — 두 판정이 갈리면 state 쿠키 이름이 어긋나 증상이 엉뚱한 곳에 난다(CLAUDE.md 2026-09-14).
   * 허용 목록 밖의 호스트에서 시작된 왕복은 우리가 시작한 것일 수 없으므로 Auth.js를 부르지 않고 착지한다.
   */
  it("허용 목록 밖의 호스트에서는 run()을 부르지 않고 303 착지 · 쿠키 두 변형 정리", async () => {
    const run = vi.fn(async () => new Response(null, { status: 302 }));
    const response = await w.wrap(new NextRequest("https://evil.example/api/auth/callback/github?state=s", { headers: request(w).headers }), run);
    expect(run).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).searchParams.toString()).not.toBe("");
    expect(cleared(response)).toEqual(expect.arrayContaining([w.nonce(true), w.nonce(false), w.state(true), w.state(false)].map((c) => c.name)));
  });

  it("짝: 허용된 호스트에서는 같은 요청이 run()을 부른다", async () => {
    const run = vi.fn(async () => new Response(null, { status: 302 }));
    await w.wrap(request(w), run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
