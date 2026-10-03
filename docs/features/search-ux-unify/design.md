# search-ux-unify — 설계

## 영향 받는 흐름

**편집 UI만이다.** push·pull·export·스키마·인증 경계는 건드리지 않는다.

| 화면 | 바뀌는 것 |
|---|---|
| 두 셸 헤더 | `FieldButton` 40 · 로고 radius · 단축키 칩(회색 `Kbd`) |
| 검색 Dialog | 상태·실패 · Docs 전용(비로그인·멤버십 실패) · 그룹명 Pages · 행 = `ListRow` + 28 타일 · 여백 체계 · 활성 행 · 글리프 · clear X · Esc 칩 · 하이라이트 범위 · `/docs` 행 하나 |
| LNB 스위처 | 이름 대조(토큰 AND) · 보관 배지 · 0건 문구 · 입력 접근 이름 · `Esc` 칩 출처 |
| `/projects` | 이름 대조(토큰 AND) · 하이라이트 함수 · 보관 배지 색 |
| Home·Logs·Sources | 없음(이미 `soft-neutral` — D6) |
| 모든 오버레이 | IME 조합 중 Esc가 닫지 않는다(프리미티브 기본) |
| 번역 키 목록 · 온보딩 리포 검색 | 0건 제목 따옴표·마침표 |

## 시각 값의 정본 — T0

**아래 시각 값(여백 표·행 높이·칩 치수·타일 배치)은 T0이 확정한다.** `design-prompt.md`로 받은 Claude Design 시안을 이 문서에 반영하고, 사용자가 승인한 날짜를 여기에 적는다. 시안과 이 문서가 다르면 승인된 시안 쪽으로 이 문서를 고친 뒤 착수한다.

- **고정 제약(시안이 바꾸지 않는다)** — 사용자 결정이다: `FieldButton` 40(D13) · `Kbd` 회색 면 + `text-foreground/60` + `h-5`(D14) · 보관 = `soft-neutral`(D6) · 행 = `ListRow`(C15) · 모든 행 28 타일(C17) · 활성 = `selected` 7%(C16) · 활성이 바뀌어도 높이·폭 불변(C19) · 라이트 단일 · 새 raw 색 없음.
- **시안이 정하는 것**: 입력·상태 줄·그룹 머리·0건의 여백 수치, 그룹 구분 방식, Esc 칩·clear X의 배치, `Go to ↵` 힌트의 모바일 폭 처리, 둘째 줄 행의 밀도.
- 승인: _(T0에서 기록)_

## 과거 함정 (POSTMORTEM)

- **2026-09-13 "소문자화한 위치로 원래 이름을 잘라 검색 강조가 어긋났다"** — `highlightName`이 `İ`처럼 소문자화하면 길이가 늘어나는 문자에서 강조 위치를 틀렸다. `highlightSegments`(`lib/search/highlight.ts:3-36`)는 같은 대응을 코드 포인트 단위로 이미 한다. `İabc`/`a`·`İİ`/`i`는 이미 `highlight.test.ts:7-8`에 있다. **`list.test.ts:656-662`의 정확한 조각 배열을 `highlightSegments` 기대값(합쳐진 조각 — `İİ`는 한 조각)으로 고쳐 옮기고, `İabc`/`i` 케이스를 더한다.** `/projects`의 렌더 조각 수가 바뀌는 것은 의도다.
- **2026-09-08 "제출 버튼이 없는 `<form>`이라 Enter가 무효"** — `CommandInput`에 clear X를 붙일 때 `Input`의 clear 버튼이 `type="button"`인지 확인한다(`components/ui/input.tsx:70` — 이미 그렇다). Enter는 `Command`의 `onKeyDown`이 잡는다.
- **2026-09-24 "연 채로 보관된 Settings"** — 보관 상태가 화면마다 다르게 읽히면 안 된다는 같은 축이다. C5의 근거로 인용한다.
- **2026-09-20 "포커스 복귀가 브라우저에서만 깨졌고, 재는 테스트는 아무것도 안 재고 있었다"** · **2026-09-24 "포커스가 `body`로 빠지는 자리가 열한 곳"** · **2026-09-24 "초대 모달의 포커스·입력 규칙이 jsdom에서만 참"** — C27 통합과 C9 가드는 이 셋의 산물(`dialog.tsx:42-72`의 `recent[]`·`focusin`·capture `pointerdown` 기록, Safari 포커스 없는 클릭)을 건드린다. **기존 그물 이름 고정 + 뮤테이션 1회 + 실브라우저 수동 검증**을 tasks T9·T10이 든다. 합성 이벤트 jsdom 테스트만으로 green을 선언하지 않는다.
- **2026-09-09 "프리미티브가 `asChild` 자식 옆에 형제를 붙였다"** — `ListRow`에는 Slot·asChild가 없다. `CommandItem`이 `option` div 안에 `ListRow`(링크)를 그리는 구조는 지금(`command.tsx:117-119`)과 같다.

