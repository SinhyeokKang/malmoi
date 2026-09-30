# translation-filter-scope — design

## 1. 영향 받는 흐름

**편집 UI만**(번역 작업 화면 + 그 화면으로 오는 링크 둘). push·pull·export는 건드리지 않는다.

| 자리 | 지금 | 바뀐 뒤 |
|---|---|---|
| `lib/translations/query.ts` `DEFAULT_TRANSLATION_QUERY`·`parseTranslationQuery` 폴백·`serializeTranslationQuery`·`clearFilters` | `scope: "source"` 기본 | `scope: "project"` 기본. serialize는 `project`를 생략하고 `source`를 싣는다 |
| `treeQuery` | `scope`를 `source`/`namespace`로 덮는다 | `ns`(위치)·`key: FIRST_KEY`만 바꾼다. `scope`·`completion`·`state`·`q`는 그대로 |
| `workspace.tsx` `narrowed`·Scope `FilterMenu`의 `on` | `scope !== "source"` | `isNarrowed(query)` — `scope !== "project"` |
| `workspace.tsx` 트리 강조 | `scope === "namespace"`일 때만 ns 강조 | 항상 `view.query.ns`(위치) 강조 |
| `workspace.tsx` `showSource` | `scope === "project"` | `scope === "project" && tree.surfaces.length > 1` — 소스 하나인 프로젝트에 늘 서는 소스 열을 막는다 |
| 트리 숫자·노드 | 조건과 무관한 활성 키 수, 전 노드 | 조건이 하나라도 켜지면 **일치 키 수**, 0인 노드는 숨긴다(§4) |
| 트리 이동의 첫 키(`landOnFirstKey`) | 목록 첫 행 | 목록 순서에서 **그 위치의 첫 키**(`firstRowAt`) + 스크롤(§3.2) |
| 화면 목록 | 100행 + `Show more keys` | **전량 한 번에**(§3.1) — 버튼·Action 제거 |
| 빈 상태 | `Clear search` / `Show all n keys` | + 검색 0건 & `scope !== "project"`면 `Search all sources`(기존 미사용 문구) |
| `translationLinkFor`(Logs) · 상세 `copyHref` | `scope: "namespace"`로 착지 | `DEFAULT_TRANSLATION_QUERY` + `ns`(위치) + `key` — 필터가 켜지지 않는다 |
| Home 카운트 카드(`cardQuery`) | `scope: "project"` 명시 | 값은 그대로. 주소에서 `scope=`가 빠진다(기본값). ⚠️ `ns: ALL_NAMESPACES`는 유지(POSTMORTEM 2026-09-15) |
| 레거시 `/translations` redirect | parse→serialize | 코드 변경 없음. `scope` 없는 옛 링크는 이제 `All sources`로 열린다(넓어지는 쪽이라 0건 착지를 만들지 않는다) |

## 2. 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

1. **`lib/translations/query.ts`**
   - `DEFAULT_TRANSLATION_QUERY.scope = "project"`, parse 폴백, serialize 생략 규칙 — URL 왕복(`parse(serialize(q)) ≡ q`) 테스트.
   - `treeQuery(query, ns)` — `scope`·`completion`·`missingLocale`·`state`·`q` 보존, `ns` 교체, `key = FIRST_KEY`, `cursor`·`keySurface` 제거.
   - `clearFilters(query)` — `scope: "project"`.
   - **신규 `isNarrowed(query): boolean`** — completion·state·scope 세 축. `workspace.tsx`의 인라인 판정을 옮긴다.
   - **신규 `hasConditions(query): boolean`** — `isNarrowed || q !== undefined`. 트리를 거를지의 판정(§4).
2. **신규 `narrowTree(tree, counts)`** (`lib/keys/translation-list.ts` 또는 옆 잎) — `counts: Map<surfaceSlug, Map<ns, n>> | null`.
   `null`이면 원본 그대로. 아니면 0인 네임스페이스·소스를 빼고 숫자를 일치 수로 바꾼다. `projectKeyCount`는 **바꾸지 않는다**
   (제목 배지 = 활성 소스 전체의 활성 키 수, DESIGN §6.1a의 단위 규칙).
3. **신규 `emptyAction(query, { noKeys })`** — 빈 상태 버튼 선택: `search-all`(q 있고 scope ≠ project) · `clear-search` · `show-all` · 없음.
   지금 JSX 삼항에 박힌 판정을 옮겨 테스트한다.
4. **신규 `firstRowAt(rows, surfaceSlug, ns)`** — 트리 이동의 대상(§3.2).
5. **링크 모양** — `translationLinkFor`·`copyHref`가 `scope`를 싣지 않는 것: `translationsHref` 결과 문자열로 단언.

## 3. 화면 목록은 한 번에 전부 싣는다 · 트리 이동 = 그 행으로 스크롤

