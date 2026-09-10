import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse, type NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { requestOrigin } from "@/lib/github-connect/origin";
import { finishRevocation } from "./store";
import { outcomeUrl, revocationCookie, revocationStateCookie, type Outcome } from "./policy";

type Attempt = { nonce: string; sessionToken: string; state: string; outcome?: Outcome };
// The outcome belongs to this handler invocation, never to a caller-controlled redirect URL.
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
  // A string makes Auth.js stop before handleLoginOrRegister creates a replacement session.
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
  // callback-url is only a denial marker, never proof of authorization. Keep late/consumed flows out of normal login.
  const callback = request.cookies.get("__Secure-authjs.callback-url") ?? request.cookies.get("authjs.callback-url");
  let intent = nonceCookie !== undefined || request.cookies.has(revocationStateCookie(true).name) || request.cookies.has(revocationStateCookie(false).name);
  if (!intent && callback) {
    try {
      const target = new URL(decodeURIComponent(callback.value), url.origin);
      intent = target.pathname === "/account" && target.searchParams.get("sessionRevocation") === "expired";
    } catch { /* An invalid destination cannot authorize anything; Auth.js still validates its encrypted state cookie. */ }
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
    catch { original = new Response(null); }
    const outcome = attempt.outcome ?? (url.searchParams.get("error") === "access_denied" ? "cancelled" : "unavailable");
    const headers = new Headers(original.headers);
    // This callback always ends at one of our fixed destinations, including errors before signIn.
    headers.delete("content-length"); headers.delete("content-type");
    headers.set("location", new URL(outcomeUrl(outcome), origin?.origin ?? url.origin).href);
    headers.set("cache-control", "no-store");
    const response = new NextResponse(null, { status: 303, headers });
    response.cookies.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
    const stateCookie = revocationStateCookie(secure);
    response.cookies.set(stateCookie.name, "", { ...stateCookie.options, maxAge: 0 });
    if (secure) response.cookies.set(revocationCookie(false).name, "", { ...revocationCookie(false).options, maxAge: 0 });
    if (outcome === "revoked") {
      response.cookies.set("authjs.session-token", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
      if (secure) response.cookies.set("__Secure-authjs.session-token", "", { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 0 });
    }
    return response;
  }));
}
