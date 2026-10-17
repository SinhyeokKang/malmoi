# Agent readiness — 기술 설계

작성: 2026-10-15 · 검수 반영: 2026-10-15. 스펙은 [spec.md](./spec.md) — 결정 번호(결정 N)는 spec §4를 가리킨다.

## 1. 영향 받는 흐름

push·편집 UI·pull 어디에도 붙지 않는다. **공개 응답 층**(라우팅 + 무인증 route handler 셋)과 `PushResponse`의 정의 위치(결정 6)만 바뀐다.

| 표면 | 지금 | 바뀐 뒤 |
|---|---|---|
| 매칭 없는 경로 + `Accept`에 `text/markdown` | 404 HTML(`app/not-found.tsx`) | 404 Markdown |
| 매칭 없는 경로(그 밖의 Accept) | 404 HTML | 무변경 |
| `/api`·`/api/<어떤 route도 받지 않는 경로>` | 404 HTML(Next 기본) | 404 JSON |
| `/openapi.json` | 404 HTML | 200 OpenAPI 3.1 |

## 2. 구현 형

### 2.1 Markdown 404 — `next.config.ts` fallback rewrite + route handler

```ts
async rewrites() {
  return {
    beforeFiles: [], afterFiles: [],
    fallback: [{ source: "/:path*", has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }], destination: "/not-found.md" }],
  };
}
```

- **`fallback`이어야 한다.** Next는 fallback rewrite를 파일시스템·정적·동적 라우트를 다 본 뒤에만 적용한다. 순서는 middleware → beforeFiles → 파일시스템 → afterFiles → 동적 라우트 → fallback이다(`next/dist/server/lib/router-utils/resolve-routes.js:57-83`, CTO 검수). not-found 렌더는 어느 출력에도 매칭되지 않을 때만 돈다(`router-server.js:505-515`). 그래서 존재하는 경로의 응답은 Accept와 무관하게 지금 그대로다(완료 조건 3).
- **최상위 동적 세그먼트가 없다는 것이 전제다.** route group `(edit)` 아래까지 확인했다. 가장 가까운 동적 세그먼트는 `docs/[[...slug]]` · `invite/[token]` · `(edit)/projects/[slug]`이고, 셋 다 그 아래 미존재 경로를 자기가 받아 `notFound()`로 끝낸다(spec §6 비목표). ⚠️ **최상위 동적 세그먼트를 새로 만들면 그 아래에서 이 장치가 조용히 꺼진다** — `next.config.ts` 머리 주석에 남긴다.
- **`has` 판정 규칙(결정 8)**: Next는 `value`를 `new RegExp(`^${value}$`)`로 감싸고 대소문자를 구분한다(`shared/lib/router/utils/prepare-destination.js:101`). Vercel 라우터도 같은 설정을 평가한다. 판정 표:

  | `Accept` | 결과 | 비고 |
  |---|---|---|
  | `text/markdown` | Markdown | |
  | `text/markdown; charset=utf-8` | Markdown | |
  | `text/markdown;q=0.9, text/html` | Markdown | 에이전트가 Markdown을 받겠다는 신호 |
  | `text/html, text/markdown` | Markdown | |
  | `text/markdown;q=0` | Markdown | **한계** — q값을 해석하지 않는다 |
  | `Text/Markdown` | HTML | **한계** — 대소문자를 구분한다. 실제 에이전트는 소문자를 보낸다 |
  | `text/html` · `*/*` · 없음 | HTML | |

- **목적지는 `app/not-found.md/route.ts`다.** 폴더 이름의 점은 `llms.txt/route.ts`와 같은 형이고, 특수 파일은 파일명으로만 판정하므로 Next 규약과 충돌하지 않는다(`next-app-loader/index.js:82-108`). 직접 요청해도 항상 404이므로 거짓이 없다. `/api` 밖이라 JSON 404(2.2)와 섞이지 않는다.
- **`export const dynamic = "force-dynamic"`.** 본문이 배포 모드로 갈리는데 모드는 런타임 env다(같은 이미지가 self-hosted로 돈다). `llms.txt`처럼 `force-static`을 따르면 빌드 시점 모드로 굳는다.
- **응답 헤더**: `Content-Type: text/markdown; charset=utf-8` · `Vary: Accept` · `Cache-Control: no-store`. 지금 404 HTML처럼 공유 캐시에 남지 않는다.
- **모든 메서드를 같은 핸들러로 export한다**(`GET`·`HEAD`·`POST`·`PUT`·`PATCH`·`DELETE`·`OPTIONS`). rewrite는 메서드를 가리지 않으므로 GET만 두면 미존재 경로 POST가 405가 된다. Server Action POST는 존재하는 페이지로 가므로 fallback에 닿지 않는다.
- middleware는 원래 경로에서 한 번 돌고 CSP 헤더를 붙인다. Markdown 응답에는 무해하다. **middleware·CSP·matcher는 건드리지 않는다.**
- **D11과의 관계(결정 5)**: ARCHITECTURE §8.1의 "middleware rewrite·수동 HTML 응답·Next 변경 — 셋 다 하지 않는다"는 `/docs/*` 404의 HTML 본문 SSR에 한정된 결정이다(근거 문서 `seo-geo-audit-20261008/orch.md`는 v1.3.2에서 지워졌다). 이 설계는 middleware·CSP를 넓히지 않고, HTML 404와 `/docs/*`를 건드리지 않는다. Accept 분기 fallback rewrite를 §8.1에 별개 결정으로 남긴다.
- **버린 대안**: middleware에서 Accept로 갈라 rewrite하는 방식. middleware는 그 경로가 존재하는지 모르므로 라우트 표를 복제해야 한다.

