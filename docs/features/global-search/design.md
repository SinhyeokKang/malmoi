# global-search — 설계

## 영향 받는 흐름

**편집 UI 셸 + 공개 셸의 헤더, 그리고 번역 데이터의 읽기 조회 하나다.** push·pull·export·DB 쓰기와 닿는 곳이 없다.

```
app/(edit)/layout.tsx ─ memberships(이미 조회) ─┬─ Sidebar (그대로)
                                               └─ Header ── SearchTrigger ── SearchDialog ("use client")
components/public-shell/header.tsx ─ account ───── SearchTrigger ── SearchDialog      │
                          (account ≠ null이면 첫 열기에 한 번) loadSearchMembershipsAction()
                                                                                     │ 첫 열기에 한 번
                                                                GET /api/search-index ┘
                                                                 └ docsSearchEntries(guide/**) + changelogSearchEntries(GitHub Releases)

SearchDialog (로그인이면) ── 250ms 디바운스 · 2자 이상 ── searchKeysAction(q)  [app/search-actions.ts]
                                                        └ requireUser → searchKeys(prisma, userId, q)  [lib/keys/search.ts]
                                                            ① 키 이름·원문 ILIKE (LIMIT 5)  ② 모자라면 번역값 ILIKE (LIMIT 나머지)
```

- **결과 집합은 세션으로 갈린다, 셸로 갈리지 않는다** (2026-10-01 사용자). 판정 입력은 "멤버십을 가졌나"(`NavProject[] | null`) 하나이고 `navSearchEntries`는 셸을 모른다.
- **Projects·Pages 색인은 클라이언트가 만든다** — 앱 셸은 레이아웃이 이미 받은 멤버십(`NavProject[]`)을 Header에도 넘긴다(**새 DB 조회 0**). 공개 셸은 페이지가 이미 판정한 `account`만 안다 — `account ≠ null`이면 Dialog를 **처음 열 때 한 번** `loadSearchMembershipsAction()`(읽기 전용 Action — `requireUser` → `loadMemberships(userId)` → `toNavProjects`)으로 받는다. 공개 페이지 렌더에 조회를 얹지 않는 이유: 랜딩·가이드 방문은 대부분 검색을 안 연다. 받는 동안 Projects·Pages·Keys 자리에 로딩 한 줄, 세션이 그새 사라졌으면(`requireUser` 실패) 비로그인 결과로 떨어진다.
- ⚠️ **`toNavProjects`(레이아웃의 `memberships.map(...)`을 옮긴 순수 함수, `lib/shell/nav.ts`)를 두 자리가 함께 쓴다** — 레이아웃과 Action이 각자 좁히면 한쪽에만 필드가 늘어 sec-audit 발견 23(`installationId`·`lastCommitSha`가 RSC에 실렸다)이 재발한다.
- **Action 파일은 `app/search-actions.ts`다**(`(edit)` 밖) — 공개 셸 페이지도 부르므로 편집 셸 그룹에 두면 경로가 거짓을 말한다.
- **Docs·Changelog 색인은 공개 GET 하나다** — `app/api/search-index/route.ts`. 질의를 받지 않고 **모두에게 같은 JSON**을 준다.
- **Keys는 질의마다 서버가 찾는다** — 읽기 전용 Server Action `searchKeysAction`(Publish·Revert 미리보기와 같은 부류: `revalidatePath`를 부르지 않는다). 색인을 클라이언트로 내리지 않는 이유는 행 수(프로젝트당 최대 200,000셀)와 인가다 — 값은 멤버에게만 보여야 하고, 서버가 세션으로 좁히는 것이 경계의 전부다.

### Keys 조회 (`lib/keys/search.ts`)

`lib/keys/`에 두는 이유: `pnpm gate`가 이 디렉터리를 격리 postgres 트리거로 이미 잡고(`scripts/gate-plan.ts`), 통합 테스트 디렉터리(`lib/keys/__tests__/*.integration.ts`)가 `vitest.projects.config.ts` include에 이미 있다 — 새 트리거·include를 늘리지 않는다.

