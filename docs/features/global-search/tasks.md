# global-search — 태스크

순서: 순수 함수 → 서버 껍데기(Keys 조회 · 색인 route) → **프리미티브** → 화면 조립 → 문서 → 실물 검증. 커밋 경계는 `──` 줄이고, **각 경계에서 `pnpm gate`가 green**이다(출력을 파이프로 거르지 않는다). `lib/keys/`를 건드리는 B 커밋에서는 `pnpm gate`가 격리 postgres(`test:projects:postgres`)를 스스로 붙인다.

- **UI 검증은 수동이다** — 이 리포에 e2e가 없다. DOM 테스트(jsdom)는 자동, `pnpm dev`·`/runtime-test`로 보는 것은 수동으로 적는다.
- **스키마는 조건부다** — B3 실측이 기준을 넘을 때만 B4가 생긴다.
- 신규 페이지가 아니라 Claude Design 핸드오프가 없다 — `/design-sync` 대상이 아니다(2026-10-01 사용자 확인). 시각값은 DESIGN 토큰과 기존 프리미티브가 정한다.

## A. 순수 함수 (`/tdd interface` 진입점)

- [ ] **A1** `lib/search/match.ts` — `searchTokens` · `scoreEntry` · `searchGroups`. 테스트 먼저.
  — 검증: design 표 1의 테스트(두 필드 가로지른 AND 일치 · 순위 표 · 그룹당 5 · 빈 그룹 제거 · 그룹 순서 `Projects · Pages · Keys · Docs · Changelog` · activeSlug 가산 · 안정 정렬) · `pnpm test` green.
- [ ] **A2** `lib/search/highlight.ts` — `highlightSegments` · `snippet`.
  — 검증: `İstanbul` 경계 테스트(POSTMORTEM 2026-09-13) · 겹침 합치기 · 서로게이트 쌍 보존 · `pnpm test` green.
- [ ] **A3** `lib/search/docs-index.ts` — `docsSearchEntries(summary, pageOf)`.
  — 검증: 실물 `guide/SUMMARY.md`로 — 항목 수 = 서빙 페이지 수 + 표식 있는 H2 수 · AUTHORING·SHOOTING 0건 · 모든 `href`가 `routes.docs(page, anchor)` 모양 · 표식 없는 H2 스킵 · `pnpm test` green.
- [ ] **A4** `lib/search/changelog-index.ts` — `changelogSearchEntries(releases)`.
  — 검증: 목록 표식·링크 문법 제거 · `Full Changelog` 줄 제거 · 순서 유지 · `pnpm test` green.
- [ ] **A5** `lib/search/nav-index.ts` — `navSearchEntries`. `lib/shell/nav.ts`의 `translationsHref`를 export만 한다(동작 불변).
  — 검증: OWNER만 `Project settings` · 보관 포함 · `null` → 하단 둘만 · `[]` → 사용자 메뉴 넷 + 하단 · Translations href가 사이드바 `navZones`의 것과 같다 · 기존 `lib/shell/__tests__/` 무수정 green · `pnpm test` green.
- [ ] **A5a** `lib/shell/nav.ts` `toNavProjects` — `app/(edit)/layout.tsx`의 인라인 map을 옮기고 레이아웃이 그것을 부른다(동작 불변).
  — 검증: 결과 키 집합 = `NavProject` 필드(초과 0) · `shell-layout` 테스트 무수정 green · `pnpm test` green.
- [ ] **A6** `lib/search/recent.ts` — `parseRecent` · `pushRecent`.
  — 검증: 망가진 JSON · 비문자열 원소 · 100자 자르기 · 6번째 밀어내기 · 대소문자 중복 · `pnpm test` green.
- [ ] **A7** `lib/search/keys.ts` — `isSearchShortcut` · `nextActive`.
  — 검증: 조합 중(`isComposing` · `keyCode 229`) false · Shift/Alt 조합 false · ⌘·Ctrl 둘 다 true · count 0 → -1 · 순환 · `pnpm test` green.
