"use client";

import { Analytics } from "@vercel/analytics/next";

import { redactAnalyticsEvent } from "@/lib/seo/analytics";

/**
 * Vercel Web Analytics (seo-geo T10). ⚠️ **래퍼가 필요한 이유** — 루트 레이아웃은 서버 컴포넌트라 `beforeSend`(함수)를 넘길 수
 * 없다. 함수는 RSC 경계를 못 넘고, 그 위반은 `next build`만 잡는다.
 *
 * ⚠️ **루트에 둔다** — 추적 경로(`/`·`/signin`·`/docs`·`/privacy`)에 공통 레이아웃 세그먼트가 없다. 그래서 앱 화면에서도 로드되고
 * **허용 목록이 유일한 거름망**이다. 쿠키를 쓰지 않는다(`/privacy` 쿠키 절이 참으로 남는 근거).
 *
 * ⚠️ **개발 서버에서는 렌더하지 않는다** — dev 모드의 패키지는 `va.vercel-scripts.com` 디버그 스크립트를 부르는데 CSP
 * `script-src 'self'`가 막는다. CSP를 넓히지 않는다(프로덕션·preview는 동일 출처 `/_vercel/insights/*`다). `lib/env.ts`를 거치지
 * 않는 예외다 — 클라이언트 컴포넌트라 서버 전용 모듈을 그래프에 넣을 수 없고, `NODE_ENV`는 빌드가 치환하는 상수다.
 */
export function SiteAnalytics() {
  if (process.env.NODE_ENV === "development") return null;
  return <Analytics beforeSend={redactAnalyticsEvent} />;
}
