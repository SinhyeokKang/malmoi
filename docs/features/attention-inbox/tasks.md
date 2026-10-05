# attention-inbox — tasks

순서: 시안 → 순수 함수 → 스키마 → 껍데기 → UI → 문서. `[C]`는 커밋 경계. **(수동)** 표시는 자동 게이트 밖이다(e2e 없음 — `/runtime-test`·`/design-sync`가 본다).

## 0. 시안 (코드 전)

- [x] T0. Claude Design 시안 수령(2026-10-05 — spec 머리 링크 `Attention Inbox.dc.html`, H1–H3 · D1–D7 라이트·다크). 이후 `design-brief.md`보다 시안이 앞선다.
      검증 **(수동)**: 브리프 §5의 프레임 목록이 시안에 전부 있다 — 확인함.

## 1. 순수 함수 (`/tdd interface` → `/implement`)

- [ ] T1. Home 추출 — **테스트 먼저**:
      - `neverFilledLocales`(`lib/home/`) 단위 테스트를 추출 **전에** 쓴다 — 키 0 → 없음 · orphaned 로케일 제외 · 부분 채움 제외 · `at = createdAt`. 그 뒤 Home `page.tsx`의 인라인 계산을 이관.
      - `collectAttention`(상한·state 없음)으로 쪼개고 `attentionItems`가 그 위에 보관·배너 제외·CAP을 덧씌운다. 기존 `attentionItems` 테스트가 그대로 green.
      - `attentionHref` · `attentionTile`(부분 반영 톤 포함) · 문장 함수 `title`·`body`·`tail`을 `attention-card.tsx`에서 `lib/home/attention-view.ts`로 이관. `compare` export.
      - `bannerTranslationsHref`를 `project-list.tsx`에서 `lib/routes.ts`로 이동(목록은 import만 바꾼다).
      검증: `pnpm test` green — 기존 `home-screen`·`state-links` + 새 `neverFilledLocales`·`attentionHref`(Home 카드 href와 같은 값 단언) · `attentionTile`(partial → warning) 테스트. `client-graph` green(Inbox가 컴포넌트 파일을 import하지 않는다).
- [ ] T2. `lib/inbox/plan.ts` — `isUnread` · `badgeLabel` · `planInbox`.
      검증: `pnpm test` —
      - 같은 입력 → 같은 출력(결정성).
      - `seenAt` null/과거/미래 · **`at === seenAt` → 읽음** · 시각 null 항목.
      - **`review`는 `unread: false`이고 배지 수에 안 든다**(seenAt null이어도).
      - EDITOR에게 `setup` 없음 · EDITOR `import_failed`에 Owner 안내 줄 플래그(`ownerRetries`).
      - 한 프로젝트에 항목 7개 → 7개 전부 그린다(상한 없음), 배지 7(review 제외 기준).
      - 정렬: 표면 항목 `surfaceSlug` 보조 키 · 프로젝트 단위 항목 순서(`setup` → `unsent` → 표면 항목) · 묶음 순서(최신 내림차순, 같으면 slug).
      - 배지 `0 → null` · `9 → "9"` · `10 → "9+"`.
      - 출력 직렬화에 `projectId` 키가 없다.
- `[C] feat(inbox): attention inbox planning`

## 2. 스키마 (`/db`)

- [ ] T3. `User.attentionSeenAt DateTime?` additive 마이그레이션(`--create-only`로 SQL 눈 확인 → dev 적용). `lib/privacy/collected.ts` 등재.
      검증: `pnpm db:status` clean · `pnpm typecheck` green · dev `has_schema_privilege` false. prod `db:deploy`는 `/merge` 1단계(여기서 하지 않는다).
- `[C] feat(db): add User.attentionSeenAt` (스키마 + 마이그레이션 + collected 등재만)

## 3. 껍데기

- [ ] T4. 미전달 집계에 `MAX("updatedAt")` 추가(`loadProjectListAggregates` — `pendingWhere` 그대로, 쿼리 모양 그대로).
      `loadReviewAttention(prisma, projectIds[])`로 시그니처 변경(`ANY(ids)` + `PARTITION BY projectId, …`) — Home은 `[projectId]`.
      검증: `pnpm gate`가 `test:projects:postgres`를 붙여 green. `list-aggregates.integration.ts`에 MAX 단언 추가 ·
      **회귀 갱신 대상** `lib/keys/__tests__/list-aggregates.test.ts:53`(빈 결과 `toEqual` — 맵이 늘면 red) · `loadReviewAttention` 다중 프로젝트 픽스처(프로젝트 둘의 행이 섞이지 않는다).
