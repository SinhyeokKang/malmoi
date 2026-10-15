# Agent readiness — 태스크

작성: 2026-10-15 · 검수 반영: 2026-10-15. 순서는 실측 → 순수 함수 → 껍데기 → 문서. 각 절이 커밋 경계이고 동작을 바꾸는 절은 red 테스트가 앞선다.
게이트는 매 절 `pnpm test`(이 경로들은 PostToolUse 훅 경로 밖이라 손으로 돌린다), 마지막에 `pnpm gate`.

## 0. 실측 — 코드 전

- [x] fallback rewrite(`has` accept)가 built server에서 목적지 route에 닿는지, 존재하는 경로(`/`·`/docs`·`/llms.txt`)는 그대로인지 확인한다. **방식은 작업 세션이 정한다**(리포 안에서 §3의 rewrite와 목적지 route를 먼저 넣고 재기 · `.scratch` 최소 앱 — 후자는 `minimumReleaseAge` 때문에 Next 버전이 갈릴 수 있다). 검증: design §6-1을 닫는 실측 기록(명령과 응답 첫 줄). **실패하면 Markdown 갈래를 멈추고 보고하고, 리포에 넣은 것은 되돌린다.**

## 1. 판정 잎 — 커밋 A (`feat(seo): agent-readable not-found bodies`)

- [x] `messages/en.tsx` `seo.agentNotFound`·`seo.apiNotFound` 키(design §2.4 문안). 검증: `terminology.test.ts`·`brand-spelling.test.ts`·`dictionary-consistency.test.ts` green.
- [x] `lib/seo/agent-errors.ts` `markdownNotFound(mode)` · `apiNotFoundBody()`. 링크는 `SITE_ORIGIN` + `routes.docs()`로 조립한다(리터럴 `mal-moi.com`·`"/docs"` 금지). 테스트:
  - hosted는 `${SITE_ORIGIN}/docs` · `/llms.txt` · `/openapi.json` 절대 링크 셋이다.
  - self-hosted·invalid는 `llms.txt`와 `SITE_ORIGIN`이 없고 상대 `/docs`·`/openapi.json`만 있다.
  - Markdown 제목이 1개이고 `en.notFound.title`과 같다. 본문은 20자 이상이다.
  - JSON 본문은 정확히 `error`·`message`·`openapi` 세 키다.

  검증: `pnpm test` green. 그리고 `lib/deployment/__tests__/self-hosted-gates.test.ts` green(새 파일에 리터럴이 없어 `ALLOWED`가 그대로다).

## 2. OpenAPI 생성 — 커밋 B (`feat(api): publish an OpenAPI document for the CI endpoints`)

- [x] `lib/push/payload.ts` — `PushResponse` union을 `PushResponseSchema`(loose, deferred는 `z.union`)로 옮기고 `PushResponse = z.infer`로 만든다. 검증: `pnpm typecheck` green(소비자 `app/api/push/route.ts`·`lib/cli/push-response.ts`·`scripts/push-local.ts` 무변경), `lib/cli/__tests__/push-response.test.ts` green.
- [x] `lib/openapi/document.ts` `openApiDocument(version)`. 테스트:
  - 고정 버전 `"0.0.0-test"`로 만든 문서를 `toMatchFileSnapshot("__snapshots__/openapi.json")` 골든으로 고정한다. 계약이 바뀌면 diff로 드러난다.
  - `openapi === "3.1.0"`이고 경로는 정확히 둘이다.
  - 두 operation이 `security: [{ pushToken: [] }]`이고 `pushToken`은 http bearer다.
  - push 요청 스키마의 `required`가 **리터럴 목록** `["projectSlug","surfaceSlug","commitSha","commitAt","format","locales","keys","translations","refs"]`와 같다. 이 목록은 생산자 `buildPushPayload`(`lib/push/payload.ts` — composite action이 `scripts/push-local.ts`를 거쳐 부른다)가 내는 필드에서 정했고, `executionId`는 optional이라 빠진다. failure도 리터럴 목록과 같고 `additionalProperties: false`다.
  - 응답 스키마는 열린 형이다(`additionalProperties`가 `false`가 아니다).
  - 문서 안의 모든 `$ref`가 풀린다. 스키마 안에 `$schema` 키가 없다. `info.title`에 `Malmoi`가 있다.

  검증: `pnpm test` green.

