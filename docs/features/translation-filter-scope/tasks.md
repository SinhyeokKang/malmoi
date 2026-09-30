# translation-filter-scope — tasks

순서: 순수 함수 → SQL 껍데기 → 페이지 → **측정 게이트** → More 제거 → UI → 문서. `[commit]`은 커밋 경계이고 **경계마다 `pnpm gate` green**이다
(`--base <직전 커밋>`). 라벨: **[자동]** `pnpm test`·`pnpm test:projects:postgres`·`pnpm typecheck`로 판정 · **[수동]** 사람이 브라우저로 판정(e2e 없음).
조건 번호는 spec 완료 조건이다.

## A. URL 계약 (순수)

- **T1** `lib/translations/query.ts` — 기본 `scope: "project"`(DEFAULT·parse 폴백·serialize 생략·`clearFilters`), `treeQuery`가 조건 축을 보존,
  신규 `isNarrowed`·`hasConditions`. 테스트 `lib/translations/__tests__/query.test.ts` 갱신:
  왕복 · 옛 링크 `scope` 없음 → project · `scope=source`·`namespace` 보존(조건 8) · treeQuery가 `q`·`state`·`completion`·`scope`를 안 건드림(조건 3) ·
  `scope=namespace`에서 treeQuery는 `ns`만 바꿈 · `clearFilters` → project(조건 7) · `isNarrowed`·`hasConditions` 진리표.
  **기본값이 바뀌어 깨지는 기존 테스트를 같은 태스크에서 고친다**: `components/__tests__/home-translation-links.test.tsx:17-24`(href에서 `scope=project` 빠짐) ·
  `lib/keys/__tests__/translation-list.integration.ts:144`(`q({})` oracle이 This source → 명시 `scope: "source"`로) · `components/__tests__/helpers/workspace-props.ts:8`.
  MCP: `lib/mcp` 테스트에 "`scope` 없는 `list_keys` → 전 활성 소스"(조건 13) 추가, 도구 설명 `messages/en.tsx:3365` 갱신.
  ⚠️ 과도 상태: T7 전까지 Scope `on`(:630)이 리터럴 `"source"`라 최초 진입에서 Scope 칩이 켜져 보이고 `showSource`가 선다 — dev에 나가지 않는다(push는 T7 뒤).
  검증 [자동]: `pnpm gate` green(통합 스위트는 `lib/translations`가 gate 트리거가 아니므로 `pnpm test:projects:postgres`를 **손으로** 한 번 더 돈다).
- **T2** 신규 `lib/translations/tree-narrow.ts`(`countRows`·`narrowTree`) · `emptyActions` · `firstRowAt` — 테스트 먼저, 파일은 `lib/translations/__tests__/`.
  - `narrowTree`: `null`이면 원본 · 0 노드 숨김 · 숫자 교체 · `projectKeyCount` 불변 · 위치 노드는 0이어도 남음 · `keep`에 있는 0 노드는 남음(세대 고정).
  - `countRows`: 빈 rows · 소스·네임스페이스별 합 = rows.length.
  - `emptyActions`: design §2.3 표의 네 행 전부 + `search-all`이 scope만 바꾼 쿼리를 낸다(조건 9).
  - `firstRowAt`: 빈 rows · 해당 위치 없음 → `undefined` · `ns=ALL_NAMESPACES`면 그 소스의 첫 행 · rank 0 블록의 행이 뒤쪽 같은 ns 행보다 먼저.
  검증 [자동]: `pnpm exec vitest run lib/translations` green.
  `[commit] feat(translations): default the scope to all sources and keep filters on tree moves` (T1–T2) — `pnpm gate` green.

## B. 조회 (SQL 껍데기)

- **T3** `lib/keys/translation-list.ts` — `pageSize: "all"`(LIMIT 없음, SQL count 생략 → `matchedKeyCount = rows.length`) + `matchesFor`의 `DISTINCT ON (t."keyId")`.
  통합 테스트 먼저(`translation-list.integration.ts`):
  - `"all"`이면 `rows.length === matchedKeyCount` · `nextCursor === null` · `incomplete`·`selectedInResult`가 숫자 `pageSize` 경로의 값과 같다(조건 5).
  - 숫자 `pageSize`와 cursor는 기존대로(MCP 계약).
  - `"all"` + 다른 테넌트 fixture → 0 · orphaned 키·보관 표면 → 0 · `scope=source`·`namespace`에서 경로 밖 소스 0 ·
    `completion: "missing"` + 그 로케일 없는 소스(`effectiveCompletion` 제외) → 행 없음 · 0키 프로젝트(`surfaceIds.length===0` 조기 반환).
  - `translation-list-performance.integration.ts`: `"all"`과 검색 + `"all"`의 bounded-scan 케이스 추가(`matchesFor`가 키당 1행). 쿼리 수 단언
    (`toHaveLength(2)`)을 `"all"` 경로에 맞게 고친다.
  검증 [자동]: `pnpm test:projects:postgres` green.
  `[commit] feat(translations): load the full filtered list in one query`