### 2.2 JSON API 404 — `app/api/[[...path]]/route.ts`

- 선택적 catch-all이라 `/api` 자신과 하위 경로를 받는다. 정적·더 구체적인 세그먼트가 항상 이기므로 등록된 API는 무변경이다. `app/api/route.ts`도, `app/api` 바로 아래 동적 세그먼트도 없어 `sorted-routes.js`의 충돌 조건에 걸리지 않는다(CTO 검수).
- **`dynamicParams = false` route의 목록 밖 요청도 여기로 온다.** `/api/search-index/fr`이 그 예다. 그 route가 `NoFallbackError`를 던지면(`build/templates/app-route.js:145`) 라우터가 다음 후보로 다시 라우팅하고(`router-server.js:308-309`, `resolve-routes.js:190-193`), 이 catch-all이 받아 JSON 404를 낸다. 바람직한 결과이고, 실측 목록에 넣는다.
- 모든 메서드(`GET`·`HEAD`·`POST`·`PUT`·`PATCH`·`DELETE`·`OPTIONS`)가 404 JSON을 낸다. 본문은 `apiNotFoundBody()`(§2.4)다.
- middleware matcher가 `api/`를 빼므로 CSP가 붙지 않는다. 인증 경계도 바뀌지 않는다.

### 2.3 OpenAPI — `app/openapi.json/route.ts` (`force-static`)

- **지위(결정 4)**: 의미(동작·red 조건·안정성)의 정본은 `docs/ACTIONS.md`다. 이 문서는 Zod에서 생성한 형태의 파생본이다. `info.description`에 정본 위치를 한 줄로 적는다.
- 문서는 순수 함수 `openApiDocument(version)`이 만든다. **요청 본문 스키마는 서버가 검증에 쓰는 Zod에서 생성한다** — `z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" })`. 손으로 쓴 스키마는 낡는다(POSTMORTEM 2026-08-31).
  - `io: "input"`이 필요하다. `PushPayload.refs`의 `.transform`(`lib/push/plan.ts:173`)을 output 모드는 표현하지 못하고 "Transforms cannot be represented in JSON Schema"를 던진다(CTO가 zod 4.5.4로 실행해 확인).
  - `.refine`(로케일 형태·`baseLocale ∈ locales`·placeholders 상한)은 조용히 빠진다. 그 규칙은 operation `description`에 한 줄로 남기고, 실제 판정은 400 응답의 `issues`가 한다. `z.unknown()`은 `{}`로 나온다.
  - `ImportFailureReport`(`strictObject`)는 `additionalProperties: false`로 나온다. 서버가 실제로 그렇게 거부하므로 참이다.
  - OpenAPI 3.1의 Schema Object는 JSON Schema 2020-12 그대로라 변환 없이 싣는다. 생성물의 `$schema` 키는 뺀다.
- **응답 스키마(결정 6)**: `lib/push/payload.ts`의 `PushResponse` 타입 union을 같은 파일의 Zod 스키마로 옮기고 `export type PushResponse = z.infer<typeof PushResponseSchema>`로 만든다. 소비자(`app/api/push/route.ts` · `lib/cli/push-response.ts` · `scripts/push-local.ts`)는 타입 이름이 같아 그대로 컴파일된다.
  - **열린 형으로 만든다** — `z.looseObject`이거나 응답에도 `io: "input"`을 쓴다. output 모드의 `z.object`는 `additionalProperties: false`를 내므로, 응답 필드 하나를 더하는 것만으로 생성된 클라이언트 검증기가 깨진다(CTO 검수).
  - deferred 두 갈래는 `status`가 같아서 discriminated union이 안 된다. `z.union`(→ `anyOf`)으로 둔다.
