# seo-geo — tasks

순서: 순수 함수(테스트 먼저) → 호출부 배선 → 방침·문서 → 수동. `/tdd interface`가 T1–T5의 테스트를 먼저 박고, `/implement`가 구현한 뒤
커밋한다. `(← Tn)`은 의존이다.

⚠️ **로컬 `pnpm build && pnpm start` 검증 전에는 `pnpm dev`를 멈추고, 끝나면 dev를 재시작한다** — 같은 `.next`를 덮어써 서버 컴포넌트가
stale이 된다(메모 build-while-dev).

## 사용자 몫 (선행 — 코드와 병행 가능)

- **U1. OG 이미지 1장 제작** — `public/og.png`, 1200×630 PNG, 8MB 이하. 텍스트는 가운데 약 1000×520 안(슬랙·X·카톡이 가장자리를 자른다).
  대체 텍스트는 `m.seo.ogImageAlt`(T2가 만든다)에 영어 한 문장 — 표기 `Malmoi`, 제목 반복이 아니라 이미지 내용 묘사.
  검증: T6 뒤 로컬 HTML의 `og:image`가 `https://mal-moi.com/og.png`이고 `curl -sI localhost:3000/og.png`가 200.
  ⚠️ 파일이 없어도 나머지 태스크는 막히지 않는다 — spec 완료 조건 6만 U1 뒤다.

## 순수 함수 (`lib/seo/` — 테스트 먼저)

- **T1. `SITE_ORIGIN` · `robotsFor` · `sitemapEntries`**
  검증(`pnpm test`): `robotsFor("production")`만 허용 규칙, `"preview"`·`"development"`·`undefined`·`"weird"`는 `Disallow: /`.
  sitemap 항목 수 = `flattenNav(loadSummary()).length + 2`, 중첩 장이 SUMMARY 순서, 개요 URL이 `https://mal-moi.com/docs`(끝 `/` 없음),
  `/signin` 없음, 두 번 호출이 `toStrictEqual`.
- **T2. `m.seo` 절 · `OG_IMAGE` · `pageMetadata`**
  검증(`pnpm test`): 반환에 `alternates.canonical`·`openGraph.{title,description,url,siteName,type,images}`·`twitter.{card,images}`가 **전부**
  있다(얕은 병합 회귀). `openGraph.title`에 `· Malmoi`가 없다. `openGraph.images[0].url === "/og.png"`. brand-spelling·no-korean-ui green.
- **T3. `jsonLdHtml` · `LANDING_LD` · `docLd`**
  검증(`pnpm test`): `</script><script>alert(1)</script>`·U+2028을 담은 값의 출력에 `<`·원문 U+2028이 0개. `LANDING_LD`에
  `aggregateRating`·`review` 없음, `offers.priceCurrency === "USD"`. `docLd`의 breadcrumb `position`이 1부터 연속, 장 URL이 `docHref([slug[0]])`.
- **T4. `llmsIndex` · `llmsFull` + `lib/guide/load.ts`의 `loadSource`**
  검증(`pnpm test`): **형식은 fixture로 정확한 문자열을 고정한다** — 요약 null 항목(`: …` 없이 끝남), 제목에 `]`·`&`·`*`가 든 항목, 끝 개행 1개.
  **실제 원고로는 파생값만 단언한다** — 항목 수 = `flat.length`, 두 번 호출 바이트 동일(원고가 바뀌어도 안 깨진다). `loadSource(file)`이
  SUMMARY 등재 파일의 `readFileSync` 결과와 같다(`lib/guide/__tests__/load.test.ts`).
- **T5. `redactAnalyticsEvent`**
  검증(`pnpm test`): `null` — `/invite/abc` · `/signin/link/x` · `/projects/p?q=secret` · `/account` · `/docsx` · `/privacyx` · `/Docs` ·
  `/docs/` · `/privacy/` · `/docs/..%2Finvite%2Ftok` · `/docs/a_b`. 통과 — `/docs/setup?utm=1#a` → `https://dev.mal-moi.com/docs/setup`
  (**origin 유지**), `/?q=x` → `/`, `/signin?error=x` → `/signin`, `type: "event"` 이벤트도 같은 규칙.
  모듈의 값 import가 0개(잎 — T10의 client-graph 단언과 짝).

