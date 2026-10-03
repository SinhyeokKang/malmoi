# search-ux-unify — 태스크

**선행 게이트는 T0(디자인 정본)이다** — 승인 전에는 T1 이후를 시작하지 않는다(2026-10-03 사용자).
배치 둘로 나눠 ship한다(D12): **배치 1 검색 UX(T1~T7)** → **배치 2 오버레이 술어(T8~T10)** → 문서·검증(T11~T15). 순서는 배치마다 순수 함수 → 프리미티브 → 소비처다.

**커밋 경계 규칙**: 모든 `[commit]` 경계에서 `pnpm typecheck && pnpm test`가 green이다(C29). 그래서 소비처 교체는 그 소비처를 깨는 변경과 같은 커밋에 들어가고, 손 사본 0 불변식은 마지막 사본을 걷는 태스크에 들어간다. 새 `lib/` 파일이 클라이언트 그래프에 닿는 커밋은 `components/__tests__/client-graph.test.ts`의 `CLIENT_LIB_FILES`(:96-211)와 import-0 잎 목록(:491-499)을 같이 갱신한다.

**수동 검증 표기**: "수동"은 `/runtime-test`(로컬, ego-browser — computed style·CDP)로 하고 T13에서 모아 돈다. e2e 프레임워크는 없다. 각 태스크의 "검증:"에서 자동(테스트)과 수동을 갈라 적는다.

## 0. 디자인 정본

