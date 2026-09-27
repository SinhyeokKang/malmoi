# seo-geo — design

## 영향 받는 흐름

push / 편집 UI / pull **어디에도 붙지 않는다.** DB·GitHub·인증 경계에 닿지 않고, 붙는 곳은 넷이다.

| 자리 | 무엇 |
|---|---|
| `<head>` | `metadata`/`generateMetadata` — `app/layout.tsx` · `app/page.tsx` · `app/privacy/page.tsx` · `app/docs/layout.tsx` · `app/docs/[[...slug]]/page.tsx` · `app/not-found.tsx` · 토큰·로그인 페이지 셋 |
| 크롤러용 파일 | `app/robots.ts` · `app/sitemap.ts` · `app/llms.txt/route.ts` · `app/llms-full.txt/route.ts` · `public/og.png`(사용자 몫) |
| `next.config.ts` | `htmlLimitedBots: /.*/` 한 줄 (spec D8) |
| 루트 레이아웃 body | Vercel Web Analytics `<Analytics>` — `"use client"` 래퍼 하나 |

## 순수 함수 (→ `/tdd interface` 대상)

전부 `lib/seo/`에 둔다. I/O(파일 읽기·env 읽기)는 호출부(`app/**`)가 하고, 함수는 값만 받는다. spec D13으로 줄인 형이다.

| 이름 | 입력 → 출력 | 요점 |
|---|---|---|
| `SITE_ORIGIN` (상수) | `"https://mal-moi.com"` | canonical·sitemap·llms·JSON-LD의 **유일한 절대 기준**. 환경별로 바꾸지 않는다 — 비프로덕션은 robots가 통째로 막으니 canonical이 프로덕션을 가리키는 것이 맞다. `lib/invitation-email/config.ts`의 환경별 origin과 합치지 않는다(그쪽은 "지금 이 배포"다) |
| `OG_IMAGE` (상수) | `{ url: "/og.png", width: 1200, height: 630, alt: m.seo.ogImageAlt }` | `metadataBase`가 절대 URL로 만든다 |
| `robotsFor(vercelEnv)` | `string \| undefined` → `MetadataRoute.Robots` | `"production"`만 허용 규칙이다. **모르는 값·`undefined`는 `Disallow: /`** — `lib/security-headers.ts`와 반대 방향의 fail-closed다(그쪽은 모르면 프로덕션처럼 좁히고, 여기는 모르면 숨긴다). 허용 시 `Disallow: /api/ /projects /account` + `sitemap` |
| `sitemapEntries(flat)` | `FlatNavItem[]` → `MetadataRoute.Sitemap` | `/` · `/docs/**`(SUMMARY 순서) · `/privacy`. `/signin`은 넣지 않는다(noindex). `lastModified` 없음 — 빌드 시각을 넣으면 매 배포 "전부 바뀜"이 되어 신호가 무의미해진다. `/docs` 개요는 `/docs`(끝 `/` 없음) |
| `pageMetadata({ title, description, path })` | → `Metadata` | 공개 페이지 전용. `alternates.canonical` + `openGraph.{title,description,url,siteName,type,images:[OG_IMAGE]}` + `twitter.{card,title,description,images}`를 **매번 완전한 객체로** 만든다. ⚠️ **Next metadata 병합이 얕다** — 자식이 `openGraph`를 주면 부모 것(파일 규약 이미지 포함)이 통째로 갈린다(`node_modules/next/dist/lib/metadata/resolve-metadata.js` — 정적 파일 메타는 **파일이 있는 세그먼트에서만** 합쳐진다). 그래서 이미지는 파일 규약(`app/opengraph-image.png`)이 아니라 이 함수가 **항상** 싣는다. `og:title`은 페이지 제목만 — 브랜드는 `siteName`이 든다 |
| `jsonLdHtml(value)` | `object` → `string` | `JSON.stringify` 후 `<`·`>`·`&`·U+2028·U+2029를 `\uXXXX`로 — 원고에 `</script>`가 들어와도 태그를 못 닫는다. `dangerouslySetInnerHTML`의 **유일한** 입력 경로 |
| `LANDING_LD` (상수) | schema.org 배열 | `SoftwareApplication`(`applicationCategory: "DeveloperApplication"`, `operatingSystem: "Web"`, `offers: { price: "0", priceCurrency: "USD" }` — 과금 비범위 PRODUCT §4.2라 참이다) + `Organization`(`sameAs: [GITHUB_REPO_URL]`, `logo`). **평점·리뷰 없음** |
| `docLd({ title, description, url, chapter })` | → schema.org 배열 | `TechArticle` + `BreadcrumbList`(Docs › 장 › 페이지, `position` 1부터). 장 URL은 `docHref([slug[0]])` — **SUMMARY가 2단**이라는 전제다(`FlatNavItem.parent`는 제목 문자열뿐이다). 장 개요 페이지는 2항목. **`/docs` 개요에는 싣지 않는다**(1항목 breadcrumb는 무의미) |
| `llmsIndex(nav, leads)` | `NavNode[]` + slug→요약 → `string` | llmstxt.org 형: `# Malmoi` · `> ${hero.body}` · 장마다 `## 장 제목` + `- [제목](절대 URL): 요약`(요약 null이면 `: …` 없이). 끝 개행 1개 |
| `llmsFull(flat, sources)` | 항목 + file→원고 원문 → `string` | 항목마다 `# 제목` · `Source: <절대 URL>` · 빈 줄 · **원고 원문 그대로**(spec D5 — 상대 `.md` 링크·`{#id}`를 재작성하지 않는다). 구분은 빈 줄 + `---` |
| `redactAnalyticsEvent(event)` | `BeforeSendEvent` → `BeforeSendEvent \| null` | 내부 판정(비공개): `/` · `/signin` · `/privacy` 정확 일치, `/docs` 또는 `/docs(/[A-Za-z0-9-]+)+` (spec D10). 대소문자 구분, 끝 `/` 불허(Next가 308로 보낸다). 맞지 않으면 `null`, 맞으면 **origin은 그대로 두고 쿼리·해시만 벗긴** URL. ⚠️ **잎 모듈이다** — `SITE_ORIGIN`·`m`을 포함해 값 import 0, 타입만 `import type`(클라이언트 그래프에 들어간다) |