— 커밋 ①: `feat(seo): add pure SEO, llms and analytics redaction helpers` (T1–T5 + 테스트)

## 호출부 배선

- **T6. 메타데이터 + 스트리밍 끄기** (← T2) — 루트 `metadataBase`·title·openGraph·twitter(**canonical 없음**) · `/`(absolute) · `/privacy` ·
  `app/docs/layout.tsx` 템플릿 · docs `generateMetadata` · `app/not-found.tsx` · noindex 셋(+ 토큰 둘의 `referrer`) · `next.config.ts`
  `htmlLimitedBots: /.*/`.
  검증 — 자동(`pnpm test`): 토큰·로그인 페이지 셋의 `metadata.robots`가 `{ index: false, follow: false }`, 토큰 둘의 `referrer === "no-referrer"`.
  docs `generateMetadata`를 SUMMARY 전 항목에 대해 불러 title(`absolute` 개요 / 하위는 SUMMARY 제목)·canonical 절대 URL, 없는 slug는
  canonical 없음. 루트 `metadata`에 `alternates`·`openGraph.url`이 **없다**. 공개 페이지 metadata에 `robots` noindex가 없다
  (`app/__tests__/docs-page.test.tsx`·`landing-page.test.tsx` 옆에 둔다). `app/__tests__/security-headers.test.ts`처럼 `next.config.ts`를 불러
  `htmlLimitedBots` 존재를 단언한다.
  검증 — 수동(로컬 build/start): `curl -s -A GPTBot localhost:3000/docs/setup/create-project`에서 `<title>Create a project · Malmoi Docs</title>`과
  canonical이 **`</head>` 앞**. `/privacy`·깊은 slug에 `og:image`·`twitter:image`가 선다.
- **T7. JSON-LD 렌더** (← T3, T6)
  검증(`pnpm test`): `landing-page.test.tsx`와 `docs-page.test.tsx`에서 `script[type="application/ld+json"]`을 `JSON.parse`해 `@type` 확인 —
  랜딩 1장(`SoftwareApplication`·`Organization`), docs 하위 1장(`TechArticle`·`BreadcrumbList`), docs 개요 0개. 배포 뒤 validator는 M3.
- **T8. `app/robots.ts`(force-dynamic) · `app/sitemap.ts`** (← T1)
  검증: `pnpm build` 라우트 표에서 `/robots.txt`가 ƒ(Dynamic), `/sitemap.xml`이 ○(Static). 로컬 `curl localhost:3000/robots.txt`가
  `Disallow: /`, `VERCEL_ENV=production pnpm start`(빌드 재실행 불필요 — 요청 시점 판정)에서 허용 규칙 + `Sitemap:`.
- **T9. `/llms.txt` · `/llms-full.txt`** (← T4) — Route Handler 둘 + `entry-points.test.ts` `EXEMPT`에 `llms.txt/route.ts`·`llms-full.txt/route.ts`
  (이유 주석) + 파일 트레이싱 전제 주석.
  검증: `pnpm test`(entry-points) green · `pnpm build` 라우트 표에서 둘이 ○(Static) · `curl -sI localhost:3000/llms.txt`가 200 `text/plain; charset=utf-8`.

— 커밋 ②: `feat(seo): wire metadata, JSON-LD, robots, sitemap and llms.txt`

