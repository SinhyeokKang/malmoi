# mcp-docs — tasks

순서: 순수 함수 → 도구 껍데기 → 배선·트레이싱 → 문서. UI 없음(design-brief 없음).

⚠️ `lib/mcp/`는 `test:projects:postgres` 트리거다(`scripts/gate-plan.ts`) — 커밋 경계 ②부터 검증은 `pnpm gate`다. PostToolUse 훅은 `lib/mcp`·`lib/seo`·`next.config.ts`를 덮지 않아 편집 때 자동 test가 돌지 않는다.

## T1 · `absoluteGuideLinks`에 origin 인자 + export
- `lib/seo/llms.ts` — `absoluteGuideLinks(source, fromFile, origin: string | null)`. `llmsFull`은 `SITE_ORIGIN`을 넘긴다. `null`이면 앱 경로.
- 테스트: origin 셋(`SITE_ORIGIN` · 셀프 호스팅 origin · `null`)에서 내부 링크·참조 정의만 바뀌고 외부 링크·코드·이미지 바이트는 보존.
- **검증**:
  - 자동: 새 테스트 green + 기존 `llms.test.ts`의 fixture 정확 문자열 무변경 green.
  - 수동(1회): 변경 전후 `/llms-full.txt` 본문 sha가 같다. route `GET()`을 부르는 방식은 `app/__tests__/crawl-files.test.ts`와 같다. 실물 원고로 바이트를 고정하는 테스트는 없다.

## T2 · `sectionSlices(source)`
- `lib/mcp/docs.ts`(순수, `server-only` 없음 — `pure-boundary.test.ts`의 `PURE`에 등재).
- 테스트(fixture):
  - 도입부는 `anchor: null`이고 H1 노드만 제외한다. H1 앞 노드는 도입부에 포함되고, 도입부가 비어도 조각이 선다.
  - H2 절.
  - id 없는 H2 절은 버린다.
  - H3는 절을 나누지 않는다.
  - 코드 펜스 안의 `## `는 절이 아니다.
  - 각 조각은 trim한다.
- 테스트(실물 `guide/en` 전 페이지):
  - 동치: `sectionSlices`와 `docsSearchEntries`의 `(page, anchor)` 집합이 같다. 선례는 `lib/search/__tests__/docs-index.test.ts`의 실물 로드다.
  - 가드: `linkReference`·`definition` 노드가 0건이다. 참조식 링크가 절 조각에서 해석되지 않는다는 전제를 고정한다.
  - id 없는 H2·중복 앵커는 실물에서 `structure.test.ts`가 이미 막으므로 fixture로만 고정한다.
- **검증**: `pnpm test` green.

## T3 · `planDocsRead(nav, sources, input, origin)`
- 같은 파일. 세 갈래와 거부 둘이다: `not-found`(가이드 전용 문장) · `invalid-input`(둘 다 · 토큰 0개 query). 검색은 `searchGroups` docs 갈래를 재사용하고 상한은 `SEARCH_GROUP_LIMIT`다. 조인은 `(page, anchor)`로 한다.
- 테스트 — 목차·페이지:
  - 목차가 SUMMARY 순서이고, `sections`에는 id 있는 H2만 있다(도입부 없음).
  - **목차의 모든 `page` 값이 `{ page }`로 ok다(왕복).** Overview의 `{ page: "" }`도 포함한다.
  - `page` 전문이 `absoluteGuideLinks` 결과와 같다.
  - 다음 `page`는 `not-found`이고, 그 문장에 `project`가 없다: `__proto__` · `constructor` · `/sync/publish` · `sync/publish/` · `docs/sync/publish` · `sync/publish.md` · `SHOOTING`.
- 테스트 — 검색(fixture로 순위를 고정한다 — `searchGroups(…).docs`와 대조하면 구현이 그것을 부르므로 동어반복이다):
  - 점수는 제목 접두 > 제목 > 절 제목 > 본문 순이다.
  - 동점이면 SUMMARY 순서다.
  - 6건 이상이면 5건으로 자른다.
  - 각 결과의 `markdown`이 같은 `(page, anchor)`의 `sectionSlices` 조각이다(조인 정확성).
  - 유니코드 query가 동작한다.
- 테스트 — 거부·결정성:
  - 0건은 ok + 빈 배열이다.
  - 공백만 있는 query는 `invalid-input`이다.
  - 둘 다 주면 `invalid-input`이다.
  - 같은 입력을 두 번 주면 같은 출력이다.
- **검증**: `pnpm test` green.

— 커밋 경계 ① `test:` (T1–T3 red) → ② `feat(mcp):` 순수 함수

## T4 · 도구 껍데기 + 카탈로그 + 사전
- 도구 껍데기 `lib/mcp/tools/docs.ts` `read_docs`:
  - zod `{ page?: string(0..200), query?: string(1..200) }`이고, 갈래는 키 존재로 가른다.
  - `loadSummary("en")`과 파일별 `loadSource("en", file)`을 읽어 `planDocsRead`에 넘긴다. origin은 `appUrl`로 붙인다.
