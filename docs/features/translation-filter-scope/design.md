# translation-filter-scope — design

## 1. 영향 받는 흐름

**편집 UI + MCP `list_keys`의 기본 범위**(번역 작업 화면 + 그 화면으로 오는 링크 + 같은 파서를 쓰는 MCP 도구). push·pull·export는 건드리지 않는다.

| 자리 | 지금 | 바뀐 뒤 |
|---|---|---|
| `lib/translations/query.ts` `DEFAULT_TRANSLATION_QUERY`·`parseTranslationQuery` 폴백·`serializeTranslationQuery`·`clearFilters` | `scope: "source"` 기본 | `scope: "project"` 기본. serialize는 `project`를 생략하고 `source`·`namespace`를 싣는다 |
| `treeQuery` | `scope`를 `source`/`namespace`로 덮는다 | `ns`(위치)·`key: FIRST_KEY`만 바꾼다. `scope`·`completion`·`state`·`q`는 그대로. `scope=namespace`면 대상이 새 위치를 따라간다(spec 모델) |
| `workspace.tsx` `narrowed`(:557) | `DEFAULT_TRANSLATION_QUERY`와 비교 | `isNarrowed(query)`로 옮긴다(기본값 변경은 자동으로 따라온다) |
| `workspace.tsx` Scope `FilterMenu`의 `on`(:630) | 리터럴 `scope !== "source"` | `scope !== "project"` — **이 자리는 기본값을 따라가지 않으므로 따로 바꾼다** |
| `workspace.tsx` 트리 강조(패널 + 접힘 오버레이 :684) | `scope === "namespace"`일 때만 ns 강조 | 두 곳 다 항상 `view.query.ns`(위치) 강조 |
| `workspace.tsx` `showSource` | `scope === "project"` | `scope === "project" && `**원본** `tree.surfaces.length > 1` — 소스 하나인 프로젝트에 늘 서는 `surface · key` **접두**(`key-list.tsx:72`)를 막는다. 좁힌 트리로 판정하면 필터마다 접두가 붙었다 떨어진다 |
| 트리 숫자·노드 | 조건과 무관한 활성 키 수, 전 노드 | 조건이 하나라도 켜지면 **일치 키 수**, 0인 노드는 숨기되 위치 노드와 세대 안에서 본 노드는 남긴다(§4) |
| 트리 머리 배지(`tree-panel.tsx:41`) | `tree.surfaces.length` | **원본** 활성 소스 수 — 조건과 무관(제목 배지와 같은 단위) |
| `tree-panel.tsx` `Filter namespaces` 입력(:44) | 좁힌 트리 기준 `namespaceCount >= 13`일 때만 렌더 | 임계를 **원본 트리** 네임스페이스 수로 판정 — 조건이 트리를 13개 미만으로 줄여도 입력이 안 사라진다(사라지면 남은 검색어가 보이지 않는 필터가 된다) |
| 트리 이동의 첫 키(`landOnFirstKey`) | 목록 첫 행 | 목록 순서에서 **그 위치의 첫 키**(`firstRowAt`) + 스크롤(§3.2) |
| 화면 목록 | 100행 + `Show more keys` | **전량 한 번에**(§3.1) — 측정 게이트(§3.3) 통과 뒤 버튼·Action 제거 |
| 목록 키보드 | 행마다 Tab 정지점(`key-list.tsx:61-66`) | **roving tabindex** — 정지점 하나(선택 행, 없으면 첫 행), ↑/↓·Home/End로 포커스 이동, Enter·Space가 선택 |
| 빈 상태 | `Clear search` / `Show all n keys` | `emptyActions` 표(§2.3) — `Search all sources`(기존 미사용 문구) 배선, 버튼 `busy`, 성공 뒤 목록 제목(h2)으로 포커스 착지 |
| `translationLinkFor`(Logs · **Home** `(home)/page.tsx:167`) · 상세 `copyHref` | `scope: "namespace"`로 착지 | `DEFAULT_TRANSLATION_QUERY` + `ns`(위치) + `key` — 필터가 켜지지 않는다 |
| Home 카운트 카드(`cardQuery`) | `scope: "project"` 명시 | 값은 그대로. 주소에서 `scope=`가 빠진다(기본값). ⚠️ `ns: ALL_NAMESPACES`는 유지(POSTMORTEM 2026-09-15) |
| scope 없이 링크를 만드는 앱 내부 자리 | `This source`로 열림 | `All sources`로 열림 — 확인한 자리: `source-detail-modal.tsx:76,172` · `attention-card.tsx:123-127` · `sync-button.tsx:256` · `nav.ts:234-236` · `project-list.tsx:444,447`. 전부 "그 소스로 간다"는 위치 의도이고 트리 강조가 위치를 말하므로 넓어져도 착지가 비지 않는다 |
| 레거시 `/translations` redirect | parse→serialize | 코드 변경 없음. `scope` 없는 옛 링크는 이제 `All sources`로 열린다(넓어지는 쪽이라 0건 착지를 만들지 않는다) |
| MCP `list_keys`(`lib/mcp/tools/keys.ts:33`) | `parseTranslationQuery` 기본값 = 경로 소스 | 같은 기본값 = **전 소스**(2026-09-30 사용자). 도구 설명(`messages/en.tsx:3365` "List a source's translation keys")·ARCHITECTURE §6.45 갱신. cursor 페이징은 그대로 |

