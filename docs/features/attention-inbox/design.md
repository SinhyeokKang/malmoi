# attention-inbox — design

## 영향 받는 흐름

**편집 UI만.** push·pull·export·Sync·Publish 경로는 건드리지 않는다. 헤더(`components/shell/header.tsx`)에 클라이언트 컴포넌트 하나,
Server Action 둘(배지 읽기 하나 · 열기 = 조회+읽음 기록 하나), `User` 컬럼 하나, 검색과 공유하는 프리미티브 셋(`ListGroup` 신설 · `DropdownMenuRow` 신설 · `ListRow hoverFill`).

## 판정 출처 — 새로 만들지 않고 모은다

| 종류 | 단위 | 판정 출처(재사용) | 시각 `at` | 배지 | 역할 | 목적지 |
|---|---|---|---|---|---|---|
| `import_failed` | 표면 | `failing` (`lib/home/attention.ts`) → `collectAttention` | `lastImportFailedAt` (null = 가장 오래됨) | 셈 | 둘 다 | `routes.sources(slug)` |
| `review` | 표면×로케일 | `loadReviewAttention` → `collectAttention` | 그 로케일 `MAX(updatedAt)` (Home과 같은 값 — **정렬에만** 쓴다) | **안 셈** | 둘 다 | 번역 `state=review, language` |
| `never_filled` | 표면×로케일 | Home `page.tsx`의 인라인 계산 → **`neverFilledLocales`로 추출** | `Locale.createdAt` | 셈 | 둘 다 | 번역 `completion=incomplete, language` |
| `unsent` | 프로젝트 | `loadProjectListAggregates().unsent` · `unsentSurfaces` | **새 값** — 미전달 셀의 `MAX(updatedAt)` (아래) | 셈 | 둘 다 | `bannerTranslationsHref(slug, surface, "unsent")` |
| `setup` | 프로젝트 | `projectStatus() === "setup"` (`lib/projects/list.ts`) | `Project.createdAt` | 셈 | OWNER | `routes.settings(slug)` |

- ⚠️ **`review`는 안 읽음·배지에서 빠진다** — 시각 출처가 셀 `updatedAt`뿐인데 push의 upsert(`lib/push/apply.ts:485`)와 원문 변경 전파(`:313`)가
  리포에 있는 셀 전부에 `updatedAt = now`를 쓴다. MIN이든 MAX든 CI·야간 동기화마다 움직여 배지가 늘 켜진다. 거짓 없는 시각을 얻으려면 push 코어에 새 컬럼
  (`needsReviewSince`)을 들여야 해서 배지 하나를 위해 치르지 않는다(feature-review 2026-10-05 사용자 결정). `unsent`는 push가 토큰 셀을 덮지 않으므로(`:488`) 시각이 깨끗하다.
- **`needs_reconnect`는 없다** — `repositoryId === null`은 sec-audit-2 이전 행의 유산이라 생산자가 없다. 실제 끊김(설치 해제)은 원격 신호라 범위 밖이다.
- **Home의 배너 제외(`bannerSurface`)·보관 처리·CAP 5는 Home의 것이다** — 헤더에는 배너가 없으므로 실패 표면 전부가 항목이고, **상한이 없다**(메뉴 스크롤).
- ⚠️ **`attentionItems`를 그대로 재사용하지 않는다** (`lib/home/attention.ts:38-74`) — 안에서 `slice(0, CAP)`를 하고 `count`가 상한 뒤 값이며,
  필수 입력 `state: HomeState`는 GitHub 조회(`planHomeState({ connection })`)에서 나온다. **상한·state 없이 모으는 `collectAttention(surfaces, review, neverFilled, actors)`로 쪼갠다** —
  Home은 그 결과에 보관 처리·배너 제외·CAP을 덧씌우고(`attentionItems`가 그것을 부른다), Inbox는 그대로 쓴다.