- **T0. 디자인 정본 확정** — ✅ 2026-10-03 (Claude Design [`Search UX.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Search+UX.dc.html) 승인, `design.md` 반영)
  - `design-prompt.md`로 Claude Design 시안을 받는다.
  - 시안의 시각 값(여백·행 높이·칩·타일 배치·모바일 폭)을 `design.md` "시각 값의 정본 — T0"과 `Command*` 표에 반영한다. 고정 제약(D6·D13·D14·C15~C17·C19)과 다르면 시안이 아니라 제약이 이긴다 — 충돌은 사용자에게 묻는다.
  - 검증(수동): `design.md`의 "초안" 표기 0, 승인 날짜 기록.
  - `[commit] docs(feature): search-ux-unify design canon`

## 배치 1 — 검색 UX

- **T1. `lib/keyboard.ts` + 단축키 한 표기 (C11·C12 일부)**
  - 테스트 먼저(`lib/__tests__/keyboard.test.ts`): `searchShortcut(null)` → `label`·`aria` null, `matches`는 동작 / mac·win의 `label`·`aria`·`matches` 표 / `isImeComposing`(`isComposing`·`keyCode 229`·둘 다 없음) / `isPlainPrimaryClick`(수식키 넷·가운데 버튼·`button !== 0`).
  - `lib/search/keys.ts`의 `isSearchShortcut`을 삭제하고 그 테스트를 `searchShortcut().matches`로 옮긴다(`keys.ts`는 import 0 유지).
  - `messages/en.tsx`에 `common.keys`를 추가한다. `search-trigger.tsx`가 `searchShortcut`을 쓰고 칩을 `m.common.keys.search[label]`로 그린다.
  - `keyboard.ts`를 `CLIENT_LIB_FILES`와 import-0 잎 목록에 등재한다.
  - 검증: `keyboard.test.ts` green, `client-graph.test.ts` green, `field-button.test.tsx:27,41`(리터럴 `⌘K`·`Ctrl K`)이 사전 값으로 갱신돼 green, `global-search.test.tsx:66`(서버 마크업에 `⌘K` 없음) green.
  - `[commit] feat(keyboard): centralize platform, IME and plain-click predicates`
- **T2. 이름 대조 통일 (D1) + 공유 상수**
  - `lib/search/match.ts`에 `matchesAllTokens`·`KEY_QUERY_MIN`·`SEARCH_GROUP_LIMIT`를 둔다(정의만 — import 0 유지). `searchProjects`·`switcherProjects`가 `matchesAllTokens`를 쓴다. `lib/keys/search.ts`가 두 상수를 import해 `:10`·`:32-34`·`:60-61`·`:95`의 리터럴을 바꾼다.
  - `highlightName`을 걷고 `/projects`는 `highlightSegments`로 칠한다. `list.test.ts:656-662`를 합쳐진 조각 기대값으로 고쳐 `highlight.test.ts`로 옮기고 `İabc`/`i`를 더한다(design "과거 함정").
  - 교차 테스트를 신설한다: 같은 입력 표(`app web`, `  WEB `, `İabc`/`a`, `İİ`/`i`, 빈 질의, 공백만)를 세 대조 함수에 함께 돌린다.
  - 검증: 교차 테스트 green. `lib/projects/__tests__`·`lib/shell/__tests__`의 대조 테스트 갱신본 green. **`projects-screen.test.ts:518`**(`highlightName(row.name, q)` 소스 단언)을 `highlightSegments`로 갱신해 green. `lib/keys/__tests__` green.
  - `[commit] refactor(search): match project names by token AND on every screen`
- **T3. 검색 뷰모델 + Dialog 재조립 (C1~C4·C7·C8·C21·C22·C26)**
  - `lib/search/rows.ts`: `searchRows` → `{ groups, ids }`, `searchStatuses` → `{ pending, lines, failed }`, 지역 상수 `PREVIEW_LIMIT`·`SNIPPET_LENGTH`, 행 모델 `tile`·`archived`, 글리프는 nav key로(design "글리프 출처"). `match.ts:62,67`의 영어 리터럴·경로를 여기로 옮긴다.
  - `searchGroups`에 보관 tie-break(C8). `nav-index.ts`: 멤버십 없음 → 빈 Projects·Pages, footer는 `changelog`만(D8), `item.icon` 싣기. `load-memberships.ts`는 union을 반환한다.
  - 사전: `search.groups.pages`·`goToDocs`·`projectsUnavailable`·`sessionEnded`·실패 문장 개정 추가, `viewAllProjects`·`browseAllDocs`·`groups.menus`·`loadingProjects` 삭제(`m.notFound.action`·`projects.loading` 재사용).
  - `search-dialog.tsx`가 `searchRows`·`searchStatuses`만 그린다: 모든 행 28 타일(`ProjectThumbnail sm` / `IconTile sm`), `StatusBadge state="archived"`, 실패면 `NoMatch` 없음(`NoMatch`는 목록 슬롯 맨 위로 옮긴다 — 지금은 `CommandList` 뒤라 패널 바닥에 선다), Keys `unauthorized`/`unavailable` 구분, 하한 `KEY_QUERY_MIN`. (`CommandItem`의 `icon`은 아직 선택 prop이라 이 커밋에서 깨지지 않는다.)
  - `rows.ts`를 `CLIENT_LIB_FILES`에 등재하고 `nav-index.ts` 그래프 고정(`client-graph.test.ts:509-512`)을 갱신한다.
  - 테스트(`lib/search/__tests__/rows.test.ts`): `ids` 순서 = 렌더 행 순서 / 실패가 있으면 `failed` / `unauthorized` ↔ `unavailable` 문장 / 멤버십 없음 세 경우 그룹 = `["docs"]` / Projects 행에 맥락 하이라이트 없음 / 행 `tile.icon`이 `toBe(Box)`·`toBe(CircleHelp)`·`toBe(Languages)`·`toBe(Plus)` / `/docs` href 행 정확히 1.
    - 엣지: 공백만 질의 → 미리보기 / 1글자·서로게이트 쌍 1글자 → Keys 요청 없음(서버와 같은 판정) / `Q_MAX_LENGTH` 초과 절단 / Keys·Docs 동시 실패 → danger 줄 둘·`NoMatch` 없음·Projects·Pages 행 유지 / 로그인 + 멤버십 0 → Projects 그룹 없음, Pages·Docs 있음 / 보관 프로젝트만 / 멤버십 성공 + Keys만 `unauthorized` / 질의 `__proto__`·`constructor`.
  - 기존 테스트 갱신: `lib/search/__tests__/nav-index.test.ts:8,12` · `match.test.ts:38-47,44` · `load-memberships.test.ts:15`(`toBeNull` 셋) · `lib/keys/__tests__/search-ui.integration.ts:36` · `global-search.test.tsx` — `:34,37,39,41,45,169`(`Menus`·`View all projects`·`Browse all docs`·`Loading projects…` 리터럴), `:44`(익명 폴백 → 상태 줄 + Docs 전용), `:48`(실패 뒤 `No results` **보임 → 부재**로 뒤집기), Keys `unauthorized` 케이스 추가, **`:163`의 NavigationDim 도달 검증을 `/changelog`에서 Docs 행으로 옮겨 살린다**.
  - 검증: 위 테스트 green, typecheck green. 수동(T13): 비로그인 Dialog에 Docs 그룹 하나, 멤버십 실패 모의에서 상태 줄.
  - `[commit] fix(search): surface failures and render rows from a shared view model`
- **T4. `Kbd`·`FieldButton`·Esc 칩 (C12·C13·C14)**
  - `Kbd`: 회색 면 + `text-foreground/60`, `h-5`, `aria-hidden` 기본(D14).
  - `FieldButton`: `h-10`, hover `bg-primary-foreground`, `aria-expanded` + 트리거가 `open`을 넘긴다.
  - `command.tsx:129`의 `↵` → `m.common.keys.enter`. 스위처 `Esc` 칩 → `m.common.keys.esc`, `projectSwitcher.escHint` 삭제(소비처와 같은 커밋).
  - `hand-copies.test.ts`에 "`components/`의 `<Kbd>` children 문자열 리터럴 0"을 추가하고 `:72` good 픽스처(`<Kbd>Esc</Kbd>`)를 갱신한다. `:69-72`의 `minimum: 1`(ui 밖 소비처 ≥ 1)은 유지된다.
  - 검증: `highlight-kbd.test.tsx`(:15-17의 `border`·`border-border`·`py-0.5` → 면·`h-5`·`aria-hidden`), `field-button.test.tsx:18`(`h-9`·hover → `h-10`·`hover:bg-primary-foreground`), `project-switcher.test.tsx:58`(escHint) 갱신본 green. 수동(T13): 두 헤더에서 검색 캡슐 computed `height` 40.
  - `[commit] feat(ui): gray key chips, 40px field button and shared key labels`
- **T5. `Command*` = `ListRow` + 여백 체계 + 힌트 고정 (C15~C19)**
  - `CommandItem`이 `role="option"` 안에 `ListRow`(`variant="canvas"`·`className="text-sm hover:bg-transparent"`·`href`·`tabIndex -1`·`ref`·`selected`·`aria-current={false}`)를 그린다. `icon` 필수. 제목·설명 `block truncate`.
  - 승인된 시안 값대로(`design.md` `Command*` 표): 입력 줄 `h-12 pl-3 pr-4`(clearable · 갭 8 · Esc 칩), `CommandStatus` 묶음 `px-4 pt-2 gap-1` + `tone`, 목록 `py-2`, 그룹 세로 padding 0 + `not-first` 구분선, 머리 `pt-4 pb-1 text-gray-dim`.
  - `sm` 미만에서 `Go to ↵`·입력 Esc 칩 `hidden`.
  - `Go to ↵`는 `aside`에 늘 두고 비활성은 `invisible`.
  - 테스트 갱신·추가: `command.test.tsx`(option 안 `ListRow` 형 = `px-4 py-row-y` / 활성 = `bg-foreground/[0.07]` / `border-ring`·`rounded-md` 0 / **`:90`의 `kbd` 개수 1 → option 수**와 같고 비활성 `invisible` / `aria-current`가 `"true"`가 아님 / hover 면 없음 / 긴 제목이 `truncate`), `focus-ring.test.ts`(`LINK_FIXTURES` 정의 `:142-146` · ring 파일 집합 일치 `:236` — `command.tsx`가 ring 클래스를 잃으면 fixture에서도 뺀다 · 사용처 `:289-292`), `primitive-focus.test.tsx`. `hand-copies.test.ts`에 "`command.tsx`는 행 클래스를 직접 쓰지 않고 `ListRow`를 쓴다"를 추가한다.
  - 테스트 추가: 그룹 머리 `text-gray-dim` · 그룹 세로 padding 0 · 힌트·Esc 칩에 `hidden sm:` 클래스(폭 분기일 뿐 활성과 무관 — 활성 바꿔도 클래스 불변).
  - 검증: 위 테스트 green. 수동(T13): 375 폭에서 힌트·Esc 칩이 안 보이고, 1440에서 Esc 칩 오른쪽 끝 x = 행 `Go to ↵` 칩 오른쪽 끝 x. ↑↓로 처음부터 끝까지 이동할 때 각 option의 `getBoundingClientRect().height`·제목 `scrollWidth` 불변, 마우스를 한 행에 둔 채 ↓ → 칠해진 행 하나, 입력 글리프 중심 x = 타일 중심 x.
  - `[commit] refactor(ui): build Command rows on ListRow with a stable active row`
- **T6. 보관 배지 한 형 (C5·D6)**
  - `STATE.archived` = `soft-neutral` 확인. 스위처·`/projects`의 `text-gray-dim` 덮개를 걷는다(`px-2`·`shrink-0`만 남긴다).
  - `status-badge.test.tsx`의 "마지막 직접 상태 배지"는 지금 두 튜플(`publish-button`·`project-switcher`)을 도는 `it.each`(:50-63)다. **`components/**` 전수 스캔으로 새로 짠다**: `<StatusBadge`의 `className`(조건부·`cn(...)` 포함)에 색 클래스 0 — 동적 `state={CHIP_STATE[...]}`도 잡는다 / `m.projects.archived`·`m.projects.status.archived`를 `<Badge>`로 그리는 곳 0.
  - `project-switcher.test.tsx:143`·`projects-screen.test.ts:134`의 `text-gray-dim` 단언을 갱신한다. `projects-screen.test.ts:509-510`(이름·메타 회색)은 건드리지 않는다.
  - 검증: 새 스캔이 현 코드에서 red(스위처·`/projects` 2곳 — 검색은 T3에서 고쳤다)인 것을 먼저 확인한 뒤 green.
  - `[commit] fix(ui): render archived as one StatusBadge everywhere`
- **T7. 스위처·헤더·0건 문구 (C20·C23·C24)**
  - 스위처: `label: "Search projects"` · `placeholder: "Search projects…"`, 0건 `No projects match “q”`(`<p>` 유지).
  - 두 헤더 로고 `rounded-sm`.
  - 리포 검색 `No repositories match “q”`, 번역 키 `noMatch`·`noIncompleteMatch` 곡선 따옴표.
  - `terminology.test.ts`: `view all projects`·`browse all docs` 금지, 보간 0건 제목의 곧은 따옴표 금지. `lib/i18n/__tests__/dictionary.test.ts`: **경로 끝이 `label`인 키**의 값에 `…` 금지(placeholder·loading의 `…`는 정상).
  - 검증: 넓힌 테스트가 현 사전에서 red를 거쳐 green. `project-switcher.test.tsx`·`shell-header.test.tsx`(로고 `rounded-sm` 단언 추가) green.
  - `[commit] fix(i18n): one empty-result title form and switcher labels`

## 배치 2 — 오버레이 술어

- **T8. 오버레이 IME Esc 가드 기본화 (C9 일부·D11)**
  - `components/ui/use-ime-guard.ts`: compositionstart/end ref + `blocks(event)`. `DialogContent`·`CommandDialog`·`LargeModal`·`Popover`·`DropdownMenuContent`가 "가드 → 내부 동작 → 소비자" 순서로 쓴다(design "오버레이 IME Esc 가드"). `Command` 루트도 같은 훅을 쓰고 `search-dialog.tsx`의 바깥 조합 div·ref를 지운다.
  - `CommandDialog`의 `onEscapeKeyDown` prop 삭제 + `command-dialog.test.tsx:94` 갱신. 스위처 `:103` 손 가드 삭제.
  - 테스트(jsdom): 각 오버레이에 `keydown Escape {isComposing:true}` → 열린 채 / compositionstart 직후 플래그 없는 Esc → 열린 채 / 일반 Esc → 닫힘. Popover: "조합 Esc → 바깥 클릭으로 닫힘 → 포커스가 앵커로 가지 않음"과 "조합 Esc 뒤 일반 Esc 한 번에 닫히고 포커스 복귀". `global-search.test.tsx:58` green 유지.
  - 검증: 새 테스트가 `LargeModal`·`Popover`·`DropdownMenuContent`에서 red를 거쳐 green. **수동(T13)**: Chrome·Safari에서 한글 IME로 조합 중 Esc → 검색 Dialog·온보딩 `LargeModal`·초대 모달·Popover·스위처가 열린 채이고, 조합이 끝난 뒤 Esc는 닫는다(CDP `Input.imeSetComposition` 또는 실제 IME). jsdom green만으로 완료를 선언하지 않는다(POSTMORTEM 2026-09-24).
  - `[commit] fix(ui): keep overlays open while an IME composition is active`
- **T9. IME·일반 클릭 소비처 이관 + 손 사본 0 (C9·C10)**
  - IME 판정식 8곳(design "소비처" 목록) → `isImeComposing`. `invite-modal.tsx:149`의 native/합성 혼용 정리. `draft.ts:126`.
  - 일반 클릭 5곳(navigation-dim 두 파일 포함) → `isPlainPrimaryClick`. `use-leave-guard`의 `defaultPrevented`는 호출부에 남는다.
  - 불변식(마지막 사본을 걷는 이 커밋에서): `visual-system.test.ts` — "`isComposing ||`·`=== 229` 판정식은 `lib/keyboard.ts`에만, compositionstart/end ref는 `use-ime-guard.ts`에만". `hand-copies.test.ts` — 일반 클릭 판정 손 사본 0.
  - 검증: 불변식 테스트가 이관 전 red(8·5곳)를 거쳐 green. `project-switcher.test.tsx`·`translation-workspace-focus.test.tsx`·`invite-modal` 테스트·`navigation-dim` 테스트 green.
  - `[commit] refactor(ui): reuse shared IME and plain-click predicates`
- **T10. Dialog 포커스 핸들러 한 벌 (C27·D10)**
  - `dialog.tsx`의 `:95-111` ≈ `:181-197`을 순수 핸들러 `openAutoFocus(event, consumer?)`·`closeAutoFocus(event)`로 묶는다. `recent[]`·`focusin`·capture `pointerdown` 기록(`:42-72`)은 그대로다.
  - 검증: `command-dialog.test.tsx`·`primitive-focus.test.tsx`·`focus-return.test.tsx`·`modal-initial-focus.test.tsx`·`settings-archive-focus.test.tsx` green. **뮤테이션 1회**: 핸들러의 복귀 호출을 지우면 위 그물이 red가 되는 것을 확인하고 되돌린다(POSTMORTEM 2026-09-20). **수동(T13)**: 실브라우저에서 검색 Dialog·일반 Dialog를 Esc·바깥 클릭으로 닫은 뒤 `document.activeElement`가 트리거다(Safari 포함).
  - `[commit] refactor(ui): share Dialog focus entry and return handlers`

## 문서·검증

- **T11. 정본 문서** (문서별 별도 커밋)
  - DESIGN(design "문서 갱신" 목록 전부 — §2.4·§6.2(D15 등재 이탈)·§6.4·§6.5·§6.54·§10.1·:330·:524·:747·:838·:1203·:2003, D5 의도), PRODUCT §4.1, ARCHITECTURE §6.37(:2723·:2728), DIRECTORY:443, `project-thumbnail.tsx` 머리 주석.
  - 검증: `pnpm sync:agents:check` green. grep 0건 — DESIGN·DIRECTORY에서 활성 행 "border-ring", `Folder`·`BookOpen`(검색 맥락), "썸네일 16"(검색), "앞 글리프가 없다", "소비자가 맡는다"(Esc), `Find project…`, `View all projects`, `Browse all docs`, `Menus`(검색 그룹), "320×36", "실패는 null"(ARCHITECTURE). grep 존재 — `Pages`·`Go to docs`·`Go to your projects`·`soft-neutral`(보관).
  - `[commit] docs(DESIGN): …` · `docs(PRODUCT): …` · `docs(ARCHITECTURE): …` · `docs(DIRECTORY): …`
- **T12. 가이드·README (C25)**
  - `guide/translate/edit.md` 갱신, `guide/AUTHORING.md` 단축키 표기 규칙, README:51.
  - `lib/guide/__tests__/content.test.ts`에 검색 숫자를 고정한다: 지금 패턴은 `toContain(String(CONST))`(:117-125)인데 산문은 낱말("at least two characters"·"up to five results")이라 **낱말 대응표**(`KEY_QUERY_MIN`↔`two`, `SEARCH_GROUP_LIMIT`↔`five`)로 단언하고, `Q_MAX_LENGTH`는 숫자 `200` 그대로 단언한다.
  - 검증: `pnpm test` green. grep 0건 — 가이드·README의 `guides`(검색 그룹 뜻)·`menus`·`first import`·`⌘K` 산문. `pnpm guide:check` 출력의 stale 후보를 `/guide-shots`로 넘긴다.
  - `[commit] docs(guide): …` · `docs(README): …`
- **T13. 런타임 수동 검증 (`/runtime-test`, 로컬)**
  - T4·T5·T3·T8·T10의 "수동" 항목 전부.
  - 실패 모의: `unavailable` — CDP `Fetch`로 `Next-Action` 헤더가 붙은 멤버십 Action 요청을 실패시킨다. `unauthorized` — 다른 탭에서 로그아웃한 뒤 같은 탭에서 검색을 연다. Keys도 같은 방법.
  - 검증: 결함은 BugShot으로 이슈화하고, 이 기능 범위의 결함 0으로 닫는다.
- **T14.** `pnpm gate` green → `/code-review` → `/ux-audit`(인자 없이 일곱 차원 전부)로 재감사한다. 🔴 0과 이번 범위 🟡 0을 확인한다.
- **T15.** 기능이 끝나면 결론을 정본으로 올리고 `docs/features/search-ux-unify/`를 지운다.