## 순수 함수로 분리하는 부분 (= `/tdd interface` 진입점)

| 모듈 | 함수 | 대체하는 것 |
|---|---|---|
| `lib/keyboard.ts` (신규, **import 0인 잎**) | `isImeComposing(event: Pick<KeyboardEvent,"isComposing"\|"keyCode">)` · `isPlainPrimaryClick(event)` · `searchShortcut(platform: string \| null) → { matches(event), label: "mac"\|"other"\|null, aria: string \| null }`. 플랫폼 판정(`/mac/i`)은 export하지 않는 내부 함수 | `/mac/i` 두 곳, IME 판정식 8곳, 일반 클릭 5곳, 단축키 3표기. `lib/search/keys.ts`의 `isSearchShortcut`은 **삭제**하고 `searchShortcut().matches`로 흡수한다 — `keys.ts`는 import 0인 잎으로 남는다(`client-graph.test.ts:491-499`). `m`을 import하지 않는다: 라벨은 식별자를 내고 컴포넌트가 `m.common.keys`로 푼다. React 합성 이벤트 호출부는 `event.nativeEvent`를 넘긴다 |
| `lib/search/match.ts` | `matchesAllTokens(text, tokens)` — trim·소문자·토큰 AND. 상수 `KEY_QUERY_MIN = 2` · `SEARCH_GROUP_LIMIT = 5` export | `searchProjects`(`lib/projects/list.ts:54`)·`switcherProjects`(`lib/shell/switcher.ts:15`)의 `includes(needle)`. `match.ts`는 import 0인 잎이라 스위처가 `list.ts`를 피하는 제약(`switcher.ts:9-11`)과 맞다. **상수는 정의만 둔다**(import를 늘리지 않는다). 서버 `lib/keys/search.ts`가 상수를 import해 `:10`의 `< 2`와 `:32-34,:60-61,:95`의 5를 바꾼다 — SQL `LIMIT ${SEARCH_GROUP_LIMIT}`는 `:95`와 같은 바인드 파라미터 형이다 |
| `lib/search/match.ts` | `searchGroups` 정렬에 보관 tie-break 추가 | 질의 중 보관 순서(C8). 스위처와 같다 |
| `lib/search/highlight.ts` | (기존) `highlightSegments` | `highlightName`(`lib/projects/list.ts:563`) 삭제. `/projects`는 `highlightSegments(name, searchTokens(q))` |
| `lib/search/rows.ts` (신규) | `searchRows({ index, keys, q, activeSlug })` → `{ groups: [{ kind, heading, rows }], ids }`. `row = { id, href, title, titleMatch, context?, description?, tile, archived }`. `tile = { kind:"project", name, image } \| { kind:"glyph", icon: LucideIcon }`. 지역 상수 `PREVIEW_LIMIT = 3` · `SNIPPET_LENGTH = 160` | `search-dialog.tsx:83-131`의 순서·id 삼항·스니펫 폴백·하이라이트 대상 판정, `match.ts:62,67`의 영어 리터럴·경로(`match.ts`가 잎이라 이쪽으로 옮긴다). `ids`는 `groups.flatMap(g => g.rows.map(r => r.id))`라 한 원천이다. 행 모델에 ReactNode는 없다 — 아이콘은 컴포넌트 참조라 테스트가 `toBe(Box)`로 단언한다. `context`(맥락)는 하이라이트 표식이 없다(C7) |
| `lib/search/rows.ts` | `searchStatuses({ membership, docs, keys })` → `{ pending, lines: [{ tone:"muted"\|"danger", text }], failed }` | `search-dialog.tsx:98-100`의 `pending`/`statuses` 이중 판정. `failed`가 참이면 `NoMatch`를 그리지 않는다(C3). 소비자가 하나라 `rows.ts` 안에 둔다 |
| `lib/search/nav-index.ts` | `navSearchEntries(membership)` — 멤버십이 없으면(비로그인·`unauthorized`·`unavailable`) `{ authenticated:false, projects:[], pages:[] }`. 있으면 작업 항목 + New project + 프로젝트 구역 + footer **`changelog`만**(D8). 각 page 항목이 nav `item.icon`을 싣는다 | footer 무조건 push(`:19`) 제거(C4·D7·D8) |
| `lib/search/load-memberships.ts` | `null` 대신 `{ ok:true, memberships } \| { ok:false, error:"unauthorized"\|"unavailable" }` — Action 결과를 그대로 돌려주고 throw만 `unavailable`로 접는다 | 실패를 비로그인으로 접는 동작(C1) |

