# inbox-filter-search — tasks

> 착수 조건: language-request-todo의 T4(`InboxItem` union에 `language_unsent` — `lib/inbox/plan.ts`)와 T7(`components/inbox/row-slots.tsx` 렌더)이 dev에 들어간 뒤. T1 테스트가 `language_unsent`를 참조하므로 T4 전에는 컴파일되지 않는다. 순서: 순수 판정 → 프리미티브 이관 → 사전 → 화면 → 확인 → 정본. 커밋 경계는 `──`. 커밋마다 `pnpm gate` green(출력을 파이프로 거르지 않는다). 병렬 게이트에서 search-performance 300ms 판정만 red면 단독으로 다시 돌려 확인한 뒤에만 push한다.

## 1. 순수 판정
- [ ] **T1a — `lib/query-list.ts`** — `lib/events/filter.ts`의 `list()`·`text()`·`encodeList`·`MAX_TEXT`·`MAX_ITEMS`를 글자 그대로 옮기고 events가 import한다(design §1).
  - 검증(자동): 기존 `lib/events/__tests__/*filter*` 수정 없이 green · `client-graph.test.ts` — `CLIENT_LIB_FILES`에 `lib/query-list.ts` 한 줄 등재(정확 일치 검사, 완화 금지).
- [ ] **T1b — `lib/inbox/filter.ts`** — `INBOX_KIND_FILTERS` · `inboxKindOf` · `parseInboxFilter` · `inboxQuery` · `inboxFilterOptions` · `effectiveInboxFilter` · `hasNarrowing` · `filterInbox`(design §1–§4). `plan.ts`는 `import type`만.
  - 검증(자동): `lib/inbox/__tests__/filter.test.ts` — 최소 행:
    - 파서: `?kind=` 배열(첫 값) · 알 수 없는 값 · `__proto__`·`constructor` → `null` / `?project=` 중복·빈 항목·정렬·50개 상한 · 대소문자 구별 / `q` 공백만 → `null` · 201자 → 200자 · 내부 공백 정규화 / `inboxQuery` 왕복.
    - `inboxKindOf`: `INBOX_KIND_FILTERS`가 아니라 **항목 fixture 일곱 종류 + 일부 반영**을 순회해 기대 값을 단언한다(손으로 쓴 kind 목록이 낡지 않게 — exhaustive는 `never` 검사가 typecheck로 강제).
    - 실효 필터: 계획에 없는 slug·종류 제거 → `hasNarrowing` false(`?project=gone` · `?kind=setup`인데 계획에 setup 없음).
    - `filterInbox`: 축마다 · 조합 · 같은 프로젝트의 `unsent`+`language_unsent`가 `publish`로 **둘 다** 남음 · 실패/일부 반영 분리 · 빈 묶음 제거 · 묶음·항목 순서 불변 · `unread` 재계산 · 빈 계획.
    - 검색: 질의·대상 양쪽 공백 정규화 · 대소문자 · `code` 일치(`ja`) · `Locale.name` 일치 · `import_failed`는 사전 문장이 아니라 `surfaceSlug` · `language_unsent`는 `ja`에 걸리지 않음 · `needs_reconnect`·`setup`은 프로젝트 이름으로만.
  - `client-graph.test.ts` — `CLIENT_LIB_FILES`에 `lib/inbox/filter.ts` 한 줄 등재 · inbox/plan 그래프(`:676-682`) 불변.

──

## 2. 프리미티브 이관
- [ ] **T2 — `components/ui/filter-menu.tsx`** — Logs 지역 `Filter`와 번역 화면 `FilterMenu` 껍데기를 하나로(design §7). 번역 화면은 `OptionsFilterMenu` 래퍼로 바꾸고 호출부 이름을 고친다. 트리거를 감싸는 요소를 두지 않는다.
  - 검증(자동) — 갱신이 필요한 테스트: `components/__tests__/visual-system.test.ts:300-308`(소스 문자열 검사 대상 경로를 새 프리미티브로) · `components/__tests__/hand-copies.test.ts:154`(FieldTrigger 규칙 `paths`). 그 밖은 **수정 없이 green**: Logs `logs-trigger` · `logs-custom-range` · `logs-removed-source` · `logs-stale-event` · `logs-refresh-pending` · `logs-events` · `loading-parity`(행 직속 버튼 5개) · `responsive-activity` · 번역 필터 테스트 · `parallel-p3-search-filter-consumers.test.tsx`.
  - 같은 커밋: 프리미티브 모듈 54 → 55 — `CLAUDE.md` 스택 표(PostToolUse 훅이 `AGENTS.md` 미러 재생성) · `docs/DESIGN.md` §6.4 모듈 서수 · `docs/DIRECTORY.md`. 숫자를 세는 테스트는 없어 손으로 맞춘다.

──

## 3. 사전
- [ ] **T3 — `inbox.filters.*` · `inbox.search.*` · `inbox.noMatch.*`** — 종류 라벨은 design §2 표의 en 낱말(출처 키 재사용 여부는 여기서 정한다) · 새 키 `All items` · `Any project` · `Clear projects` · noMatch 제목 둘(`No items match these filters` · `No items match "{q}"`) · 검색 placeholder. 세 사전 같은 커밋(`/translate` 모드 ①).
  - 검증(자동): `dictionary-consistency` · `terminology` green · 함수 값 키(이름 목록 트리거·`noMatch(q)`)는 `lib/i18n/__tests__/helpers/function-args.ts` `FUNCTION_ARGS` 행 · ko·es가 en과 같은 값이면 `SAME_AS_EN` 등재. 미사용 키 검사는 없어 단독 커밋이 red를 내지 않는다.