- [ ] **A8** `lib/keys/search.ts`의 순수 부분 — `keySearchQuery` · `mergeKeyHits`, `lib/search/key-href.ts` `keyResultHref`. `lib/keys/translation-list.ts`의 `likePattern`을 export만 한다.
  — 검증: 1자·201자 → null · `50%_off` 이스케이프가 번역 화면과 같은 문자열 · ①이 5건이면 ② 무시 · 중복 키 제거 · href가 `translationLinkFor`와 같은 모양(`ns`·`key`·`keySurface`, 필터 키 없음) · `pnpm test` green.
- [ ] **A9** 클라이언트 그래프 — A1·A2·A5·A6·A7·`key-href`가 `client-graph.test.ts` 허용 목록 안.
  — 검증: `pnpm test` green(허용 목록을 넓히지 않고).

── 커밋: `feat(search): add pure matching, highlighting and index builders for global search`

## B. Keys 조회

- [ ] **B1** `lib/keys/search.ts` `searchKeys(prisma, { userId, q, activeSlug })` — design "Keys 조회"의 ①·② SQL. `lib/keys/__tests__/search.integration.ts` 먼저.
  — 검증(격리 postgres): 두 사용자·두 프로젝트에서 **서로의 키·번역값 0건** · 보관 프로젝트·보관 소스·orphaned 0건 · 키 이름 > 원문 > 번역값 순위 · ①이 5건이면 ② 쿼리 미실행(쿼리 수 계측) · `_`·`%` 질의가 와일드카드로 새지 않음 · `pnpm gate` green(postgres 스위트 포함 — 출력에 새 파일이 잡힌다).
- [ ] **B2** `app/search-actions.ts` — `searchKeysAction(q, activeSlug)`(`requireUser` → `searchKeys`) · `loadSearchMembershipsAction()`(`requireUser` → `loadMemberships` → `toNavProjects`). 둘 다 실패는 `{ ok: false }`(던지지 않음), `revalidatePath` 없음, `console.*`에 `q` 없음.
  — 검증: 액션 단위 테스트(세션 없음 → `{ ok: false }` · 길이 밖 → 빈 결과 · 멤버십 응답에 `NavProject` 밖 필드 0) · 소스 스캔으로 `revalidatePath`·`console.` 0 · `pnpm test` green.
- [ ] **B3** **성능 실측** — `.scratch/`에 합성 스크립트: 격리 postgres에 20,000키 × 10로케일(200,000행) 한 프로젝트, 어느 키에도 없는 질의·키 이름 일치 질의·번역값만 일치 질의 각 20회. `EXPLAIN (ANALYZE, BUFFERS)` 한 벌을 남긴다.
  — 검증: 중앙값을 design.md "측정값"에 기록 · 최악 질의 중앙값 ≤ 300ms면 B4 생략(그 판정도 기록) · `EXPLAIN`에 멤버십 밖 프로젝트 스캔이 없다(spec 19).

── 커밋: `feat(search): add membership-scoped key and translation search action`

- [ ] **B4** *(B3이 기준을 넘을 때만)* `/db` — `pg_trgm` + GIN(`gin_trgm_ops`) 셋(`StringKey.key` · `StringKey.sourceText` · `Translation.value`), `CREATE INDEX CONCURRENTLY`(트랜잭션 없는 마이그레이션 파일). `--create-only`로 SQL을 눈으로 본 뒤 dev 적용 · dev·prod `has_schema_privilege` false 확인. **prod `db:deploy`는 `/merge` 1단계다.**
  — 검증: B3 재측정이 기준 통과 · `pnpm db:status` clean · `pnpm gate` green.

── 커밋 (조건부): `feat(db): add trigram indexes for key and translation search` (스키마+마이그레이션만)

## C. 색인 route