### 글리프 출처 (C17)

href 조회는 없다. 객체 맵도 만들지 않는다(프로토타입 키 문제가 생기지 않는다).

| 행 | 글리프 | 출처 |
|---|---|---|
| Projects | `ProjectThumbnail` | `tile.kind = "project"` |
| `Go to your projects` | `Box` | `navWorkItems().find(i => i.key === "projects").icon` |
| Pages | 그 항목의 아이콘 | `nav-index`가 싣는 `item.icon` |
| `New project` | `Plus` | 명시(nav 항목이 없다 — DESIGN 헤더 New project 행과 같다) |
| Keys | `Languages` | 프로젝트 구역 `translations` 항목(`nav.ts:105`) |
| Docs · `Go to docs` | `CircleHelp` | `navFooterItems().find(i => i.key === "docs").icon` |

`rows.ts`가 `nav.ts`를 import한다 — `nav.ts`는 이미 클라이언트 그래프 안이고 lucide는 허용 패키지다. `CLIENT_LIB_FILES`(`client-graph.test.ts:96-211`)에 `rows.ts`·`keyboard.ts`를 등재한다.

**순수 함수가 비지 않는다** — 위가 `/tdd interface`의 대상이다.

## 컴포넌트 변경

### 프리미티브 (`components/ui/`)

**`kbd.tsx`** — 회색 면. 테두리는 없다(D14).
```
<kbd aria-hidden className="bg-foreground/5 text-foreground/60 inline-flex h-5 shrink-0 items-center rounded px-1.5 font-sans text-xs leading-none font-medium">
```
- 높이 20 고정. 타일(28) 행 안에서 행을 키우지 않는다(C19).
- 면은 `soft-neutral` 배지·`IconTile` muted와 같은 `--foreground` 알파다(`badge.tsx:53-54`, `icon-tile.tsx:21`). 새 raw 색이 아니다.
- 글자는 DESIGN §2.2 "muted 면 위 글자는 `text-foreground/60`" 규칙(`globals.css:186-187`)을 따른다. 흰 면 위 약 5.3:1, 활성 행 위 약 4.8:1.
- `aria-hidden`이 기본이다. 검색 트리거의 의미는 소유자 `aria-keyshortcuts`가 진다. Esc 칩(스위처·검색 Dialog)은 표준 동작의 장식이다 — 스위처 칩이 지금 낭독되던 "Esc"는 사라진다(의도).