- ⚠️ **href 사본 금지 — 실재하는 사본만 이관한다.** 손 사본은 `AttentionRow`의 href 삼항(`components/home/attention-card.tsx:130-137`) 하나다 → `attentionHref(slug, item)`로 뗀다.
  목록 띠는 이미 `bannerTranslationsHref`를 부르고 setup은 `routes.settings(slug)` 한 줄이라 건드리지 않는다. 단 `bannerTranslationsHref`는 `"use client"` 파일
  (`components/projects/project-list.tsx:462`)에 있어 `lib/`가 import하면 의존 방향이 거꾸로 선다 → **`lib/routes.ts`로 옮기고** 목록은 import만 바꾼다.
- **칩·문장도 같은 배치에서 뗀다** — `TILE`(`attention-card.tsx:37`)만 export하면 부분 반영 톤(`PARTIAL_TILE`, `AttentionRow` 안 삼항 `:140`)이 빠져 부분 반영이 실패 색으로 그려진다.
  `attentionTile(item)` 함수와 문장 함수 `title`·`body`·`tail`(`:173-196`)을 **순수 모듈**(`lib/home/attention-view.ts` — 컴포넌트 파일이 아니다, `client-graph`)로 옮긴다.
  `unsent`·`setup` 두 종의 칩(`GitPullRequestArrow` muted · `CircleDashed` muted)과 문장은 목록 띠(`project-list.tsx:345-381`)의 것과 같은 값을 쓴다.

## 읽음 모델 — 사용자당 시각 하나 (워터마크)

`User.attentionSeenAt DateTime?` (additive, nullable).

- **안 읽음** = 종류가 배지 대상이고(`review` 아님) && (`seenAt === null` **또는** (`item.at !== null` && `item.at > seenAt`)).
  → 한 번도 연 적이 없으면 배지 대상 전부가 안 읽음. `at === seenAt`은 읽음(엄격한 `>`). 시각 없는 항목(마이그레이션 이전 `import_failed`)은 첫 열람 뒤로는 다시 안 읽음이 되지 않는다.
- **읽음 기록은 열기 Action 안에서 서버가 한다** — 클라이언트가 시각을 왕복시키지 않는다.
  1. `now`를 **조회를 시작하기 전에** 잡는다(조회 도중 생긴 항목이 보지도 않고 읽음이 되지 않도록).
  2. 이전 `seenAt`으로 안 읽음을 계산한 목록을 만든다.
  3. 워터마크를 `now`로 올린다 — `prisma.user.updateMany({ where: { id, OR: [{ attentionSeenAt: null }, { attentionSeenAt: { lt: now } }] }, data: { attentionSeenAt: now } })`.
     **뒤로 가지 않는다**(탭 둘이 다른 순서로 찍어도 단조 증가). raw `GREATEST`를 쓰지 않는다 — where 절로 단조성이 단위 테스트에서 판정되고,
     raw의 `timestamp without time zone` 세션 시간대 함정(`apply.ts:211` 주석)을 다시 다루지 않는다.
  4. 쓰기가 실패하면 목록은 그대로 돌려주고 `marked: false` — 클라이언트는 배지를 그대로 둔다.
- 열기 = 읽음이다 — 목록이 도착하기 전에 닫아도 Action은 끝까지 돈다.
- 항목별 읽음 테이블을 만들지 않는다 — 해결된 항목의 읽음 행이 쌓여 정리 작업이 생기고, "항목 식별자"를 영속 계약으로 만들게 된다.

⚠️ **수용하는 대가**: 자기 편집으로 생긴 `unsent`도 안 읽음이 된다(행위자로 거르지 않는다). `setup`은 방금 만든 OWNER에게도 하나 뜬다.

## 순수 함수 (`/tdd` 대상)

`lib/home/`(Home 소유 추출본) — I/O 없음, `server-only` 없음:

