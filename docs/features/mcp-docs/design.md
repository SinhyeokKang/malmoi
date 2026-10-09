# mcp-docs — design

## 영향 받는 흐름

push / 편집 UI / pull **어디에도 붙지 않는다.** MCP 진입점(`/api/mcp`)의 읽기 도구 하나다. DB를 읽지 않고, GitHub을 부르지 않고, 상태를 쓰지 않는다.

```
/api/mcp (resolveBearer → createMcpServer)
  └ read_docs ─ loadSummary("en") · loadSource("en", file)   ← lib/guide/load.ts (fs)
                 └ planDocsRead(nav, sources, input, origin)  ← 순수 (lib/mcp/docs.ts)
                      ├ absoluteGuideLinks(source, file, origin) ← lib/seo/llms.ts에서 export + origin 인자
                      ├ docsSearchEntries(nav, file => parseMd(…)) · searchGroups ← lib/search/* 재사용
                      └ sectionSlices(source)   ← H2 절 위치로 원고를 자른다
```

- `load.ts`의 React `cache()`는 route handler에서 메모이즈하지 않는다 — 호출마다 원고 36파일(약 126KB)을 읽고 파싱한다. 그 비용은 받아들이고 캐시를 새로 만들지 않는다.

## 입력·출력

입력 스키마(zod): `{ page?: string (0..200), query?: string (1..200) }`. 갈래는 **키 존재**로 가른다(`input.page !== undefined`) — Overview의 `page`가 `""`이기 때문이다(SUMMARY 첫 항목 `README.md`의 slug가 `[]`, `docsSearchEntries`의 `page = slug.join("/")`).

| 입력 | `data` | `summary`(`en.mcp.summary`) |
|---|---|---|
| `{}` | `{ pages: [{ page, title, url, sections: [{ anchor, title }] }] }` | `{n} guide page(s).` |
| `{ page }` | `{ page, title, url, markdown }` | `Guide page {title}.` |
| `{ query }` | `{ query, results: [{ page, title, section, url, markdown }] }` (≤ 5) | `{n} guide section matches.` / `{n} guide sections match.` |
| `{ query }` 0건 | `{ query, results: [] }` | `No guide sections match “{q}”. Call read_docs with no arguments to see the contents.` |
| 없는 `page` | 거부 `not-found` | `en.mcp.errors["docs-page-not-found"]` — "No guide page with that name. Call read_docs with no arguments to list pages." |
| 토큰 0개 `query` · 둘 다 | 거부 `invalid-input` | 기존 문장 |

- summary 형은 기존 `en.mcp.summary`를 따른다 — `n.toLocaleString("en-US")` + `n === 1` 단수·복수 분기 + 마침표. 0건 문장은 화면 0건 규칙(`No {대상} match “{q}”`, DESIGN §10)에 마침표와 다음 행동 한 문장을 붙인다.
- `not-found` 거부는 코드는 기존 그대로 두고 `{ status: "refused", code: "not-found", message }`로 문장만 갈아 끼운다(`refused`가 이미 `message`를 받는다 — `lib/mcp/result.ts`). 기존 `MESSAGE["not-found"]`는 프로젝트 문장("You can't open this project. Check your invite link.")이라 쓰지 않는다. `en.mcp`는 `Messages` 밖이라 ko·es 키가 필요 없다.
- `page`는 `docsSearchEntries`의 `page`(= SUMMARY slug의 `/` 결합)와 같은 값이고, URL의 `/docs/` 뒤 경로와도 같다 — 목차가 준 값이나 본문 링크의 경로를 그대로 되받는다.
- 목차의 `sections`는 id 있는 H2만이다 — 도입부(`anchor: null`)는 넣지 않는다.
- 검색 결과의 `section`은 페이지 도입부(첫 H2 전)면 `null`이다 — 검색 색인과 같은 단위다.
- `url`은 `appUrl(ctx, href)` — 색인의 `href`(`/docs/...#anchor`)에 origin을 붙인다.
- 검색 토큰이 0개인 query는 `invalid-input`이다 — zod `min(1)`은 공백만 있는 값을 통과시키고, 그대로 두면 "검색어 없음"과 "0건"이 같은 응답이 된다.

### 도구 설명(`en.mcp.tools.read_docs`)이 싣는 계약

첫 문장에 "Malmoi's user guide (the Docs at /docs)"로 두 낱말을 한 번 잇는다 — 화면 기능명은 `Docs`(DESIGN §10.0), 도구 안의 summary·거부 문장은 `guide`로 통일한다. 이어서 다음을 적는다.

- 언제 부르나: 거부 문장·개념·사용법(권한, Publish, 번역 화면)을 모를 때 먼저.
- 인자 없이 부르면 목차다.
- `page`는 목차의 값이고, URL의 `/docs/` 뒤 경로와 같다.
- `page`와 `query`는 하나만 준다.

에이전트가 `invalid-input`의 일반 문장만 받고도 스스로 고칠 수 있게 하는 것이 목적이다.

## 순수 함수 (← `/tdd` 진입점)

