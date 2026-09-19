# Members 화면 리워크 — tasks

**순수 함수 → 껍데기 → UI.** 커밋 경계를 `///`로 표시한다 (`/ship`이 이 분리를 지킨다).

⚠️ **착수 보류 상태다** (spec 머리말). 재개하면 T1부터 들어간다 — `/feature-review`(2026-09-19)에서 열린 결정 아홉이 닫혀 **옛 T0(착수 전 확인)은 사라졌다.**

## 커밋 경계는 전부 green이다 — 순서가 그것을 위해 짜여 있다

옛 판본은 여섯 커밋이 red였다. 세 가지를 고쳤다:

1. **문구가 맨 앞이다.** `messages/en.tsx`가 `as const`라 없는 키에 접근하면 **typecheck red**다. 컴포넌트가 문구의 소비자이지 그 반대가 아니다.
2. **테스트 갱신이 각 재작성과 같은 커밋에 있다.** 옛 T10에 몰아 두면 T7~T10 사이가 통째로 red다.
3. **키 이름 변경·삭제는 소비자가 사라진 커밋에서 한다.** T1은 **추가와 값 교체만** 한다.

---

## T1. 문구 (`messages/en.tsx`) — 추가와 값 교체만

- [ ] spec.md §7의 **신규 키**를 `m.members.*` 아래 배치 — `seats`·`seatsFull`·`ownerOnly`·`cardHint`·`count`·`pending.cardHint`·`pending.count`·`unreadableLabel`·`unreadableHint`·`roleLocked` · `invite.{description, roleLabel, roleHint.*, seatsUsed, ready, readyHint, expiresIn, notKept.*, done}`.
- [ ] **값 교체 셋**(키 이름 유지라 소비자 무변경): `invite.title` → `Invite a member` · `invite.help` · `invite.create` → `Create invite link`.
- [ ] **`m.errors.access["last-owner"]` 값 교체** → `A project needs one owner. Make someone else an owner first, then change this.`
  - 소비자는 16곳이지만 **그 값을 생산하는 자리는 멤버 경로뿐**이라 안 번진다(`planMemberChange` + `actions.ts:335`).
- [ ] **안 건드리는 것**: `m.common.unreadable`("Unavailable" — 소비처 셋, `lib/sync/query.ts:91`은 여전히 표다) · `m.members.columns.*`·`pending.columns.*`(아직 소비자가 있다) · `invite.linkHint`(T10에서 `readyHint`로 갈아탄 뒤 지운다).

**검증**: `pnpm typecheck && pnpm test` green — 특히 `lib/i18n/__tests__/no-korean-ui.test.ts` · `brand-spelling.test.ts`(신규 문구 둘이 **소문자** `malmoi`로 시작한다) · `dictionary.test.ts`.

`/// commit: feat(i18n): add the member screen copy for seats, locks and the invite modal`

---

## T2. `planMemberIdentity` + `readable` 플래그 (`/tdd interface`)

- [ ] `lib/auth/__tests__/member-identity.test.ts`를 **먼저** 쓴다 — design.md §1의 갈래 넷 + `avatarSeed` 축.
- [ ] `lib/auth/member-identity.ts` 구현. **`avatarSeed`를 `primary`와 갈라 둔다**(`entity-card.tsx:31-35`가 이미 밟은 함정).
- [ ] `MemberView`·`PendingInvitation`에 `readable: boolean`을 더한다 — `lib/auth/query.ts`의 두 로더가 채운다. **`email`은 여전히 안 싣는다.**
- [ ] ⚠️ **`components/__tests__/client-graph.test.ts`의 `CLIENT_LIB_FILES`에 `lib/auth/member-identity.ts`와 `lib/auth/membership.ts`를 더한다** — 45개 `toEqual` 정확 일치라 안 더하면 T7에서 red다. 둘 다 `import type` 하나만 무는 진짜 잎이다.

**검증**: `pnpm test` green. `members-screen.test.ts`의 *"두 반환 타입이 `email`을 안 든다"* 블록이 **그대로 green**이어야 한다(`readable`은 정규식 `^\s*email\??:`에 안 걸린다). `app/(edit)/__tests__/queries.test.ts`도 `.map(r => r.emailLabel)` 형이라 안 깨진다.

