# Agent readiness — 스펙

작성: 2026-10-15 · 검수 반영: 2026-10-15(`/feature-review` 4인) · 상태: **스펙 완료 · 착수 대기**

slug는 `agent-readiness`이고 **범위는 기계가 읽는 응답 셋**이다 — ① `Accept: text/markdown` 요청의 404 본문,
② 어떤 route도 받지 않는 `/api/*` 경로의 JSON 오류, ③ CI API 두 엔드포인트의 OpenAPI 명세. 화면·스키마·환경변수는 바뀌지 않는다.

## 1. 사용자와 수요 근거

**수요 근거는 외부 감사 결과와 사용자 결정(2026-10-15)이다** — Is Agentic 감사가 mal-moi.com을 55/100으로 매겼고, 사용자가 그중 셋을 하기로
골랐다. 이 기능을 요청한 이탈·이슈는 관측하지 않았다.

PRODUCT §0의 사용자는 개발자와 번역 편집자 둘이다. 이 기능의 직접 독자는 **그 개발자가 쓰는 코딩 에이전트**다 — 에이전트는 HTML 오류 화면을
파싱하지 못하고, API 표면을 산문이 아니라 기계 판독 명세로 찾는다. 크롤러(LLM 검색 봇)도 같은 응답을 읽는다. **개발자**는 CI 연동을 확인할 때
`/api/push`의 요청 형식을 명세 하나로 본다 — 직접 호출을 막지 않지만, 안정성 약속은 여전히 `docs/ACTIONS.md`를 따른다(§4 · design §2.3).
**번역 편집자(비개발자)가 보는 화면은 바뀌지 않는다.**

## 2. 관측된 문제 (2026-10-15 실측)

- `curl -H 'Accept: text/markdown' https://mal-moi.com/__probe-x` → **404는 맞지만 `content-type: text/html`**이고 본문은 Next 404 화면 + RSC 페이로드다. 감사 판정 Partial(50%).
- `curl https://mal-moi.com/api/nope` → **404 `text/html`**. 이미 있는 API 오류는 JSON이다(`POST /api/push` 무인증 → 401 `{"error":"unauthorized"}`) — 어떤 route도 받지 않는 경로만 HTML로 떨어진다. 감사 판정 Failed.
- OpenAPI·Swagger 문서가 없다(`/openapi.json` 404). 외부 계약 `/api/push`·`/api/push/failure`의 형태는 `lib/push/plan.ts`의 Zod(`PushPayload`)·`lib/projects/import-status.ts`의 Zod(`ImportFailureReport`)와 `docs/ACTIONS.md` 산문에만 있다. 감사 판정 Failed.

## 3. 범위 게이트

PRODUCT §4.2 대조: **걸리는 항목 없음.** ①②는 이미 있는 응답의 형식이고, ③은 이미 공개된 외부 계약(PRODUCT §7.8 · `docs/ACTIONS.md`)의
기계 판독본이다 — 새 권한·새 진입점·새 쓰기 경로를 만들지 않는다.

코어 원칙(ARCHITECTURE §0)과의 대조: 번역 값·소스 키·export·push 적재 어느 것도 건드리지 않는다. 인증 경계도 그대로다 — 새 route 셋은
전부 **무인증 읽기 전용**이고 DB·쿠키·세션을 읽지 않는다.

## 4. 사용자 결정 기록 (2026-10-15)

