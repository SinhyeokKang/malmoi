# inbox-page — tasks

순서: 순수 함수 → 껍데기(Action) → 행 조각 이관 → 페이지·내비(한 커밋) → 실물 대조 → 정본 문서. `[C]`는 커밋 경계이고
**모든 경계의 검증은 `pnpm gate` green**이다(출력을 파이프로 거르지 않는다). 시안은 없다 — 대조 기준은 DESIGN.md와 Home 카드 실측이다.

## T1. 순수 함수 · store (테스트 먼저)

1. `clampSeenAt` — `lib/inbox/plan.ts`. 검증: `lib/inbox/__tests__/plan.test.ts`(design 표의 경계 케이스 전부) green.
2. `lib/inbox/unread-store.ts` — `get/set/subscribe` · `notifySeen`/`onSeen` · `useInboxUnread`(서버 스냅샷 0) · 머리 주석 "렌더 중 set 금지".
   검증: `lib/inbox/__tests__/unread-store.test.ts`(store는 node, 훅은 jsdom 블록) green · `client-graph.test.ts` lib 허용 목록에 추가.

⚠️ 이 커밋엔 `routes.inbox()`·`navWorkItems`·사전 키를 넣지 않는다 — page가 없으면 `entry-points.test.ts` 죽은 링크 검사가, 키가 없으면 typecheck가 red다.

`[C] feat(inbox): add seen clamp and unread store`

## T2. Action

1. `markSeen(prisma, userId, at)` 추출 — `openAttentionInboxAction`이 그것을 부르도록. 검증: 기존 `app/inbox/__tests__/actions.test.ts` 무수정 green(동작 불변).
2. `markAttentionSeenAction(at: unknown)` — 반환 형·세션 거부 줄은 design D1 그대로.
   검증: 같은 테스트 파일에 design 표 케이스 green · `entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 `inbox/actions.ts#markAttentionSeenAction`(사유 주석) 등재 후 green.

`[C] feat(inbox): add mark-seen action for the inbox page`

## T3. 행 조각 추출 · Home 이관

1. `components/inbox/row-slots.tsx` — 드롭다운 `Row`의 슬롯 생성을 옮긴다(`m`·`uiLocale` 인자, `time: "narrow" | "long"`).
2. `AttentionInbox`가 그것을 쓰도록 치환 — `itemKey` 유지.
3. Home `AttentionCard`의 `AttentionRow`를 같은 조각(`long`)으로 이관.
   검증: 기존 `attention-inbox.test.tsx`·Home 테스트(`home-*.test.tsx`) 무수정 green + `components/__tests__/inbox-row-slots.test.tsx` green.

`[C] refactor(inbox): share attention row slots across menu, home and page`

## T4. 페이지 · 내비 · 배지 · 이름 (한 커밋)

1. `routes.inbox()` + `isProtectedPath`에 `/inbox`. 검증: cookie 테스트에 `/preferences`와 같은 케이스 세트.
2. `app/(edit)/inbox/layout.tsx`(`ContentPanel`) · `loading.tsx`(실물 카드·행 배치 골격 + sr `inbox.loading`) · `page.tsx`(`requireUser` → `now` → `loadAttentionInbox` → `InboxList` + `MarkSeen`).
3. `components/inbox/inbox-list.tsx`(서버) — 프로젝트마다 `Card`(머리 썸네일 + 이름) + `ListRow` · 빈 상태 `EmptyState placement="card"`. 검증: `inbox-list.test.tsx` green.
4. `components/inbox/mark-seen.tsx`(클라이언트 섬). 검증: `inbox-mark-seen.test.tsx` green.
5. `AttentionInbox` — 안 읽음 수를 store로, `onSeen` 처리 셋(marked · 닫힘 0 + `readAll` · 열림 `clearOnClose`). 검증: `attention-inbox.test.tsx`에 design 표 케이스 추가 green.
6. `navWorkItems`에 `inbox` · 사이드바 `InboxCount` 자식 · `navCountLabel`에 `inbox`.
   검증: nav 테스트 순서 · `sidebar-work-zone.test.tsx`(하드코딩 href 목록 + 배지 케이스) · `user-menu.test.tsx`(하드코딩 목록) · `landing-mockup.test.tsx`(work 항목 수) 갱신 후 green ·
   `app-frame.tsx` 항목 목록 주석 갱신.