```sql
-- ① 키 이름·원문 (상한 5)
SELECT k.id, k.key, k.namespace, k."sourceText", s.slug AS "surfaceSlug", s.name AS "surfaceName", p.slug, p.name,
       (k.key ILIKE $pattern) AS "inKey"
FROM "StringKey" k
JOIN "ProjectMember" pm ON pm."projectId" = k."projectId" AND pm."userId" = $userId
JOIN "Project" p ON p.id = k."projectId" AND p."archivedAt" IS NULL
JOIN "TranslationSurface" s ON s."projectId" = k."projectId" AND s.id = k."surfaceId" AND s."archivedAt" IS NULL
WHERE k.orphaned = false AND (k.key ILIKE $pattern OR k."sourceText" ILIKE $pattern)
ORDER BY "inKey" DESC, (p.slug = $activeSlug) DESC, k.key
LIMIT 5;

-- ② ①이 n<5건일 때만: 번역값 (상한 5-n, ①의 키 제외) — 키마다 첫 일치 로케일 하나(로케일 코드 오름차순)
SELECT DISTINCT ON (k.id) k.id, …, t."localeCode", t.value
FROM "Translation" t JOIN "StringKey" k ON k."projectId" = t."projectId" AND k.id = t."keyId"
JOIN … (① 과 같은 멤버십·보관 조인)
WHERE t.value ILIKE $pattern AND k.orphaned = false AND k.id <> ALL($excluded)
ORDER BY k.id, t."localeCode"  -- 바깥에서 (지금 프로젝트, 키 이름) 순으로 다시 정렬 후 LIMIT
```