`/// commit: test(members): pin member identity layout`
`/// commit: feat(members): expose a readable flag on the member loaders`

---

## T3. `planSeatNotice` — 좌석 라벨 판정 (`/tdd interface`)

- [ ] `lib/auth/__tests__/seat-notice.test.ts`를 먼저 쓴다 — 갈래 셋(`seats`·`seatsFull`·`ownerOnly`) + **EDITOR × 좌석 10/10이 `ownerOnly`로 떨어지는 단언**(그 단언이 옛 열린 결정 6을 닫는 자리다).
- [ ] `lib/auth/seat-notice.ts` 구현. 내부에서 `planInvitationCreate`를 부른다.
- [ ] ⚠️ **`CLIENT_LIB_FILES`에 더하지 않는다** — 이 모듈은 `node:crypto`를 무는 `lib/auth/invitation.ts`를 물므로 **서버 전용**이다. `page.tsx`가 부르고 `SeatNotice` 값을 prop으로 내린다.

**검증**: `pnpm test` green.

`/// commit: feat(auth): plan the seat notice shown on the members panel header`

---

## T4. `planInvitationCreate`가 `ok`에도 `limit`을 싣는다

- [ ] `lib/auth/__tests__/invitation.test.ts:139`·`:155`의 `toEqual({ status: "ok" })` **둘을 고친다** — 더하는 게 아니라 **고치는 것**이다(의도된 red).
- [ ] `InvitationCreate` 타입과 구현을 고친다 (3줄). 그 함수의 `@returns` 주석이 이미 그렇게 적고 있어 **코드가 자기 주석을 따라가는 변경**이다.
- [ ] 호출부(`app/(edit)/projects/actions.ts:180`)가 `.status`만 읽으므로 **무변경**인지 확인한다.

**검증**: `pnpm test` green. `pnpm typecheck` green.

`/// commit: feat(auth): return the seat limit on a successful invitation plan`

---

## T5. 카드 프리미티브 추출 — `components/ui/row-card.tsx`

- [ ] `project-list.tsx`의 `ProjectCard`·`RowList`·`BannerLine`과 `empty-projects.tsx`의 `EmptyCard` 형을 `components/ui/row-card.tsx`로 옮긴다 → `RowCard` / `RowCardList` / `RowCardItem` / `BannerLine` / 빈 상태 조각.
- [ ] **프롭 다섯을 뚫는다** (design.md §2): `countLabel`(⚠️ 지금 sr-only가 `m.projects.count` **하드코딩**이라 안 뚫으면 멤버 카드가 "3 projects"를 낭독한다) · `titleId` · `description`(⚠️ **`/projects`가 안 쓰는 슬롯이다** — 조건을 코드에 조건으로 쓴다, POSTMORTEM 2026-09-14) · children 기반 목록 · 빈 상태.
- [ ] **주석을 함께 옮긴다** — 선의 급 둘 · `divide-y` 금지 · `shrink-0` · `@container` 위치 · `ring-inset`.
- [ ] **선의 철자를 하나로 통일한다** — `#f0f0f0`이 `--divider` 토큰인데 `project-list.tsx`는 `border-foreground/[0.06]`을 쓴다. 고른 쪽을 주석에 적는다.
- [ ] **소비자에 남긴다**: hover 배경 · `ring-inset` · 전체-링크 형 (프리미티브로 올리면 `projects-cards.test.tsx:112-120`이 red).
- [ ] ⚠️ **`components/__tests__/projects-screen.test.ts`를 같은 커밋에서 고친다** — `project-list.tsx` 한 경로를 `readFileSync`로 읽어 마크업 리터럴을 다수 `toContain`한다(`w-[420px]`·`py-3.5`·`pl-14`·`border-foreground/[0.06]`·`hover:bg-foreground/[0.02]`·`@container`·`@max-[1120px]:…` + `["띠 좌측 들여쓰기 56","pl-14"]` 핀). 읽는 경로를 새 파일로 돌린다.
- [ ] ⚠️ **`components/__tests__/panel-header.test.tsx`의 `CONSUMERS` 11개**에 `project-list.tsx`가 있다 — 태그가 남는지 확인.
- [ ] ⚠️ **POSTMORTEM 2026-09-15 규칙**: 형제 프리미티브 넷을 한 커밋에 옮기므로 **프리미티브마다 따로** 소비자를 센다(합집합 금지). 세는 명령을 커밋 메시지나 주석에 남긴다.

