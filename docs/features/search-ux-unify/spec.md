# search-ux-unify — 스펙

글로벌 검색(2026-10-03, global-search)이 들어온 뒤 `/ux-audit`(2026-10-03)이 화면 간 불일치 33건(🔴 6 · 🟡 15 · ⚪ 12)을 냈다.
사용자가 같은 날 리포트 추천을 채택했고(D1~D5 — 단 D3는 사용자 디자인 지시가 대체했다), 디자인 지시를 더했다.
`/feature-review`(2026-10-03)가 남은 결정을 닫았다. 이 문서는 그 목록을 닫힌 범위로 만든다. **결정의 원천은 아래 "결정 기록"이다** — ux-audit 리포트는 리포 밖 스크래치패드에만 있었다.

**착수 조건: 디자인 정본이 먼저다** (2026-10-03 사용자). `design-prompt.md`로 Claude Design 시안을 받아 `design.md`의 시각 값에 반영하고 사용자가 승인한 뒤 T1을 시작한다(tasks T0). 시안은 `/design-sync`의 SoT가 아니다 — 이미 구현된 화면이라 정본은 코드베이스 + DESIGN.md이고(2026-09-27 사용자), 시안은 `design.md`를 거쳐 DESIGN.md로 올라간다.

## 사용자

**둘 다.** 검색은 헤더에 늘 있는 입구라 번역 편집자(비개발자)와 OWNER(나)가 같이 쓴다. 보관 배지·프로젝트 이름 대조·IME Esc는
`/projects`·LNB 스위처·온보딩 모달에도 걸려 있어 두 사용자 모두 매일 밟는다. 두 사용자의 요구가 상충하는 항목은 없다.

## 문제 (관측된 사실)

1. **실패를 다른 상태로 접는다.**
   - 멤버십 조회가 실패하면 로그인한 사용자에게 상태 줄 없이 비로그인 화면이 선다(`lib/search/load-memberships.ts:8-10` → `lib/search/nav-index.ts:20`). 같은 순간 헤더에는 아바타가 그려져 있다. DESIGN.md:833-835("Projects 부분 실패 = 상태 줄")에서도 벗어나 있다.
   - 조회가 실패했는데 `No results for “q”` + `Try another search.`가 같이 선다(`components/search/search-dialog.tsx:98,100,133`).
   - Keys 검색 중 세션이 끝나면 `Keys can't be searched right now.`로 보인다(`search-dialog.tsx:69,73`). 다른 화면은 세션 종료 문장을 따로 쓴다(`messages/en.tsx:3621` 등).
   - `/docs`로 가는 행이 둘이다. 비로그인 미리보기는 Menus `Docs`(`nav-index.ts:19`의 footer push) + `Browse all docs`(`match.ts:66`)이고, 로그인해도 질의 결과에서 Menus `Docs`와 Docs 그룹이 겹친다.
2. **보관 배지 모양이 셋이다.**
   - 검색은 원시 `<Badge>`(면 없는 muted 글자, `search-dialog.tsx:127`)다.
   - 스위처(`components/shell/project-switcher.tsx:137`)와 `/projects`(`components/projects/project-list.tsx:309`)는 `StatusBadge`에 `className="px-2 text-gray-dim"`을 덧칠한다. `StatusBadge`의 "className은 배치만" 규칙(`components/ui/status-badge.tsx:8`)을 어긴 것이다. 그 색(`#a3a3a3`)은 배지 면 위 대비 2.3:1이다.
   - Home·Logs·Sources는 `soft-neutral` 그대로다. 결국 보관의 정본 모양이 `STATE` 표가 아니라 호출부 두 군데의 사본에 산다.
3. **같은 프로젝트 질의에 화면마다 다른 답이 나온다.** 검색은 토큰 AND(`lib/search/match.ts:22-40`), `/projects`(`lib/projects/list.ts:54`)와 스위처(`lib/shell/switcher.ts:15`)는 통째 부분 일치다. 그래서 `app web`을 치면 검색에서만 `Web App`이 나온다.
4. **같은 목적지를 다른 글리프로 가리킨다.** 검색의 `View all projects`는 `Folder`, `Browse all docs`는 `BookOpen`이다. 사이드바·사용자 메뉴는 `Box`·`CircleHelp`다(`lib/shell/nav.ts:167,260`). DESIGN.md:2003이 이 이탈을 허가하고 있어 같은 표의 다른 행("같은 목적지는 사이드바와 같은 글리프")과 모순이다.
5. **단축키 하나가 세 표기로 산다.**
   - 같은 단축키의 매처(`lib/search/keys.ts:1-4`) · 칩 라벨(`search-trigger.tsx:35`) · `aria-keyshortcuts`(`:36`)가 따로 있다. `/mac/i` 판정도 두 번 한다.
   - `⌘K`·`Ctrl K`·`↵`는 TSX 리터럴이고 `Esc`만 사전을 거친다.
   - `Kbd`의 접근성 노출이 소비처마다 다르고(스위처 `Esc` 칩만 `aria-hidden`이 없다), 검색 Dialog에는 닫기 단서가 없다.
