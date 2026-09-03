import { auth } from "@/auth";

/**
 * ⚠️ **레이아웃 검사만으로는 데이터가 새어나간다.**
 *
 * Next.js App Router는 레이아웃과 페이지를 **병렬로 렌더한다.** 레이아웃이 세션이 없을 때
 * `children`을 쓰지 않아도 **페이지는 이미 실행된다** — DB를 조회하고 RSC 페이로드를 만들어
 * 응답에 실린다. 실측: 세션 없이 `/keys`를 요청했을 때 응답 1.3MB에 1446키 전체가 들어 있었다.
 * 화면엔 로그인 버튼만 보이므로 눈으로는 절대 안 보인다.
 *
 * 미들웨어는 **렌더 전에** 막으므로 페이지가 실행되지 않는다. 이게 유일하게 확실한 지점이다.
 *
 * JWT 세션이라 미들웨어에서 DB 없이 토큰만 확인하면 된다 — Edge 런타임 제약을 타지 않는다.
 */
export default auth((request) => {
  if (request.auth?.user) return;

  // 로그인 화면은 `app/page.tsx`(루트)가 그린다. 세션이 없으면 보호 페이지를 실행시키지 않고
  // 루트로 보낸다 — `(edit)` 레이아웃은 2차 방어로 `redirect()`만 던진다.
  const url = new URL("/", request.nextUrl.origin);
  return Response.redirect(url);
});

export const config = {
  /**
   * 보호 대상만 지나게 한다. `/api/auth/*`를 포함하면 로그인 자체가 막히고,
   * 정적 파일·폰트를 포함하면 매 요청이 미들웨어를 타 느려진다.
   *
   * **새 보호 라우트를 추가하면 여기도 추가해야 한다** — 빠뜨리면 그 라우트가 무방비다.
   */
  matcher: ["/keys/:path*"],
};