| # | 결정 | 근거 |
|---|---|---|
| 1 | 감사 항목 2(홈 콘텐츠 비율)를 뺀다 | 시각 디자인 보존과 충돌 — §6 |
| 2 | 감사 항목 4(OAuth 스코프 선언)를 뺀다 | mcp-oauth 비목표 — §6 |
| 3 | OpenAPI는 `/api/push`·`/api/push/failure` 둘만 싣는다 | OAuth는 RFC 8414가 이미 발견 문서, MCP는 JSON-RPC, `/api/pull`은 cron 전용 |
| 4 | **외부 계약의 의미(동작·red 조건·안정성)는 `docs/ACTIONS.md`가 정본이고, `/openapi.json`은 Zod에서 생성한 형태의 파생본이다** | 손 사본이 둘이 되지 않게 한다. `info.version`은 앱 버전(서버 계약의 축)이고 action 태그(`malmoi-i18n-push-vN`)는 클라이언트 축이라 별개다 |
| 5 | ARCHITECTURE §8.1의 D11("middleware rewrite·수동 HTML 응답·Next 변경을 하지 않는다")은 **`/docs/*` 404의 HTML 본문 SSR에 한정된 결정**으로 읽는다. Accept 분기 fallback rewrite는 별개 결정으로 §8.1에 새로 남긴다 | middleware·CSP를 넓히지 않고, `/docs/*`와 HTML 404를 건드리지 않는다 |
| 6 | `PushResponse`를 `lib/push/payload.ts`의 Zod 스키마로 옮기고 타입은 `z.infer`로 만든다 | 정의가 하나라 OpenAPI 응답 스키마와 생산자 타입이 갈라질 수 없다(POSTMORTEM 2026-08-31 방향) |
| 7 | 문구는 `en.seo`(영어 고정 절)에 둔다. 제목은 `en.notFound.title`을 재사용한다 | `terminology.test.ts` 게이트를 받는다. 같은 개념에 셋째 변형을 만들지 않는다 |
| 8 | Accept 판정은 부분 문자열 매칭이고, q값·대소문자를 해석하지 않는 한계를 명시한다 | 라우터 정규식으로 q 파서를 만들 수 없다 — design §2.1 |
| 9 | self-hosted의 Markdown 404는 상대 링크만 싣는다 | Host 헤더를 읽지 않는다. 요청 URL을 기준으로 풀린다 |
| 10 | 비목표는 나눠서 기록한다 — OAuth 스코프는 ARCHITECTURE(mcp-oauth 절), 홈 콘텐츠 비율은 ARCHITECTURE §8.1, PRODUCT §4.2에는 "OpenAPI 대상 확장"·"일반 페이지 Markdown 협상" 두 줄 | 각 결정이 이미 사는 정본에 붙인다 |

## 5. 완료 조건 — 수락 기준

자동 검증(`pnpm test`·`pnpm typecheck`)과 수동 실측(built server curl)을 나눠 적는다. 수동 실측은 쿠키 없이 요청한다(화면 언어 en).

1. **Markdown 404** — 어떤 라우트에도 매칭되지 않는 경로(`/some-path-that-does-not-exist`)에 `Accept: text/markdown`을 주면 **첫 응답이 상태 404 · `Content-Type: text/markdown; charset=utf-8` · `Vary: Accept`**다.
   본문은 Markdown 제목 하나와 설명 문장, 링크 셋이다(hosted: `SITE_ORIGIN` 기준 `/docs` · `/llms.txt` · `/openapi.json` 절대 URL). 본문이 20자 이상이어야 한다는 기준은 감사 기준에서 왔다.
   자동: `markdownNotFound` 단위 테스트 + route 테스트. 수동: `curl -sS -i -H 'Accept: text/markdown' <origin>/some-path-that-does-not-exist`.
2. **HTML 404 무변경** — Accept 없이(또는 `text/html`) 같은 경로를 요청하면 지금과 같은 404 HTML이다. 수동: 상태 404 · `text/html` · 초기 HTML 본문(Flight 제외)에 `Page not found`가 있다.
3. **기존 경로 무변경** — `Accept: text/markdown`을 줘도 라우트에 매칭되는 경로(`/` · `/docs` · `/llms.txt` · `/sitemap.xml`)는 지금 응답 그대로다. `/docs/<없는 slug>`도 지금과 같은 HTML 404다(§6). 수동: Accept 유무에 따라 상태·content-type이 같다.
4. **JSON API 404** — **어떤 route도 받지 않는** `/api` 경로(`/api` · `/api/nope` · `/api/v1/x`)는 모든 메서드에서 **404 `application/json`**이고, 본문은 `{ "error": "not-found", "message": …, "openapi": "/openapi.json" }`이다.
   `dynamicParams = false` route가 목록 밖 값에서 넘긴 요청(`/api/search-index/fr`)도 이 응답이 된다(design §2.2). 등록된 API의 응답(`POST /api/push` 401, `GET /api/push` 405, `/api/auth/*`)은 바뀌지 않는다.
   자동: route 테스트(메서드 집합 · 상태 · 본문). 수동: curl.