## 2. 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

전부 `lib/translations/`의 순수 잎에 둔다 — `pnpm test`(`vitest run lib/translations`)가 잡는다. SQL 껍데기(`lib/keys/translation-list.ts`)에 두지 않는다.

1. **`lib/translations/query.ts`**
   - `DEFAULT_TRANSLATION_QUERY.scope = "project"`, parse 폴백, serialize 생략 규칙 — URL 왕복(`parse(serialize(q)) ≡ q`) 테스트.
   - `treeQuery(query, ns)` — `scope`·`completion`·`missingLocale`·`state`·`q` 보존, `ns` 교체, `key = FIRST_KEY`, `cursor`·`keySurface` 제거.
     `scope=namespace`에서도 scope를 보존하고 `ns`만 바뀐다(대상이 위치를 따라감)를 케이스로 박는다.
   - `clearFilters(query)` — `scope: "project"`.
   - **신규 `isNarrowed(query): boolean`** — completion·state·scope 세 축. `workspace.tsx`의 인라인 판정을 옮긴다.
   - **신규 `hasConditions(query): boolean`** — `isNarrowed || q !== undefined`. 트리를 거를지의 판정(§4).
2. **신규 `lib/translations/tree-narrow.ts`**
   - `countRows(rows): Map<surfaceSlug, Map<ns, n>>` — 전량 목록의 행을 소스·네임스페이스로 센다. **새 SQL이 없다**(§4).
   - `narrowTree(tree, counts, keep)` — `counts`가 `null`이면 원본 그대로. 아니면 숫자를 일치 수로 바꾸고, 0인 네임스페이스·소스는 **`keep`에 없으면** 뺀다.
     `keep` = 위치 노드(경로 소스·`ns`) ∪ 이 세대에서 이미 보인 노드. `projectKeyCount`는 **바꾸지 않는다**(DESIGN §6.1a 단위 규칙).
     결과는 **`TreePanel` prop에만** 넘긴다 — `surfaceLocales`(`workspace.tsx:549`, Missing in 선택지)·다른 소스 키의 상세 조회(`page.tsx:95`)·
     `showSource`·머리 배지·`Filter namespaces` 임계는 원본 트리를 쓴다.
3. **신규 `emptyActions(query, { noKeys }): { primary, secondary }`** — 빈 상태 버튼 표(아래). 지금 JSX 삼항에 박힌 판정을 옮겨 표 전체를 테스트한다.

   | 상태 | primary | secondary |
   |---|---|---|
   | 키 0개(`noKeys`) | 없음 | 없음 |
   | `q` 있음 · scope ≠ project | `search-all` (scope만 project로, completion·state 유지) | `isNarrowed`면 `show-all` |
   | `q` 있음 · scope = project | `clear-search` | completion·state가 켜졌으면 `show-all` |
   | `q` 없음 · `isNarrowed` | `show-all` | 없음 |
