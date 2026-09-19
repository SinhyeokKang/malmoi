# Members 화면 리워크 — design

## 0. 영향 받는 흐름

**편집 UI 하나다.** push·pull·export·blob SHA 어느 것도 지나지 않는다.

```
app/(edit)/projects/[slug]/members/page.tsx   서버 — 게이트 · 조회 둘 · now · 좌석 판정
  └ components/members/
      members-panel-header.tsx   (신설, client)  좌석 라벨 + [Invite] 트리거 + 모달 소유
      member-list.tsx            (재작성, client) 카드 + 행 + 사전 차단 + 제거 Dialog
      pending-invitations.tsx    (재작성, client) 카드 + 행 + 빈 상태
      invite-modal.tsx           (invite-dialog.tsx 대체, client) OnboardingModal 2얼굴
      member-row.tsx             (신설)          두 카드가 공유하는 행 껍데기 + 사유 띠
      role-chip.tsx              (신설)          읽기전용 자물쇠 칩
  └ components/ui/row-card.tsx   (추출)          RowCard / RowCardList / RowCardItem / BannerLine
  └ lib/auth/member-identity.ts  (신설, 순수)    이름/주소 두 줄 배치 + 아바타 seed
  └ lib/auth/seat-notice.ts      (신설, 순수)    좌석 라벨 갈래 + EDITOR 우선순위
```

Server Action 셋(`createInvitation`·`changeMember`·`revokeInvitation`)은 **시그니처·판정·`revalidatePath` 전부 그대로**다. 바뀌는 것은 둘: `createInvitation`의 `role` 인자를 호출부가 상수 대신 값으로 넘기고, 성공 응답에 `label` 한 필드가 붙는다.

## 1. 순수 함수로 분리 가능한 부분 — `/tdd` 진입점

**신규 둘, 재사용 둘.** 재사용 쪽이 "사전 차단과 서버 거부의 문구가 같다"를 배선이 아니라 **구조로** 보장하는 자리다.

### 신규 1 — `lib/auth/member-identity.ts`

```ts
export type MemberIdentity = {
  primary: string;
  secondary: string | null;
  unnamed: boolean;
  /** 아바타 이니셜의 씨앗. primary와 갈라 둔다 — 아래 ⚠️ */
  avatarSeed: string | null;
};

export function planMemberIdentity(member: {
  name: string | null;
  emailLabel: string | null;
  readable: boolean;
}): MemberIdentity;
```

갈래 넷을 테스트가 고정한다:

| `name` | `emailLabel` | `readable` | `primary` | `secondary` | `avatarSeed` |
|---|---|---|---|---|---|
| `"Jane"` | `"j***@acme.com"` | `true` | `Jane` | `j***@acme.com` | `Jane` |
| `null` | `"j***@acme.com"` | `true` | `j***@acme.com` | `null` | **`null`** |
| `null` | `null` | `true` | `m.members.unnamed` | `null` | `null` |
| — | — | `false` | `m.members.unreadableLabel` | `null` | `null` |

⚠️ **`avatarSeed`가 `primary`와 갈라져 있는 이유** — `components/ui/entity-card.tsx:31-35`가 정확히 그 함정을 이미 밟았다: *"1행이 마스킹 이메일이라 이니셜이 `o***@…` → `o`가 되고 셸 아바타(`s`)와 다른 글자·다른 색이 되어 아바타가 사람을 못 가리킨다."* 그래서 그 카드는 `avatarName`을 1행 텍스트와 갈라 놓았다. **씨앗이 `null`이면 아바타는 이니셜 없는 중립 원**이다.

⚠️ **`readable` 필드를 두 로더가 채운다 — 문자열 센티널을 쓰지 않는다.** 지금 `lib/auth/query.ts:96`의 센티널이 `storedRows[i]?.user !== null && r.user === null`이라 **로더 안에서는 "주소가 없는 행"과 "못 읽은 행"이 이미 다른 갈래인데 라벨 문자열로는 되살릴 수 없다.** (덧붙여: `m.common.unreadable`과 값을 **비교하는** 코드는 리포에 현재 0건이다 — 비교를 넣는 순간 리포 최초의 센티널을 새로 만드는 것이다.)

⚠️ **`PendingInvitation`에는 `name`이 없다** (`invitedByName`은 초대한 사람이다). 대기 초대에 이 함수를 쓸 때 호출부가 `name: null`을 박는다.

⚠️ **`m.members.you`는 이 함수 밖이다** — 자기 자신 표식은 갈래 넷과 직교이므로 행 껍데기가 든다.

### 신규 2 — `lib/auth/seat-notice.ts`

```ts
export type SeatNotice =
  | { kind: "seats";     n: number; limit: number; canInvite: true }
  | { kind: "seatsFull"; n: number; limit: number; canInvite: false }
  | { kind: "ownerOnly"; canInvite: false };

export function planSeatNotice(input: { role: Role; memberCount: number }): SeatNotice;
```

