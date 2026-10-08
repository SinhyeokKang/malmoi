# inbox-page — design

## 영향 받는 흐름

**편집 UI만.** push·pull·export와 무관하다. 데이터는 이미 있는 `loadAttentionInbox(prisma, userId)`(ARCHITECTURE §6.365)를 그대로 쓴다.

| 자리 | 변경 |
|---|---|
| `app/(edit)/inbox/{layout,page,loading}.tsx` | 신설 — `/mcp`·`/preferences`와 같은 사용자 축 한 장짜리 라우트(`ContentPanel` 레이아웃) |
| `app/inbox/actions.ts` | `markAttentionSeenAction` 추가 + 열기 Action과 쓰기 한 벌(`markSeen`) 공유 |
| `lib/inbox/plan.ts` | 순수 함수 `clampSeenAt` |
| `lib/inbox/unread-store.ts` | 탭 안 안 읽음 수 store(클라이언트) |
| `lib/shell/nav.ts` `navWorkItems` | `inbox` 항목(Projects 바로 뒤) |
| `lib/routes.ts` | `routes.inbox()` |
| `lib/auth/cookie.ts` `PROTECTED` | `/inbox` 정규식(`/preferences`와 같은 형) |
| `components/inbox/row-slots.tsx` | 공유 행 조각 — 드롭다운 · 페이지 · Home 카드 |
| `components/inbox/{inbox-list,mark-seen}.tsx` | 페이지 목록(서버) · 읽음 기록 섬(클라이언트) |
| `components/shell/attention-inbox.tsx` | 행 조각 사용 · 안 읽음 수를 store로 · 읽음 신호 처리 · 접근 이름 `Inbox` |
| `components/home/attention-card.tsx` | `AttentionRow`를 공유 행 조각으로 이관 |
| `components/shell/sidebar.tsx` · `nav-count.ts` | `inbox` 항목 배지 = store 값 · sr `{n} unread` |
| `messages/{en,ko,es}.tsx` · `messages/ko-privacy.tsx` | 새 키 · `inbox.label`/`labelUnread` 값 변경 · 방침 서술·개정 이력 |

⚠️ **`app/inbox/`(Action, 페이지 없음)와 `app/(edit)/inbox/`(페이지)가 같은 세그먼트 `/inbox`로 풀린다.** `page.tsx`는 한쪽에만 있어
충돌하지 않는다(`app/search/` 선례). Action을 `(edit)` 안으로 옮기지 않는다 — 공개 셸 헤더도 부른다(§6.365).

## 핵심 결정

### D1. 목록은 서버 렌더, 읽음은 마운트 뒤 Action

페이지(서버 컴포넌트)가 `now = new Date()`를 **조회 전에** 잡고 `loadAttentionInbox`로 그린다. 클라이언트 섬 `MarkSeen`이 마운트 뒤
`markAttentionSeenAction(now.toISOString())`을 한 번 부른다.
페이지 배선 테스트는 인증 선행·조회 전 시각 전달·렌더 중 쓰기 0회·조회 실패 시 `MarkSeen` 미생성을 고정한다.
조회 mock 안에서 시계를 전진시켜도 `MarkSeen`에는 조회 전 ISO 시각이 전달돼야 한다.

- **렌더 안에서 쓰지 않는 이유**: GET 렌더는 부작용이 없어야 한다. 지금 Next 16 기본 prefetch는 `loading.tsx`가 있는 동적 라우트에서 loading 경계까지만 받아
  page 본체를 실행하지 않지만, `prefetch={true}`·`staleTimes`·Cache Components 같은 설정 하나로 본체가 실행되면 보지 않은 목록이 읽음이 된다.
  그 보장을 설정에 기대지 않는다.
- **드롭다운 Action(`openAttentionInboxAction`)을 클라이언트에서 다시 부르지 않는 이유**: 서버가 이미 그린 목록을 한 번 더 조회한다(집계 쿼리 × 2). 첫 화면도 골격 → 목록으로 두 번 바뀐다.
- **`at` 입력의 신뢰**: `clampSeenAt(input, serverNow)`가 ISO 문자열만 받아 `min(input, serverNow)`로 자르고, 파싱 불가·비문자열이면 `null` → `invalid`로 쓰지 않는다.
  쓰는 대상은 세션 userId 하나이고 쓰기는 기존과 같은 단조 `updateMany`라, 위조로 얻는 것은 **자기 항목을 더 일찍 읽음 처리하는 것뿐**이다. 서명 토큰은 과하다.
  `at`이 페이지 조회 **전** 시각이라 §6.365의 `at ≤ now` 잔여 창은 기존과 같다.