- ⚠️ **멤버십은 조인으로 좁힌다 — 클라이언트가 보낸 slug 목록을 받지 않는다.** Action 입력은 `q`와 `activeSlug`(순위용 — 좁히기에 쓰지 않는다) 둘뿐이다. `activeSlug`는 남이 정한 문자열이라 `=` 비교에만 쓰고 조회 조건에 쓰지 않는다.
- ⚠️ **`likePattern`은 `lib/keys/translation-list.ts`의 것을 export해서 쓴다** — `%`·`_`·`\` 이스케이프 규칙이 두 벌이면 한쪽이 `_`를 와일드카드로 흘린다. 판정이 번역 화면 `?q=`와 같아야 결과를 눌러 간 화면에서 같은 키가 선다.
- ② 의 `DISTINCT ON`과 바깥 정렬은 SQL 한 문장(서브쿼리)으로 끝낸다 — 왕복은 ①·② 둘이 상한이다(spec 18).
- `requireUser` 실패·DB 오류는 Action이 `{ ok: false }`를 돌려준다(던지지 않는다 — Dialog가 Keys 한 줄로 보인다). 입력 검증은 Zod가 아니라 길이 판정 하나다(`q`는 trim 뒤 2~200자, 밖이면 빈 결과 — 긴 패턴으로 스캔을 비싸게 만드는 것을 막는다).

### 성능 판단 (2026-10-01, 실측 전)

- 지금 가장 큰 프로젝트가 약 1,146행이다 — `ILIKE '%q%'`는 앞 와일드카드라 btree를 못 타고 **멤버십 안 프로젝트의 행을 순차로** 거르지만, 이 규모에서는 ms다. 비싼 것은 쿼리가 아니라 왕복(`hnd1`에서 수십 ms)이다 — PRODUCT §7.7 결정 5가 같은 결론을 냈다.
- 최악은 push 행 상한(프로젝트당 번역 200,000행)이다. 순차 `ILIKE` 추정 100~300ms/프로젝트(**추정 — 실측 아님**), 멤버십이 여럿이면 합산된다. ②를 조건부로 둔 이유가 이것이다 — 키·원문에서 5건이 차면 번역값을 훑지 않는다.
- **트라이그램 인덱스는 재기 전에 넣지 않는다**(결정 5 "재기 전에 스키마를 늘리는 것은 순서가 거꾸로다"). 실측(tasks C3)이 spec 20 기준을 넘으면 `CREATE EXTENSION IF NOT EXISTS pg_trgm` + GIN(`gin_trgm_ops`) 셋을 additive로 넣는다 — ⚠️ Supabase에서 `pg_trgm`은 `extensions` 스키마에 설치되고, `public` USAGE 회수(ARCHITECTURE §7)와 무관하지만 연산자 클래스 이름을 스키마로 한정해야 할 수 있다 — 그때 `/db`가 확인한다.
- 측정값: _(C3에서 채운다)_

### 왜 Route Handler인가 (Server Action이 아니라)

CLAUDE.md는 "내부 **쓰기**는 Server Action"이고 읽기 전용 Action 선례(Publish 미리보기·Revert 미리보기)도 있다. 여기서 Action을 쓰지 않는 이유는 셋이다:

1. **Action은 호출한 페이지의 함수에서 돈다** — 가이드 원고는 `fs`로 읽고 트레이서가 못 따라가서 `next.config.ts`의 `outputFileTracingIncludes`가 라우트별로 `guide/**/*.md`를 싣는다. Action이면 **검색 트리거가 서는 모든 라우트**(앱 셸 전부 + 공개 셸)에 그 include를 걸어야 한다. Route Handler면 키 하나다.
2. **내용이 사용자와 무관하다** — 세션·권한을 안 보므로 `revalidate`로 정적 생성해 CDN이 든다. Action은 POST라 매 첫 열기마다 함수가 돈다.
3. **`/llms-full.txt`가 같은 부류의 선례다** — 가이드 원고를 읽는 공개 GET(`force-static`).

`export const revalidate = 3600` — 빌드 때 만들고 1시간마다 다시 만든다. 가이드는 배포마다 바뀌므로 빌드 생성으로 충분하고, 릴리스 노트가 1시간 주기를 요구한다(`/changelog`와 같은 주기).

- ⚠️ **`/api/*`라 미들웨어 matcher 밖이고**(CSP 대상이 아니다 — 문서가 아니다) **`robots.txt`가 이미 거부한다**. `isProtectedPath`에 넣지 않는다(공개 셸이 비로그인으로 부른다).
- ⚠️ **`app/__tests__/entry-points.test.ts`의 EXEMPT 목록에 사유와 함께 더한다** — 인가 없는 route라는 사실을 그 목록이 소유한다. 가드가 "없음"이 정답인 route이므로 `exempt-route-guards.test.ts`에는 더하지 않고 그 이유를 EXEMPT 주석에 적는다.
- ⚠️ **대가**: 릴리스를 못 받은 응답(`changelog: null`)도 재생성 주기 동안 캐시된다 — `/changelog`의 "200인데 형이 어긋난 응답은 1시간 캐시"(spec 조건 6)와 같은 부류로 받아들인다. 최악 지연은 fetch 캐시 1시간 + 라우트 1시간 = 2시간이다. `/merge` 직후 새 판이 검색에 늦게 서는 것은 `/changelog` 비목표("`/merge` 직후 즉시 반영")와 같다.
- `loadReleases`는 던지지 않고 `{ ok: false }`를 준다 — 그대로 `changelog: null`로 싣는다. 가이드 읽기 실패(`loadSummary`가 던짐)는 500이다: 반쯤 맞는 색인을 내지 않는다(`lib/guide/load.ts`의 "빈 내비로 삼키지 않는다"와 같은 이유). 클라이언트는 실패 응답을 Docs·Changelog 두 그룹의 안내 한 줄로 보인다.

## 순수 함수로 분리 가능한 부분 — `/tdd` 대상

전부 `lib/search/`에 둔다. **클라이언트가 읽는 모듈**(1·2·5·6·7)은 `components/__tests__/client-graph.test.ts`의 허용 목록 안에 있어야 한다 — `lib/guide/load.ts`(server-only)·`lib/projects/list.ts`(온보딩 판정까지 끌고 온다 — 스위처가 import를 피한 이유)를 import하지 않는다.

| # | 파일 · 함수 | 입력 → 출력 | 핵심 테스트 |
|---|---|---|---|
| 1 | `match.ts` `searchTokens(q)` | 질의 → trim · 소문자 · 공백 분할 · 빈 토큰 제거 · 중복 제거 | `"  Demo  settings "` → `["demo","settings"]` · 빈 문자열 → `[]` |
| 1 | `match.ts` `scoreEntry(entry, tokens)` | 항목 `{ title, context?, body? }` + 토큰 → 점수 또는 `null`. **토큰 전부가 세 필드 어디엔가 있어야** 일치다(AND). 점수: 제목 접두 > 제목 포함 > context 포함 > 본문 포함 | 두 필드를 가로지른 일치(`settings demo`) · 하나라도 없으면 null · 순위 표 |
| 1 | `match.ts` `searchGroups(index, q, { activeSlug })` | 네 그룹 색인 → 그룹별 상위 5개, 빈 그룹 제거, 그룹 순서 고정. 같은 점수면 **지금 프로젝트 먼저** → 원래 순서(안정 정렬). 빈 질의 → 빈 배열(최근 검색어는 Dialog가 그린다) | 그룹당 상한 5 · 빈 그룹 없음 · activeSlug 가산 · 안정 정렬 |
| 2 | `highlight.ts` `highlightSegments(text, tokens)` | 원문 → `{ text, match }[]`, 겹치는 구간 합침 | ⚠️ **`İstanbul`처럼 소문자화로 길이가 바뀌는 글자에서 원문 경계가 어긋나지 않는다**(POSTMORTEM 2026-09-13 — 소문자화한 문자열의 위치로 원문을 자르지 않는다) · 겹침 합치기 · 토큰 없음 → 한 조각 |
| 2 | `highlight.ts` `snippet(body, tokens, width)` | 본문 → 첫 일치를 가운데 둔 한 줄(앞뒤 `…`), 일치 없으면 `null` | 앞·뒤 경계 · 서로게이트 쌍을 가르지 않는다 |
| 3 | `docs-index.ts` `docsSearchEntries(summary, pageOf)` | `NavNode[]` + `(file) => Root` → 절 단위 항목 `{ page, anchor, title, section, body }`. 페이지 도입부(첫 H2 전) 하나 + **표식 있는 H2**마다 하나(`headings()`의 `id`가 null인 H2는 건너뛴다 — 목차와 같은 규칙). 본문은 `toText` 평문, 코드 블록 포함, 이미지 alt 제외 | SUMMARY 순서 유지 · 서빙 안 되는 파일 없음 · H3는 부모 H2 절에 합쳐짐 · 표식 없는 H2 스킵 |
| 4 | `changelog-index.ts` `changelogSearchEntries(releases)` | `Release[]` → `{ tag, publishedAt, lines }` — 본문 md를 줄 단위 평문으로(목록 표식·링크 문법 제거), `Full Changelog` 줄 제거(`dropFullChangelog`와 같은 판정) | 태그 순서 유지 · 빈 본문 · 링크 텍스트만 남음 |
| 5 | `nav-index.ts` `navSearchEntries(memberships: NavProject[] \| null, { activeSlug })` | `NavProject[]` → Projects·Pages 항목. 프로젝트 메뉴는 **`projectSections(role)`를 그대로** 쓴다(권한표 한 벌 — `canPerform`), Translations는 `nav.ts`의 표면 주소 규칙을 쓴다. 사용자 메뉴는 `navWorkItems()` + `New project`, 하단은 `navFooterItems()` | OWNER만 `Project settings` · 보관 프로젝트 포함 · `null`(비로그인) → 하단만 · 빈 배열(로그인·프로젝트 0) → 사용자 메뉴 + 하단 · href가 `routes.*` 생성기 값과 같다 |
| 5 | `lib/shell/nav.ts` `toNavProjects(rows)` | `MembershipRow[]` → `NavProject[]` — 레이아웃의 인라인 map을 옮긴다(동작 불변) | 결과 키 집합이 `NavProject` 필드와 정확히 같다(초과 필드 0) |
| 6 | `recent.ts` `parseRecent(raw)` · `pushRecent(list, q)` · `removeRecent(list, q)` | 저장 문자열 → 문자열 배열(형이 틀리면 `[]`, 문자열 아닌 원소 제거, 원소 최대 100자, 최대 5개). push: trim · 빈 값 무시 · 대소문자 무시 중복 제거 · 맨 앞 · 5개 상한 | 망가진 JSON · `{}`·숫자 배열 · 6번째 밀어내기 · 대소문자 중복 |
| 8 | `lib/keys/search.ts` `keySearchQuery(q)` | 입력 → `{ pattern } \| null` — trim, 2자 미만·200자 초과면 null, `likePattern` 적용 | 1자 → null · `50%_off` 이스케이프 · 201자 → null |
| 8 | `lib/keys/search.ts` `mergeKeyHits(first, second, activeSlug)` | ①·② 행 → 최종 5건. ① 먼저(키 일치 > 원문 일치), ② 뒤, 같은 급은 지금 프로젝트 → 키 이름 · 중복 키 제거 | 순위 표 · ①이 5건이면 ② 무시 · 중복 제거 |
| 8 | `lib/search/key-href.ts` `keyResultHref(hit)` | 행 → `translationsHref(slug, surfaceSlug, { ...DEFAULT_TRANSLATION_QUERY, ns, key: id, keySurface })` | Logs `translationLinkFor`와 같은 주소 모양 · 필터 키 없음 |
| 7 | `keys.ts` `isSearchShortcut(e)` · `nextActive(index, delta, count)` | 키 이벤트 형 → 단축키인가(⌘ 또는 Ctrl + `k`/`K`, Alt·Shift 없음, `isComposing`·`keyCode 229` 아님). 활성 인덱스 순환 | 조합 중 false · Shift+⌘K false · count 0 → -1 · 끝에서 순환 |

`nav.ts`의 비공개 `translationsHref`는 **export만 한다**(동작 불변) — 5가 Translations 주소를 두 번째로 조립하면 사이드바와 검색이 다른 표면으로 간다.

### 껍데기

- `app/api/search-index/route.ts` — `loadSummary`·`loadPage`(기존) → 3, `loadReleases`(기존) → 4. 응답 `{ docs: DocsEntry[]; changelog: ChangelogEntry[] | null }`. 트레이싱 키 추가: `outputFileTracingIncludes["/api/search-index"] = ["./guide/**/*.md"]`.
- `lib/search/load-index.ts`("use client" 쪽 모듈 변수) — 첫 호출에 `fetch("/api/search-index")`, 같은 Promise를 탭 수명 동안 재사용. 실패하면 Promise를 버려 다음 열기에 다시 시도한다.
- `lib/search/recent-store.ts` — `localStorage` 읽기·쓰기를 **try/catch로 감싼** 얇은 껍데기(6을 부른다). 키 `malmoi.search.recent`. 저장소가 막히면 읽기 `[]`, 쓰기 무시.