5. **OpenAPI** — `GET /openapi.json`이 200 `application/json`으로 OpenAPI 3.1 문서를 낸다. 경로는 `POST /api/push`·`POST /api/push/failure` 둘이고, 요청 본문 스키마는 서버가 검증에 쓰는 Zod에서 생성된다. 보안 스킴은 프로젝트 push 토큰 HTTP bearer 하나다.
   자동: 골든 스냅샷(`toMatchFileSnapshot`)과 composite action이 보내는 필수 필드 리터럴 목록 단언. 수동: 정확한 버전으로 고정한 `@redocly/cli lint` 1회 통과.
6. **self-hosted** — 위 셋이 self-hosted 모드에서 거짓을 말하지 않는다. Markdown 404는 hosted origin과 `llms.txt`를 가리키지 않고 상대 링크(`/docs` · `/openapi.json`)만 싣는다. OpenAPI의 서버 URL은 상대 `/`라 문서가 서빙된 origin을 따른다. 자동: 단위 테스트(모드별 본문). 수동: self-hosted 모드 curl.

## 6. 비목표

- **홈 raw HTML 콘텐츠 비율 2.6% → 5%** (감사 항목 2): 홈은 이미 H1과 5,877자 본문을 SSR한다. 비율만 미달이다 — 581KB 중 RSC 페이로드가 304KB, 인라인 SVG 227개가 100KB, class 속성이 144KB다. 맞추려면 랜딩 목업 마크업을 덜어내야 해서 시각 디자인 보존과 충돌한다.
- **OAuth 스코프 선언** (`scopes_supported`·OpenAPI OAuth 스코프, 감사 항목 4): mcp-oauth의 비목표다("OAuth scope로 새 권한을 만들지 않는다" — `lib/oauth/metadata.ts`). authorize는 `scope`를 읽지 않으므로, 반영되지 않는 스코프를 광고하면 거짓 선언이 된다. 그래서 OpenAPI 보안 스킴의 스코프 배열도 비운다.
- **OpenAPI에 `/oauth/*` · `/api/mcp` · `/api/pull`을 싣지 않는다** (결정 3).
- **오류 응답 갈래를 OpenAPI에 열거하지 않는다** — 409 사유 다섯 등은 `{ error: string }` + 추가 필드 허용으로만 적는다. 의미는 `docs/ACTIONS.md`가 정본이다(결정 4).
- **라우트에 매칭된 뒤 `notFound()`로 끝나는 404의 Markdown 본문** — `/docs/<없는 slug>` · `/invite/<bad>` · `/signin/link/<bad>`는 HTML 404로 남는다(ARCHITECTURE §8.1 "`/docs/*` 404의 첫 응답" 제한과 같은 층). 보호 경로(`/projects/...`)는 지금처럼 로그인으로 307이다.
- **등록된 route 안쪽의 응답** — `/api/auth/*`(NextAuth) · `GET /api/push`(405)는 지금 그대로다.
- 기존 API 오류 본문(`{"error": "..."}`)에 `message`·`hint`를 더하는 일 — 외부 계약(composite action이 읽는다)이라 이번에 형식을 넓히지 않는다.
- 일반 페이지의 Markdown 협상(`Accept: text/markdown`이면 `/docs/*`를 Markdown으로 내기) — 원고는 이미 `/llms-full.txt`가 낸다.
- `llms.txt`에 `/openapi.json` 링크를 더하는 일 — 감사는 경로를 직접 본다.