**`field-button.tsx`**
- `h-9` → `h-10`(D13). 두 헤더 모두 `HeaderBar`(`components/shell/header-bar.tsx:13`)가 `h-10`이다.
- hover `bg-foreground/[0.03]` → `hover:bg-primary-foreground`. 흰 테두리 컨트롤의 정본이다(`button.tsx:74-79`).
- `aria-expanded` prop을 추가하고 트리거가 `open`을 넘긴다.

**`command.tsx`** — 행은 **`ListRow`를 재사용한다**(2026-10-03 사용자). 여백 수치는 T0이 확정한다(아래는 초안).

| 부분 | 지금 | 바뀜 (초안) |
|---|---|---|
| `CommandInput` 줄 | `px-4 py-3` | `h-12 px-3` + `Input clearable onClear` + 오른쪽 `Kbd` Esc(`m.common.keys.esc`). `Input` bare는 아이콘이 `left-2.5`(`input.tsx:64,68`)라 `px-3`이면 검색 글리프 중심(30)이 타일 중심(16 + 14)과 한 선이다 |
| `CommandStatus` | `px-4 py-2 text-xs muted` | `px-4 py-2 text-xs`. `tone="danger"`면 `text-destructive` |
| `CommandList` | `py-2` | `py-2`(가로 여백 없음 — 행이 폭을 꽉 채운다) |
| `CommandGroup` | `border-b pb-2 last:border-b-0` | `py-1`. 형제 사이는 `not-first:border-t not-first:border-divider` — 구분선 하나 |
| 그룹 머리 | `px-4 py-2 text-xs font-medium text-foreground` | `px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground` (메뉴 라벨 톤) |
| `CommandItem` | 손 조립 `<Link className="mx-2 flex … rounded-md border px-2 py-2 gap-3">` + 활성 `border-ring bg-accent` | `<div role="option"><ListRow variant="canvas" className="text-sm hover:bg-transparent" href tabIndex={-1} ref icon title description aside selected={active} /></div>`. 활성 = `ListRow`의 `selected`(`bg-foreground/[0.07]`). radius·테두리·포커스 링 0. hover 면은 `hover:bg-transparent`로 끈다(`cn` = tailwind-merge가 덮는다) — 마우스를 둔 채 ↑↓를 눌러도 칠해진 행은 `selected` 하나다. 새 prop 없음 |
| 아이콘 칸 | 선택적 `[&>svg]:size-4` | **필수 28 타일**: `icon` prop은 `ReactNode`이고 소비자가 `ProjectThumbnail sm` 또는 `IconTile sm`을 넘긴다 |
| 제목 줄 | `{title} · {context}` + `truncate` | `ListRow` `title`에 `<span className="block truncate">{title} · {context}</span>` — `ListRow` title은 맨 `<span>`이라(`list-row.tsx:36`) 소비자가 감싼다. 맥락은 muted `text-xs` 인라인(DESIGN §6.54 "제목과 맥락은 한 줄") |
| 둘째 줄 | 자체 `gap-1` | `ListRow` `description`(`gap-copy-gap`) + `<span className="block truncate">` |
| 보관 배지·힌트 | `{badge}` + 활성일 때만 `Go to ↵` | `aside`에 `{badge}` + **늘 렌더하는** `Go to ↵`(비활성 `invisible`, C19) |

- 행 높이(초안): 한 줄 = 28 + 13×2 = **54**, 둘째 줄이 있으면 20 + 3 + 19.5 + 26 = **약 68.5**. 타일(28)이 힌트(20)보다 높고 힌트가 늘 자리를 차지하므로 활성이 바뀌어도 높이·폭이 변하지 않는다(C19).
- ⚠️ `ListRow`는 `link["aria-current"] ?? (selected ? "true" : undefined)`다(`list-row.tsx:39`). `aria-current={false}`를 넘기면 `aria-current="false"`로 렌더된다 — option 활성이 "현재 페이지"가 아님을 그렇게 말한다. 테스트는 "`aria-current`가 `"true"`가 아니다"를 단언한다. `ListRow`에 새 prop을 만들지 않는다.
- `ProjectThumbnail sm`의 radius는 8, `IconTile sm`은 4다. 프로젝트 정체 칸 8은 사용자 결정(2026-09-17, `project-thumbnail.tsx:16`)이므로 그대로 둔다(비목표).
- 조합 추적(D11): `Command` 루트가 compositionstart/end ref를 갖고 판정은 `isImeComposing(event.nativeEvent) || composing.current`다. `search-dialog.tsx`의 바깥 조합 div·`composing` ref는 지운다 — 같은 일을 프리미티브가 한다. `global-search.test.tsx:58`이 그 계약을 계속 잰다.

