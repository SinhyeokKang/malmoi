import type { Metadata } from "next";

import { HOSTED_PRODUCTION_ORIGIN } from "@/lib/deployment/mode";
import { en } from "@/messages/en";

/**
 * canonical·sitemap·llms·JSON-LD의 **유일한 절대 기준**.
 *
 * ⚠️ **환경별로 바꾸지 않는다** — 비프로덕션은 robots가 통째로 막으니 canonical이 프로덕션을 가리키는 것이 맞다.
 * `lib/invitation-email/config.ts`의 환경별 origin과 합치지 않는다(그쪽은 "지금 이 배포"다).
 */
export const SITE_ORIGIN = HOSTED_PRODUCTION_ORIGIN;

/**
 * docs 제목 접미 — `Every night · Malmoi`만으로는 무슨 페이지인지 모른다(seo-geo spec D9). 라벨은 헤더·사이드바와 같은
 * `publicDocs.docs.title`이다(같은 라우트 라벨이 둘이면 하나가 낡는다).
 */
export const DOCS_TITLE = `${en.common.appName} ${en.publicDocs.docs.title}`;

/**
 * 링크 미리보기 이미지 — 정적 1장이고 사용자가 만든다(seo-geo spec D2). 상대 경로는 루트의 `metadataBase`가 절대 URL로 만든다.
 *
 * ⚠️ **파일 규약(`app/opengraph-image.png`)으로 두지 않는다** — 정적 파일 메타는 파일이 있는 세그먼트에서만 합쳐지고, 자식이
 * `openGraph`를 주면 얕은 병합으로 통째로 갈린다. 그래서 출처가 이 상수 하나이고 루트와 `pageMetadata`가 **항상** 싣는다.
 */
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: en.seo.ogImageAlt };

/**
 * 공개 페이지(`/`·`/docs/**`·`/privacy`) 전용 머리. ⚠️ **매번 완전한 객체를 만든다** — Next metadata 병합이 얕아서 여기서
 * 빠진 필드는 부모 것으로 채워지지 않고 그 페이지에서 사라진다. `og:title`은 페이지 제목만이고 브랜드는 `siteName`이 든다.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = `${SITE_ORIGIN}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: en.common.appName, locale: "en_US", type: "website", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }] },
  };
}