**검증**: `pnpm test` green + `pnpm build` green + `/design-sync`를 **`/projects`에** 돌려 불일치 0.

`/// commit: refactor(ui): extract the row-list card shared by projects and members`

---

## T6. 행 껍데기 · 읽기전용 칩

- [ ] `components/members/member-row.tsx` — 아바타(**이니셜 · `size={24}` · `lib/tone.ts` 8색 · `avatarSeed`가 `null`이면 중립 원**) + 주 텍스트 2줄 + `m.members.you` 표식 + 오른쪽 군(갭 8) + **행 아래 사유 띠**.
  - 띠는 `BannerLine`을 **쓴다**(복사하지 않는다). 들여쓰기 56 = `pl-14` · 배경 `bg-foreground/[0.02]` · 위 선 `border-foreground/[0.06]` · **13px = `text-xs`** — ⚠️ 이 리포는 `--text-xs: 13px`다. **`text-[13px]`를 쓰지 않는다**(전수 0건이고 §4.1이 그 철자를 막는다).
  - **한 행에 띠는 항상 하나다** — 못 읽음 + 마지막 오너가 겹치면 문장 둘을 한 띠에 싣는다.
- [ ] `components/members/role-chip.tsx` — 점선 테두리 + 자물쇠. 접근 이름은 `m.members.roleLocked(who)`.
  - ⚠️ **치수 `132 × 32`가 이 변경에서 유일하게 스케일 밖이다**(`w-[132px]` 전수 0건 · `h-9`=36). **먼저 `h-9` + 내용 폭으로 접을 수 있는지 본다.** 안 되면 T11에서 §6.65에 치수로 등재.
- [ ] 꺼진 컨트롤과 띠를 `aria-describedby`로 묶는 배선을 행 껍데기가 든다. ⚠️ **못 읽은 행의 주 텍스트에는 걸지 않는다** — 포커스를 못 받는 요소라 전달 경로가 없다(design §4).
- [ ] ⚠️ **`focus-ring.test.ts:45`의 `RAW_TAG_ALLOWED`가 빈 배열이다** — `ui/` 밖에서 raw `<button>/<select>/<input>/<textarea>` 금지. 프리미티브만 쓴다.

**검증**: `pnpm test` green + **행 껍데기 단독 렌더 테스트**(jsdom) — 띠 배선·접근 이름·`avatarSeed` 갈래. ⚠️ **새 접근성 방어선이므로 뮤테이션으로 red를 확인한다**(POSTMORTEM 2026-09-14).

`/// commit: feat(members): add the shared member row and read-only role chip`

---

## T7. `member-list.tsx` 재작성 + 그 테스트 갱신 (같은 커밋)

