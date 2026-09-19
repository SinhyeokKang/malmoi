# Members 화면 리워크 — spec

SoT: Claude Design `design_handoff_members/`(README.md · members.prompt.md · `Members.dc.html` 아트보드 `1a`~`1e`·`1g`). 대조 기준 `SinhyeokKang/malmoi@dev` 2026-09-19.

**화면의 골격은 그대로다.** 바뀌는 것은 **그릇 · 상태 표현 · 초대 모달** 셋이다.

⚠️ **착수 보류 상태다** (2026-09-19 사용자 판단). launch-readiness의 L1.1(제3자 Google 로그인 — 유일한 🔒 런칭 차단)과 L2.10(GitHub App 분리 — 보안)이 먼저다. 이 화면은 PRODUCT §1 완료 조건 경로 밖이고 **지금도 동작한다**. 이 문서는 `/feature-review` 결론까지 반영해 두고 멈춘 상태이며, 재개하면 §10에 남은 셋만 확인하고 T1부터 들어간다.

## 1. 사용자

**둘 다 본다.** 게이트가 `translation:write`라 EDITOR도 이 화면에 들어온다 — 그 사실은 바꾸지 않는다.

| | 무엇을 하러 오나 | 이번 변경이 주는 것 |
|---|---|---|
| OWNER (개발자) | 초대·역할 변경·제거 | 좌석 잔량을 미리 본다 · 막힌 행이 눌리기 전에 이유를 든다 · 초대에서 역할을 고른다 |
| EDITOR (번역 편집자) | "누가 이 프로젝트에 있나" · "곧 올 사람이 있나" | 컨트롤이 **사라지지 않고 꺼진 채 이유를 든다** — 같은 화면을 보며 OWNER와 말을 맞춘다 |

## 2. 문제 (관측된 사실)

1. **그릇이 다른 화면과 다르다.** Projects·Project Home·Account는 2026-09-15 패널 규칙 이후 "자기 헤더를 든 카드"인데, 멤버 화면만 `PanelBody` 안에 `Table` 둘이 `space-y-6`으로 서 있다. 표 머리만 있는 화면은 어느 표가 무엇인지 말하지 않는다.
2. **거부가 전부 사후다.** `MEMBER_LIMIT`(10)은 초대를 눌러야 드러나고, 마지막 OWNER 보호는 셀렉트를 바꿔야 드러난다. 화면은 **멤버 목록을 이미 들고 있어** 둘 다 렌더 시점에 안다.
3. **EDITOR 화면에서 오른쪽 끝이 통째로 빈다.** `canPerform`이 렌더에서 빼므로 [Invite]·[Remove]·셀렉트가 없고, 왜 없는지를 말하는 자리도 없다.
4. **초대 모달이 폼과 링크를 동시에 보인다.** 발급 뒤에도 폼이 남아 "한 번 더 만들라"로 읽히고, 제목이 `Invite a translator` 그대로라 방금 만든 링크가 누구 것인지 화면이 말하지 않는다.
5. **초대 역할이 `EDITOR` 하드코딩이다.** `createInvitation`은 `role`을 **이미 받는데** 호출부(`invite-dialog.tsx`)가 상수를 넘긴다. 그래서 OWNER 둘을 만드는 정상 경로가 "초대 → 승격" 두 걸음이다.
   - ⚠️ 이전 판본이 여기에 *"그 두 번째 걸음이 마지막-OWNER 막힘을 자주 만든다"*를 적었는데 **거짓이다.** `lib/auth/membership.ts:29`가 `nextRole === "OWNER"`면 즉시 `ok`를 준다 — 승격은 `last-owner`에 **절대** 안 걸리고, 걸리는 것은 OWNER를 강등·제거할 때뿐이다(`:31`).
6. **못 읽은 행이 `Unavailable` 한 단어다.** 복호화 실패가 "빈 값"과 구별되지 않는다.

## 3. 완료 조건 (검증 가능)

각 항목 뒤 괄호가 **자동/수동**이다. 이 리포엔 e2e가 없으므로 시각 검증은 전부 수동이다.

### 화면