6. **손 사본 판정이 퍼져 있다.**
   - IME 조합 판정 8곳: `command.tsx:48` · `search-input.tsx:55` · `project-switcher.tsx:63,103` · `search-dialog.tsx:103` · `invite-modal.tsx:149` · `lib/search/keys.ts:2` · `lib/translations/draft.ts:126`.
   - 일반 클릭 판정 5곳: `search-dialog` · `public-doc-toc` · `button` · `navigation-dim`(`components/shell/navigation-dim.tsx:42-43` + `lib/shell/navigation-dim.ts:22`) · `use-leave-guard`.
   - `LargeModal`·`Popover`에는 조합 Esc 가드가 없어서, 한글을 조합하다 Esc를 누르면 온보딩·초대 모달이 닫힌다.
   - `DialogContent`·`CommandDialog`의 포커스 진입·복귀 로직이 두 벌이다(`components/ui/dialog.tsx:95-111` ≈ `:181-197`). 차이는 소비자 `onOpenAutoFocus` 호출 하나다.
7. **검색 Dialog의 형이 다른 오버레이와 다르다.**
   - 행이 앱의 행 프리미티브(`ListRow`)가 아니라 손 조립이다. radius 10(`rounded-md`)에 비포커스 `border-ring`, 썸네일 16, Menus·Keys·Docs 행에는 글리프가 없다, 그룹 머리 foreground 500(메뉴는 muted).
   - 여백은 입력 `px-4 py-3` · 목록 `py-2` · 그룹 `pb-2` · 머리 `px-4 py-2` · 행 `mx-2 px-2 py-2`로 제각각이라 하나의 체계로 읽히지 않는다.
   - 활성 행에만 붙는 `Go to` + `Kbd`(약 23 = text-xs 글줄 17.3 + `py-0.5` 4 + border 2, `command.tsx:129`, `kbd.tsx:5`)가 한 줄 행의 글줄 20보다 높아 활성 행이 커지고 목록이 출렁인다. 힌트가 생기며 제목 폭도 줄어 truncate 지점이 움직인다.
8. **뷰모델이 컴포넌트에 박혀 있다.**
   - 그룹 순서를 두 곳에서 정하고(`match.ts:47` · `search-dialog.tsx:83`), `ids`와 렌더 루프가 같은 순서를 따로 계산한다.
   - `match.ts:62,67`이 영어 문자열과 경로를 하드코딩한다.
   - 찾지 않은 필드(프로젝트 slug, 키 결과의 프로젝트·소스)에도 하이라이트를 칠한다.
   - 키 검색 하한 2와 그룹 상한 5가 서버(`lib/keys/search.ts:10,32-34,60-61,95`)와 클라이언트(`search-dialog.tsx:46`, `match.ts:53`)에 리터럴로 따로 있다.
9. **낱말이 갈린다.**
   - `/projects`로 가는 라벨: `View all projects` ↔ 앱 나머지 `Go to your projects`.
   - 그룹명 `Menus`는 사전 전체에서 이 한 곳뿐이고, 앱에서 "menu"는 드롭다운을 뜻한다. 그룹 안에는 메뉴가 아닌 `New project`도 있다.
   - 0건 제목이 여섯 벌이다(따옴표·마침표·어순).
   - 스위처 입력 접근 이름이 `Find project…`(줄임표 포함)다.
   - 실패 줄에 다음 행동이 없다.
   - 가이드 산문은 "guides", README는 "first import"다.
10. **디자인 지시** (2026-10-03 사용자 — 관측이 아니라 지시라 출처를 따로 둔다): 헤더 검색 캡슐 40, 검색 입력의 지우기 X, 두 헤더 로고 radius 통일, 행 = `ListRow`, 모든 결과 행 28 타일, 활성 행이 바뀌어도 출렁이지 않음.