- 쓰기 본체는 `openAttentionInboxAction`의 `updateMany`와 **한 함수**(`markSeen(prisma, userId, at)`)로 모은다 — 두 벌이면 단조 조건이 갈린다.
- **반환 형**: `{ status: "ok"; marked: boolean } | { status: "invalid" } | { status: "failed" }`. 세션 거부는 기존 두 Action과 같은 줄
  `if (session.status !== "ok") return { status: "failed" };`(`entry-points.test.ts` `hasUserGuard`가 이 형을 인정한다). 쓰기 예외는 `{ status: "ok", marked: false }` —
  열기 Action과 같은 계약(목록은 이미 보였고 워터마크만 안 움직였다). **갱신 0행도 `marked: true`**다(이미 더 늦은 워터마크 · 뒤로 가기로 복원된 옛 `now`) —
  기존 열기 Action과 같고, 그때 거짓 0이 된 배지는 다음 마운트의 배지 조회가 회복한다.
- `entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 `inbox/actions.ts#markAttentionSeenAction`을 사유 주석과 함께 등재한다(세션 사용자 행 하나에만 쓴다).

### D2. 안 읽음 수 — 탭 안의 store 하나 (헤더 배지 · 사이드바 배지 · 페이지)

헤더 `AttentionInbox`와 사이드바는 `(edit)` 레이아웃에 있어 페이지 이동에 다시 마운트되지 않는다. 페이지가 읽음을 기록해도 둘 다 옛 수로 남는다(완료 조건 6).
사이드바 배지가 헤더 배지와 다른 n을 보이면 안 된다(6a).

