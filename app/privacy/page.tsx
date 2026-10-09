import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PrivacyDoc } from "@/components/privacy/privacy-doc";
import { PublicShell } from "@/components/public-shell/public-shell";
import { publicAccount } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";
import { deploymentMode } from "@/lib/deployment/mode";
import { optionalEnv } from "@/lib/env";
import { getMessages, getUiLocale } from "@/lib/i18n/server";
import { en } from "@/messages/en";
import { koPrivacy } from "@/messages/ko-privacy";
import { privacyDestination } from "@/lib/seo/public-response";
import { pageMetadata } from "@/lib/seo/site";

/** 설명은 방침 첫 문장이 아니라 제품 한 줄이다 — 검색 결과에서 이 페이지가 무엇의 방침인지가 먼저다. */
export const metadata: Metadata = pageMetadata({ title: en.publicDocs.privacy.title, description: en.landing.hero.body, path: "/privacy" });

/**
 * **공개 셸 안의 방침** (시안 `Landing.dc.html` 1e, DESIGN §6.616) — 랜딩 푸터의 `Privacy Policy`가 셸 밖으로
 * 떨어지지 않는다. ⚠️ **route group 레이아웃으로 묶지 않는다** — 페이지마다 셸을 그려야 이동 때 스크롤러가 다시 마운트된다.
 *
 * ⚠️ **본문은 사전에 있다** (`messages/en.tsx`의 `publicDocs.privacy`) — 고치면 `effectiveDate`를 같이 옮기고
 * `lib/privacy/__tests__/policy-gate.test.tsx`가 개정 이력을 요구한다.
 * 로그인 화면 푸터가 이 경로를 가리키므로 **라우트를 먼저 딴다** — `lib/routes.ts`에 등재만 하고
 * 페이지를 안 만들면 404를 가리키는 생성기가 되고, 죽은 링크 검사의 접두 규칙이 그것을 통과시켜
 * 못 잡는다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서라 로그인 없이 읽혀야 한다(`entry-points.test.ts`의
 * `EXEMPT`에 이름으로 등재). 같은 이유로 1차 차단의 보호 경로에도 없다. 세션을 읽는 것은 **헤더 primary
 * 하나 때문이고 차단이 아니다** — 로그인이면 아바타 메뉴, 아니면(장애 포함) `Get started`(`publicAccount`).
 *
 * ⚠️ **본문은 두 벌이다**(ui-locales design §8) — ko 화면은 ko 본(`messages/ko-privacy.tsx`), 그 밖(en·es)은 en 본이다. es 본은 원어민 검수 없이
 * 낼 수 없어 두지 않는다. ko 본을 import하는 비테스트 소스는 이 파일 하나다 — 클라이언트 그래프에 들면 ko 사용자 번들에 본문이 실린다.
 *
 * ⚠️ **self-hosted는 운영자 정책으로 임시 redirect한다**(self-hosting design §7) — 이 본문은 hosted 운영자의 방침이라 다른 설치에서는
 * 거짓이다. URL은 하나이고 모든 화면 언어에 쓴다. 순환(자기 `/privacy`)은 preflight가 기동 전에 거부하므로 여기서는 고르기만 한다.
 */
export default async function Privacy() {
  const destination = privacyDestination(deploymentMode(), optionalEnv("MALMOI_PRIVACY_URL"));
  if (destination.kind === "redirect") redirect(destination.url);
  if (destination.kind === "unavailable") notFound();
  const [session, m, uiLocale] = await Promise.all([readSession(), getMessages(), getUiLocale()]);

  return (
    <PublicShell m={m} account={publicAccount(session)}>
      <PrivacyDoc m={m} uiLocale={uiLocale} {...(uiLocale === "ko" ? { doc: koPrivacy, lang: "ko" } : { doc: en.publicDocs.privacy, lang: "en" })} />
    </PublicShell>
  );
}
