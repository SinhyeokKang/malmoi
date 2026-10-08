# inbox-page — tasks

순서: 순수 함수 → 껍데기(Action) → 행 조각 이관 → 페이지·내비(한 커밋) → 실물 대조 → 정본 문서. `[C]`는 커밋 경계이고
**모든 경계의 검증은 `pnpm gate` green**이다(출력을 파이프로 거르지 않는다). 시안은 없다 — 대조 기준은 DESIGN.md와 Home 카드 실측이다.

## T1. 순수 함수 · store (테스트 먼저)

1. `clampSeenAt` — `lib/inbox/plan.ts`. 검증: `lib/inbox/__tests__/plan.test.ts`(design 표의 경계 케이스 전부) green.
2. `lib/inbox/unread-store.ts` — `get/set/subscribe` · `notifySeen`/`onSeen` · `useInboxUnread`(서버 스냅샷 0) · 머리 주석 "렌더 중 set 금지".
   검증: `lib/inbox/__tests__/unread-store.test.ts`(node: store) · `lib/inbox/__tests__/unread-store-hook.test.tsx`(파일 머리 `@vitest-environment jsdom`: 훅·서버 스냅샷) green. 환경은 파일별로 나누고 블록별 전환 설정은 추가하지 않는다.

⚠️ `client-graph.test.ts`의 lib 허용 목록 추가는 T4에서 한다 — 이 검사는 `app/`·`components/`의 클라이언트 진입점에서 도달하는 집합과 정확히 대조하므로, 소비자가 없는 T1에 먼저 등재하면 red다.

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
   Home 호출부가 기존 역할 판정으로 만든 `{ ...item, ownerRetries }`를 전달한다(design D3). 공유 슬롯에서 권한을 다시 판정하지 않는다.
   검증: 기존 `attention-inbox.test.tsx`·Home 테스트(`home-*.test.tsx`) 무수정 green + `components/__tests__/inbox-row-slots.test.tsx` green.
   Home 호출부 회귀 테스트를 추가해 EDITOR 적재 실패 안내 있음·OWNER 안내 없음·둘 다 안 읽음 점 없음을 검증한다.

`[C] refactor(inbox): share attention row slots across menu, home and page`

## T4. 페이지 · 내비 · 배지 · 이름 (한 커밋)

1. `routes.inbox()` + `isProtectedPath`에 `/inbox`. 검증: cookie 테스트에 `/preferences`와 같은 케이스 세트.
2. `app/(edit)/inbox/layout.tsx`(`ContentPanel`) · `loading.tsx`(실물 카드·행 배치 골격 + sr `inbox.loading`) · `page.tsx`(`requireUser` → `now` → `loadAttentionInbox` → `InboxList` + `MarkSeen`).
   검증: `app/(edit)/inbox/__tests__/page.test.tsx`(node, 의존성 mock) — 인증 거부 시 조회 0회 · 조회 중 시계가 전진해도 조회 전 ISO 시각 전달 · 렌더 중 읽음 Action·DB 쓰기 0회 · 조회 실패 전파 및 `MarkSeen` 미생성.
3. `components/inbox/inbox-list.tsx`(서버) — 프로젝트마다 `Card`(머리 썸네일 + 이름) + `ListRow` · 빈 상태 `EmptyState placement="card"`. 검증: `inbox-list.test.tsx` green.
4. `components/inbox/mark-seen.tsx`(클라이언트 섬). 검증: `inbox-mark-seen.test.tsx` green.
5. `AttentionInbox` — 안 읽음 수를 store로, `onSeen` 처리 셋(marked · 닫힘 0 + `readAll` · 열림 `clearOnClose`). 검증: `attention-inbox.test.tsx`에 design 표 케이스 추가 green.
   헤더 마운트 세대와 목록 요청 세대를 구분해 해제된 헤더의 응답·읽음 신호 전 목록 응답을 무효화하고 로딩 상태를 정리한다(design D2).
   검증: 이전 셸의 늦은 배지·목록 응답이 새 셸 store를 바꾸지 않음(StrictMode 포함) · 신호 전 목록의 지연 `marked:false`·성공·실패 응답이 캐시를 되살리지 않음 · 캐시 없는 열린 메뉴는 조회 재개 · 신호 후 새 조회의 실제 unread 보존.
   실제 소비 연결과 함께 `client-graph.test.ts`의 lib 허용 목록에 `lib/inbox/unread-store.ts`를 추가한다. 검증: 도달 집합과 허용 목록의 정확 일치 검사 green.