1. **`absoluteGuideLinks(source, fromFile, origin)`** — 지금 `lib/seo/llms.ts`의 비공개 함수이고 origin이 `SITE_ORIGIN` 고정이다. **origin 인자를 받게 하고 export한다**. `llmsFull`은 `SITE_ORIGIN`을 넘긴다 → `/llms-full.txt` 바이트 불변(`llms.test.ts`의 fixture 정확 문자열이 고정). `origin === null`이면 앱 경로(`resolved.href`) 그대로다.
2. **`sectionSlices(source): { anchor: string | null; markdown: string }[]`** — 원고를 파싱해 H2(`{#id}` 있는 것) 위치로 자른다.
   - 첫 조각은 첫 H2 전의 도입부(`anchor: null`)다. **H1 노드만 제외한다** — `docsSearchEntries`와 같은 규칙이다(H1을 위치와 무관하게 건너뛰고, H1 앞 노드도 도입부에 넣는다). 도입부가 비어도 조각을 낸다(`docsSearchEntries`는 도입부를 항상 낸다).
   - id 없는 H2는 `docsSearchEntries`와 같이 **그 절을 버린다**(검색 단위와 어긋나지 않게 — 그 규칙을 함께 고정한다).
   - H3는 절을 나누지 않는다. 코드 펜스 안의 `## `는 heading이 아니다(mdast 위치로 자르므로 자연히 지켜진다). 각 조각은 `trim()`.
   - 링크 치환(`absoluteGuideLinks`)이 끝난 원고를 받아 그 mdast 위치로 자른다.
   - 참조식 링크(`[x][ref]`)는 다루지 않는다 — 정의가 페이지 끝에 있어 절 조각에서는 해석되지 않는다. `guide/en`에 `linkReference`·`definition`이 0건이라는 가드 테스트로 그 전제를 고정한다(쓰이지 않는 형식의 처리를 선반영하지 않는다).
3. **`planDocsRead(nav, sources, input, origin): ToolOutcome`** — `nav: readonly NavNode[]`(트리 — `docsSearchEntries`가 트리를 받는다), `sources: ReadonlyMap<file, string>`(원고 원문). 내부에서 `flattenNav`로 페이지 목록을, `parseMd`로 `pageOf`를 만든다(`lib/guide/parse`·`lib/guide/summary`는 `server-only`가 아니다 — 순수 경계 유지).
   - 세 갈래 판정. `page`는 **평탄 목록에서 `find`로만** 해소한다 — 입력 문자열이 `loadSource`에 직접 닿지 않는다(`loadSource`는 경로 검사가 없다).
   - 검색은 `searchGroups`의 docs 갈래를 그대로 부른다(`SearchIndex`에 빈 `projects`·`pages`, `activeSlug: null` — docs 순서는 점수 내림 → 색인 순서). 상한은 `SEARCH_GROUP_LIMIT`(5) 하나. 검색 순위를 새로 만들지 않는다.
   - 검색 결과와 `sectionSlices` 조각은 **`(page, anchor)` 쌍**으로 잇는다 — id 문자열을 파싱하지 않는다(도입부 id는 `docs:page`, Overview 도입부는 `docs:`라 `docs:page#anchor` 형이 아니다).

도구 껍데기(`lib/mcp/tools/docs.ts`)는 `loadSummary("en")`과 평탄 목록의 파일마다 `loadSource("en", file)`을 불러 `planDocsRead`에 넘기기만 한다.

## 왜 markdown이고 plain text가 아닌가

검색 색인 `body`는 `toText`라 표·코드 블록·목록 구조가 사라진다. 가이드의 권한표·한도표·YAML 예시는 구조가 정보다. `/llms-full.txt`가 이미 같은 결정(원고 원문 + 링크만 절대화)을 했다 — 같은 변환을 재사용한다.

## 스키마 변경

없음.

## 새 환경변수

없음.

## 파일 트레이싱 (⚠️ 이 기능의 유일한 배포 함정)

`guide/**`는 `next.config.ts`의 `outputFileTracingIncludes`가 **`/docs/[[...slug]]` 함수에만** 싣는다. `/llms*.txt`·`/api/search-index`는 `force-static`이라 빌드 때 읽는다(ARCHITECTURE §8.1 — "`force-static`을 빼거나 동적 API를 쓰면 Vercel에서만 500"). `/api/mcp`는 요청마다 도는 동적 route다 →
**`outputFileTracingIncludes`에 `"/api/mcp": ["./guide/en/**/*.md"]`를 더한다.** en만 — MCP는 영어 고정이고 번들을 불리지 않는다. 글롭이 `SUMMARY.md`도 덮는다.