**화면에서 페이징을 걷는다** (2026-09-30 사용자 — `Show more keys`·`Back to top` 같은 "눌러서 더 읽기"가 없어야 한다, 그리고 비용이 scope 집계에
좌우돼 페이지를 나눠도 조회 시간이 줄지 않는다: ARCHITECTURE §1.96 "비용은 페이지 크기가 아니라 `scope`에 좌우된다", 최악 fixture All sources 389ms).

### 3.1 전량 로드

- `loadTranslationList`에 **`pageSize: "all"`**(LIMIT 없음)을 더하고 화면(`page.tsx`)은 그것으로 부른다. `matchedKeyCount`와 `rows.length`가 같아진다.
- ⚠️ **로더의 cursor 페이징은 남긴다** — MCP `list_keys`(`lib/mcp/tools/keys.ts`)가 `cursor`·`nextCursor`를 외부 계약으로 쓴다.
- **고아가 되는 것을 지운다**(내 변경이 만든 고아): `loadMoreTranslationKeys` Action(`app/(edit)/actions.ts`) · `lib/keys/load-more.ts` ·
  `workspace.tsx`의 `loadMore`·`moreBusy`·`cursor`·`extended`·`more` 상태 · `KeyList`의 `onMore`·`moreLoading`·`moreFailed` · 문구 `w.more`·`w.moreFailed` ·
  그 테스트들. `entry-points.test.ts`의 Action 목록도 따라 준다.
- `mergeServerRows`는 **남긴다** — 역할이 "More로 붙인 행 보존"에서 "저장으로 조건을 벗어난 행(`savedOut`)을 자리에 남기기"로 좁혀질 뿐이다.
  재검증 응답이 이제 전체 목록이므로 membership 판정은 서버 행 자체가 된다. 머리 주석을 고친다.
- 옛 `?cursor=` 주소의 redirect는 그대로 둔다(외부에 남은 링크).

⚠️ **0.4초는 DB 시간이고, 전량 로드의 비용은 따로 둘이다** — T8이 둘 다 잰다:
1. **전송·렌더** — 요약 행(번역값 없음)이지만 20,000키면 RSC 페이로드와 DOM 행이 그만큼이다. 가상 스크롤은 넣지 않는다(CLAUDE.md 스택 —
   근거 ARCHITECTURE §1.95).
2. **Save마다 재검증이 목록 전체를 다시 보낸다** — 지금은 첫 100행만 다시 온다. 편집 루프 한 번당 비용이라 1보다 체감이 크다.

현재 실데이터 규모(프로젝트당 수백~수천 키)에서는 둘 다 작다고 보고 진행하되, T8의 20,000키 fixture 수치가 체감 한계를 넘으면 그때 다시 본다.

### 3.2 트리 이동

⚠️ **정렬이 `Incomplete first`라 네임스페이스는 목록에서 연속하지 않는다**(rank → surfaceSlug → sortIndex → key → id). "그 네임스페이스의
첫 키"는 **목록 순서상 처음 나오는** 그 위치의 키로 정의한다 — 대개 rank 0(미완) 블록 안이다.

- 목록이 전부 있으므로 대상은 **순수 함수 `firstRowAt(rows, surfaceSlug, ns)`**로 고른다 — 서버 `landOnFirstKey`가 `rows[0]` 대신 이것을 쓴다.
  새 SQL(jump 쿼리)이 필요 없다.