**이 함수가 존재하는 이유가 "EDITOR × 좌석 10/10에 문구가 둘"이라는 질문이다** — 판정 함수가 없어 그 우선순위가 JSX 조건문에 묻히려던 것이고, 여기 단언 하나(`role === "EDITOR"`면 `memberCount`와 무관하게 `ownerOnly`)로 닫힌다.

⚠️ **서버에서만 부른다.** 내부에서 `planInvitationCreate`를 부르는데 그 모듈이 `node:crypto`를 문다 — §6 참조. `page.tsx`가 부르고 `SeatNotice` 값을 prop으로 내린다.

### 재사용 1 — `planMemberChange` (`lib/auth/membership.ts`, 무변경)

```ts
const blocked = planMemberChange({ members, targetUserId: member.userId, nextRole: null }) === "last-owner";
```

`members`가 이미 `{ userId, role }`을 들고 있어 **prop 추가 없이** 행마다 부를 수 있다(`MemberView`가 `MemberRow`를 구조적으로 만족한다). 서버(`changeMember`)가 부르는 것과 **글자 하나까지 같은 함수**다.

⚠️ **제거(`nextRole: null`)와 강등(`nextRole: "EDITOR"`)이 같은 판정을 지나므로 한 번만 부르면 둘 다 커버된다** — 그 함수의 주석이 그렇게 설계됐다고 적고 있다. 셀렉트와 [Remove]를 같은 boolean으로 끈다.

⚠️ **이 모듈은 `import type { Role }` 하나만 무는 진짜 잎이라 클라이언트가 값으로 import해도 된다** — 단 `components/__tests__/client-graph.test.ts`의 `CLIENT_LIB_FILES`가 45개 `toEqual` **정확 일치**라 **거기에 한 줄을 더하는 것이 같은 커밋에 들어가야 한다.** `lib/auth/member-identity.ts`도 같다.

### 재사용 2 — `planInvitationCreate` (`lib/auth/invitation.ts`, **3줄 변경**)

`ok` 갈래에도 `limit`을 싣는다. 근거·영향 범위는 spec §5의 표에 있다 — 프로덕션 호출부는 하나이고 `.status`만 읽어 무변경, 깨지는 것은 기존 `toEqual({status:"ok"})` 둘이며 **의도된 red**다.

## 2. 그릇 — 카드를 공유 프리미티브로 뽑는다

**`components/ui/row-card.tsx`로 `RowCard` / `RowCardList` / `RowCardItem` / `BannerLine` 넷을 추출하고 `/projects`와 멤버 둘이 쓴다.** (2026-09-19 승인)

근거: 핸드오프가 "Projects가 쓰는 것과 **같은 것**"을 확정 요구로 든다. 복사하면 선의 급 둘(`#f0f0f0` 헤더 divider / `#e5e5e5` 행 구분), `divide-y` 금지, `shrink-0`, `@container` 위치, `ring-inset` — **주석으로만 지켜지던 함정 다섯**이 두 벌로 갈린다.

### 왜 기존 프리미티브가 아닌가