7. store 격리 — `AttentionInbox`·`Sidebar`를 렌더하는 테스트 파일의 `afterEach`에 `setUnread(0)`.
8. 사전 en·ko·es — `common.nav.inbox` · `common.nav.inboxCount(n)` · `inbox.label`/`labelUnread` 값 변경 — `/translate` 모드 ①.
9. 개인정보 방침 — en 본문 Inbox 세 문장 · ko 본(`messages/ko-privacy.tsx`) · 개정 이력 · 시행일.
   검증: `policy-gate.test.tsx` · `no-korean-ui` · `dictionary-consistency` · `entry-points.test.ts`(보호 라우트·죽은 링크) · `client-graph.test.ts` green.

`[C] feat(inbox): add /inbox page with sidebar unread badge`

## T5. 로컬 실물 확인 (수동 — e2e 없음)

`pnpm dev`(빌드와 동시에 돌리지 않는다 — 메모리 build-while-dev) → 로그인 →
- 사이드바 Inbox 클릭: 목록이 드롭다운과 같은 묶음·행·순서, 헤더·사이드바 배지가 이동 없이 함께 0, 새로고침 뒤 점 사라짐.
- 다른 화면에서 사이드바 배지 n = 헤더 배지(10 이상이면 헤더 `9+` · 사이드바 실제 수). 드롭다운을 열고 닫으면 사이드바 배지도 0.
- 사이드바 링크에 마우스를 올려 prefetch만 일으킨 뒤 `attentionSeenAt` 불변(Studio 또는 배지 유지로 관측).
- 비로그인 `/inbox` → `/signin`. 사이드바 `aria-current`(펼침·접힌 레일). 앱 셸·공개 셸(`/docs`) 사용자 메뉴의 Inbox 항목. 공개 셸 헤더 배지 동작 회귀 없음.
- 프로젝트 0개 사용자의 빈 상태. 전역 검색 Pages에 Inbox. 랜딩 목업 LNB에 Inbox 행이 씬을 밀지 않음.
- 자동 테스트에 맡기는 것(수동 재현 불가): 쓰기 실패 · 배지 응답 지연 레이스.
검증: 위 항목 전부 관측. `/runtime-test`로 넘겨도 된다.

## T6. DESIGN.md·Home 카드 기준 실측 대조

- 페이지 카드·행이 Home `Needs your attention` 카드와 같은 computed style(머리 · 행 패딩 · 글자 · 선), 사이드바 배지가 `Projects` 배지와 같은 형, 골격이 실물과 같은 배치(DESIGN §6.67) · 다크 토큰.
- 검증: 차이 0 또는 차이마다 근거 기록.

## T7. 정본 문서 (`/push` 4단계와 함께)

- PRODUCT §4.1 · §4.2 범용 알림 절 · §7.7 / ARCHITECTURE §6.365 · §6.37 / DESIGN §6.545 · §6.5(헤더 행 · 사이드바 배지 규칙 · 랜딩 목업 행) / DIRECTORY / CLAUDE.md 데이터 변경 경로 표.
- 가이드: 헤더 Inbox 이름·사이드바·사용자 메뉴를 언급하거나 찍은 컷이 있으면 `/guide`·`/guide-shots`.
- 기능 종료 시 `docs/features/inbox-page/` 삭제.

`[C] docs(PRODUCT|ARCHITECTURE|DESIGN|DIRECTORY): …` — 문서별 커밋.