6. `navWorkItems`에 `inbox` · 사이드바 `InboxCount` 자식 · `navCountLabel`에 `inbox`.
   검증: nav 테스트 순서 · `sidebar-work-zone.test.tsx`(하드코딩 href 목록 + 배지 케이스) · `user-menu.test.tsx`(하드코딩 목록) · `landing-mockup.test.tsx`(work 항목 수) 갱신 후 green ·
   `app-frame.tsx` 항목 목록 주석 갱신.
7. store 격리 — `AttentionInbox`·`Sidebar`를 렌더하는 테스트 파일의 `afterEach`에 `setUnread(0)`.
8. 사전 en·ko·es — `common.nav.inbox` · `common.nav.inboxCount(n)` · `inbox.label`/`labelUnread` 값 변경 — `/translate` 모드 ①.
9. 개인정보 방침 — en 본문 Inbox 세 문장 · ko 본(`messages/ko-privacy.tsx`) · 개정 이력 · 시행일.
   검증: `policy-gate.test.tsx` · `no-korean-ui` · `dictionary-consistency` · `entry-points.test.ts`(보호 라우트·죽은 링크) · `client-graph.test.ts` green.

`[C] feat(inbox): add /inbox page with sidebar unread badge`

## T5. 실물 확인 (수동 — 로컬 UI + production preview prefetch)

`pnpm dev`(빌드와 동시에 돌리지 않는다 — 메모리 build-while-dev) → 로그인 →
- 사이드바 Inbox 클릭: 목록이 드롭다운과 같은 묶음·행·순서, 헤더·사이드바 배지가 이동 없이 함께 0, 새로고침 뒤 점 사라짐.
- 다른 화면에서 사이드바 배지 n = 헤더 배지(10 이상이면 헤더 `9+` · 사이드바 실제 수). 드롭다운을 열고 닫으면 사이드바 배지도 0.
- 비로그인 `/inbox` → `/signin`. 사이드바 `aria-current`(펼침·접힌 레일). 앱 셸·공개 셸(`/docs`) 사용자 메뉴의 Inbox 항목. 공개 셸 헤더 배지 동작 회귀 없음.
- 프로젝트 0개 사용자의 빈 상태. 전역 검색 Pages에 Inbox. 랜딩 목업 LNB에 Inbox 행이 씬을 밀지 않음.
- 자동 테스트로 응답 순서를 고정하는 것: 쓰기 실패 · 배지/목록 지연 응답 · 셸 전환 레이스.
검증: 위 로컬 항목 전부 관측. 로컬 UI 확인은 `/runtime-test`로 넘겨도 된다.

**prefetch는 production 모드 preview에서 별도 확인한다** — 개발 모드 hover는 prefetch가 생략돼 안전성을 입증하지 못한다.
`/inbox`로 이동하거나 드롭다운을 열지 않은 상태에서 대상 사용자의 `attentionSeenAt`을 DB에서 읽어 관측값을 기록하고, 사이드바 링크의 실제 prefetch RSC 요청 발생·완료를 네트워크에서 확인한 뒤 같은 DB 값을 비교한다.
배지 유지는 DB 불변의 증거로 쓰지 않는다. 요청이 발생하지 않으면 통과로 치지 않고 미검증으로 남긴다.
검증: 실제 prefetch 요청 완료 + DB 워터마크 전후 동일. loading 경계까지만 받은 경우에도 페이지 본체의 무부작용은 T4 서버 페이지 테스트가 별도로 보장한다.

## T6. DESIGN.md·Home 카드 기준 실측 대조

- 페이지 카드·행이 Home `Needs your attention` 카드와 같은 computed style(머리 · 행 패딩 · 글자 · 선), 사이드바 배지가 `Projects` 배지와 같은 형, 골격이 실물과 같은 배치(DESIGN §6.67) · 다크 토큰.
- 검증: 차이 0 또는 차이마다 근거 기록.

## T7. 정본 문서 (`/push` 4단계와 함께)

- PRODUCT §4.1 · §4.2 범용 알림 절 · §7.7 / ARCHITECTURE §6.365 · §6.37 / DESIGN §6.545 · §6.5(헤더 행 · 사이드바 배지 규칙 · 랜딩 목업 행) / DIRECTORY / CLAUDE.md 데이터 변경 경로 표.
- 가이드: 헤더 Inbox 이름·사이드바·사용자 메뉴를 언급하거나 찍은 컷이 있으면 `/guide`·`/guide-shots`.
- 기능 종료 시 `docs/features/inbox-page/` 삭제.

`[C] docs(PRODUCT|ARCHITECTURE|DESIGN|DIRECTORY): …` — 문서별 커밋.
