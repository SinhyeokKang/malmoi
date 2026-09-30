# global-search — 설계

> **착수 조건: component-unify 종료 뒤**(spec 머리). file:line은 dev 2026-10-01 기준이고, 그 기능이 옮기는 자리(`modal.tsx` → `LargeModal` · `components/search-input.tsx` → `ui/` · `project-list.tsx` 행 → `ListRow` · 슬롯 개명)는 tasks T0이 다시 잰다.

## 영향 받는 흐름

**편집 UI 셸 + 공개 셸의 헤더, 그리고 번역 데이터의 읽기 조회 하나다.** push·pull·export·DB 쓰기와 닿는 곳이 없다.

```
app/(edit)/layout.tsx ─ toNavProjects(memberships) ─┬─ Sidebar (그대로)
                                                   └─ Header ── SearchTrigger ── SearchDialog ("use client")
components/public-shell/header.tsx ─ account ───────── SearchTrigger ── SearchDialog      │
                     (account ≠ null이면 탭 수명에 한 번) loadSearchMembershipsAction()    │
                                                                                         │ 탭 수명에 한 번
                                                                  GET /api/search-index ─┘
                                                                   └ docsSearchEntries(guide/**)  (force-static)

SearchDialog (로그인이면) ── 250ms 디바운스 · 2자 이상 ── searchKeysAction(q, activeSlug)  [app/search/actions.ts]
                                                        └ readSession → searchKeys(prisma, { userId, q, activeSlug })  [lib/keys/search.ts]
                                                            ① 키 이름·원문 ILIKE (LIMIT 5)  ② 모자라면 번역값 ILIKE (LIMIT 나머지)
```

- **결과 집합은 세션으로 갈린다, 셸로 갈리지 않는다** (2026-10-01 사용자). 판정 입력은 "멤버십을 가졌나"(`NavProject[] | null`) 하나이고 `navSearchEntries`는 셸을 모른다.
- **Projects·Menus 색인은 클라이언트가 만든다** — 앱 셸은 레이아웃이 이미 받은 멤버십(`NavProject[]`)을 Header에도 넘긴다(**새 DB 조회 0**). 공개 셸은 페이지가 이미 판정한 `account`만 안다 — `account ≠ null`이면 Dialog를 **처음 열 때** `loadSearchMembershipsAction()`(읽기 전용 Action — `readSession` → `loadMemberships(prisma, userId)` → `toNavProjects`)으로 받고, 결과 Promise를 **모듈 수준에 둔다**(`lib/search/load-memberships.ts` — `PublicShell`은 페이지마다 다시 렌더되므로 컴포넌트 state면 페이지를 옮길 때마다 다시 조회한다). 실패 Promise는 버린다. 공개 페이지 렌더에 조회를 얹지 않는 이유: 랜딩·가이드 방문은 대부분 검색을 안 연다. 받는 동안 상태 줄에 로딩 한 줄, 세션이 그새 사라졌으면(`{ ok: false }`) 비로그인 결과로 떨어진다.
- ⚠️ **`toNavProjects`(레이아웃의 `memberships.map(...)`을 옮긴 순수 함수, `lib/shell/nav.ts`)를 두 자리가 함께 쓴다** — 레이아웃과 Action이 각자 좁히면 한쪽에만 필드가 늘어 sec-audit 발견 23(`installationId`·`lastCommitSha`가 RSC에 실렸다)이 재발한다. ⚠️ 입력 타입 `MembershipRow`는 server-only `lib/keys/query.ts`의 것이라 **`import type`**으로만 읽는다(`nav.ts`는 `CLIENT_LIB_FILES`에 있다 — 값 import면 client-graph가 red).
- **Action 파일은 `app/search/actions.ts`다**(`(edit)` 밖, `page.tsx`가 없으니 라우트가 생기지 않는다) — 공개 셸 페이지도 부르므로 편집 셸 그룹에 두면 경로가 거짓을 말하고, 파일명이 정확히 `actions.ts`여야 `app/__tests__/entry-points.test.ts`의 스캔(`/^(page\.tsx|route\.ts|actions\.ts)$/`)에 든다. (`app/(edit)/publish-actions.ts`가 같은 이유로 스캔 밖이다 — 언급만 하고 고치지 않는다.)
- **Docs 색인은 공개 GET 하나다** — `app/api/search-index/route.ts`. 질의를 받지 않고 **모두에게 같은 JSON**을 준다.
- **Keys는 질의마다 서버가 찾는다** — 읽기 전용 Server Action `searchKeysAction`(Publish·Revert 미리보기와 같은 부류: `revalidatePath`를 부르지 않는다). 색인을 클라이언트로 내리지 않는 이유는 행 수(프로젝트당 최대 200,000셀)와 인가다 — 값은 멤버에게만 보여야 하고, 서버가 세션으로 좁히는 것이 경계의 전부다.

### Action 형 (`app/search/actions.ts`)

`app/(edit)/publish-actions.ts`의 형을 따른다 — ⚠️ **`requireUser`를 쓰지 않는다**: 그것은 `redirect()`를 던지고(`lib/auth/session.ts` 머리 주석 "Server Action에서는 이걸 쓰지 않는다"), 세션이 만료된 채 검색하면 Dialog가 `/signin`으로 튄다(POSTMORTEM 2026-09-13 부류).

```ts
export async function searchKeysAction(q: unknown, activeSlug: unknown): Promise<KeySearchResult> {
  if (typeof q !== "string") return { ok: true, hits: [] };
  const session = await readSession();
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  if (session.status !== "ok") return { ok: false, error: "unavailable" };
  try { return { ok: true, hits: await searchKeys(getPrisma(), { userId: session.userId, q, activeSlug: typeof activeSlug === "string" ? activeSlug : null }) }; }
  catch { return { ok: false, error: "unavailable" }; }   // q를 기록하지 않는다
}
```