4. **신규 `firstRowAt(rows, surfaceSlug, ns)`** — 트리 이동의 대상(§3.2). `ns = ALL_NAMESPACES`면 그 소스의 첫 행, 없으면 `undefined`.
5. **링크 모양** — `translationLinkFor`·`copyHref`가 `scope`를 싣지 않는 것: `translationsHref` 결과 문자열로 단언.

## 3. 화면 목록은 한 번에 전부 싣는다 · 트리 이동 = 그 행으로 스크롤

**화면에서 페이징을 걷는다** (2026-09-30 사용자 — `Show more keys` 같은 "눌러서 더 읽기"가 없어야 한다, 그리고 비용이 scope 집계에
좌우돼 페이지를 나눠도 조회 시간이 줄지 않는다: ARCHITECTURE §1.96 "비용은 페이지 크기가 아니라 `scope`에 좌우된다").
단 **§1.95가 가상화를 기각한 전제("`?ns=*`는 기본 경로가 아니라 일부러 고르는 전체 보기")가 이 변경으로 무너진다** — 전량과 전 소스가 동시에
기본값이 된다. 그래서 More 삭제는 측정 게이트(§3.3) 뒤에 둔다.

### 3.1 전량 로드

- `loadTranslationList`에 **`pageSize: "all"`**(LIMIT 없음)을 더하고 화면(`page.tsx`)은 그것으로 부른다.
  - `"all"`이면 **SQL count를 생략한다** — 지금 CTE가 count(`:180`)와 page(`:186`)에서 순차로 두 번 돈다. `matchedKeyCount = rows.length`,
    `incomplete`는 `rows`의 미완 행 수, `selectedInResult`는 `rows.some(...)`. 숫자 `pageSize` 경로(MCP)는 SQL count를 유지하고, 통합 테스트가 두 경로의 값이 같음을 단언한다.
  - ⚠️ **`matchesFor`를 키당 한 행으로 받는다** — 지금은 `rest`의 일치 셀을 로케일 전부 가져와 JS에서 키마다 첫 것만 쓴다(`:223-227`). 100행이면
    묶여 있지만 전량이면 흔한 단어 검색에서 최대 20,000×200행이 Node로 온다. `SELECT DISTINCT ON (t."keyId") … ORDER BY t."keyId", t."localeCode" COLLATE "C"`.
- ⚠️ **로더의 cursor 페이징은 남긴다** — MCP `list_keys`(`lib/mcp/tools/keys.ts`)가 `cursor`·`nextCursor`를 외부 계약으로 쓴다.
- **고아가 되는 것을 지운다**(내 변경이 만든 고아, §3.3 게이트 뒤):
  - ⚠️ 먼저 `list_keys` 입력 스키마가 import하는 `MoreInput`(`keys.ts:5,21`)을 `keys.ts`의 `ListKeysInput`으로 옮긴다 — 안 옮기고 지우면 MCP가 깨진다.
  - `loadMoreTranslationKeys` Action(`app/(edit)/actions.ts`) · `lib/keys/load-more.ts` · `app/(edit)/__tests__/translation-more.test.ts`(파일 삭제) ·
    `app/__tests__/entry-points.test.ts:159` `DELEGATED_CORES`의 `["loadMoreKeys", …]` ·
    `workspace.tsx`의 `loadMore`·`moreBusy`·`cursor`·`extended`·`more` 상태와 More 주석(`:237-242,260-263`) · `KeyList`의 `onMore`·`moreLoading`·`moreFailed` ·
    문구 `w.more`·`w.moreFailed` · `components/__tests__/translation-workspace-transition.test.tsx`의 More mock(`:22`)·케이스(`:188-262,399-421`) · `page.tsx:54` 주석.
- `mergeServerRows`(`lib/translations/saved-rows.ts:35`)는 **남기되 `membership` 인자를 걷는다** — 지금 호출부(`workspace.tsx:261-263`)는 More로 붙인
  행 때문에 membership Map을 늘 넘겨서, 서버 목록에서 빠진 비선택 행이 `savedOut`이 되지 않고 남는다. 재검증 응답이 전체 목록이면 "서버 행에 없음 =
  조건 이탈"이므로 membership 판정은 서버 행 자체다. 인자를 빼면 `cursor`·`extended` 분기도 고아라 함께 걷는다. 머리 주석을 savedOut 보존으로 고친다.