1. **`collectAttention(surfaces, review, neverFilled, actors)`** — 상한·state 없는 항목 수집. `attentionItems`가 이것 위에 Home 규칙을 덧씌운다.
2. **`neverFilledLocales(surfaces, aggregates)`** — Home `page.tsx`의 인라인 계산을 추출(Home도 이것을 부른다 — 사본 제거).
3. **`attentionHref(slug, item)`** · **`attentionTile(item)`** · 문장 함수 — `attention-card.tsx`에서 추출(`lib/home/attention-view.ts`).

`lib/inbox/plan.ts` — I/O 없음, `server-only` 없음:

4. **`planInbox(input) → InboxPlan`**
   - 입력: 프로젝트별 `{ slug, name, image, role, status, attention(collectAttention 결과), unsent { count, surfaceSlug, at } | null, createdAt }` · `seenAt: Date | null`.
     **`projectId`를 입력에 두지 않는다** — 출력으로 새는 길을 형에서 막는다.
   - 출력: `{ groups: { project, items: (InboxItem & { unread: boolean })[] }[], unread: number }`.
   - 규칙: 역할 필터(`setup`은 OWNER) · 항목 정렬(Home `compare`를 export해 재사용 — **보조 키**: 표면 항목은 `surfaceSlug`, 프로젝트 단위 항목(`unsent`·`setup`)은
     표면 항목보다 앞, 둘 사이는 `setup` → `unsent`) · 프로젝트 묶음 정렬(가장 최신 항목 내림차순, 같으면 slug) · 안 읽음 수(배지 대상만).
5. **`isUnread(kind, at, seenAt)`** — 위 읽음 규칙 하나.
6. **`badgeLabel(n)`** — `0 → null` · `1..9 → "n"` · `≥10 → "9+"`.

## 껍데기

- **조회 `loadAttentionInbox(prisma, userId)`** (`lib/inbox/load.ts`, server-only)
  - **전용 멤버십 조회 하나** — `loadProjectList`의 멤버십 select(`lib/keys/query.ts:277-301`)를 본뜬다: 프로젝트 `id`·`repositoryId`·`createdAt`·`slug`·`name`·`image`·역할,
    표면(`where: { archivedAt: null }`, `lastImportError`·`lastImportStartedAt`·`lastImportFailedAt`), 로케일(`name`·`createdAt`·`orphaned`), **프로젝트 보관 필터는 SQL에서**,
    `User.attentionSeenAt`은 같은 조회에 user 관계로 붙인다.
    ⚠️ **`loadMemberships`를 쓰지도 넓히지도 않는다** — `MembershipRow`(`query.ts:142`)엔 `projectId`가 의도적으로 없고, 셸이 매 페이지 부르는 조회라 넓히면 모든 응답이 무거워진다.
    Action은 레이아웃 렌더와 별개 요청이라 셸의 결과를 재사용하지도 못한다.
  - 병렬: `loadProjectListAggregates(prisma, ids)` · **`loadReviewAttention(prisma, ids)`** — 시그니처를 `projectIds[]`로 바꿔 `ANY(ids)` + `PARTITION BY projectId, surfaceId, localeCode`
    한 번에 돌린다(Home은 `[projectId]`를 넘긴다 — 사본 없음). **왕복 수가 프로젝트 수와 무관한 상수**다: 멤버십 1 + aggregates 5 + review 1 + actors 1.
  - `actors`는 렌더될 항목의 `updatedBy`만(`loadActors` — Home과 같은 이유), 응답엔 `who()`→`actorLabel`을 지난 문자열만 싣는다(`Actor` 맵을 직렬화하지 않는다).
  - 멤버십 0(또는 전부 보관)이면 나머지 조회를 돌리지 않고 빈 plan.
  - 하위 조회 하나가 던지면 전체가 던진다(`Promise.all`) — Action이 `failed`로 받는다. 부분 목록을 보이지 않는다(빠진 종류를 "없음"으로 오해하게 만든다).