- **T10. Vercel Web Analytics** (← T5) — `pnpm add @vercel/analytics@<정확한 버전>` → **설치 직후 `node_modules`에서 `beforeSend`·`BeforeSendEvent`
  시그니처와 dev 동작을 대조**(T5 타입과 어긋나면 T5부터 고친다) · `components/analytics.tsx`(`"use client"`, dev에서 `null`) · 루트 레이아웃 body 끝 ·
  `client-graph.test.ts`의 `ALLOWED`에 `@vercel/analytics`(이유 주석), `CLIENT_LIB_FILES`에 `lib/seo/analytics.ts`, 잎 단언.
  검증 — 자동: `pnpm typecheck && pnpm test`(client-graph) · **`pnpm build`**(RSC 경계 — 함수 prop 위반은 여기서만 잡힌다).
  검증 — 로컬 수동: `pnpm dev` HTML에 `va.vercel-scripts.com`·`_vercel/insights` 요청 0건(렌더 안 함).
  검증 — preview 수동: 콘솔 CSP 위반 0 · DevTools Network에서 `/_vercel/insights/view`가 `/`·`/signin`·`/docs/**`·`/privacy`에서만 나가고
  `/projects`에서는 안 나감 · 초대 페이지 → 푸터 Docs를 cmd-click → 새 탭 pageview 페이로드의 referrer에 토큰 경로 없음 · Application 탭 쿠키 증가 0.
- **T11. 개인정보 방침 개정** (↔ T10 같은 `/push`) — `messages/en.tsx` :455 적용 범위 · :462 "no analytics" · :516–523 목적 목록 · :560 Vercel 수탁 항목
  · `effectiveDate` · 개정 이력. :598 쿠키 절은 **유지**(쿠키 0).
  ⚠️ **문안을 커밋 전에 사용자에게 보인다**(spec D4) — :598과 수집 절이 서로 다른 말처럼 읽히지 않는지도 같이. 승인 없이 커밋하지 않는다.
  검증: 사용자 승인 · `pnpm test`(`policy-gate.test.tsx`) green · T10 preview의 쿠키 0.

— 커밋 ③: `feat(analytics): add Vercel Web Analytics for public pages` (T10) · 커밋 ④: `docs(privacy): disclose page-view analytics` (T11)
  ⚠️ ③·④는 한 `/push`로 나간다 — 방침보다 수집이 먼저 배포되는 창을 만들지 않는다.

## 점검 리포트 (코드 안 고침)

- **T12. 인용 가능 문장 점검** — 랜딩 hero·closing과 docs 개요(`guide/README.md` 첫 문단 — 지금은 "Set up a project…"로 Malmoi가 무엇인지 안 말한다)에
  "Malmoi는 무엇이고 누구를 위한 것인가"를 한 문단으로 정의하는 문장이 있는지, 지원 포맷·동작 방식(push/pull·PR)이 문장으로 서 있는지 본다.
  산출은 **넘기는 것까지다** — 랜딩 몫은 Claude Design 시안 수정 제안(사용자에게 전달), 가이드 몫은 `/guide` 입력. 이 디렉터리에 파일로 남기지 않는다
  (기능 종료 때 지워진다). 검증: 사용자 확인.

## 정본 문서 (`/push` 4단계 신선도에서)

- **T13.** PRODUCT IA · DIRECTORY · ARCHITECTURE 절 · CLAUDE.md 스택 표 + README — 문서별 커밋(`docs(PRODUCT): …` 꼴).
  검증: `pnpm sync:agents:check` green(CLAUDE.md를 고쳤으므로 미러 재생성).

## 수동 (프로덕션 `/merge` 뒤)

- **M1.** `curl -s https://mal-moi.com/robots.txt` 허용 규칙 + `Sitemap:` · `sitemap.xml` 항목 25 · `llms.txt`·`llms-full.txt` 200.
- **M2.** Search Console에 `https://mal-moi.com/sitemap.xml` 제출 → Sitemaps 상태 Success · 발견 URL 25. URL 검사로 `/`·`/docs` 색인 요청.
- **M3.** validator.schema.org — `/`·`/docs/setup/create-project` 오류 0. Rich Results Test는 경고 허용(평점 없음).
- **M4.** Bing Webmaster Tools 등록(Search Console 가져오기) + sitemap 제출 — ChatGPT 검색·Copilot이 Bing 색인을 쓴다.
- **M5.** GitHub 리포 About의 Website에 `https://mal-moi.com`, README 머리에 링크.
- **M6.** Vercel Analytics 대시보드 Pages 목록에 추적 경로 밖(`/invite`·`/signin/link`·`/projects`·`/account`)과 쿼리가 없음.
- **M7.** 정본 반영 확인 뒤 `docs/features/seo-geo/` 삭제(spec 완료 조건 14).