- [ ] **C1** `app/api/search-index/route.ts` — `revalidate = 3600`, 응답 `{ docs, changelog }`(`loadReleases` 실패 → `changelog: null`, 가이드 읽기 실패 → 500). `next.config.ts` `outputFileTracingIncludes`에 `"/api/search-index"` 키. `app/__tests__/entry-points.test.ts` EXEMPT에 사유 주석과 함께 추가(가드가 "없음"이 정답인 이유 — 공개 내용만, 세션·DB 없음).
  — 검증: route 단위 테스트(릴리스 실패 → `changelog: null` · 응답에 AUTHORING·SHOOTING 문자열 0) · 소스 스캔으로 `readSession`·`getPrisma`·`cookies(` 0 · `pnpm gate` green(build가 route를 정적 생성한다).
- [ ] **C2** `lib/search/load-index.ts`(탭 수명 Promise 재사용, 실패 시 버림) · `lib/search/recent-store.ts`(try/catch 껍데기, 키 `malmoi.search.recent`).
  — 검증: jsdom — 두 번 호출에 fetch 1회 · 실패 뒤 재호출에 fetch 재시도 · `localStorage`가 던지면 읽기 `[]`·쓰기 무시 · `pnpm test` green.

── 커밋: `feat(search): serve a static docs and changelog search index`

## D. 프리미티브 (`components/ui/` — 화면보다 먼저)

- [ ] **D1** `Kbd` + 스위처의 손 `<kbd>` 이관.
  — 검증: `project-switcher.test.tsx` 무수정 green · 소스 스캔 테스트: `components/ui/` 밖 `<kbd` 0 · `pnpm test` green.
- [ ] **D2** `Highlight` + `/projects` 손 `<mark>` 이관(조각은 `highlightName` 그대로).
  — 검증: `projects-*` 테스트 무수정 green · 소스 스캔: `ui/` 밖 `<mark` 0 · `pnpm test` green.
- [ ] **D3** `FieldButton` — 캡슐 · 32 · `w-80` · 슬롯 셋 · 포커스 링 리터럴.
  — 검증: `focus-ring.test.ts` green(새 파일이 링을 든다) · `label-weight`·`visual-system` 테스트 green · jsdom: `shortcut` 슬롯이 비어도 자리 폭 유지 · `pnpm test` green.
- [ ] **D4** `CommandDialog`(`dialog.tsx` 형제 export — 복귀 기록 공유, `DialogContent` 불변).
  — 검증: 기존 Dialog 소비자 테스트 무수정 green · jsdom: 열면 포커스가 `[data-command-input]` · 닫으면 연 자리로(fixup observer — POSTMORTEM 2026-09-20) · `pnpm test` green.
- [ ] **D5** `Command` · `CommandInput` · `CommandList` · `CommandGroup` · `CommandItem` · `CommandStatus`.
  — 검증: jsdom — ARIA 역할·속성(`combobox`·`aria-expanded`·`aria-controls`·`aria-activedescendant`·`listbox`·`group`+`aria-labelledby`·`option`+`aria-selected`) · ↑↓ 순환 · Enter가 활성 항목 `onSelect` · 조합 중 Enter 무시 · hover가 활성을 옮기고 `document.activeElement`는 입력 · 항목에 `tabIndex` 없음 · `CommandStatus`가 `aria-live` · `pnpm test` green.
- [ ] **D6** `components/shell/header-bar.tsx` `HeaderBar` + 앱 셸·공개 셸 헤더 이관(가운데 슬롯은 아직 비움).
  — 검증: `shell-layout`·공개 셸 헤더 테스트 무수정 green · 두 헤더가 `HeaderBar`를 쓰는지 소스 스캔 · `pnpm dev`에서 두 헤더 모양이 이관 전과 같다(수동).
- [ ] **D7** DESIGN §6.4·§6.5 프리미티브 행·헤더 규칙(이 커밋 묶음의 문서 짝 — 별도 커밋).

── 커밋: `feat(ui): add Kbd and Highlight primitives and move existing copies onto them`
── 커밋: `feat(ui): add FieldButton, CommandDialog and Command primitives`
── 커밋: `refactor(shell): share a three-slot HeaderBar between app and public headers`
── 커밋: `docs(DESIGN): register search primitives and the three-slot header`

## E. 화면 조립