## C. 페이지 · 측정 게이트

- **T4** `page.tsx` — 목록은 `pageSize: "all"`, `@first`는 `firstRowAt`으로 푼다. `KeyList`·행 `memo` + `onSelect` 안정화(design §3.1).
  이 시점엔 `nextCursor`가 늘 `null`이라 More 버튼이 서지 않고, More 코드는 죽은 채 남는다(T6이 지운다).
  테스트: `app/(edit)/projects/[slug]/translations/__tests__/landing.test.tsx`(surfaces page를 import한다, `:34`)의 `@first` 블록(`:102,:115`)에
  트리 이동 대상(rank 0 우선) · 대상 없음 → 선택 없음 · 옛 `?cursor=` redirect 유지(`:94`) 케이스 추가.
  검증 [자동]: `pnpm gate` green. `[commit] feat(translations): land tree moves on the first key of the location`
- **T5** **측정 게이트** — design §3.3. `.scratch/` 시드로 dev DB에 폐기용 대량 프로젝트(2,000·5,000키, 소스 셋)를 만들고
  (⚠️ dev OWNER가 프로젝트 한도에 걸려 있으면 어느 프로젝트를 쓸지 사용자에게 묻는다) 로컬 `pnpm build && pnpm start`로 잰다.
  20,000키×200언어 DB 시간·응답 바이트는 `.scratch/` 스크립트로 기록(3회 중앙값).
  검증 [수동]: design §3.3 표 네 지표가 전부 한계선 안(조건 11). **미달이면 여기서 멈추고 사용자에게 올린다** — T6 이후를 진행하지 않는다.
  수치는 T10에서 §1.95에 적는다.

## D. More 제거 · 화면

- **T6** More 제거 — design §3.1 목록 전부. 순서: ① `MoreInput` → `lib/mcp/tools/keys.ts`의 `ListKeysInput`으로 이전 ② `mergeServerRows`에서 `membership` 인자와
  `cursor`·`extended` 분기 제거, `saved-rows.test.ts`에 "전체 목록 재검증: 빠진 비선택 행 → savedOut" 케이스 추가, `translation-workspace-sync.test.tsx:119,170` 갱신
  ③ Action·`load-more.ts`·`translation-more.test.ts`·`entry-points.test.ts:159`·transition 테스트의 More mock과 케이스·`KeyList` props·문구·주석 삭제.
  검증 [자동]: `pnpm gate` green +
  `grep -rn "loadMoreTranslationKeys\|loadMoreKeys\|load-more\|moreFailed\|moreLoading\|onMore" app components lib messages` 0건 +
  `rg -n 'mergeServerRows|inFlight.sent|state.order|beforeunload' lib/translations components/translations` 결과를 읽고 부분 응답 전제가 남은 소비자가 없음을 보고에 적는다.
  `[commit] refactor(translations): drop the more-keys action now that the list loads in full`