- [ ] `/projects/:slug/members`가 카드 둘(`Members` · `Pending invitations`)을 그리고, 각 카드가 제목·카운트 배지·설명 한 줄을 **자기 헤더 안에** 든다. — **자동**: `components/__tests__/members-screen.test.ts`에 `Table` import 부재 + 카드 배선 검사를 **신설**한다 (⚠️ 지금 그 파일에 `Table` 관련 단언은 **0건**이다 — 갱신이 아니라 신설이다)
- [ ] 멤버 행의 순서가 `아바타 · 이름/주소 · 가입일 · [역할 · 액션]`이고, 역할 컨트롤과 액션 버튼이 행의 오른쪽 끝에서 갭 8로 한 군이다. — **수동**: `/design-sync` 실측(computed style)
- [ ] 이름이 없는 행은 **마스킹 라벨이 이름 자리**에 서고 둘째 줄이 비어 있다. — **자동**: `planMemberIdentity` 단위 테스트
- [ ] EDITOR 시야에서 [Invite]가 **꺼진 채로 남고**, 그 왼쪽에 `Only owners can invite or change roles`가 선다. 역할은 점선 자물쇠 칩이고 [Remove]·[Revoke]는 없다. — **자동**: 렌더 테스트(jsdom)
- [ ] 대기 초대의 역할이 같은 자물쇠 칩이다(발급 후 변경 불가라는 사실을 형이 말한다). — **자동**: 같은 테스트
- [ ] 패널 헤더 오른쪽이 `{n} of {limit} seats`를 든다. `n === limit`이면 `{limit} of {limit} seats — remove someone to invite` + 꺼진 [Invite]. EDITOR면 역할 사유가 이긴다. — **자동**: `planSeatNotice` 단위 테스트 + 렌더 테스트
- [ ] OWNER가 한 명일 때 그 행의 셀렉트·[Remove]가 꺼지고, **행 아래 전폭 띠**가 사유를 든다. — **자동**: `planMemberChange` 재사용 + 렌더 테스트
- [ ] 못 읽은 행이 목록에 **남고** 행 아래 띠가 사유를 든다. 역할·가입일은 정상으로 보인다. — **자동**: 렌더 테스트
- [ ] 대기 초대 0건이 **`/projects`의 `EmptyCard`와 같은 형**(칩 36 · padding `48 24`)이고 **버튼이 없다**. — **자동**: 렌더 테스트
- [ ] 보관된 프로젝트는 `<ProjectArchived>` 그대로다(회귀 확인). — **자동**: `app/(edit)/__tests__/archive.test.ts` 무변경 green

### 초대 모달

- [ ] `OnboardingModal`(1024) 한 창에서 **폼 → 링크**로 제목·설명·바닥이 통째로 바뀐다. — **수동**: 두 얼굴이 같은 높이를 쓰는 것은 껍데기(`min-h-[min(80svh,800px,calc(100svh-96px))]`)가 보장하므로 눈으로 한 번 본다
- [ ] 폼이 Role 카드 둘(Editor 기본 / Owner)을 들고, 고른 값이 `createInvitation({ role })`로 간다. — **자동**: 렌더 테스트 + `app/(edit)/__tests__/membership.test.ts`의 역할 인자 경로 (⚠️ `lib/auth/__tests__/invitation.test.ts`에는 `createInvitation` 테스트가 **없다**)
- [ ] 발급된 링크가 **sans 14**다(`text-mono` 제거). — **자동**: 소스 스캔
- [ ] 사후 거부 넷(`member-limit`·`already-member`·`unauthorized`·`unavailable`)이 **폼 얼굴 본문 맨 아래 `Alert`**으로 서고 입력값이 남는다. 포커스는 누른 제출 버튼으로 돌아간다. — **자동**: 렌더 테스트
- [ ] 모달을 닫으면 링크가 사라진다(현 동작 유지). — **자동**: `members-screen.test.ts` 기존 검사 green

### 서버 판정 (전부 그대로 남는다)