- **`unsent`의 시각**: `loadProjectListAggregates`의 미전달 행 쿼리에 `MAX("updatedAt")`을 더한다 — ⚠️ **새 술어를 만들지 않고 `pendingWhere` 공유 조각 그대로**, 쿼리 모양도 그대로다.
  `lib/keys/`를 건드리므로 `scripts/gate-plan.ts` 트리거로 `pnpm test:projects:postgres`가 붙는다(손으로 판정하지 않는다).
  ⚠️ 이 집계의 관계 필터 `groupBy`(`query.ts:518·524`)는 POSTMORTEM 2026-09-18이 "적재 직후 느릴 수 있는 후보"로 적은 자리다 — Inbox가 그 경로의 빈도를 늘린다(마운트·열기마다). 측정은 T5.
- **Server Action 둘** (`app/(edit)/inbox/actions.ts`):
  - `loadAttentionBadgeAction()` — 읽기 전용, 배지 수만 돌려준다. `readSession` → userId로만 좁힌다(입력 없음). `revalidatePath` 없음. 세션 none·unavailable/장애는 union(`{ status: "failed" }`) — 셸을 던지지 않는다.
  - `openAttentionInboxAction()` — 입력 없음. `now`를 먼저 잡고 → `loadAttentionInbox` → 워터마크 `updateMany` → `{ status: "ok", plan, loadedAt, marked }`. 쓰는 대상은 세션이 정한다. `revalidatePath` 없음(배지는 클라이언트 상태다).
  - ⚠️ **인가 게이트는 `isProtectedPath`가 아니다** — Action은 현재 페이지 URL로 POST되고 middleware 1차 차단은 GET·HEAD만 본다. 두 Action을 `app/__tests__/entry-points.test.ts`의
    `USER_SCOPED_ACTIONS`(`:123`)에 사유와 함께 등재하고, 본문은 `hasUserGuard`가 인정하는 형(none·unavailable 두 거부 반환)이어야 한다.
