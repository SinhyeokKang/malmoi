import { emailThumbnailPng } from "@/lib/upload/email-thumbnail";
import { isStoredImageKey } from "@/lib/upload/image";
import { readImage } from "@/lib/upload/store";

/**
 * **초대 메일의 썸네일 프록시** (2026-09-28, #140). `../../[...key]/route.ts`와 같은 검증·같은 읽기를 지나고, 바이트를
 * **96×96 PNG로 바꿔** 낸다 — 메일 클라이언트가 WebP 알파를 버린다(`emailThumbnailPng`). 검증 규칙의 근거(쿼리 거부 ·
 * 정규 철자 · 헤더 없는 상류 호출 · 인가 없음 · 캐시 헤더 둘)는 전부 그 파일의 머리 주석이 정본이다.
 *
 * ⚠️ **경로가 `/api/images/` 아래인 이유는 WAF다** — 프로덕션 규칙 "Rate limit image proxy"가 `path starts with /api/images/`다.
 * 정적 세그먼트 `email`이 catch-all보다 먼저 잡혀 기존 라우트와 부딪히지 않는다.
 * ⚠️ **프로젝트 썸네일만 받는다** — 메일에 실리는 이미지가 그것 하나다. 아바타 키까지 받으면 변환 비용을 치르는 읽기 경로가
 * 이유 없이 넓어진다.
 */
const notFound = (): Response => new Response(null, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const url = new URL(request.url);
  if (url.search !== "") return notFound();
  const key = (await params).key.join("/");
  if (!key.startsWith("projects/") || !isStoredImageKey(key)) return notFound();
  if (url.pathname !== `/api/images/email/${key}`) return notFound();

  const bytes = await readImage(key);
  if (bytes === null) return notFound();
  const png = await emailThumbnailPng(new Uint8Array(bytes));
  if (png === null) return notFound();

  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      "cdn-cache-control": "public, s-maxage=86400",
    },
  });
}