- **T7** `workspace.tsx`·`tree-panel.tsx`·`key-list.tsx` — `isNarrowed`로 교체, Scope `on`(:630) = `scope !== "project"`, 트리 강조 = 위치(패널 + 오버레이 :684),
  `showSource`·머리 배지·`Filter namespaces` 임계 = 원본 트리, `narrowTree`를 `TreePanel` prop에만(세대별 `keep` 누적), 빈 상태 `emptyActions`
  (`Search all sources` 배선 · `busy` · 성공 뒤 목록 제목으로 포커스), 선택 행 스크롤(마운트 + 트리 이동), `translationLinkFor`·`copyHref`에서 `scope: "namespace"` 제거.
  DOM 테스트(`components/__tests__/translation-workspace*.test.tsx`)를 이름으로 건다:
  - 단일 소스 프로젝트 → `surface · key` 접두 없음 / 다중 소스 + 필터로 소스 1개 남음 → 접두 유지.
  - 최초 진입 Scope 트리거 `on=false`(조건 1의 자동 부분) · 트리 강조 = `view.query.ns`.
  - `Search all sources` 클릭 → 주소의 scope만 바뀜(조건 9) · 대기 중 `busy` · 성공 뒤 포커스가 `body`가 아님.
  - 조건 켬 → 0 노드 숨김, 위치 노드는 흐린 행 · Save 재검증으로 0이 된 노드가 같은 세대에서 남음(조건 6).
  - `Filter namespaces`에 입력한 뒤 조건이 트리를 13개 미만으로 줄여도 입력이 남음.
  - 트리 클릭 + 미저장 draft → leave guard가 먼저 서고 취소 시 `scrollIntoView` spy 미호출 · 트리 이동 → spy 호출 · 목록 직접 클릭 → 미호출.
  - 대기 중 `@first` `replaceState` 미호출.
  - 링크 모양: `translationLinkFor`(Logs·Home)·`copyHref`에 `scope=` 없음(조건 10) — `translation-list.integration.ts:291`의 `scope=namespace` 기대값 갱신.
  - **state 링크 전수 테스트**(POSTMORTEM 2026-09-15 grep 대체): `cardQuery`·`attention-card.tsx:125`·레거시 redirect가 만드는 `state=` 주소가 전부 `ns=*`를 싣는다.
  검증 [자동]: `pnpm gate` green(`no-korean-ui` 포함).
  `[commit] feat(translations): tree is a location and filters narrow it`
- **T8** 목록 roving tabindex — Tab 정지점 하나(선택 행, 없으면 첫 행), ↑/↓·Home/End 포커스 이동, Enter·Space 선택. 포커스가 `body`로 빠지지 않음
  (선택 행이 목록에서 사라질 때 포함). DOM 테스트 `components/__tests__/translation-workspace*.test.tsx`에 추가.
  검증 [자동]: `pnpm gate` green(조건 12). `[commit] feat(translations): arrow-key navigation in the key list`
- **T9** `/runtime-test`(로컬, 소스 셋 fixture) — **[수동]**: 조건 1(목록에 세 소스) · 2(A 경로에서 C 값 검색, A가 흐린 0) · 4(트리 클릭 후 첫 키 선택과
  **실제 스크롤** — jsdom은 no-op이다, 딥링크·새로고침 착지 스크롤) · 5(배지 = 행 수, More 없음) · 6(필터 켜고 트리 숨김, Save 뒤 노드 유지) ·
  12(키보드로 목록 → 상세). 검증: runtime-test 리포트에 조건별 pass/fail, 결함은 이슈.

## E. 문서

- **T10** ARCHITECTURE §1.95(T5 수치 행 + 전제 변경) · §1.96(`PAGE_SIZE`·cursor는 MCP 전용, `loadMoreTranslationKeys` 단락 `:624` 삭제, `"all"`의 count 생략) ·
  §6.45(`list_keys` 기본 범위) `[commit] docs(ARCHITECTURE): …` · PRODUCT §3 개정(승인 결정 반전 — 2026-09-30 사용자, :635·:781 삭제) `[commit] docs(PRODUCT): …` ·
  DESIGN §6.1a(design §10 항목) `[commit] docs(DESIGN): …` · DIRECTORY.md:61 `[commit] docs(DIRECTORY): …` ·
  CLAUDE.md 데이터 변경 경로 표의 `loadMoreTranslationKeys` 삭제 + `pnpm sync:agents` `[commit] docs(CLAUDE): …`.
  검증 [자동]: `pnpm sync:agents:check` green + `grep -rn "loadMoreTranslationKeys\|Show more keys\|More는 클라이언트" docs CLAUDE.md` 0건.
- **T11** `/guide`로 `guide/translate/edit.md` Scope 문단 갱신(기본 All sources · 트리 = 위치 · `This namespace` = 위치의 네임스페이스).
  검증 [자동]: `pnpm test` green + `pnpm guide:check` 출력 인용(스크린샷 stale 후보는 `/guide-shots` 플래그).
- **T12** 기능 종료 시 `docs/features/translation-filter-scope/` 삭제.
  검증: PRODUCT §3 · DESIGN §6.1a · ARCHITECTURE §1.95·§1.96·§6.45에 결론이 올라간 것을 확인한 뒤 디렉터리 부재(`ls docs/features/translation-filter-scope` 실패).