## UI — 프리미티브 먼저, 화면은 조립만

**원칙 (2026-10-01 사용자)**: 손 조립을 피하고 재사용 단위의 공통 컴포넌트를 쓴다. **없는 단위는 이번에 `components/ui/` 프리미티브로 만든다** — "일단 손으로 짜고 나중에 정리"는 그 자체가 부채다. 그래서 이 기능은 새 프리미티브를 먼저 세우고(tasks D), 같은 형을 이미 손으로 짠 **기존 사본도 같은 커밋 묶음에서 그 프리미티브로 옮긴다** — 새 프리미티브 옆에 옛 사본이 남으면 형이 두 벌이다.

화면 파일(`components/search/*`)은 **raw 태그·색·치수 리터럴을 갖지 않는다** — 프리미티브의 prop과 슬롯만 쓴다. `focus-ring.test.ts`가 이미 `ui/` 밖의 raw `<button>`·`<input>`을 0으로 막는다.

### 재사용하는 기존 단위

| 자리 | 단위 | 비고 |
|---|---|---|
| 결과 0건 | `EmptyState`(`SearchX` — DESIGN "필터·검색 0건") | 제목 `No results for “{q}”`, 설명 한 문장, **액션 없음**(입력이 바로 위다) |
| 보관 프로젝트 표시 | `Badge` (스위처·`/projects` 행과 같은 `Archived`) | |
| 프로젝트 글리프 | `ProjectThumbnail` size 16 | 스위처와 같다 |
| 메뉴 글리프 | `lib/shell/nav.ts`의 `NavItem.icon` 그대로 | 같은 목적지 = 같은 글리프 |
| 입력 바탕 | `Input` | 새 프리미티브 `CommandInput`이 감싼다 |
| Dialog 포커스 복귀 | `components/ui/dialog.tsx`의 최근 포커스 기록(`returnTarget`) | 새 Content가 **같은 파일 안에서** 재사용한다 — 기록이 두 벌이면 복귀 대상이 갈린다 |