- 키 형식 `"/api/mcp"`는 맞다(`normalizeAppPath("/api/mcp/route")`). picomatch `contains` 매칭이라 `/.well-known/oauth-protected-resource/api/mcp` 함수에도 원고(약 125KB)가 실린다 — 해는 없고 §8.1에 한 줄 남긴다.
- 로컬 `next start`는 리포 파일을 그대로 읽어 누락을 못 잡는다. 판정은 셋이다.
  - 설정 테스트: 기존 `lib/guide/__tests__/tracing.test.ts`를 넓혀 `"/api/mcp"` 글롭이 en 서빙 원고 전부와 SUMMARY를 덮는지 단언한다.
  - 빌드 산출 판정: `pnpm build` 뒤 `.next/server/app/api/mcp/route.js.nft.json`에 `guide/en/*.md`가 실렸는지 본다(`next.config.ts` 머리 주석이 정한 판정 방식).
  - 런타임 판정: preview MCP 호출이다(SSO bypass 헤더 — 완료 조건 10).
- 셀프 호스팅: 이미지가 `COPY . .`이고 `.dockerignore`가 `guide/`를 빼지 않는다 — standalone 출력을 쓰지 않으므로 트레이싱과 무관하게 원고가 있다. SELF-HOSTING §3 체크리스트(마이그레이션·패키지·env·Vercel 전용·cron·토큰 URL·설치 절차) 어느 것에도 걸리지 않는다.
- PRODUCT §4.1 "self-hosted용 sitemap·llms 산출물은 하지 않는다"와 겹치지 않는다. llms가 self-hosted에서 404인 이유는 hosted origin을 가리키는 거짓 산출물이어서다. `read_docs`는 설치 origin으로 링크를 만든다.

## 인가

카탈로그 `req(null, null)` — `whoami`·`list_projects`와 같다. 공개 원고라 역할·grant가 없다. 그래도 `/api/mcp`는 Bearer가 필요하다(입구 계약 불변 — §6.45.1). 프로젝트 slug 입력이 없으므로 `tools/access.ts`의 프로젝트 판정을 지나지 않는다.

## 불변식 영향

- **export 결정성·blob SHA**: 무관. 다만 같은 정신으로 출력이 결정적이다(완료 조건 9).
- **인증 경계**: 무관 — GitHub 자격증명을 쓰지 않는다. 쿠키를 읽지 않는다(`no-cookie-reads.test.ts`가 `lib/mcp/**`를 훑는다 — 새 파일도 그 아래).
- **`/llms-full.txt` 바이트**: `absoluteGuideLinks`에 인자를 더하는 변경이 출력을 바꾸면 안 된다. 확인은 둘이다.
  - `llms.test.ts`의 fixture 정확 문자열이 green으로 남는다.
  - 실물 원고는 변경 전후 `GET /llms-full.txt` 본문 sha를 1회 대조한다. 실물 바이트를 고정하는 테스트가 없기 때문이다.
- **영어 고정 표면**: 도구 설명·summary·거부 문장은 `en.mcp.tools`·`en.mcp.summary`·`en.mcp.errors`에 둔다. 이 절은 `Messages` 밖의 영어 고정 절이다(`lib/i18n/index.ts`). ko·es 사전에 키를 더하지 않는다. `terminology.test.ts`가 en 전체를 훑으므로 새 문장이 금지어에 걸리지 않아야 한다.

## POSTMORTEM 인용

- 2026-09-08 — 사전 조회는 `Object.hasOwn`이다(MCP `toToolResult`의 MESSAGE 조회). 이 도구의 `page`도 남이 준 문자열이다. 그래서 **SUMMARY 목록에서 `find`로 찾고** 객체 키 조회를 하지 않는다. `__proto__`·`constructor` 입력이 프로토타입을 찾지 않게 하기 위해서다.
- 2026-09-06 — 입력에 `userId`·`projectId`가 없다. 이 도구는 주체 데이터를 읽지 않으므로 해당 위험이 없다.
- ARCHITECTURE §8.1(파일 트레이싱) — 위 절. §6.45.8(preview SSO) — 완료 조건 10.

## 문서 갱신 (implement/push 몫)

- ARCHITECTURE §6.45.5
  - "30개 — 읽기 15 · 쓰기 15"를 31 · 16으로 고친다.
  - 읽기 표에 `read_docs` 행을 넣는다.
- ARCHITECTURE §8.1
  - 트레이싱 문장에 `/api/mcp`(en만)를 추가한다.
  - `.well-known` 동승 한 줄을 넣는다.
- PRODUCT §4.1 "MCP 커넥터"
  - 가이드 읽기 한 줄을 넣는다.
  - 셀프 호스팅 "하지 않는 것"의 llms 항목과 경계 한 줄을 넣는다.
  - ⚪ §4.2 개방 조건 문장의 "읽기 14 · 쓰기 14"(PRODUCT:568)는 이 기능 이전부터 낡았다 — 당시 수치로 읽힌다면 두고, 현재 수치로 읽힌다면 고친다.
- DIRECTORY
  - `lib/mcp/docs.ts`·`lib/mcp/tools/docs.ts`를 넣는다.
  - catalog 설명의 "도구 30"(DIRECTORY:821)을 31로 고친다.
- 가이드 `ai-agents/permissions.md`(en·ko·es)의 `#tools` 표에 행 하나 — `/guide` 몫이다.
