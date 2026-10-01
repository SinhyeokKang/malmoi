# translation-tree-range — design

## 1. 영향 받는 흐름

**편집 UI의 번역 화면 하나**(+ 그 화면으로 가는 Home 링크 둘 — 주의 카드의 빈 로케일 행, 카운트 카드). push·pull·export·Save·Revert·Publish·Sync는 닿지 않는다.

| 자리 | 지금 | 바뀜 |
|---|---|---|
| `lib/translations/query.ts` | 파서·직렬화가 화면과 MCP 공용. 기본 `scope: "project"`, `treeQuery`는 `ns`만, `clearFilters`·`isNarrowed`·`hasConditions`·`emptyActions` | 파서·기본값은 **MCP 계약으로 동결**. 그 위에 화면 층(§2.1) |
| `lib/translations/tree-narrow.ts` | `countRows`·`narrowTree`(0 노드 숨김 + `keep`)·`nodeKey`·`firstRowAt` | `rangeOf`·`inRange`·`tallyRows`·`countTree`(숨김 없음)·`firstRowAt` (§2.2) |
| `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx` | `parseTranslationQuery` → 옛 주소 판정(`legacy` — cursor·focus·locales, `page.tsx:60-64`) → 로더(`scope` 그대로) | `screenQuery(raw)` → 선택 키 위치·언어 정규화 → redirect 판정(§3.1) → **늘 전 소스 로드** → JS 범위 자르기 → 노드 수 (§3) |
| `app/(edit)/projects/[slug]/translations/page.tsx`(공가 redirect) | `serializeTranslationQuery(parse…)` | `serializeScreenQuery(screenQuery(raw))` |
| `components/translations/workspace/workspace.tsx` | 콤보 셋 + Clear filters + 대체 안내, `seen` 세대 집합, 트리 클릭 = 첫 키 점프 | Status 콤보 하나, 트리 클릭 = 범위, 검색 = 전 소스, 위치 이동·재마운트 착지(§4) |
| `components/translations/workspace/tree-panel.tsx` | 좁힌 트리 `nodes`, 선택 = 위치 | 숨김 없는 `nodes`, 0 노드 `disabled`, 검색 중 `All sources` 노드, 범위·위치 이중 표시(§4.3) |
| `components/home/attention-card.tsx` | `completion: "missing", missingLocale` | `completion: "incomplete", language` |
| `components/home/count-cards.tsx` · `lib/home/cards.ts` · Home `page.tsx` | 카드 넷이 기본 소스(`surfaceSlug`) + `scope` 없음(= 전 소스) | 카드마다 **일치가 있는 첫 활성 소스**로(§5) |
| `lib/mcp/tools/keys.ts` · `messages/en.tsx` `list_keys` 설명 | "화면과 같은 필터" | 문장만 사실에 맞게(§2.4) |
| `lib/keys/translation-list.ts` | — | **SQL 무변경.** `translationLinkFor`는 `translationsHref`를 지나므로 주소 규칙만 따라간다 |
| 이 변경이 깨는 기존 소비자 | — | `components/landing/mockup/translations.tsx`(Scope·Completeness 문구) · `lib/__tests__/visual-system.test.ts`(`RotateCcw`·`filters.clear` 쌍) · `lib/guide/__tests__/content.test.ts`(edit.md 굵은 라벨) — tasks T6 |

## 2. 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

### 2.1 화면 URL 층 — `lib/translations/query.ts`

`TranslationQuery` 타입은 그대로 쓴다(로더 입력). 화면은 **정규화된** 값만 든다:

- `scope`는 화면에서 **파생값**이다 — 검색어가 없으면 `locationScope(ns)`(`ns === ALL_NAMESPACES ? "source" : "namespace"`), 검색어가 있으면
  `"project"`(전 소스) 또는 위치로 좁힌 검색의 `locationScope(ns)`.
- `completion`은 `"all" | "incomplete"`만, `state`와 동시에 서지 않는다.

