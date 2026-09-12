import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse, type NextRequest } from "next/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { requestOrigin } from "@/lib/github-connect/origin";

import { failureUrl, linkCookie, linkStateCookie, outcomeUrl, type LinkDest, type LinkOutcome } from "./policy";
import { finishLink } from "./store";

/**
 * 확인 왕복의 callback 가로채기 — `lib/session-revocation/http.ts`와 **같은 형이고 목적이 반대다**
 * (하나는 왕복을 멈추고, 하나는 진행시킨다).
 *
 * ⚠️ **`withRevocation`이 바깥, 이것이 안쪽이다** (design 불변식 8a) — 회수가 먼저 판정하고 자기
 * 것이 아니면 통과시킨다. 두 intent 판정에 암호적 결합이 없으므로 배타성은 **양방향 쿠키
 * 정리**가 만든다 (불변식 8c, POSTMORTEM 2026-09-10).
 */

type Attempt = { token: string; outcome?: LinkOutcome; dest?: LinkDest | null };
// 결과는 이 핸들러 호출의 것이지, 호출자가 고른 리다이렉트 URL의 것이 아니다.
const pending = new AsyncLocalStorage<Attempt>();
const stateScope = new AsyncLocalStorage<boolean>();

export function withLinkStart<T>(secure: boolean, run: () => Promise<T>): Promise<T> {
  return stateScope.run(secure, run);
}

/** Auth.js는 state를 쿠키 이름을 salt로 암호화한다 — 이름을 가르면 일반 로그인으로 개명할 수 없다. */
export function linkAuthCookies() {
  const secure = stateScope.getStore();
  return secure === undefined ? undefined : { state: linkStateCookie(secure) };
}

/**
 * `signIn` 콜백이 부른다.
 *
 * - `null` — 병합 왕복이 아니다. 평범한 로그인 판정을 계속한다.
 * - `true` — 확인 성공. **로그인을 계속 진행시킨다**: 세션이 그때 생겨야 초대 수락으로 이어진다.
 * - 문자열 — 실패. Auth.js가 `handleLoginOrRegister`를 통째로 건너뛰어 `User`·`Account`·`Session`이
 *   0회 쓰인다 (`authorizeRevocation`과 같은 관용구).
 */
export async function authorizeLoginLink(
  prisma: PrismaClient,
  account: { provider: string; providerAccountId: string } | null | undefined,
): Promise<string | true | null> {
  const attempt = pending.getStore();
  if (!attempt) return null;
  const result = account
    ? await finishLink(prisma, {
        challengeToken: attempt.token,
        // ⚠️ **`account`를 통째로 넘기지 않는다** — Auth.js의 그 객체는 토큰까지 든 넓은 모양이고,
        // Prisma의 복합 PK `where`에 여분 키가 하나라도 섞이면 `Unknown argument`로 던진다(실측).
        confirming: { provider: account.provider, providerAccountId: account.providerAccountId },
      })
    : { outcome: "invalid" as const, dest: null };
  attempt.outcome = result.outcome;
  attempt.dest = result.dest;
  if (result.outcome === "linked") return true;
  return failureUrl(attempt.token === "" ? null : attempt.token, result.outcome);
}

export async function withLoginLink(request: NextRequest, run: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  if (!/^\/api\/auth\/callback\/(github|google)$/.test(url.pathname)) return run();
  const origin = requestOrigin({
    host: request.headers.get("host") ?? url.host,
    forwardedProto: request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1),
  });
  const secure = origin?.secure ?? url.protocol === "https:";
  const tokenCookie = request.cookies.get(linkCookie(true).name) ?? request.cookies.get(linkCookie(false).name);
  const intent =
    tokenCookie !== undefined ||
    request.cookies.has(linkStateCookie(true).name) ||
    request.cookies.has(linkStateCookie(false).name);
  if (!intent) return run();

  const attempt: Attempt = { token: tokenCookie?.value ?? "" };
  return stateScope.run(secure, () =>
    pending.run(attempt, async () => {
      let original: Response;
      try {
        original = await run();
      } catch {
        original = new Response(null);
      }
      // signIn 앞에서 난 오류에도 결론이 있어야 한다 — 취소와 장애를 가른다.
      const outcome = attempt.outcome ?? (url.searchParams.get("error") === "access_denied" ? "cancelled" : "unavailable");
      const token = attempt.token === "" ? null : attempt.token;
      /**
       * ⚠️ **성공 착지를 challenge가 든다** — `callbackUrl` 쿠키가 아니라 저장된 **갈래**에서
       * 만든다 (design 불변식 9). 그 쿠키가 지워지거나 바뀌어도 초대로 돌아가는 길이 산다.
       */
      const location =
        outcome === "linked" && attempt.dest ? outcomeUrl(attempt.dest) : failureUrl(token, outcome);

      const headers = new Headers(original.headers);
      // 이 callback은 언제나 우리가 정한 목적지 하나에서 끝난다.
      headers.delete("content-length");
      headers.delete("content-type");
      headers.set("location", new URL(location, origin?.origin ?? url.origin).href);
      headers.set("cache-control", "no-store");
      const response = new NextResponse(null, { status: 303, headers });

      const cookie = linkCookie(secure);
      response.cookies.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
      const state = linkStateCookie(secure);
      response.cookies.set(state.name, "", { ...state.options, maxAge: 0 });
      if (secure) response.cookies.set(linkCookie(false).name, "", { ...linkCookie(false).options, maxAge: 0 });
      return response;
    }),
  );
}