- [ ] **E1** `messages/en.tsx` `search` 절(트리거 라벨·placeholder·그룹 제목 다섯·안내 둘·로딩·실패 셋·0건 제목/설명·`Clear`).
  — 검증: `no-korean-ui` · `brand-spelling` · `terminology` green · placeholder는 U+2026, 접근 이름엔 없음.
- [ ] **E2** `components/search/search-trigger.tsx` · `search-dialog.tsx` — 프리미티브 조립만. 앱 셸 `layout.tsx`가 사이드바와 같은 `toNavProjects` 결과를 Header에도 넘긴다, 공개 셸 헤더는 `account`만 넘기고 Dialog가 로그인일 때 첫 열기에 `loadSearchMembershipsAction`을 부른다.
  — 검증: jsdom — 공개 셸 로그인 첫 열기에 멤버십 Action 1회 · 두 번째 열기 0회 · 비로그인 0회 · 공개 셸 로그인에서 Projects·Keys가 선다 · 빈 질의 = 최근 검색어/안내 · 입력 → Projects·Pages 즉시 · Keys는 2자 이상 250ms 뒤 한 번(가짜 타이머) · 늦은 응답이 새 질의를 안 덮는다 · 색인 로딩·실패·`changelog: null` 각 한 줄 · 0건 `EmptyState` · 선택 시 최근 검색어 저장 · 다른 Dialog가 열려 있으면 ⌘K 무시 · 소스 스캔: `components/search/*`에 raw 태그·hex·`[Npx]` 0(spec 16a) · `client-graph` green · `pnpm gate` green.

── 커밋: `feat(search): add the global search trigger and dialog to both shells`

## F. 문서 (문서별 별도 커밋)

- [ ] **F1** `docs(PRODUCT)`: §4.1 글로벌 검색 · §7.7 changelog 비범위에서 "검색" 제거 · IA에 "검색은 라우트가 아니다" · 키 검색 범위(보관 제외)와 트라이그램 판정.
- [ ] **F2** `docs(DESIGN)`: §6.5 "검색 넣지 않는다" 뒤집기 경위 · §9.2 · 아이콘 표 · 검색 Dialog 절(D7에 안 들어간 화면 규칙).
- [ ] **F3** `docs(ARCHITECTURE)`: 인가 없는 진입점 목록에 `/api/search-index` · Keys 조회의 멤버십 조인(테넌트 경계) · 측정값.
- [ ] **F4** `docs(CLAUDE)`: 데이터 경로 표에 `/api/search-index` · `searchKeysAction` 행 → `pnpm sync:agents`로 미러 갱신.
- [ ] **F5** `docs(DIRECTORY)`: `lib/search/` · `components/search/` · `app/api/search-index/` · `components/shell/header-bar.tsx` · 새 `ui/` 파일.
- [ ] **F6** `/privacy` 본문(최근 검색어 — 이 브라우저에만, 5개, `Clear`로 지움, 서버로 안 감 / Keys 질의는 서버가 기록하지 않음) + 개정 이력 · 시행일.
  — 검증: `policy-gate.test.tsx` green.
- [ ] **F7** `README.md` 기능 목록 한 줄 · 가이드 영향 플래그 → `/guide` 판정.

## G. 실물 검증 (`/runtime-test`, 로컬)

- [ ] **G1** 두 셸에서 캡슐이 뷰포트 가로 중앙(좌우 오프셋 차 ≤ 1px — computed rect) · ⌘K/Ctrl+K · 한글 조합 중 Enter·Esc · 결과 클릭·Enter 이동 · `/docs/x` → `/docs/x#y` 같은 페이지 해시 착지 · `/changelog#v<x.y.z>` 착지 · Keys 결과 → 번역 화면 선택 키 · 닫힘 포커스 복귀 · 사생활 창(저장소 차단)에서 검색 정상 · 로그인 상태로 `/docs`에서 열면 Projects·Keys가 서고 로그아웃 상태면 Docs·Changelog·하단 메뉴만.
  — 검증: BugShot 이슈 0 또는 이슈 링크 목록.