## 결정 기록

| # | 질문 | 결정 | 결정자·날짜 |
|---|---|---|---|
| D1 | 프로젝트 이름 대조 규칙 | **토큰 AND로 통일**(검색·`/projects`·스위처). 단일 토큰에선 결과가 같고 여러 단어일 때만 관대해진다 | 사용자 2026-10-03 (ux-audit 추천 채택) |
| D2 | 검색의 `Folder`·`BookOpen` | **`Box`·`CircleHelp`**로 맞추고 DESIGN:2003을 고친다 | 사용자 2026-10-03 (채택) |
| D3 | 활성 행 면 | ~~`bg-accent`만~~ → **`ListRow selected`(7%)** — 사용자 디자인 지시(C15·C16)가 대체 | 사용자 2026-10-03 |
| D4 | 그룹명 `Menus` | **`Pages`**. global-search 때 거부 사유("가이드 페이지와 헷갈린다")는 가이드 그룹이 `Docs`로 굳어 해소됐다 | 사용자 2026-10-03 (채택, 리뷰에서 재확인) |
| D5 | 수식키 정책(검색 = 플랫폼 엄격, 저장 = Ctrl·Meta 둘 다) | **현행 유지, DESIGN에 의도로 적는다.** Mac 입력창에서 Ctrl+K는 줄 끝 삭제다 | 사용자 2026-10-03 (채택) |
| D6 | 보관 배지 색 | **기존 `soft-neutral`** 여섯 곳 통일. 새 variant 없음. `/projects` 보관 행은 이름·메타만 `#a3a3a3`로 내려간다 | 사용자 2026-10-03 (리뷰) |
| D7 | 로그인 사용자의 멤버십 조회 `unavailable` | **Docs 전용 + 상태 줄**(`unauthorized`·비로그인과 한 형) | 사용자 2026-10-03 (리뷰) |
| D8 | `/docs` 중복 | **검색 색인에서 footer `docs` 항목을 로그인 여부와 무관하게 뺀다.** `/docs` 행은 Docs 그룹의 `Go to docs` 하나 | 사용자 2026-10-03 (리뷰) |
| D9 | `Go to your projects` 재사용 키 | **`m.notFound.action`** | 사용자 2026-10-03 (리뷰) |
| D10 | Dialog 포커스 통합 형 | **순수 핸들러 둘**(`openAutoFocus`·`closeAutoFocus`) — 상태가 없어 훅이 필요 없다 | 사용자 2026-10-03 (리뷰) |
| D11 | 검색의 IME 조합 추적(compositionstart/end ref) | **프리미티브로 올려 유지한다.** `global-search.test.tsx:58`의 계약(조합 직후 Esc·Enter 무시)을 지킨다 | 사용자 2026-10-03 (리뷰) |
| D12 | 범위 분할 | **한 기능으로 유지하고 배치 둘로 나눠 ship**(검색 UX / 오버레이 술어) | 사용자 2026-10-03 (리뷰) |
| D13 | 헤더 검색 캡슐 높이 | **40(`h-10`)** | 사용자 2026-10-03 (리뷰) |
| D14 | `Kbd` 형 | **회색 면(테두리 없음) + `text-foreground/60`** — 활성 행 위 대비 약 4.8:1 | 사용자 2026-10-03 (리뷰) |
| 확인 필요 1 | 번역 저장 단축키(Cmd/Ctrl+Enter)의 화면 힌트 | **비목표 유지**(편집 화면 변경이라 별건) | 리뷰 2026-10-03 |
| 확인 필요 2 | `FieldButton` 40이 헤더를 꽉 채우나 | **D13으로 닫힘.** 두 헤더 모두 `HeaderBar`(`components/shell/header-bar.tsx:13`)가 `h-10`이다 | 리뷰 2026-10-03 |
| 확인 필요 3 | 서버·클라이언트 상수 공유 | **`KEY_QUERY_MIN`·`SEARCH_GROUP_LIMIT`를 `lib/search/match.ts`가 export하고 server-only `lib/keys/search.ts`가 import한다.** 서버는 클라이언트 안전한 잎을 import할 수 있다(선례 `lib/keys/search.ts:5`의 `Q_MAX_LENGTH`). 값 일치 테스트는 두지 않는다 | 리뷰 2026-10-03 |
| 확인 필요 4 | 스위처 0건 형 | **메뉴 안이라 `<p>` 유지, 문구만 정본으로**(DESIGN §6.5) | 리뷰 2026-10-03 |