| 함수 | 계약 |
|---|---|
| `STATUSES` · `type Status` | `"all" \| "incomplete" \| "review" \| "unsent" \| "new"` |
| `statusOf(query)` | `state ?? (completion ∈ {incomplete, missing} ? "incomplete" : "all")` — 옛 `complete`는 `all` |
| `withStatus(query, status)` | `nextQuery`로 `completion`·`state` 한 쌍만 바꾼다(`missingLocale` 제거). 위치·검색어·선택·언어는 남긴다 |
| `screenQuery(raw)` | **원본 URL 입력** → 화면 요청값. 기존 `read`로 로케일 없는 `completion=missing` 여부를 보존한 뒤 `parseTranslationQuery`를 호출하고 화면 규칙을 적용한다(MCP 파서 무변경). 옛 `missing` → `incomplete` + `language ??= missingLocale`(로케일 없으면 `incomplete`만) · `completion` 없는 `missingLocale` 버림 · `complete` → `all` · `incomplete`+`state` → `state` · `scope` 파생(위). **`cursor`는 항상 제거**. 정규 URL 왕복 고정점 |
| `isAllSources(query)` | `q !== undefined && scope === "project"` |
| `hasConditions(query)` | **재정의**(지금은 `isNarrowed` 위에 선다 — `query.ts:140`) → `statusOf(query) !== "all" \|\| q !== undefined`. 트리 숫자를 일치 수로 바꿀지 |
| `treeQuery(query, ns)` | `ns`, `scope: locationScope(ns)`, `key: FIRST_KEY`, `cursor`·`keySurface` 제거. Status·`q`·`language` 유지 |
| `allSourcesQuery(query)` | `scope: "project"`만 — 위치·선택·`q`·Status 유지 |
| `searchQuery(query, q)` | `q`(앞뒤 공백 제거)가 비면 `q` 제거 + `scope: locationScope(ns)`. **지금 `q`와 같으면 쿼리 그대로**(좁힌 범위 유지 — spec 조건 5). 다르면 `scope: "project"` |
| `selectQuery(query, row)` | 키 선택. `key`·`keySurface`. **전 소스 범위이면 항상** `ns: row.namespace`와 이동 대상 소스 `row.surfaceSlug`를 함께 낸다(`ns=*`도 예외 없음, 두 값이 이미 같으면 유지)(§4.2) |
| `serializeScreenQuery(query)` | `serializeTranslationQuery` + **`scope`는 위치로 좁힌 검색일 때만 싣는다**(전 소스 검색·위치 탐색은 주소에 없다) |
| `translationsHref` | 받은 쿼리를 `serializeTranslationQuery`로 원본 입력 형태로 바꾸고 **`screenQuery`로 정규화**한 뒤 `serializeScreenQuery` — 옛 필터 형도 화면 정규형으로 직렬화한다. 소스·키·언어 존재 여부의 보정은 페이지가 맡는다 |
| `emptyActions(query, { noKeys })` | 아래 표. `kind`: `search-all` · `clear-search` · `clear-filters` |
| `applyEmptyAction(kind, query)` | `search-all` = `allSourcesQuery` · `clear-search` = `searchQuery(q, undefined)` · `clear-filters` = `withStatus(q, "all")` |
| `listGenerationKey(query, routeSurfaceSlug)` | §2.3 |

빈 상태 표(DESIGN 표를 대체 — 버튼 라벨·글리프는 기존 `Clear filters` + `RotateCcw` 쌍을 유지한다, DESIGN §2.4):

| 상태 | 주 | 보조 |
|---|---|---|
| 활성 키 0 | 없음 | 없음 |
| 검색어 · 위치로 좁힘 | `Search all sources` | Status 켜짐이면 `Clear filters` |
| 검색어 · All sources | `Clear search` | Status 켜짐이면 `Clear filters` |
| 검색어 없음 · Status 켜짐 | `Clear filters` | 없음 |
| 검색어 없음 · Status 꺼짐(빈 위치) | 없음 | 없음 |

