import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse, type NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { logCaught } from "@/lib/failure";
import { requestOrigin } from "@/lib/github-connect/origin";
import { finishRevocation } from "./store";
import { outcomeUrl, revocationCookie, revocationStateCookie, type Outcome } from "./policy";

type Attempt = { nonce: string; sessionToken: string; state: string; outcome?: Outcome };
// 결과는 이 핸들러 호출의 것이지, 호출자가 고른 리다이렉트 URL의 것이 아니다.
const pending = new AsyncLocalStorage<Attempt>();
const stateScope = new AsyncLocalStorage<boolean>();
export function withRevocationStart<T>(secure: boolean, run: () => Promise<T>): Promise<T> {
  return stateScope.run(secure, run);
}
export function revocationAuthCookies() {
  const secure = stateScope.getStore();
  return secure === undefined ? undefined : { state: revocationStateCookie(secure) };
}
export async function authorizeRevocation(prisma: PrismaClient, account: { provider: string; providerAccountId: string } | null | undefined): Promise<string | null> {
  const attempt = pending.getStore();
  if (!attempt) return null;
  attempt.outcome = account ? await finishRevocation(prisma, { ...attempt, ...account }) : "invalid";
  // 문자열을 돌려주면 Auth.js가 handleLoginOrRegister가 대체 세션을 만들기 전에 멈춘다.
  return outcomeUrl(attempt.outcome);
}
export async function withRevocation(request: NextRequest, run: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  if (!/^\/api\/auth\/callback\/(github|google)$/.test(url.pathname)) return run();
  const origin = requestOrigin({ host: request.headers.get("host") ?? url.host, forwardedProto: request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1) });
  const secure = origin?.secure ?? url.protocol === "https:";
  const cookie = revocationCookie(secure);
  const nonceCookie = request.cookies.get(revocationCookie(true).name) ?? request.cookies.get(revocationCookie(false).name);
  const state = url.searchParams.get("state") ?? "";
  // callback-url은 거부 표시일 뿐 인가의 증거가 아니다. 늦거나 소비된 왕복을 일반 로그인에서 떼어 둔다.
  const callback = request.cookies.get("__Secure-authjs.callback-url") ?? request.cookies.get("authjs.callback-url");
  let intent = nonceCookie !== undefined || request.cookies.has(revocationStateCookie(true).name) || request.cookies.has(revocationStateCookie(false).name);
  if (!intent && callback) {
    try {
      const target = new URL(decodeURIComponent(callback.value), url.origin);
      // ⚠️ **여기는 `routes.account()`를 부르지 않는다** — 만드는 쪽이 아니라 **읽는 쪽**이고,
      // 돌아온 URL을 우리가 만든 문자열과 비교하면 그 비교가 무엇을 확인하는지 흐려진다.
      // 계약은 `lib/routes.ts`의 `account({ sessionRevocation })`이고 이 값이 그 짝이다.
      intent = target.pathname === "/account" && target.searchParams.get("sessionRevocation") === "expired";
    } catch { /* 잘못된 목적지는 아무것도 인가하지 못한다 — Auth.js가 암호화된 state 쿠키를 여전히 검증한다. */ }
  }
  if (!intent) return run();
  const attempt: Attempt = {
    nonce: nonceCookie?.value ?? "",
    sessionToken: request.cookies.get(secure ? "__Secure-authjs.session-token" : "authjs.session-token")?.value ?? "",
    state,
  };
  return stateScope.run(secure, () => pending.run(attempt, async () => {
    let original: Response;
    try { original = await run(); }
    catch (error) {
      logCaught("session-revocation", "callback", error);
      original = new Response(null, { status: 500 });
    }
    const outcome = attempt.outcome ?? (url.searchParams.get("error") === "access_denied" ? "cancelled" : "unavailable");
    const headers = new Headers(original.headers);
    // 이 callback은 signIn 앞의 오류까지 포함해 언제나 우리가 정한 목적지 하나에서 끝난다.
    headers.delete("content-length"); headers.delete("content-type");
    headers.set("location", new URL(outcomeUrl(outcome), origin?.origin ?? url.origin).href);
    headers.set("cache-control", "no-store");
    const response = new NextResponse(null, { status: 303, headers });
    response.cookies.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
    const stateCookie = revocationStateCookie(secure);
    response.cookies.set(stateCookie.name, "", { ...stateCookie.options, maxAge: 0 });
    // ⚠️ secure 호스트에서도 non-secure 변형을 지운다 — 로컬로 시작한 왕복의 stale state가 남는다(L5.2 계약 테스트).
    if (secure) {
      response.cookies.set(revocationCookie(false).name, "", { ...revocationCookie(false).options, maxAge: 0 });
      response.cookies.set(revocationStateCookie(false).name, "", { ...revocationStateCookie(false).options, maxAge: 0 });
    }
    if (outcome === "revoked") {
      response.cookies.set("authjs.session-token", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
      if (secure) response.cookies.set("__Secure-authjs.session-token", "", { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 0 });
    }
    return response;
  }));
}
