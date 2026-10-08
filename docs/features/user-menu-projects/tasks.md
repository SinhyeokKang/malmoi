# user-menu-projects — tasks

순서: 순수 함수 → 행 조각(스위처 이관) → 메뉴(앱 셸 입력) → 공개 셸 지연 로드 → 실물 → 문서. 각 태스크는 **테스트 먼저**(`/tdd`로 red 확인 → 구현)다.
`[C]`는 커밋 경계이고 **모든 경계의 검증은 `pnpm gate` green**(출력을 파이프로 거르지 않는다). 자동 검증(`pnpm gate`)과 수동 확인(T5)을 구분한다 — e2e는 없다. 시안 없음. 마이그레이션 없음(`scripts/gate-plan.ts` postgres 트리거에도 안 걸린다).

## T1. `menuProjects` (테스트 먼저)

- `lib/shell/__tests__/switcher.test.ts`에 design 표 케이스(보관 제외 · 정확히 5 → 5 · 6 → 앞 5 · 순서 유지 · 0개 · 보관만) red → `lib/shell/switcher.ts`에 `menuProjects` + export하지 않는 상한 상수.
  검증: 그 케이스 green.

`[C] feat(shell): pick user menu projects from the switcher order`

## T2. `ProjectMenuItem` 조각 + 스위처 이관 (테스트 먼저)

1. `components/shell/project-menu-item.tsx` — `ProjectMenuItem`(rest props spread · `selected` 그대로 전달 · 보관 배지) + `ProjectMenuItemSkeleton`(D3).
2. `project-switcher.tsx:142-152`를 조각으로 이관 — `{...keepInputFocus}`는 rest props로 넘긴다.
   검증: 조각 테스트(골격·실물 행의 패딩·gap·썸네일 슬롯 클래스 대응 · 골격 `aria-hidden`·`menuitem` 아님 · `selected` 미전달이면 `menuitem`) red → green ·
   `project-switcher.test.tsx` **무수정** green · `slottable-item.test.ts` green.

`[C] refactor(shell): extract project menu item from the switcher`

## T3. 앱 셸 사용자 메뉴의 프로젝트 그룹 (테스트 먼저)

1. `UserMenu`에 `memberships?: readonly NavProject[]` — 계정 그룹 뒤·공개 그룹 앞에 그룹 + 구분선, 0개면 둘 다 없음. 지금 프로젝트는 `usePathname()` + `activeProject`(`lib/shell/nav.ts`). Content `w-60`. 머리 주석 순서 목록 갱신.
2. `components/shell/header.tsx`가 `memberships`를 넘긴다(`current`는 넘기지 않는다 — 서버 컴포넌트).
3. **기존 테스트 갱신**: `user-menu.test.tsx`의 `rows()`·`item()`(`:25-30`)을 `menuitem`·`menuitemradio` 둘 다 세게 넓히고, "모든 항목의 첫 자식이 `size-4` svg"(`:73-81`)에서 프로젝트 그룹을 뺀다. `vi.mock("next/navigation")`(usePathname)·href를 기록하는 `next/link` mock(`project-switcher.test.tsx:18` 형)을 더한다.
   검증: `user-menu.test.tsx` 새 케이스(다섯 구획 순서 · href · 지금 프로젝트 `aria-checked` · 프로젝트 밖 경로 `menuitemradio` 0개 · 0개 · 로더 호출 0 · 지금 프로젝트 항목을 **연 상태로 렌더하고 키보드 Enter로 고르기** — modal의 `pointer-events:none` 때문에 클릭이면 `pointer-events:auto`를 기다린다) red → green ·
   `shell-header.test.tsx`(`memberships` 전달) · `sign-out-pending.test.tsx` · `header-44.test.tsx` green · `pnpm typecheck` green(prop 선택형이라 기존 호출부 무수정).

`[C] feat(shell): list projects in the user menu`

## T4. 공개 셸 — 열기 직전 읽기 (테스트 먼저)