- 옛 `?cursor=` 주소의 redirect는 그대로 둔다(외부에 남은 링크).
- **렌더 비용 완화** — `KeyList`와 행 컴포넌트를 `memo`로 감싸고 `onSelect`를 안정화한다. draft `useReducer`가 워크스페이스 최상위(`workspace.tsx:136`)라
  지금은 상세에서 한 글자 칠 때마다 전 행이 다시 렌더된다. 게이트가 부족하면 `li`에 `content-visibility: auto`를 검토한다(가상화 아님).

### 3.2 트리 이동

⚠️ **정렬이 `Incomplete first`라 네임스페이스는 목록에서 연속하지 않는다**(rank → surfaceSlug → sortIndex → key → id). "그 네임스페이스의
첫 키"는 **목록 순서상 처음 나오는** 그 위치의 키로 정의한다 — 대개 rank 0(미완) 블록 안이다.

- 목록이 전부 있으므로 대상은 **순수 함수 `firstRowAt(rows, surfaceSlug, ns)`**로 고른다 — 서버 `landOnFirstKey`가 `rows[0]` 대신 이것을 쓴다.
  새 SQL(jump 쿼리)이 필요 없다.
- **스크롤**(`scrollIntoView({ block: "nearest" })`, 포커스는 옮기지 않는다) — 마운트(딥링크·새로고침·다른 소스 이동은 재마운트다, `page.tsx:86-88`)와
  트리 이동으로 선택이 바뀐 커밋. 사용자가 목록에서 직접 누른 행은 스크롤하지 않는다. ⚠️ jsdom의 `scrollIntoView`는 `vitest.setup.ts:25`에서
  no-op이라 회귀가 red가 아니라 무반응이다 — 호출 여부는 spy로 단언하고 실제 스크롤은 T8 실물에서 본다.
- 대상이 없으면 선택 없음·스크롤 없음 — 조건이 켜진 상태에선 §4가 그런 노드를 숨기고(위치 노드 제외), 조건이 없을 때 0키 노드를 누르면 여기로 온다.
- **서버 왕복을 유지한다**(2026-09-30 사용자) — `conditionKey`는 `routeSurfaceSlug`·`ns`를 포함하므로 트리 이동은 **새 목록 세대**다.
  `+n saved`가 리셋되는 PRODUCT §3의 규칙과 같다. 같은 소스 안 이동을 클라이언트 전용으로 만들면 경로가 둘로 갈린다.