- 화면은 선택 행으로 **스크롤**한다(`scrollIntoView({ block: "nearest" })`, 선택이 트리 이동으로 바뀐 커밋 한 번).
- 대상이 없으면 선택 없음 — §4가 그런 노드를 숨기므로 조건이 켜진 상태에서 트리로는 닿지 않는다.
- `conditionKey`는 이미 `routeSurfaceSlug`·`ns`를 포함하므로 트리 이동은 **새 목록 세대**다 — `+n saved`가 리셋되는 PRODUCT §3의 규칙과 같다.
- ⚠️ **첫 키는 같은 렌더가 싣는다** (audit-ux #18). 주소의 `@first`는 지금처럼 `replaceState`로 맞추고, **대기 중에는 부르지 않는다**
  (Next 16.3 `ACTION_RESTORE`, `workspace.tsx` 주석).

## 4. 필터 → 트리 반영

`hasConditions(query)`가 참일 때만 **`loadTranslationTreeCounts`**를 부른다 — 목록과 같은 `filtered` CTE에서
`SELECT "surfaceSlug", "namespace", count(*) FROM f GROUP BY 1, 2`. 결과를 `narrowTree`가 트리에 입힌다.

- ⚠️ **CTE를 복제하지 않는다** — `loadTranslationList`의 `filtered` 조립을 함수로 떼어(`filteredKeys(projectId, surfaceIds, query, …)`)
  목록·카운트 둘이 같은 조각을 쓴다. 손 사본은 "같은 행을 세나"가 갈리는 부류다(`pendingWhere` 손 사본 선례, CLAUDE.md 명령어 표).
- Scope가 `This source`면 경로 소스만, `This namespace`면 그 네임스페이스만 남는다 — "필터에 해당하지 않는 것은 숨긴다"의 직역이다.
  그 상태에서 다른 소스로 가려면 필터를 푼다(의도된 대가 — 2026-09-30 사용자 확정).
- `effectiveCompletion`이 뺀 소스(`Missing in ja`인데 ja가 없는 소스)는 카운트가 0이라 트리에서도 빠진다 — 목록과 일치한다.
- 조건이 꺼지면 카운트 쿼리를 안 부른다 — 기본 착지의 조회 수는 늘지 않는다.
- 트리의 `Filter namespaces` 입력(클라이언트 이름 필터)은 그대로 둔다 — 그 결과 위에 겹친다.
- ⚠️ (2026-09-30 사용자 확정) DESIGN §6.1a "트리 숫자 = 언어와 무관한 활성 키 수"는 **조건이 없을 때**의 규칙으로 좁히고, 조건이 있으면 "그 조건의 일치 키 수"로 개정한다
  (언어 무관은 유지 — 상세 언어는 서버로 가지 않는다).

## 5. 스키마 변경

없음.

## 6. 새 환경변수

없음.

## 7. 불변식 영향

- export 결정성·blob SHA·push/pull: **없음**(읽기 화면만).
- **불변식 5(테넌트 격리)**: 새 쿼리(`loadTranslationTreeCounts`)는 `filtered` 조각을 공유하므로 `k."projectId" = ${projectId}`와
  활성 표면 필터를 같이 물려받는다. 통합 테스트에 **다른 테넌트 fixture가 섞여도 0**을 단언한다(`translation-list.integration.ts`의 기존 형).
- 인가 경계: 변경 없음 — 여전히 `requireSurfaceAccess`가 경로 소스를 인가하고, 다른 소스의 키는 인가된 프로젝트의 활성 표면 안에서만 읽는다.

## 8. 성능

ARCHITECTURE §1.96 실측(20,000키×200언어 fixture, 로컬): This source 146ms · All sources **389ms**. 기본 착지가 전 소스로 넓어지면 최악 fixture에서
첫 화면 목록이 ~2.7배다. 실제 프로젝트는 소스당 수백~수천 키라 절대값은 작지만, **T8에서 같은 fixture로 재고** §1.96에 기본값 변경을 적는다.
트리 카운트는 조건이 켜진 때만 한 번 더 도는 집계다. 전량 로드의 전송·렌더·재검증 비용은 §3.1.

## 9. POSTMORTEM 소환

- **2026-09-15 — 상태로 좁힌 링크가 네임스페이스로도 좁혀져 0건 착지**: `state=` 링크는 `ns: ALL_NAMESPACES`를 함께 싣는다. 이 변경은
  `cardQuery`의 `scope`를 기본값으로 만들 뿐 `ns`는 건드리지 않는다. 재발 방지 grep을 T6에서 다시 돈다.
- **2026-09-12 부류 — 이전 쿼리 재제출**: 트리·필터의 다음 주소는 낙관값 `view.query` 위에 쌓는다. `treeQuery`가 scope를 보존하게 되면서
  "앞 필터 선택이 트리 클릭에 지워지는" 것이 사라지는 쪽이지만, 호출부가 `query`(서버 prop)로 바뀌지 않게 유지한다.
- **2026-09-08 — 주소창 값은 허용 목록 파서를 지난다**: `scope` 기본값 변경은 `pick(SCOPES, …) ?? "project"` 한 곳이다.
- **audit-ux #18·#19**: 첫 키는 같은 렌더(§3.2가 지킨다). #19의 More 누적은 전량 로드로 대체되어 사라진다 — cursor가 주소 밖이라는 결론은 그대로다.

## 10. 문서 갱신 (구현 단계에서)

- PRODUCT §3(151–158행) — 최초 범위 `All sources`, 트리는 필터가 아니다, 필터 → 트리 반영. 승인 결정 반전의 날짜·사용자 명기.
- DESIGN §6.1a — 트리 숫자 단위(§4), 트리 강조는 위치, "More는 클라이언트 누적" 문장 삭제.
- ARCHITECTURE §1.96 — `PAGE_SIZE` + cursor는 MCP 전용으로, 화면은 전량 로드로. `loadMoreTranslationKeys` 단락 삭제.
- CLAUDE.md 데이터 변경 경로 표 — "키 목록 다음 페이지(`loadMoreTranslationKeys`)" 항목 삭제.
- ARCHITECTURE §1.96 — 기본 범위 변경 후 실측.
- `guide/translate/edit.md` 13행(`Scope starts at This source`) — `/guide` 플래그.