docs 페이지의 제목·설명 조립(`SUMMARY 제목` · `leadParagraph ?? hero.body`)은 `generateMetadata` 안의 두 줄이다 — 함수로 빼지 않는다(D13).

**결정성**: `sitemapEntries`·`llmsIndex`·`llmsFull`은 같은 `guide/` 상태에서 같은 바이트를 낸다(불변식 4의 정신 —
export 대상은 아니지만 크롤러가 "바뀜"을 판단하는 재료라 같은 규율을 둔다). 정렬은 SUMMARY 순서 하나다.

## 호출부 배선

- **`m.seo` 절**(`messages/en.tsx`): `homeTitle` · `ogImageAlt` · `signInTitle`("Sign in" — `m.signIn.title`은 "Sign in to Malmoi"라
  템플릿과 브랜드가 두 번 선다). 나머지는 **기존 값을 재사용한다** — docs 라벨 `m.publicDocs.docs.title`("Docs" — 그 키의 주석이
  이미 "같은 라우트 라벨이 둘이면 하나가 낡는다"를 말한다), `/privacy` 제목 `m.publicDocs.privacy.title`("Privacy Policy"), 설명
  `m.landing.hero.body`, 초대 `m.invite.title`, 로그인 연결 `m.link.title`, 404 `m.notFound.title`·`m.publicDocs.docs.notFound.title`.
- **루트 `app/layout.tsx`**: `metadataBase: new URL(SITE_ORIGIN)` · `title: { default: m.common.appName, template: "%s · Malmoi" }` ·
  `description: hero.body` · `openGraph: { siteName, type: "website", images: [OG_IMAGE] }` · `twitter: { card: "summary_large_image" }`.
  ⚠️ **canonical·`og:url`을 두지 않는다** — 얕은 병합으로 자기 `alternates`가 없는 페이지(앱·`/signin`·`/invite`·404) 전부에
  홈 canonical이 번진다(noindex + 홈 canonical 모순, 404의 soft-404 신호). 템플릿 문자열의 `Malmoi`는 `m.common.appName`에서 조립한다.
- **`app/page.tsx`**: `metadata = { ...pageMetadata({ path: "/", … }), title: { absolute: m.seo.homeTitle } }` + `LANDING_LD` `<script>`.
- **`app/privacy/page.tsx`**: `pageMetadata({ title: m.publicDocs.privacy.title, description: <방침 첫 문장 대신 hero.body>, path: "/privacy" })`.
- **`app/docs/layout.tsx`**: `metadata = { title: { template: "%s · Malmoi Docs", default: "Malmoi Docs" } }`(문자열은 `appName` +
  `docs.title`에서 조립).
- **`app/docs/[[...slug]]/page.tsx`**: `generateMetadata` — `loadPageBySlug`가 null이면 `{ title: m.publicDocs.docs.notFound.title }`
  (canonical 없음 — 본문이 `notFound()`하고 Next가 noindex를 붙인다). 개요는 `title: { absolute: "Malmoi Docs" }`, 하위는 SUMMARY 제목.
  하위 페이지 본문에 `docLd` JSON-LD.
