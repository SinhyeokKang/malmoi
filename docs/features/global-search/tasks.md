# global-search — 태스크

순서: 순수 함수 → 서버 껍데기(Keys 조회 · 색인 route) → **프리미티브** → 화면 조립 → 문서 → 실물 검증. 커밋 경계는 `──` 줄이고, **각 경계에서 `pnpm gate`가 green**이다(출력을 파이프로 거르지 않는다). A8·B가 `lib/keys/`를 건드리므로 **A·B 커밋(과 그 뒤 push 전 커밋 전부 — 게이트 base가 `origin/dev`)**에서 `pnpm gate`가 격리 postgres(`test:projects:postgres`)를 스스로 붙인다.

- **UI 검증은 수동이다** — 이 리포에 e2e가 없다. DOM 테스트(jsdom)는 자동, `pnpm dev`·`/runtime-test`로 보는 것은 수동으로 적는다. jsdom은 레이아웃을 계산하지 않는다(가로 중앙 rect·실제 스크롤은 G1), `scrollIntoView`는 `vitest.setup.ts`가 no-op 스텁이라 호출은 spy로만 잰다.
- **스키마는 조건부다** — B3 실측이 기준을 넘을 때만 B4가 생긴다.
- 신규 페이지가 아니라 Claude Design 핸드오프가 없다 — `/design-sync` 대상이 아니다(2026-10-01 사용자 확인). 시각값은 DESIGN 토큰·기존 프리미티브·대형 모달 치수, 레이아웃은 GitLab 검색 패널 참고 이미지가 정한다.
- **사본 스캔(손 `<kbd>`·`<mark>`, spec 16의 raw 태그)은 component-unify의 `hand-copies.test.ts` 표에 행으로 더한다** — 카나리아·하한·뮤테이션은 그 파일 규약이다. **그 밖의 새 소스 스캔은 네 장치를 든다**(POSTMORTEM 2026-09-14 · 09-18): (a) 주석을 벗기고 (b) 대상 파일 수 > 0 (c) 심은 위반 하나를 잡는 자기 검사 (d) 실제 코드에 뮤테이션 1회를 걸어 red를 확인한 사실을 커밋 메시지 본문에 남긴다. 선례 `focus-ring.test.ts:330-345` · `:272-320`.
- **착수 조건: component-unify 종료**(`test ! -d docs/features/component-unify` — 그 기능의 결정 S9, 2026-10-01 사용자 재확인). 새 프리미티브의 어휘는 그 규약을 따르고 그 산출물을 재사용한다(design "UI").

## 0. 착수 전

- [x] **T0** 재확인 — 전제: `test ! -d docs/features/component-unify`.
  - component-unify 산출물이 코드에 있는지 확인한다: `LargeModal` 치수 상수 · `Input` 글리프 슬롯 · `NoMatch`(출구 필수 형) · `components/__tests__/hand-copies.test.ts` · `ui/` `SearchInput` · 슬롯 규약(`description`·`badge`). 없으면 멈추고 사용자에게 묻는다.
  - spec·design·tasks의 file:line을 다시 잰다 — 특히 `project-list.tsx`의 `<mark>`(ListRow 이관 뒤) · `project-switcher.tsx`의 `<kbd>` · `visual-system.test.ts` `REGISTERED` · `projects-screen.test.ts` 단언 · `shell-layout`·`shell-header`·`public-shell` 테스트 줄 · `dialog.tsx`·`primitive-focus.test.tsx` 줄 · `client-graph.test.ts` 목록 줄 · `entry-points.test.ts` 맵 이름.
  — 검증: `rg -n ':[0-9]+' docs/features/global-search/*.md`로 뽑은 file:line을 한 줄씩 대조해 어긋난 것 0 · 산출물 확인 목록 전부 ✓.

── 커밋: `docs(feature): global-search refreshed references after component-unify`

## A. 순수 함수 (`/tdd interface` 진입점)