**오버레이 IME Esc 가드** — `dialog.tsx`(`DialogContent`·`CommandDialog`) · `large-modal.tsx` · `popover.tsx` · `dropdown-menu.tsx`

- 조합 상태 추적과 판정을 내부 훅 하나(`components/ui/use-ime-guard.ts` — ref를 가지므로 훅이다)로 두고 다섯 Content가 쓴다. 훅은 Content에 붙일 `onCompositionStart/End`와 `blocks(event)` = `isImeComposing(event) || composing.current`를 낸다.
- 합성 순서는 프리미티브마다 같다: **가드(조합이면 `preventDefault` 후 return) → 기존 내부 동작 → 소비자 핸들러.** 리포에 `composeEventHandlers`가 없으니 래퍼마다 손으로 합성한다.
  - `Popover`(`popover.tsx:33`): 조합이면 `escaped.current = true`를 세우지 않고 return한다 — 세우면 다음 비-Esc 닫힘이 앵커로 포커스를 잘못 돌린다.
  - `DropdownMenuContent`(`dropdown-menu.tsx:23-38`): 지금 `...props`로 소비자 핸들러를 넘기므로 `onEscapeKeyDown`을 꺼내 감싼다.
  - `LargeModal`: prop 자체가 없으니 내부 Content에 가드만 단다.
- `CommandDialog`의 `onEscapeKeyDown` prop은 소비자가 없어지므로 지운다. `command-dialog.test.tsx:94`("Esc를 소비한 호출부는 닫지 않는다")는 "조합 중 Esc는 닫지 않는다"로 바뀐다. DESIGN:747·DIRECTORY:443의 "Esc 판정은 CommandDialog 소비자가 맡는다"도 고친다.
- 스위처(`project-switcher.tsx:103`)의 손 가드는 지운다.

**`dialog.tsx` 포커스 핸들러 (C27·D10)**
- `DialogContent`·`CommandDialog`의 진입·복귀(`:95-111` ≈ `:181-197`)를 같은 파일의 순수 핸들러 둘로 묶는다: `openAutoFocus(event, consumer?)`(소비자 `onOpenAutoFocus`를 먼저 부르는 차이를 인자로 받는다) · `closeAutoFocus(event)`.
- 모듈 수준 기록(`recent[]`·`focusin`·capture `pointerdown`, `:42-72`)은 그대로다 — 핸들러가 그것을 읽을 뿐이다.

**`status-badge` / `lib/status/canon.ts`**
- `STATE.archived`는 `soft-neutral`이다(D6 — 이미 그렇다면 변경 없음, 아니면 맞춘다). 새 variant는 없다.
- 호출부의 `text-gray-dim`을 지운다. `px-2`는 배치라 `/projects`·스위처에 남는다.
- `/projects` 보관 행의 이름·메타 `#a3a3a3`는 그대로다(`projects-screen.test.ts:509-510`은 건드리지 않는다).

### 소비처

- **`components/search/search-dialog.tsx`**:
  - `searchRows`·`searchStatuses` 결과를 그리기만 한다. 키 검색 하한은 `KEY_QUERY_MIN`(`:46`의 리터럴 대신).
  - `tile`을 `ProjectThumbnail size="sm"` / `IconTile size="sm"`로, `archived`를 `StatusBadge state="archived"`로 그린다.
  - Keys 결과의 `unauthorized`·`unavailable`을 구분한다.