- **`app/not-found.tsx`**: `metadata = { title: m.notFound.title }`.
- **noindex 셋**: `app/invite/[token]/page.tsx`·`app/signin/link/[challenge]/page.tsx`는 `{ title, robots: { index: false, follow: false },
  referrer: "no-referrer" }`, `app/signin/page.tsx`는 `{ title: m.seo.signInTitle, robots: … }`. ⚠️ **이 셋은 robots.txt로 막지 않는다** —
  막으면 크롤러가 noindex를 못 보고 외부 링크만으로 **URL이 색인된다**(토큰이 검색 결과에 뜬다). `/projects`·`/account`는 비로그인에게
  302라 본문이 없으므로 robots.txt 거부가 맞다. ⚠️ **`no-referrer`는 Analytics 방어다** — 토큰 페이지의 푸터 Docs·Privacy 링크를
  새 탭으로 열면 `strict-origin-when-cross-origin`(`lib/security-headers.ts:79`) 아래에서 같은 출처 referrer가 **전체 URL**이고,
  Vercel 스크립트가 그 referrer를 싣는데 `beforeSend`는 `url`만 바꿀 수 있다.
- **`app/robots.ts`**: `export const dynamic = "force-dynamic"` + 함수 **안에서** `optionalEnv("VERCEL_ENV")` → `robotsFor` (spec D11 ·
  POSTMORTEM 2026-08-31). 크롤러 요청당 함수 1회가 대가다.
- **`app/sitemap.ts`**: `sitemapEntries(flattenNav(loadSummary()))`. 정적 prerender.
- **`app/llms.txt/route.ts`·`app/llms-full.txt/route.ts`**: `GET` → `text/plain; charset=utf-8`, `dynamic = "force-static"`.
  원문 읽기는 `lib/guide/load.ts`에 `loadSource(file)`(`cache` + `readFileSync`) 하나를 더한다. ⚠️ **`app/__tests__/entry-points.test.ts`의
  `EXEMPT`에 `llms.txt/route.ts`·`llms-full.txt/route.ts`를 이유 주석과 함께 등재한다** — 인가 없는 공개 Route Handler다.
  ⚠️ **파일 트레이싱 전제**: `outputFileTracingIncludes`는 `/docs/[[...slug]]` 하나뿐이다(`next.config.ts:22`). sitemap·llms 둘은
  **빌드 때 prerender되어서** `guide/`를 런타임에 안 읽는다 — `force-static`을 빼거나 동적 API를 쓰면 Vercel에서만 500이 된다.
  각 파일 머리에 그 전제를 주석으로 둔다.
- **`next.config.ts`**: `htmlLimitedBots: /.*/` (spec D8). ⚠️ static `metadata` export도 동적 렌더 페이지에서는 스트리밍되므로
  (`node_modules/next/dist/server/lib/streaming-metadata.js`) 페이지별로는 못 막는다.
- **OG 이미지**: 사용자가 `public/og.png`(1200×630)를 둔다. 코드는 `OG_IMAGE` 상수로 루트와 `pageMetadata`에서 **항상** 싣는다 — 출처는
  그 상수 하나다. 파일이 없는 동안은 `og:image`가 404를 가리킨다(빌드는 통과). `twitter:image`는 `twitter.images`로 명시한다.
- **Analytics**: `components/analytics.tsx`(`"use client"`)가 `@vercel/analytics/next`의 `<Analytics beforeSend={redactAnalyticsEvent} />`를
  렌더하고 루트 레이아웃 body 끝에 둔다.
  - ⚠️ **루트에 두는 이유**: 추적 경로(`/`·`/signin`·`/docs`·`/privacy`)에 공통 레이아웃 세그먼트가 없다. 그래서 앱 화면에서도 스크립트가
    로드되고 **허용 목록이 유일한 거름망**이다 — 그것이 차단 목록이 아니라 허용 목록이어야 하는 이유다.
  - ⚠️ **서버 컴포넌트인 레이아웃에서 `beforeSend`를 직접 넘길 수 없다** — 함수는 RSC 경계를 못 넘고, 그 위반은 `next build`만 잡는다.
  - ⚠️ **`components/__tests__/client-graph.test.ts` 두 목록에 등재한다** — `ALLOWED`(npm 허용 목록, `:37`)에 `@vercel/analytics`,
    `CLIENT_LIB_FILES`(정확 일치, `:91`)에 `lib/seo/analytics.ts`. 등재 없이는 red가 확정이다. 잎 단언은 `lib/landing/stage.ts` 잎 검사와 같은 형.
  - **개발 서버에서는 렌더하지 않는다** — `process.env.NODE_ENV === "development"`면 `null`. dev 모드의 패키지는 `va.vercel-scripts.com` 디버그
    스크립트를 부르는데 CSP `script-src 'self'`가 막는다 — **CSP를 넓히지 않는다.** ⚠️ **`lib/env.ts`를 거치지 않는 예외다** — 클라이언트
    컴포넌트라 `lib/env`(서버 전용)를 그래프에 넣을 수 없고, `NODE_ENV`는 빌드가 치환하는 상수다. 프로덕션·preview는 동일 출처
    `/_vercel/insights/*`라 CSP 변경이 필요 없다.
  - **쿠키를 쓰지 않는다**(Vercel Web Analytics는 쿠키 없음) — `/privacy` 쿠키 절은 참으로 남는다. preview에서 확인한다.
  - `@vercel/analytics`가 아직 미설치라 `beforeSend` 시그니처·dev 동작은 **설치 후 `node_modules` 실물로 대조**한다(T10 첫 단계).