**지우는 것**(이 변경이 만드는 고아 — **T6에서 소비자와 함께 지우고 T1–T8 통합 커밋으로 전환한다**): `clearFilters` · `isNarrowed` · 화면의 Scope·
Completeness·State 콤보 문구와 `missingIn`·`missingMenu`·`complete`·`substituted` 문구(`messages/en.tsx`). `parseTranslationQuery`·
`serializeTranslationQuery`·`DEFAULT_TRANSLATION_QUERY`·`nextQuery`·`landOnFirstKey`·`FIRST_KEY`는 남는다(MCP·로더·첫 키).

### 2.2 범위와 트리 숫자 — `lib/translations/tree-narrow.ts`

| 함수 | 계약 |
|---|---|
| `type ListRange` | `"all" \| { surfaceSlug: string; ns: string }` |
| `rangeOf(query, routeSurfaceSlug)` | `isAllSources(query) ? "all" : { surfaceSlug: route, ns: query.ns }` |
| `inRange(row, range)` | `all`이면 참, 아니면 소스 일치 && (`ns === ALL_NAMESPACES` \|\| `row.namespace === ns`) |
| `tallyRows(rows)` | `{ surfaceSlug, namespace, count }[]` — 직렬화 가능한 배열(RSC prop). 내부는 `Map`(남이 정한 이름) |
| `countTree(tree, counts)` | `null`이면 원본 그대로(같은 참조). 아니면 모든 노드를 남기고 숫자만 일치 수로(이름 조회는 `Object.hasOwn`·`Map` — `__proto__` 네임스페이스). `projectKeyCount` 불변 |
| `firstRowAt` | 그대로 — 이제 범위로 자른 행에 쓰므로 사실상 첫 행이지만, 전 소스 범위의 `@first`가 없도록 판정을 남긴다 |

**지우는 것**(T6, T1–T8 통합 커밋): `countRows` · `narrowTree` · `nodeKey`(`seen` 집합과 함께). 재마운트 착지 표식은 노드를 `{ surfaceSlug, ns }`로 들어 `nodeKey`가 필요 없다(§4.4).

### 2.3 목록 세대 키 — 순수로 뺀다

