# user-menu-projects — design

## 영향 받는 흐름

**편집 UI 셸만.** push·pull·export와 무관하다. 새 서버 조회·Action·스키마·환경변수 없음.

| 자리 | 변경 |
|---|---|
| `lib/shell/switcher.ts` | 순수 함수 `menuProjects(rows)` — `switcherProjects(rows, "")`에서 보관을 빼고 앞 5개 |
| `components/shell/project-menu-item.tsx` (신규) | `ProjectMenuItem` 행 조각 + `ProjectMenuItemSkeleton` 한 줄 골격(D3) |
| `components/shell/project-switcher.tsx` | 행 JSX(`:142-152`)를 `ProjectMenuItem`으로 이관 |
| `components/shell/user-menu.tsx` | prop `memberships?: readonly NavProject[]` 하나 — 있으면 그대로, 없으면 지연 조회(D2). 지금 프로젝트는 안에서 `usePathname()` + `activeProject`로 구한다. Content `w-60`. 머리 주석의 순서 목록 갱신(이미 Inbox·Preferences가 빠져 낡았다) |
| `components/shell/header.tsx` | `memberships`를 `UserMenu`로 넘긴다 — ⚠️ 서버 컴포넌트라 pathname이 없다. `current`는 넘기지 않는다 |
| `components/public-shell/header.tsx` | **변경 없음** — `memberships`를 안 넘기면 `UserMenu`가 지연 조회한다 |

## 핵심 결정

### D1. 목록 = 스위처 순서에서 보관 제외 앞 5개

`menuProjects(rows) = switcherProjects(rows, "").filter((r) => !r.archived).slice(0, LIMIT)`. 상한 5는 이 파일의 **export하지 않는 모듈 상수**다(소비자 `menuProjects` 하나 — 테스트는 "6개 → 5개"를 리터럴로 단언한다).
스위처 순서는 멤버십 순서(slug 오름차순) + 보관 뒤(`lib/shell/switcher.ts` 머리 주석). 지금은 `rows.filter(!archived).slice(0,5)`와 결과가 같지만, 스위처 순서가 바뀌면 메뉴도 따라가도록 **의도로 묶는다** — 정렬을 새로 만들지 않는다.
⌘K 빈 입력 미리보기(`lib/search/match.ts`의 `previewGroups` — 지금 먼저)와는 다르다 — 그쪽은 검색 맥락의 추천이고 메뉴는 목록이다(spec 비목표).
타입은 `switcherProjects`와 같은 제네릭(`slug·name·archived` + 나머지 그대로) — `NavProject`의 썸네일 `image`가 따라온다.

### D2. 공개 셸 — 열기 직전 미리 읽기, 보유 Promise 하나

입력 형은 `SearchTrigger`/`SearchDialog`의 관례(`memberships?` — `undefined`면 지연 로드)를 따른다. 공개 셸 헤더는 `account`만 갖고 멤버십을 받지 않는다(`PublicHeader` props는 `m·account·current`).
페이지 렌더에 `loadMemberships`를 싣지 않는다 — 로그인한 공개 페이지 방문마다 조회가 하나 늘고, 메뉴를 열지 않는 사람이 대부분이다. 서버 컴포넌트는 함수 prop을 넘길 수 없으므로 "헤더가 로더를 넘긴다"는 대안은 성립하지 않는다.

**회차 규칙 (한 문장)**: ref에 Promise **하나**를 보유한다 — 트리거의 `onPointerEnter`·`onFocus`·`onOpenChange(true)` 중 어느 것이 와도 **보유한 Promise가 없을 때만** `loadSearchMemberships()`를 시작해 보유하고, **메뉴가 닫힐 때 비운다.** 응답은 `ref.current === 그 Promise`일 때만 그린다.

| 상황 | 결과 |
|---|---|
| hover만 반복하고 열지 않음 | 닫힘이 없으니 보유가 유지 — 호출 1회 |
| hover 뒤 열기 | 보유한 Promise를 쓴다(이미 도착했으면 바로 목록) — 호출 1회 |
| 키보드 Tab으로 트리거 통과(`onFocus`) | 시작한다 — 열기 직전 신호로 본다 |
| focus 뒤 Enter로 열기 | focus에서 시작한 것을 쓴다 — 호출 1회 |
| 열기 → 닫기 → 열기 | 닫힘에서 비웠으니 새로 시작 — 옛 응답은 identity가 달라 버린다(먼저 오든 나중에 오든) |
| 대기 중 언마운트 | 응답을 그리지 않는다(경고 없음) |