- **`components/search/search-trigger.tsx`**: `searchShortcut(platform)`의 `matches`·`label`·`aria`만 쓴다. 칩은 `<Kbd>{m.common.keys.search[label]}</Kbd>` 꼴로 문자열 리터럴이 없다. SSR(`platform === null`)은 지금처럼 칩·`aria-keyshortcuts`가 없고 `FieldButton`의 `w-16` 자리가 폭을 지킨다(`search-trigger.tsx:13-18`).
- **`components/shell/project-switcher.tsx`**:
  - `Esc` 칩은 `m.common.keys.esc`.
  - 0건은 사전 `No projects match “{q}”`. 메뉴 안이라 `<p>` 형은 유지한다(확인 필요 4).
  - 입력은 `aria-label` `Search projects` · placeholder `Search projects…`.
  - 보관 배지 `className="shrink-0 px-2"`.
- **`components/projects/project-list.tsx`**: `highlightSegments`를 쓰고, 칩 `className="px-2"`로 색 덮개를 뺀다.
- **두 헤더**: 로고 링크 `rounded-sm`(`shell/header.tsx:47`의 `rounded-lg` → `rounded-sm`, 공개 셸 `:50`은 이미 `rounded-sm`).
- **일반 클릭 5곳**(`search-dialog` · `public-doc-toc` · `button` · `navigation-dim` 두 파일(`components/shell/navigation-dim.tsx:42-43` · `lib/shell/navigation-dim.ts:22`) · `use-leave-guard`): `isPlainPrimaryClick`. `use-leave-guard`의 `defaultPrevented`는 호출부에 남긴다.
- **IME 판정식 8곳**: `command.tsx:48` · `search-input.tsx:55` · `project-switcher.tsx:63,103` · `search-dialog.tsx:103` · `invite-modal.tsx:149`(native `isComposing` + 합성 `keyCode` 혼용 정리) · `lib/search/keys.ts:2`(→ `searchShortcut`) · `lib/translations/draft.ts:126`.

### 사전 (`messages/en.tsx`)

| 키 | 값 |
|---|---|
| `common.keys` (신규) | `{ enter: "↵", esc: "Esc", search: { mac: "⌘K", other: "Ctrl K" } }`. `projectSwitcher.escHint`는 지운다 |
| `search.groups.menus` → `search.groups.pages` | `"Pages"` |
| `search.viewAllProjects` | 지우고 `m.notFound.action`(`"Go to your projects"`)을 쓴다(D9 — 새 문자열 금지) |
| `search.browseAllDocs` → `search.goToDocs` | `"Go to docs"` |
| `search.projectsUnavailable` (신규) | `"Projects can't be searched right now. Reopen search to try again."` |
| `search.sessionEnded` (신규) | `"Your session ended. Sign in again to search your projects."` — 기존 형(`en.tsx:3621` "Your session ended. Sign in again to save your work.")을 따른다 |
| `search.keysUnavailable` | `"Keys can't be searched right now. Edit your search to try again."` |
| `search.docsUnavailable` | `"Docs can't be searched right now. Reopen search to try again."` |
| `search.loadingProjects` | 기존 `projects.loading`(`en.tsx:1497`) 재사용, 사본 삭제 |
| `nav.projectSwitcher.search` | 둘로 나눈다 — `label: "Search projects"` · `placeholder: "Search projects…"` |
| `nav.projectSwitcher.empty` | `(q) => \`No projects match “${q}”\``. `/projects`의 `en.tsx:1532`를 재사용할 수 있으면 재사용한다 |
| 리포 검색 `en.tsx:2195` | `No repositories match “${q}”` (곡선 따옴표, 마침표 없음) |
| 번역 키 `en.tsx:2496` · `:2497` | `No keys match “${q}”` · `No incomplete keys match “${q}”` |

### Docs 전용 (C1·C4·D7)