### 새로 만드는 프리미티브 (`components/ui/`, DESIGN §6.4 등재 · 프리미티브 수 갱신)

| 단위 | 형 | 기존 사본 이관 |
|---|---|---|
| **`Kbd`** (`kbd.tsx`) | 키 칩 — `rounded border px-1.5 text-xs` muted, `font-sans` | `project-switcher.tsx:119`의 손 `<kbd>` → `Kbd` |
| **`Highlight`** (`highlight.tsx`) | `{ text, match }[]`를 받아 일치 구간을 `<mark>`(DESIGN §6.2 `blue-600/[0.14]` · `rounded-[3px]` · `px-px`)로 그린다 — 조각을 **만들지 않고 그리기만** 한다 | `project-list.tsx:286-291`의 손 `<mark>` → `Highlight`(조각은 기존 `highlightName`이 그대로 만든다) |
| **`FieldButton`** (`field-button.tsx`) | **입력처럼 보이는 버튼** — 캡슐(`rounded-full`), 높이 32, 슬롯 `icon` · `placeholder`(muted) · `shortcut`(`Kbd`). hover 면 `bg-foreground/[0.03]`, 포커스 링은 여는 태그에 리터럴(§7). 폭은 **파일이 소유**하고 prop으로 열지 않는다(`w-80` — `SearchInput`이 폭을 소유하는 이유와 같다) | 없음(첫 소비자) |
| **`CommandDialog`** (`dialog.tsx`에 추가 export) | 위에서 시작하는 Dialog — 폭 640 · top 12vh · `rounded-lg` · `shadow-medium` · overlay `bg-foreground/40` · `Title` sr-only(prop `title` 필수) · 초기 포커스를 `[data-command-input]`으로(`onOpenAutoFocus` — POSTMORTEM 2026-09-24) · 닫힘 복귀는 `DialogContent`와 같은 기록 | 없음. ⚠️ `DialogContent`는 **고치지 않는다**(소비자 열둘) — 같은 파일의 형제 export라 Overlay·복귀 로직을 공유한다 |
| **`Command*`** (`command.tsx`) | combobox + listbox 한 벌(WAI-ARIA 1.2). `Command`(활성 인덱스·id 발급 context, ↑↓ 순환 = `nextActive`, Enter = 활성 항목의 `onSelect`, 조합 중 무시) · `CommandInput`(`Search` 글리프 16 · 테두리 없는 `Input` · 오른쪽 `Kbd` `Esc` · `role="combobox"` · `aria-activedescendant`) · `CommandList`(`role="listbox"` · 최대 높이 420 스크롤 · 활성 항목 `scrollIntoView({ block: "nearest" })`) · `CommandGroup`(`role="group"` + 제목 `text-xs` muted · 선택 슬롯 `action` — 그룹 머리 오른쪽 ghost `Button` sm) · `CommandItem`(`role="option"` · 슬롯 `icon` · `title` · `context` · `detail`(한 줄 말줄임) · `badge` · `href`면 `Link`, 아니면 `onSelect`만 · 활성 `bg-accent` · hover가 활성을 옮기되 포커스는 입력에 남는다 · 행에 `tabIndex` 없음) · `CommandStatus`(muted 한 줄 — 안내·로딩·부분 실패, `aria-live="polite"`) | 없음. ⚠️ **스위처(`project-switcher.tsx`)는 옮기지 않는다** — 사용자가 2026-09-27에 `DropdownMenu` 재사용을 골랐고 형이 메뉴다(DESIGN §6.5 "알려진 접근성 한계(수용)"). 옮길지는 이 기능 뒤 사용자 판정이다 |
| **`HeaderBar`** (`components/shell/header-bar.tsx` — 셸 레이아웃이라 `ui/` 밖) | 헤더 3칸 — `grid h-10 grid-cols-[1fr_auto_1fr] items-center px-1`, 슬롯 `start` · `center` · `end`(각 `justify-self-start/center/end`). 좌우 폭이 달라도 가운데가 뷰포트 중앙이다 | 앱 셸 `header.tsx`와 공개 셸 `public-shell/header.tsx`가 **둘 다** 이것을 쓴다 — 지금 두 파일이 각자 `flex`로 짠 바깥 줄을 걷는다(높이·padding은 그대로 40·4) |