- 미저장 draft가 있으면 트리 이동 전에 leave guard가 먼저 선다 — 취소하면 이동·스크롤 없음.
- ⚠️ **첫 키는 같은 렌더가 싣는다** (audit-ux #18). 주소의 `@first`는 지금처럼 `replaceState`로 맞추고, **대기 중에는 부르지 않는다**
  (Next 16.3 `ACTION_RESTORE`, `workspace.tsx` 주석).

### 3.3 측정 게이트 — More를 지우기 전에

§1.95의 방법 그대로(로컬 production 빌드 `pnpm build && pnpm start`, `pnpm dev` 금지 — `responseEnd`·`transferSize`를 함께 본다) 전량 배선(T4) 뒤,
More 삭제(T6) 전에 잰다. fixture는 dev DB의 폐기용 대량 프로젝트(2,000 · 5,000키, 소스 셋, `.scratch/` 시드 스크립트 — 상주 QA 프로젝트는 쓰지 않는다).

| 지표 | 5,000행 전 소스 착지 한계선 |
|---|---|
| `loadEventEnd` | ≤ 2.0초 |
| 문서 `transferSize` | ≤ 1.5MB |
| 상세 타이핑 INP | ≤ 200ms |
| Save → 재검증 응답(`responseEnd`) | ≤ 1.0초 |

- 통과 → T6(More 삭제) 진행. 미달 → **멈추고 사용자에게 올린다**(상한 N행 + 안내, `content-visibility`, 설계 재검토 중 선택). 수치는 §1.95 표에 행으로 남긴다.
- 20,000키×200언어(§1.96 fixture) 전량 조회의 DB 시간·`JSON.stringify(rows)` 바이트는 `.scratch/` 스크립트로 **기록만** 한다(3회 중앙값).
  389ms는 LIMIT 100 + count 조회였으므로 판정 기준으로 쓰지 않는다.

## 4. 필터 → 트리 반영

`hasConditions(query)`가 참일 때만 트리를 좁힌다. 카운트는 **전량 목록의 행에서 만든다** — `countRows(serverRows)` → `narrowTree`. 새 쿼리가 없다.

- 목록과 트리가 같은 행에서 나오므로 "트리 숫자 = 목록 수"가 구조로 보장된다. 손 사본 드리프트(`pendingWhere` 선례)도, 새 테넌트 격리 지점도,
  대량 적재 직후 낡은 통계의 집계 지연(POSTMORTEM 2026-09-18)도 생기지 않는다.
- 카운트는 **서버 행**(`savedOut`으로 남긴 클라이언트 행 제외)으로 센다.
- **노드 집합은 목록 세대(`conditionKey`) 안에서 줄지 않는다** — 세대 안에서 본 노드를 `keep`에 누적하고, Save 재검증으로 일치가 0이 된 노드는 숫자만 0으로
  바뀐다. 편집 중인 위치가 트리에서 사라지고 포커스가 `body`로 빠지는 것(POSTMORTEM 2026-09-24 포커스 열한 곳 부류)을 막는다. Sync 성공도 새 세대다(§1.96).
- **위치 노드는 0이어도 흐린 행으로 남는다** — A 경로에서 C 값을 검색한 경우 트리 강조가 사라지지 않는다. 흐린 행은 기존 토큰(`text-muted-foreground`)만 쓴다.
- Scope가 `This source`면 경로 소스만, `This namespace`면 그 네임스페이스만 남는다 — "필터에 해당하지 않는 것은 숨긴다"의 직역이다.
  그 상태에서 다른 소스로 가려면 필터를 푼다(의도된 대가 — 2026-09-30 사용자 확정).
- `effectiveCompletion`이 뺀 소스(`Missing in ja`인데 ja가 없는 소스)는 행이 없으니 트리에서도 빠진다 — 목록과 일치한다.
- 트리의 `Filter namespaces` 입력(클라이언트 이름 필터)은 그대로 두고 그 결과 위에 겹친다. 렌더 임계는 원본 트리 기준(§1).
- ⚠️ (2026-09-30 사용자 확정) DESIGN §6.1a "트리 숫자 = 언어와 무관한 활성 키 수"는 **조건이 없을 때**의 규칙으로 좁히고, 조건이 있으면 "그 조건의 일치 키 수"로 개정한다
  (언어 무관은 유지 — 상세 언어는 서버로 가지 않는다). 머리 배지는 조건과 무관한 원본 활성 소스 수다.

## 5. 스키마 변경

없음.

## 6. 새 환경변수

없음.

## 7. 불변식 영향

- export 결정성·blob SHA·push/pull: **없음**(읽기 화면·읽기 도구만).
- **불변식 5(테넌트 격리)**: 새 쿼리가 없다. 바뀌는 SQL은 `matchesFor`의 `DISTINCT ON`과 `"all"`의 LIMIT·count 생략뿐이고, 둘 다 기존 `projectId`·활성 표면
  조각 안이다. 통합 테스트의 **다른 테넌트 fixture가 섞여도 0** 단언을 `"all"` 경로에도 건다(`translation-list.integration.ts`의 기존 형).
- 인가 경계: 변경 없음 — 여전히 `requireSurfaceAccess`가 경로 소스를 인가하고, 다른 소스의 키는 인가된 프로젝트의 활성 표면 안에서만 읽는다.
- 데이터 변경 경로: 읽기 전용 Server Action `loadMoreTranslationKeys`가 사라진다 — 쓰기 경로는 그대로.
- **MCP 외부 계약**: `list_keys` 기본 범위가 넓어진다(의도된 변경). cursor·`pageSize` 계약은 그대로.

## 8. 성능

ARCHITECTURE §1.96 실측(20,000키×200언어 fixture, 로컬): This source 146ms · All sources **389ms**(LIMIT 100 + count). 기본 착지가 전 소스로 넓어지고
전량이 된다 — DB 쪽은 count 생략이 한 바퀴를 덜고 `DISTINCT ON`이 검색 결과 폭증을 막는다. 전송·렌더·재검증 비용의 판정은 §3.3 게이트다.
트리 카운트는 추가 조회가 없다.

## 9. POSTMORTEM 소환

- **2026-09-15 — 상태로 좁힌 링크가 네임스페이스로도 좁혀져 0건 착지**: `state=` 링크는 `ns: ALL_NAMESPACES`를 함께 싣는다. 그 항목의 grep은
  `cardQuery()` 도입 뒤 0건이라 공허하게 참이다 — **테스트로 센다**(POSTMORTEM 2026-09-15 두 번째 항목의 규칙): `state` 링크를 만드는 자리 전수
  (`count-cards.tsx`의 `cardQuery` · `attention-card.tsx:125` · 레거시 redirect)가 `ns=*`를 싣는지 단언한다.
- **2026-09-12 부류 — 이전 쿼리 재제출**: 트리·필터·빈 상태 버튼의 다음 주소는 낙관값 `view.query` 위에 쌓는다. `treeQuery`가 scope를 보존하게 되면서
  "앞 필터 선택이 트리 클릭에 지워지는" 것이 사라지는 쪽이지만, 호출부가 `query`(서버 prop)로 바뀌지 않게 유지한다.
- **2026-09-08 — 주소창 값은 허용 목록 파서를 지난다**: `scope` 기본값 변경은 `pick(SCOPES, …) ?? "project"` 한 곳이다.
- **2026-09-23 — 부분 응답과 낙관적 상태**: 전량 로드로 "한 페이지만 준다"는 전제가 사라진다. `rg -n 'mergeServerRows|inFlight.sent|state.order|beforeunload' lib/translations components/translations`
  를 T6·T7에서 다시 돌려 소비자를 전수로 본다.
- **2026-09-24 — 포커스가 `body`로 빠지는 자리**: 빈 상태 버튼 성공 뒤(목록 제목으로 착지), 트리 노드 소멸(세대 고정으로 막음), roving tabindex의 선택 행 부재.
- **audit-ux #18·#19**: 첫 키는 같은 렌더(§3.2가 지킨다). #19의 More 누적은 전량 로드로 대체되어 사라진다 — cursor가 주소 밖이라는 결론은 그대로다.

## 10. 문서 갱신 (구현 단계에서)

- PRODUCT §3(151–158행) — 최초 범위 `All sources`, 트리는 필터가 아니다(위치 강조·첫 키 점프·`This namespace` = 위치의 네임스페이스), 필터 → 트리 반영
  (위치 노드 유지·세대 고정). PRODUCT:635("Show more keys는 화면이 누적한다")·:781("More는 클라이언트 누적") 삭제. 승인 결정 반전의 날짜·사용자 명기(spec "뒤집는 결정").
- DESIGN §6.1a — 트리 숫자 단위(§4)·머리 배지 단위·위치 노드 흐린 행, 트리 강조는 위치, L366 "키 선택·More는 `replace`"와 "More는 클라이언트 누적" 문장 정리,
  빈 상태 버튼 표, 목록 roving tabindex.
- ARCHITECTURE §1.95 — 측정 게이트 수치 행 추가, "기본 경로가 아니다" 전제가 바뀐 사실. §1.96 — `PAGE_SIZE` + cursor는 MCP 전용으로, 화면은 전량 로드로,
  `loadMoreTranslationKeys` 단락(`:624`) 삭제, `"all"`의 count 생략. §6.45 — `list_keys` 기본 범위.
- DIRECTORY.md:61 — `loadMoreTranslationKeys`·`lib/keys/load-more.ts` 등재 삭제, `lib/translations/tree-narrow.ts` 추가.
- CLAUDE.md 데이터 변경 경로 표 — "키 목록 다음 페이지(`loadMoreTranslationKeys`)" 항목 삭제.
- `guide/translate/edit.md` 13행(`Scope starts at This source`) — `/guide` 플래그.
