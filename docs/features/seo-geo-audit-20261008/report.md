# SEO·GEO 감사 — 2026-10-08

색인을 막는 결함은 없다(🔴 0). 가장 큰 실제 손실은 **모바일 공개 페이지가 가로 스크롤이 아니라 약 0.3배로 축소돼 본문이 ~5px로 보이는 것**(6번, 제품 결정)이고, 코드로 바로 고칠 것 중 우선은 **무료·비범위·MCP·지원 확장자 같은 도입 판단 사실이 사이트·llms에 비어 있는 것**(1·10·11·12·13·14번)과 **`www.mal-moi.com` 미해석**(16번)이다.

이 리포트는 Codex 1차 감사(1–8번)를 Claude Code 세션이 검증·보정하고, 독립 감사(9–23번)를 더해 완성했다.

## 미완 검증 (먼저)

- 실제 색인 수·검색 순위·CTR·AI 인용률·백링크 — Search Console·Bing·대시보드를 보지 않았다.
- **CWV 실사용 값(CrUX)과 INP** — lab 1회 측정만 있다(스로틀 없음, 데스크톱 Chromium의 모바일 에뮬레이션). 실기기 iOS Safari·Android Chrome 미확인.
- 실제 봇 IP 접근·Vercel 방화벽의 봇 규칙·GitHub 리포 About/topics·SNS 미리보기 실물.
- Rich Results Test 실행.

## 범위와 방법

- 대상: 로컬 `dev` HEAD `1f96456f`의 코드·원고·테스트, 프로덕션 `https://mal-moi.com`의 비로그인 응답(2026-10-08). 로컬과 배포본이 같은 커밋이라는 보장은 없으므로 코드 근거와 HTTP 근거를 구분했다.
- GEO는 생성형 검색·AI 답변에서 발견되고 근거로 인용될 가능성을 뜻한다.
- 1차(Codex): 기술 SEO·콘텐츠/GEO 두 에이전트 + 사이트맵 34 URL 전수 GET.
- 2차(Claude Code): ① 1차 8건의 인용·재현·시급도 검증 ② 독립 기술 SEO ③ 독립 콘텐츠/GEO ④ **전체 내부 링크·앵커·외부 링크·이미지 전수** ⑤ ego-browser lab 성능·390px 렌더 실측. 핵심 신규 주장(www DNS·docs 404·이미지 lazy·formats 도입문·og.png 크기)은 메인 세션이 다시 재현했다.
- 읽기 전용: 코드 수정·빌드·테스트·마이그레이션 없음. 일반 보안/DB/어댑터 감사와 POSTMORTEM 전수 검사는 범위 밖이며 `/audit` 완료로 주장하지 않는다.

## 검증 결과

| 영역 | 관찰 | 판정 |
| --- | --- | --- |
| 공개 문서 접근 | 홈·문서 31·changelog·privacy 34개 모두 200, 리다이렉트 없음 | 정상 |
| 제목·설명 | 34개 모두 존재, 제목 고유. `/docs`(262자)·`/docs/account/preferences`(263자) 설명이 SERP 길이를 크게 넘음 | 정상; 21번 |
| canonical | 34개 자기 URL. `?ref=`·`utm`·`/index`·`/docs/index`도 정규 URL로 canonical | 정상 |
| 리다이렉트 | HTTP→HTTPS, 끝 슬래시·`/docs//faq`·`/docs/language` 308. 대소문자 변형은 404 | 정상 |
| www | `www.mal-moi.com` DNS 응답 없음 | **16번** |
| robots·sitemap | `*` 허용, 사이트맵 34개 = canonical과 문자 일치, 앱·`/signin`·리다이렉트 URL 제외 | 정상; AI 학습 봇 허용 의도 미기록(23번) |
| 비공개 경로 | `/signin`·`/invite/*`·`/oauth/authorize` 200 + `noindex, nofollow`; `/projects`·`/account`·`/mcp`·`/signin/link/*` 307 | 정상 |
| 404 | 루트 404 정상(SSR 텍스트 있음). **docs 404는 상태·noindex는 맞으나 SSR 가시 텍스트 0, 제목 오류** | **18번** |
| 헤더 | brotli, HSTS preload, 공개 HTML `private, no-store`(CSP nonce — 정책 비용) | 정상; 정적 자산 캐시 19번 |
| 구조화 데이터 | 홈 SoftwareApplication·Organization, docs TechArticle·BreadcrumbList | 파싱 정상; 2·3·20번 |
| 헤딩 | docs 31쪽 h1 1개·단계 건너뜀 없음, privacy h1 1개 | 정상; changelog h1 76개는 기록된 결정 |
| **내부 링크 전수** | `<a>` 1,481개 — 내부 1,390(고유 35) 전부 200·리다이렉트 경유 0, 앵커 146(고유 112) 누락 0, 외부 22 전부 200, 이미지 30 전부 200, llms.txt 링크 31 전부 절대·200, 고아 페이지 0 | 정상 |
| 이미지 | docs 이미지 모두 alt·width·height(CLS 안전). 홈은 `<img>` 없음(인라인 SVG) | 정상; 15번 |
| AI 문서 | `/llms.txt` 5.7KB, `/llms-full.txt` 76KB(~19k 토큰), HTML 잔재 없음 | 정상; 4·9번 |
| 봇 UA | Googlebot·OAI-SearchBot·GPTBot·ClaudeBot·PerplexityBot UA 모두 200. robots·middleware·vercel.json에 UA 차단 없음 | 차단 없음(IP/WAF 통과 증명은 아님) |
| 사실 정합성 | 한도(프로젝트 3·멤버 10·초대 20/h·파일 200/2MB/10MB·키 20,000·언어 200·값 10,000자)·야간 18:00 UTC·포맷 5종 = 코드와 일치 | 정상; 확장자 누락은 12번 |
| lab 성능 | 홈 LCP 808ms(390)/384ms(1440), FAQ 672/436ms, CLS 0. LCP 요소는 텍스트(h1·첫 답변) | 양호(lab); 8·15번 |