- ⚠️ **`Command*`에 기능을 선반영하지 않는다** — 그룹 필터링·퍼지·가상화·다중 선택은 넣지 않는다(CLAUDE.md "확장성을 위한 선반영은 결함"). 이 기능이 쓰는 슬롯만 연다.
- ⚠️ **새 의존성(cmdk 등)을 넣지 않는다** — 클라이언트 그래프 허용 목록(`client-graph.test.ts`)을 넓히고 스타일을 덮어써야 한다. Radix Dialog는 이미 있다.
- `Kbd`의 플랫폼 문구(`⌘K`/`Ctrl K`)는 `FieldButton`이 모른다 — 화면(`SearchTrigger`)이 `useSyncExternalStore`(서버 스냅샷 `null` → 칩 없음)로 골라 `shortcut` 슬롯에 넘긴다. `FieldButton`은 슬롯 자리 폭을 고정해 수화 뒤 문구가 밀리지 않게 한다.

### 화면 (`components/search/`, 조립만)

- `search-trigger.tsx` — `FieldButton`(`Search` 글리프 · `Search…` · 단축키 칩) + 전역 단축키 리스너(`isSearchShortcut`, ⚠️ 이미 열린 `[role="dialog"]`가 있으면 무시 — 포커스 트랩이 둘이 된다) + `CommandDialog` 열림 상태. 접근 이름 `Search`(말줄임 없음), `aria-haspopup="dialog"`, `aria-keyshortcuts="Meta+K Control+K"`.
- `search-dialog.tsx` — `Command` 안에 `CommandInput` · `CommandList` · 그룹 다섯(`CommandGroup`) · 결과(`CommandItem` — `title`은 `Highlight`) · 빈 질의의 최근 검색어(`CommandGroup action`=`Clear`, 항목 글리프 `History`) · 로딩/실패/안내(`CommandStatus`) · 0건(`EmptyState`).
- 결과 선택: `CommandItem`의 `href` 클릭은 `Link`라 navigation-dim이 켜진다(DESIGN §6.4 — window bubble). Enter는 `Command`가 `router.push`를 부르고 Dialog를 먼저 닫는다(`router.push` 경로는 dim을 켜지 않는다는 기존 규칙 그대로). 두 경로 모두 최근 검색어를 저장한다.
- 같은 페이지 해시 이동(`/docs/x` → `/docs/x#y`)은 공개 셸 스크롤러 안 착지를 `/runtime-test`로 확인한다(`public-doc-toc.tsx`가 목차 클릭을 가로채는 이유가 그 스크롤러다).