- 카탈로그 `lib/mcp/catalog.ts`:
  - 읽기 묶음 끝에 `{ name: "read_docs", annotations: READ, access: req(null, null) }`을 넣는다.
  - 주석 "읽기 15"를 "읽기 16"으로 고친다.
  - `lib/mcp/tools/index.ts`에 등재한다.
- 사전 `messages/en.tsx`:
  - `mcp.tools.read_docs` 설명: 첫 문장은 "Malmoi's user guide (the Docs at /docs)"다. 이어서 언제 부르나(거부 문장·개념·사용법), 인자 없으면 목차, `page`는 목차 값 = URL의 `/docs/` 뒤 경로, `page`·`query` 중 하나를 적는다.
  - `mcp.summary` 넷: 목차 · 페이지 · 검색 n건(단수·복수) · 0건.
  - `mcp.errors["docs-page-not-found"]`.
  - `terminology.test.ts` 금지어에 걸리지 않아야 한다.
- 테스트 갱신:
  - `catalog.test.ts`의 `READ`·`EXPECTED` 배열과 제목 "읽기 15"를 고친다.
  - `registry.test.ts`(`en.mcp.tools` 키와 집합 동치)와 `mcp-route.test.ts`(`toolCatalog()`와 동적 비교)는 자동으로 따라오므로 손대지 않는다.
- 테스트 추가 — `lib/mcp/tools/__tests__/read-tools.test.ts` 하네스로 `read_docs`를 부른다:
  - 세 갈래 응답 모양(`structuredContent`·summary).
  - **완료 조건 2**: grant 0개 · `projectIds: []` 범위 토큰으로 ok다.
  - `not-found` 거부 문장.
  - 실물 원고 로드는 node vitest에서 된다. 선례는 `llms.test.ts`이고, `server-only`는 `vitest.setup.ts`가 mock한다.
- **검증**: `pnpm gate` green(typecheck · test · PG 스위트 · build).

## T5 · 파일 트레이싱
- `next.config.ts` `outputFileTracingIncludes`에 `"/api/mcp": ["./guide/en/**/*.md"]`.
- 테스트: 기존 `lib/guide/__tests__/tracing.test.ts`를 확장한다. 같은 방식(`globSync` + `helpers/served.ts`의 `servedGuideFiles`)으로 `"/api/mcp"` 글롭이 en 서빙 원고 전부와 `SUMMARY.md`를 덮는지 단언한다.
- **검증**:
  - 자동: `pnpm gate` green.
  - 수동(빌드 산출): `.next/server/app/api/mcp/route.js.nft.json`에 `guide/en/*.md`가 실려 있다.
  - 수동(런타임, push 뒤): preview `https://dev.mal-moi.com/api/mcp`를 호출해 확인한다.
    - 헤더: `Authorization: Bearer <dev DB에서 발급한 개인 토큰>`과 `x-vercel-protection-bypass`를 **따로** 싣는다(ARCHITECTURE §6.45.8). bypass 값은 로컬 환경변수에서만 읽는다.
    - 통과: `read_docs {}`가 500 없이 `pages` 배열을 돌려준다. **302·SSO HTML은 실패로 센다.**

— 커밋 경계 ③ `feat(mcp): add read_docs tool`

## T6 · 정본 문서
- ARCHITECTURE
  - §6.45.5: 31 · 읽기 16으로 고치고 표에 행을 넣는다.
  - §8.1: 트레이싱 문장에 `/api/mcp`(en만)와 `.well-known` 동승 한 줄을 넣는다.
  - §6.45.7: `tracing.test.ts`의 `/api/mcp` 단언을 넣는다.
- PRODUCT §4.1
  - MCP 커넥터에 가이드 읽기 한 줄을 넣는다.
  - 셀프 호스팅 "하지 않는 것"의 llms 항목과 경계 한 줄을 넣는다.
- DIRECTORY
  - `lib/mcp/docs.ts`·`lib/mcp/tools/docs.ts`를 넣는다.
  - catalog 설명의 "도구 30"을 31로 고친다.
- ⚪ PRODUCT §4.2 개방 조건 문장의 "읽기 14 · 쓰기 14"는 이전부터 낡았다 — 언급만 하고, 고칠지는 `/push` 4단계에서 판정한다.
- **검증**: `/push` 4단계 신선도 · 문서별 커밋.

## T7 · 사용자 가이드 (`/guide`)
- `guide/{en,ko,es}/ai-agents/permissions.md` `#tools` 표에 `Read the guide | read_docs` 행. 필요하면 `prompts.md`에 예시 한 줄.
- ⚠️ `#tools` 표에는 카탈로그와 대조하는 게이트가 없다. 구조 동형 테스트(`locales.test.ts`)도 표 행 수를 세지 않는다. 세 언어의 행을 손으로 맞추고, 행의 굵게·링크 꼴을 같게 한다.
- **검증**: `pnpm test`(가이드 게이트) green + 세 언어 표 행 수 눈 대조. 스크린샷 영향 없음.

— 끝나면 `docs/features/mcp-docs/` 삭제(결론은 T6로 정본에 올라갔다).