- [ ] 사전 차단 셋(좌석 · 마지막 오너 · 이미 멤버)의 **서버 거부가 살아 있고 문구가 화면의 사전 문구와 같다**. — **자동**: `app/(edit)/__tests__/membership.test.ts` 무변경 green + **렌더 단언**으로 문구 동일성(§5)
- [ ] 페이지 게이트가 `translation:write`, Action 게이트가 `member:manage` 그대로다. — **자동**: `app/(edit)/__tests__/authorization.test.ts` 무변경 green
- [ ] 제거·철회 뒤 포커스가 `headingId`로, 거부되면 누른 버튼으로 돌아간다(malmoi#51 · #53). — **자동**: `components/__tests__/members-focus.test.tsx` 갱신 후 green

### 게이트

- [ ] `pnpm typecheck && pnpm test && pnpm build` green
- [ ] `/design-sync`가 핸드오프와 불일치 0 (`/projects`도 한 번 — §4의 카드 추출 때문)

## 4. 제거 명세 (무엇이 사라지는가)

`members.prompt.md` §하지 말 것 1이 요구한 목록.

| 사라지는 것 | 어디 | 대체 |
|---|---|---|
| `<Table>`·`<thead>`·`<Th>`·`<Td>` 전부 | `member-list.tsx` | 카드 + `<ul>`/`<li>` flex 행 (Projects `RowList`와 **같은 프리미티브**) |
| 열 `person · email · role · joined · actions` 구조 | 같음 | 아바타 + 2줄 텍스트 + 오른쪽 군. `m.members.columns.*`의 소비자가 사라진다 — **T9가 손으로 지운다**(unused-key 게이트가 없다) |
| `<Table>`·열 넷 + `actions` sr-only `<Th>` | `pending-invitations.tsx` | 같은 카드/행 구조 |
| `manage ? <Select> : m.projects.role[…]`의 **맨 글자 갈래** | `member-list.tsx` | 점선 자물쇠 칩 (읽기전용 형이 한 종류) |
| `m.projects.role[invitation.role]` 맨 글자 | `pending-invitations.tsx` | 같은 칩 |
| `DialogContent` 사용 (초대) | `invite-dialog.tsx` | `OnboardingModal` 1024. ⚠️ **제거 확인 Dialog(440)는 `member-list.tsx`에 그대로 남는다** |
| `role: "EDITOR"` 하드코딩 | `invite-dialog.tsx` | 폼이 고른 값 |
| `<code className="text-mono">` | `invite-dialog.tsx` | sans 14 (`text-sm`) — DESIGN §4.1 기준 문장을 함께 고친다 (§7 아래) |
| `canPerform(role, "member:manage") && <InviteDialog/>` 의 **조건부 렌더** | `page.tsx` | 항상 렌더하고 컴포넌트가 끈다. ⚠️ **차단이 아니라 노출 판정이었다** — 서버 거부는 `createInvitation`에 그대로 있다 |
| `<PanelBody className="space-y-6">` + 수동 `<section><h2 id="pending-heading">` 래퍼 | `page.tsx` | 카드 갭 16(`space-y-4`), 제목은 카드 헤더가 든다. ⚠️ **이것이 `pending-heading`을 옮기게 만든다 — design §3 참조** |

**남는 것 (바꾸지 않는다):** `requireProjectAccess` 최상단 호출 · `translation:write` 게이트 · **`project === null`이면 `redirect(routes.projects() + "?e=not-found")`** · 서버가 만든 `now` · `maskedEmailLabels` · 정렬 둘(멤버 `createdAt asc` · 초대 이메일 오름차순, 못 읽은 행 맨 뒤) · 이 화면의 `?e=` 부재 · `role="status"` live 영역 둘(**노드 identity 유지** — `members-focus.test.tsx`가 마운트 시점부터 같은 노드를 요구한다) · `<ProjectArchived>` 갈래(**`getPrisma()`보다 앞** — `app/__tests__/screens.test.ts:224`).

## 5. API 변경

**신규 쿼리 0건. 신규 Route Handler 0건. 신규 Server Action 0건. 스키마 변경 0건.**
**서버 함수 변경은 셋이다** — 아래.

핸드오프 §서버 변경 1이 "좌석 수를 페이지가 읽는다"를 **신규 데이터**로 분류했지만, 리포 대조 결과 **조회는 이미 있다**:

- `loadMembers`가 **그 프로젝트의 전 멤버 행**을 돌려준다 → `members.length`가 곧 `memberCount`이고, **못 읽은 행도 센다**(핸드오프가 "세는 것이 맞다"고 한 쪽이다).
- `MEMBER_LIMIT`은 `lib/auth/invitation.ts`가 **이미 export**한다.

→ **`_count: { select: { members: true } }`를 더하지 않는다.** 더하면 같은 수를 두 곳에서 세게 되고, 그 둘이 갈리는 날(예: 못 읽은 행 처리 변경) 화면과 서버 거부가 어긋난다. 서버도 잠금 안에서 `tx.projectMember.count`로 다시 센다.

### 서버 변경 셋

| 무엇 | 왜 | 범위 |
|---|---|---|
| `InvitationCreate`의 `ok` 갈래에도 `limit`을 싣는다 | ⚠️ **이전 판본이 "`limit`을 값으로 돌려주는 형이 이미 갖춰져 있다"고 단정했는데 거짓이다.** 실제 타입은 `{ status: "ok" } \| { status: "member-limit"; limit: number }`(`lib/auth/invitation.ts:74`)로 **거부 갈래에만** 있어 `4 of 10 seats`를 못 만든다. 그 함수의 `@returns` 주석이 이미 *"limit을 값으로 돌려준다 — 문구가 상수를 따로 들면 둘이 갈린다"*라 쓰고 있어 **현재 코드가 자기 주석을 `ok` 갈래에서 어기고 있다** | 3줄. 프로덕션 호출부는 `app/(edit)/projects/actions.ts:180` 하나이고 `.status`만 읽어 **무변경**. 깨지는 것은 `lib/auth/__tests__/invitation.test.ts:139`·`:155`의 `toEqual({status:"ok"})` **둘 — 의도된 red**다 |
| 두 로더의 반환 타입에 `readable: boolean` | `m.common.unreadable` 문자열 비교를 센티널로 쓰지 않는다 (design §1) | `lib/auth/query.ts`. **`email`은 여전히 안 싣는다** |
| `createInvitation` 성공 응답에 `label` | 링크 얼굴 제목(`Link ready for {label}`)의 마스킹을 **서버에 남긴다** — §7 아래 | 1줄: `label: maskedEmailLabels([email])[0]` |

⚠️ **사전 차단은 편의이고 차단이 아니다.** 다른 탭이 좌석을 채우거나 오너를 바꿀 수 있으므로 서버 거부 셋이 전부 남는다. 그래서 **화면과 서버가 같은 판정 함수를 부른다**:

| 사전 차단 | 화면이 부르는 것 | 서버가 부르는 것 | 같은 함수인가 |
|---|---|---|---|
| 좌석 초과 | `planSeatNotice({ role, memberCount })` → 내부에서 `planInvitationCreate` | `planInvitationCreate({ memberCount })` (잠금 안 집계) | **예** (한 겹 감쌌다) |
| 마지막 오너 | `planMemberChange({ members, targetUserId, nextRole: null })` | 같은 함수 | **예** |
| 이미 멤버 | — (화면이 모른다: 초대 주소는 입력값이다) | `findUserByEmail` + `projectMember.findUnique` | 사후 전용 |

⚠️ **클라이언트는 `lib/auth/invitation.ts`를 import할 수 없다** — 그 모듈이 `node:crypto`를 문다(`./email`도 문다). **좌석 판정은 서버 `page.tsx`가 하고 결과 값만 prop으로 내린다.** `components/__tests__/client-graph.test.ts`의 `CLIENT_LIB_FILES`가 45개 `toEqual` 정확 일치라 어기면 즉시 red다.

## 6. 상태 표 (역할 × 프로젝트 상태 × 데이터 상태)

`members.prompt.md` §하지 말 것 3이 요구한 표. **렌더 테스트가 세는 것은 앞의 여덟 행**이고 archived 둘·not-found 하나는 `archive.test.ts`·`requireProjectAccess`가 답한다.

| # | 프로젝트 | 역할 | 데이터 | 패널 헤더 우측 | Members 카드 | Pending 카드 |
|---|---|---|---|---|---|---|
| 1 | ok | OWNER | 정상 | `4 of 10 seats` + [Invite] | 셀렉트 + [Remove] (`danger` variant) | 자물쇠 칩 + [Revoke] |
| 2 | ok | OWNER | **오너 1명** | 같음 | 그 행만 셀렉트·[Remove] 꺼짐 + **행 아래 띠** | 변화 없음 |
| 3 | ok | OWNER | **좌석 10/10** | `10 of 10 seats — remove someone to invite` + **꺼진 [Invite]** | 변화 없음 | 변화 없음 |
| 4 | ok | OWNER | 대기 초대 0 | 변화 없음 | 변화 없음 | `EmptyCard` 형 (**버튼 없음**) |
| 5 | ok | OWNER | **복호화 실패 행** | 좌석 수에 **포함** | 그 행이 `m.members.unreadableLabel` + **행 아래 띠**. 역할·가입일 정상 | 같은 형 |
| 6 | ok | OWNER | **복호화 실패 + 그 행이 유일 오너** | 변화 없음 | **띠 하나에 문장 둘**(못 읽음 → 마지막 오너 순). `aria-describedby`는 그 띠 하나를 가리킨다 | — |
| 7 | ok | EDITOR | 정상 | `Only owners can invite or change roles` + **꺼진 [Invite]** | 자물쇠 칩. [Remove] **없음** | 자물쇠 칩. [Revoke] **없음** |
| 8 | ok | EDITOR | 좌석 10/10 | **역할 사유가 이긴다** (`Only owners…`) — `planSeatNotice`가 그 우선순위를 단언으로 든다 | 같음 | 같음 |
| 9 | ok | EDITOR | 오너 1명 | 같음 | **띠를 그리지 않는다** — EDITOR에게는 할 수 있는 행동이 없어 사유가 할 일을 못 든다 | 같음 |
| 10 | **archived** | OWNER·EDITOR | 무관 | — | `<ProjectArchived slug role>` (`PanelHeader` 없음 · 본문 수직 중앙) | — |
| 11 | not-found / forbidden | — | — | `requireProjectAccess`가 `/projects?e=`로 내보낸다 (변화 없음) | | |

**도달 불가로 확정한 갈래 둘** — 렌더 테스트가 짜지 않는 근거다:
- **멤버 0명 / OWNER 0명.** 생성자가 OWNER로 들어가고(ARCHITECTURE §6.02 *"항상 OWNER 한 명 이상"*), `changeMember`가 재집계 후 롤백한다.

**표 밖 갈래 둘:**
- **자기 자신 행** — `m.members.you`가 이름 옆에 선다. `planMemberIdentity`의 갈래 넷과 **직교**이므로 그 함수가 아니라 행 껍데기가 든다.
- **대기 초대와 멤버가 같은 사람** — 발급 뒤 다른 경로로 멤버가 되면 두 카드에 같은 사람이 선다. 막지 않는다(수락하면 사라진다). ⚠️ **malmoi#18의 축**이라 Pending 행의 식별은 `maskedEmailLabels`를 그대로 지난다.

**사후 거부(서버가 돌려준 것)는 이 표 밖이다** — 행 조작은 누른 행 **아래**(띠와 같은 자리) `Alert`, 초대 모달은 **폼 얼굴 본문 맨 아래** `Alert`. 둘 다 포커스가 누른 컨트롤로 돌아간다.

## 7. 신규 문구

전부 `messages/en.tsx`의 `m.members.*` 아래. 배치는 design.md §5.

| 자리 | 키 | 문구 |
|---|---|---|
| 헤더 좌석 | `m.members.seats(n, limit)` | `{n} of {limit} seats` |
| 헤더 좌석 · 초과 | `m.members.seatsFull(limit)` | `{limit} of {limit} seats — remove someone to invite` |
| EDITOR 헤더 | `m.members.ownerOnly` | `Only owners can invite or change roles` |
| Members 카드 헤더 | `m.members.cardHint` | `Owners can manage members and project settings` |
| Members 카드 배지 sr-only | `m.members.count(n)` | 예: `{n} members` — ⚠️ **필수다.** `ProjectCard`의 배지가 `<span aria-hidden>{count}</span>` + sr-only 문장 형이고 그 문장이 `m.projects.count` **하드코딩**이라, 안 넘기면 멤버 카드가 "3 projects"를 낭독한다 |
| Pending 카드 헤더 | `m.members.pending.cardHint` | `A link expires after 7 days whether it is used or not` |
| Pending 카드 배지 sr-only | `m.members.pending.count(n)` | 같은 이유 |
| 마지막 오너 띠 | **기존 `m.errors.access["last-owner"]`** — **값을 시안 문장으로 바꾼다** | `A project needs one owner. Make someone else an owner first, then change this.` (아래 ⚠️) |
| 못 읽은 행 주 텍스트 | `m.members.unreadableLabel` **(신규)** | `Couldn't be read` |
| 못 읽은 행 띠 | `m.members.unreadableHint` | `This person's name and address couldn't be decrypted. Role and join date are unaffected.` |
| 읽기전용 칩 접근 이름 | `m.members.roleLocked(who)` | (sr-only) `Role for {who} — only owners can change this` |
| 초대 · 설명 | `m.members.invite.description` | `malmoi doesn't send email. You'll get a link to pass on yourself.` |
| 초대 · Email help | `m.members.invite.help` **(기존 값 교체)** | `The link only works for this address, signed in with it.` |
| 초대 · 역할 그룹 | `m.members.invite.roleLabel` | `Role` |
| 초대 · 역할 설명 | `m.members.invite.roleHint.EDITOR` / `.OWNER` | `Can translate and publish` / `Also manages members and settings` |
| 초대 · 바닥 | `m.members.invite.seatsUsed(n, limit)` | `{n} of {limit} seats used` |
| 초대 · 제출 | `m.members.invite.create` **(기존 값 교체)** | `Create invite link` (현재 `Create link`) |
| 링크 · 제목 | `m.members.invite.ready(label)` | `Link ready for {label}` |
| 링크 · 설명 | `m.members.invite.readyHint` **(기존 `linkHint` 교체)** | `Send it to them yourself. You won't be able to see this link again after closing.` |
| 링크 · 바닥 | `m.members.invite.expiresIn(role)` | `Expires in 7 days · {role}` |
| 링크 · 안내 제목 | `m.members.invite.notKept.title` | `malmoi doesn't keep the link` |
| 링크 · 안내 본문 | `m.members.invite.notKept.body` | `The invitation stays in Pending invitations, but the address above is gone once this closes. If it's lost, revoke the invitation and make a new one.` |
| 링크 · 완료 | `m.members.invite.done` | `Done` |

**재사용 (그대로 쓴다):** `m.members.{unnamed, you, changeRole, remove, removeLabel, removed, confirmRemove, confirmRemoveHint, cancel, changeFailed}` · `m.members.invite.{open, alreadyMember, failed}` · `m.members.pending.{title, revoke, revokeLabel, revoked, revokeFailed, unknownInviter, empty.*}` · `m.common.{copy, copied, copyFailed, close}` · `m.projects.role.{OWNER, EDITOR}` · `m.errors.access.*`.

⚠️ **`m.members.invite.open`("Invite member")이 새 패널 헤더 [Invite]의 라벨이다** — 이전 판본이 재사용 목록에서 빠뜨렸다.

**소비자가 사라져 T9가 지우는 키:** `m.members.columns.*` · `m.members.pending.columns.*` 아홉. ⚠️ **unused-key 게이트가 리포에 없으므로 손으로 지운다.**

⚠️ **`m.members.invite.title`을 `Invite a member`로 바꾼다** — 시안 문구이고, 역할 선택이 붙는 순간 `translator`가 거짓이 된다.

⚠️ **`m.common.unreadable`("Unavailable")은 안 건드린다.** 소비처가 셋(`lib/auth/query.ts:96`·`:160` + **`lib/sync/query.ts:91`**)이고 그 사전의 주석이 *"표 셀에 들어가므로 한 단어이고"*로 길이를 제약하는데 **sync 화면은 여전히 표다.** 멤버 화면만 `m.members.unreadableLabel`로 갈아탄다.

⚠️ **`m.errors.access["last-owner"]`의 값을 시안 문장으로 바꾼다.** 소비자는 16곳이지만 **`"last-owner"`를 생산하는 자리는 멤버 경로뿐**(`planMemberChange` + `actions.ts:335`의 `LastOwnerRollback`)이라 나머지 15곳에는 도달 불가다. `messages/en.tsx:1779`가 *"여기 두 벌로 쓰지 않는다"*로 "멤버 사전에 두 번째 문장을 둔다"를 이미 금지한다.

⚠️ **제품 이름은 화면에서도 소문자 `malmoi`다**(`brand-spelling.test.ts`) — 신규 문구 둘(`malmoi doesn't send email…` · `malmoi doesn't keep the link`)이 그 검사 대상이다.

⚠️ **발급 링크를 sans 14로 내린다 → `docs/DESIGN.md` §4.1의 기준 문장을 같은 배송에서 고친다.** 지금 §4.1이 남은 mono 자리로 "초대 링크 URL"을 명시하고 근거가 `l`/`1`/`I` 혼동인데, 그 값에는 [Copy]가 붙어 있다. 새 기준: **"복사 버튼이 붙은 값은 mono가 아니다."**

## 8. 비목표

- **보관된 프로젝트의 멤버 표** — 접었다. `<ProjectArchived>`를 화면 다섯이 공유하고 멤버만 예외를 두면 사본이 여섯 번째가 된다(핸드오프 역방향 표).
- **이메일 발송** — PRODUCT §4.3 ①. 링크를 사람이 전달한다.
- **역할 추가** — `OWNER`/`EDITOR` 둘 그대로. `prisma/__tests__/schema-contract.test.ts`가 enum을 고정한다.
- **대기 초대를 좌석에 세기** — 서버가 안 센다(만료된 초대 때문에 못 부르는 상태를 피한 결정). 화면도 안 센다. 그 사실을 **말할지**는 §10-3.
- **아바타 사진** — `MemberView`에 `image`가 없고(`User.image`는 스키마에 있다) 더하면 §5의 "신규 쿼리 0건"이 흔들린다. **이니셜 + `lib/tone.ts`의 8색**으로 간다 (§10 결론 참조).
- **`?e=` 슬롯 복구** — 이 화면에 생산자가 없다. `members-screen.test.ts`가 그 상태를 고정한다.
- **대기 초대 정렬 변경** — 이메일 오름차순 유지. 바꾸려면 복호화 뒤 메모리 정렬을 한 번 더 한다 — §10-2.
- **[Done]을 복사 전 비활성** — §10-1.

### 범위에 든다 (비목표가 아니다)

⚠️ **이 기능이 `/projects`를 함께 움직인다.** 행 목록 카드 프리미티브를 추출하므로 프로덕션 목록 화면이 회귀 면적에 들어온다 — `/design-sync`를 두 화면에 돌리는 것이 그 대가다 (design §2·T3).

## 9. 범위 게이트

`docs/PRODUCT.md` §4.2 대조 결과 **걸리는 항목 없다**.

- "세밀한 RBAC" — 역할을 늘리지 않는다. 초대 시점에 **이미 있는 두 역할** 중 하나를 고를 뿐이고, `createInvitation`이 `role: Role`을 이미 받는다(`app/(edit)/projects/actions.ts:121`).
- "과금·플랜" — 좌석 수는 고정 상수 `MEMBER_LIMIT = 10`의 **표시**이고 플랜으로 갈리지 않는다. §4.2가 그 상한을 "자율 가입의 대가"로 이미 명시한다.
- "범용 알림 시스템" — 초대는 여전히 링크 수동 전달이다.

`docs/ARCHITECTURE.md` §0 불변식 대조: **머지·충돌 해소·양방향 동기화 없음.** 번역 값·소스 키 축을 건드리지 않는다.

→ ⚠️ **PRODUCT.md 갱신이 필요하다** (이전 판본의 "불필요"는 거짓이었다). 두 줄:
- `:84` — *"멤버 표에 **`Email` 열**이 있지만 그 값이 마스킹된 것이다"* — 그 열이 사라진다.
- `:81` — *"OWNER는 **승격으로** 늘릴 수 있고"* — 초대 시점 역할 선택이 붙으면 경로를 다 세지 못한다.

ARCHITECTURE·DESIGN 갱신도 필요하다 (design.md §10).

## 10. 열린 결정

`/feature-review`(2026-09-19, CPO·CDO·CTO·QA 4인)에서 **아홉이 닫혔다.** 닫힌 것은 각 절의 본문 결론으로 올렸고, 여기 남은 셋은 전부 **"지금은 안 한다"**로 닫아 두되 되살릴 근거만 적는다.

1. **[Done]이 닫기와 같은 말이다.** 복사하지 않은 사람도 그냥 누른다. → **안 막는다.** 잃어도 revoke 후 재발급 경로가 있다.
2. **대기 초대 정렬이 이메일 오름차순이다.** 마스킹 라벨로 보는 화면에서 그 순서는 무작위로 읽힌다. → **안 바꾼다.** 만료 순으로 가려면 복호화 뒤 메모리에서 한 번 더 정렬해야 하고, 그 정렬 3단(실패 뒤로 → 이메일 → id)이 malmoi#18의 안정성을 들고 있다.
3. **좌석 수에 대기 초대를 셀 것인가.** 서버는 안 센다. 9/10에서 초대 셋을 뿌리면 상한을 넘겨 수락된다. → **화면도 말하지 않는다.** 말하려면 §6에 행이 하나 더 필요하고, 실제로 밟을 사람이 혼자 쓰는 상태에서는 없다.

**참고 — 보류로 남긴 것 하나 (이 기능 밖):** 보관된 프로젝트에서 "누가 멤버였나"를 볼 길이 없다. 되살리는 판단에 필요하면 설정 화면의 보관 카드가 **멤버 수만** 드는 것이 가장 작은 보완이다.

### 이 검수에서 닫힌 아홉 (근거는 각 절 본문)

| 무엇 | 결론 | 어디 |
|---|---|---|
| 열 머리 유무 | **없다** — 카드 헤더가 제목·배지·설명을 들고 행은 `<ul>/<li>`다. `m.members.columns.*` 아홉을 T9가 지운다 | §4 · design §3 |
| EDITOR × 좌석 초과 우선순위 | **역할 사유가 이긴다.** `planSeatNotice`의 단언이 그것을 고정한다 | §6-8 · design §1 |
| 읽기전용 칩 접근 이름 | `m.members.roleLocked(who)` | §7 |
| `last-owner` 문구 통일 | **시안 문장으로 사전을 바꾼다** — 생산 경로가 멤버뿐이라 안 번진다 | §7 |
| 아바타 28과 그 색 | **이니셜 · `size={24}` · `lib/tone.ts` 8색.** 시안 4색은 `DESIGN.md:898`이 `#4f46e5`를 이름으로 들어 이미 기각했고, `#0891b2`는 `attention-card.tsx:27`에 *"§6.2 미등재 raw 색"* 주석으로 적발돼 있다 | §8 · design §1 |
| 카드를 프리미티브로 뽑는가 | **뽑는다** — `RowCard`/`RowCardList`/`RowCardItem` 3조각 + `BannerLine` | design §2 |
| `disabled` vs `aria-disabled` | **`aria-disabled`.** `Button`이 `{...props}`를 스프레드하고 cva가 variant 다섯에 `aria-disabled:` 짝을 이미 든다 — `button.tsx` 변경 불필요. ⚠️ **`loading`과 겸용 불가** | design §4 |
| DESIGN §4.1 mono 범위 | **고친다** — 발급 링크를 sans로 내리고 기준 문장을 "복사 버튼이 붙은 값은 mono가 아니다"로 | §7 · design §10 |
| 사후 거부가 모달 어디에 서나 | **폼 얼굴 본문 맨 아래 `Alert`** — 세 번째 얼굴을 만들지 않고 입력값을 지킨다 | §3 · §6 |
