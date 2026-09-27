import type { MetadataRoute } from "next";

import { optionalEnv } from "@/lib/env";
import { robotsFor } from "@/lib/seo/crawl";

/**
 * ⚠️ **요청 시점 판정이다**(seo-geo spec D11) — 빌드 시점 값이면 Promote to Production이 preview 산출물을 올릴 때 프로덕션이
 * `Disallow: /`로 굳는다. 대가는 크롤러 요청당 함수 1회다.
 * ⚠️ `VERCEL_ENV`는 **함수 안에서** 읽는다 — 모듈 최상위 평가는 import만으로 죽는다(POSTMORTEM 2026-08-31).
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsFor(optionalEnv("VERCEL_ENV"));
}