- 반환 리터럴 `{ ok: false, error: "unauthorized" }`·`{ ok: false, error: "unavailable" }`는 `entry-points.test.ts`의 `hasUserGuard` 정규식이 요구하는 형이다.
- **인가 등재 (2026-10-01 사용자 — "인가 근거가 코어 안에 있으니 스캐너도 코어를 센다")**:
  - `loadSearchMembershipsAction` → `USER_SCOPED_ACTIONS`(레이아웃과 같은 "`userId`로 좁힌 자기 데이터").
  - `searchKeysAction` → 코어 `searchKeys`를 센다. ⚠️ 기존 `DELEGATED_CORES`의 코어 검사는 "코어 본문이 **프로젝트 가드**(`PROJECT_GUARDS`)를 직접 부른다"라 `searchKeys`(가드 대신 멤버십 조인)는 통과할 수 없다 — 그 맵의 불변식을 넓히지 않고 **같은 파일에 형제 맵 `MEMBER_JOIN_CORES`**(`searchKeys → lib/keys/search.ts`)를 둔다. 판정: 그 코어를 부르는 export는 가드를 지난 것으로 세고, 따로 **코어 본문(주석 제거)이 `"ProjectMember"` 조인과 `pm."userId" = ${userId}` 바인딩을 든다**를 세며, 검출기가 0을 낼 수 있음을 자기 검사한다(POSTMORTEM 2026-09-14 · 09-18 "이름을 셌다").
- `q`는 trim 뒤 2자 미만이면 빈 결과, 200자(`Q_MAX_LENGTH` — `lib/translations/query.ts`)를 넘으면 **앞 200자로 자른다**(번역 화면 `parseTranslationQuery`와 같은 동작 — 같은 붙여넣기가 두 입구에서 갈리지 않는다). 길이는 `String.length`다.

### Keys 조회 (`lib/keys/search.ts`)

`lib/keys/`에 두는 이유: `pnpm gate`가 이 디렉터리를 격리 postgres 트리거로 이미 잡고(`scripts/gate-plan.ts`), 통합 테스트 디렉터리(`lib/keys/__tests__/*.integration.ts`)가 `vitest.projects.config.ts` include에 이미 있다 — 새 트리거·include를 늘리지 않는다.

```sql
-- 멤버 프로젝트 id를 먼저 확정한다 — 플래너가 Translation 전 테넌트를 해시 조인으로 훑지 못하게(POSTMORTEM 2026-09-18 · 09-23)
-- $members = ARRAY(SELECT p.id FROM "ProjectMember" pm JOIN "Project" p ON p.id = pm."projectId"
--                  WHERE pm."userId" = $userId AND p."archivedAt" IS NULL)

-- ① 키 이름·원문 (상한 5)
SELECT k.id, k.key, k.namespace, k."sourceText", s.slug AS "surfaceSlug", p.slug, p.name,
       (k.key ILIKE $pattern) AS "inKey"
FROM "StringKey" k
JOIN "Project" p ON p.id = k."projectId"
JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s.id = k."surfaceId"
     AND s."archivedAt" IS NULL AND s."lastCommitSha" IS NOT NULL
WHERE k."projectId" = ANY($members) AND k.orphaned = false
  AND (k.key ILIKE $pattern OR k."sourceText" ILIKE $pattern)
ORDER BY "inKey" DESC, (p.slug = $activeSlug) DESC, k.key COLLATE "C"
LIMIT 5;

-- ② ①이 n<5건일 때만: 번역값 (상한 5-n, ①의 키 제외) — 키마다 첫 일치 로케일 하나(로케일 코드 오름차순)
SELECT … FROM (
  SELECT DISTINCT ON (k.id) k.id, …, t."localeCode", t.value
  FROM "Translation" t
  JOIN "StringKey" k ON k."projectId" = t."projectId" AND k."surfaceId" = t."surfaceId" AND k.id = t."keyId"
  JOIN "Locale" l ON l."projectId" = t."projectId" AND l."surfaceId" = t."surfaceId" AND l.code = t."localeCode" AND NOT l.orphaned
  JOIN … (① 과 같은 표면·프로젝트 조인)
  WHERE t."projectId" = ANY($members) AND t.value ILIKE $pattern AND k.orphaned = false AND k.id <> ALL($excluded)
  ORDER BY k.id, t."localeCode" COLLATE "C"
) x ORDER BY (x.slug = $activeSlug) DESC, x.key COLLATE "C" LIMIT $rest;
```