`noindex`가 없고 robots가 허용한다는 것은 색인 가능 조건일 뿐 실제 색인 증거가 아니다.

## 1차 감사 보정 요약

| # | 1차 시급도 | 보정 | 사유 |
| --- | --- | --- | --- |
| 1 | 🟡 | 🟡 유지 | 권고 보정: hero.body 고정, AUTHORING:177은 "과금 없음"을 FAQ 주제로 허용(약속만 금지) |
| 2 | 🟡 | **⚪** | 쿠키 없는 크롤러는 en만 받음. 인용 줄 보정 |
| 3 | ⚪ | ⚪ | 원인 위치 보정(`parentSlugOf`가 의도대로 `[]`) |
| 4 | 🟡 | **⚪** | 명시 트레이드오프(D5) + 절대 `Source:` 존재. 테스트·결정 기록 반전 필요 |
| 5 | 🟡 | **⚪** | `/privacy` 루트 상대 링크는 게이트가 막음 → 절대 URL만 가능 |
| 6 | 🟡 | 🟡 + **결정 우선순위 1** | 실측 증상이 "가로 이동"이 아니라 전체 0.3배 축소 |
| 7 | 🟡 | **⚪**, 10·22번과 묶음 | 근거 코드 없는 의견. 구체 누락은 10번이 대체 |
| 8 | ⚪ | ⚪ | 원인 특정(씬이 SSR HTML + RSC 두 벌), lab 성능은 양호 |

인용 오류 보정: `page.tsx:110`은 주석(호출은 `:111-116`) · `docs/PRODUCT.md:373`은 §4.1(만드는 것)이고 비범위는 `:436` 하나 · `lib/seo/analytics.ts:6`→`:7`(쿼리·해시 제거)·`:12`(허용 목록) · `release-entry.tsx:19`→`:21`.

## 발견 사항 — 전체 연번

시급도: 🔴 중대 차단, 🟡 보완 권장, ⚪ 낮은 영향. 🧭는 제품 결정이 먼저 필요한 항목이다. 순위 하락·제재가 실제 발생했다는 뜻이 아니다.

### A. 사실 정합성 — 기계와 사람에게 다른 정보

#### 1. 🟡 [콘텐츠/GEO] 무료라는 사실을 JSON-LD만 말한다