→ `lib/inbox/unread-store.ts` — 모듈 수준 store: `getUnread()` · `setUnread(n)` · `subscribe(listener)` · `notifySeen()`/`onSeen(listener)` + 훅 `useInboxUnread()`(`useSyncExternalStore`, 서버 스냅샷 0).
- **수를 쓰는 쪽은 헤더 `AttentionInbox` 하나다** — 지금의 로컬 `useState(unread)`를 이 store로 옮긴다. 마운트 배지 Action · 닫힐 때 0(`clearOnClose`) · "marked 뒤 도착한 배지 수 무시" 규칙이 그대로 store에 쓴다.
- **사이드바는 읽기만 한다** — 훅을 조건부로 부르지 않도록 `inbox` 항목의 배지 자리에 작은 자식(`InboxCount`)을 둔다. 배지 수 조회를 따로 하지 않는다.
- **페이지 섬**은 `marked: true`를 받으면 `notifySeen()`. 헤더의 `onSeen` 처리는 **셋**이다:
  ① `marked.current = true` — 그 뒤 도착한 배지 조회 응답을 버린다(`/inbox` 직접 로드에서 배지 Action과 mark Action이 동시에 출발한다 — Action 큐 순서에 기대지 않는다).
  ② 메뉴가 닫혀 있으면 `setUnread(0)` + 캐시 목록 `readAll`(#191 — 다시 열 때 응답 전 옛 점), ③ 열려 있으면 기존 `clearOnClose` 경로.
- **헤더 수명 밖의 응답은 버린다** — effect 정리에서 구독을 해제하고 해당 마운트의 미완료 배지·목록 요청을 무효화한다. 성공·실패 콜백 모두 현재 마운트인지 확인한 뒤에만 store·목록·읽음 ref를 바꾼다.
  공개 셸 A의 배지 요청 → 앱 셸 B로 전환 → B 읽음 성공 → A 응답 순서에서도 0을 유지한다. StrictMode의 effect 재설정도 이전 요청을 다시 유효하게 만들지 않도록 요청이 시작된 마운트 세대를 구분한다.
- **읽음 신호 이전의 목록 요청도 무효화한다** — `onSeen`은 목록 요청 세대를 전진시키고 그 요청의 로딩 상태를 정리한다. 이전 응답은 `marked` 값이나 성공·실패와 무관하게 캐시·배지에 반영하지 않는다.
  기존 캐시는 위의 열림/닫힘 규칙대로 보존한다. 캐시가 없고 메뉴가 열려 있으면 새 세대의 조회를 시작하고, 닫혀 있으면 다음 열기에서 조회한다. 따라서 무효화 뒤 골격만 남지 않는다.
  신호 이후 시작한 새 조회는 정상 반영한다 — 새로 생긴 안 읽음까지 일괄 `readAll`하지 않는다.
- Provider를 세우지 않는다 — 공개 셸 헤더도 같은 `AttentionInbox`이고 공개 셸엔 사이드바·페이지가 없다. 모듈 store면 양쪽 셸에 아무것도 박지 않는다.
- ⚠️ **서버 스냅샷 0** — 사이드바는 서버 렌더에서 배지 없음으로 그린다. 레이아웃 렌더에 집계를 싣지 않는다는 기존 결정(attention-inbox 머리 주석)을 지킨다.
- ⚠️ **렌더 중 `setUnread` 금지** — `"use client"` 모듈도 SSR에서 평가되어 서버 프로세스의 store 인스턴스가 요청 간 공유된다. 쓰기는 effect·콜백에서만 한다(파일 머리 주석).
- 헤더가 `9+`로 접고 사이드바는 실제 수다(완료 조건 6a). store는 수(n)만 든다.
- 다른 탭은 비목표.

### D3. 행 — 내용은 한 조각, 그릇은 문맥별 (드롭다운 · 페이지 · Home)

드롭다운 행은 `DropdownMenuRow`(메뉴 로빙 포커스), 페이지·Home 행은 `ListRow`(링크 목록)다. `DropdownMenuRow`가 `ListRow`를 감싸므로 슬롯이 같다.
**문장·타일·점·시각·Owner 안내 슬롯은 한 함수**가 만든다: `attentionRowSlots(m, uiLocale, slug, item, now, { time: "narrow" | "long" })` → `{ href, icon, title, description, aside }`.
드롭다운은 `narrow`(226 칸, #190), 페이지·Home은 긴 형. 안 읽음 점·sr `Unread`는 `unread`가 있는 항목(Inbox)에서만 선다(Home 항목엔 없음).
입력 `item`은 `InboxItem & { ownerRetries: boolean; unread?: boolean }`이다. Inbox는 계획의 항목을 그대로 전달하고,
Home 호출부는 기존 `item.kind === "import_failed" && !canPerform(role, "project:settings")` 판정을 유지해 `{ ...item, ownerRetries }`를 전달한다.
공유 슬롯은 권한을 다시 판정하지 않는다. Home의 EDITOR 실패 안내는 남고 OWNER에는 없으며, 둘 다 안 읽음 점은 없다.
`components/inbox/row-slots.tsx` — `"use client"`가 아니다(서버 페이지·Home도 쓴다). `useMessages`를 부르지 않고 `m`·`uiLocale`을 인자로 받는다.
**페이지 행의 형(chevron · 글자 크기 · 행 사이 선)은 Home 카드 행과 같다** — 이관 뒤 같은 조각이라 갈리지 않는다.

### D4. 묶음 — 프로젝트마다 `Card`

`InboxPlan.groups` 순서 그대로 프로젝트마다 `Card` 하나(머리 = `ProjectThumbnail xs` + 프로젝트 이름, Home 카드와 같은 머리 형) 안에 `ListRow` 목록.
날짜 묶음은 쓰지 않는다 — 항목은 사건이 아니라 현재 상태이고, review는 push가 시각을 덮어 새 검토가 생긴 날짜를 말하지 못한다(2026-10-09 결정).
미전달 시각은 pending 토큰 술어의 `MAX(updatedAt)`을 집계해 `unsent.at`으로 전달하며, 시각이 없으면 `null`이다. 프로젝트 묶음 결정은 그대로다.
빈 목록은 카드 없이 `EmptyState placement="card"` 하나.

### D5. 사이드바·메뉴 항목과 이름

`navWorkItems`에 `{ key: "inbox", label: m.common.nav.inbox, icon: Inbox, href: routes.inbox(), exact: true }`를 `projects` 바로 뒤에.
글리프는 헤더 트리거와 같은 `Inbox`(같은 목적지 = 같은 글리프 — DESIGN §6.5). 배지는 `navWorkItems`가 아니라 사이드바가 store에서 붙인다 —
이 함수는 서버 값(`projectCount`)만 받고, store 값을 인자로 흘리면 사용자 메뉴에도 배지 경로가 생긴다.
`navWorkItems`를 읽는 다른 셋(사용자 메뉴 두 셸 · 검색 Pages 색인 · 랜딩 목업 LNB)에도 Inbox가 서는 것은 의도다(그 함수 머리 주석 "두 벌이면 순서가 갈린다").
`navCountLabel`에 `inbox` → 새 키 `common.nav.inboxCount(n)` = `{n} unread`(개수만 말하는 다른 항목과 같은 형).
헤더 트리거 접근 이름 `inbox.label`·`labelUnread` 값을 `Inbox`·`Inbox, {n} unread`로 바꾼다 — 사이드바 라벨과 같은 낱말(DESIGN §6.5 이름 규칙).

### D6. 헤더가 저절로 움직이는 순간

페이지 진입 직후 트리거가 52 → 32로 줄어 헤더 우측 묶음이 밀린다. 드롭다운은 열린 메뉴가 트리거에 붙어 따라 움직이므로 배지 0을 닫힘까지 미뤘지만(§6.545 D1),
여기는 메뉴가 닫혀 있어 따라 움직일 그릇이 없다 — 미루지 않는다.

## 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

| 대상 | 테스트 파일 · 환경 | 케이스 |
|---|---|---|
| `clampSeenAt(input: unknown, now: Date): Date \| null` | `lib/inbox/__tests__/plan.test.ts` (node) | ISO 파싱 · 미래 → now · 과거 그대로 · now와 같은 값 · epoch(받되 단조라 무해) · `Date` 객체·숫자·NaN·잘못된 문자열 → null |
| `unread-store.ts` | `lib/inbox/__tests__/unread-store.test.ts` (node) | set/get · 구독 해제 뒤 미호출 · 다중 구독자 · `notifySeen` 멱등 |
| `useInboxUnread` | `lib/inbox/__tests__/unread-store-hook.test.tsx` (파일 머리 `@vitest-environment jsdom`) | 구독 갱신 · 해제 · store 값이 있어도 서버 렌더 스냅샷 0 |
| `navWorkItems` 순서 | 기존 nav 테스트 | `projects, inbox, mcp, preferences, account` · `inbox.exact === true` · inbox 배지 없음 |
| `isProtectedPath` | 기존 cookie 테스트 | `/inbox` · `/inbox.rsc` · `/%69nbox` 참, `/inboxes` 거짓(`/preferences` 케이스 복제) |
| `routes.inbox()` | `app/__tests__/entry-points.test.ts` 죽은 링크 검사 | page 실재 |
| `markAttentionSeenAction` | `app/inbox/__tests__/actions.test.ts` (mock prisma) | 세션 없음 `failed` · invalid 입력 `invalid`(쓰기 0) · clamp된 at으로 단조 where · 0행도 `marked: true` · 쓰기 예외 `ok + marked:false` · `USER_SCOPED_ACTIONS` 등재 |
| `attentionRowSlots` · Home 호출부 | `components/__tests__/inbox-row-slots.test.tsx` (jsdom) · 기존 Home 테스트 | 점 + sr `Unread` · `ownerRetries` 줄 · `at === null`이면 aside 없음 · narrow/long 분기 · Home EDITOR 실패 안내 있음/OWNER 없음 · Home 점 없음 |
| `AttentionInbox` | 기존 `attention-inbox.test.tsx` | 접근 이름 `Inbox`/`Inbox, n unread` · 배지 응답이 store로 · `notifySeen` → 닫힘이면 배지 0 + 캐시 점 없음 · 열림이면 닫힐 때 · 신호 뒤 도착한 배지 응답 무시 · 셸 전환 뒤 이전 마운트 응답 무시(StrictMode 포함) · 신호 전 목록의 지연 `marked:false`·성공·실패 응답 무시 · 캐시 없는 열린 메뉴 조회 재개 · 신호 후 새 조회의 unread 보존 |
| 서버 페이지 | `app/(edit)/inbox/__tests__/page.test.tsx` (node, 의존성 mock) | 인증 거부 시 조회 0회 · 조회 전 now를 MarkSeen에 전달 · 렌더 중 읽음 Action·DB 쓰기 0회 · 조회 실패 전파 및 MarkSeen 미생성 |
| `MarkSeen` | `components/__tests__/inbox-mark-seen.test.tsx` (jsdom) | `marked:true`면 `notifySeen` 1회 · `marked:false`·`failed`·`invalid`·reject면 0회(배지 유지) · 재렌더에 Action 1회 · StrictMode 이중 effect에서 `notifySeen` 두 번도 멱등 |
| `InboxList` | `components/__tests__/inbox-list.test.tsx` (jsdom) | 카드·행 순서 = plan · 빈 상태 두 키 · 긴 시각 형 · 카드 머리 썸네일·이름 |
| `Sidebar` | 기존 `sidebar-work-zone.test.tsx` | store n → Inbox `CountBadge` n(10 이상도 실제 수) · 0이면 없음 · sr `n unread` · store 변경 추종 |

⚠️ **store 모듈 상태가 테스트 사이로 샌다**(파일 사이 격리는 vitest 기본, 파일 안은 아니다) — `AttentionInbox`·`Sidebar`를 렌더하는 테스트 파일
(`attention-inbox` · `public-shell` · `header-44` · `shell-header` · `privacy-page` · 사이드바 셋)의 `afterEach`에서 `setUnread(0)`. 리셋 전용 API를 새로 만들지 않는다.
⚠️ **`components/__tests__/client-graph.test.ts`의 lib 허용 목록**에 `lib/inbox/unread-store.ts`를 T4의 실제 소비 연결과 함께 더한다. T1에는 소비자가 없어 도달 집합과 정확히 일치하지 않는다.

## 스키마 변경

**없음.** `User.attentionSeenAt`을 그대로 쓴다.

## 새 환경변수

**없음.**

## 불변식 영향

- export 결정성·blob SHA: **없음**.
- 인증 경계(ARCHITECTURE §8 두 층): 새 보호 라우트라 **`isProtectedPath` 추가 + 페이지 최상단 `requireUser`** 둘 다 필요하다
  (`entry-points.test.ts`가 `(edit)` 아래 페이지를 센다). 인가할 프로젝트가 없다 — 범위는 `loadAttentionInbox`의 `userId` 멤버십 조회가 확정한다.
- 테넌트: 새 쿼리 없음 — 사이드바 배지도 헤더의 기존 배지 Action 결과를 나눠 쓴다. 새 Action은 세션 userId 행 하나만 쓴다(입력 userId 없음).
- 개인정보: 새 필드·쿠키·전송처 없음. **방침 서술은 바뀐다** — 열람 기록 시점이 "헤더 목록을 열 때"(`messages/en.tsx` 방침 절의 Inbox 세 문장)에서 "Inbox를 열거나 볼 때"로. 트리거 이름 변경으로 낱말도 `Inbox`. ko 본·개정 이력·시행일을 같은 커밋에(`policy-gate.test.tsx`).
- 데이터 변경 경로 표(CLAUDE.md): `app/inbox/actions.ts` 행에 `markAttentionSeenAction`을 더한다.

## POSTMORTEM 인용

- **2026-09-05 — 라우트 링크 하드코딩으로 사이드바 404**: 경로는 `routes.inbox()`로만 만들고, `entry-points.test.ts` 죽은 링크 검사가 page 실재를 본다 — 그래서 `routes.inbox()`는 page와 같은 커밋에 들어간다(tasks).
- **2026-08-31 — 레이아웃 인증 검사가 데이터 노출을 못 막았다**: 페이지 최상단 `requireUser`(레이아웃 판정에 기대지 않는다).
- **2026-09-20 · 09-24 — 응답 뒤 행 재마운트로 로빙 포커스 상실**: 드롭다운 행 추출 뒤에도 key(`itemKey`)를 그대로 둔다.
- **2026-09-09 — 버튼 배지 형제 금지**: 트리거 구조는 건드리지 않는다(이름 값만 바뀐다).

## 문서 갱신 (실제 갱신은 `/implement`·`/push`)

- PRODUCT §4.1 Attention inbox — "헤더 드롭다운 + `/inbox` 페이지 + 사이드바 안 읽음 배지". §4.2 범용 알림 절의 "⚠️ 헤더 Inbox는 이것이 아니다" 문장을 Inbox 전체(페이지 포함)로. §7.7 URL 표에 `/inbox` 행, 사용자 축 내비 순서.
- ARCHITECTURE §6.365 — 데이터 경로에 페이지 + `markAttentionSeenAction`(clamp · 반환 형 · 0행 marked) + 탭 안 store. §6.37 검색 — Pages 색인에 Inbox.
- DESIGN §6.545 — 페이지 절 추가 · 트리거 이름 `Inbox`. §6.5 헤더 행(사용자 메뉴 항목 목록) · 사이드바 배지 규칙에 한 줄("Inbox는 서버 값이 아닌 클라이언트 store 값인 유일한 배지, 안 읽음 수, SSR엔 없다가 하이드레이션 뒤 선다"). **헤더 카운터 예외 문구는 그대로다**(그 규칙은 헤더에만 걸린다). 랜딩 목업 행의 LNB 항목 목록.
- DIRECTORY — `app/(edit)/inbox/` · `components/inbox/` · `lib/inbox/unread-store.ts`.
- CLAUDE.md 데이터 변경 경로 표.
- 가이드 — 헤더 Inbox 이름·사이드바·사용자 메뉴를 언급하거나 찍은 컷이 있으면 `/guide`·`/guide-shots`.