### DESIGN·사전 갱신 대상

- §6.4 프리미티브 표에 `Kbd` · `Highlight` · `FieldButton` · `CommandDialog` · `Command*` 행, 프리미티브 수 갱신. §6.5 헤더 행에 `HeaderBar` 3칸 규칙.
- §6.5 "GitLab top bar의 검색·`+`·카운터 셋은 넣지 않는다" → 검색은 들어왔고 카운터는 여전히 없다(판정 경위 한 줄). §9.2 같은 줄 → 카운터만 남긴다.
- 아이콘 표: `Search`(트리거·입력) · `History`(최근 검색어).
- 문구는 `messages/en.tsx`의 `search` 절 하나.

## 스키마 변경

**기본은 없음.** 실측(tasks C3)이 spec 20 기준을 넘을 때만 **additive** — `pg_trgm` 확장 + GIN 인덱스 셋. 컬럼·테이블 변경은 없고, 인덱스라 2단계 배포가 필요 없다. ⚠️ 200,000행 테이블에 `CREATE INDEX`는 쓰기를 잠그므로 `CONCURRENTLY`를 쓰고, 그러면 마이그레이션이 트랜잭션 밖이어야 한다 — Prisma 마이그레이션 SQL 파일에 `BEGIN`을 두지 않는 형으로 `/db`가 쓴다.

## 새 환경변수

**없음.** 릴리스는 기존 `GITHUB_RELEASES_API_URL`(토큰 없음)을 그대로 부른다.

## 불변식 영향

- **export 결정성 · blob SHA (ARCHITECTURE §1·§2)**: 닿지 않는다 — 리포·DB에 쓰지 않는다.
- **테넌트 경계 (ARCHITECTURE §6.1 · CLAUDE.md "모든 DB 쿼리는 projectId로 좁힌다")**: Keys 조회는 여러 프로젝트를 한 번에 본다 — `projectId = $1`이 아니라 **`ProjectMember` 조인**으로 좁힌다. 보존 방법 —
  - 조인 조건이 `pm."userId" = 세션 userId`이고 그 값은 `requireUser`가 준 것뿐이다. 입력으로 프로젝트를 받지 않는다.
  - 격리 postgres 통합 테스트가 **두 사용자 · 두 프로젝트**에서 서로의 키·번역값이 결과에 0건인지, 보관 프로젝트·보관 소스·orphaned 키가 0건인지 잰다.
  - `getProjectAccess`를 프로젝트마다 부르지 않는 이유: 읽기 권한 판정이 "멤버인가 + 보관 아닌가"이고(번역 읽기는 모든 역할이 갖는다) 그것을 조인이 그대로 표현한다. 역할별 차이가 생기면(예: 읽기 권한이 좁아지면) 이 조인이 그 판정의 둘째 벌이 된다 — 주석으로 `lib/auth/access.ts`를 가리킨다.
- **인증 경계 (§6)**: 새 인가 없는 진입점이 하나 생긴다(`/api/search-index`). 보존 방법 —
  - 응답은 **이미 공개인 것만** 싣는다: `/docs`가 서빙하는 페이지(SUMMARY 등재 — `pathToSlug`가 AUTHORING·SHOOTING·SUMMARY를 거른다)와 `/changelog`가 보이는 판(`parseReleases`가 앱 태그만 거른다). 세션·DB를 읽지 않는다.
  - Projects·Pages 색인은 **이미 클라이언트에 있는 멤버십**(사이드바 prop)에서만 만든다 — `NavProject`의 좁힌 필드 그대로이고 필드를 넓히지 않는다(sec-audit 발견 23: 레이아웃이 넘기는 prop은 필요한 것만). Header에 같은 배열을 한 번 더 넘기므로 RSC 페이로드에 멤버십이 두 번 실린다 — 사용자당 행 수가 작아(프로젝트 3 + 멤버십) 받아들인다. 한 번만 싣고 싶으면 두 컴포넌트의 공통 클라이언트 부모로 올리는 방법이 있으나 셸 구조를 바꾸므로 이번엔 하지 않는다.
  - 결과 링크는 **목적지의 인가를 대신하지 않는다** — 권한이 없는 메뉴를 숨기는 것은 편의이고, 판정은 여전히 각 페이지의 `requireProjectAccess`다(`nav.ts` "노출은 편의이고 차단이 아니다").
