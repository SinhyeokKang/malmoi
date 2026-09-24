import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse, type NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { logCaught } from "@/lib/failure";
import { requestOrigin } from "@/lib/github-connect/origin";
import { routes } from "@/lib/routes";
import { connectCookie, connectStateCookie } from "./policy";
import { finishConnect } from "./store";
import type { ConnectOutcome } from "./plan";
import { sessionCookieName } from "@/lib/auth/cookie";
import { expireBothVariants, isOAuthCallback } from "@/lib/auth/roundtrip";

type Attempt = { nonce: string; sessionToken: string; state: string; outcome?: ConnectOutcome };
const pending = new AsyncLocalStorage<Attempt>();
const stateScope = new AsyncLocalStorage<boolean>();
export function withConnectStart<T>(secure: boolean, run: () => Promise<T>): Promise<T> { return stateScope.run(secure, run); }
export function connectAuthCookies() {
  const secure = stateScope.getStore();
  return secure === undefined ? undefined : { state: connectStateCookie(secure) };
}
export async function authorizeConnect(prisma: PrismaClient, account: { provider: string; providerAccountId: string } | null | undefined, verifiedEmail: string | null): Promise<string | null> {
  const attempt = pending.getStore();
  if (!attempt) return null;
  attempt.outcome = account ? await finishConnect(prisma, { nonce: attempt.nonce, sessionToken: attempt.sessionToken, state: attempt.state,
    provider: account.provider, providerAccountId: account.providerAccountId, verifiedEmail }) : "failed";
  // 일반 로그인이 User·Account·Session 행을 만들기 전에 Auth.js를 항상 멈춘다.
  return routes.account({ connect: attempt.outcome });
}
export async function withConnect(request: NextRequest, run: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  if (!isOAuthCallback(url.pathname)) return run();
  const origin = requestOrigin({ host: request.headers.get("host") ?? url.host, forwardedProto: request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1) });
  const secure = origin?.secure ?? false;
  const nonce = request.cookies.get(connectCookie(true).name) ?? request.cookies.get(connectCookie(false).name);
  const intent = nonce !== undefined || request.cookies.has(connectStateCookie(true).name) || request.cookies.has(connectStateCookie(false).name);
  if (!intent) return run();
  const attempt: Attempt = { nonce: nonce?.value ?? "", sessionToken: request.cookies.get(sessionCookieName(secure))?.value ?? "", state: url.searchParams.get("state") ?? "" };
  return stateScope.run(secure, () => pending.run(attempt, async () => {
    // ⚠️ **origin을 판정 못 하면 Auth.js를 부르지 않는다** (audit #78) — 시작이 그 조건에서 쿠키를 안 심으므로 이 왕복은
    // 우리가 시작한 것일 수 없고, `url.protocol`로 떨어지면 시작과 다른 쿠키 이름으로 판정한다(CLAUDE.md 2026-09-14).
    let original: Response = new Response(null, { status: 500 });
    if (origin !== null) {
      try { original = await run(); } catch (error) {
        logCaught("account-connect", "callback", error);
      }
    }
    const outcome = attempt.outcome ?? (url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
    const headers = new Headers(original.headers);
    headers.delete("content-length"); headers.delete("content-type");
    headers.set("location", new URL(routes.account({ connect: outcome }), origin?.origin ?? url.origin).href);
    headers.set("cache-control", "no-store");
    const response = new NextResponse(null, { status: 303, headers });
    expireBothVariants(response.cookies, [connectCookie, connectStateCookie]);
    return response;
  }));
}
