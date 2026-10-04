import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { Toaster } from "sonner";

import { SiteAnalytics } from "@/components/analytics";
import { MessagesProvider } from "@/components/i18n/messages-provider";
import { NavigationDim } from "@/components/shell/navigation-dim";
import { en } from "@/messages/en";
import { getDateStyle, getUiLocale } from "@/lib/i18n/server";
import { OG_IMAGE, SITE_ORIGIN } from "@/lib/seo/site";

import "./globals.css";

const geist = localFont({
  src: "./fonts/geist/Geist.woff2",
  variable: "--font-geist",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  // Next의 자동 Arial 폴백이 Pretendard보다 앞에 들어오지 않게 한다.
  adjustFontFallback: false,
});

/**
 * 전 페이지의 머리 기본값. 앱 화면 탭은 그대로 `Malmoi`이고, 공개 페이지는 각자 `pageMetadata`로 덮는다(seo-geo spec D9).
 *
 * ⚠️ **canonical·`og:url`을 두지 않는다** — metadata 병합이 얕아서 자기 `alternates`가 없는 페이지(앱·`/signin`·`/invite`·404)
 * 전부에 홈 canonical이 번진다(noindex + 홈 canonical 모순, 404의 soft-404 신호).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: en.common.appName, template: `%s · ${en.common.appName}` },
  description: en.landing.hero.body,
  openGraph: { siteName: en.common.appName, type: "website", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
    ⚠️ **전 페이지를 요청마다 렌더한다** (sec-audit-3 #11). CSP nonce는 요청마다 새로 나오고 Next는 렌더 중에 그것을
    스크립트에 붙인다 — 빌드 시점에 굳은 페이지는 nonce가 없어 스크립트가 **전부** 막힌다(화면은 뜨고 버튼만 죽는다).
    지우면 랜딩·`/privacy`처럼 요청을 안 읽는 페이지가 조용히 정적으로 돌아간다.
  */
  await connection();
  const uiLocale = await getUiLocale();
  const { timeZone } = await getDateStyle();
  return (
    /*
      ⚠️ **`lang`은 요청의 화면 언어다** (ui-locales D3) — 틀리면 스크린리더가 영어 문장을 한국어 음성 엔진으로 읽는다
      (2026-09-08 ship 4가 `"en"`으로 고정한 이유). `:lang(ko)` 줄바꿈 규칙도 이 값이 켠다.
      ⚠️ 언어를 여기서 정해 아래로 흘려보내지 않는다 — 페이지는 레이아웃과 병렬로 렌더되므로 각자 `getMessages()`를 부른다.
    */
    <html lang={uiLocale} className={geist.variable}>
      <head>
        {/*
          Pretendard 동적 서브셋. globals.css의 @import가 아니라 <link>로 넣는다 —
          CSS @import는 스타일시트 체인을 직렬화해 폰트 요청이 한 단계 늦게 시작된다.
          이 파일은 scripts/copy-fonts.mjs가 만드는 생성물이라 gitignore돼 있다.
        */}
        <link
          rel="stylesheet"
          href="/fonts/pretendard/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>
        {/*
          클라이언트 사전 입구 — 요청의 언어로 provider **하나**를 렌더하고 **언어 코드와 시간대(user-timezone)만** 넘긴다. ⚠️ 여기(서버)서 사전 모듈을 import하지 않는다 —
          레이아웃이 import하는 client 모듈은 Turbopack이 전부 레이아웃 청크 그룹에 실어 en 사용자도 받는다(orch D7 실측). ko·es 사전은
          provider 안 `next/dynamic` 로더가 읽는다(`components/i18n/messages-provider.tsx` 머리 주석). ⚠️ `key`를 걸지 않는다 — 언어를 바꿀 때 트리가 다시 마운트된다.
        */}
        <MessagesProvider uiLocale={uiLocale} timeZone={timeZone}>
          {children}
          {/*
            ⚠️ **`theme="light"`가 필수다** (8-1b). `sonner`는 테마를 **스스로 감지**하므로 이 값이
            없으면 OS 다크에서 토스트만 어두워지고, 라이트 단일(DESIGN §3)이 **그 컴포넌트에서만**
            깨진다. `globals.css`의 `@custom-variant dark`는 우리 `dark:` 유틸만 막지 남의
            패키지 내부 스타일은 못 막는다.

            ⚠️ **`classNames`로 우리 토큰에 묶는다** — 안 묶으면 `sonner`가 자기 배경·테두리·radius를
            주입해 규약 5("CSS는 Tailwind로") 밖의 **두 번째 CSS 출처**가 되고, `Alert`와 같은 뜻을
            다른 형으로 말한다.

            ⚠️ **유틸마다 `!`(important)를 붙인다** (#184) — `sonner`의 `[data-sonner-toast][data-styled=true]`는
            **CSS 레이어 밖**이라 Tailwind의 `@layer utilities` 일반 선언을 이긴다(`!` 없이는 radius 8·#ededed·0 4px 12px가
            그대로 나왔다). important는 일반 선언을 레이어와 무관하게 넘는다. 고정은 `app/__tests__/toaster-specificity.test.ts`.

            ⚠️ **루트에 둔다** — 8단계가 화면마다 토스트를 쓰므로 화면별로 두면 사본이 늘어난다.
          */}
          <Toaster
            theme="light"
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "bg-background! border-border! text-foreground! rounded-lg! border! shadow-sm!",
                icon: "[&>svg]:size-4!",
                description: "text-muted-foreground",
                actionButton: "bg-primary text-primary-foreground",
                closeButton: "bg-background border-border text-muted-foreground",
              },
            }}
          />
          {/* 앱 전체의 화면 이동에 걸린다 — 공개 셸·로그인·편집 셸이 레이아웃을 따로 들어 여기가 유일한 공통 자리다. */}
          <NavigationDim />
          <SiteAnalytics />
        </MessagesProvider>
      </body>
    </html>
  );
}