## 스키마 변경

없음.

## 새 환경변수

없음. `VERCEL_ENV`는 Vercel 시스템 변수이고 이미 `lib/invitation-email/send.ts`·`next.config.ts`가 읽는다. `.env.example` 변경 없음.

## 새 의존성

`@vercel/analytics` — **버전을 명시해 깐다**(`pnpm view @vercel/analytics version`으로 확인 후 정확한 값. `minimumReleaseAge: 1440`이
24시간 안 된 버전을 조용히 거른다). 빌드 스크립트가 없으므로 `onlyBuiltDependencies`에 넣지 않는다. CLAUDE.md 스택 표·README에 행을 더한다.

## 불변식 영향

- **§0 1–4(코어 엔진)**: 없음.
- **§0 5–11(테넌시·보안)**: 인가 경계는 그대로다 — 새 Route Handler 둘은 `guide/` 원고(이미 공개된 `/docs` 본문)만 낸다. middleware
  matcher(`/projects/:path*`·`/account`)에 영향 없음. **Analytics가 새 데이터 흐름**이다: 경로·referrer에 토큰이 실리는
  `/invite/<token>`·`/signin/link/<challenge>`와, 검색어·키·프로젝트 slug가 실리는 앱 URL이 Vercel로 나가지 않도록 `redactAnalyticsEvent`가
  **허용 목록**으로, 토큰 페이지의 `no-referrer`가 referrer 경로를 막는다.
- **개인정보 방침**: 새 **목적**(공개 페이지 방문 집계)이 생긴다. 전송처는 기존 Vercel(호스팅)과 같다. `messages/en.tsx`에서 **넷이 거짓이
  되거나 모자란다** — :455 적용 범위("the people who sign in" — 분석은 비로그인 방문자에 적용된다) · :462 "There is no analytics, advertising
  or tracking of any kind." · :516–523 목적 목록(방문 집계 항목 없음) · :560 Vercel 수탁 항목(경로·referrer·국가·기기/브라우저, 쿠키 없음).
  :598 쿠키 절은 **참으로 남는다**(쿠키 없는 분석) — 다만 수집 절과 서로 다른 말처럼 읽히지 않는지 문안 확인 때 같이 보인다.
  `effectiveDate`·개정 이력을 옮긴다(`policy-gate.test.tsx`가 요구한다). ⚠️ **배선과 방침은 같은 `/push`에 싣는다.**

## 과거 함정 (POSTMORTEM · 메모)

- **2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red**: `app/robots.ts`의 `VERCEL_ENV` 읽기는 함수 안.
- **브랜드 표기**(`brand-spelling.test.ts`): `m.seo`·조립 문자열은 화면 표기 `Malmoi`. ⚠️ `public/og.png`의 대체 텍스트는 `m.seo.ogImageAlt`라
  게이트 안에 있다(파일 옆 `.alt.txt`였다면 `.ts`/`.tsx`만 훑는 게이트 밖이었다).
- **공개 라우트의 인가 예외 등재**(`entry-points.test.ts`), **클라이언트 그래프 허용 목록**(`client-graph.test.ts`).
- **`pnpm build` during `pnpm dev` → stale**(메모): 로컬 build/start 검증 전에 dev를 멈추고, 끝나면 재시작한다.

## 문서 갱신 (정본 반영 — `/implement` 또는 `/push` 신선도 단계)

- PRODUCT IA 블록(비로그인 구역)에 `/robots.txt` · `/sitemap.xml` · `/llms.txt` · `/llms-full.txt` 행.
- DIRECTORY: `lib/seo/` · `app/robots.ts`·`sitemap.ts`·`llms*.txt/` · `components/analytics.tsx` · `public/og.png`.
- ARCHITECTURE: 짧은 절 하나 — `SITE_ORIGIN` 단일 기준 · 루트에 canonical을 두지 않는 이유(얕은 병합) · OG 이미지를 파일 규약으로 두지 않는
  이유 · robots 요청 시점 fail-closed · noindex 셋을 robots로 막지 않는 이유 · `htmlLimitedBots` · Analytics 허용 목록 + `no-referrer`.
- CLAUDE.md 스택 표 + README: `@vercel/analytics` 행.
- 기능 종료 시 `docs/features/seo-geo/` 삭제(spec 완료 조건 14).