- 로더 계약 "성공·실패 모두 다음 열기에 재사용하지 않는다"(`lib/search/load-memberships.ts`)는 **열기 회차 단위**로 지킨다 — 열기 직전 미리 읽기는 그 회차의 일부다. PRODUCT:250·ARCHITECTURE §6.37의 "열 때마다 새로 받는다"에 이 한 줄을 더한다(T6).
- 카운터(세대 번호)를 따로 두지 않는다 — Promise identity가 닫힌 뒤 응답·이전 회차 응답·A→B 역전(POSTMORTEM 2026-09-13)을 모두 가른다. `SearchDialog`의 `membershipRequest` ref와 같은 계열이다.
- **응답 전**: 그룹 자리에 `ProjectMenuItemSkeleton` **한 줄**과 앞 구분선. 상태 문장은 아래 D4.
- **성공**: D1 목록. 0개면 그룹·구분선이 사라진다.
- **실패**(`unauthorized`·`unavailable` — throw는 로더가 `unavailable`로 접는다): 그룹·구분선이 사라진다. 오류 문구·Retry는 세우지 않는다 — 위 그룹 `Projects`가 같은 목적지로 가고, 메뉴 안 지름길이 없어질 뿐 막힌 일이 없다. Inbox(danger+Retry)·검색(danger 줄)과 갈리는 것은 **의도**이고 DESIGN §6.5에 적는다(T6 — `/ux-audit` 드리프트 오판 방지).
- **항목 밀림 — 대가로 수용**: 스켈레톤 1줄이 최대 5줄로 바뀌면 공개 그룹·Sign out이 최대 4줄(약 128px) 내려가고, 실패하면 골격·구분선만큼 올라간다. 열기 직전 미리 읽기가 그 완화책이다 — 열 때 응답이 이미 와 있는 경우가 대부분이 되게 한다. 골격은 실물보다 길지 않게 한 줄이다(DESIGN "골격이 실물보다 길면 안 된다"). 폭은 `w-60` 고정이라 응답으로 넓어지지 않는다.
- **앱 셸에는 이 경로가 없다** — `memberships`가 있으면 로더를 부르지 않는다. 같은 컴포넌트가 두 셸의 한 벌이라 그룹 순서가 갈리지 않는다.
- 참고(T4 관측): Next는 Server Action을 클라이언트 큐에서 하나씩 처리한다 — hover로 시작한 읽기가 같은 메뉴의 Sign out 폼 Action·헤더 Inbox Action과 줄을 선다.

### D3. 행 — `ProjectMenuItem`으로 뽑고 스위처를 이관한다

손 사본이 스위처와 메뉴 둘이 되는 것은 확정이므로 **같은 배치에서** 조각으로 뽑는다(작업 원칙 — 실재하는 손 사본의 이관).