- **오류 응답**: `{ error: string }` + 추가 필드 허용이다. 갈래마다 붙는 필드는 `issues`(400) · `ref`(500) · `expected`·`got`·`commitAt`·`lastCommitAt`(409)이다. 갈래 열거는 비목표다(spec §6).
- **상태 코드**는 두 route의 `NextResponse.json(..., { status })` 전수에서 읽었다. push는 200(applied·deferred) / 400(본문 초과 `body too large` 포함 — 413이 아니다) / 401 / 409 / 500, failure는 204 / 400 / 401 / 409 / 500이다.
- **보안**: `components.securitySchemes.pushToken = { type: "http", scheme: "bearer", description }`와 두 operation의 `security: [{ pushToken: [] }]`. 스코프 배열은 비운다(spec §6).
- `servers: [{ url: "/" }]`. OpenAPI 3.1은 상대 서버 URL을 문서가 서빙된 위치 기준으로 푼다. 그래서 hosted·preview·self-hosted가 같은 바이트를 내고 각자 자기 origin을 가리키며(완료 조건 6), 모드 분기 없이 `force-static`이 가능하다.
- `info.title`은 `` `${en.common.appName} CI push API` ``다. 브랜드 표기는 `Malmoi`(`brand-spelling.test.ts`). `info.version`은 `appVersion()`(`package.json`의 `version`)이다. 서버 계약의 축이고, action 태그는 클라이언트 축이라 별개다(결정 4).
- middleware matcher 안이라 CSP와 (self-hosted면) `X-Robots-Tag: noindex`가 붙는다. JSON에는 무해하다.
- ⚠️ `lib/push/plan.ts` → `lib/adapters/index` → ts-morph로 이어지는 무거운 의존이 이 route 그래프에 들어온다. `force-static`이라 빌드 때만 평가된다.

### 2.4 문구 — `en.seo` (결정 7)

영어 고정 표면이다. `messages/en.tsx`의 `seo` 절(이미 `Messages`에서 빠져 ko·es 키가 없다)에 두고 `import { en }`으로 읽는다. ARCHITECTURE §6.355의 영어 고정 목록에 Markdown 404를 더한다(`/api/*` JSON은 이미 있다). DESIGN §10 오류 규칙을 따른다: 무엇이 일어났나 + 다음 행동, 축약형, `please`·`sorry` 금지.

**Markdown 404** — 제목은 `en.notFound.title`, 링크 라벨 `Docs`는 `en.publicDocs.docs.title`을 재사용한다. 새 키는 `en.seo.agentNotFound.{body, llms, openapi}`다.

```md
# Page not found

There's no page at this address. Start from the docs, or read the machine-readable descriptions below.

- [Docs](https://mal-moi.com/docs)
- [llms.txt](https://mal-moi.com/llms.txt)
- [OpenAPI for the CI push API](https://mal-moi.com/openapi.json)
```

- hosted에서는 `SITE_ORIGIN`(`lib/seo/site.ts:12`)과 `routes.docs()`로 조립한다. **`mal-moi.com` 리터럴을 쓰지 않는다** — `lib/deployment/__tests__/self-hosted-gates.test.ts`가 파일별 리터럴 개수를 `ALLOWED`(:72)와 정확히 대조한다. 절대 기준이 `SITE_ORIGIN` 하나라는 §8.1 규칙에 따라 preview도 prod를 가리킨다(`llms.txt`와 같다).
- self-hosted·무효 모드에서는 `llms.txt` 줄을 빼고 상대 링크 `/docs` · `/openapi.json`만 싣는다(결정 9). self-hosted에서 `llms.txt`를 404로 내는 곳은 `middleware.ts:33-34`이고, 판정은 `lib/seo/public-response.ts`의 `pageResponse`다.

**JSON 404** — 새 키는 `en.seo.apiNotFound`다.

```json
{ "error": "not-found", "message": "There's no API endpoint at this path. The CI push API is described in the OpenAPI document.", "openapi": "/openapi.json" }
```

- `error`는 기존 kebab 코드 키를 잇는다(`/api/push`의 `"unauthorized"`, well-known의 `"not-found"`).
- 필드 이름은 `docs`가 아니라 `openapi`다. 같은 기능 안에서 "docs"가 `/docs` 가이드를 가리키므로 겹치지 않게 했다.
- `message`는 OpenAPI가 다루는 범위(CI push API)를 밝힌다. 전체 엔드포인트 목록처럼 말하면 거짓이다.

## 3. 순수 함수 — `/tdd` 대상