- [x] **A1** `lib/search/match.ts` — `searchTokens` · `scoreEntry` · `searchGroups` · `previewGroups`. 테스트 먼저.
  — 검증: design 표 1의 테스트(두 필드 가로지른 AND 일치 · 순위 표 · 그룹당 5 · 빈 그룹 제거 · 그룹 순서 `Projects · Menus · Docs`(Keys는 Dialog가 끼운다) · activeSlug 가산 · 안정 정렬 · 미리보기 세 경우와 `View all` 행이 상한에 안 셈) · `pnpm test` green.
- [x] **A2** `lib/search/highlight.ts` — `highlightSegments` · `snippet`.
  — 검증: `İstanbul` 경계 테스트(POSTMORTEM 2026-09-13) · 겹침 합치기 · 서로게이트 쌍 보존 · 긴 원문/번역값 후반의 질의 전체 일치가 스니펫에 포함 · `pnpm test` green.
- [x] **A3** `lib/search/docs-index.ts` — `docsSearchEntries(summary, pageOf)`.
  — 검증: 실물 `guide/SUMMARY.md`로 — 항목 수 = 서빙 페이지 수(28) + 표식 있는 H2 수 · AUTHORING·SHOOTING 0건 · 모든 `href`가 `routes.docs(page, anchor)` 모양 · 표식 없는 H2 스킵 · `pnpm test` green.
- [x] **A5** `lib/search/nav-index.ts` — `navSearchEntries`. 멤버십마다 `navZones(project, …)`의 프로젝트 구역을 쓴다(`nav.ts`의 비공개 `translationsHref`는 export하지 않는다).
  — 검증: OWNER만 `Settings` · 보관 포함 · `null` → 하단 둘만 · `[]` → 사용자 메뉴(`navWorkItems()` + `New project`) + 하단 · 모든 프로젝트 메뉴 href·라벨이 같은 프로젝트의 `navZones` 결과와 같다 · 기존 `lib/shell/__tests__/` 무수정 green · `pnpm test` green.
- [x] **A5a** `lib/shell/nav.ts` `toNavProjects` — T0에서 대조한 인라인 map을 `lib/shell/nav.ts:45-51`로 옮기고 레이아웃(`app/(edit)/layout.tsx:76`)이 그것을 부른다(동작 불변, `MembershipRow`는 `import type`).
  — 검증: 결과 키 집합 = 지금 레이아웃 map의 키 일곱(`surfaceSlug` 없음 · 초과 0) · `shell-layout` 테스트 무수정 green · `client-graph` green(`nav.ts`가 서버 그래프를 끌지 않는다) · `pnpm test` green.
- [x] **A7** `lib/search/keys.ts` — `isSearchShortcut` · `shouldIgnoreShortcut` · `nextActive` · `reconcileActive`.
  — 검증: macOS Meta+K true · macOS Ctrl+K false · 그 밖 Ctrl+K true · 그 밖 Meta+K false · 조합 중(`isComposing` · `keyCode 229`) false · Shift/Alt 조합 false · `input`·`textarea`·`contenteditable` 대상이면 무시 · 문서에 열린 `[role="dialog"]`·`[role="menu"]`가 있으면 무시 · ids 0 → null · id 순환 · 질의 변경 → 첫 id · 늦은 그룹 삽입 뒤 id 불변 · 사라진 id → 첫 id · `pnpm test` green.