- 멤버십이 없는 세 경우(비로그인 · `unauthorized` · `unavailable`) 모두 `navSearchEntries`의 Projects·Pages가 빈 배열이고 미리보기는 Docs 그룹 하나다. 상태 줄만 다르다(없음 · 세션 종료 · Projects 실패).
- Keys는 `canSearchKeys`가 이미 `authenticated`를 본다.
- 비로그인 검색에서 Changelog가 사라진다 — 공개 헤더 내비에 이미 있다(`public-shell/header.tsx:57-64`).
- 로그인했지만 멤버십이 0이면 지금처럼 Projects 그룹이 없다(`previewGroups`의 `projects.length > 0`). Pages(작업 항목)와 Docs는 선다.
- `/docs` 행은 어디서나 Docs 그룹의 `Go to docs` 하나다(D8 — 색인에서 footer `docs`를 뺐다).

## 스키마 변경

없음.

## 새 환경변수

없음.

## 불변식 영향

없음 — export·blob SHA·인증 경계를 건드리지 않는다.

- 검색 Action 둘(`searchKeysAction`·`loadSearchMembershipsAction`)은 이미 `{ ok:false, error }` union을 돌려준다(`app/search/actions.ts:10-12`). 바뀌는 것은 클라이언트가 그것을 접지 않는 것뿐이다. 서버는 클라이언트의 `authenticated`를 받지 않는다(`actions.test.ts:63`).
- Docs 전용은 **노출을 줄이는 쪽**이다. 서버 판정은 그대로다.
- `lib/keys/search.ts`(server-only)가 클라이언트 잎 `match.ts`를 import하는 것은 허용 방향이다(선례 `:5`).

## 문서 갱신 (T11·T12 — 여기서 직접 고치지 않는다)

- **DESIGN**
  - §2.4: 보관 한 형(`soft-neutral`).
  - §6.4: `Kbd` 회색 면·`text-foreground/60`·`h-5`·`aria-hidden`(:743) / `FieldButton` 40·hover / `Command*` 여백 표·`ListRow` 재사용·Esc 판정 프리미티브(:747) / Dialog 포커스 핸들러 / 오버레이 IME 가드.
  - §6.5: 스위처 입력 `Search projects`·0건 문구·보관 배지(:808).
  - §6.54: 트리거 320×40 · 상태 줄 톤·0건 조건 · Pages · 행 = `ListRow` + 28 타일(전 그룹) · 활성 7%(:838) · Docs 전용(비로그인·멤버십 실패) · `/docs` 하나.
  - :330 헤더 "32 컨트롤의 위아래가 4씩"에 검색 캡슐 40 예외를 적는다.
  - :524 · :1203: 보관 배지 `soft-neutral`, 내려가는 것은 이름·메타 둘.
  - :2003 → "같은 목적지 = 같은 글리프"(아이콘 표의 사용자 메뉴 행 :1998)에 맞춘다.
  - §10.1: `Go to your projects`·`Go to docs`·0건 제목 형과 검색 Dialog 예외.
  - **D5 수식키 정책 의도 기록**: 검색 = 플랫폼 엄격, 저장 = Ctrl·Meta 둘 다.
- **PRODUCT §4.1** — 비로그인 = Docs만 · 멤버십 실패 = 상태 줄 + Docs 전용 · Pages · `Go to …` 라벨 · `/projects` 토큰 AND.
- **ARCHITECTURE §6.37** — `:2723` Menus → Pages, `:2728` "실패는 null" → union.
- **DIRECTORY** `:443` — Esc 판정 서술.
- **guide** `translate/edit.md:23-31`
  - guides → docs, menus → pages, key 재정의 정리, 비로그인 = docs만.
  - 단축키 표기는 `guide/AUTHORING.md`에 규칙 한 줄을 둔다: 산문은 `Cmd+K` / `Ctrl+K`.
  - 다른 Dialog가 열려 있으면 단축키를 무시한다는 문장을 추가한다.
- **README.md:51** — "guides and menus" → "docs", "first import" → "first sync".
- `components/ui/project-thumbnail.tsx:6,31`의 낡은 머리 주석("소비자는 … 둘" — 지금은 스위처·검색도 쓴다).
- `CLAUDE.md` 프리미티브 수 — 새 `.tsx` 프리미티브가 없으므로 그대로다(`use-ime-guard.ts`는 `.ts` 헬퍼라 세지 않는다).