## 뒤집는 판정

| 항목 | 옛 결정 (출처) | 새 결정 | 근거 |
|---|---|---|---|
| 검색 캡슐 높이 (C14) | 36 — 2026-10-01 사용자(global-search) · DESIGN §6.54 "320×36" · DESIGN:330 헤더 "32 컨트롤의 위아래가 4씩" | 40 | D13. DESIGN:330·§6.54를 개정한다 |
| `Kbd` 형 (C13) | 테두리 칩 — global-search · DESIGN §6.4 `Kbd`(:743) | 회색 면 + `text-foreground/60` | D14. 대비 AA |
| 그룹명 (C21) | `Menus` — global-search 사용자("Pages는 가이드와 헷갈린다") | `Pages` | D4 |
| 보관 배지 색 (C5) | 스위처·`/projects` `text-gray-dim` — 2026-09-27 사용자(DESIGN:524) · `/projects` 보관 행 "이름·메타·배지 셋이 함께 내려간다"(DESIGN:1203, 등재된 이탈) | `soft-neutral`, 내려가는 것은 이름·메타 둘 | D6. 배지가 그 행에서 "왜 꺼졌나"를 말하는 유일한 사실이라 2.3:1은 회귀다 |
| 멤버십 실패 (C1) | global-search 설계 "실패 = 비로그인" | 상태 줄 + Docs 전용 | DESIGN:833-835가 이미 상태 줄이다. 아바타와 모순 |
| 비로그인 검색 (C4) | PRODUCT §4.1(:211) "비로그인은 하단 메뉴·가이드" | Docs만 | 2026-10-03 사용자. Changelog·Docs는 공개 헤더 내비에 이미 있다(`public-shell/header.tsx:57-64`) |
| 활성 행 (C16) | DESIGN:747·:838 `bg-accent + border-ring` | `ListRow selected` 7% | D3(사용자 지시) |
| 검색 행 글리프 (C17) | DESIGN:2003 "썸네일 16 · 일반 행 앞 글리프 없음" | 모든 행 28 타일 | 2026-10-03 사용자 |
| 비로그인 미리보기 Changelog | DESIGN §6.54 "비로그인은 하단 Menus" | 없음 | C4·D8 |

## 완료 조건 (검증 가능한 문장)

### 상태
- C1. 멤버십 조회가 `unavailable`이면 검색 Dialog에 `m.search.projectsUnavailable` 상태 줄이 서고 그룹은 Docs뿐이다(D7). `unauthorized`이면 세션 종료 상태 줄이 서고 그룹은 Docs뿐이다.
- C2. Keys 조회가 `unauthorized`면 상태 줄은 세션 종료 문장이고, `unavailable`이면 다음 행동을 담은 실패 문장이다. 세션 종료 문장은 기존 형 `Your session ended. Sign in again to …`를 따른다(새 형을 만들지 않는다).
- C3. 실패 상태 줄이 하나라도 있으면 `NoMatch`를 그리지 않는다. 실패 줄은 `text-destructive`이고 로딩 줄은 muted다.
- C4. **비로그인 검색은 Docs만 찾는다** (2026-10-03 사용자). `account === null`이면 Projects·Pages·Keys 그룹이 없다. 빈 입력 미리보기도 Docs 그룹(앞 3 + `Go to docs`) 하나다.
- C5. 보관 배지를 그리는 곳 여섯(검색 · 스위처 · `/projects` · Home 액션 · Logs 필터 · Sources 보관 머리)이 전부 `StatusBadge`이고 보관 행의 variant는 `soft-neutral`이다(D6). `StatusBadge`의 `className`에는 배치 클래스(`shrink-0`·`px-2`)만 있고 색 클래스는 0이다 — **동적 `state`(`CHIP_STATE[...]`)와 조건부 클래스도 센다.** `m.projects.archived`·`m.projects.status.archived`를 원시 `<Badge>`로 그리는 곳은 0이다.