- [ ] `<Table>`·`<Th>`·`<Td>` 제거 → `RowCard` + `RowCardList`.
- [ ] 역할 `Select`와 [Remove]를 오른쪽 군으로. **[Remove]는 기존 `danger` variant 그대로다** — DESIGN §6.4가 소비자로 "멤버 제거"를 명시하고 지금도 그 variant다. 새 variant 없음.
- [ ] 마지막 오너 사전 차단 — `planMemberChange(… nextRole: null) === "last-owner"`로 그 행의 셀렉트·[Remove]를 끄고 띠를 그린다. **`aria-disabled` + `onClick`에서 `preventDefault()`**(리포 선례 형) · **`loading` 겸용 금지**.
- [ ] 못 읽은 행 — `readable === false`면 주 텍스트가 `m.members.unreadableLabel`이고 띠가 붙는다. **행을 숨기지 않는다.**
- [ ] EDITOR — 셀렉트 자리에 `RoleChip`, [Remove] 없음, **띠도 안 그린다**(할 수 있는 행동이 없다).
- [ ] ⚠️ **`remove-${userId}` id · `role="status"` live 영역(노드 identity 유지)을 그대로 옮긴다** (malmoi#51 · #53).
- [ ] ⚠️ **카드 제목이 `<h2 id>`를 들고 `headingId` 착지점이 그리로 옮겨간다** (design §3). `<ul aria-labelledby>`로 묶는다.
- [ ] 사후 `Alert`은 그 행 **아래**(띠와 같은 자리). 문구는 `accessErrorMessage`에서 나온다.
- [ ] **같은 커밋에서 테스트 갱신**:
  - `members-screen.test.ts` — `headingId` ↔ `<h2 id tabIndex={-1}>` 동일성 검사의 **대상 파일을 카드 컴포넌트로** · `Table` 부재 + 카드 배선 **신설**(지금 `Table` 단언은 0건이다) · **문구 동일성 렌더 단언**(띠 텍스트 === `accessErrorMessage("last-owner")`) · `MEMBER_LIMIT` import 부재 · `maskEmail` 금지선의 `clients` 배열을 **`components/members/**`의 `"use client"` 전수 스캔**으로 넓힌다 · `emailLabel` 문자열 단언의 대상 파일 갱신(식별 렌더가 `member-row.tsx`로 내려간다).
  - `members-focus.test.tsx` — 행 구조 변경 반영. 확인 Dialog 버튼 텍스트가 정확히 `"Remove"`, `role="status"` 노드 identity 유지.

**검증**: `pnpm test` green + `pnpm build` green(RSC 경계).

`/// commit: feat(members): move the member table into a row card`

---

## T8. `pending-invitations.tsx` 재작성 + 열 머리 키 삭제

- [ ] 같은 카드·행 구조. 아이콘은 `mail`. `planMemberIdentity`에 **`name: null`을 박아** 부른다(`PendingInvitation`에 `name`이 없다).
- [ ] 역할은 `RoleChip`(전원 — 발급 후 변경 불가).
- [ ] 카드 헤더 설명: `A link expires after 7 days whether it is used or not`.
- [ ] 0건 — **`/projects`의 `EmptyCard` 형**(칩 36 · padding `48 24`), **버튼 없음**. ⚠️ `components/ui/empty-state.tsx`를 쓰지 않는다(`empty-projects.tsx` 주석이 그 판단을 이미 내렸다 — 소비자 아홉이 함께 움직인다).
- [ ] 못 읽은 행 — 라벨 + 띠. **정렬(맨 뒤)은 로더가 이미 한다, 건드리지 않는다.**
- [ ] `pending-heading` 착지점이 이 카드 제목으로 옮겨온다. 같은 커밋에서 `members-screen.test.ts`의 `it.each` 둘째 짝을 고친다.
- [ ] ⚠️ **`maskedEmailLabels`가 유일한 식별자다** (malmoi#18) — 라벨 생성 경로를 건드리지 않는다.
- [ ] **열 머리 키 아홉 삭제** — 소비자가 여기서 사라진다: `m.members.columns.*` · `m.members.pending.columns.*`. ⚠️ **unused-key 게이트가 리포에 없으므로 손으로 지운다.** `messages/en.tsx`의 `pending.unknownInviter` 주석(*"이미 마스킹한 열이 옆에 있다"*)도 함께 고친다.

**검증**: `pnpm test` green.

`/// commit: feat(members): move pending invitations into a row card`

---

## T9. 패널 헤더 · 좌석 수 · 꺼진 [Invite]

- [ ] `components/members/members-panel-header.tsx`(client) — 좌석 라벨 + [Invite](`m.members.invite.open`) + 모달 소유.
- [ ] `page.tsx` — `canPerform && <InviteDialog/>` 조건부 렌더를 **제거**하고, **서버에서 `planSeatNotice`를 불러** `SeatNotice` 값과 `role`을 넘긴다.
  - ⚠️ **클라이언트가 `lib/auth/invitation.ts`를 import하지 않는다**(`node:crypto`).
  - ⚠️ `requireProjectAccess` 호출이 **첫 JSX `return`보다 앞**에 남아야 한다(`members-screen.test.ts`가 위치를 센다).
  - ⚠️ `if (archived) return <ProjectArchived`가 **`getPrisma()`보다 앞**이어야 한다(`app/__tests__/screens.test.ts:224`).
  - ⚠️ **페이지에 `searchParams`를 들이지 않는다**(`members-screen.test.ts:89`).
  - ⚠️ `project === null` → `redirect(routes.projects() + "?e=not-found")` 분기를 남긴다.
- [ ] `aria-disabled` + `aria-describedby` 배선. **`loading` 겸용 금지.**
- [ ] ⚠️ **`panel-header.test.tsx`의 `CONSUMERS` 하드코딩 명단**에 새 파일을 반영한다.

**검증**: `pnpm test` green + **새 렌더 테스트**(`// @vitest-environment jsdom`, 정본 헬퍼는 `components/__tests__/helpers/dom.tsx` — RTL은 리포에 0건)가 **spec §6 상태 표의 렌더 가능한 여덟 행**(#1~#9 중 archived·not-found 제외)을 센다.

`/// commit: feat(members): show seat usage and keep a disabled invite button`

---

## T10. 초대 모달 — `OnboardingModal` 2얼굴 + 역할 선택

- [ ] `components/members/invite-modal.tsx`가 `invite-dialog.tsx`를 대체한다.
- [ ] 얼굴 ① 폼 — Email `Input` + Role 선택 둘(**기본 Editor**). ⚠️ **boxed/card 라디오는 리포 전수 0건이다** — `ui/radio.tsx`의 `Radio`는 테두리 없는 라벨 행이다. 새 시각 형이면 T11의 DESIGN 갱신에 넣는다.
  - 바닥 왼쪽 `{n} of {limit} seats used`, 오른쪽 [Create invite link].
  - **사후 거부 넷은 본문 맨 아래 `Alert`** — 세 번째 얼굴을 만들지 않고 입력값을 지킨다. 포커스는 누른 제출 버튼으로.
- [ ] 얼굴 ② 링크 — 제목 `Link ready for {label}`(**라벨은 `createInvitation` 응답이 준다**), 링크 행 **sans 14**(`text-mono` 제거) + [Copy] 3상태, 안내 카드, 바닥 [Done].
- [ ] `createInvitation` 성공 응답에 `label: maskedEmailLabels([email])[0]` 한 줄을 더한다. ⚠️ **클라이언트에서 가리지 않는다**(design §6).
- [ ] `transitionKey`로 두 얼굴을 가른다. **`step`은 안 넘긴다.**
- [ ] ⚠️ **제출 버튼이 바닥이라 `form="invite-form"`으로 묶는다** — 안 묶으면 Enter가 죽는다(POSTMORTEM 2026-09-08). **`form=`은 리포 첫 도입이다**(전수 0건).
- [ ] `createInvitation({ role })`에 고른 값을 넘긴다.
- [ ] 닫으면 링크·에러·복사 상태를 버린다 (현 동작 유지). `returnFocusRef`로 [Invite]에 포커스를 돌려준다.
- [ ] `invite.linkHint` → `readyHint`로 갈아탄 뒤 옛 키를 지운다.
- [ ] **같은 커밋에서 테스트 갱신**: `members-screen.test.ts`의 초대 검사 넷(`onOpenChange`/`setLink(null)` · `<form>` + `type="submit"` · `routes.invite` · 경로 리터럴 금지)을 새 파일 기준으로. ⚠️ 그 검사들이 `read("components/members/invite-dialog.tsx")`를 직접 하므로 파일이 사라지면 **skip이 아니라 ENOENT 예외**다.
  - **신설**: `form=` 연결 자체를 세는 단언(지금 검사는 버튼이 폼 밖으로 나가도 green이다). 2026-09-14 규칙대로 **뮤테이션으로 red 확인**.

**검증**: `pnpm test` green + `pnpm build` green.

`/// commit: feat(members): rebuild the invite flow as a two-face modal with a role choice`

---

## T11. 문서

문서별 별도 커밋 (`docs(<scope>): …`). 목록의 정본은 design.md §11이다.

- [ ] `docs/DESIGN.md` §4.1 — mono **기준 문장**을 "복사 버튼이 붙은 값은 mono가 아니다"로 고치고 "초대 링크 URL"을 목록에서 뺀다.
- [ ] `docs/DESIGN.md` §6.65 — 멤버 화면 절 재작성 + **`maskedInviteLabels` → `maskedEmailLabels` 오타 수정** + (필요시) `132 × 32` 치수 등재 + **"컨트롤만 role로 갈린다" 관용구가 멤버에서 "꺼서 그린다"로 뒤집힌 사실**을 명시.
- [ ] `docs/DESIGN.md` §6.4 — 소비자 수 셋(`Table` 넷→셋 · `Dialog` 일곱→여섯+`invite-modal` · `Modal` 둘→셋) + `row-card` 행 신설. ⚠️ `Dialog` 줄은 *"이 수가 세 번 틀렸다"*고 스스로 적은 자리다 — **세는 명령을 돌려서 고친다.**
- [ ] `docs/DESIGN.md` §6.66 · §6.68 · §1000 — 멤버를 선례로 인용하는 세 줄.
- [ ] `docs/DIRECTORY.md` — 신설 파일 여섯 + **"프리미티브 22개" → 23**.
- [ ] `CLAUDE.md` UI 행 — 같은 수.
- [ ] `docs/PRODUCT.md` — `:84`(멤버 표의 `Email` 열) · `:81`(OWNER는 승격으로 늘린다).
- [ ] `docs/ARCHITECTURE.md` §6.02 — `InvitationCreate`의 `ok`에 `limit`.
- [ ] **`docs/features/members-rework/` 삭제** (CLAUDE.md의 기능 종료 규칙).

---

## T12. EDITOR 세션 준비 (T13의 선행 조건)

⚠️ **dev DB가 2026-09-18 초기화 상태라 EDITOR 시야를 볼 수단이 없다.** 생성자는 OWNER이므로 프로젝트를 하나 만드는 것만으로는 부족하다.

- [ ] `bugshot-i18n-test-qa`를 **정상 온보딩으로** 다시 만든다(CLAUDE.md가 그 프로젝트를 상주로 정했다 — 한 번 만들면 이후 재사용).
- [ ] 둘째 계정으로 **초대 발급 → 수락 → 그 계정으로 로그인**까지 한 바퀴 돈다.

**검증**: dev DB에 `ProjectMember` 두 행(OWNER 1 · EDITOR 1)이 있고 EDITOR 계정으로 `/projects/:slug/members`에 들어가진다.

---

## T13. 실물 검증

- [ ] `/design-sync` — 핸드오프 대조 루프. **`/projects`도 한 번**(T5의 회귀 면적).
- [ ] `/bugshot-qa` — 역할별 UI 노출·거부 문구·포커스 복귀·입력값 유지.
  - ⚠️ **행마다 서는 `Select`는 Radix Portal이다** — 포털 안은 열기 전 DOM에 없다(POSTMORTEM 2026-09-09). **실제로 열어 본다.** 제출 중 잠금을 부모 `disabled`에 맡기면 옵션이 열린다(2026-09-14).
  - ⚠️ 꺼진 [Invite]·꺼진 셀렉트가 **`aria-disabled`라 포커스를 받는다** — 탭 순서와 사유 낭독을 확인한다.
- [ ] `pnpm typecheck && pnpm test && pnpm build`

**검증**: 불일치 0 · 이슈 0 또는 이슈로 제출.

---

## 건너뛰는 것

| 무엇 | 왜 |
|---|---|
| `/db` | 스키마 변경 0. `readable`은 파생값이다 |
| `.env.example` | 새 환경변수 0 |
| `pnpm test:credentials:postgres` | `lib/credentials/**` 무변경 |
| `pnpm test:projects:postgres` | `lib/keys`·`lib/surfaces`·`lib/push`·`lib/pull`·`lib/publish`·`lib/import`·`lib/protection` 무변경. ⚠️ **`app/(edit)/actions.ts`도 안 건드린다** — 멤버는 `projects/actions.ts`이고, CLAUDE.md의 그 스위트 대상 목록에 후자는 없다 |
| `/l10n-roundtrip` | 어댑터·리포 쓰기 무관 |
| `components/ui/button.tsx` 변경 | `aria-disabled`가 이미 통과하고 `danger` variant가 이미 있다 |
| `components/ui/modal.tsx` 변경 | 슬롯 여덟이 전부 있다 |
| 새 raw 색 등재 | 0건 (tone 8색 유지 · 띠 색 전부 기존 토큰) |