- 근거: `lib/seo/json-ld.ts:31` `offers.price: "0"`(근거 주석 `:20` — 과금은 PRODUCT §4.2 비범위). 랜딩(`messages/en.tsx:532~`)·`guide/en/`에는 무료 정책 설명이 없다(`guide/en` 의 free는 `ai-agents/browser.md:58`의 claude.ai "Free plan" 하나). `README.md:9` `Free, no paid plans`, `:11` MIT.
- 실측: 홈 가시 텍스트에서 `free|pricing|paid|MIT|price` 0건, JSON-LD엔 `"price":"0"`.
- 영향: 구조화 데이터와 가시 본문이 어긋나고, "무료인가?"에 사이트·llms가 직접 답하지 못한다.
- 권고: **`hero.body`는 건드리지 않는다**(`en.tsx:540` — description·og·llms 머리·JSON-LD로 전파된다). 랜딩의 별도 문장 + FAQ 문항으로 넣는다. FAQ는 `guide/AUTHORING.md:177`이 "과금 없음"을 PRODUCT 정본 주제로 이미 허용하므로 **현재 사실**("Malmoi has no paid plans", MIT)로 쓰고 미래 약속은 쓰지 않는다. 사전 키·FAQ 원고 en·ko·es 같은 커밋.
- 완료 기준: 익명 홈 HTML·FAQ·llms-full에 같은 사실이 있다. `json-ld.test.ts:34`(price 0 고정)와 충돌 없음.
- 기준: [Google 구조화 데이터 일반 지침](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

#### 2. ⚪ [기술 SEO] ko·es 문서의 TechArticle이 `inLanguage: "en"`이다

- 근거: `lib/seo/json-ld.ts:66` 고정값. `app/docs/[[...slug]]/page.tsx:110` 주석이 "JSON-LD는 본문과 같은 화면 언어다(메타와 달리)"라고 의도를 밝히고 `:111-116`이 화면 언어의 제목·설명을 넘긴다.
- 재현: `/docs/faq` + `Cookie: malmoi-ui-locale=ko` → `<html lang="ko">`, headline "자주 묻는 질문", `inLanguage:"en"`. es·`/docs/setup` 동일.
- 정책 충돌 없음: 영어 고정 표면(`docs/ARCHITECTURE.md:2911-2912`, `docs/PRODUCT.md:373-374`)에 JSON-LD는 없다. 고치는 쪽이 `:110`의 의도를 지키는 것이다.
- 추가: breadcrumb 첫 항목 "Docs"(`json-ld.ts:58`)와 publisher가 en 고정이라 ko 응답의 한 JSON-LD에 두 언어가 섞인다.
- 영향: 쿠키 없는 크롤러는 en만 받으므로 기본 색인엔 영향이 없다 → ⚪.
- 권고: `docLd`에 실제 문서 언어를 넘기고 breadcrumb 루트 이름도 같은 언어로.
- 완료 기준: en·ko·es에서 `html lang`·본문·`inLanguage`·breadcrumb 이름이 일치. `inLanguage`를 고정하는 테스트가 없으므로 `json-ld.test.ts`에 추가.

#### 3. ⚪ [기술 SEO] FAQ breadcrumb에 `/docs`가 두 번 나온다

- 실측: en·ko·es 모두 `Docs(/docs) → Malmoi(/docs) → FAQ`.
- 원인: `json-ld.ts:58`이 Docs를 항상 붙이고, `page.tsx:108-109`의 `parentSlugOf`가 FAQ에 의도대로 `[]`(루트)를 준다(`lib/guide/__tests__/summary.test.ts:145-147`이 고정). SUMMARY상 README 아래 자식은 FAQ뿐이라 영향 페이지도 FAQ 하나다.
- 권고: `parentSlug`가 빈 배열이면 `page.tsx`에서 `chapter: null`. `parentSlugOf`와 그 테스트는 그대로.
- 완료 기준: FAQ는 `Docs → FAQ`, 하위 장 문서는 `Docs → 장 → 페이지` 유지.

### B. AI 인용 경로 — llms·원고

#### 9. 🟡 [GEO] llms.txt가 진입 파일의 절반만 쓴다 *(신규)*

- 근거: `lib/seo/llms.ts:24` — 머리가 H1 + 블록인용 한 문장(`landing.hero.body`)뿐. 무료·MIT·GitHub 전용·MCP·비범위를 담은 사실 문단이 없고 `/llms-full.txt`·`/changelog`·`/privacy`·GitHub 리포 링크가 없다. 첫 H2가 H1과 같은 `## Malmoi`.
- 영향: 에이전트가 진입 파일 하나로 "무엇·얼마·소스 위치·최신 변경"을 판단하지 못한다.
- 권고: 블록인용 뒤 사실 문단 1개(PRODUCT·README의 기존 문장에서만), 끝에 `## Optional` 절로 llms-full·changelog·privacy·GitHub 링크, 첫 H2는 `Overview` 등으로. llms는 en 전용 표면이라 3언어 규칙과 무관.
- 완료 기준: 프로덕션 llms.txt에 네 링크와 사실 문단, `llms.test.ts` 결정성 유지.
- 기준: [llms.txt 제안](https://llmstxt.org/). Google은 별도 AI 텍스트 파일을 요구하지 않으므로([AI features](https://developers.google.com/search/docs/appearance/ai-features)) 존재·형식만으로 GEO 성과를 판정하지 않는다.

#### 4. ⚪ [GEO·수용된 제약] llms-full의 상대 `.md` 링크가 공개 주소로 풀리지 않는다

- 근거: `lib/seo/llms.ts:28-29` — 재작성엔 remark-stringify 새 의존성이 필요해 원문 그대로 둔다(결정 D5). `guide/en/faq.md:7`의 `sync/README.md#how-it-works` 등 약 35개.
- 재현: `/sync/README.md`·`/docs/sync/README.md` 404, `/docs/sync` 200.
- 영향: 일반 Markdown으로 읽는 도구가 상세 링크를 못 따라갈 수 있다. 페이지마다 절대 `Source:`가 있어 접근 자체는 막히지 않는다 → ⚪.
- 권고(재검토 시): 해석기는 실재한다(`lib/guide/collect.ts:34` `resolveDocLink`). 다만 stringify 없이 정규식으로 치환하면 코드 스팬 속 링크를 잘못 바꿀 위험이 있다.
- 바꾼다면: `lib/seo/__tests__/llms.test.ts:65`("상대 링크를 고치지 않는다") 반전 + ARCHITECTURE의 D5 갱신이 함께 필요하다.

#### 5. ⚪ [GEO] FAQ의 개인정보 안내가 llms에 없는 "푸터"를 가리킨다

- 근거: `guide/en/faq.md:59`("in the footer"), `:63`(링크 없음). llms-full 75·79행에 같은 문장.
- 권고: `https://mal-moi.com/privacy` **절대 URL**만 가능하다 — 루트 상대 `/privacy`는 `resolveDocLink`가 `invalid: absolute`로 원고 게이트를 red로 만든다(`collect.ts:40`). 절대 URL은 사이트에서 외부 링크(새 탭)로 분류되고 preview에서도 프로덕션을 가리킨다는 비용이 있다. ko·es 함께.
- 완료 기준: llms 원문만으로 방침 주소를 찾을 수 있다. 방침 본문은 복제하지 않는다.

### C. 도입 판단 사실의 누락 — 콘텐츠/GEO

#### 10. 🟡 [GEO] "Malmoi가 하지 않는 것"이 README에만 있다 *(신규)*

- 근거: README의 비범위(ICU 복수형·번역 메모리·기계 번역·승인·동시 편집·in-context 편집·스크린샷·번역자 노트, "Crowdin or Tolgee is a better fit")가 `guide/en`에 대부분 없다 — `ICU`·`plural` 0건. FAQ는 기계 번역·승인만 다룬다.
- 영향: "ICU 복수형을 지원하나?"에 사이트 근거가 없어 AI가 추측하거나 README만 인용한다. 1차 7번의 "지원하지 않는 기능 묶음"보다 구체적인 사실 누락이다.
- 권고: FAQ에 "What doesn't Malmoi do?" 한 문항(정본 PRODUCT §4.2, en·ko·es). 🧭 경쟁사 이름을 넣을지는 결정 사항 — PRODUCT §2는 대체품 프레이밍을 피한다.
- 완료 기준: llms-full에 `ICU` 1회 이상, 세 언어 앵커 동일.

#### 11. 🟡 [GEO] Reference 페이지 도입문이 지시문이라 사실이 없다 *(신규)*

- 근거: `guide/en/reference/formats.md:3` "Check which translation file formats Malmoi can read and write.", `limits.md:3` "Check the fixed limits…". 이 문단이 meta description·TechArticle description·llms.txt 요약으로 그대로 나간다.
- 영향: 가장 인용될 두 페이지의 요약에 포맷 이름도 숫자도 없다.
- 권고: 도입 1~2문장을 정의형으로(예: "Malmoi reads and writes JSON and YAML catalogs, Chrome extension messages, and TypeScript or JavaScript code dictionaries."). AUTHORING의 도입 규칙(굵게·링크 금지) 안에서 가능. 세 언어.
- 완료 기준: 두 페이지 description에 포맷 이름과 대표 숫자(3·10·2 MB)가 있다.

#### 12. 🟡 [GEO] 포맷 정본 페이지가 지원 확장자·레이아웃을 덜 적는다 *(신규)*

- 근거: 코드는 `.ts/.tsx/.js/.mjs`(`lib/adapters/code-dict.ts:45`), `.ts/.tsx`(`ts-dict.ts:268`), `.yml/.yaml`(`yaml-catalog.ts:44`), 로케일 디렉터리 `<dir>/<locale>/<name>.json`과 접두사 파일명(`json-catalog.ts:27-29`)을 받는다. `guide/en/reference/formats.md:9-15` 예시는 `.ts`·`.yml`·`{locale}.json`뿐. 랜딩은 "JS/TS", FAQ는 "TypeScript or JavaScript"인데 정본 페이지만 JS를 말하지 않는다.
- 영향: "`.js`·`.yaml`·`locales/en/common.json`도 되나?"에 정본이 답하지 못해 '미지원'으로 오인용될 수 있다.
- 권고: 표 아래 확장자·디렉터리 형태 한 문장. PRODUCT §4.2의 어댑터 내부 노출 금지는 설정 UI 규칙이라 충돌하지 않는다.
- 완료 기준: 페이지에 `.js`·`.mjs`·`.tsx`·`.yaml`·디렉터리 레이아웃이 있다.

#### 13. 🟡 [GEO] MCP 지원이 README 첫 문단에만 있다 *(신규)*

- 근거: README 히어로 "Coding agents can do the same work over MCP" + 배지. 홈 가시 텍스트의 `MCP` 5건은 전부 목업 사이드바 라벨이고 카피엔 0건. `landing.hero.body`(`messages/en.tsx:544`)가 홈 description·JSON-LD·llms 머리를 모두 채우는데 MCP가 없다.
- 영향: GitHub과 사이트가 다른 제품 정의를 준다 — "MCP로 붙는 TMS"라는 차별점이 사이트 엔티티 설명에서 빠진다.
- 권고: `hero.body`는 그대로, `closing.body` 또는 9번의 llms 사실 문단에 MCP 한 구절. 사전 세 벌.
- 완료 기준: 홈 비목업 텍스트와 llms.txt 머리에 MCP·AI agents가 1회 이상.

#### 14. ⚪ [GEO] 카테고리 검색어가 사이트 전역에 없다 *(신규)*

- 근거: guide·README·홈의 `translation management`·`TMS`·`internationalization` 0건(guide의 `i18n` 10건은 워크플로 파일명). title엔 "Localization"이 있다.
- 영향: "GitHub 기반 TMS", "i18n tool" 같은 비브랜드 질의와 표면 일치가 없다. 질의량은 측정하지 않았다.
- 권고: FAQ "What does Malmoi do?" 답 또는 9번 문단에 "translation management (i18n)" 한 번. h1은 구현된 화면이라 바꾸지 않는다.
- 완료 기준: llms-full·FAQ에 카테고리어 1회 이상.

#### 7. ⚪ [GEO 성장 기회] 신규 방문자의 선택 질문 진입점 — 10·22번으로 대체

- 1차의 "적합 팀·지원 파일·PR 왕복·비지원 기능 묶음"은 근거 코드 없는 의견이었다. 구체 누락은 10번(비범위)·22번(홈→상세 링크)이 덮는다. 근거 없는 경쟁 비교나 대량 SEO 페이지는 만들지 않는다.

### D. 모바일·성능

#### 6. 🟡 🧭 [제품 결정 — 우선순위 1] 공개 페이지가 폰에서 0.3배로 축소된다

- 근거: `components/public-shell/public-shell.tsx:52` `min-w-shell-min`, `app/globals.css:90` 1280px, `docs/PRODUCT.md:829` "폰에서는 가로 스크롤을 수용했다 · 사용자 판정".
- **실측(390×844, lab)**: viewport 메타는 `width=device-width, initial-scale=1`(정상)인데 `min-w-shell-min` 하나가 레이아웃 폭을 1280으로 만든다. 브라우저가 가로 스크롤이 아니라 **전체를 약 0.305배로 축소**해 본문 16–18px가 ~5px 상당이 된다. 셸이 `h-svh`라 축소된 화면의 상단 ~30%만 차지하고 **아래 ~70%가 빈 회색**이다. FAQ 첫 화면에 4문항 정도만 보이고 나머지는 셸 내부 스크롤.
- 영향: PRODUCT가 수용한 비용("가로 스크롤")보다 실제 증상이 나쁘다. 검색·AI 인용 링크로 FAQ에 온 모바일 방문자는 확대 없이 읽을 수 없다. 내용은 DOM에 있어 색인은 된다. 실기기 Safari는 가로 스크롤로 보일 수 있고, 이탈·순위 영향은 미측정.
- 권고: PRODUCT §829의 판정 근거가 실제 증상과 다르므로 재판정한다. 바꾼다면 공개 셸·문서만(편집 앱 반응형 전환으로 넓히지 않음).
- 바꾼다면: `components/__tests__/public-shell.test.tsx:319·:357`(`min-w-shell-min` 고정)과 DESIGN §5 규약이 함께 움직인다.
- 완료 기준(결정 변경 시): 360·390·768px에서 공개 문서 본문·주요 내비가 축소·수평 스크롤 없이 읽힌다. 넓은 표는 별도.
- 기준: [Google 페이지 경험](https://developers.google.com/search/docs/appearance/page-experience). 모바일 불편을 색인 불가로 판정하지 않는다.

#### 15. 🟡 [성능] docs 첫 화면 스크린샷이 lazy이고 2560px 원본이 나간다 *(신규)*

- 근거: `components/docs/guide-markdown.tsx:112`가 모든 원고 이미지에 `loading="lazy"`. `/docs`의 `project-home.webp`(2560×1600, 115,908B)는 h1과 두 문단 바로 뒤라 첫 화면 안이다(`guide/en/README.md:7`). 이미지가 있는 18쪽 모두 첫 이미지가 lazy, `srcset`/`sizes` 없음.
- 영향: `/docs`의 LCP 후보가 lazy로 늦게 로드될 가능성. `/docs` LCP 실측은 없다(FAQ는 텍스트가 LCP).
- 권고: 문서의 첫 이미지만 lazy를 빼고 `fetchPriority="high"`. 해상도 축소는 측정 뒤.
- 완료 기준: 변경 전후 같은 조건의 `/docs` LCP 요소·시간 비교, 첫 이미지 HTML에 lazy 없음.

#### 8. ⚪ [성능·GEO] 홈 HTML 501KB의 89%가 목업 씬이고 두 벌 실린다

- 근거: `app/page.tsx:93` `mockupScenes`, `components/landing/stage.tsx:204` `scenes.map`.
- **분해(curl)**:

  | 항목 | 바이트 | 비중 |
  | --- | --- | --- |
  | 원본 HTML | 500,919 | 100% |
  | 전송(br / gzip) | 25,693 / 52,606 | — |
  | 목업 씬 5개 SSR DOM | 214,121 | 42.7% |
  | RSC 인라인(`self.__next_f`) | 264,965 (그중 씬 prop 디코드 228,597 = RSC의 94.7%) | 52.9% |
  | 히어로 / 마무리 CTA / head | 3,098 / 2,852 / 4,327 | 각 <1% |

- **lab(1회, 스로틀 없음)**: 홈 LCP 808ms(390)/384ms(1440), LCP 요소 `h1#landing-hero`, CLS 0, DOM 2,183 노드(FAQ 277). 전송량의 주인은 홈·FAQ 공통 JS ~290KB(디코드 ~880KB)이지 목업 HTML이 아니다.
- **GEO 측면**: 홈 가시 텍스트 6,274자 중 실제 카피는 ~600자, 나머지 ~90%는 씬마다 반복되는 목업 라벨("Search… ⌘K New project…", 가상 "Acme web, 288 keys")이다. HTML 전체에 `aria-hidden` 1회.
- 영향: 전송은 작고 lab 지표는 양호하다. 남는 비용은 파싱·하이드레이션(저사양 TBT/INP 미측정)과 텍스트 추출형 크롤러의 신호 대 잡음.
- 권고: ① 목업 컨테이너에 `aria-hidden`/`inert`가 의도대로 걸리는지 먼저 확인(요약은 visually-hidden 캡션 목록이 이미 든다) ② 씬 이중 적재 감축은 CPU 스로틀 TBT/INP 측정으로 병목이 입증될 때. CSP nonce 제거나 무조건 정적 캐시 전환은 하지 않는다.
- 완료 기준: 같은 조건의 전후 측정값 + 홈 가시 텍스트 중 카피 비중 기록.

### E. 기술 SEO 세부 *(신규)*

#### 16. 🟡 [기술 SEO] `www.mal-moi.com`이 DNS에서 풀리지 않는다

- 근거: `dig +short www.mal-moi.com` 빈 응답, curl `Could not resolve host`. apex는 정상.
- 영향: `www.`를 붙여 입력하거나 외부에 www로 걸린 링크가 브라우저 오류로 끝난다. 중복 색인 위험은 없다.
- 권고: Vercel 도메인에 www를 추가하고 apex로 308. 리다이렉트만 하므로 `lib/github-connect/origin.ts`의 `ALLOWED_HOSTS`는 늘리지 않는다.
- 완료 기준: `curl -I https://www.mal-moi.com/docs/faq` → 308 `https://mal-moi.com/docs/faq`.

#### 17. (결번 — 1차 7번과 병합해 22번으로 옮김)

#### 18. ⚪ [기술 SEO] docs 404의 SSR 본문이 비어 있고 제목이 틀린다

- 근거: `/docs/nope-xyz`는 404 + noindex로 맞지만 `<body>` 가시 텍스트 0자(Googlebot UA 동일; 루트 404는 정상). `<title>Malmoi Docs · Malmoi</title>` — `app/docs/[[...slug]]/page.tsx:32`의 `title: notFound.title`이 적용되지 않고 `app/docs/layout.tsx:13` default에 루트 템플릿이 붙었다.
- 영향: 404라 색인 영향 없음. JS 없는 소비자에게 빈 페이지, 탭 제목 브랜드 중복.
- 권고: 재현 테스트 먼저, 클라이언트 렌더로 빠지는 지점 특정, 제목은 not-found 쪽에서 정한다.
- 완료 기준: `curl /docs/nope-xyz`에 "This page doesn't exist"가 SSR로 있고 `<title>`이 `This page doesn't exist · Malmoi Docs`.

#### 19. ⚪ [성능] 정적 자산이 매 방문 재검증되고 그중 하나가 렌더 차단 CSS다

- 근거: `/fonts/pretendard/pretendardvariable-dynamic-subset.css`(55,760B)·`/guide/*.webp`·`/og.png`·`/brand/*.svg` 모두 `public, max-age=0, must-revalidate`. `next.config.ts:46` `headers()`는 보안 헤더만. Pretendard CSS는 `app/layout.tsx:72`의 렌더 차단 `<link>`이고 영어 페이지도 받는다.
- 영향: 재방문 때 렌더 전 304 왕복 1회. 크기 미측정.
- 권고: `/fonts/(.*)`·`/guide/(.*)`에 짧은 `max-age` + `stale-while-revalidate`. 파일명에 해시가 없으니 immutable 금지.
- 완료 기준: 두 경로 응답에 `max-age>0`, 스크린샷 교체 반영 지연이 허용 범위.

#### 20. ⚪ [기술 SEO] 홈 JSON-LD에 `WebSite` 엔티티가 없다

- 근거: `lib/seo/json-ld.ts:22-41` SoftwareApplication·Organization뿐, `@id` 연결 없음. 도메인(`mal-moi`)과 브랜드(`Malmoi`) 표기가 달라 [사이트 이름](https://developers.google.com/search/docs/appearance/site-names)용 `WebSite{name,url}`의 가치가 있다. `og:site_name`은 있다.
- 권고: 홈에 `WebSite`(name, url) 하나. SearchAction은 넣지 않는다(sitelinks searchbox 폐지).
- 완료 기준: 홈 JSON-LD에 WebSite, Rich Results Test 파싱 오류 없음.

#### 21. ⚪ [기술 SEO] 링크 미리보기 메타 세부

- 근거: `lib/seo/site.ts:37-38` `twitter.images`가 URL 문자열뿐 → `twitter:image:alt` 없음. `og:locale` 없음, docs도 `og:type=website`. `/og.png` 311,412B(일부 메신저의 관행 상한 ~300KB 초과, 실물 미검증). description 과다 2건(`/docs` 262자, `/docs/account/preferences` 263자).
- 권고: twitter images에 `{url, alt}`, `og:locale: "en_US"`, og.png 300KB 미만 재압축. 긴 설명 두 개는 원고 도입문에서 온 것이므로 11번과 같은 방식으로 다듬는다.
- 완료 기준: 공개 head에 `twitter:image:alt`·`og:locale`, og.png <300KB.

#### 22. ⚪ [기술 SEO·GEO] 홈에서 docs 하위 페이지로 가는 링크가 없다 *(1차 7번 병합)*

- 근거: 홈 SSR 내부 링크는 `/signin`×3·`/docs`×2·`/changelog`×2·`/`·`/privacy`뿐. 랜딩이 포맷·AI 에이전트를 말하지만 `/docs/reference/formats`·`/docs/ai-agents`·`/docs/faq` 직접 링크가 없다. 고아 페이지는 아니다(docs 내비로 전부 연결).
- 권고: 기존 포맷 문장과 마무리 CTA에 해당 docs 링크만 단다. 새 섹션·비교 페이지를 만들지 않는다.
- 완료 기준: 홈 HTML에 formats·ai-agents·faq 링크 각 1개 이상.

### F. 제품 결정만 필요한 항목 *(신규)*

#### 23. ⚪ 🧭 [GEO] 저자·이름 유래·AI 크롤러 허용이 결정으로 기록돼 있지 않다

- **저자·날짜**: 푸터는 `© 2026 Malmoi`뿐이고 README·LICENSE는 "Sinhyeok Kang, built by one person"이라 쓴다. Organization `sameAs`는 리포 하나, TechArticle에 `author`·`dateModified` 없음, `/.well-known/security.txt` 404. → 실명 노출 여부를 정하고, 노출한다면 Organization `founder` 또는 TechArticle `author`. 문서 날짜는 결정적 출처(원고 git 커밋 시각 — Vercel 얕은 clone 확인 필요)가 있을 때만.
- **이름 유래**: 화면·가이드(ko 포함)에 '말모이'와 유래가 0건이라 한국어 질의는 영화 「말모이」·조선어학회 사전 사업에 묻힌다. → ko 가이드나 README에 유래 한 줄. `brand-spelling.test.ts`·`no-korean-ui.test.ts`(ko 원고 트리는 제외됨)와의 관계를 함께 정한다.
- **AI 크롤러**: `lib/seo/crawl.ts:18-23`은 `*` 전체 허용 — GPTBot·Google-Extended 같은 학습 봇도 허용된다. 동작은 바꿀 필요 없고 "학습 봇 허용은 의도"를 `crawl.ts` 주석이나 PRODUCT에 남긴다. 검색 봇(OAI-SearchBot)과 학습 봇(GPTBot)은 독립 통제다([OpenAI crawlers](https://developers.openai.com/api/docs/bots)).
- 완료 기준: 세 판정이 PRODUCT에 기록된다.

## 이미 갖춘 기반과 유지할 결정

- 가이드의 정의형 첫 문단(Reference 둘 제외 — 11번), 질문형 FAQ, 포맷 표, 숫자 한도, MCP 연결 절차는 인용 재료로 좋다. 사실 대조한 한도·포맷·일정이 코드와 일치한다.
- **내부 링크·앵커·이미지·외부 링크 전수 0 결함**, 고아 페이지 0.
- `SITE_ORIGIN` 하나가 canonical·sitemap·llms·JSON-LD를 만든다(ARCHITECTURE §8.1). 봇 metadata 스트리밍 차단(`next.config.ts:36` `htmlLimitedBots: /.*/`)이 있다.
- 사이트맵에 가짜 `lastModified`를 넣지 않는 결정(`lib/seo/crawl.ts:28`)은 유지한다.
- 영어만 색인은 PRODUCT §4.2 비범위(`docs/PRODUCT.md:436`)다. 쿠키로 같은 URL의 본문이 바뀌지만 응답이 `private, no-store`이고 쿠키 없는 크롤러는 항상 en을 받으므로 캐시 오염·클로킹이 아니다. hreflang이 없는 것도 이 정책과 일치한다.
- CSP nonce로 공개 HTML이 동적(`no-store`, ETag 없음, TTFB 0.25–0.44s)인 것은 ARCHITECTURE §8 결정 B의 비용이다. 34쪽 규모라 크롤 예산 문제가 아니다.
- `/privacy` 설명이 홈과 같은 것(`app/privacy/page.tsx:12-13`), changelog의 여러 h1(`components/changelog/release-entry.tsx:21`)은 기록된 결정이다.
- `/mcp`가 robots 목록에 없는 것은 기록된 누락(`crawl.ts:15`)이고, 실제 비로그인 `/mcp`는 307 → `/signin`(noindex)이다. robots는 인증 수단이 아니다.
- `/changelog`의 GitHub API 실패는 200 + 안내 문장이고 캐시되지 않는다.
- 없는 리뷰·평점을 만들어 리치 결과를 채우지 않는다. FAQ 구조화 데이터가 리치 결과를 보장한다는 권고도 하지 않는다.
- Analytics는 공개 경로만, 쿼리·해시 제거(`lib/seo/analytics.ts:7`·`:12`). GEO 측정을 위해 앱 URL·검색어를 새로 수집하지 않는다.

## 실행 순서

1. **🧭 제품 결정(먼저 — 뒤 작업의 범위를 바꾼다)**: 6번 모바일 공개 셸 재판정 → 23번 저자·이름 유래·AI 봇 기록 → 10번 경쟁사 이름 포함 여부.
2. **도입 판단 사실 한 배치(원고·사전, en·ko·es)**: 1(무료) · 10(비범위) · 11(Reference 도입문) · 12(확장자) · 13(MCP) · 14(카테고리어) · 5(방침 링크) · 22(홈 링크). 모두 `/guide`·`/translate` 경로이고 같은 FAQ·랜딩을 건드린다.
3. **llms 배치**: 9(llms.txt 구조), 4는 그때 재검토.
4. **작은 코드 수정**: 3(breadcrumb) · 2(inLanguage) · 18(docs 404) · 20(WebSite) · 21(OG 메타) · 15(첫 이미지 lazy).
5. **운영**: 16(www DNS — 코드 밖, Vercel 도메인 설정) · 19(정적 자산 캐시 헤더).
6. **측정 뒤 판단**: 8(씬 이중 적재·aria-hidden).

운영 측정은 Search Console의 사이트맵 처리·색인 제외 사유·선택된 canonical·페이지별 노출/클릭을 우선한다. 브랜드/비브랜드 질의를 나누고, AI 인용은 고정된 질문 집합·제품·언어·날짜·인용 URL을 기록해 비교한다(단발 답변을 인용률로 일반화하지 않는다).

## 공식 기준

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — 기존 SEO 기본 요건이 기반이며 별도 AI 텍스트 파일·특수 schema는 필수가 아니다.
- [Google: General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) — 마크업과 가시 콘텐츠의 정합성.
- [Google: Site names](https://developers.google.com/search/docs/appearance/site-names) — `WebSite` 구조화 데이터.
- [Google: Understanding page experience](https://developers.google.com/search/docs/appearance/page-experience) — 모바일 사용성. 점수·특정 조치가 순위를 보장하지 않는다.
- [OpenAI: Overview of OpenAI crawlers](https://developers.openai.com/api/docs/bots) — OAI-SearchBot(검색)과 GPTBot(학습)은 독립 통제.
- [llms.txt proposal](https://llmstxt.org/) — H1 · 블록인용 요약 · 링크 목록 절 · `Optional` 절.

## 집계

- 중대 차단: **0건**.
- 전체: **🟡 9 · ⚪ 13**, 합계 22건(17번 결번).
  - 1차 8건: 🟡6·⚪2 → 보정 후 🟡2(1·6)·⚪6(2·3·4·5·7·8).
  - 신규 14건: 🟡7(9·10·11·12·13·15·16)·⚪7(14·18·19·20·21·22·23).
  - 🧭 제품 결정 선행: 6 · 23 (+ 10의 경쟁사 이름).
- 사실 정합성 불일치 확정: 1 · 2 · 3 · 12.
- 프로덕션 사이트맵 34/34 정상, 내부 링크 1,390·앵커 146·외부 22·이미지 30·llms 링크 31 결함 0.
- 미완 검증: 실제 색인·검색 성과·AI 인용 성과·실 봇 IP·CrUX/INP·실기기 모바일·Rich Results Test.
