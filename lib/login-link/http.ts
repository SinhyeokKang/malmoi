import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest, NextResponse } from "next/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { requestOrigin } from "@/lib/github-connect/origin";
import { routes } from "@/lib/routes";

import { failureUrl, linkCookie, linkStateCookie, outcomeUrl, type LinkDest, type LinkOutcome } from "./policy";
import { finishLink } from "./store";

/**
 * 확인 왕복의 callback 가로채기 — `lib/session-revocation/http.ts`와 **같은 형이고 목적이 반대다**
 * (하나는 왕복을 멈추고, 하나는 진행시킨다).
 *
 * ⚠️ **`withRevocation`이 바깥, 이것이 안쪽이다** (ARCHITECTURE "계정 병합") — 회수가 먼저 판정하고 자기
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

/**
 * 확인 OAuth의 신원으로 로그인시키려고 **요청 복사본에서만** 세션 쿠키를 뗀다. 다른 사용자의
 * 기존 세션을 Auth.js에 넘기면 `finishLink`가 커밋된 뒤 `handleLoginOrRegister`가
 * `OAuthAccountNotLinked`를 던지고, 병합은 성공했는데 세션은 남의 것인 상태로 착지한다.
 * 실패하면 브라우저의 기존 세션은 그대로이고, 성공하면 Auth.js가 발급한 쿠키로 교체된다.
 *
 * ⚠️ **`new NextRequest(request)`로 복사하지 않는다** (2026-09-12 실물). Next 16 런타임이 넘기는
 * 요청 객체를 그 생성자에 넣으면 `TypeError: Cannot read private member #state`로 **500이 난다** —
 * 확인 왕복 전체가 죽었다. **테스트는 이것을 원리적으로 못 봤다**: 단위·통합 스위트가
 * `new NextRequest("http://…", { headers })`로 직접 만든 객체를 넘기므로 그 복사가 성립한다
 * (POSTMORTEM 2026-09-12). **url 문자열 + init으로 조립하면** 런타임 객체의 사설 필드를 읽지
 * 않으므로 두 경로가 같아진다.
 *
 * ⚠️ **그래도 표준 `Request`가 아니라 `NextRequest`여야 한다** (launch-readiness L3.8). `AUTH_URL`·
 * `NEXTAUTH_URL`이 서면 next-auth의 `reqWithEnvURL`이 `req.nextUrl`을 구조 분해하고, 표준 `Request`엔
 * 그 필드가 없어 계정 연결 콜백이 전부 TypeError가 된다 — 아래 `catch`가 그것을 무로그 500으로 삼킨다.
 */
function withoutSessionCookie(request: NextRequest): NextRequest {
  const headers = new Headers(request.headers);
  const cookie = headers.get("cookie");
  if (cookie !== null) {
    const kept = cookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "" && !/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(part));
    if (kept.length === 0) headers.delete("cookie");
    else headers.set("cookie", kept.join("; "));
  }
  // Next의 init은 `signal`에서 `null`을 안 받아 전역 `RequestInit`과 어긋난다 — 생성자의 것을 쓴다.
  const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> & { duplex?: "half" } = { method: request.method, headers };
  // GET·HEAD엔 본문이 없다. 그 밖에는 스트림을 그대로 넘긴다(`duplex`가 없으면 undici가 던진다).
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new NextRequest(request.url, init);
}

export async function withLoginLink(request: NextRequest, run: (request: NextRequest) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  if (!/^\/api\/auth\/callback\/(github|google)$/.test(url.pathname)) return run(request);
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
  if (!intent) return run(request);

  const callbackRequest = withoutSessionCookie(request);

  const attempt: Attempt = { token: tokenCookie?.value ?? "" };
  return stateScope.run(secure, () =>
    pending.run(attempt, async () => {
      let original: Response;
      try {
        original = await run(callbackRequest);
      } catch {
        original = new Response(null, { status: 500 });
      }
      // signIn 앞에서 난 오류에도 결론이 있어야 한다 — 취소와 장애를 가른다.
      const outcome = attempt.outcome ?? (url.searchParams.get("error") === "access_denied" ? "cancelled" : "unavailable");
      const token = attempt.token === "" ? null : attempt.token;
      /**
       * ⚠️ **성공 착지를 challenge가 든다** — `callbackUrl` 쿠키가 아니라 저장된 **갈래**에서
       * 만든다 (ARCHITECTURE §6.4). 그 쿠키가 지워지거나 바뀌어도 초대로 돌아가는 길이 산다.
       */
      // 연결 커밋과 Auth.js의 세션 생성은 별개다. 뒤쪽 실패를 성공으로 덮거나,
      // 이미 소비된 challenge로 돌려보내 장애를 LinkExpired로 바꾸지 않는다.
      const loginFailed = original.status >= 400 ||
        new URL(original.headers.get("location") ?? request.url, request.url).searchParams.has("error");
      const location = outcome === "linked" && loginFailed
        ? routes.signIn({ error: "Unavailable" })
        : outcome === "linked" && attempt.dest ? outcomeUrl(attempt.dest) : failureUrl(token, outcome);

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