## 3. 껍데기 — 커밋 C (`feat(api): serve markdown 404s, JSON API 404s and /openapi.json`)

- [x] `next.config.ts` `rewrites()` fallback과 머리 주석. 주석에는 최상위 동적 세그먼트 함정, `has` 한계(q값·대소문자), POSTMORTEM 2026-09-28 판정을 적는다. 테스트(설정을 불러서 확인):
  - fallback이 하나다.
  - 모든 목적지가 `/`로 시작한다.
  - `new RegExp(`^${value}$`)`로 design §2.1 판정 표 일곱 줄을 단언한다.

  검증: green.
- [x] `app/not-found.md/route.ts`. 일곱 메서드 export, `force-dynamic`, `Vary: Accept`, `no-store`, `text/markdown; charset=utf-8`. route 테스트:
  - `Object.keys(route)` 메서드 집합(`well-known.test.ts:15-17` 형)
  - 상태 404·헤더·본문
  - `dynamic === "force-dynamic"`(`crawl-files.test.ts` 형)
  - 소스 스캔으로 `@/lib/db`·`next/headers`·`cookies(` 0건

  검증: green.
- [x] `app/api/[[...path]]/route.ts`. 일곱 메서드가 404 JSON을 낸다. 테스트는 메서드 집합, 상태, `content-type`, 본문, 소스 스캔이다. 검증: green.
- [x] `app/openapi.json/route.ts`(`force-static`). 테스트는 200 `application/json`이고 본문이 `openApiDocument(appVersion())`과 같다는 것이다. vitest에서는 `APP_VERSION`을 주입한다(없으면 `appVersion()`이 `""`다). 소스 스캔도 한다. 검증: green.
- [x] `app/__tests__/entry-points.test.ts` `EXEMPT`에 셋을 사유 주석과 함께 등재한다. `exempt-route-guards.test.ts`·`self-hosted-public.test.ts`·`crawl-files.test.ts`·`well-known.test.ts`·`root-boundaries.test.tsx`·`security-headers.test.ts`·`client-graph.test.ts` 중 요구가 생기는 것은 같은 커밋에서 고친다. 검증: 전부 green.
- [x] `middleware.ts`는 바꾸지 않는다. 검증: `entry-points.test.ts`의 matcher 단언 green, `git diff --stat middleware.ts` 0줄.

## 4. 실측 — built server (수동 · 커밋 없음)

`pnpm build && pnpm start`(hosted 모드)를 띄우고 쿠키 없이 요청한다. **`-L` 없이 첫 응답을 단언한다.**

- [ ] `curl -sS -i -H 'Accept: text/markdown' localhost:3000/some-path-that-does-not-exist` → 404 · `text/markdown; charset=utf-8` · `Vary: Accept` · 링크 셋.
- [ ] 같은 경로를 Accept 없이 요청하면 404 HTML이고, 초기 HTML 본문(script·style·Flight 제외)에 `Page not found`가 있다(POSTMORTEM 2026-10-08 절차).
- [ ] `/docs/nope`을 Accept 유무 각각으로 요청한다 → 둘 다 지금과 같은 HTML 404·noindex·title이다(초기 본문은 §8.1의 기존 제한 그대로).
- [ ] `/` · `/docs` · `/llms.txt` · `/sitemap.xml`을 Accept markdown으로 요청한다 → Accept 없을 때와 상태·content-type이 같다.
- [ ] 경계 사례:
  - 비로그인 `/projects/nope`과 `/%70rojects/x`에 Accept markdown → 307 로그인(Markdown이 아니다)
  - `/nope/`(끝 슬래시) → 308 뒤 첫 응답
  - `-X HEAD` · `-X OPTIONS` · `-X POST` 미존재 경로 + Accept markdown → 404 Markdown(HEAD는 본문 없음)
  - `-H 'Accept: Text/Markdown'` → HTML(한계 확인)
