import { NextResponse, type NextRequest } from "next/server";

import { hasSessionCookie } from "@/lib/auth/cookie";

/**
 * **1차 차단 — 세션 쿠키가 있는지만 본다.**
 *
 * ⚠️ **`auth()` 래퍼를 쓰지 않는다.** DB 세션(`strategy: "database"`)에서 그 래퍼는
 * `adapter.getSessionAndUser`를 부르고 `updateAge`를 넘으면 세션 갱신 **쓰기**까지 한다
 * (`next-auth/lib/index.js`, `@auth/core/lib/actions/session.js`). 미들웨어가 Prisma·pg를 물게 되고
 * "값싼 1차 차단"이 거짓이 된다.
 *
 * ⚠️ **이건 차단이지 인가가 아니다.** 쿠키가 위조·만료됐는지 모르고 **프로젝트 접근 권한은 전혀
 * 모른다.** 진짜 판정은 페이지·Server Action이 `requireProjectAccess`/`getProjectAccess`로 한다
 * (SAAS §5.1 — SaaS에서 같은 실수의 형태는 "middleware가 로그인을 확인했으니 프로젝트 접근도
 * 됐겠지"다).
 *
 * 여전히 **렌더 전에** 막는 유일한 지점이다. 레이아웃의 조건부 반환은 차단이 아니다 — App Router가
 * 레이아웃과 페이지를 병렬로 렌더하므로 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를 응답에
 * 싣는다. 실측: 세션 없이 `/keys`를 요청했을 때 응답 1.3MB에 1446키 (POSTMORTEM 2026-08-31).
 */
export default function middleware(request: NextRequest): NextResponse | undefined {
  if (hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))) return undefined;

  // 로그인 화면은 `app/page.tsx`(루트)가 그린다.
  return NextResponse.redirect(new URL("/", request.nextUrl.origin));
}

export const config = {
  /**
   * 보호 대상만 지나게 한다. `/api/auth/*`를 포함하면 로그인 자체가 막히고,
   * 정적 파일·폰트를 포함하면 매 요청이 미들웨어를 타 느려진다.
   *
   * **새 보호 라우트를 추가하면 여기도 추가한다** — 빠뜨리면 그 라우트가 무방비다.
   *
   * ⚠️ **`/keys`는 아직 남아 있다.** SaaS 2단계 §5가 `/projects/[slug]/translations`로 옮기면서
   * 뺀다 — 라우트가 살아 있는 동안 matcher에서 빼면 그 페이지의 방어가 레이아웃 `redirect()`
   * 하나로 줄고, 그게 정확히 위 회고가 배운 부류다.
   *
   * ⚠️ **`/invite/:path*`는 넣지 않는다** (design §4.1). 비로그인으로 열려야 초대 링크의 토큰이
   * 보존된다 — 여기서 `/`로 302하면 토큰이 사라진다.
   */
  matcher: ["/keys/:path*", "/projects/:path*"],
};
