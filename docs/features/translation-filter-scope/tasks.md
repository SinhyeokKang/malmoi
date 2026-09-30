# translation-filter-scope — tasks

순서: 순수 함수 → SQL 껍데기 → 페이지 → UI → 문서. `[commit]`은 커밋 경계다.

## A. URL 계약 (순수)

- **T1** `lib/translations/query.ts` — 기본 `scope: "project"`(DEFAULT·parse 폴백·serialize 생략·`clearFilters`), `treeQuery`가 조건 축을 보존,
  신규 `isNarrowed`·`hasConditions`. 테스트: `lib/translations/__tests__/query.test.ts` 갱신(왕복·옛 링크 `scope` 없음 → project · `scope=source` 보존 ·
  treeQuery가 `q`·`state`·`completion`·`scope`를 안 건드림).
  검증: `pnpm exec vitest run lib/translations` green.
- **T2** `emptyAction` 순수 판정 + `narrowTree` + `firstRowAt`. 테스트 먼저(0 노드 숨김 · 숫자 교체 · `projectKeyCount` 불변 · `null`이면 원본).
  검증: 해당 테스트 green. `[commit] feat(translations): default the scope to all sources and keep filters on tree moves` (T1–T2)

## B. 조회 (SQL 껍데기)

- **T3** `lib/keys/translation-list.ts` — `filtered` CTE 조립을 함수로 분리(동작 불변 리팩터). 검증: `pnpm test:projects:postgres`의
  `translation-list.integration.ts` 기존 케이스 그대로 green.
- **T4** `loadTranslationTreeCounts` + `loadTranslationList`의 `pageSize: "all"`. 통합 테스트 먼저:
  - 카운트 합이 목록 `matchedKeyCount`와 같다(같은 조건) · 다른 테넌트 0
  - `"all"`이면 `rows.length === matchedKeyCount`이고 `nextCursor === null` · 숫자 `pageSize`와 cursor는 기존대로(MCP 계약)
  검증: `pnpm test:projects:postgres` green. `[commit] feat(translations): tree counts and full list over the shared filtered set`

## C. 페이지·화면

- **T5a** More 제거 — `loadMoreTranslationKeys`·`lib/keys/load-more.ts`·`workspace.tsx`의 More 상태·`KeyList`의 More props·문구 `w.more`/`w.moreFailed`·
  관련 테스트. `mergeServerRows` 주석을 savedOut 보존으로 고친다. 검증: `pnpm typecheck` + `pnpm test` green,
  `grep -rn "loadMoreTranslationKeys\|moreFailed" app components lib messages` 0건.

- **T5** `page.tsx` — `hasConditions`면 카운트를 병렬 조회해 `narrowTree`, 목록은 `pageSize: "all"`, `@first`는 `firstRowAt`으로 푼다. 검증: `components/__tests__/translations-screen.test.ts`·`app/(edit)/projects/[slug]/translations/__tests__/landing.test.tsx`에 트리 이동 대상(rank 0 우선) · 선택 키 케이스 추가 후 green.
- **T6** `workspace.tsx` — `isNarrowed`로 교체, 트리 강조 = 위치, `showSource` 조건, 빈 상태 `emptyAction`(`Search all sources` 배선),
  선택 행 `scrollIntoView`. `translationLinkFor`·`copyHref`에서 `scope: "namespace"` 제거.
  검증: `pnpm test` green(`no-korean-ui` 포함) + POSTMORTEM 2026-09-15 grep
  `grep -rn "state:" app components --include='*.tsx' | grep -v __tests__ | grep "routes\."` 결과가 여전히 `ns`를 싣는다.
  `[commit] feat(translations): tree moves jump within the list and filters narrow the tree`
- **T7** `pnpm gate` green → `/runtime-test`(로컬, 소스 3개 fixture): spec 완료 조건 1–9·11을 실물로. 특히 C 값 검색(조건 2), 트리 클릭 후 URL
  (조건 3), 100번째 이후 네임스페이스로 이동(조건 4 — 스크롤), 배지 수 = 행 수 · More 없음(조건 11), 필터 켜고 트리 숨김(조건 5).

## D. 성능·문서

- **T8** `translation-list-performance.integration.ts`로 기본 착지(project) 재측정 + 전량 응답 크기·렌더 시간·Save 재검증 시간 → ARCHITECTURE §1.96에 기록(spec 조건 10).
  `[commit] docs(ARCHITECTURE): measure the all-sources default landing`
- **T9** PRODUCT §3 개정(승인 결정 반전 — 2026-09-30 사용자) `[commit] docs(PRODUCT): …` · DESIGN §6.1a `[commit] docs(DESIGN): …` ·
  CLAUDE.md 데이터 변경 경로 표의 `loadMoreTranslationKeys` 삭제 + `pnpm sync:agents` `[commit] docs(CLAUDE): …`
- **T10** `/guide`로 `guide/translate/edit.md` Scope 문단 갱신(스크린샷 영향은 `pnpm guide:check`).
- **T11** 기능 종료 시 `docs/features/translation-filter-scope/` 삭제.
