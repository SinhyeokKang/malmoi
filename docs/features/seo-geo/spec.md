# seo-geo — spec

## 사용자

**아직 malmoi를 모르는 개발자**(검색·AI 검색으로 들어오는 사람)와 **오너 자신**(유입을 보는 사람). 기존 두
사용자(개발자·번역 편집자)의 화면은 바뀌지 않는다 — 이 기능은 공개 페이지(`/`·`/docs/**`·`/privacy`)의
**머리(head)와 크롤러용 파일**, 토큰 페이지의 색인·referrer 신호, 그리고 분석 스크립트 하나를 건드린다.

PRODUCT §0이 "낯선 사람"을 출시 목표로 삼으므로 그 사람이 들어오는 입구를 다루는 것은 정합하다. ⚠️ §1의
"사용자 수는 성패가 아니다"와 부딪치지 않는다 — 유입 집계는 성패 지표가 아니라 **"낯선 사람이 도착은 하는가"의 관측**이다.

## 문제 (2026-09-27 실측 — dev 코드 + `mal-moi.com`)

- 메타데이터가 루트 `title`/`description` 하나다 → **모든 페이지의 `<title>`이 `Malmoi`** (docs 23페이지 포함).
  검색 결과에서 페이지가 서로 구별되지 않는다.
- `robots.txt`·`sitemap.xml`·`llms.txt` 전부 404. canonical·OG·Twitter·JSON-LD·`metadataBase` 없음.
- 초대 링크(`/invite/<token>`)·로그인 연결(`/signin/link/<challenge>`)에 색인 거부 신호가 없다.
- `/`·`/docs/**`는 세션을 읽어 동적 렌더라 Next가 metadata를 **스트리밍**한다 — HTML-limited 봇 목록 밖의 UA(GPTBot·
  ClaudeBot·PerplexityBot 포함)가 받는 HTML에서는 `<title>`·canonical이 `<head>`가 아니라 `<body>` 끝에 붙는다.
- 유입을 볼 수단이 없다. Vercel Web Analytics는 대시보드에서 켜 두었지만(사용자, 2026-09-27) 코드 배선이 없다.
- ⚠️ **프로덕션이 dev보다 125커밋 뒤다** — `mal-moi.com/`은 아직 `/signin`으로 307이고 랜딩·docs가 없다.
  이 기능의 효과는 `/merge` 이후에만 관측된다.

## 완료 조건

1. `<title>`: `/`는 `m.seo.homeTitle`(absolute), docs 개요는 `Malmoi Docs`, docs 하위 페이지는 `<SUMMARY 제목> · Malmoi Docs`,
   `/privacy`는 `Privacy Policy · Malmoi`, 앱 화면은 지금처럼 `Malmoi`. 404 둘은 각자 화면 h1 값.
   `<meta name="description">`: `/`는 `m.landing.hero.body`, docs는 그 페이지 첫 문단(`leadParagraph`), 없으면 `hero.body`.
2. 공개 페이지(`/`·`/docs`·`/docs/<slug>`·`/privacy`)만 `https://mal-moi.com` 기준 절대 canonical과 `og:url`을 갖는다.
   **그 밖의 페이지(앱·`/signin`·`/invite`·`/signin/link`·404)에는 canonical이 없다.**
3. `robots.txt`가 **요청 시점의** `VERCEL_ENV`로 판정한다 — `production`이면 전체 허용 + `/api/`·`/projects`·`/account` 거부 +
   sitemap 위치, 그 밖(preview·로컬·미상)이면 `Disallow: /` 하나. 빌드 경로(Promote 포함)와 무관하게 참이다.
4. `sitemap.xml`이 `/`·`/privacy`·`guide/SUMMARY.md`의 **모든** 페이지(23)를 담아 25건이고 그 밖을 담지 않는다.
5. `/invite/**`·`/signin`·`/signin/link/**`가 `noindex, nofollow`를 내고, 공개 페이지에는 `noindex`가 **없다**.
   `/invite/**`·`/signin/link/**`는 `<meta name="referrer" content="no-referrer">`도 낸다.
6. **(U1 완료 뒤)** 공개 페이지 전부와 `/docs/<깊은 slug>`가 `og:title`·`og:description`·`og:url`·`og:site_name=Malmoi`·
   `og:image`(`/og.png` 절대 URL)·`twitter:card=summary_large_image`·`twitter:image`를 낸다. `og:title`은 페이지 제목만이고 브랜드는
   `og:site_name`이 든다.
7. 랜딩에 `SoftwareApplication`+`Organization`, docs 하위 페이지에 `TechArticle`+`BreadcrumbList` JSON-LD가 있고
   **validator.schema.org 오류 0**이다. Rich Results Test는 경고를 허용한다 — **평점·리뷰 필드는 넣지 않는다**(없는 데이터다).
8. `/llms.txt`(목차 — 제목·절대 URL·한 줄 요약)와 `/llms-full.txt`(가이드 원고 전문)가 200 `text/plain`이다.
   같은 `guide/` 상태에서 **각 파일을 두 번 생성하면** 바이트가 같다(sitemap도 같다).
9. 스트리밍 metadata가 꺼져 있다 — `curl -A GPTBot`으로 받은 `/docs/<slug>` HTML에서 `<title>`·canonical이 `</head>` 앞에 있다.
10. Vercel Web Analytics 대시보드에 추적 경로(`/`·`/signin`·`/docs`·`/docs/<slug>`·`/privacy`) 방문이 집계되고, **그 밖의 경로·
    쿼리 문자열·토큰이 든 referrer가 한 건도 전송되지 않는다**(`beforeSend` 단위 테스트 + preview 페이로드 + 대시보드 Pages 목록).