- [x] **A8** `lib/keys/search.ts`의 순수 부분 — `keySearchQuery` · `mergeKeyHits`, `lib/search/key-href.ts` `keyResultHref`(+ `KeyHit` 타입 소유). `lib/keys/translation-list.ts`의 `likePattern`을 export만 한다.
  — 검증: 1자 → null · 공백 둘러싼 1자(`"  a "`) → null · `50%_off`·`\` 이스케이프가 번역 화면과 같은 문자열 · 201자 → 앞 200자 패턴(`Q_MAX_LENGTH`) · ①이 5건이면 ② 무시 · **같은 이름·다른 id 둘 다 남음**(중복 제거는 id) · 키 id 최종 정렬로 동점 6개 이상에서 입력 순서와 무관한 상위 5개 · href가 `translationsHref(slug, surfaceSlug, { ...DEFAULT_TRANSLATION_QUERY, ns, key: id, keySurface })`(`lib/translations/query.ts`)와 같은 문자열 · 필터 키 없음 · `lib/keys/search.ts`가 `KeyHit`을 `import type`으로만 읽음 · `pnpm test` green.
- [x] **A9** 의존 그래프 검사 — A1·A2·A5·A7·`key-href.ts`마다 `client-graph.test.ts`에 검사한다. 독립 모듈만 자기 자신을 단언하고, `nav-index`·`key-href`는 design에 적은 의도한 전이 파일 집합의 정확 일치와 허용 패키지를 단언한다(`lib/events/view.ts` 검사 선례). **`CLIENT_LIB_FILES` 목록은 여기서 넓히지 않는다** — 소비자가 없는 지금 더하면 정확 일치 단언(:502-505)이 초과로 red다. 목록 추가는 E2다.
  — 검증: 모듈별 기대 그래프가 명시되고 정상 재사용은 통과하며, 하나에 `lib/keys/translation-list.ts` 값 import를 심으면 red(뮤테이션 1회) · `pnpm test` green.

── 커밋: `feat(search): add pure matching, highlighting and index builders for global search`

## B. Keys 조회

- [x] **B1** `lib/keys/search.ts` `searchKeys(prisma, { userId, q, activeSlug })` — design "Keys 조회"의 멤버 id 확정 + ①·② SQL. `lib/keys/__tests__/search.integration.ts` 먼저.
  — 검증(격리 postgres): 두 사용자·두 프로젝트에서 **서로의 키·번역값 0건** · 보관 프로젝트·보관 소스·첫 적재 전 소스(`lastCommitSha` null)·orphaned 키 0건 · **orphaned 로케일의 번역값만 일치 → 0건** · 멤버십 0인 사용자 → 0건 · 키 이름 > 원문 > 번역값 순위 · 한 키가 여러 로케일에서 일치하면 로케일 코드(`COLLATE "C"`) 첫 하나 · 같은 이름의 키가 다른 소스·프로젝트에 있으면 둘 다 · ① 키 이름 일치와 ② 번역값만 일치 각각 동점 키 6개 이상에서 최종 키 id 순서의 상위 5개가 고정 · 로케일 0개인 키 · 빈 문자열 번역값 · ①이 5건이면 ② 쿼리 미실행(쿼리 수 계측 — 선례 `lib/keys/__tests__/save-key.integration.ts:28-43`의 `$on("query")`) · `_`·`%`·`\` 질의가 와일드카드로 새지 않음 · `pnpm gate` green(postgres 스위트 포함 — 출력에 새 파일이 잡힌다).
- [x] **B2** `app/search/actions.ts` — `searchKeysAction(q, activeSlug)` · `loadSearchMembershipsAction()`. design "Action 형" — `readSession` union(`{ ok: false, error: "unauthorized" }` / `"unavailable"` 리터럴), `requireUser` 없음, 코어 오류는 try/catch로 `unavailable`, `revalidatePath` 없음, `console.*`에 `q` 없음, `typeof q === "string"` 판정 먼저. `entry-points.test.ts`에 `loadSearchMembershipsAction` → `USER_SCOPED_ACTIONS`, 형제 맵 **`MEMBER_JOIN_CORES`**(`searchKeys → lib/keys/search.ts`)와 그 코어 검사(주석 제거 뒤 `"ProjectMember"` 조인 + `pm."userId" = ${userId}` 바인딩, 검출기 0 자기 검사)를 더한다.
  — 검증: 액션 단위 테스트(세션 없음 → `unauthorized` · 장애 → `unavailable` · 코어가 던지면 `unavailable` · 비문자열 `q` → 빈 결과 · 1자 → 빈 결과 · 멤버십 응답에 레이아웃 키 일곱 밖 필드 0 · 두 Action 입력에 프로젝트 목록이 없음) · `entry-points` green · 뮤테이션: `searchKeysAction`의 `readSession` 호출을 지우면 red, `searchKeys`의 `ProjectMember` 조인을 지우면 red · 소스 스캔(네 장치) `revalidatePath(`·`console.` 호출 0 · `pnpm test` green.
- [x] **B3** **성능 실측** — `lib/keys/__tests__/search-performance.integration.ts`(커밋, `translation-list-performance.integration.ts`의 형: autovacuum off · `statement_timeout=5000` · `$on("query")` · `EXPLAIN (ANALYZE, BUFFERS)`). 픽스처: 멤버 프로젝트 둘(하나는 20,000키 × 10로케일 = 200,000행) + 비멤버 대형 테넌트 하나(여러 소스, 번역 행 수 > 멤버 전체 번역 행 수 × 2). 질의 넷(불일치 · 키 이름 일치 · 번역값만 일치 · 흔한 단어) × 통계 상태 둘(없음 · `ANALYZE` 뒤) × 20회.
  — 검증: `Translation` 방문 행(필터·인덱스 재검사 탈락 행과 loops 포함) < 멤버 전체 번역 행 수 × 2 및 접근 경로의 멤버 `projectId` 제한(`Index Cond` 등)을 두 통계 상태 모두에서 단언 · 동일 픽스처 전체 순차 스캔을 대조군으로 수집해 같은 검출기가 거부함을 확인(방문 수만으로 비멤버 미방문을 단정하지 않음 — spec 19) · 중앙값을 design.md "측정값"에 기록(로컬 PG17 Execution Time, 왕복 제외 명시) · 최악 질의 중앙값 ≤ 300ms면 B4 생략(그 판정도 기록) · `pnpm gate` green.

── 커밋: `feat(search): add membership-scoped key and translation search action`

- [x] **B4** **실측 253.221ms ≤ 300ms로 생략, 스키마 변경 없음.** *(B3이 기준을 넘을 때만)* `/db` — `pg_trgm` + GIN 셋(`StringKey.key` · `StringKey.sourceText` · `Translation.value`), **평범한 `CREATE INDEX`**(`CONCURRENTLY` 아님), 한 파일. 먼저 확인할 것 셋: ① `schema.prisma`에 `@@index(..., type: Gin, ops: raw(...))` + 확장 선언으로 표현되는가 ② 연산자 클래스 `extensions.gin_trgm_ops` 한정이 Supabase·로컬 PG17 양쪽에서 되는가 ③ 로컬 PG17에 `pg_trgm`이 있는가. `--create-only`로 SQL을 눈으로 본 뒤 dev 적용 · dev·prod `has_schema_privilege` false 확인. **prod `db:deploy`는 `/merge` 1단계다.** `migrate dev`의 리셋 제안은 받지 않는다.
  — 검증: B3 재측정이 기준 통과 · 격리 postgres 30파일 재생 green · 적용 뒤 `pnpm db:migrate --create-only`가 빈 diff(드리프트 없음) · `pnpm db:status` clean · `pnpm gate` green.

── 커밋 (조건부): `feat(db): add trigram indexes for key and translation search` (스키마+마이그레이션만)

## C. 색인 route

- [x] **C1** `app/api/search-index/route.ts` — `dynamic = "force-static"`(`app/llms-full.txt/route.ts`와 같은 형, 트레이싱 include 없음), 응답 `{ docs }`, 가이드 읽기 실패는 던진다. `app/__tests__/entry-points.test.ts` `EXEMPT`에 사유 주석과 함께 추가(가드가 "없음"이 정답인 이유 — 공개 내용만, 세션·DB 없음).
  — 검증: route 단위 테스트 — 응답에 AUTHORING·SHOOTING 문자열 0 · `getPrisma`·`auth`·`cookies`를 던지는 mock으로 두고도 200(이름 세기가 아니라 호출 차단 — 전이 import까지 잡는다) · `loadSummary`가 던지면 핸들러가 던진다 · `pnpm gate` green(build가 route를 정적 생성한다 — 빌드 출력에 `○ /api/search-index`).
- [x] **C2** `lib/search/load-index.ts` · `lib/search/load-memberships.ts` — Docs만 탭 수명 모듈 Promise(실패 시 버림), 멤버십은 캐시 없이 호출마다 Action을 부른다.
  — 검증: jsdom — Docs 두 번 호출에 fetch 1회 · 멤버십 두 번 호출에 Action 2회이며 변경된 응답을 반환 · 네트워크 실패 뒤 재호출에 재시도 · **`fetch`가 `ok: false`(500)로 resolve해도 실패로 보고 버림** · 멤버십 `{ ok: false }` → 버리고 `null` · 테스트 사이 `vi.resetModules()`로 모듈 변수 격리 · `load-index` 독립 그래프 검사 · `load-memberships`는 Action 스텁을 포함한 정확 전이 그래프와 허용 패키지 검사(A9 형) · `pnpm test` green.

── 커밋: `feat(search): serve a static docs search index`

## D. 프리미티브 (`components/ui/` — 화면보다 먼저)

- [x] **D1** `Kbd`(`<kbd>` 태그, `shrink-0 … py-0.5` 포함) + 스위처의 손 `<kbd>` 이관.
  — 검증: `project-switcher.test.tsx` 무수정 green(`[role="menu"] kbd` 셀렉터가 `Kbd`를 잡는다) · `hand-copies.test.ts`에 `Kbd` 행(`components/ui/` 밖 `<kbd` 0 · 카나리아 · 하한) · `pnpm test` green.
- [x] **D2** `Highlight` + `/projects` 손 `<mark>` 이관(조각은 `highlightName` 그대로). **의도한 테스트 대조 둘**: `visual-system.test.ts:95` `REGISTERED`에는 의미 토큰 `bg-link/[0.14]`가 없음을 유지하고, `projects-screen.test.ts:517-522`의 클래스 단언을 "`Highlight`에 `highlightName(row.name, q)` 조각을 넘긴다"로.
  — 검증: 위 두 테스트 대조 뒤 green · 그 밖 `projects-*` 무수정 green · `hand-copies.test.ts`에 `Highlight` 행(`ui/` 밖 `<mark` 0 · 카나리아 · 하한) · `pnpm test` green.
- [x] **D3** `FieldButton` — 캡슐 `rounded-full` · `h-9` · `w-80` · 패널 면(`bg-background border border-border-subtle shadow-low`) · 슬롯 셋 · 포커스 링 리터럴(rest props 없음 — component-unify S5).
  — 검증: `focus-ring.test.ts`의 `FIXTURES`(:132)에 `FieldButton` 픽스처 추가 후 green(`ui/` 안 raw `<button>`은 등록 필수 — :204-211) · `visual-system` green · jsdom: `shortcut` 슬롯이 비어도 자리 폭 유지 · `pnpm test` green.
- [x] **D4** `CommandDialog`(`dialog.tsx` 형제 export — 복귀 기록 공유, `DialogContent` 불변). `ui/large-modal.tsx`의 `LARGE_MODAL_PANEL`·`LARGE_MODAL_OVERLAY`를 import하고, 위치만 `top-4 left-1/2 -translate-x-1/2`. 첫 포커스는 `[data-initial-focus]` 규칙(새 `onOpenAutoFocus` 없음).
  — 검증: 기존 Dialog 소비자 테스트 무수정 green — `primitive-focus.test.tsx` · `focus-return` · `dialog-layer` + 대형 모달 소비자 테스트 · `primitive-focus.test.tsx:236`의 손 `onOpenAutoFocus` 0 스캔 대상에 `<CommandDialog` 소비자를 더한다 · jsdom: 열면 포커스가 `[data-initial-focus]` 입력 · 닫으면 연 자리로(테스트 쪽 fixup observer 관용구 — `members-focus.test.tsx`) · 패널 클래스가 `LargeModal` 치수 상수를 쓴다(새 치수 리터럴 0 — 두 벌 방지) · Dialog 소비자 수 15를 DESIGN 명령으로 다시 세어 D7에 기록 · `pnpm test` green.
- [x] **D5** `Command` · `CommandInput` · `CommandStatus` · `CommandList` · `CommandGroup` · `CommandItem` · 결과 수 sr-only 공지.
  — 검증: jsdom — ARIA(`combobox`·`aria-expanded`·`aria-controls`·`aria-activedescendant`·`listbox`·`group`+`aria-labelledby`·`option`+`aria-selected`) · **`aria-activedescendant`가 가리키는 id의 요소가 실재**(존재 단언 따로 — 코드베이스 첫 사용, POSTMORTEM 2026-09-14 optional chaining 공허) · listbox의 자식이 option·group뿐(`CommandStatus`는 listbox 밖) · ↑↓ 순환 · **Enter가 활성 option 안 링크의 `click`을 부른다**(spy) · 조합 중 Enter 무시 · hover가 활성을 옮기고 `document.activeElement`는 입력 · 실제 결과 링크 `tabIndex={-1}` · Tab·Shift+Tab 시 결과 링크를 순회하지 않음 · 활성 행에만 `Go to` 힌트 · `CommandStatus`가 `aria-live` · `scrollIntoView` 호출(spy) · `pnpm test` green.
- [x] **D5a** `NoMatch` 출구 없는 형 — 필수 `action: ReactElement` 출구 슬롯을 선택으로 연다. 소비자는 검색 Dialog 하나(E2)이고 기존 소비자의 출구는 그대로다.
  — 검증: 렌더 테스트 — 출구 없으면 버튼 0 · 기존 `action` 출구 소비자 무수정 green · component-unify `api-contract` 허용 목록에 새 행 0 · `pnpm test` green.
- [x] **D6** `components/shell/header-bar.tsx` `HeaderBar` + 앱 셸·공개 셸 헤더 이관(가운데 슬롯은 아직 비움). **의도한 테스트 갱신**: `app/(edit)/__tests__/shell-layout.test.ts:135-139`의 `h-10` 단언을 `header-bar.tsx`로 옮긴다 · `components/__tests__/shell-header.test.tsx:35`(`header > div:last-child` 우측 자식 순서)와 `components/__tests__/public-shell.test.tsx:202-206`의 우측 자식 순서 단언을 `HeaderBar` `end` 슬롯 기준으로 고친다.
  — 검증: 새 구조 테스트 — `HeaderBar`가 `grid-cols-[1fr_auto_1fr]`이고 세 슬롯이 `justify-self-start/center/end`, 두 헤더가 `HeaderBar`를 렌더한다(DOM) · 위 세 테스트 갱신 뒤 green · `label-weight.test.ts`(`NAV_LINK`·`PUBLIC_HEADER_LINK`) 무수정 green · `pnpm dev`에서 두 헤더 모양이 이관 전과 같다(수동).
- [x] **D7** DESIGN §6.4 프리미티브 행 · §6.5 헤더 규칙(`HeaderBar` · 캡슐이 헤더의 첫 면·테두리 요소라는 예외) · §6.5 스위처 행 "새 combobox 프리미티브 없음" 갱신 · §6.2 강조 색 자리 · `NoMatch` 출구 없는 형(출구 규칙의 예외) · 대형 모달 행에 `CommandDialog` 공유(이 커밋 묶음의 문서 짝 — 별도 커밋).
  — 검증: 갱신한 절마다 코드 값과 대조(클래스 문자열 · 파일 경로 · Dialog 소비자 수 15 명령 출력) · `visual-system`·`focus-ring` green.

── 커밋: `feat(ui): add Kbd and Highlight primitives and move existing copies onto them`
── 커밋: `feat(ui): add FieldButton, CommandDialog and Command primitives`
── 커밋: `refactor(shell): share a three-slot HeaderBar between app and public headers`
── 커밋: `docs(DESIGN): register search primitives and the three-slot header`

## E. 화면 조립

- [x] **E1** `messages/en.tsx` `search` 절(트리거 라벨 `Search` · placeholder `Search…` · 그룹 제목 넷 `Projects`·`Menus`·`Keys`·`Docs` · `View all projects` · `Browse all docs` · `Go to` · 로딩 둘(Keys·Docs) · 실패 둘 · 결과 수 공지 · 0건 제목/설명).
  — 검증: `no-korean-ui` · `brand-spelling` · `terminology` green · placeholder는 U+2026, 접근 이름엔 없음.
- [x] **E2** `components/search/search-trigger.tsx` · `search-dialog.tsx` — 프리미티브 조립만. 앱 셸 `layout.tsx`가 사이드바와 같은 `toNavProjects` 결과를 Header에도 넘긴다, 공개 셸 헤더는 `account`만 넘기고 Dialog가 로그인일 때 `load-memberships.ts`를 부른다. **`CLIENT_LIB_FILES`에 `lib/search/{match,highlight,nav-index,keys,key-href,load-index,load-memberships}.ts`를 더한다**(소비자가 생기는 이 커밋). 번역 화면 `workspace.tsx`의 선택 행 스크롤 effect 조건에 선택 키 변경을 더하고(spec 13a), 목차의 해시 착지 로직을 공유 헬퍼로 끌어내 목차와 Dialog가 함께 부른다(spec 13).
  — 테스트 절차: user-event 파일 머리에 `vi.setConfig({ testTimeout: 20_000 })` · Dialog는 **실제 타이머로 연 뒤** `vi.useFakeTimers({ shouldAdvanceTime: true })` + `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`(선례 `home-actions.test.tsx:104-108`) · 지연 Promise는 테스트 끝에서 푼다(POSTMORTEM 2026-09-18).
  — 검증: jsdom —
  - 공개 셸 로그인 매 열기에 멤버십 Action 1회 · 같은 열기 내 재렌더·질의 변경은 추가 호출 0회 · 같은 페이지/다른 공개 페이지에서 재열기 시 각각 새 호출 · 생성·보관·역할 변경 뒤 재열기에서 최신 목록 · 다시 열면 이전 목록 대신 로딩 · 닫힘/재열기 뒤 도착한 이전 응답 무시 · 비로그인 0회 · 멤버십 `{ ok: false }` → 비로그인 결과 · 공개 셸 로그인에서 Projects·Keys가 선다
  - 빈 질의 = 미리보기(로그인·프로젝트 있음/0/비로그인 세 경우, `View all` 행)
  - 입력 → 확보한 Projects·Menus 즉시(공개 셸 멤버십 로딩 중이면 응답 뒤) · Keys는 2자 이상 250ms 뒤 한 번 · `"  a "` → 조회 0회 · 늦은 응답 A→B→A가 새 질의를 안 덮는다 · Keys `{ ok: false }` → 상태 줄 한 줄, 다른 그룹 유지
  - `"settings demo"`: Menus는 토큰 AND로 일치, Keys Action 인자는 질의 전체 문자열(두 판정이 다름을 고정)
  - 색인 로딩·실패 각 상태 줄 한 줄 · 대기 중 조회가 있으면 `NoMatch` 없음 · 대기 없음 + 0건 → `NoMatch`(출구 없음)
  - 일치한 필드(제목·context·description)마다 `<mark>` · Keys 번역값 줄에 로케일 코드와 값이 따로 렌더 · 긴 원문/번역값 후반 일치가 스니펫과 강조에 포함 · 키 이름만 일치하면 원문 도입부 표시
  - 늦은 Keys 그룹이 끼어든 뒤 Enter가 **처음 활성이던 항목**을 연다
  - 선택(클릭·Enter) 뒤 Dialog 닫힘 · 조합 중 Esc가 닫지 않음
  - 단축키: 다른 Dialog·메뉴가 열려 있으면 무시 · textarea에 포커스면 무시 · macOS Ctrl+K 무시
  - `hand-copies.test.ts` 행: `components/search/*`에 raw `button`·`input`·`a`·`kbd`·`mark` 태그·hex·`[Npx]` 0(spec 16)
  - `client-graph` green(정확 일치 목록 갱신) · `pnpm gate` green.

── 커밋: `feat(search): add the global search trigger and dialog to both shells`

## F. 문서 (문서별 별도 커밋, spec 17)

- [ ] **F1** `docs(PRODUCT)`: §4.1 글로벌 검색(Keys 범위: 보관·첫 적재 전 제외 · 트라이그램 판정) · IA에 "검색은 라우트가 아니다". §7.7은 고치지 않는다.
  — 검증: §4.1·IA 문장을 spec 완료 조건과 대조 · §4.2 비범위와 충돌 문장 0.
- [ ] **F2** `docs(DESIGN)`: §6.5 "검색 넣지 않는다" 뒤집기 경위 · §9.2 카운터만 남김 · §6.8 헤더 행 · 아이콘 표 · 검색 Dialog 절(D7에 안 들어간 화면 규칙 — 미리보기 · 착지 · GitLab 참고).
  — 검증: 절마다 코드 값과 대조 · `visual-system` green.
- [x] **F3** `docs(ARCHITECTURE)`: §6 "인증 경계" 표에 `/api/search-index`(공개 · 세션 없음 · `force-static`) · Keys 조회의 멤버 id 조인(테넌트 경계) · §1.96 pg_trgm 기각과 B3 측정값의 관계.
  — 검증: 표 행이 `entry-points.test.ts` `EXEMPT` 사유와 같은 말 · 측정값이 design.md와 같은 수.
- [x] **F4** `docs(CLAUDE)`: 데이터 경로 표에 `/api/search-index` · `searchKeysAction`·`loadSearchMembershipsAction`(`app/search/actions.ts`) 행 → `pnpm sync:agents`.
  — 검증: `pnpm sync:agents:check` green.
- [ ] **F5** `docs(DIRECTORY)`: `lib/search/` · `components/search/` · `app/api/search-index/` · `app/search/actions.ts` · `components/shell/header-bar.tsx` · 새 `ui/` 파일.
  — 검증: 적은 경로가 전부 실재(`ls`) · 새로 만든 파일 중 빠진 것 0(`git diff --name-only --diff-filter=A origin/dev` 대조).
- [ ] **F6** `/privacy` 무수정 확인 — 새 수집·브라우저 저장·전송처가 없음을 `/push` 4단계 대조 항목으로 남긴다.
  — 검증: `components/search/*`·`lib/search/*`에 `localStorage`·`sessionStorage`·`document.cookie` 0(소스 스캔 — 네 장치) · `policy-gate.test.tsx` 무수정 green.
- [ ] **F7** `README.md` 기능 목록 한 줄 · 가이드 영향 플래그 → `/guide` 판정.
  — 검증: README 문장이 PRODUCT §4.1과 같은 사실(Keys 범위 · 로그인 필요) · `/guide` 판정 결과(적음/안 적음과 이유)를 보고에 기록.

## G. 실물 검증 (`/runtime-test`, 로컬)

- [ ] **G1** 두 셸에서 캡슐이 뷰포트 가로 중앙(좌우 오프셋 차 ≤ 1px — computed rect) · 캡슐 36 높이·패널 면 · Dialog가 위 16에 대형 모달과 같은 폭·높이로 열림 · macOS ⌘K 열림 / Ctrl+K는 textarea에서 줄 끝 지우기 그대로 · textarea 포커스 중 ⌘K 무시 · 한글 조합 중 Enter·Esc · 빈 질의 미리보기 · 결과 클릭·Enter 이동 · Tab·Shift+Tab이 결과 링크를 순회하지 않음 · 긴 원문/번역값 후반의 일치 구간이 실제로 보임 · 공개 셸 검색 후 프로젝트 생성·보관·역할 변경을 하고 재열면 최신 목록 · **draft 있는 번역 화면에서 결과 선택 → 이탈 확인이 뜨고 검색 Dialog는 닫혀 있음** · `/docs/x` → `/docs/x#y` 같은 페이지 해시 착지(제목 스크롤·포커스) · Keys 결과 → 번역 화면 선택 키(다른 화면에서, 그리고 같은 소스 화면에서 선택 행 스크롤) · 닫힘 포커스 복귀 · 로그인 상태로 `/docs`에서 열면 Projects·Keys가 서고 로그아웃 상태면 Menus(하단)·Docs만.
  — 검증: BugShot 이슈 0 또는 이슈 링크 목록.