- **UI `components/shell/attention-inbox.tsx`** (`"use client"`) — 시안(spec 머리 링크)이 정본이다.
  - 마운트 시 한 번 `loadAttentionBadgeAction`. 드롭다운을 열 때마다 `openAttentionInboxAction`.
  - ⚠️ **배지 0은 메뉴가 닫힐 때 반영한다** — 읽음 기록은 열 때 서버가 하지만, 화면 배지는 `marked`를 기억해 두었다가 `onOpenChange(false)`에서 0으로 바꾼다
    (응답이 닫힌 뒤에 오면 도착 즉시). 열린 채 배지가 빠지면 트리거가 52 → 32로 줄어 `New project`가 20 밀리고, 트리거에 붙은 메뉴도 따라 움직인다.
  - ⚠️ **레이아웃 렌더에 싣지 않는다** — `(edit)` 레이아웃은 클라이언트 이동에서 다시 렌더되지 않아 배지가 굳고, 모든 페이지 응답에 집계 쿼리를 더한다.
  - ⚠️ **스켈레톤은 첫 조회 전에만** — 이후 열기는 받은 목록을 즉시 보이고 뒤에서 갱신한다. 항목 key는 `kind:project:surface:locale`로 고정해 응답이 와도 같은 행이 다시 마운트되지 않는다
    (키보드로 고른 로빙 위치를 잃지 않는다 — POSTMORTEM 2026-09-20·09-24 포커스 부류).
  - **트리거**: `Button size="icon-md" variant="ghost"` + lucide `Inbox` 16. ghost 기본 둘을 덮는다 — 글리프 늘 `text-foreground`, 면 `hover:bg-foreground/[0.03]`이고 열린 동안(`data-[state=open]`)도 같은 면.
    값은 같은 헤더의 `New project` 링크(`PUBLIC_HEADER_LINK`, `components/public-shell/header.tsx:25`)와 같다. 소비자가 하나라 variant를 만들지 않는다 — DESIGN 헤더 절에 의도된 이탈로 등재(T12).
    안 읽음이 있을 때만 정사각을 풀어 `w-auto px-1.5 gap-1`(32 → 52 · `9+` 58), 그 안에 `Badge soft-neutral` 자식(형제 금지 — POSTMORTEM 2026-09-09). 겹치는 형은 쓰지 않는다(반투명 배지가 글리프를 덮지 못한다).
    `CountBadge`는 `toLocaleString`을 그대로 찍어(`count-badge.tsx:17`) `9+`를 못 낸다. 접근 이름은 하나 — `aria-label`이 실제 수(`…, 12 unread`), 배지는 `aria-hidden`.
  - **메뉴 그릇 = 전역 검색 목록과 같은 형**: `DropdownMenuContent` `w-90 p-0` + 안쪽 `py-2`, `max-h-[min(560px,var(--radix-dropdown-menu-content-available-height))]` 한 겹 스크롤.
    **머리 제목 없음**(트리거 이름이 메뉴 이름 — `aria-labelledby` → 트리거), Mark all as read 없음.
  - 빈 상태: `EmptyState placement="inset"` + `CircleCheck` + Home 사전의 `Nothing needs you`(§2.4), 보조 문장만 "across your projects".
  - 불러오는 중: 그룹 머리 한 줄 + 행 셋 `Skeleton`(`aria-hidden`) + 콘텐츠 `aria-busy` + sr-only `role=status` 문장. 항목 0개라 ↓는 아무 데도 가지 않는다.
  - 오류: 문장은 **`CommandStatus`의 danger 줄을 재사용**(`role=status aria-live=polite` · `text-destructive` 13 — 검색 실패 줄과 같은 형) + `Try again`은 아래 `DropdownMenuRow`(`onSelect`에서 `preventDefault` 후 재조회,
    시도 중 disabled + `Loader2` — `SignOutItem` 형, `user-menu.tsx:103`). `ErrorState`를 넣지 않는다(평범한 Button이라 메뉴 로빙에 안 닿는다).
  - 행 안 읽음: 점 6 `bg-primary`를 행 왼쪽 여백 16 안(x 5–11)에 `absolute`로 — 칩이 그룹 머리와 같은 x16에 남는다. 접근 이름 **맨 앞** sr `Unread`. 검토 대기는 점이 없다.
  - 행 문장: Home 행과 같다 — 굵은 사실 + 근거 꼬리, 보조줄(표면·로케일)은 본문 **아래** 13 muted truncate, EDITOR 실패·일부 반영은 그 아래 **따로 한 줄** `m.projects.importFailure.ownerRetries`(Home `AttentionRow`와 같은 키·형). 시각은 aside 13 muted, 없으면 비운다.
  - 프로젝트 단위 항목(`unsent`·`setup`)은 프로젝트 이름을 다시 쓰지 않는다(그룹 머리와 중복). `unsent`는 대상 표면 slug를 보조줄로, `setup`은 보조줄 없음.
  - 시각 형은 상대 시각(`lib/relative-time.ts`)이고 `now`는 서버의 `loadedAt`이다 — Home 카드와 같다.

### 재사용 설계 — 손 조립 없이 프리미티브로 (UI primitives first)

시안의 행·그룹은 **전역 검색 목록과 같은 형**이고, 같은 헤더의 사용자 메뉴·스위처(`DropdownMenuItem` 기본 `mx-1 rounded px-2 py-1.5 bg-accent`)와는 다르다. 그 형을 `className`으로 덮어 조립하지 않고,
**검색이 이미 쓰는 부품을 프리미티브로 떼어 두 소비자가 같이 쓴다**(실재하는 사본 이관 — 소비자 없는 선반영이 아니다).