- [ ] API:
  - `/api` · `/api/nope` · `/api/auth`(맨 경로) · `-X POST /api/v1/x` · `/api/search-index/fr` → 404 JSON
  - `-X POST /api/push`는 401 `{"error":"unauthorized"}`, `GET /api/push`는 405로 무변경
- [ ] `curl localhost:3000/openapi.json` → 200 JSON. `npx @redocly/cli@<2주 이상 된 정확한 버전> lint`를 통과한다(리포 의존성이 아니다).
- [ ] self-hosted 모드(`MALMOI_ORIGIN` 지정)에서 확인한다.
  - 미존재 경로 + Accept markdown → `llms.txt`·`mal-moi.com`이 없고 상대 링크만 있다.
  - `/llms.txt` + Accept markdown → middleware의 빈 404 그대로다.
  - `/openapi.json` → 200, `servers`는 `/`다.

## 5. 문서 — 문서별 커밋

- [x] `docs/ARCHITECTURE.md` §8.1에 넣는다.
  - Markdown 404: fallback rewrite, `has` 한계, 최상위 동적 세그먼트 함정, 비목표 경로
  - D11이 `/docs/*` HTML 본문에 한정된다는 결정(spec 결정 5)
  - JSON API 404와 `dynamicParams=false` 재라우팅
  - `/openapi.json`: Zod 생성, 상대 서버 URL, 스코프 없음
  - 홈 콘텐츠 비율을 디자인 보존 결정으로 건너뛴 기록

  검증: 이 기능 디렉터리를 지워도 각 결정의 근거가 §8.1에 남는다.
- [x] `docs/ARCHITECTURE.md` §6.355 영어 고정 표면 목록에 Markdown 404를 넣고, mcp-oauth 절(§6.45.9)에 감사 항목 4(스코프 선언)를 건너뛴 기록을 한 줄 넣는다. 검증: 두 절에 각각 한 줄이 있다.
- [x] `docs/PRODUCT.md`를 고친다.
  - §7.7 URL 표에 `/openapi.json` 행을 넣는다.
  - §7.8 외부 계약 정본 문장에 "의미 = ACTIONS, 형태 = `/openapi.json` 파생본"을 넣는다.
  - §4.1 "영어로 고정되는 것"에 Markdown 404와 `/openapi.json`을 넣는다.
  - §4.2에 "OpenAPI 대상 확장(`/oauth/*`·`/api/mcp`)"과 "일반 페이지 Markdown 협상" 두 줄을 넣는다.

  검증: 네 자리가 모두 고쳐졌다.
- [x] `docs/ACTIONS.md`에 "`/openapi.json`은 이 문서의 형태 파생본이고 의미의 정본은 이 문서다"라는 한 줄을 넣는다. 검증: 그 한 줄이 있다.
- [x] `docs/DIRECTORY.md`에 새 파일을 등재한다(`lib/seo/agent-errors.ts` · `lib/openapi/` · route 셋 · 스냅샷). 검증: 등재 대상이 모두 있다.
- [x] `docs/POSTMORTEM.md`는 append-only라 고치지 않는다. 2026-09-28 grep이 1건이 된 판정은 `next.config.ts` 주석과 설정 테스트가 든다. 검증: POSTMORTEM diff가 0줄이다.
- [ ] 기능이 끝나면 이 디렉터리를 삭제한다(결론은 위 정본으로 옮겼다). 검증: `docs/features/agent-readiness/`가 없다.

## 6. 배포 확인 (`/push` 뒤 preview, `/merge` 뒤 prod — 수동)

- [ ] `https://dev.mal-moi.com`(SSO 뒤에 있어 `vercel curl`을 쓴다)과 `https://mal-moi.com`에서 §4의 hosted 항목을 반복한다. 검증: design §6-2를 닫는다.
- [ ] 캐시 혼선을 점검한다. 같은 미존재 경로를 Accept markdown → 없음 → markdown 순으로 세 번 요청하고, 매번 기대한 content-type과 `x-vercel-cache`를 기록한다. 검증: 세 응답 모두 기대한 형이다.