──

## 4. 화면
- [ ] **T4 — 필터 줄 + 페이지 배선 + 골격** (`components/inbox/inbox-filters.tsx` · `app/(edit)/inbox/page.tsx` · `app/(edit)/inbox/loading.tsx` · `lib/routes.ts` · `components/inbox/inbox-list.tsx`).
  - 검증(자동, DOM — user-event를 쓰는 새 파일은 머리에 `vi.setConfig({ testTimeout: 20_000 })`):
    - 필터 둘 + Clear(실효 좁힘 있을 때만) + SearchInput이 `PanelHeader` 안에 · 계획이 비어도 필터 줄이 선다 · 프로젝트 메뉴 `menuitemcheckbox`(썸네일 + 이름) · 종류 선택지는 계획에 있는 값만 · 고르면 `router.push`가 `routes.inbox(inboxQuery(…))`로 불린다.
    - 좁힌 결과 0이면 `NoMatch`(card) + `Clear filters`, 원래 0이면 `Nothing needs you`.
    - `app/(edit)/inbox/__tests__/page.test.tsx` — 기존 6건(`:51-90`)을 새 시그니처(`{ searchParams: Promise<…> }`)로 갱신 · 좁힘이 있어도 `MarkSeen`이 조회 전 ISO로 1회 · `:85` 골격 단언 갱신.
    - `components/__tests__/inbox-page-scenario.test.tsx` — 좁힌 페이지도 헤더·사이드바 배지를 끈다 · 필터를 바꾼 재렌더에서 이번 방문의 점이 사라진다(spec 완료 조건 8 고정).
    - `loading-parity.test.tsx` — Inbox 골격 ↔ 실물 필터 줄 대조 en/ko/es(기본 라벨 · 검색 320 · 비축소).
    - `app/__tests__/entry-points.test.ts` — `EXTRA_EMITTERS`(`:729-756`)에 `components/inbox/inbox-filters.tsx` 등재 · `routes.inbox`가 `withQuery` 형이라 `routeShapes`(`:697-702`)가 읽는다.
    - 소스 단언 — `lib/inbox/plan.ts`·`lib/inbox/load.ts`·`components/shell/attention-inbox.tsx`가 `filterInbox`를 import하지 않는다(완료 조건 7).
    - 헤더 드롭다운·배지 기존 테스트 green.

──

## 5. 확인 · 정본
- [ ] **T5 — 런타임 확인**(`/runtime-test`, 로컬 — 수동):
  - fixture: dev DB 상주 프로젝트(`bugshot-i18n-test-qa` 등, `/runtime-test` §7.1 — 지우지 않는다)에서 한 OWNER 사용자의 Inbox에 검토 대기 셀 · 빈 언어 · 미발송 편집 · 언어 추가 미발행(`language_unsent`) · 동기화 실패를 세운다. 긴 이름 프로젝트(umt 쌍)를 프로젝트 메뉴에 포함한다. 끝나면 만든 상태를 원복하고 원복 목록을 리포트에 남긴다.
  - 축마다·조합 · 뒤로 가기 · 새로고침 · 좁힌 URL 새 탭 · 375 감김 · 긴 이름 트리거 truncate(375·1280).
  - 키보드: (a) 단일 선택 뒤 포커스가 트리거로 (b) 체크박스를 켠 채 push돼도 메뉴가 열린 채 다음 항목 (c) 검색 Enter 뒤 입력 칸 유지 (d) Clear filters `busy` 중 포커스 유지 · Esc 복귀 · 검색어 변경 중 `loading.tsx`가 떠서 필터 줄이 재마운트되는지 한 번 관찰.
  - 실측: 골격 → 실물 필터 줄 높이 차 0px, en/ko/es × 375/1280/1440 × light/dark(POSTMORTEM #201·#202 — jsdom 통과를 대신 치지 않는다).
- [ ] **T6 — 정본**(문서별 커밋): PRODUCT "Attention inbox"(페이지 필터·검색 · "이번 방문의 점" 문장에 필터 이동 단서) · DESIGN §6.545(Inbox 페이지 필터 줄 · 필터 이동 = 새 방문) · §6.4(`FilterMenu` 프리미티브 — 소비자 Logs·번역 화면·Inbox, `DropdownMenuCheckboxItem` 소비자 문장도 고친다) · DIRECTORY(`lib/query-list.ts` · `lib/inbox/filter.ts` · `components/ui/filter-menu.tsx` · `inbox-filters.tsx`) · 가이드 `guide/{en,ko,es}/translate/edit.md#inbox` 본문은 `/guide`, `inbox-page.webp`는 `/guide-shots`로 **머지 전 로컬에서** 다시 찍는다. 그 뒤 이 디렉터리를 지운다.
  - 검증: `/push` 4단계 문서 신선도 · `pnpm guide:check --json` stale 0.