| 부품 | 지금 | 바꾼 뒤 | 소비자 |
|---|---|---|---|
| 행 면 규칙 | `CommandItem`이 `ListRow`에 `!selected && "hover:bg-transparent"`로 hover 면을 끈다(`command.tsx`) — 덮어쓰기 | `ListRow`에 `hoverFill?: boolean`(기본 true). `false`면 hover 면을 붙이지 않는다 | `CommandItem`(이관) · `DropdownMenuRow` |
| 그룹 | `CommandGroup`(`command.tsx:120`) — `role=group` + `aria-labelledby` + `not-first:border-divider border-t` + 머리 `text-gray-dim px-4 pt-4 pb-1 text-xs font-medium`(D15) | **`ListGroup`**(`components/ui/list-group.tsx`) — 같은 마크업, 머리는 `ReactNode`(썸네일 + 이름을 받는다). `CommandGroup`은 `ListGroup`을 그대로 쓴다 | `CommandGroup`(이관) · Inbox 프로젝트 묶음 |
| 메뉴 행 | 없음 | **`DropdownMenuRow`**(`components/ui/dropdown-menu.tsx`) — `Primitive.Item asChild` + `ListRow`(`href`면 `Link`, 아니면 `as="button"`), `hoverFill={false}`, 활성 면 `data-[highlighted]:bg-foreground/[0.07]` 하나(검색 C16과 같은 값), `py-2.5 text-sm outline-none`. 슬롯은 `ListRow` 그대로(`icon`·`title`·`description`·`aside`) | Inbox 항목 · `Try again` |
| 상태 줄 | `CommandStatus`(`command.tsx:99`) | 그대로 재사용(컨텍스트 의존 없음) | 검색 · Inbox 오류 |

- ⚠️ **`DropdownMenuGroup`을 export하지 않는다** — 그룹은 `ListGroup`이 든다(Radix 메뉴는 Group을 요구하지 않는다). 앞선 설계의 export 계획은 철회.
- ⚠️ **활성 면은 Radix `data-highlighted` 하나다** — 포인터·키보드가 같은 상태를 칠해 칠해진 행이 늘 하나다(검색 C16과 같은 규칙). 문자열은 리터럴로 쓴다 — 상수를 접두로 붙인 `data-[…]:` 조립은 Tailwind가 CSS를 만들지 않는다(`tabs.tsx` 머리 주석).
- ⚠️ **`ListRow`의 `focus-visible` 링은 메뉴 행에서 끈다** — 로빙 포커스의 표시는 활성 면이다(`CommandItem`이 `tabIndex={-1}`로 같은 결론).
- ⚠️ **`asChild` 형제 금지** — `ListRow`는 단일 요소(`Link`/`button`)를 렌더하므로 Slot이 붙는다. `DropdownMenuItem`처럼 형제(`Check`)를 붙이지 않는다. `slottable-item.test.ts`의 이름 고정 목록에 `DropdownMenuRow`를 더한다.
- 두 헤더 메뉴의 하이라이트 차이(사용자 메뉴·스위처 = `bg-accent` inset, Inbox = 전폭 7%)는 **시안의 결정**이다 — 행이 두 줄짜리 결과 목록이라 검색과 같은 개념으로 묶였다. DESIGN §6.4(메뉴)·§2.4에 그 경계를 적는다(T12).

## 스키마 변경

**additive 하나** — `User.attentionSeenAt TIMESTAMP(3) NULL`. 배포 순서: dev `/db` → `/push`, prod `db:deploy`는 `/merge` 1단계.
마이그레이션 뒤 dev·prod `has_schema_privilege` false 확인(`/db` 5단계).

⚠️ **개인정보**: 사용자가 언제 목록을 열었는지는 행동 기록이다 — `lib/privacy/collected.ts` 등재(없으면 typecheck red) + `/privacy` 본문 참 여부 확인
(새 **목적**: 안 읽음 표시). 봉투는 지나지 않는다(`uiLocale`과 같은 부류 — 사람을 식별하지 않는다).

