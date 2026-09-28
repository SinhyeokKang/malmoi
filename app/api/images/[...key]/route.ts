import { isStoredImageKey, storedImageContentType } from "@/lib/upload/image";
import { readImage } from "@/lib/upload/store";

/**
 * **업로드 이미지의 읽기 프록시** (2026-09-28). 브라우저가 Blob 호스트를 보지 않게, 같은 바이트를
 * **우리 출처**로 낸다 — 주소를 바꾸는 쪽은 `imageSrc`(`lib/upload/image.ts`)다.
 *
 * 왜 필요한가: 기업 웹 필터(FortiGate 실측)가 `*.vercel-storage.com`을 "File Sharing and Storage"로
 * 막고 TLS를 자기 CA로 가로채, 그 망의 브라우저는 프로필 사진·프로젝트 썸네일에서
 * `ERR_CERT_AUTHORITY_INVALID`를 받는다. 잎의 폴백이 조용해서 **사용자는 업로드가 실패한 줄 안다**.
 *
 * ⚠️ **`next.config.ts`의 rewrite가 아니다.** Next의 외부 rewrite는 **요청 헤더를 상류로 그대로 넘긴다** —
 * 실측에서 `cookie: __Secure-authjs.session-token=…`과 `authorization: Bearer …`가 Blob 호스트에
 * 도착했다. `<img src="/api/images/…">`는 동일 출처라 브라우저가 세션 쿠키를 붙이고, 이 앱은
 * **DB 세션**이라 그 토큰이 곧 계정 접근이다. 상류 호출은 `readImage`가 **헤더 없이** 한다.
 *
 * ⚠️ **인가가 없다** (`app/__tests__/entry-points.test.ts`의 `EXEMPT`) — 이 바이트는 오늘도 공개
 * 읽기다(ARCHITECTURE §6.7). 세션을 읽으면 응답이 캐시 불가가 되어 CDN 층이 통째로 사라진다.
 * 그래서 `Set-Cookie`·`Vary`를 내지 않는다.
 *
 * ⚠️ **속도 제한이 없다** — 로그인조차 필요 없는 읽기 경로다(§6.7의 무제한 업로드와 같은 갈래로
 * 받아들인 노출). 키를 모르면 못 읽고 키에는 난수가 있다.
 *
 * ⚠️ **`dynamic`·`revalidate`를 내보내지 않는다** — 캐시는 응답 헤더 둘이 정한다(아래).
 */
const notFound = (): Response => new Response(null, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const url = new URL(request.url);
  // ⚠️ 쿼리는 CDN 캐시 키를 쪼갠다 — 같은 객체를 무한히 다른 키로 만들면 이 경로가 증폭기가 된다.
  if (url.search !== "") return notFound();
  /*
   * ⚠️ **이어 붙인 문자열 하나를 잰다.** Next가 catch-all 세그먼트를 디코드하므로(`%2e%2e` → `..`,
   * `%2f` → `/`) 경로 조각이 전부 여기 드러나고, `isStoredImageKey`의 ASCII allowlist가 한 번에
   * 막는다 — 세그먼트별로 재면 개수 검사가 사라지는 날 새 축이 열린다.
   */
  const key = (await params).key.join("/");
  if (!isStoredImageKey(key)) return notFound();
  /*
   * ⚠️ **이 줄은 allowlist가 아니라 CDN 캐시 키를 지킨다** — 막는 일은 위 술어가 이미 다 했다.
   * `URL`은 `pathname`을 디코드하지 않으므로 `%61vatars/…`·`u1%2Fn1.webp`처럼 **다르게 적힌 같은 객체**가
   * 여기서 갈린다. 그것을 통과시키면 한 객체에 URL이 무한히 생겨 캐시 항목이 그만큼 쪼개진다 —
   * 쿼리스트링을 막는 위 줄과 같은 축이고, 한쪽만 닫으면 요지가 사라진다.
   * 정상 경로는 안 걸린다: `imageSrc`가 내는 것은 `[A-Za-z0-9_-]`·`/`·`.`뿐이라 퍼센트 인코딩이 안 된다.
   */
  if (url.pathname !== `/api/images/${key}`) return notFound();

  const bytes = await readImage(key);
  // ⚠️ 상류 상태·본문을 중계하지 않는다 — Blob의 404 본문은 XML이고, 그것이 `<img>`에 닿으면
  // `naturalWidth === 0` 폴백에 흔적 없이 떨어진다. 사유는 `readImage`의 서버 로그에만 남는다.
  if (bytes === null) return notFound();

  return new Response(bytes, {
    headers: {
      // 상류 헤더가 아니라 **검증된 확장자**가 정본이다.
      "content-type": storedImageContentType(key),
      /*
       * ⚠️ **헤더가 둘이어야 한다.** Route Handler는 기본 동적이라 `Cache-Control`만 주면 브라우저에만
       * 앉고 CDN에는 안 앉는다.
       *
       * ⚠️ **CDN TTL이 1년이 아니라 하루인 이유는 삭제다.** 키에 난수가 있어(`imageObjectKey`) 살아 있는
       * 객체에 `immutable`은 참이지만, **함수 응답에는 퍼지 경로가 없다** — 사진을 지워도 CDN이
       * 그동안은 계속 낸다. 이 값이 곧 그 창의 길이다.
       */
      "cache-control": "public, max-age=31536000, immutable",
      "cdn-cache-control": "public, s-maxage=86400",
    },
  });
}
