import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * Vercel Web Analytics `beforeSend` — **추적 경로 허용 목록**(seo-geo spec D3·D10). 스크립트가 루트 레이아웃에 있어 앱 화면에서도
 * 로드되므로 이것이 **유일한 거름망**이다: 앱 URL엔 초대 토큰·프로젝트 slug·검색어가 실린다. 그래서 차단 목록이 아니라 허용 목록이다.
 *
 * 맞으면 origin은 두고 **쿼리·해시만 벗긴다**(⚠️ `utm_*`도 사라진다 — 받아들인 손실). 대소문자를 구분하고 끝 `/`를 받지 않는다
 * (Next가 308로 보낸다). docs 세그먼트는 `[A-Za-z0-9-]+`만 — `%2F` 인코딩·임의 문자열을 거른다.
 *
 * ⚠️ **잎 모듈이다** — 값 import 0, 타입만(`client-graph.test.ts`의 `CLIENT_LIB_FILES`). `SITE_ORIGIN`·`m`도 물지 않는다.
 */
const TRACKED = /^(?:\/|\/signin|\/privacy|\/changelog|\/docs(?:\/[A-Za-z0-9-]+)*)$/;

export function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  let parsed: URL;
  try {
    parsed = new URL(event.url);
  } catch {
    return null;
  }
  if (!TRACKED.test(parsed.pathname)) return null;
  return { ...event, url: `${parsed.origin}${parsed.pathname}` };
}