- ⚠️ **멤버십은 세션 `userId`로만 좁힌다 — 클라이언트가 보낸 slug 목록을 받지 않는다.** Action 입력은 `q`와 `activeSlug`(순위용) 둘뿐이다. `activeSlug`는 남이 정한 문자열이라 `=` 비교에만 쓰고 좁히기에 쓰지 않는다. 전부 `Prisma.sql` 바인딩이다.
- ⚠️ **판정이 번역 화면과 같아야 한다** — `likePattern`은 `lib/keys/translation-list.ts`의 것을 export해서 쓰고(`%`·`_`·`\` 이스케이프가 두 벌이면 한쪽이 `_`를 와일드카드로 흘린다), 번역값은 **orphaned 아닌 로케일의 셀만** 본다(그 파일의 `NOT l."orphaned"` — :163 · :251), 정렬은 `COLLATE "C"`다(로컬 격리 PG와 Supabase의 로캘이 달라도 LIMIT 5 집합이 같게). 조인 컬럼 이름은 `/implement`가 `prisma/schema.prisma`로 대조한다.
- 표면 조건 `s."lastCommitSha" IS NOT NULL`은 번역 화면이 `ProjectNotReady`를 그리지 않는 조건(`lib/onboarding/readiness.ts`)의 표면 쪽이다(2026-10-01 사용자). readiness의 다른 쪽(`installationId`)은 지금 null로 되돌리는 경로가 없어 조인에 넣지 않는다 — 코어에 그 사실과 `lib/auth/access.ts`를 가리키는 주석을 단다(읽기 판정이 좁아지면 이 조인이 그 판정의 둘째 벌이 된다).
- ② 의 `DISTINCT ON`과 바깥 정렬은 SQL 한 문장(서브쿼리)으로 끝낸다 — 왕복은 ①·② 둘이 상한이다(spec 18). 멤버 id 확정은 같은 문장 안의 서브쿼리라 왕복을 늘리지 않는다.
- **`KeyHit` 타입은 `lib/search/key-href.ts`가 소유하고 `lib/keys/search.ts`가 `import type`으로 읽는다** — 역방향이면 클라이언트가 서버 그래프(`translation-list.ts` → prisma)를 끈다.

### 성능 판단 (2026-10-01, 실측 전)

- 2026-09-09 기준 가장 큰 프로젝트가 약 1,146행이었다(PRODUCT) — `ILIKE '%q%'`는 앞 와일드카드라 btree를 못 타고 **멤버 프로젝트의 행을 순차로** 거르지만, 이 규모에서는 ms다. 비싼 것은 쿼리가 아니라 왕복(`hnd1`에서 수십 ms)이다.
- 최악은 push 행 상한(소스 하나당 번역 200,000행)이 멤버십 여럿에 걸친 경우다. ②를 조건부로 둔 이유가 이것이다 — 키·원문에서 5건이 차면 번역값을 훑지 않는다.
- **트라이그램 인덱스는 재기 전에 넣지 않는다.** 선례는 ARCHITECTURE §1.96 — 번역 화면 검색에서 `pg_trgm` GIN(value·sourceText)을 쟀고 131→94ms라 **기각했다**(키별 EXISTS 계획). 이 조회는 계획이 달라(프로젝트 여럿을 가로지른 순차 ILIKE) 같은 결론이 보장되지 않으므로 실측(tasks B3)으로 가른다.
- **실측은 커밋된 테스트다** — `lib/keys/__tests__/search-performance.integration.ts`, `translation-list-performance.integration.ts`의 형(autovacuum off · `statement_timeout=5000` · `$on("query")` 수집 · `EXPLAIN (ANALYZE, BUFFERS)` 방문 행 단언). 픽스처: 멤버 프로젝트 둘(하나는 20,000키 × 10로케일 = 200,000행) + **비멤버 대형 테넌트 하나(같은 규모)**. 질의 넷(불일치 · 키 이름 일치 · 번역값만 일치 · 흔한 단어 — `DISTINCT ON`이 일치 행 전부를 정렬하는 경우) × 통계 상태 둘(없음 · `ANALYZE` 뒤). 단언: `Translation` 방문 행 < 멤버 프로젝트 행 수 × 2(비멤버 테넌트를 훑지 않는다 — spec 19) · 최악 질의 중앙값 ≤ 300ms면 B4 생략. 기준은 로컬 PG17의 Execution Time이고 `hnd1`↔도쿄 pooler 왕복을 뺀 값이다.
- 측정값: _(B3에서 채운다)_

### 왜 Route Handler인가 (Server Action이 아니라)

CLAUDE.md는 "내부 **쓰기**는 Server Action"이고 읽기 전용 Action 선례(Publish 미리보기·Revert 미리보기)도 있다. 여기서 Action을 쓰지 않는 이유는 둘이다:

1. **내용이 사용자와 무관하다** — 세션·권한을 안 보므로 `force-static`으로 빌드 때 한 번 만들어 CDN이 든다. Action은 POST라 매 첫 열기마다 함수가 돈다.
2. **Action은 호출한 페이지의 함수에서 돈다** — 가이드 원고를 런타임에 `fs`로 읽으려면 검색 트리거가 서는 모든 라우트에 `outputFileTracingIncludes`를 걸어야 한다.

`export const dynamic = "force-static"` — **`/llms-full.txt`(`app/llms-full.txt/route.ts`)와 같은 형**이다: 빌드 때 한 번 `guide/**`를 읽으므로 트레이싱 include가 필요 없고, 가이드는 배포마다 바뀌므로 빌드 생성으로 충분하다. 런타임 재생성(ISR)이 없어 GitHub·트레이싱 같은 런타임 의존이 0이다(Changelog를 뺀 결과 — 2026-10-01).

- ⚠️ **`/api/*`라 미들웨어 matcher 밖이고**(`middleware.ts` — CSP 대상이 아니다, 문서가 아니다) **robots가 이미 거부한다**(`lib/seo/crawl.ts`). `isProtectedPath`에 넣지 않는다(공개 셸이 비로그인으로 부른다).
- ⚠️ **`app/__tests__/entry-points.test.ts`의 `EXEMPT`에 사유와 함께 더한다** — 인가 없는 route라는 사실을 그 목록이 소유한다. 가드가 "없음"이 정답인 route이므로 `exempt-route-guards.test.ts`에는 더하지 않고 그 이유를 EXEMPT 주석에 적는다.
- 가이드 읽기 실패(`loadSummary`가 던짐)는 **던진 채로 둔다** — `force-static`이라 빌드가 실패한다. 반쯤 맞는 색인을 내지 않는다(`lib/guide/load.ts`의 "빈 내비로 삼키지 않는다"와 같은 이유). 클라이언트는 fetch 실패(네트워크·`!res.ok`)를 Docs 상태 줄 한 줄로 보인다.
- 응답은 `{ docs: DocsEntry[] }`다. 크기는 28쪽 본문 평문이다(원고 약 55KB) — 탭 수명에 한 번 받는다.

## 순수 함수로 분리 가능한 부분 — `/tdd` 대상

전부 `lib/search/`에 둔다(8의 `lib/keys/search.ts` 순수 부분 제외). **클라이언트가 읽는 모듈**(1·2·5·7·`key-href`·`load-index`·`load-memberships`)은 각각 **잎 검사**를 받고(`client-graph.test.ts`의 `lib/events/search.ts` 선례 — `walk([파일])`이 자기 자신만 낸다), 소비자(E2)가 생기는 커밋에서 `CLIENT_LIB_FILES` 정확 일치 목록에 더한다. `lib/guide/load.ts`(server-only)·`lib/keys/*`(서버 그래프)를 값으로 import하지 않는다.

| # | 파일 · 함수 | 입력 → 출력 | 핵심 테스트 |
|---|---|---|---|
| 1 | `match.ts` `searchTokens(q)` | 질의 → trim · 소문자 · 공백 분할 · 빈 토큰 제거 · 중복 제거 | `"  Demo  settings "` → `["demo","settings"]` · 빈 문자열 → `[]` |
| 1 | `match.ts` `scoreEntry(entry, tokens)` | 항목 `{ title, context?, body? }` + 토큰 → 점수·일치 필드 또는 `null`. **토큰 전부가 세 필드 어디엔가 있어야** 일치다(AND). 점수: 제목 접두 > 제목 포함 > context 포함 > 본문 포함 | 두 필드를 가로지른 일치(`settings demo`) · 하나라도 없으면 null · 순위 표 |
| 1 | `match.ts` `searchGroups(index, q, { activeSlug })` | 세 그룹 색인(Projects·Menus·Docs) → 그룹별 상위 5개, 빈 그룹 제거, 그룹 순서 고정(Keys는 서버 결과를 Dialog가 제자리에 끼운다). 같은 점수면 **지금 프로젝트 먼저** → 원래 순서(안정 정렬). 빈 질의 → `[]` | 그룹당 상한 5 · 빈 그룹 없음 · activeSlug 가산 · 안정 정렬 |
| 1 | `match.ts` `previewGroups(index, { activeSlug })` | 빈 질의 미리보기(spec 4) — Projects 앞 3 + `View all projects` · Menus 앞 3(지금 프로젝트, 없으면 첫 프로젝트) · Docs 앞 3 + `Browse all docs` | 로그인·프로젝트 있음/0/비로그인 세 경우 · 보관 프로젝트는 뒤 · `View all`은 상한에 안 셈 |
| 2 | `highlight.ts` `highlightSegments(text, tokens)` | 원문 → `{ text, match }[]`, 겹치는 구간 합침 | ⚠️ **`İstanbul`처럼 소문자화로 길이가 바뀌는 글자에서 원문 경계가 어긋나지 않는다**(POSTMORTEM 2026-09-13 — 소문자화한 문자열의 위치로 원문을 자르지 않는다) · 겹침 합치기 · 토큰 없음 → 한 조각 |
| 2 | `highlight.ts` `snippet(body, tokens, width)` | 본문 → 첫 일치를 가운데 둔 한 줄(앞뒤 `…`), 일치 없으면 `null` | 앞·뒤 경계 · 서로게이트 쌍을 가르지 않는다 |
| 3 | `docs-index.ts` `docsSearchEntries(summary, pageOf)` | `NavNode[]` + `(file) => Root` → 절 단위 항목 `{ page, anchor, title, section, body }`. 페이지 도입부(첫 H2 전) 하나 + **표식 있는 H2**마다 하나(`headings()`의 `id`가 null인 H2는 건너뛴다 — 목차와 같은 규칙). 본문은 `toText` 평문, 코드 블록 포함, 이미지 alt 제외 | SUMMARY 순서 유지 · 서빙 안 되는 파일 없음(`pathToSlug` — `lib/guide/summary.ts`) · H3는 부모 H2 절에 합쳐짐 · 표식 없는 H2 스킵 |
| 5 | `nav-index.ts` `navSearchEntries(memberships: NavProject[] \| null, { activeSlug, userName })` | `NavProject[]` → Projects·Menus 항목. 프로젝트 메뉴는 **멤버십마다 기존 `navZones(project, …)`의 프로젝트 구역을 그대로** 쓴다 — 권한표(`projectSections`·`canPerform`)와 표면 주소 규칙이 한 벌이고 새 export가 0이다. 사용자 메뉴는 `navWorkItems()` + `New project`(헤더 버튼과 같은 `routes.*`), 하단은 `navFooterItems()` | OWNER만 `Settings` · 보관 프로젝트 포함 · `null`(비로그인) → 하단만 · 빈 배열(로그인·프로젝트 0) → 사용자 메뉴 + 하단 · href·라벨이 `navZones` 결과와 같다 |
| 5 | `lib/shell/nav.ts` `toNavProjects(rows)` | `MembershipRow[]`(`import type`) → `NavProject[]` — 레이아웃의 인라인 map(`app/(edit)/layout.tsx:75-78`)을 옮긴다(동작 불변) | 결과 키 집합이 **지금 레이아웃 map이 만드는 키 일곱**과 같다(`NavProject`의 선택 필드 `surfaceSlug`는 채우지 않는다 · 초과 필드 0) |
| 7 | `keys.ts` `isSearchShortcut(e, platform)` · `shouldIgnoreShortcut(target, doc)` · `nextActive(ids, activeId, delta)` · `reconcileActive(prevIds, nextIds, activeId, queryChanged)` | 단축키: macOS는 Meta, 그 밖은 Ctrl + `k`/`K`, Alt·Shift·반대편 수식키 없음, `isComposing`·`keyCode 229` 아님. 무시: 대상이 텍스트 입력·`textarea`·`contenteditable`이거나 문서에 열린 `[role="dialog"]`·`[role="menu"]`가 있음. 활성: id 기준 순환 · 질의가 바뀌면 첫 id · 결과만 늘면 id 유지 · id가 사라지면 첫 id | macOS Ctrl+K false · 조합 중 false · Shift+⌘K false · textarea 안 false · 열린 메뉴 false · ids 0 → null · 끝에서 순환 · 늦은 그룹 삽입 뒤 id 불변 |
| 8 | `lib/keys/search.ts` `keySearchQuery(q)` | 입력 → `{ pattern } \| null` — trim, 2자 미만이면 null, 200자(`Q_MAX_LENGTH`) 초과면 앞 200자, `likePattern` 적용 | 1자 → null · `50%_off`·`\` 이스케이프가 번역 화면과 같은 문자열 · 201자 → 200자 패턴 |
| 8 | `lib/keys/search.ts` `mergeKeyHits(first, second, activeSlug)` | ①·② 행 → 최종 5건. ① 먼저(키 일치 > 원문 일치), ② 뒤, 같은 급은 지금 프로젝트 → 키 이름 · **중복 제거는 키 id** | 순위 표 · ①이 5건이면 ② 무시 · 같은 이름의 다른 id 둘 다 남음 |
| 8 | `lib/search/key-href.ts` `keyResultHref(hit)` | 행 → `translationsHref(slug, surfaceSlug, { ...DEFAULT_TRANSLATION_QUERY, ns, key: id, keySurface })` — **`lib/translations/query.ts`의 export**(동명의 `lib/shell/nav.ts` 비공개 함수가 아니다) | `translationLinkFor`(`translation-list.ts:328`)가 :332에서 만드는 식과 같은 문자열 · 필터 키 없음 |

`lib/shell/nav.ts`의 비공개 `translationsHref(project)`는 **export하지 않는다** — `navZones`를 부르면 필요 없고, export하면 `lib/translations/query.ts`의 동명 export와 자동 import에서 섞인다.

### 껍데기

- `app/api/search-index/route.ts` — `force-static`, `loadSummary`·`loadPage`(기존, `lib/guide/load.ts`) → 3. 응답 `{ docs: DocsEntry[] }`.
- `lib/search/load-index.ts`("use client" 쪽 모듈 변수) — 첫 호출에 `fetch("/api/search-index")`, 같은 Promise를 탭 수명 동안 재사용. 실패(네트워크 · `!res.ok`)하면 Promise를 버려 다음 열기에 다시 시도한다.
- `lib/search/load-memberships.ts` — 같은 형으로 `loadSearchMembershipsAction()`을 탭 수명에 한 번. `{ ok: false }`면 버리고 비로그인 결과.

## UI — 프리미티브 먼저, 화면은 조립만

**원칙 (2026-10-01 사용자)**: 손 조립을 피하고 재사용 단위의 공통 컴포넌트를 쓴다. **없는 단위는 이번에 `components/ui/` 프리미티브로 만든다** — "일단 손으로 짜고 나중에 정리"는 그 자체가 부채다. 그래서 이 기능은 새 프리미티브를 먼저 세우고(tasks D), 같은 형을 이미 손으로 짠 **기존 사본도 같은 커밋 묶음에서 그 프리미티브로 옮긴다** — 새 프리미티브 옆에 옛 사본이 남으면 형이 두 벌이다.

**어휘는 component-unify 규약을 따른다** (그 design §3) — 슬롯 `icon` · `description` · `action` · `badge`(개수가 아닌 값). 비정본 슬롯 이름(`detail`·`subtitle`·`glyph`·`leading` 등)을 쓰지 않는다. **rest props는 실수요 자리만**(그 결정 S5) — 이 기능의 새 프리미티브에는 실수요가 없어 열지 않는다. 사본 스캔은 그 기능의 `components/__tests__/hand-copies.test.ts`(§5.1 — 표 주도 파일 하나)에 **행으로** 더한다 — 스캔 파일을 새로 만들지 않는다.

**시각 참고는 GitLab 검색 패널이다** (2026-10-01 사용자 참고 이미지) — 위에서 열리는 큰 패널, 입력 줄 + 전폭 구분선, 굵은 그룹 머리 + 그룹 사이 구분선, 한 줄 `제목 · 맥락` 행, 활성 행의 `Go to ↵` 힌트, 그룹 끝 `View all …` 행.

화면 파일(`components/search/*`)은 **raw 상호작용·표식 태그(`button`·`input`·`a`·`kbd`·`mark`)·hex 색·`[Npx]` 임의값을 갖지 않는다** — 프리미티브의 prop과 슬롯만 쓴다. `focus-ring.test.ts`가 이미 `ui/` 밖의 raw `<button>`·`<input>`을 0으로 막는다.

### 재사용하는 기존 단위

| 자리 | 단위 | 비고 |
|---|---|---|
| 결과 0건 | `NoMatch`(component-unify — `EmptyState` 위 `SearchX` 고정 형) | 제목 `No results for “{q}”`, 설명 한 문장, **출구 없음**(입력이 바로 위다). `NoMatch`는 출구(`href`·`onClick`)가 필수라 **출구 없는 형을 이 기능이 더한다** — 소비자가 함께 생기는 축이라 S5와 맞고, DESIGN "좁혀서 0건인 빈 상태의 출구" 규칙에 예외로 등재한다(D7) |
| 보관 프로젝트 표시 | `Badge` (스위처·`/projects` 행과 같은 `Archived`) | |
| 프로젝트 글리프 | `ProjectThumbnail` size 16 | 스위처와 같다 |
| `View all …` 글리프 | `lib/shell/nav.ts`의 같은 목적지 `NavItem.icon` — `navWorkItems()`의 Projects 항목 · `navFooterItems()`의 Docs 항목 | 같은 목적지 = 같은 글리프 |
| 입력 바탕 | `Input`(component-unify가 더한 글리프 슬롯) | `CommandInput`이 `Search` 글리프를 그 슬롯에 넣고 테두리를 끈다 — 글리프 배치를 새로 짜지 않는다 |
| Dialog 첫 포커스 | `components/ui/dialog.tsx`의 `[data-initial-focus]` 규칙 | `CommandInput`이 그 표식을 단다 — 새 `onOpenAutoFocus`·새 표식(`data-command-input`)을 만들지 않는다(`primitive-focus.test.tsx`가 손 `onOpenAutoFocus` 0을 강제한다) |
| Dialog 포커스 복귀 | `dialog.tsx`의 최근 포커스 기록(`returnTarget`) | 새 Content가 **같은 파일 안에서** 재사용한다 — 기록이 두 벌이면 복귀 대상이 갈린다 |
| 대형 모달 치수·면·dim | `LargeModal` 치수 상수(component-unify C2 — `event-dialog`와 공유하려 뗀 것) | **그 상수를 import한다** — 새 export를 만들지 않는다(2026-10-01 사용자 "대형 모달과 동일, 다른 건 top") |

### 새로 만드는 프리미티브 (`components/ui/`, DESIGN §6.4 등재)

| 단위 | 형 | 기존 사본 이관 |
|---|---|---|
| **`Kbd`** (`kbd.tsx`) | **`<kbd>` 태그**를 렌더하는 키 칩 — `shrink-0 rounded border px-1.5 py-0.5 text-xs` muted, `font-sans`(preflight가 `kbd`에 mono를 깐다 — DESIGN) | `project-switcher.tsx:119`의 손 `<kbd>` → `Kbd`(클래스가 같아 높이 불변 — `project-switcher.test.tsx:58`의 `[role="menu"] kbd` 셀렉터가 그대로 잡는다) |
| **`Highlight`** (`highlight.tsx`) | `{ text, match }[]`를 받아 일치 구간을 `<mark>`(DESIGN §6.2 `bg-blue-600/[0.14]` · `rounded-[3px]` · `px-px`)로 그린다 — 조각을 **만들지 않고 그리기만** 한다 | `components/projects/project-list.tsx:286-288`의 손 `<mark>` → `Highlight`(조각은 기존 `highlightName` — `lib/projects/list.ts:552` — 이 그대로 만든다). `visual-system.test.ts`의 `bg-blue-600/[0.14]` 등재 위치와 `projects-screen.test.ts`의 클래스 단언을 **의도적으로 옮긴다** |
| **`FieldButton`** (`field-button.tsx`) | **입력처럼 보이는 버튼** — 캡슐(`rounded-full`), 높이 36(`h-9`), 폭 320(`w-80`), 면은 콘텐츠 패널과 같다(`bg-background border border-border-subtle shadow-low` — 2026-10-01 사용자). 슬롯 `icon` · `placeholder`(muted) · `shortcut`(`Kbd`). hover 면 `bg-foreground/[0.03]` 겹침, 포커스 링은 여는 태그에 리터럴(§7). 폭은 파일이 소유하고 prop으로 열지 않는다 — 입력류가 아니고 소비자가 하나다(component-unify S5 — 그 design §3·§6.4도 이 판정으로 맞췄다). 두 번째 소비자가 생기면 그 폭 규약대로 연다 | 없음(첫 소비자) |
| **`CommandDialog`** (`dialog.tsx`에 추가 export) | 위에서 여는 대형 패널 — **폭·높이·면·dim은 대형 모달 상수**(`LargeModal` 치수 상수 — 지금 값 `w-[calc(100%-96px)] max-w-[1024px]` · 높이 `min(80svh,800px,calc(100svh-96px))`~`min(800px,calc(100svh-96px))` · `rounded-xl` · `shadow-medium` · `bg-foreground/32` + `backdrop-blur-[6px]`), **다른 것은 `top-4 left-1/2 -translate-x-1/2`(세로 가운데 아님)** · `Title` sr-only(prop `title` 필수) · 첫 포커스는 `[data-initial-focus]` 규칙 · 닫힘 복귀는 `DialogContent`와 같은 기록 · 머리·바닥·닫기 버튼 없음 | 없음. ⚠️ `DialogContent`는 **고치지 않는다**(소비자 14파일 — DESIGN의 세는 명령 `grep -rln "import .*DialogContent" components app \| grep -v __tests__ \| grep -v ui/dialog`) — 같은 파일의 형제 export라 복귀 로직을 공유한다 |
| **`Command*`** (`command.tsx`) | combobox + listbox 한 벌(WAI-ARIA 1.2). `Command`(활성 id·id 발급 context, ↑↓ = `nextActive`, Enter = **활성 option 안 링크의 `.click()`**, 조합 중 무시) · `CommandInput`(`Input` 글리프 슬롯에 `Search` 16 · 테두리 없음 · `role="combobox"` · `aria-activedescendant` · `data-initial-focus` · 아래 전폭 구분선) · `CommandStatus`(**listbox 밖**, 입력 아래 muted 한 줄들 — 로딩·부분 실패, `aria-live="polite"`) · `CommandList`(`role="listbox"` · 남은 높이 스크롤 · 활성 항목 `scrollIntoView({ block: "nearest" })`) · `CommandGroup`(`role="group"` + `aria-labelledby` 머리 — `text-xs font-medium` foreground, 그룹 사이 전폭 구분선) · `CommandItem`(`role="option"` · 슬롯 `icon`(선택) · `title` · `context`(같은 줄 ` · ` 뒤 muted 작은 글자) · `description`(둘째 줄, 한 줄 말줄임) · `badge` · `href`(필수 — 모든 결과가 목적지다) · 활성: `bg-accent` + 포커스 링과 같은 테두리 + 오른쪽 `Go to` `Kbd` `↵` · hover가 활성을 옮기되 포커스는 입력에 남는다 · 행에 `tabIndex` 없음) · sr-only 결과 수 공지(`{n} results`, 디바운스) | 없음. ⚠️ **스위처(`project-switcher.tsx`)는 옮기지 않는다** — 사용자가 2026-09-27에 `DropdownMenu` 재사용을 골랐고 형이 메뉴다(DESIGN §6.5 "알려진 접근성 한계(수용)"). 옮길지는 이 기능 뒤 사용자 판정이다 |
| **`HeaderBar`** (`components/shell/header-bar.tsx` — 셸 레이아웃이라 `ui/` 밖) | 헤더 3칸 — `grid h-10 grid-cols-[1fr_auto_1fr] items-center px-1`, 슬롯 `start` · `center` · `end`(각 `justify-self-start/center/end`). 좌우 폭이 달라도 가운데가 뷰포트 중앙이다. 두 셸 다 `min-w-[1280px]`라 좌우 묶음(앱 약 32/170, 공개 약 200/215)과 320 캡슐이 겹치지 않는다 | 앱 셸 `header.tsx`와 공개 셸 `public-shell/header.tsx`가 **둘 다** 이것을 쓴다 — 지금 두 파일이 각자 `flex`로 짠 바깥 줄을 걷는다(높이·padding은 그대로 40·4) |

- ⚠️ **`Command*`에 기능을 선반영하지 않는다** — 그룹 필터링·퍼지·가상화·다중 선택·`onSelect` 전용 항목은 넣지 않는다(CLAUDE.md "확장성을 위한 선반영은 결함"). 이 기능이 쓰는 슬롯만 연다.
- ⚠️ **새 의존성(cmdk 등)을 넣지 않는다** — 클라이언트 그래프 허용 목록(`client-graph.test.ts`)을 넓히고 스타일을 덮어써야 한다. Radix Dialog는 이미 있다.
- ⚠️ **Enter를 `router.push`로 만들지 않는다** — 번역 화면 이탈 가드(`use-leave-guard.ts`)는 document capture 단계의 `a[href]` 클릭만 가로채고, dim(`navigation-dim.tsx`)도 링크 클릭에서만 켜진다. 활성 option 안 `Link`의 `.click()`이면 마우스·키보드가 한 경로다(스위처 `project-switcher.tsx:62-65`와 같은 형). 가드가 막으면 `stopImmediatePropagation`으로 React `onClick`(Dialog 닫기)이 안 돌 수 있다 — **선택은 Dialog를 먼저 닫고 링크 클릭이 뒤따르는 순서**로 두어 두 Dialog가 겹치지 않게 하고(spec 6), 그 순서는 `/implement`가 가드와 함께 실측으로 고정한다(G1).
- `Kbd`의 플랫폼 문구(`⌘K`/`Ctrl K`)와 `aria-keyshortcuts`는 `FieldButton`이 모른다 — 화면(`SearchTrigger`)이 `useSyncExternalStore`(서버 스냅샷 `null` → 칩·속성 없음)로 골라 넘긴다. `FieldButton`은 `shortcut` 슬롯 자리 폭을 고정해 수화 뒤 문구가 밀리지 않게 한다.

### 화면 (`components/search/`, 조립만)

- `search-trigger.tsx` — `HeaderBar` 가운데 슬롯의 `FieldButton`(`Search` 글리프 · `Search…` · 단축키 칩) + 전역 단축키 리스너(`isSearchShortcut` · `shouldIgnoreShortcut`) + `CommandDialog` 열림 상태. 접근 이름 `Search`(말줄임 없음), `aria-haspopup="dialog"`, 플랫폼별 `aria-keyshortcuts`.
- `search-dialog.tsx` — `Command` 안에 `CommandInput` · `CommandStatus` · `CommandList` · 그룹 넷(`CommandGroup` — `Projects · Menus · Keys · Docs`) · 결과(`CommandItem` — 일치한 필드마다 `Highlight`: 제목·context·description) · 빈 질의의 미리보기(`previewGroups`, `View all …` 행) · 0건(`NoMatch` 출구 없는 형, 대기 중 조회가 없을 때만). Keys 번역값 줄은 로케일 코드와 값을 따로 렌더한다(문자열 조립 금지).
- **착지 규칙 (spec 13 · 13a)**:
  - 같은 가이드 페이지 해시 이동은 스크롤러가 재마운트되지 않아 스크롤·포커스가 일어나지 않는다(`public-doc-toc.tsx:90-106` · `scroller.tsx:36-43`). 목차 클릭과 **같은 함수**로 대상 제목 스크롤(48 오프셋) + 제목 포커스를 한다 — 목차가 가진 로직을 공유 헬퍼로 끌어내 둘이 부른다(두 벌 금지). Dialog 닫힘 복귀가 포커스를 트리거로 돌리면 제목 포커스를 덮으므로, 해시 착지에서는 복귀를 건너뛴다.
  - 같은 소스 번역 화면에서 Keys 결과를 고르면 쿼리만 바뀌어 재마운트가 없고, 스크롤은 마운트·트리 이동에만 돈다(`workspace.tsx:303-313`). **선택 키가 바뀌면 목록이 그 행으로 스크롤**하도록 그 effect의 조건에 선택 키 변경을 더한다 — 번역 화면 파일을 건드리는 유일한 변경이다.

### DESIGN·사전 갱신 대상

- §6.4 프리미티브 표에 `Kbd` · `Highlight` · `FieldButton` · `CommandDialog` · `Command*` 행(행마다 서수 라벨 — 총수 문장은 없다). §6.5 헤더 행에 `HeaderBar` 3칸 규칙 + 캡슐이 **헤더의 첫 면·테두리 요소**라는 예외(헤더는 "배경·border·그림자 0"). §6.5 스위처 행의 "새 combobox 프리미티브 없음" 판정 갱신. §6.8 헤더 행("로고와 사용자 메뉴 아바타뿐" — `New project` 때부터 낡음).
- §6.5 "GitLab top bar의 검색·`+`·카운터 셋은 넣지 않는다" → 검색은 들어왔고 카운터는 여전히 없다(판정 경위 한 줄). §9.2 같은 줄 → 카운터만 남긴다.
- §6.2 `bg-blue-600/[0.14]`의 자리 → `components/ui/highlight.tsx`. `NoMatch` 출구 없는 형(검색 Dialog) — 출구 규칙의 예외. `LargeModal` 행에 "`CommandDialog`가 치수 상수를 공유하고 top만 다르다".
- 아이콘 표: `Search`(트리거·입력). 활성 행 힌트의 `↵`는 글리프가 아니라 `Kbd` 안의 문자다.
- 문구는 `messages/en.tsx`의 `search` 절 하나 — 그룹 이름 `Menus`(2026-10-01 사용자 — `Pages`는 가이드 페이지와 헷갈린다).

## 스키마 변경

**기본은 없음.** 실측(tasks B3)이 spec 20 기준을 넘을 때만 **additive** — `pg_trgm` 확장 + GIN 인덱스 셋, **평범한 `CREATE INDEX`**(2026-10-01 사용자 — 이 규모에서 쓰기 잠금은 초 단위다). `CONCURRENTLY`를 쓰지 않는 이유: 파일 하나를 한 번에 보내면 암묵 트랜잭션 블록이 되어 거부되고, 격리 postgres 통합 테스트 30파일이 마이그레이션을 `pool.query(readFileSync(…))` 한 번으로 재생하므로 전 스위트가 red가 된다. 연산자 클래스는 Supabase가 `extensions` 스키마에 설치하므로 `extensions.gin_trgm_ops`로 한정할 수 있는지 `/db`가 확인하고, 인덱스가 `schema.prisma`에 표현되지 않으면 다음 `migrate dev`가 DROP을 만든다 — 표현(`@@index(..., type: Gin, ops: raw(...))`) 가능 여부를 먼저 확인한다. 컬럼·테이블 변경은 없고 인덱스라 2단계 배포가 필요 없다.

## 새 환경변수

**없음.**

## 불변식 영향

- **export 결정성 · blob SHA (ARCHITECTURE §1·§2)**: 닿지 않는다 — 리포·DB에 쓰지 않는다.
- **테넌트 경계 (ARCHITECTURE §6.1 · CLAUDE.md "모든 DB 쿼리는 projectId로 좁힌다")**: Keys 조회는 여러 프로젝트를 한 번에 본다 — `projectId = $1`이 아니라 **세션 `userId`로 확정한 멤버 id 배열**(`projectId = ANY(...)`)로 좁힌다. 보존 방법 —
  - 멤버 id 서브쿼리의 `userId`는 `readSession`이 준 값뿐이다. 입력으로 프로젝트를 받지 않는다.
  - 격리 postgres 통합 테스트가 **두 사용자 · 두 프로젝트**에서 서로의 키·번역값이 결과에 0건인지, 보관 프로젝트·보관 소스·첫 적재 전 소스·orphaned 키·orphaned 로케일 값이 0건인지 잰다. 성능 테스트가 비멤버 대형 테넌트를 훑지 않음을 `EXPLAIN`으로 잰다.
  - `entry-points.test.ts`의 `MEMBER_JOIN_CORES`가 코어 본문의 멤버십 조인을 상시로 센다(위 "Action 형").
  - `getProjectAccess`를 프로젝트마다 부르지 않는 이유: 읽기 권한 판정이 "멤버인가 + 보관 아닌가 + 준비됐나"이고(번역 읽기는 모든 역할이 갖는다) 그것을 조인이 표현한다. 역할별 차이가 생기면 이 조인이 그 판정의 둘째 벌이 된다 — 주석으로 `lib/auth/access.ts`를 가리킨다.
- **인증 경계 (§6 "인증 경계" 표)**: 새 인가 없는 진입점이 하나 생긴다(`/api/search-index`). 보존 방법 —
  - 응답은 **이미 공개인 것만** 싣는다: `/docs`가 서빙하는 페이지(SUMMARY 등재 — `pathToSlug`가 AUTHORING·SHOOTING·SUMMARY를 거른다). 세션·DB를 읽지 않는다(route 테스트가 `getPrisma`·`auth`를 던지는 mock으로 두고도 200인지 잰다 — 이름 세기가 아니라 호출 차단).
  - Projects·Menus 색인은 **이미 클라이언트에 있는 멤버십**(사이드바 prop)에서만 만든다 — `NavProject`의 좁힌 필드 그대로이고 필드를 넓히지 않는다(sec-audit 발견 23). Header에 같은 배열을 한 번 더 넘기므로 RSC 페이로드에 멤버십이 두 번 실린다 — 사용자당 행 수가 작아 받아들인다.
  - 결과 링크는 **목적지의 인가를 대신하지 않는다** — 권한이 없는 메뉴를 숨기는 것은 편의이고, 판정은 여전히 각 페이지의 `requireProjectAccess`다(`nav.ts` "노출은 편의이고 차단이 아니다").
- **개인정보**: 새 수집·새 브라우저 저장·새 전송처 없음. Keys 질의는 이미 보관 중인 데이터를 멤버에게 찾아 줄 뿐이고 기록하지 않는다. `/privacy`는 참으로 남는다.
- **분석**: 영향 없음 — Dialog는 페이지뷰가 아니고, 결과로 이동한 페이지뷰는 기존 허용 목록(`lib/seo/analytics.ts`)이 거르며 쿼리·해시는 이미 떼인다.

## POSTMORTEM 소환

| 회고 | 이 기능에서의 자리 |
|---|---|
| 2026-09-08 제출 버튼 없는 `<form>`의 Enter 무효 | 검색 입력을 `<form>`으로 감싸지 않는다 — Enter는 `onKeyDown`이 직접 받는다 |
| 2026-09-09 `asChild` 자식 옆 형제로 스위처가 셸을 죽였다 | 행을 `Link asChild`로 조립할 때 자식 하나만 — 배지·글리프·`Go to` 힌트는 Link **안**에 둔다 |
| 2026-09-13 소문자화 위치로 원문을 잘라 강조가 어긋났다 | `highlightSegments`가 원문 인덱스를 직접 찾는다 — 전용 테스트(`İ`) |
| 2026-09-13 세션 만료가 모달을 벗어나는 서버 redirect였다 | Action이 `requireUser`를 쓰지 않고 `readSession` union을 돌려준다 |
| 2026-09-13 🔁 늦은 응답 재사용 / Radix 이관의 실시간 지연 | Keys 응답은 요청 번호로 가르고 A→B→A를 잰다 · Dialog는 실제 타이머로 연 뒤 가짜 타이머 |
| 2026-09-14 · 09-18 방어선이 이름을 셌다 · 셋 다 지워도 green | 사본 스캔은 `hand-copies.test.ts` 행(그 파일이 카나리아·하한·뮤테이션을 든다), 그 밖 스캔·`MEMBER_JOIN_CORES`는 주석 제거 · 대상 수 > 0 · 심은 위반 탐지 · 뮤테이션 1회 |
| 2026-09-18 · 09-23 관계 필터 count 5.5초 / 다른 테넌트 12만 행 | 멤버 id를 먼저 확정 · 커밋된 성능 테스트가 통계 없음·비멤버 대형 테넌트를 잰다 |
| 2026-09-18 async transition 누수 | "늦은 응답" 테스트의 지연 Promise를 테스트 끝에서 푼다 |
| 2026-09-20 / 2026-09-24 포커스 복귀·초기 포커스가 브라우저에서만 깨졌다 | 초기 포커스는 기존 `data-initial-focus` 규칙, 닫힘 복귀는 트리거(해시 착지 제외) — jsdom 단언은 테스트 쪽 fixup observer 관용구(`members-focus.test.tsx`)를 쓰고 `/runtime-test`로 실측 |
| 스위처 "포인터가 항목을 지나도 포커스는 입력에" (DESIGN §6.5) | 이 Dialog는 포커스를 입력에 두고 `aria-activedescendant`로 활성 행을 가리키므로 같은 함정이 구조적으로 없다 — 행에 `tabIndex`를 주지 않는다 |
| 2026-09-06 "`userId`로 좁힌다" (레이아웃 멤버십 조회) | Keys 조회가 같은 축 — 멤버 id의 `userId`가 세션 값뿐인지 통합 테스트로 잰다 |
| 2026-09-10 "새 integration 디렉터리를 include에 안 더해 아무도 안 돌렸다" | 테스트를 기존 `lib/keys/__tests__/`에 둬서 include·트리거 추가가 없다 |
| 2026-09-13 강조 어긋남의 **남은 사본** | ⚠️ `lib/keys/translation-list.ts:232`의 `matchesFor`(:234-235)가 `toLowerCase()` 한 문자열의 `indexOf`를 원문 위치로 쓴다 — 같은 부류다. **이 기능은 그 함수를 쓰지 않고**(강조는 `highlightSegments`) 고치지도 않는다(외과적 변경) — 보고에서 언급만 한다 |

## 문서 갱신 (실제 갱신은 `/implement`·`/push`, spec 17)

- **PRODUCT** §4.1 "글로벌 검색" 항목 추가(Keys 범위: 보관·첫 적재 전 제외 · 트라이그램 판정) · IA 블록에 "검색은 라우트가 아니다(Dialog)" 한 줄 · `/api/search-index`는 IA 표 밖(API). §7.7은 **고치지 않는다**.
- **ARCHITECTURE** §6 "인증 경계" 표(`docs/ARCHITECTURE.md` 해당 표)에 `/api/search-index` — 공개 내용만, 세션 없음, `force-static`. Keys 조회의 멤버 id 조인(테넌트 경계). §1.96의 pg_trgm 기각과 이 기능의 측정값 관계 한 줄.
- **CLAUDE.md** "데이터 변경 경로" 표에 `/api/search-index` 행(호출자: 브라우저 검색 Dialog, 읽기 전용·공개·정적)과 읽기 전용 Action `searchKeysAction`·`loadSearchMembershipsAction` 행(`app/search/actions.ts`) → `pnpm sync:agents`.
- **DIRECTORY** `lib/search/` · `components/search/` · `app/api/search-index/` · `app/search/actions.ts` · `components/shell/header-bar.tsx` · 새 `ui/` 파일.
- **DESIGN** 위 "갱신 대상".
- **README** 기능 목록에 한 줄(사용자 노출 기능).
- **가이드** 영향 플래그 — `/guide`가 개요(`guide/README.md`) 또는 `translate/edit.md`에 검색 입구를 적을지 판정한다.
- **`/privacy`** 무수정 — 참으로 남는지 `/push` 4단계가 대조한다.