- 위치: `components/shell/project-menu-item.tsx` — 프로젝트 도메인 조각이라 `components/ui/`(프리미티브)가 아니다. 프리미티브 수는 그대로다.
- `ProjectMenuItem({ project, selected, ...itemProps })` = `DropdownMenuItem asChild selected={selected}` + `<Link href={routes.project(slug)}>` + `ProjectThumbnail xs` + `<span className="min-w-0 flex-1 truncate">`.
- `selected`는 **`current == null ? undefined : slug === current`** — `false`만 넘겨도 `menuitemradio aria-checked=false`가 되므로(`components/ui/dropdown-menu.tsx`), 지금 프로젝트가 없는 자리에서는 일반 `menuitem`이다. 스위처는 기존대로 넘긴다.
- 스위처의 `{...keepInputFocus}`(검색 입력 IME 보호)는 전용 prop 없이 rest props spread로 받는다 — 메뉴는 넘기지 않는다(입력이 없어 Radix 기본 hover 포커스가 정상이다).
- `Archived` 배지는 조각 안에서 `project.archived`로 그린다 — 메뉴 목록엔 보관이 없어 그 분기를 타지 않는다.
- `ProjectMenuItemSkeleton`은 **같은 파일**에 둔다 — 행 높이(`DropdownMenuItem` 패딩 · 썸네일 16 · text-sm line box)가 따로 떠내려가면 골격과 실물이 갈린다(POSTMORTEM 2026-09-16·2026-10-08, `DropdownMenuRowSkeleton`이 행 옆에 있는 선례). `DropdownMenuItem`과 같은 패딩·gap + `Skeleton` 16 사각(썸네일 자리) + `Skeleton` 한 줄. 메뉴 항목이 아니므로 `aria-hidden`이고 포커스를 받지 않는다. 기존 `DropdownMenuRowSkeleton`은 두 줄 `DropdownMenuRow`용이라 쓰지 않는다. 스피너 없음(`visual-system.test.ts`가 `user-menu.tsx`의 `animate-spin`을 1개로 고정한다).
- ⚠️ `asChild` + `selected` 조합은 POSTMORTEM 2026-09-09(형제 붙임으로 셸이 죽었다)의 자리다 — 프리미티브는 이미 `Slottable`로 고쳐졌지만 메뉴 테스트에 "지금 프로젝트 항목을 연 상태로 렌더 · 고르기"를, T4에 스위처 실물 회귀를 넣는다.

### D4. 문구·상태 문장

**새 키가 없다.** 그룹 머리 라벨을 두지 않는다 — 다른 그룹도 머리가 없고, 썸네일이 대상을 말한다(DESIGN §6.4 "모양이 대상을 말한다"). `role="group"`+`aria-label`도 두지 않는다(spec 비목표 — `DropdownMenuGroup` export가 없다).
로딩 상태 문장은 Inbox 정본(DESIGN:922)과 같은 형이다 — `aria-busy` 밖에 sr-only polite region을 메뉴 면과 함께 **빈 채로** 세우고, 문장(`projects.loading`)은 지연 삽입한다(내용과 함께 나타난 region은 낭독이 보장되지 않는다). Inbox의 `LiveStatus`(`components/shell/attention-inbox.tsx:181`)와 손 사본 둘이 되면 같은 배치에서 공유 조각으로 올린다.

## 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

| 대상 | 테스트 파일 · 환경 | 케이스 |
|---|---|---|
| `menuProjects(rows)` | `lib/shell/__tests__/switcher.test.ts` (node) | 보관 제외 · 정확히 5개 → 5개 · 6개 → 앞 5 · 스위처 빈 질의 순서 유지 · 0개 → 빈 배열 · 보관만 있으면 빈 배열 |
| `ProjectMenuItem`·골격 | `components/__tests__/user-menu.test.tsx` (jsdom) | 골격 줄과 실물 행이 같은 패딩·gap·썸네일 슬롯 `size-4` 클래스 · 골격 `aria-hidden`·`menuitem` 아님 |
| `UserMenu` (`memberships` 있음) | 같은 파일 | 다섯 구획 순서(`menuitem`·`menuitemradio` 둘 다 셈) · 항목 href = 프로젝트 Home · 지금 프로젝트 `aria-checked` · 프로젝트 밖 경로 `menuitemradio` 0개 · 0개면 그룹·구분선 없음 · 로더 호출 0 · 지금 프로젝트 항목 연 상태로 렌더·고르기 |
| `UserMenu` (`memberships` 없음) | 같은 파일 | D2 표의 여섯 행 · 응답 전 골격 한 줄 + 상태 문장 · 성공 → 목록 · `unauthorized`·`unavailable` 각각 → 그룹 없음·다른 항목 그대로 · 응답 도착 때 포커스 노드 동일 |
| 헤더 배선 | `shell-header.test.tsx` · `public-shell.test.tsx` | 앱 셸이 `memberships`를 넘긴다 · 로그인한 공개 셸이 렌더·마운트만으로 Action 호출 0 |

## 스키마 변경

**없음.**

## 새 환경변수

**없음.**

## 불변식 영향