- **개인정보**: 새 수집 없음(서버로 가는 것 없음). 브라우저 저장소에 최근 검색어가 남는다 — `/privacy` 공표 대상(아래). 같은 브라우저를 쓰는 다른 계정이 그 목록을 본다 — 로그아웃이 지우지 않는다(`signOutAction`은 서버 Action이고, 클라이언트 삭제를 끼우면 로그아웃 경로가 두 벌이 된다). **2026-10-01 사용자 수용.**
- **분석**: 영향 없음 — Dialog는 페이지뷰가 아니고, 결과로 이동한 페이지뷰는 기존 허용 목록(`lib/seo/analytics.ts`)이 거르며 해시는 이미 떼인다.

## POSTMORTEM 소환

| 회고 | 이 기능에서의 자리 |
|---|---|
| 2026-09-08 제출 버튼 없는 `<form>`의 Enter 무효 | 검색 입력을 `<form>`으로 감싸지 않는다 — Enter는 `onKeyDown`이 직접 받는다 |
| 2026-09-09 `asChild` 자식 옆 형제로 스위처가 셸을 죽였다 | 행을 `Link asChild`로 조립할 때 자식 하나만 — 배지·글리프는 Link **안**에 둔다 |
| 2026-09-13 소문자화 위치로 원문을 잘라 강조가 어긋났다 | `highlightSegments`가 원문 인덱스를 직접 찾는다 — 전용 테스트(`İ`) |
| 2026-09-20 / 2026-09-24 포커스 복귀·초기 포커스가 브라우저에서만 깨졌다 | 초기 포커스는 `onOpenAutoFocus`, 닫힘 복귀는 트리거 — jsdom 단언은 fixup observer를 달고 `/runtime-test`로 실측 |
| 스위처 "포인터가 항목을 지나도 포커스는 입력에" (DESIGN §6.5) | 이 Dialog는 포커스를 입력에 두고 `aria-activedescendant`로 활성 행을 가리키므로 같은 함정이 구조적으로 없다 — 행에 `tabIndex`를 주지 않는다 |
| 2026-09-12 부류 "낙관값 위에 쌓지 않아 앞 선택이 지워졌다" | 해당 없음 — URL 상태가 없다 |
| 2026-09-06 "`userId`로 좁힌다" (레이아웃 멤버십 조회) | Keys 조회가 같은 축 — 조인의 `userId`가 세션 값뿐인지 통합 테스트로 잰다 |
| 2026-09-10 "새 integration 디렉터리를 include에 안 더해 아무도 안 돌렸다" | 테스트를 기존 `lib/keys/__tests__/`에 둬서 include·트리거 추가가 없다 |
| 2026-09-13 강조 어긋남의 **남은 사본** | ⚠️ `lib/keys/translation-list.ts:234`의 `matchesFor`가 `toLowerCase()` 한 문자열의 `indexOf`를 원문 위치로 쓴다 — 같은 부류다. **이 기능은 그 함수를 쓰지 않고**(강조는 `highlightSegments`) 고치지도 않는다(외과적 변경) — 보고에서 언급만 한다 |

## 문서 갱신 (실제 갱신은 `/implement`·`/push`)

- **PRODUCT** §4.1 "글로벌 검색" 항목 추가 · §7.7 `/changelog` 비범위에서 "검색" 제거(글로벌 검색이 든다) · IA 블록에 "검색은 라우트가 아니다(Dialog)" 한 줄 · `/api/search-index`는 IA 표 밖(API).
- **ARCHITECTURE** 인가 없는 진입점 목록(§6)·보안 모델에 `/api/search-index` — 공개 내용만, 세션 없음.
- **CLAUDE.md** "데이터 변경 경로" 표에 `/api/search-index` 행(호출자: 브라우저 검색 Dialog, 읽기 전용·공개·정적 재생성)과 읽기 전용 Action `searchKeysAction` 행 — 표가 Route Handler·읽기 전용 Action을 전부 나열한다.
- **DIRECTORY** `lib/search/` · `components/search/` · `app/api/search-index/`.
- **DESIGN** 위 "갱신 대상".
- **`/privacy`** 쿠키 절 옆에 "브라우저에 남기는 것" — 최근 검색어 5개, 이 브라우저에만, 서버로 보내지 않음, 지우는 법(Dialog의 `Clear`). 개정 이력 · 시행일(`policy-gate.test.tsx`). ⚠️ 지금 방침은 "It sets no cookies and stores nothing in your browser"를 **Web Analytics**에 대해 말한다 — 앱 전체의 단언이 아니므로 그 문장은 참으로 남는다.
- **README** 기능 목록에 한 줄(사용자 노출 기능).
- **가이드** 영향 플래그 — `/guide`가 개요(`guide/README.md`) 또는 `translate/edit.md`에 검색 입구를 적을지 판정한다.