| 후보 | 기각 근거 |
|---|---|
| `components/ui/card.tsx` | 제목이 `text-sm`(시안 15) · 헤더 선이 `border-border`(#e5e5e5) 전폭인데 시안은 `#f0f0f0` · 본문이 `space-y-2 p-4`라 행 목록에 padding이 두 벌 · 카운트 배지 슬롯 없음 · `overflow-hidden`·`shrink-0`도 없다 |
| `components/ui/entity-card.tsx` | 형은 가깝다(아바타 + 2줄 + 우측 슬롯, `flex items-center gap-3 rounded-lg border p-3`). **그러나 개별 카드이고 목록 카드가 아니다** — 카드 하나가 곧 행이라 "제목·배지·설명을 든 헤더 + 그 아래 행 여럿"이 안 나온다. 멤버 **행 내부**의 형이 같다는 사실은 남으므로 `RowCardItem`이 그 클래스를 참고한다 |

→ `Card`는 설정 블록·온보딩 섹션의 그릇으로 그대로 두고, **행 목록 카드는 별개 프리미티브**다.

### 추출 비용 — "프롭 추가 없이 공유"는 성립하지 않는다

실측으로 최소 다섯이 필요하다:

| 무엇 | 왜 |
|---|---|
| `countLabel` | `ProjectCard`의 sr-only가 **`m.projects.count(count)` 하드코딩**(`project-list.tsx:229`)이다. 안 뚫으면 멤버 카드가 "3 projects"를 낭독한다 |
| `titleId` | §3이 `<h2 id>` + `<ul aria-labelledby>`를 요구한다 |
| `description` | 멤버 카드가 헤더에 설명 한 줄을 든다. ⚠️ **`/projects`가 이 슬롯을 안 쓰는 소비자다** — POSTMORTEM 2026-09-14(*"프리미티브의 여백 하나가 그 슬롯을 안 쓰는 소비자에게만 깨졌다"*, 그때 깨진 소비자가 하필 초대 Dialog였다)의 규칙대로 **조건을 코드에 조건으로 쓴다**(`description !== undefined ? … : …`). 지금 헤더는 `flex items-center gap-2 p-4` **한 줄 전제**다 |
| 목록 제네릭화 | `RowList`가 `rows: ProjectListRow[]`를 받아 `ProjectRow`를 직접 그린다. `RowCardList`는 children을 받는다 |
| 빈 상태 조각 | Pending 0건이 `<ul>` divider 규칙과 안 맞는다. `/projects`의 `EmptyCard` 형(칩 36 · padding `48 24`)을 같은 파일에 올린다 — ⚠️ **`components/ui/empty-state.tsx`를 쓰지 않는다.** `empty-projects.tsx` 주석이 그 판단을 이미 내렸다(*"그쪽은 칩 48 + py-12이고 여기는 카드 규격이다. 프리미티브를 이 화면에 맞추면 소비자 아홉이 함께 움직인다"*) |

**소비자에 남기는 것**: hover 배경 · `ring-inset` · 전체-링크 형. 프리미티브로 올리면 `projects-cards.test.tsx:112-120`("카드 헤더에 hover 없음")이 red다.

**제목 크기 `text-base`(16) ↔ 시안 15**가 어긋난다 — 프리미티브가 하나로 고정되므로 `/design-sync` 실측에서 어느 쪽으로 맞출지 정한다.

### 회귀 방어 (T3의 검증이 이것이다)

- ⚠️ **`components/__tests__/projects-screen.test.ts`가 진짜 방어선이다.** `project-list.tsx` 한 경로를 `readFileSync`로 읽어 마크업 리터럴을 다수 `toContain`한다 — `w-[420px]`·`py-3.5`·`pl-14`·`border-foreground/[0.06]`·`hover:bg-foreground/[0.02]`·`@container`·`@max-[1120px]:…`·`className="text-muted-foreground w-[332px] …"` 전문 일치. **마크업을 옮기면 대량 red다. T3이 같은 커밋에서 읽는 경로를 고친다.** ("projects 기존 테스트 무변경"은 거짓이었다.)
- `components/__tests__/panel-header.test.tsx`가 `CONSUMERS` 11개를 하드코딩하고 각 파일에 `<PanelHeader|<PanelBody` 태그가 1개 이상일 것을 단언한다 — `project-list.tsx`와 `members/page.tsx` 둘 다 그 목록에 있다.
- ⚠️ **POSTMORTEM 2026-09-15의 규칙**: *"한 커밋이 형제 프리미티브 둘 이상을 옮기면 소비자를 **프리미티브마다 따로** 센다(합집합 금지)."* T3이 넷을 한 커밋에 옮기므로 **세는 명령을 태스크에 적는다.**
- ⚠️ **`ring-inset`을 잃지 않는다** — 카드가 `overflow-hidden`이라 바깥으로 퍼지는 포커스 링이 통째로 잘린다(DESIGN §7 + `project-list.tsx:281` 주석). 멤버 행은 링크가 아니지만 **행 안의 셀렉트·버튼**이 같은 조건에 놓인다.
- ⚠️ **선의 철자가 갈려 있다** — `#f0f0f0`은 `--divider`(`border-divider`) 토큰이 있는데 `project-list.tsx`는 `border-foreground/[0.06]`(같은 색)을 쓴다. **추출하면서 한 철자로 통일하고 주석에 적는다** — 안 하면 한 화면에 두 철자가 선다.

## 3. 행 — `<table>`에서 `<ul>`/`<li>`로

`members.prompt.md` §2가 "후자면 `Td`의 의미가 사라지므로 접근성 표 시맨틱을 어떻게 지킬지"를 물었다. **답: 표 시맨틱을 지키지 않는다.**

근거 셋:

1. **Projects 행이 이미 `<ul>`이고 같은 그릇을 공유하는 것이 이 변경의 목적이다.** 한쪽만 `<table>`이면 그릇이 같아도 접근성 트리가 갈린다.
2. **열 머리가 사라지면 `<table>`의 가치가 사라진다.** `<th>` 없는 표는 스크린리더에 "5열 4행"만 말하고 셀 이름을 못 준다 — 지금 `sr-only <Th>`가 그 부채를 메우고 있었다.
3. **행 아래 사유 띠가 `<tr>` 형제로는 안 들어간다.** 띠는 전폭이고 들여쓰기 56인데 `<tr>` 안에 넣으려면 `colSpan`을 세야 하고, 열 수가 역할별로 갈린다(EDITOR는 액션 열이 없다).

대신 지키는 것:
- 카드마다 `<ul>` + `<li>` → 스크린리더가 **개수를 읽는다**(`RowList` 주석이 같은 이유를 적고 있다).
- 카드 제목이 `<h2 id>`이고 `<ul aria-labelledby>`로 묶는다.
- 행 안 컨트롤의 접근 이름은 **지금 그대로** 대상을 든다(`m.members.changeRole(who)` · `m.members.removeLabel(who)` · `m.members.pending.revokeLabel(who)`).
- 사유 띠는 `<li>` **안**의 둘째 블록이다.

### ⚠️ `headingId`가 카드 제목으로 옮겨간다 (이전 판본의 "옮기지 않는다"는 틀렸다)

지금 `page.tsx`가 착지점 **둘**을 든다 — `<h1 id="members-heading" tabIndex={-1}>`(PanelHeader)과 `<h2 id="pending-heading" tabIndex={-1}>`(수동 `<section>` 래퍼). spec §4가 그 래퍼를 지우므로 **`pending-heading`은 카드 헤더로 갈 수밖에 없다.** 이전 판본은 `members-heading` 한쪽만 보고 결론을 양쪽에 적용했다.

두 짝을 함께 옮기는 것이 결론이다 — DESIGN §6.65가 이미 *"그 표의 제목으로 간다"*이고 **카드가 곧 그 표**이며, 페이지 `<h1>Members</h1>` 아래 카드 `<h2>Members</h2>`가 서서 같은 낱말이 제목으로 두 번 서는 문제도 함께 풀린다.

같이 고쳐야 하는 것:
- `members-screen.test.ts:54-61`의 `it.each([["MemberList","h1"],["PendingInvitations","h2"]])` — **`page.tsx` 한 파일 안**에서 `headingId` 값 ↔ `<h2 id tabIndex={-1}>` 동일성을 정규식으로 센다. 대상 파일을 카드 컴포넌트로 바꾼다.
- `members-focus.test.tsx`의 착지 단언 둘.

## 4. 사전 차단의 접근성 배선

| 자리 | 마크업 |
|---|---|
| 꺼진 [Invite] (좌석 초과 / EDITOR) | `aria-disabled="true"` + `onClick` 미배선 + `aria-describedby={reasonId}`. 사유 텍스트가 `id={reasonId}`로 버튼 **왼쪽**에 선다 |
| 마지막 오너 행 | 셀렉트·[Remove]에 `aria-disabled` + `aria-describedby={bandId}`. 띠가 `id={bandId}` |
| 못 읽은 행 | **띠를 `<li>` 안 DOM 순서로 두는 것이 전부다.** `aria-describedby`를 걸지 않는다 — 주 텍스트는 포커스도 못 받고 labelable도 아닌 요소라 **전달 경로가 없고**, 걸어 두면 "묶었으니 됐다"로 읽혀 더 나쁘다 |
| 못 읽음 + 마지막 오너가 같은 행 | **띠 하나에 문장 둘**(못 읽음 → 마지막 오너 순). `aria-describedby`는 그 띠 하나를 가리킨다 — 한 행에 띠는 항상 하나다 |

⚠️ **`disabled`를 쓰면 사유가 영영 낭독되지 않는다.** 포커스를 못 받는 요소의 `aria-describedby`는 전달 경로가 없다. 시안이 "꺼진 버튼에는 **반드시** 이유가 붙는다"를 요구하므로 `aria-disabled`가 그 요구를 만족하는 유일한 형이다.

✅ **`Button`이 `aria-disabled`를 통과시킨다 — 확인 완료.** `{...props}`를 그대로 스프레드하고, cva가 variant 다섯 전부에 `aria-disabled:` 짝을 이미 든다(base·primary·default·danger·ghost·link — 2026-09-17 전역 규칙, `disabled-pairing.test.ts`가 0건을 강제). **`components/ui/button.tsx` 변경 불필요.**

⚠️ **그러나 `loading`과 겸용 불가다.** `disabled={disabled === true || loading}`이 진짜 `disabled`를 걸어 전달 경로가 죽는다. **사전 차단은 `loading` 없이 `aria-disabled`만.**

⚠️ **비활성 형을 리포 선례와 맞춘다.** `home/sync-button.tsx`·`projects/new-project-button.tsx`는 `onClick` 미배선이 아니라 `onClick`에서 `event.preventDefault()`로 막는다. POSTMORTEM 2026-09-17이 *"같은 pending이 화면마다 다르게 보였다 (비활성 형 이탈의 2회차)"*를 기록했으므로 **선례 쪽으로 맞춘다.**

⚠️ **`disabled-pairing.test.ts:95`가 호출부에서 `aria-disabled:` 스타일을 직접 그리는 것을 0으로 고정한다** — 겉모습은 `buttonClass`가 이미 든다. **속성만 세운다.**

✅ **`modal.tsx:150-155`의 `returnFocusRef` 복귀가 `!target.matches(":disabled")`만 보므로 `aria-disabled` 트리거에도 포커스가 돌아간다** — §6과 실제로 맞물린다.

⚠️ **POSTMORTEM 2026-09-14 — "접근성 방어선 셋을 세웠는데 셋 다 지워도 green이었다."** 이 변경이 새 방어선 셋(띠 `describedby` · 칩 접근 이름 · 꺼진 [Invite] 사유)을 세우므로 그 회고의 규칙 넷을 따른다: **방어선을 새로 만들면 뮤테이션을 돌린다** · `?.` 뒤 부정 단언 금지 · 대상 집합을 구현 수단으로 좁히지 않는다 · 필터 뒤 `expect(subset.length).toBeGreaterThan(0)`.

## 5. 사전 차단과 서버 거부의 **문구 동일성**을 테스트가 센다

이 기능의 실질 위험은 "두 판정이 갈리는 것"이 아니라 — 같은 함수를 쓰므로 안 갈린다 — **같은 상황에 두 문장이 서는 것**이다.

⚠️ **소스 스캔으로는 못 센다.** 이전 판본이 제안한 둘 다 무효다:
- `expect(src).toContain("accessErrorMessage")` — **오늘 이미 green이다**(`member-list.tsx:159`에 그 호출이 있다). 파일에 토큰이 있기만 하면 통과한다. POSTMORTEM 2026-09-18이 정확히 이 판정을 기각했다: *"인가 방어선이 호출이 아니라 이름을 셌다 — import 줄과 주석 인용만으로 green"*. 이 리포는 "왜"를 주석에 쓰는 규칙이라 더 잘 통과한다.
- `expect(src).not.toMatch(/\b10\b/)` — `gap-10`·`w-10`·`pl-10`·주석의 `2026-09-10`에 전부 걸린다.

**대신 렌더 단언과 반환값 단언으로 센다:**

```ts
// components/__tests__/members-screen.test.ts (신규 블록, jsdom)
it("마지막 오너 띠가 사후 Alert과 같은 문자열을 쓴다", () => {
  const band = renderRow({ owners: 1 }).querySelector("[data-band]");
  expect(band?.textContent).toBe(accessErrorMessage("last-owner"));
});

// lib/auth/__tests__/seat-notice.test.ts
it("좌석 상한을 화면이 따로 들지 않는다", () => {
  expect(planSeatNotice({ role: "OWNER", memberCount: 4 })).toEqual({
    kind: "seats", n: 4, limit: MEMBER_LIMIT, canInvite: true,
  });
});
it("EDITOR는 좌석이 차 있어도 역할 사유가 이긴다", () => {
  expect(planSeatNotice({ role: "EDITOR", memberCount: MEMBER_LIMIT }).kind).toBe("ownerOnly");
});
```

그리고 소스 스캔이 남는 자리는 **`MEMBER_LIMIT` import 부재**다(화면 파일이 상수를 따로 들지 않는다는 뜻).

## 6. 초대 모달 — `OnboardingModal`에 얹는 방법

`components/ui/modal.tsx`를 **고치지 않는다.** 필요한 슬롯이 전부 있다 (여덟 전부 실물 확인).

| 시안 요소 | `OnboardingModalProps` |
|---|---|
| 제목 (얼굴마다 다름) | `title` |
| 설명 (얼굴마다 다름) | `description` |
| 바닥 왼쪽 (`4 of 10 seats used` / `Expires in 7 days · Editor`) | `footer` |
| 바닥 오른쪽 ([Create invite link] / [Done]) | `actions` — 임의 노드라 `Step` 타입을 지나지 않는다 |
| 폼 → 링크 전이 낭독 | `transitionKey="form"` → `"link"` (`step`은 **안 넘긴다** — 온보딩 전용 타입이다) |
| 뒤로 없음 | `showBack` 기본 `false` |
| 닫을 때 [Invite]로 복귀 | `returnFocusRef` |

⚠️ **`step`을 넘기지 않으면 `Step n of 4`가 안 뜬다** — 그것이 의도다. 초대는 단계가 아니라 두 얼굴이다. `footer ?? (step === undefined ? null : …)`라 "step 없이 footer만" 형이 성립한다.

⚠️ **사후 거부는 세 번째 얼굴이 아니다** — `createInvitation`이 `{ok:false, error}`를 **값으로** 돌려주므로(throw 아님) 폼 얼굴에 머물며 **본문 맨 아래 `Alert`**으로 선다. 입력값이 남고 포커스는 누른 제출 버튼으로 돌아간다(malmoi#53 관용구). 문구는 `m.members.invite.{alreadyMember, failed}` + `accessErrorMessage`.

⚠️ **`actions`를 주면 `onNext`가 optional이 된다**(props 유니온 `{actions?: undefined; onNext} | {actions; onNext?}`). 폼 제출은 `<form>` 안의 `type="submit"` 버튼이 받는다 — **Enter로 submit되려면 그 버튼이 `<form>` 안에 있어야 한다**(POSTMORTEM 2026-09-08). `actions` 슬롯은 모달 바닥이고 본문 `<form>` 바깥이므로 **`form="invite-form"` 속성으로 묶는다**(`Button`이 native 속성을 스프레드하므로 배선된다).

⚠️ **`form=`은 이 리포 첫 도입이다** (`grep -rn "form=" app components --include='*.tsx'` → **0건**). 그리고 지금 `members-screen.test.ts`의 초대 검사는 `<form` 존재 + `type="submit"` 존재만 보므로 **버튼이 폼 밖으로 나가도 green이다** — `form=` 연결 자체를 세는 단언을 새로 세우고, 2026-09-14 규칙대로 **뮤테이션으로 red를 확인**한다.

⚠️ **트리거가 모달 바깥이다.** `OnboardingModal`은 `open`/`onClose` 제어형이고 `DialogTrigger`가 없다. [Invite] 버튼과 모달을 같은 클라이언트 컴포넌트(`members-panel-header.tsx`)가 든다.

⚠️ **높이 720을 직접 주지 않는다** — 모달이 `min-h-[min(80svh,800px,calc(100svh-96px))]`를 이미 든다(malmoi#33 계보). 두 얼굴이 같은 높이를 쓰는 것은 껍데기가 보장한다. (⚠️ `modal.tsx:27`의 자기 주석이 "폭이 800"이라 낡았다 — 실제는 `max-w-[1024px]`.)

⚠️ **링크 얼굴 제목의 라벨은 서버가 만든다** — `createInvitation` 응답에 `label: maskedEmailLabels([email])[0]`. 클라이언트에서 가리면 유출은 아니지만(값이 그 브라우저에서 나왔다) **세 번째 마스킹 구현**이 되고(시안의 `da••@…`는 `maskEmail`의 출력 `d***@…`가 아니다) `lib/auth/email.ts`의 *"지역 사본을 두면 같은 주소가 화면마다 다르게 보인다"* 주석과 PRODUCT §3을 어긴다. 무엇보다 `members-screen.test.ts`의 `maskEmail` 금지선이 **파일 둘 하드코딩**이라, 한 번 예외를 허용하면 그 상시 검사가 `components/members/` 전체에서 사라진다.

## 7. 클라이언트 번들 경계 — 태스크가 손대야 하는 목록

`components/__tests__/client-graph.test.ts`의 `CLIENT_LIB_FILES`가 **45개 `toEqual` 정확 일치**다(launch-readiness L4.9 — 패키지 허용 목록만으로는 리포 내부 모듈 체인을 못 봐서 뒤집은 것).

| 모듈 | 클라이언트가 값으로 읽나 | 조치 |
|---|---|---|
| `lib/auth/membership.ts` | **예** (`planMemberChange`) | 목록에 **한 줄 추가**. `import type { Role }` 하나만 무는 진짜 잎이라 정당하다 |
| `lib/auth/member-identity.ts` (신규) | 예 | 목록에 한 줄 추가. ⚠️ `lib/auth/`에 두면 `/push` 4a의 **ARCHITECTURE 문서 트리거**도 함께 켜진다 |
| `lib/auth/seat-notice.ts` (신규) | **아니오** — 서버가 부르고 값만 내린다 | 목록 무변경 |
| `lib/auth/invitation.ts` | **불가** (`node:crypto`) | 클라이언트 import 금지 |
| `lib/auth/query.ts` | **불가** (prisma) | `MemberView`·`PendingInvitation`은 **반드시 `import type`** |

⚠️ **역방향 함정**: `members-screen.test.ts:135`가 `member-list.tsx` + `pending-invitations.tsx`에 `canPerform`이 **있어야** 한다고 센다. 권한 판정을 서버 boolean prop으로 올리면 그 단언이 red가 되는 동시에 `CLIENT_LIB_FILES`에서 `lib/auth/permission.ts`를 빼야 한다 — **두 검사가 반대로 당긴다.** 지금 계획(컴포넌트가 `role`을 받아 `canPerform`을 부른다)을 유지하면 둘 다 그대로다.

## 8. 스키마 변경 / 새 환경변수

- **스키마 변경: 없다.** 마이그레이션 없음 → `/db` 불필요. `readable`은 파생값이다.
- **새 환경변수: 없다.** `.env.example` 무변경.

## 9. 불변식 영향 (ARCHITECTURE §0)

| 축 | 영향 |
|---|---|
| export 결정성 · blob SHA | **없다.** 이 화면은 리포를 안 건드린다 |
| 번역 값/소스 키 소유권 | **없다** |
| 인증 경계 (§6) | **판정은 전부 그대로.** 페이지 `translation:write`, Action 셋 `member:manage`(`actions.ts:140`·`:246`·`:294` — 전부 `getProjectAccess` → `status !== "ok"` 즉시 반환). ⚠️ **노출만 바뀐다** — [Invite]가 EDITOR에게도 렌더된다(꺼진 채). 서버 거부가 그대로 있으므로 차단선은 안 움직이고, 오히려 CLAUDE.md의 *"조건부 렌더는 어느 층도 아니다"*를 명시적으로 걷어내는 방향이라 규칙을 **강화한다** |
| PII 경계 (sec-audit 발견 4) | **없다 — 지켜야 한다.** 두 로더가 `emailLabel`만 돌려주고 원문은 와이어에 안 오른다. `readable: boolean`은 ① 원문을 함축하지 않고 ② 복호화 실패는 이미 라벨로 화면에 보이며 ③ 상시 검사 셋(`members-screen.test.ts:195/201/207`)을 전부 통과한다(필드명이 `email`로 시작하지 않아 타입 본문 정규식 `^\s*email\??:`에 안 걸린다) |
| 테넌트 경계 | **없다.** `loadMembers`(`where: { projectId }`)·`loadPendingInvitations`(`where: { projectId, acceptedAt: null, expiresAt: { gt: now } }`) 둘 다 `projectId` 선두. `middleware.ts:68`의 `/projects/:path*`가 이미 덮어 matcher 변경 불필요 |

## 10. POSTMORTEM 소환 (착수 전 grep 결과)

| 항목 | 이 변경과의 접점 |
|---|---|
| **2026-09-09 malmoi#18** — 마스킹한 이메일이 두 초대를 같은 행으로 만들었고 되돌릴 수 없는 버튼이 그 위에 있었다 | ⚠️ **행 구조를 다시 짠다 = 그 함정에 다시 선다.** 대기 초대 행은 **마스킹 라벨이 유일한 식별자**이고, 아바타·2줄 배치가 붙어도 그 사실은 안 바뀐다. `maskedEmailLabels`(목록 전체를 보는 판정)를 **반드시** 그대로 지난다. 재발 방지 grep: `grep -rn 'maskEmail(\|truncate\|relativeTime(' $(find components app -name '*.tsx' -not -path '*__tests__*')` |
| **2026-09-09 sec-audit 4** — 마스킹이 클라이언트에서 일어나 원문이 RSC 페이로드에 실렸다 | 두 클라이언트 컴포넌트를 재작성하므로 `maskEmail` import가 되살아나지 않는지 센다. ⚠️ **그 검사의 `clients` 배열이 파일 둘 하드코딩(`member-list.tsx`·`pending-invitations.tsx`)이라 신설 넷이 자동으로 안 들어간다** — `components/members/**`의 `"use client"` 전수 스캔으로 넓힌다 |
| **malmoi#51 · #53** — 행이 사라진 뒤 포커스가 `body`로 빠졌다 / 거부 뒤 트리거가 `disabled`라 포커스를 못 받았다 | ⚠️ **`remove-${userId}` id가 붙는 자리가 옮겨간다.** effect에서 `getElementById`로 되돌리는 관용구를 그대로 유지한다. ⚠️ **출처 주의**: POSTMORTEM에 그 번호의 항목이 **없다**(그 파일의 이슈 번호는 #3·#18·#20·#33 넷뿐) — 계약의 정본은 `members-focus.test.tsx` 주석과 DESIGN §6.65다. grep으로는 안 소환된다 |
| **2026-09-08** — 제출 버튼 없는 `<form>`이 Enter로 submit되지 않았다 | 초대 폼이 `OnboardingModal` 바닥으로 버튼을 옮기므로 **정확히 그 모양이 된다.** ⚠️ 그 회고가 *"여덟, 전부 submit 버튼 보유"*라 적었는데 실제 `<form>`은 **17건**이고 세는 테스트가 없다 — 2026-09-15의 *"'N곳뿐'을 적었으면 그 수를 세는 것은 테스트여야 한다"*가 겨눈 모양이다 |
| **2026-09-14** — 프리미티브의 여백이 그 슬롯을 **안 쓰는** 소비자에게만 깨졌다 (그때 깨진 소비자가 초대 Dialog였다) | 카드 프리미티브의 `description` 슬롯을 `/projects`가 안 쓴다. **조건을 코드에 조건으로 쓴다.** 둘 다 실측한다 |
| **2026-09-14** — 접근성 방어선 셋을 세웠는데 셋 다 지워도 green이었다 | §4 참조. 새 방어선 셋에 **뮤테이션을 돌린다** |
| **2026-09-14 / 2026-09-09** — Radix Portal: fieldset 비활성만으로 언어 선택을 못 잠갔다 / 포털 안은 열기 전 DOM에 없다 | ⚠️ **행마다 서는 `Select`가 Portal이다.** 제출 중 잠금을 부모 `disabled`에 맡기면 옵션이 열린다. `/bugshot-qa`에서 **실제로 열어 본다** |
| **2026-09-15** — 형제 프리미티브 둘을 함께 옮기며 한쪽 소비자만 셌다 (+ `PanelBody` 주석이 소비자 수를 잘못 셌다) | §2 참조. **프리미티브마다 따로 세는 명령**을 태스크에 적는다 |
| **카드 `overflow-hidden`이 포커스 링 3px을 잘랐다** | ⚠️ **출처 주의**: POSTMORTEM에 없다(`grep -n 'overflow' docs/POSTMORTEM.md` → 0건). 정본은 **DESIGN §7 + `project-list.tsx:281` 주석**이다 |
| **2026-09-13 brand-spelling** — 한 화면에 `malmoi`와 `Malmoi`가 같이 섰다 | 신규 문구 둘이 `malmoi`로 시작한다. **문장 첫 자리도 소문자**다 |
| **2026-09-18** — 인가 방어선이 호출이 아니라 이름을 셌다 | §5 참조. 소스에 토큰이 있는지 세는 검사를 새로 만들지 않는다 |

## 11. 문서 갱신 (이 기능이 끝나면)

`/feature` 금지 사항에 따라 **여기서는 태스크로만 남긴다.**

| 문서 | 무엇 |
|---|---|
| `docs/DESIGN.md` §4.1 | **mono 기준 문장을 고친다** — "초대 링크 URL"을 목록에서 빼고 기준을 "복사 버튼이 붙은 값은 mono가 아니다"로 |
| `docs/DESIGN.md` §6.65 | 멤버 화면 절을 카드·오른쪽 군·읽기전용 칩·사전 차단 셋으로 다시 쓴다. "두 표 모두 마스킹"은 유지. ⚠️ **서버 함수 이름 오타 수정** — `maskedInviteLabels` → **`maskedEmailLabels`**(`lib/auth/invite-label.ts`) |
| `docs/DESIGN.md` §6.4 | **소비자 수 셋이 움직인다** — `Table` *"번역·언어·이력·**멤버** 넷"* → 셋 · `Dialog` *"일곱"*(`invite-dialog` 포함) → 여섯 + `invite-modal` · `Modal` *"둘"* → 셋. ⚠️ 그 `Dialog` 줄은 *"이 수가 세 번 틀렸다"*고 스스로 적고 세는 명령까지 박아 둔 자리다. `row-card` 행도 신설 |
| `docs/DESIGN.md` §6.66 · §6.68 | 둘 다 *"**멤버 화면과 같은 관용구**로 `<Table>`을 `Card` 밖에 둔다"*로 멤버를 선례로 인용한다 — 멤버가 카드로 가면 두 줄이 거짓이다 |
| `docs/DESIGN.md` §1000(부재) | *"멤버 표는 이름으로 대신"*을 `planMemberIdentity`의 규칙(이름이 없으면 마스킹 라벨이 이름 자리로 올라간다)으로 고친다 |
| `docs/DESIGN.md` §6.2 | **새 raw 색 0건**(tone 8색 유지 · `danger` variant 기존 · 띠 색 전부 기존 토큰). ⚠️ **등재가 필요한 것은 치수 하나** — 역할 셀렉트/칩의 `132 × 32`가 리포 전수 0건이고 Tailwind 스케일에 없다(`w-32`=128 · `w-36`=144 · `h-9`=36). **먼저 `h-9` + 내용 폭으로 접을 수 있는지 보고, 안 되면 §6.65에 치수로 등재** |
| `docs/DESIGN.md` §6.651 등 "컨트롤만 role로 갈린다" 관용구 | **멤버가 "안 그린다"에서 "꺼서 그린다"로 뒤집는다.** 멤버만 예외인지 관용구가 바뀐 것인지 §6.65에 명시한다 — 안 적으면 다음 화면이 어느 쪽을 따를지 모른다 |
| `docs/DIRECTORY.md` | `components/members/` 파일 넷 신설 + `components/ui/row-card.tsx` + `lib/auth/{member-identity,seat-notice}.ts` |
| `docs/DIRECTORY.md` + `CLAUDE.md` UI 행 | **"프리미티브 22개" → 23** (둘 다) |
| `docs/PRODUCT.md` | **갱신 필요** — `:84`(멤버 표의 `Email` 열) · `:81`(OWNER는 승격으로 늘린다). spec §9 |
| `docs/ARCHITECTURE.md` | `InvitationCreate`의 `ok`에 `limit`을 실으므로 §6.02 한 줄 |
| `docs/features/members-rework/` | **디렉터리 삭제** — CLAUDE.md의 *"기능이 끝나면 결론을 정본으로 올리고 그 디렉터리는 지운다"* |

⚠️ **`messages/en.tsx`의 `pending.unknownInviter` 주석**(*"이미 마스킹한 **열**이 옆에 있다"*)도 열이 사라지면 거짓이다 — T9에서 함께 고친다.