### 판정
- C6. `/projects`·스위처·검색 Projects가 같은 입력 표에서 같은 행 집합을 낸다(토큰 AND, trim·소문자 — `matchesAllTokens`). 하이라이트 소비처는 검색·`/projects` 둘이고 같은 함수(`highlightSegments`)를 쓴다. 스위처는 하이라이트하지 않는다.
- C7. 검색 결과는 매칭에 쓴 필드만 하이라이트한다. Projects는 이름만 칠하고, Keys 행의 맥락(프로젝트 · 소스)은 칠하지 않는다.
- C8. 질의가 있을 때도 점수가 같으면 보관 프로젝트가 뒤로 간다(스위처와 같은 규칙).
- C9. IME 조합 **판정식**(`isComposing ||`·`=== 229`)은 `lib/keyboard.ts`의 `isImeComposing` 하나에만 있고, 테스트가 나머지 0을 센다. 조합 **상태 추적**(compositionstart/end ref)은 프리미티브 내부 훅 `components/ui/use-ime-guard.ts` 하나에만 있고 `Command`·오버레이 Content가 그것을 쓴다(D11 — 허용 목록). `Dialog`·`CommandDialog`·`LargeModal`·`Popover`·`DropdownMenuContent`는 조합 중 Esc로 닫히지 않는다(소비자 코드 없이).
- C10. 일반 클릭 판정은 `isPlainPrimaryClick` 하나이고, 손 사본 0을 테스트가 센다.

### 단축키·Kbd
- C11. 검색 단축키의 매처·칩 라벨·`aria-keyshortcuts`가 한 함수(`searchShortcut`)의 출력이다. 플랫폼 판정도 하나다. 플랫폼을 모르는 서버 렌더(`null`)에서는 칩과 `aria-keyshortcuts`가 없다(지금의 hydration 안전 동작 유지).
- C12. 키 이름(`⌘K`·`Ctrl K`·`↵`·`Esc`)은 `m.common.keys`에서 온다. `components/` 소스의 `<Kbd>` children에 문자열 리터럴이 0인 것을 테스트가 센다.
- C13. `Kbd`는 회색 면(테두리 없음) + `text-foreground/60`, 높이 `h-5`(20) 고정, 기본 `aria-hidden`이다(D14). 검색 Dialog 입력 오른쪽에 `Esc` 칩이 선다. Esc 칩은 표준 동작의 장식이라 `aria-keyshortcuts`를 따로 달지 않는다.

### 형
- C14. 헤더 검색 `FieldButton` 높이가 40(`h-10`)이다(D13). 두 헤더 모두.
- C15. **검색 결과 행은 `ListRow`다** (2026-10-03 사용자 — Logs·Sources·Account 행과 같은 IconTile + 제목 + 설명 조합을 재사용).
  - 행은 목록 폭을 꽉 채우고(radius 없음) `px-4 py-row-y`, `variant="canvas"`, `text-sm`이다.
  - 제목(맥락 포함)과 설명은 각각 한 줄 truncate다. 긴 키 이름도 줄바꿈하지 않는다.
  - 상태 줄·그룹 머리·0건의 왼쪽 16px이 타일의 왼쪽 가장자리와 한 선이고, 입력의 검색 글리프 중심이 타일 중심과 한 선이다.
  - 그룹 사이는 구분선 하나다. 손 조립 행(`CommandItem`의 자체 flex·padding·radius)이 0이다.
- C16. 활성 행은 `ListRow selected`(`bg-foreground/[0.07]`, DESIGN:321 "선택 7%")뿐이다. 테두리·포커스 링·hover 면은 없다(마우스를 둔 채 ↑↓를 눌러도 칠해진 행은 하나다). 그룹 머리는 `text-muted-foreground text-xs font-medium`이다.
- C17. **모든 검색 결과 행이 28 타일을 갖는다** (2026-10-03 사용자).
  - Projects는 `ProjectThumbnail size="sm"`(28)이다.
  - 나머지는 `IconTile size="sm"`이고, 글리프는 같은 목적지의 nav 항목 아이콘이다: `Go to your projects`=`Box`, Pages=그 nav 항목의 아이콘, `New project`=`Plus`(DESIGN 헤더 New project), Keys=`Languages`(Translations), Docs·`Go to docs`=`CircleHelp`.
  - 글리프는 `lib/shell/nav.ts` 항목에서 **nav key로** 꺼낸다(href로 조회하지 않는다 — Keys href에는 쿼리, Docs href에는 해시가 붙는다). 검색만의 하드코딩 글리프(`Folder`·`BookOpen`)가 0이다.
- C18. `CommandInput`에 지우기 X(`Input` clearable)가 있다.
- C19. **활성 행이 바뀌어도 어떤 행의 높이·제목 폭도 변하지 않는다** (2026-10-03 사용자). `Go to ↵` 힌트를 모든 행에 늘 렌더하고 활성 아닐 때는 `invisible`로 둔다. `Kbd`는 `h-5`(20)라 타일(28)보다 낮다.
- C20. 두 헤더의 로고 링크 radius가 같다(`rounded-sm`).