1. `UserMenu`가 `memberships`가 없으면 D2의 보유 Promise 규칙으로 `loadSearchMemberships`를 부른다 · 응답 전 골격 한 줄 + 지연 삽입 상태 문장(`projects.loading`, Inbox `LiveStatus` 형 — 손 사본 둘이면 공유 조각) · 실패면 그룹 없음.
2. `PublicHeader` **무변경**(memberships를 안 넘긴다).
3. 사전 — 새 키 없음.
   검증(`user-menu.test.tsx` — mock 위치는 Action(`@/app/search/actions`), 지연 Promise는 `global-search.test.tsx:43`의 `deferred` 관용구):
   - pointerenter 1회 → 호출 1 · hover in/out 반복(열지 않음) → 호출 1 · hover 뒤 열기 → 호출 1이고 이미 온 응답이면 바로 목록
   - 키보드만(focus → Enter) → 호출 1(focus·open 중복 없음)
   - 열기 → 닫기 → 열기 뒤 옛 응답이 새 응답보다 **먼저** 오는 경우·**나중에** 오는 경우 각각 → 새 응답만 그린다
   - `unauthorized`·`unavailable` 각각 → 그룹·구분선 없음, 다른 항목 그대로
   - 응답 전 골격 한 줄 + polite region 존재 · 성공 → 목록
   - 키보드로 연 뒤(포커스 첫 항목) 응답 도착 → `activeElement`가 **같은 노드**(`toBe`)이고 `body` 아님
   - 대기 중 언마운트 → 경고·에러 없음
   - 회차 무효화·1회 시작 코드를 지우면 해당 케이스가 red인지 확인(뮤테이션 — POSTMORTEM 2026-09-20)
   - `public-shell.test.tsx`: `@/app/search/actions` mock 추가 → **로그인한 공개 셸이 렌더·마운트만으로 호출 0**
   - `client-graph.test.ts` green

`[C] feat(public-shell): load user menu projects before open`

## T5. 실물 확인 (수동)

준비: 멤버십이 **비보관 ≥6 + 보관 ≥1**인 계정. dev DB 상주 OWNER 프로젝트(4개)는 지우지 않는다 — 부족분을 새로 만들지·만든 뒤 지울지는 착수 때 사용자에게 묻는다.
`pnpm dev`(빌드와 동시에 돌리지 않는다) → 로그인 → 앱 셸·`/docs`에서 아바타 메뉴를 **실제로 연다**:

- 그룹 위치 · 5개 상한 · 보관 제외 · 지금 프로젝트 체크(지금 프로젝트가 보관이면 체크 없음) · `/projects`에서 체크 없음
- 긴 프로젝트 이름·긴 이메일 truncate · 메뉴 폭 `w-60`(computed) · 썸네일 없는 프로젝트의 글리프 폴백
- 골격 줄 높이 = 항목 높이(computed style) · 프로젝트 1개 응답에서 메뉴 높이 변화 0 · N개면 아래로만 늘고 트리거 위치 불변
- 네트워크 스로틀 상태에서 열자마자 `Sign out`·`Docs`를 누른다 → 밀림으로 오착하는지 기록(수용한 대가의 실측)
- 키보드 이동 · 다크
- **스위처 회귀**: LNB 스위처를 열어 지금 프로젝트가 보이는 상태에서 다른 항목 고르기 · 검색 입력 포커스 유지(IME) · 보관 배지
- 공개 셸에서 아바타 메뉴와 같은 헤더의 Inbox·⌘K 검색을 각각 한 번씩 연다

검증: 위 항목 관측 기록. `/runtime-test`로 넘겨도 된다.

## T6. 정본 문서 (`/push` 4단계)

- design "문서 갱신" 목록 전부 — DESIGN §6.5·§6.615·§6.8 · ARCHITECTURE §6.37·경계 표 · PRODUCT:250·:948 · CLAUDE.md 데이터 경로 표 · DIRECTORY. 가이드는 영향 없음(SHOOTING 매핑 0).
- responsive-public P-01·P-06 · responsive-app A-01 행에 이 그룹을 등재(해당 디렉터리가 남아 있으면).
- 기능 종료 시 `docs/features/user-menu-projects/` 삭제.
  검증: 각 문서의 해당 줄이 새 소비자·새 결정을 말한다 · `pnpm sync:agents:check` green(CLAUDE.md 수정).

`[C] docs(DESIGN|ARCHITECTURE|PRODUCT|DIRECTORY): …` · `docs(CLAUDE): …` — 문서별 커밋.
