import { NextResponse, type NextRequest } from "next/server";

import { isProtectedPath, shouldRedirectToLogin } from "@/lib/auth/cookie";
import { routes } from "@/lib/routes";
import { buildCsp, createNonce, cspEnvironment } from "@/lib/security-headers";

/**
 * **1차 차단 — 세션 쿠키가 있는지만 본다.**
 *
 * ⚠️ **`auth()` 래퍼를 쓰지 않는다.** DB 세션(`strategy: "database"`)에서 그 래퍼는
 * `adapter.getSessionAndUser`를 부르고 `updateAge`를 넘으면 세션 갱신 **쓰기**까지 한다
 * (`next-auth/lib/index.js`, `@auth/core/lib/actions/session.js`). 미들웨어가 Prisma·pg를 물게 되고
 * "값싼 1차 차단"이 거짓이 된다.
 *
 * ⚠️ **렌더 요청만 막는다.** Server Action POST는 지나가고 Action이 스스로 인증한다 — 아래 주석.
 *
 * ⚠️ **이건 차단이지 인가가 아니다.** 쿠키가 위조·만료됐는지 모르고 **프로젝트 접근 권한은 전혀
 * 모른다.** 진짜 판정은 페이지·Server Action이 `requireProjectAccess`/`getProjectAccess`로 한다
 * (ARCHITECTURE §6.00 ① — SaaS에서 같은 실수의 형태는 "middleware가 로그인을 확인했으니 프로젝트 접근도
 * 됐겠지"다).
 *
 * 여전히 **렌더 전에** 막는 유일한 지점이다. 레이아웃의 조건부 반환은 차단이 아니다 — App Router가
 * 레이아웃과 페이지를 병렬로 렌더하므로 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를 응답에
 * 싣는다. 실측: 세션 없이 `/keys`를 요청했을 때 응답 1.3MB에 1446키 (POSTMORTEM 2026-08-31).
 *
 * **CSP의 유일한 출처이기도 하다** (sec-audit-3 #11). nonce가 요청마다 바뀌므로 정적 헤더(`next.config.ts`)에 둘 수 없다.
 */
export default function middleware(request: NextRequest): NextResponse {
  // ⚠️ Server Action POST는 통과시킨다 — 307로 돌리면 `fetch`가 POST를 `/`로 재전송해 action id를 못 찾고
  // 페이지 오류가 된다. Action은 스스로 `auth()`를 지나 `unauthorized`를 낸다 (`lib/auth/cookie.ts`).
  const redirectToLogin =
    isProtectedPath(request.nextUrl.pathname) &&
    shouldRedirectToLogin({
      method: request.method,
      cookieNames: request.cookies.getAll().map((cookie) => cookie.name),
    });
  // 로그인 화면은 `app/signin/page.tsx`가 그린다 — 루트(`/`)는 공개 랜딩이다 (8-1a에서 갈랐다).
  if (redirectToLogin) return NextResponse.redirect(new URL(routes.signIn(), request.nextUrl.origin));

  const nonce = createNonce();
  // ⚠️ **`lib/env.ts`를 import하지 않는다** — 그 모듈이 `lib/failure.ts`를 거쳐 `node:crypto`를 물고, 이 파일은 Edge
  // 런타임이라 빌드가 경고하고 배포에서 모듈 로드가 죽을 수 있다(그러면 **전 페이지**가 500이다). 셋 다 선택값이라
  // `optionalEnv`와 같은 규칙(빈 문자열 = 없음)을 손으로 적용한다.
  const csp = buildCsp(cspEnvironment({ nodeEnv: process.env.NODE_ENV || undefined, vercelEnv: process.env.VERCEL_ENV || undefined }), {
    nonce,
    blobHost: process.env.BLOB_PUBLIC_HOST || undefined,
  });
  // ⚠️ **요청 쪽에도 싣는다** — Next는 렌더 중 **요청** 헤더의 CSP에서 nonce를 뽑아 자기 스크립트에 붙인다.
  // 응답에만 실으면 모든 스크립트가 nonce 없이 나가 이 정책에 막힌다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  /**
   * **전 페이지** — CSP nonce를 받아야 해서다 (sec-audit-3 #11). 로그인으로 돌려보낼지는 matcher가 아니라
   * `isProtectedPath`(`lib/auth/cookie.ts`)가 정한다 — **새 보호 라우트는 거기에 추가한다.**
   *
   * 빠지는 것: `/api/*`와 정적 자산. ⚠️ **`/api/*`는 빼야 한다** — `/api/auth/*`가 걸리면 로그인 자체가 막힐 여지가
   * 생기고, `/api/github/callback`은 302되면 `code`가 사라진다(CLAUDE.md). API 응답은 문서가 아니라 CSP가 할 일도 없다.
   * 정적 자산(`_next/static`·`_next/image`와 `public/`의 최상위 디렉터리·`icon.svg`)은 매 요청이 미들웨어를 타면 느려진다 —
   * **`public/`에 최상위 항목을 늘리면 여기도 늘린다**(안 늘리면 느려질 뿐 깨지지는 않는다).
   *
   * ⚠️ **prefetch를 빼지 않는다**(Next 문서 예시의 `missing` 조건) — 빼면 쿠키 없는 보호 경로 prefetch가 1차 차단을 지나친다.
   *
   * ⚠️ `entry-points.test.ts`가 이 문자열을 **정규식으로 불러** 보호·공개 페이지 전부가 걸리고 자산·`/api`가 안 걸리는지 센다.
   */
  matcher: ["/((?!api/|_next/static/|_next/image|fonts/|guide/|brand/|email/|flags/|icon\\.svg$).*)"],
};