### 문구
- C21. 그룹명 `Menus` → `Pages`(D4).
- C22. `/projects` 목적지 라벨은 `Go to your projects`(`m.notFound.action`, D9), 문서 목적지 라벨은 `Go to docs`다. 검색 결과 어디에도 `/docs`로 가는 행은 하나다(D8).
- C23. 0건 제목은 `No {noun} match “{q}”`(곡선 따옴표, 제목 마침표 없음)로 통일한다 — `/projects`·스위처·리포 검색·번역 키 `noMatch`·`noIncompleteMatch`(`No incomplete keys match “{q}”`). 검색 Dialog의 `No results for “{q}”`만 예외이고 DESIGN §10.1에 등재한다. `terminology.test.ts`가 보간 0건 제목의 곧은 따옴표를 막는다.
- C24. 스위처 입력의 접근 이름은 `Search projects`, placeholder는 `Search projects…`다.
- C25. 가이드·README에서 금지어 `guides`(검색 그룹 뜻)·`menus`·`first import`가 0이고 `Docs`·`Pages`·`first sync`가 있다. 단축키 산문 표기는 `Cmd+K` / `Ctrl+K` 하나다(`guide/AUTHORING.md` 규칙).

### 구조
- C26. `lib/search/rows.ts`가 그룹·행·`ids`·상태 줄을 한 번에 낸다(`searchRows`·`searchStatuses`). 컴포넌트에는 그룹 순서·id 삼항·스니펫 폴백이 없다. `KEY_QUERY_MIN`·`SEARCH_GROUP_LIMIT`는 `match.ts` 한 곳에 있고 서버가 import한다(확인 필요 3). `PREVIEW_LIMIT`·`SNIPPET_LENGTH`는 `rows.ts`의 export하지 않는 지역 상수다.
- C27. `DialogContent`와 `CommandDialog`의 포커스 진입·복귀가 순수 핸들러 둘(`openAutoFocus`·`closeAutoFocus`) 한 벌이다(D10). 기존 포커스 그물 다섯이 green이다.

### 문서·게이트
- C28. 다음이 위와 일치한다: DESIGN §2.4·§6.4·§6.5·§6.54·§6.63·§10.1·:330·:524·:747·:838·:1203·:2003, PRODUCT §4.1(비로그인 = Docs만 · 그룹명 Pages · 멤버십 실패 = 상태 줄 + Docs 전용 · `Go to …` 라벨 · `/projects` 토큰 AND), ARCHITECTURE §6.37(:2723 Menus · :2728 "실패는 null"), DIRECTORY:443, guide `translate/edit.md`, README. D5를 의도로 기록한다. 판정은 grep 목록(tasks T11)으로 한다.
- C29. `pnpm gate` green. 각 `[commit]` 경계에서 `pnpm typecheck && pnpm test` green.

## 비목표

- **스위처를 `Command*`로 옮기는 것** — DESIGN §6.5가 따로 두기로 정했다. 키보드 모델 차이(activedescendant 방식 ↔ 항목 포커스 방식)는 그대로 둔다.
- **스위처에 하이라이트를 더하는 것** — 스위처 시각 변경은 보관 배지·문구뿐이다.
- **Keys의 매칭 규칙 변경** — 질의 전체 부분 일치를 유지한다. 토큰 AND 통일은 프로젝트 이름에만 적용한다.
- **번역 저장 단축키(Cmd/Ctrl+Enter)의 화면 힌트** — 편집 화면 UI 변경이라 별건이다(확인 필요 1).
- **검색 결과의 "현재 프로젝트" 표시** — 지금처럼 정렬로만 앞에 둔다.
- **"같은 문서" 정의 셋의 통합**(`search-dialog` · `use-leave-guard` · `navigation-dim`) — 판정 목적이 달라 이번에는 언급만 한다.
- **검색 Dialog의 Cmd/Ctrl+Enter 새 탭 열기**, **접근 이름 `Search` 중복**, **가이드 IA 이동**(검색 설명을 EDITOR 장 밖으로) — ⚪, 다음으로 미룬다.
- **수식키 정책 변경** — D5에 따라 현행을 유지한다.
- **`ProjectThumbnail sm`(radius 8)과 `IconTile sm`(radius 4)의 모서리 통일** — 프로젝트 정체 칸 8은 사용자 결정(2026-09-17)이다.
