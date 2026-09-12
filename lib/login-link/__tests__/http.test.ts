import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";

const finish = vi.hoisted(() => vi.fn());
vi.mock("../store", () => ({ finishLink: finish }));
import { authorizeLoginLink, linkAuthCookies, withLinkStart, withLoginLink } from "../http";

const db = {} as PrismaClient;
const account = { provider: "github", providerAccountId: "gh" };
const dest = { kind: "invite" as const, token: "inv" };
const request = (path = "/api/auth/callback/github?state=s", cookie = "malmoi-login-link=raw-challenge") =>
  new NextRequest(`http://localhost${path}`, { headers: { cookie } });

it("일반 로그인과 무관한 auth 라우트는 그대로 지나간다", async () => {
  for (const req of [request(undefined, ""), request("/api/auth/session")]) {
    const response = new Response(null, { status: 204 });
    expect(
      await withLoginLink(req, async () => {
        expect(await authorizeLoginLink(db, account)).toBeNull();
        return response;
      }),
    ).toBe(response);
  }
});

it("확인이 성공하면 로그인을 계속 진행시키고 challenge의 복귀 지점으로 착지한다", async () => {
  finish.mockResolvedValue({ outcome: "linked", dest });
  const response = await withLoginLink(request(), async () => {
    // ⚠️ **`true`다** — 세션이 그때 생겨야 초대 수락으로 이어진다.
    expect(await authorizeLoginLink(db, account)).toBe(true);
    return Response.redirect("http://localhost/projects");
  });
  expect(finish).toHaveBeenLastCalledWith(db, { challengeToken: "raw-challenge", confirming: account });
  expect(response.headers.get("location")).toBe("http://localhost/invite/inv");
  expect(response.headers.getSetCookie().some((c) => c.startsWith("malmoi-login-link=") && c.includes("Max-Age=0"))).toBe(true);
});

it("확인이 실패하면 세션을 만들지 않고 같은 화면으로 되돌린다", async () => {
  finish.mockResolvedValue({ outcome: "wrong-account", dest });
  const response = await withLoginLink(request(), async () => {
    const url = await authorizeLoginLink(db, account);
    expect(url).toBe("/signin/link/raw-challenge?e=wrong-account");
    return Response.redirect(`http://localhost${url as string}`);
  });
  expect(response.headers.get("location")).toBe("http://localhost/signin/link/raw-challenge?e=wrong-account");
  expect(response.headers.getSetCookie().some((c) => c.startsWith("authjs.session-token="))).toBe(false);
});

it("만료는 이 화면을 다시 그리지 않는다", async () => {
  finish.mockResolvedValue({ outcome: "expired", dest });
  const response = await withLoginLink(request(), async () => {
    expect(await authorizeLoginLink(db, account)).toBe("/signin?error=LinkExpired");
    return new Response(null);
  });
  expect(response.headers.get("location")).toBe("http://localhost/signin?error=LinkExpired");
});

/**
 * ⚠️ **위조한 성공 URL이나 signIn 앞에서 난 Auth.js 오류가 성공이 되지 않는다** — 결과는 이
 * 핸들러 호출의 것이지 호출자가 고른 리다이렉트 URL의 것이 아니다.
 */
it("위조한 성공 URL과 이른 오류는 성공이 되지 않는다", async () => {
  for (const location of ["http://localhost/invite/inv", "http://localhost/signin?error=CallbackRouteError"]) {
    const response = await withLoginLink(request(), async () => Response.redirect(location));
    expect(response.headers.get("location")).toBe("http://localhost/signin/link/raw-challenge?e=unavailable");
    expect(response.headers.getSetCookie().some((c) => c.startsWith("authjs.session-token="))).toBe(false);
  }
});

it("provider에서 취소하면 장애와 갈리고 challenge가 살아 있다", async () => {
  const response = await withLoginLink(request("/api/auth/callback/github?error=access_denied"), async () =>
    Response.redirect("http://localhost/signin?error=AccessDenied"),
  );
  expect(response.headers.get("location")).toBe("http://localhost/signin/link/raw-challenge?e=cancelled");
});

it("동시 요청이 결과를 공유하지 않는다", async () => {
  finish.mockImplementation(async (_db: unknown, input: { confirming: { providerAccountId: string } }) =>
    input.confirming.providerAccountId === "gh" ? { outcome: "linked", dest } : { outcome: "wrong-account", dest },
  );
  const responses = await Promise.all(
    ["gh", "other"].map((providerAccountId) =>
      withLoginLink(request(), async () => {
        const result = await authorizeLoginLink(db, { ...account, providerAccountId });
        return Response.redirect(typeof result === "string" ? `http://localhost${result}` : "http://localhost/projects");
      }),
    ),
  );
  expect(responses.map((r) => r.headers.get("location"))).toEqual([
    "http://localhost/invite/inv",
    "http://localhost/signin/link/raw-challenge?e=wrong-account",
  ]);
});

it("state 쿠키만 남아도 intent로 읽어 일반 로그인이 되지 않는다", async () => {
  finish.mockResolvedValue({ outcome: "invalid", dest: null });
  const response = await withLoginLink(request(undefined, "malmoi-link-state=encrypted"), async () => {
    expect(await authorizeLoginLink(db, account)).toBe("/signin?error=LinkExpired");
    return new Response(null);
  });
  expect(response.headers.get("location")).toBe("http://localhost/signin?error=LinkExpired");
});

it("HTTPS 프록시는 secure 쿠키를 읽고 secure 이름으로 지운다", async () => {
  finish.mockResolvedValue({ outcome: "linked", dest: { kind: "projects" } });
  const req = new NextRequest("http://mal-moi.com/api/auth/callback/github?state=s", {
    headers: { "x-forwarded-proto": "https", cookie: "__Host-malmoi-login-link=secure-challenge" },
  });
  const response = await withLoginLink(req, async () => {
    await authorizeLoginLink(db, account);
    return new Response(null);
  });
  expect(finish).toHaveBeenLastCalledWith(db, expect.objectContaining({ challengeToken: "secure-challenge" }));
  expect(response.headers.get("location")).toBe("https://mal-moi.com/projects");
  expect(response.headers.getSetCookie().some((c) => c.startsWith("__Host-malmoi-login-link=") && c.includes("Secure"))).toBe(true);
});

/**
 * ⚠️ **Auth.js는 state를 쿠키 이름을 salt로 암호화한다** — 이름이 갈려 있어야 이 왕복을
 * 일반 로그인으로 개명할 수 없다 (POSTMORTEM 2026-09-10).
 */
it("시작 스코프 밖에서는 state 쿠키 이름을 바꾸지 않는다", async () => {
  expect(linkAuthCookies()).toBeUndefined();
  const named = await withLinkStart(true, async () => linkAuthCookies());
  expect(named?.state.name).toBe("__Secure-malmoi-link-state");
  expect((await withLinkStart(false, async () => linkAuthCookies()))?.state.name).toBe("malmoi-link-state");
});