- export 결정성·blob SHA: **없음**.
- 인증·테넌트: 새 쿼리 없음. 공개 셸은 기존 `loadSearchMembershipsAction`(세션 userId 제한, 일곱 필드 — `entry-points.test.ts`의 `USER_SCOPED_ACTIONS`가 고정)을 그대로 쓴다. §6.37이 "공개 셸도 호출할 수 있다"고 이미 허용하고, 반환 필드는 공개 셸 검색이 이미 받는 것과 같아 새 노출이 없다. 인가는 이동한 페이지의 `requireProjectAccess`가 한다. 검색용 이름의 Action에 검색 아닌 소비자가 붙는다는 점을 문서에 적는다(T6).
- 개인정보: 새 필드·쿠키·전송처 없음 — 방침 변경 없음.
- `client-graph.test.ts`: **변화 없음** — `lib/shell/switcher.ts`·`lib/search/load-memberships.ts`는 이미 허용 목록에 있고 load-memberships의 도달 그래프도 고정돼 있다. Action은 `"use server"`라 순회가 거기서 멈춘다.

## POSTMORTEM 인용

- **2026-09-09 — `asChild` 자식 옆 형제로 스위처를 열면 셸이 죽었다**: 같은 `asChild + selected` 조합을 쓰고 스위처 행을 조각으로 옮긴다 — 렌더·고르기 테스트 + 실물에서 스위처를 **열어** 고르기(T4).
- **2026-09-13 — 늦은 응답 재사용**: Promise identity로 회차를 가른다(D2) — A→B 역전 두 순서를 테스트한다.
- **2026-09-20 · 09-24 — 포커스 복귀·`body`로 빠지는 포커스**: 메뉴 안 행 수가 응답에 따라 바뀐다 — 골격 줄은 포커스를 받지 않고, 그룹 밖 항목의 key를 바꾸지 않아 응답이 와도 지금 포커스 항목이 다시 마운트되지 않는다. 테스트는 `activeElement` **노드 동일성**으로 단언한다("남아 있음"은 jsdom에서 공회전한다).
- **2026-10-08 — 로딩 막대 길이가 실물 행의 슬롯 폭을 대신했다**: 골격을 행과 같은 파일에 두고 클래스 대응을 단언한다(D3).
- **2026-10-08 — 모달 DOM 존재를 클릭 준비 완료로 간주**: DropdownMenu는 modal이라 body에 `pointer-events:none`을 건다 — 고르기는 키보드(Enter)로 하거나 `pointer-events:auto`를 기다린다.

## 문서 갱신 (실제 갱신은 T6 — `/push` 4단계)

- DESIGN §6.5 헤더 행(:857) — 프로젝트 그룹(상한 5 · 보관 제외 · 스위처 순서 · `w-60` · 공개 셸은 열기 직전 조회 · 실패는 조용히 숨김이 의도) + "LNB와 겹침"을 프로젝트 구역까지 넓힌 **새 결정**.
- DESIGN §6.615 공개 헤더 행(:1086) — 헤더가 세션 외 조회를 하지 않는다는 서술에 사용자 메뉴의 열기 직전 조회를 더한다.
- DESIGN §6.8 아이콘 표(:2150) 헤더 사용자 메뉴 행 — 프로젝트 행은 글리프 대신 `ProjectThumbnail xs`.
- ARCHITECTURE §6.37(:3144-3150) — `loadSearchMembershipsAction` 소비자에 공개 셸 사용자 메뉴, 열기 회차 단위 규칙. 경계 표(:2293) 같은 행.
- PRODUCT:250(열 때마다 새로 받는다 + 열기 직전 미리 읽기) · :948(사용자 메뉴에 프로젝트 지름길 — 새 결정).
- CLAUDE.md 데이터 경로 표의 `loadSearchMembershipsAction` 행("공개 셸용 읽기") — 소비자 둘.
- DIRECTORY.md `components/shell/project-menu-item.tsx` 신규 + `app/search/actions.ts` 줄(:156·:940 근처).
- 가이드 — **영향 없음**: `guide/SHOOTING.md`에 사용자 메뉴를 연 매핑 행이 0이고, 가이드 본문의 "avatar menu → Account/Preferences" 서술은 바뀐 뒤에도 참이다.