- [ ] T5. `lib/inbox/load.ts` `loadAttentionInbox` — 전용 멤버십 조회(id·`repositoryId`·`createdAt`·표면·로케일·`attentionSeenAt`, 보관 필터 SQL) → 병렬 조회 → `collectAttention` → `planInbox`.
      검증: `pnpm test` — 조립 픽스처:
      - 표면 둘 중 하나 실패·하나 동기화 중 / 표면 없는 프로젝트 / `awaiting_first_sync` 프로젝트.
      - 멤버십 0 · 전부 보관 → 빈 plan **+ 집계 쿼리 0회**.
      - **모든 조회 인자가 인가된 ids뿐**(`list-aggregates.test.ts:57` 형) · **왕복 수 상수**(프로젝트 1개·40개 모두 같은 수).
      - 하위 조회 하나가 던지면 전체가 던진다.
      - 같은 사람 두 행 픽스처 → 직렬화 결과에 원문 이메일 0(POSTMORTEM 2026-09-29).
- [ ] T6. `app/(edit)/inbox/actions.ts` — `loadAttentionBadgeAction` · `openAttentionInboxAction`(조회 전 `now` → 조회 → `updateMany` 단조 → `marked`). `revalidatePath` 없음.
      `app/__tests__/entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 둘을 사유와 함께 등재.
      검증: `pnpm test` — Action 단위 테스트(`getPrisma` mock — `app/(edit)/preferences/__tests__/actions.test.ts` 형):
      - 세션 none·unavailable → `failed` + prisma 미호출.
      - `updateMany`의 where가 `OR: [{ attentionSeenAt: null }, { attentionSeenAt: { lt: now } }]`이고 `data`가 조회 **전** 잡은 `now`.
      - `now` 이후 시각의 항목은 기록 뒤에도 다음 계산에서 unread.
      - 쓰기 실패 → 목록 반환 + `marked: false`.
      - `entry-points.test.ts` green.
- `[C] feat(inbox): badge and open actions`

## 4. UI

- [ ] T7. 사전 키(en·ko·es 같은 커밋) — 접근 이름(`Needs your attention` / `…, {n} unread`) · 행 sr `Unread` · 빈 상태 보조 문장(제목은 Home `Nothing needs you` 재사용) · 오류 · `Try again` · 불러오는 중 sr ·
      EDITOR 안내는 **새 키 없이** `m.projects.importFailure.ownerRetries` 재사용 · `unsent`·`setup` 문장(목록 띠 문장 재사용 가능하면 재사용).
      검증: `dictionary-consistency`·`no-korean-ui` green. ko 문장은 `/translate` 모드 ①.
- [ ] T8a. 프리미티브 — 검색과 공유(design "재사용 설계"). **테스트 먼저.**
      - `ListRow`에 `hoverFill?: boolean` → `CommandItem`의 `hover:bg-transparent` 덮어쓰기를 이관.
      - `components/ui/list-group.tsx` `ListGroup`(머리 `ReactNode`) 신설 → `CommandGroup`이 그것을 쓴다.
      - `components/ui/dropdown-menu.tsx` `DropdownMenuRow`(`Primitive.Item asChild` + `ListRow`, `href`/button 두 갈래, `data-[highlighted]` 7% 하나, focus-visible 링 끔).
      검증: `pnpm test` green —
      - 기존 검색 테스트 전부 그대로 green(동작·클래스 변화 0 — 회귀 대상 `components/ui/__tests__/command*`·검색 화면 테스트).
      - `ListRow hoverFill={false}` → `hover:` 면 클래스 없음 · 기본값은 그대로.
      - `ListGroup` — `role=group` + `aria-labelledby`가 머리 id, 두 번째 그룹만 위 선.
      - `DropdownMenuRow` — `role=menuitem`이 `<a>`(href)·`<button>`에 붙는다(형제 노드 0) · ↓로 하이라이트된 행만 활성 면 · `onSelect` 호출.
      - `slottable-item.test.ts`의 이름 고정 목록에 `DropdownMenuRow` 추가 후 green · `visual-system`(raw 색·`dark:` 0) green.
- [ ] T8b. `components/shell/attention-inbox.tsx` + 헤더 배치(세로선 오른쪽, 아바타 왼쪽). 행·그룹·오류는 T8a 프리미티브와 `CommandStatus`만 쓴다.
      검증: `pnpm test` green — DOM 테스트(jsdom):
      - 열기/닫기 후 셸 생존(`slottable-item` green).
      - **마운트 시 open Action 0회** · 열 때마다 1회 · 다시 열면 다시 1회 · 목록 도착 전 닫아도 호출은 1회(취소하지 않는다).
      - **배지: 열린 동안 그대로 → `marked: true`면 닫는 순간 사라짐** · 닫힌 뒤 응답이 오면 도착 즉시 사라짐 · `marked: false`/`failed` → 닫아도 유지.
      - 트리거 폭: 안 읽음 0이면 `icon-md` 정사각, n이면 `w-auto` + 배지 자식 1(형제 0).
      - 접근 이름이 `Needs your attention, 12 unread`(배지는 `9+`, 숫자 노드 `aria-hidden`).
      - 행: 점은 배지 대상 안 읽음 행에만 · sr `Unread`가 접근 이름 맨 앞 · 검토 대기 행에 점 없음 · EDITOR 실패 행에 `ownerRetries` 줄.
      - 빈 상태 / 불러오는 중(`aria-busy` + `role=status` sr 문장, 항목 0) / 오류(`CommandStatus` danger 줄 + `Try again` menuitem이 ↓ 로빙에 닿고 Enter로 재조회, 시도 중 disabled).
      - 두 번째 열기에서 스켈레톤이 서지 않고, 응답 도착 뒤에도 포커스된 항목이 같은 노드다.
      - 키보드 ↓·Enter·Esc, **Esc 뒤 `document.activeElement`가 트리거**(POSTMORTEM 2311·2470).
      - Inbox 소스에 행 형 클래스(`px-4`·`py-2.5`·`bg-foreground/[0.07]`)가 없다 — 프리미티브만 든다(소스 grep 테스트).
      - pending promise는 테스트 끝에서 푼다(POSTMORTEM 2177) · ko·es 렌더는 조건으로 기다린다(POSTMORTEM 2649).
      **회귀 갱신 대상** `components/__tests__/shell-header.test.tsx:77`("우측은 New project · 구분선 · 사용자 메뉴 순서다").
      `client-graph` green. 라이트·다크 눈 확인은 **(수동 — `/runtime-test`)**.
- [ ] T9. `/design-sync` — 시안(spec 머리 링크) 대비 computed style·접근성 트리. 검색 목록과 행·그룹 computed style이 같은지도 본다.
      검증 **(수동)**: `/design-sync` 리포트의 차이 0(남은 차이는 사용자 승인 기록).
- `[C] refactor(ui): share list row and group primitives with search` (T8a만 — 검색 동작 변화 0)
- `[C] feat(shell): attention inbox in header`

## 5. 문서 (`/implement` 또는 `/push` 4단계)

- [ ] T10. PRODUCT §4.1 "Attention inbox" 추가 · §4.2 "범용 알림 시스템" 본문의 "열람 추적"을 발송물 열람으로 좁히고 ⚠️ "이것은 아니다" 문단 · `/changelog` 새 버전 배지(:760)는 계속 비범위라는 한 줄. `docs(PRODUCT): ...`
      검증: PRODUCT에 세 문장이 있다(grep `Attention inbox`·`열람 추적`·`새 버전 배지`).
- [ ] T11. ARCHITECTURE — 읽음 워터마크 계약(단조 `updateMany`·조회 전 `now`·review 제외 사유)·데이터 경로·왕복 수 상수. CLAUDE.md "데이터 변경 경로" 표에 Action 두 행. `docs(ARCHITECTURE): ...`
      검증: `pnpm sync:agents:check` green(CLAUDE.md 미러).
- [ ] T12. DESIGN — :871·:2230 "헤더 카운터" 금지를 Inbox 배지 하나의 예외로 정정 · 헤더 우측 구성 갱신(§6.5 — 트리거가 ghost의 글자·hover를 덮는 의도된 이탈, 값은 `PUBLIC_HEADER_LINK`) · Inbox 드롭다운 절(버튼 안 배지 형 등재 — 선례 0, 닫을 때 배지 0) ·
      §6.4 메뉴: `DropdownMenuItem`(동작·필터 메뉴, inset `bg-accent`) vs `DropdownMenuRow`(결과 목록, 전폭 7% — 검색과 같은 형)의 경계 · `ListGroup`·`ListRow hoverFill` 등재 · DIRECTORY — `lib/inbox/`·`app/(edit)/inbox/`·`lib/home/attention-view.ts`·`components/ui/list-group.tsx`.
      검증: `pnpm test` green(`visual-system` 등 DESIGN 대조 테스트) · grep으로 :871·:2230 정정 확인.
- [ ] T13. `/privacy` 본문 참 여부(새 목적: 안 읽음 표시) — 고치면 개정 이력·시행일(`policy-gate`).
      검증: `pnpm test` green(`policy-gate.test.tsx`) · `/push` 4단계 개인정보 넷 확인.
- [ ] T14. 가이드 영향 플래그 → `/guide`(헤더 설명) · `/guide-shots`(헤더가 찍힌 컷).
      검증: `pnpm guide:check` 출력을 인용해 stale 후보가 처리됐다.