11. `/privacy` 본문이 분석 수집을 말한다 — `messages/en.tsx`의 적용 범위(:455) · "no analytics" 문장(:462) · 목적 목록(:516–523) ·
    Vercel 수탁 항목(:560) 넷이 개정되고, 쿠키 절(:598)은 참으로 남으며, 시행일·개정 이력이 옮겨졌다. **10과 같은 `/push`로 나간다.**
12. 인용 가능 문장 점검 결과가 **넘겨졌다** — 랜딩 몫은 Claude Design 시안 수정 제안으로, 가이드 몫(`/docs` 개요 첫 문단 포함)은
    `/guide` 입력으로.
13. Search Console Sitemaps 상태가 Success이고 발견 URL이 25다. Bing Webmaster에도 sitemap이 제출됐다(수동).
14. 결론이 정본(PRODUCT IA·ARCHITECTURE·DIRECTORY·CLAUDE.md·README)에 문장으로 남았고 `docs/features/seo-geo/`가 지워졌다.

## 결정 (사용자, 2026-09-27)

| # | 판정 | 이유 |
|---|---|---|
| D1 | AI 학습 크롤러(GPTBot·Google-Extended·ClaudeBot 등) **전부 허용** — robots에 별도 거부 규칙을 두지 않는다 | 공개 제품 문서이고 목표가 노출이다 |
| D2 | OG 이미지는 **정적 1장, 사용자가 직접 만든다** — `public/og.png`, 코드는 그 경로를 항상 싣는다 | 페이지별 동적 OG는 공유 수요가 생긴 뒤 |
| D3 | Vercel Web Analytics를 **넣는다**(대시보드 enable은 사용자가 완료) — 수집은 **추적 경로 허용 목록만**, 쿼리·해시는 벗긴다 | 목적이 유입 측정이고, 앱 URL엔 초대 토큰·프로젝트 slug·검색어가 실린다. ⚠️ **`utm_*`도 사라진다** — 유입 경로는 referrer만 남는 손실을 알고 받아들였다 |
| D4 | 방침 문안은 `/implement`가 쓰고 **커밋 전에 사용자 확인**을 받는다 | 법적 문서다 |
| D5 | `llms-full.txt`는 원고를 **그대로** 싣고 페이지마다 `Source: <절대 URL>` 줄을 단다 — 상대 `.md` 링크는 바꾸지 않는다 | 링크 재작성엔 `remark-stringify` 새 의존성이 필요하다 |
| D6 | `/signin`도 `noindex` | 로그인 폼은 검색 가치가 없고, 브랜드 검색은 랜딩이 받는다 |
| D7 | 랜딩 문구는 이 기능에서 **고치지 않는다** — 점검 리포트만 | Claude Design 시안이 정본이다 |
| D8 | 스트리밍 metadata를 **전 UA에서 끈다**(`htmlLimitedBots: /.*/`) | D1이 겨냥한 AI 봇이 Next의 HTML-limited 목록 밖이다. `generateMetadata`가 `cache`된 fs 읽기라 TTFB 비용이 거의 없다 |
| D9 | 제목: 루트 기본 `Malmoi` 유지 · 랜딩만 absolute · docs는 `· Malmoi Docs` | 루트 default를 바꾸면 앱 탭 22개가 마케팅 문구가 된다. `Every night · Malmoi`만으로는 무슨 페이지인지 모른다 |
| D10 | 추적 경로에 `/signin` 포함 · `/docs` 하위는 `[A-Za-z0-9-]+` 세그먼트만 | 랜딩→가입 전환이 보인다(쿼리를 벗기면 토큰 없음). 임의 문자열·`%2F` 인코딩 경로를 거른다 |
| D11 | robots는 **요청 시점** 판정(`force-dynamic`) | 빌드 시점 값은 Promote to Production이 preview 산출물을 올리면 프로덕션을 `Disallow: /`로 고정할 수 있다 |
| D12 | 홈·`og`·`llms.txt` 머리·docs 폴백 설명은 `m.landing.hero.body` 재사용 | 이미 화면에 있는 문장이라 새 사본·시안 밖 문구가 없다(D7과 충돌 안 함) |
| D13 | 순수 함수를 줄인다 — 랜딩 JSON-LD는 상수, 경로 판정은 비공개, docs 입력 조립은 호출부 | 인자 없는 빌더는 상수가 맞고, 테스트는 공개 함수로 다 덮인다 |

## 비목표

- **랜딩 문구 수정** — D7. 점검 결과는 시안 → `/design-sync` 별건.
- **OG 이미지 제작** — 사용자 몫. 페이지별 동적 OG(`next/og`)는 공유 수요가 생긴 뒤.
- **`apple-icon`·PNG 파비콘** — `app/icon.svg` 하나로 둔다(Google 검색 결과는 SVG를 받는다). iOS 홈 화면·일부 unfurl 아이콘은 비목표.
- **docs 정적화** — 레이아웃이 세션을 읽어 동적이다. D8로 크롤러 문제는 닫힌다.
- **hreflang** — 화면 문구가 en 단일이다(PRODUCT §10에서 ko가 열리면 그때).
- **Speed Insights·서드파티 분석(GA 등)·커스텀 이벤트(`track()`)** — 요청 범위는 Web Analytics 페이지뷰 하나다.
- **페이지별 raw markdown 경로**(`/docs/<slug>.md`) — `llms-full.txt`가 같은 필요를 rewrite 없이 채운다.
- **평점·리뷰 구조화 데이터** — 없는 데이터다(완료 조건 7).