## 새 환경변수

없음.

## 불변식 영향

- **export 결정성·blob SHA**: 없음(쓰기 경로 무관).
- **인증 경계**: 두 Action 모두 세션의 userId로만 좁히고 입력이 없다. 프로젝트 집합은 `ProjectMember`에서 SQL로 확정 — `searchKeysAction`과 같은 형.
  ⚠️ 모든 쿼리가 `projectId IN (멤버십)`으로 좁혀진다(테넌트 누수 경로를 만들지 않는다). 응답엔 `projectId`가 없다.
- **미전달 술어**: `pendingWhere` 위에 시각 집계만 얹는다 — 넷째 사본을 만들지 않는다(postgres 스위트가 잰다).
- **화면 문구**: 세 사전 동시 · 한글 리터럴 0 · 시각은 상대 시각(절대 시각을 쓰면 `getDateStyle` 경로).

## POSTMORTEM에서 소환한 함정

- **2026-08-31 레이아웃 인증 검사** — Inbox 데이터를 레이아웃에서 조건부로 싣지 않는다. Action이 자기 경계에서 세션을 다시 읽는다.
- **2026-09-08 / 2026-09-09 DropdownMenu·`asChild`가 셸을 죽인 건** — 배지는 Button **안**의 자식. "한 번 열고 닫아도 셸이 산다" DOM 테스트를 둔다.
- **2026-09-07 `revalidatePath`가 결과 문구를 씻었다** — 두 Action 모두 `revalidatePath`를 부르지 않는다.
- **2026-09-18 관계 필터 count가 적재 직후 5.5초** — 미전달 집계의 모양을 바꾸지 않는다. Inbox가 그 경로를 더 자주 타므로 왕복 수 상수를 테스트로 고정한다.
- **2026-09-20 "판정은 통과했지만 조회·렌더에서 사실이 달라졌다"** — `planInbox`만 단위로 세지 말고 `loadAttentionInbox`의 조립(표면 평탄화 금지)을 픽스처로 센다.
- **2026-09-20 / 2026-09-24 포커스 복귀·body로 빠짐** — 재조회가 행을 다시 마운트하지 않게 key를 고정하고, Esc 뒤 트리거 복귀를 단언한다.
- **2026-09-29 행위자 라벨이 원문 이메일을 실었다** — 응답 직렬화 결과에 원문 이메일 0을 같은 사람 두 행 픽스처로 센다.

## 닫힌 결정 (feature-review 2026-10-05 · 시안 검토 2026-10-05)

1. 읽음 워터마크 + 배지 숫자를 유지하고 PRODUCT §4.2 · DESIGN :871·:2230을 개정한다.
2. `review`는 안 읽음·배지에서 뺀다(push가 `updatedAt`을 덮어 시각이 거짓이다).
3. `needs_reconnect`를 뺀다(생산자 없음).
4. 프로젝트당 상한을 없애고 메뉴 안 스크롤(접힌 항목이 보지 않고 읽음이 되는 일 제거).
5. 열기를 Action 하나로 합친다(서버가 조회 전 `now`로 기록).
6. 트리거는 세로선 오른쪽, 아바타 왼쪽.
7. `setup`은 OWNER 전용(목록 띠와의 차이는 의도).
8. 창 focus 재조회는 더하지 않는다(비목표 — 실시간 갱신).
9. 배지 0은 메뉴를 닫을 때 반영한다(열린 채 트리거 폭이 바뀌지 않도록 — 시안 D1).
10. 행·그룹은 전역 검색 형이고, `ListGroup`·`DropdownMenuRow`·`ListRow hoverFill`로 검색과 같은 부품을 공유한다.
11. EDITOR 실패 안내는 Home처럼 따로 한 줄. 오류 문장은 `CommandStatus` danger 줄.