`listGenerationKey(query, routeSurfaceSlug)` — `lib/translations/query.ts`에 둔다(이미 client 그래프의 잎이라 `client-graph.test.ts` 허용 목록이
늘지 않는다). 전 소스 범위면 `[scope, status, q]`, 아니면 `[route, ns, scope, status, q]`. 전 소스 결과에서 **같은 소스**의 다른 네임스페이스 키를 골라
`ns`가 바뀌어도 목록 세대가 새로 시작하지 않는다(`savedOut` 행·행 memo 보존 — POSTMORTEM 2026-10-01 #157). 다른 소스는 재마운트라 이 키와 무관하다(§4.2).
지금은 `workspace.tsx` 안 리터럴(`conditionKey`)이라 테스트가 화면을 그려야 잴 수 있다.

### 2.4 MCP `list_keys` — 동결

`list_keys`가 같은 파서·로더를 **외부 계약**으로 쓴다(`lib/mcp/tools/keys.ts:39` — `scope` 없으면 전 소스, `completion=missing|complete`, `state`, cursor).
화면 층은 원본 입력에서 필요한 옛 주소 정보를 보존한 뒤 기존 파서를 호출한다. MCP는 기존 파서를 직접 호출하므로 입력 해석이 바뀌지 않는다. MCP 출력엔 링크 필드가 없다(`keys.ts:42-47`). 바뀌는 것은 설명 문장 하나 —
`messages/en.tsx`의 `list_keys`가 "Takes the same filters as the translations screen"이라 단언하는데 화면이 Status 하나가 되면 거짓이다. 도구가 받는 축을
직접 나열하는 문장으로 고친다. ⚠️ `read-tools.test.ts`는 로더를 mock하므로 동결의 오라클은 파서 단언이다(tasks T1).

## 3. 서버 — 늘 전 소스, JS로 자르기

```
screen = screenQuery(raw)
// 인가된 활성 소스·선택 키로 목적지 경로/ns를 맞추고, 상세 대상 소스의 language를 검증한다(§3.1).
// 이 결과와 raw URL을 비교해 redirect한 뒤 목록을 읽는다.
range  = rangeOf(screen, route)
full   = loadTranslationList({ ...screen, scope: "project" }, pageSize "all", selectedKeyId)
rows   = full.rows.filter(r => inRange(r, range))
list   = { ...full, rows, matchedKeyCount: rows.length, incompleteKeyCount: …, selectedInResult: … }   // rows에서 다시 센다
counts = hasConditions(screen) ? tallyRows(full.rows) : null
```

- **읽기 경로가 하나다.** 조건이 있든 없든 전 소스를 한 번 읽고 범위로 자른다 — 지금의 기본 착지와 같은 조회라 비용이 늘지 않는다(ARCHITECTURE §1.95:
  5,000행 `loadEventEnd` 1.33s 게이트 통과). SQL `scope` 경로와 JS `inRange` 경로가 같은 행을 내는지 지킬 필요가 사라진다. "트리 숫자 = 그 노드를
  눌렀을 때의 목록 수"가 구조로 맞는다(완료 조건 9).
- **응답이 줄어든다** — 지금은 기본 착지가 전 소스 행을 RSC로 싣는다. 이후 화면에 실리는 것은 범위 행뿐이고 `counts`는 노드 수만큼이다.
- `@first`는 `firstRowAt(rows, route, ns)`(범위로 자른 행). 전 소스 검색에서 노드를 누르면 그 노드의 첫 일치 키다.
- `incompleteKeyCount`는 화면 소비처가 없다(MCP만 쓴다) — 다시 세는 것은 `list` 필드의 대칭을 지키려는 것이다.
- `effective`(`Untranslated in`의 대체)는 화면이 더는 `missing`을 보내지 않으므로 늘 무변이다 — 로더 필드는 MCP 몫으로 남기고 화면은 읽지 않는다.

### 3.1 redirect 판정

- 술어: **raw 주소의 파라미터 집합(키·값)이 `serializeScreenQuery(screen)`의 파라미터 집합과 다르면** redirect한다 — 문자열 순서로 판정하지 않고,
  파서가 버리는 잔여 파라미터(`completion` 없는 `missingLocale` 등)도 차이로 잡는다. 기존 `legacy` 판정(cursor·focus·locales)은 같은 술어에 합친다.
- 화면 파서는 `cursor`를 항상 제거한다. 기존 파서·직렬화기의 cursor 보존은 MCP 계약으로 남긴다.
- 루프 없음의 근거: 정규화된 `screen`은 `screenQuery(serializeScreenQuery(screen))`과 같다. 아래 위치·언어 보정도 이미 유효한 값은 그대로 두므로,
  **경로와 파라미터를 모두** 정규화한 주소는 다시 redirect되지 않는다.
- **검색어 없이 `keySurface`가 경로 소스와 다르고 활성 소스이면** 그 소스 경로로 옮긴다. 인가된 프로젝트·활성 소스로 제한한 상세 조회에서 유효한 선택 키를
  찾았으면 **`ns`도 그 키의 실제 네임스페이스로 맞춘다**. 기존 `selectRow`는 `ns`를 남기므로 경로만 바꾸면 이전 소스의 빈 네임스페이스에 착지한다.
  같은 소스 링크도 선택 키가 명시된 네임스페이스 범위 밖이면 `ns`를 맞춘다(`ns=ALL_NAMESPACES`면 이미 범위 안이므로 유지).
  비활성·없는 소스면 `keySurface`를 버린다. 없는 키나 `@first`에서 네임스페이스를 추측하지 않고 기존 부재·첫 키 처리를 유지한다.
- **언어 검증은 redirect 비교 전에 한다.** `undefined`와 `MISSING_LANGUAGES`(`@missing`)는 보존하고, 실제 로케일 코드만 상세 대상 소스의 활성 로케일과
  대조한다(선택 상세가 없으면 목적지 경로 소스). 없는 코드는 `screen.language`와 정규 URL에서 함께 제거한다. 화면은 `useSearchParams`에서 언어를 다시 읽으므로
  prop만 지워서는 라벨을 바로잡을 수 없다. 키 위치 보정으로 소스가 바뀌면 목적지 기준으로 검사한다.
- 순서: `requireSurfaceAccess` → `screenQuery(raw)` → 인가된 트리·선택 상세 조회 → 목적지 경로/네임스페이스·언어 보정 → 정규 URL 비교 → 목록 조회.
  선택 상세는 렌더에 재사용하고, 독립적인 프로젝트·트리·상세 조회의 기존 병렬 배선은 유지한다. 공가 redirect는 `screenQuery(raw)`를 직렬화하고 소스·키·언어 검증은 목적지 페이지가 맡는다.

## 4. 화면

### 4.1 툴바

> ⚠️ **2026-10-02 결정으로 대체** (spec 결정 기록): Status `FilterMenu`는 툴바가 아니라 **키 목록 패널 머리 오른쪽**(로케일 패널의 언어 메뉴와 같은 형)이다. 툴바는 검색 입력만. §4.5의 목록 제목은 `Keys` 고정.

- `FilterMenu` 하나 — axis `Status`, 라벨은 선택값(`All keys` 기본, 꺼진 표시). `New from GitHub` 힌트는 그대로. `withStatus`로 이동(`push`).
- 툴바 `Clear filters` 버튼 · Scope 콤보 · Completeness·State 콤보 · `substituted` 안내 · `surfaceLocales`(Missing in 선택지 전용) 제거.
- 검색 입력은 `searchQuery`로 이동. **label과 placeholder를 가른다** — `{ label: "Search keys", placeholder: "Search all sources…" }`(DESIGN §10:
  플레이스홀더는 `…`로 끝나고 label과 키를 가른다). `SearchInput`은 placeholder가 없으면 label을 쓰므로(`search-input.tsx:20`) 하나로 두면 좁힌 검색
  중에도 접근 이름이 "Search all sources"라는 거짓을 말한다. 플레이스홀더는 입력이 비어야만 보이고 그때 새 검색은 언제나 전 소스라 사실과 맞다.
  빈 상태 버튼 `searchAll`(`en.tsx`)과 키를 나눈다.

### 4.2 트리·키 선택

- **트리 클릭** = `treeQuery` + 그 소스 경로(`push`). 지금과 같은 서버 왕복이고 목록 세대가 새로 시작한다.
- **`All sources` 노드**(검색 중 · 활성 소스 둘 이상) = `allSourcesQuery`(`push`). 선택 키는 남는다.
- **키 선택** = `selectQuery`(`replace`). 전 소스 범위에서는 항상 위치를 `{ surfaceSlug: row.surfaceSlug, ns: row.namespace }`로 맞춘다. 이미 두 값이 같을 때만 위치를 유지한다:
  - 같은 소스·다른 네임스페이스 또는 `All namespaces` → 주소의 `ns`만 바뀐다. 세대 키가 위치를 안 보므로 목록이 그대로다(§2.3).
  - **다른 소스 → 경로가 그 소스로 바뀌어 화면이 재마운트된다**(`surfaces/[surfaceSlug]` 세그먼트, 사용자 확정). 목록은 전 소스 결과 그대로 다시 오고 마운트
    착지가 선택 행으로 스크롤한다. **대가**(spec 조건 7에 명시): 목록 세대가 새로 서서 저장으로 조건에서 빠진 행(`savedOut`·`+n saved`)이 사라지고, 트리
    펼침 상태가 초기화되며(`tree-panel.tsx:37`), `loading.tsx` 골격이 한 번 선다. draft는 `attempt`의 discard 확인을 지나므로 잃지 않는다.
    ⚠️ 재마운트 뒤 `restoredFor`가 `null`이라 세션 복구 문구(`workspace.tsx:208`, malmoi#100)가 앱 안 소스 전환에서 뜨면 안 된다 — 테스트로 고정(T7).
    ⚠️ 포커스는 §4.4.
  - 위치로 좁힌 검색·탐색에서는 키 선택이 범위를 바꾸지 않는다.
- **검색 지우기** = `searchQuery(…, undefined)` — 범위가 위치(= 마지막으로 고른 키의 소스·네임스페이스)로 돌아간다. 다른 소스 키를 고를 때 이미 경로가
  그 소스로 옮겨 갔으므로 보통 재마운트가 아니다. 재마운트가 되는 것은 `keySurface ≠ route`인 검색 딥링크뿐이다 — 이때 `searchQuery`는 그 `keySurface`
  경로로 이동하며, 선택 상세의 실제 네임스페이스도 함께 맞춘다(완료 조건 8이 그 경우에도 성립하도록).

### 4.3 트리 표시 — 범위와 위치

- `ListItemButton`의 `selected`(배경 `0.07` + `aria-current="true"`)는 **범위**다: 전 소스 범위면 `All sources` 노드(활성 소스가 하나면 그 소스의
  `All namespaces`), 아니면 위치 노드.
- 전 소스 범위의 **위치 노드**는 `aria-current="location"`이고 **면은 비운다**(hover `0.03`와 겹치면 포인터 아래 항목처럼 보인다 — DESIGN §6.5).
  글자만 한 단계 올린다: 라벨 `font-medium`, 숫자 `text-foreground`, 아이콘 `text-neutral-600`. 선례는 공개 문서 목차의 `aria-current="location"`
  (`public-doc-toc.tsx`)이다. ⚠️ `ListItemButton`이 `aria-current`를 `selected`로만 세우므로 호출부 prop이 뒤에서 덮는 순서(`{...props}`가 마지막)를
  테스트로 고정한다.
- 위치가 바뀌면 그 소스를 펼치고, `Filter namespaces` 검색어가 위치 노드를 숨기지 않게 통과시키고, `scrollIntoView({ block: "nearest" })`로 보이게 한다.
  트리가 접힌 레이아웃의 오버레이를 열면 포커스는 **범위** 노드(`[aria-current="true"]`)로 간다(지금 규칙 — `workspace.tsx:966`).
- `All sources` 노드: `Filter namespaces` 입력 **아래**, 소스 행들의 맨 위. 소스 행과 같은 높이·굵기 500, 아이콘 `Search`(lucide, 16 · `text-neutral-600` —
  임의값 hex는 `visual-system.test.ts`가 red다), 숫자는 전 소스 일치 수(`counts` 합).
- 숫자: `countTree(tree, counts)`. 조건이 켜졌고 0이면 `text-muted-foreground`(지금 토큰) + **`disabled`**(누를 수 없음). 지금 범위·위치 노드는 비활성이
  되지 않는다(오버레이 포커스 대상이 사라지지 않게). 소스 행(펼침 토글)은 0이어도 비활성이 아니다. **노드를 숨기지 않으므로** `seen`·위치 예외가 사라진다.
- 머리 배지·`Filter namespaces` 임계는 지금처럼 원본 트리.

### 4.4 재마운트 착지 — POSTMORTEM 2026-09-24

다른 소스로의 이동(트리 클릭 · 전 소스 결과의 다른 소스 키 · 검색 딥링크의 검색 지우기)은 재마운트라 누른 컨트롤이 사라진다. 지금도 트리의 다른 소스
클릭이 같은 형이다.

- **표식은 클라이언트 모듈 변수 한 칸이다**(sessionStorage 아님) — 착지는 같은 탭 SPA 이동에서만 의미가 있다. 형:
  `{ surfaceSlug, target: { kind: "tree", ns } | { kind: "row", keyId } | { kind: "search" } }`.
- **쓰는 자리**: 이동 확인(discard 확인창)을 지난 `proceed` 안에서, **경로 소스가 바뀌는 이동일 때만**. 취소된 이동은 표식을 남기지 않는다.
- **소비**: 마운트가 한 번 읽고 지운다. **표식의 `surfaceSlug`가 마운트한 경로와 같을 때만** 포커스를 옮긴다 — 다르면(세션 만료 → signin 왕복 등) 버린다.
- **트리 착지의 접힌 레이아웃 예외**: 오버레이는 선택 뒤 닫히고 새 마운트에서도 닫혀 있으므로, 트리 노드가 없으면 **트리 열기 버튼**으로 착지한다.
  최초 마운트 뒤 `ResizeObserver`의 폭 측정으로 트리가 접히는 경우에도, 이번 착지 대상 노드가 사라지기 전에 포커스를 그 버튼으로 이어 준다.
  이미 사용자가 다른 컨트롤로 옮긴 포커스는 뺏지 않는다. 넓은 화면의 소스 접기는 대상 소스를 펼친 뒤 노드로 착지한다.
- 새로고침·뒤로가기·딥링크는 표식이 없어 지금처럼 스크롤만 한다.
- ⚠️ DESIGN 번역 화면 절의 "마운트 착지 … 포커스는 옮기지 않는다"(DESIGN.md 432행 부근) 문장이 이 예외로 바뀐다 — §11 갱신 대상.
- ⚠️ **규칙(09-24): 성공 뒤 착지를 컴포넌트 안에서 기다리면 호출부가 그 컴포넌트를 같은 자리에 두는가를 호출부 조립으로 잰다** — 테스트는 경로가 다른
  두 렌더(언마운트 → 새 마운트)로 잰다. 같은 소스 안 이동은 재마운트가 아니므로 지금의 `navigating` 착지가 그대로다.

### 4.5 목록

- `showSource` = `isAllSources(query) && tree.surfaces.length > 1`.
- 목록 제목: Status가 `Incomplete`면 `Incomplete keys`, 아니면 `Keys`(지금 규칙).
- 트리가 접힌 레이아웃의 breadcrumb(`workspace.tsx:745` — 지금 `routeSurfaceSlug`)은 **범위 라벨**이다: 전 소스면 `All sources`, 아니면 `surface`
  (`ns`가 있으면 `surface / ns`). 범위 콤보가 사라지면 접힌 레이아웃에서 범위를 말하는 유일한 단서다.
- 빈 문구: 검색어 → `No keys match "<q>"` · 키 0 → `No active keys in this project` · Status 켜짐 → 기존 `filteredOut` 문구 · 그 밖(빈 위치) → `No keys in <ns 또는 소스>`.

## 5. Home 링크

- **카운트 카드**: 카드마다 그 카드의 Status에 일치하는 키가 있는 **첫 활성 소스**(트리 순서)로 간다. 일치가 어디에도 없으면 기본 소스. `ns: ALL_NAMESPACES`는
  유지한다(POSTMORTEM 2026-09-15). 순수 함수 `firstSurfaceWith(perSurface, order)`(`lib/home/cards.ts`) + Home 로더가 카드 수를 소스별로도 세어 넘긴다
  (같은 집계 쿼리에 소스 축 하나 — 새 테이블·인덱스 없음, `projectId`로 좁힘). `count-cards.tsx`의 "범위도 All sources다" 주석과 `cardQuery`를 고친다.
- **주의 카드 빈 로케일 행**(`neverFilled`): 이미 행마다 `surfaceSlug`가 있다 — `{ ns: ALL_NAMESPACES, completion: "incomplete", language: code }`.
- 사이드바 배지·프로젝트 목록 배너는 그대로(spec 비목표).

## 6. 스키마 변경

없다.

## 7. 새 환경변수

없다.

## 8. 불변식 영향

- export 결정성 · blob SHA · 병합 없음: 닿지 않는다(읽기 화면).
- **불변식 5(테넌트 격리)**: 조회는 지금 로더 그대로(`projectId` + 활성 표면). JS 자르기는 이미 인가된 행을 줄일 뿐이다. Home 소스별 집계도 `projectId`로 좁힌다.
- **인증 경계**: 페이지의 `requireSurfaceAccess`가 최상단이다 — 그대로. `keySurface` redirect는 그 판정 뒤에 서고, 목적지 페이지가 다시 판정한다.
- **외부 계약**: MCP `list_keys` 입력 해석 무변(§2.4). 대상 리포 Action과 무관.

## 9. 성능

- 모든 착지가 지금 기본 착지와 같은 전 소스 조회다 — SQL이 같고 RSC 응답은 범위 행만이라 줄어든다. 측정 게이트를 다시 세우지 않는다.
  다음에 느리다는 제보가 오면 ARCHITECTURE §1.95 절차(확장 없는 프로필)로 잰다.
- 트리는 숨기지 않아도 네임스페이스에서 멈추고 접힌 소스는 머리 행만 그려 렌더 비용이 거의 늘지 않는다.

## 10. POSTMORTEM 소환

- **2026-09-12 — 필터 툴바만 잠가 이전 쿼리를 다시 제출** → 다음 주소는 낙관값(`view`) 위에 쌓는다(지금 규칙 유지). 새 진입점(`All sources` 노드 · Status ·
  키 선택의 위치 이동)도 전부 `attempt` → `navigate` 한 함수를 지난다.
- **2026-09-15 — 상태로 좁힌 링크가 네임스페이스로도 좁혀져 0건 착지** → Home 카드·할 일 링크는 `ns: ALL_NAMESPACES`를 유지한다. 이 변경으로 **소스 축에서
  같은 부류가 다시 열리는 것**은 카드의 "일치 있는 첫 소스" 착지로 막는다(§5).
- **2026-09-20 / 09-24 — 포커스가 `body`로 빠짐 · 재마운트 · jsdom에서만 참** → §4.4. 착지 코드를 지우면 red인지 뮤테이션으로 확인한다(T7).
- **2026-10-01 #157 — 재전송 목록이 행 memo를 깼다** → 세대 키가 위치를 안 보는 전 소스 경로(§2.3), `mergeServerRows` 참조 보존 유지.
- **2026-09-23 — 부분 응답을 전체 확인으로 해석** → 목록 수·`selectedInResult`는 자른 `rows`에서 다시 센다(로더의 전 소스 값을 그대로 쓰지 않는다).

## 11. 문서 갱신 (구현 단계에서)

- **PRODUCT** §3 "찾기의 기본값"·"트리는 위치이고 필터가 아니다" 문단 → 이 모델로 교체(뒤집은 판정과 날짜, spec "잃는 것" 표). §7.7 `?scope=`·`?completion=`·
  `?missingLocale=` 서술과 "번역 화면의 URL은 요청값을…" 문단 → 화면 층(옛 주소 접기)과 MCP 동결을 나눠 적는다. Home 카드 착지 서술(PRODUCT.md 705-708행
  부근 `cardQuery`) → 일치 있는 첫 소스.
- **DESIGN** 번역 화면 절 — "숫자마다 단위" 문장의 조건 목록, "트리는 위치다" 문단, 0 노드 숨김 → `disabled`, 마운트 착지 "포커스는 옮기지 않는다" 예외와 접힌 트리의 열기 버튼 착지,
  빈 상태 표와 `clearFilters` 쿼리 언급(444행 부근), 범위·위치 이중 표시(§4.3), breadcrumb 범위 라벨. 버튼 표의 `translation-filter-scope` 참조(688행 부근).
- **ARCHITECTURE** §1.95 "2026-10-01 — 기본 범위가 All sources" 전제 문단과 §1.96 "트리의 조건별 숫자도 이 행에서 센다" → 늘 전 소스 조회 + JS 자르기.
  §6.45 `list_keys` 기본 범위 서술 확인.
- **DIRECTORY** — `tree-narrow.ts` 설명, `query.ts` 설명(527행 부근 — 화면 층·옛 주소 접기).
- **가이드** `guide/translate/edit.md`의 필터 문단 — 본문은 **T6에서 고쳐 T1–T8 통합 커밋에 함께**(`content.test.ts`가 굵은 라벨을 사전과 대조한다). 스크린샷:
  `pnpm guide:check`가 못 보는 것 — `translation-editor.webp`의 추적 소스에 `workspace.tsx`·`tree-panel.tsx`가 없다(SHOOTING 매핑 표),
  README `hero.webp`(`README.md:23`)는 매핑 표에 행이 없다, `state-filter.webp`의 `dict:` 키, SHOOTING 촬영 절차의 `?scope=source`. 이 넷은 손으로 판정한다.