| 함수 | 위치 | 입력 → 출력 |
|---|---|---|
| `markdownNotFound(mode)` | `lib/seo/agent-errors.ts` | `DeploymentMode` → Markdown 문자열. hosted는 `SITE_ORIGIN` 절대 링크 셋, 그 밖은 상대 링크 둘 |
| `apiNotFoundBody()` | 같은 파일 | → `{ error: "not-found", message, openapi: "/openapi.json" }` |
| `openApiDocument(version)` | `lib/openapi/document.ts` | 버전 문자열 → OpenAPI 3.1 객체 |
| `PushResponseSchema` | `lib/push/payload.ts` | Zod 스키마(loose, deferred는 union). `PushResponse = z.infer` |
| fallback rewrite 설정 | `next.config.ts` | `rewrites()`를 **불러서** 검사한다(`security-headers.test.ts`와 같은 형). fallback 하나, 모든 목적지가 `/`로 시작하는 내부 경로, `has` 판정 표(§2.1)를 Next와 같은 `^…$` 래핑으로 확인 |

route 셋은 위 함수를 부르는 얇은 껍데기다.

## 4. 스키마 · 환경변수 · 패키지

- 스키마 변경: **없음.**
- 새 환경변수: **없음.**
- 새 패키지: **없음.** Zod 4 내장 `z.toJSONSchema`를 쓴다. 리포 테스트는 골든 스냅샷과 구조 단언으로 한다(검증기 의존성을 들이지 않는다). 스펙 적합성은 정확한 버전으로 고정한 `npx @redocly/cli@<x.y.z> lint`를 수동으로 1회 돌린다. 버전은 2주 이상 된 것을 고른다(공급망 정책 `minimumReleaseAge`와 같은 취지 — npx는 pnpm 정책을 거치지 않는다).
- SELF-HOSTING §3 체크리스트: 마이그레이션·env·cron·패키지·토큰 경로 URL 어느 것도 해당 없다. 완료 조건 6이 self-hosted 표면을 덮는다.

## 5. 불변식 · 경계 영향

- export 결정성·blob SHA: 무관.
- **인증 경계**: 새 route 셋은 무인증 공개 문서다. DB·쿠키·세션을 읽지 않고, `request.headers`도 읽지 않는다(Accept 판정은 라우터가 한다). `app/__tests__/entry-points.test.ts`의 `EXEMPT`에 셋을 사유와 함께 등재한다. "DB·쿠키 import 없음"은 `lib/upload/__tests__/image-proxy-isolation.test.ts`처럼 `readFileSync` 소스 스캔으로 판정한다(`@/lib/db` · `next/headers` · `cookies(` 0건).
- **셀프 호스팅**: §2.3·§2.4.
- **POSTMORTEM 2026-09-28**(외부 rewrite가 쿠키를 넘긴다): 재발 방지 grep `rg -n 'async rewrites|destination:\s*[`"]https?://' next.config.ts vercel.json`이 이제 `async rewrites` 1건을 잡는다. 목적지가 자사 내부 경로(`/not-found.md`)라 그 건의 위험(제3자 호스트로 헤더 전달)이 없다. 이 판정을 `next.config.ts` 주석에 남기고, 설정 테스트가 "모든 rewrite 목적지는 `/`로 시작하는 내부 경로"를 상시로 단언한다.
- **POSTMORTEM 2026-10-08 / ARCHITECTURE §8.1**(`/docs/*` 404 첫 응답): 라우팅을 바꾸므로 그 항목의 재발 방지 절차를 따른다. built server에서 없는 docs slug와 루트 404의 상태·noindex·title·초기 HTML 본문(Flight 제외)을 다시 잰다(tasks §4).
- **캐시**: HTML 404에는 `Vary: Accept`가 없다. 지금 404 HTML은 `private, no-cache, no-store`라 공유 캐시에 남지 않지만, 배포 뒤 Accept를 번갈아 바꾼 요청으로 `x-vercel-cache`를 확인한다(tasks §6).

## 6. 착수 시 실측할 위험

1. 이 리포(Next 16.3.3, Turbopack, middleware 있음)의 built server에서 fallback rewrite가 기대대로 도는지 확인한다. 순서는 소스로 확인됐다(§2.1). 실측 방식(리포 안 실물 또는 `.scratch` 최소 앱)은 작업 세션이 정한다. 단 별도 설치는 `minimumReleaseAge` 때문에 Next 버전이 리포와 갈릴 수 있다. 안 되면 Markdown 갈래를 멈추고 보고한다.
2. Vercel이 fallback rewrite 목적지 응답의 상태 404와 `Vary`를 그대로 내는지 preview에서 확인한다.
