# account-linking — 태스크

순수 함수 → 껍데기 → 화면 순서. 각 **커밋 경계**는 `pnpm typecheck && pnpm test` green이어야 한다.

⚠️ **T3·T6은 `pnpm test:credentials:postgres`를 반드시 돌린다.** 그 스위트는 `pnpm test`의
include 밖이고 **앱 전역 값 여섯을 단언한다** — 이 배송이 그중 `/account` 쿼리를 늘린다.
디렉터리 기반 트리거(`lib/credentials/**`)는 이 배송을 밟지 않으므로 **여기 명시로 적는다**
(POSTMORTEM 2026-09-10).

⚠️ **UI 태스크(T2·T3·T4·T5)는 착수 전에 시각 초안을 읽는다.** 위치·읽는 법·아트보드 매핑·
"옮겨 붙이지 않는다"의 목록이 전부 **design.md §9**에 있다. 요약:

```
/design-login                                   ← 안 하면 authorization 에러
DesignSync get_file  projectId=b99d54cd-3034-44f1-8446-0a864da9d767
  path=design_handoff_signin_invite_link_account/README.md        ← 먼저
  path="design_handoff_signin_invite_link_account/Signin Invite LinkAccount.dc.html"  ← 공백 있음, 54KB라 파일로 저장된다
```

| 아트보드 | 화면 | 태스크 |
|---|---|---|
| `#1a` | `/signin` | — (변경 없음, 재현 확인용) |
| `#1b` | `/invite/[token]` | **T4** |
| `#1c` | `/signin/link/[challenge]` | **T2**(골격) → **T4**(카드) |
| `#1c` 아래 상태 둘 | 확인 대기 · 확인 실패 | **T3** |
| 마지막 절 | `EntityCard` 규격 | **T4** |

값의 정본은 `app/globals.css`이고 초안의 raw hex·CDN·`support.js`·`assets/`는 쓰지 않는다.

---

## T1 — 순수 판정 (`/tdd` 진입점) · 커밋 1

- [ ] `lib/account-link/policy.ts` — `Challenge` 조립·파싱 · 쿠키 이름 둘 · `checkChallenge` ·
      `outcomeUrl` · `CHALLENGE_TTL_MINUTES`(10)
- [ ] `lib/account-link/detect.ts` — `planLinkOffer` 3갈래
- [ ] `lib/account-link/plan.ts` — `planLinkConfirm` 5갈래
- [ ] `lib/account-link/methods.ts` — `loginMethodRows` · `canUnlink`
- [ ] `lib/account-link/message.ts` — 결과 → 문구 (`messages/en.tsx`의 `errors.link` 신설)
- [ ] `lib/session-revocation/policy.ts` — `pickLoginAccount` 추가

**검증**
- `pnpm test` green — 갈래마다 케이스
- `planLinkConfirm`: **`expired`가 `wrong-account`보다 앞**인 것을 단언한다
  (만료된 challenge가 누구 것이었는지 말하지 않는다 — `verifyState`와 같은 축)
- `canUnlink`: 수단 하나일 때 `false`
- `pickLoginAccount`: 수단 하나일 때 현재 동작과 같고, 둘일 때 결정적
- **모듈 import 0을 센다** — 넷이 잎이다(화면 조각이 클라이언트라 그래프가 곧 번들)

---

## T2 — 거부를 안내로 · 커밋 2

- [ ] `lib/routes.ts` — `signInLink(challenge)` 추가. ⚠️ 경로 생성기다(쿼리 없음)
- [ ] `lib/account-link/store.ts` — `beginLink` (해시는 `hashInviteToken` **그 함수**)
- [ ] `lib/account-link/view.ts` — `loadChallengeView` (마스킹 이메일·provider·가입 월 **셋만**)
- [ ] `auth.ts` `signIn` 콜백 — `planLinkOffer`가 `offer`면 challenge를 굽고 문자열 반환
- [ ] `app/signin/link/[challenge]/page.tsx` — `AuthLayout` · 320 컬럼 (카드는 T4에서 오므로
      이 단계에선 평문 두 줄로 둔다). **아트보드 `#1c`**
- [ ] `app/__tests__/entry-points.test.ts` — `EXEMPT`에 추가

**검증**
- `pnpm test` green
- `entry-points.test.ts`: 이 라우트가 EXEMPT에 있고 **matcher에는 없다**(부정 단언)
- 서버 반환 타입에 원문 `email`이 **없다**(`members-screen.test.ts`와 같은 형의 소스 스캔)
- 만료된 challenge → `/signin` (이 화면을 다시 그리지 않는다)
- ⚠️ 로그인 버튼이 `clearRevocationCookies()`를 먼저 부른다 — 일반 로그인 목록이 **셋**이 된다
- 실물: 같은 주소의 Google 로그인 → 이 화면 착지 · `User`·`Account` 행 증가 **0**

---

## T3 — 확인 왕복 · 커밋 3 ⚠️ 가장 위험한 배송

**아트보드**: `#1c` 아래 "병합의 나머지 상태 둘" — 확인 대기(스피너만, 라벨 유지) · 확인 실패(`Alert` 한 장만 추가, 레이아웃 불변).

- [ ] **먼저 §14-3을 밟는다** — 확인 왕복에서 `linkAccount`가 불리는지. 불리면 설계 전제가
      깨지므로 여기서 멈추고 재설계한다
- [ ] `lib/account-link/store.ts` — `finishLink` (User 행 `FOR UPDATE` · 조건부 삭제 count로
      단일 사용 · `Account` 생성이 같은 트랜잭션)
- [ ] `lib/account-link/http.ts` — `withAccountLink`·`authorizeAccountLink`·`withLinkStart`
- [ ] `auth.ts` — `handlers`를 `withAccountLink`로도 감싸고 `cookies`가 두 스코프를 본다.
      `signIn` 콜백의 확인 갈래: 일치 → `true`, 불일치 → **문자열**(세션 안 만듦)
- [ ] `lib/session-revocation/*` — 회수 시작이 병합 쿠키를 지운다 (배타성, 양방향)
- [ ] challenge의 `redirectTo` 복원 → 초대에서 왔으면 `/invite/[token]`

**검증**
- `pnpm test` green + **`pnpm test:credentials:postgres` green**
- 회귀 ①: `safePrismaAdapter.linkAccount`의 기존 거부가 **한 줄도 안 바뀌었다**(기존 테스트 그대로 green)
- 회귀 ②: 목적 쿠키·DB 행을 지우고 유효 state/PKCE로 callback → `User`·`Account`·`Session` 증가 0
- 회귀 ③: state 쿠키를 일반 이름으로 바꿔도 로그인 쓰기 전에 실패
- 회귀 ④: 회수 쿠키와 병합 쿠키가 동시에 있어도 한쪽만 동작
- **`wrong-account`: 다른 GitHub으로 확인 → `Account` 증가 0 + `Session` 증가 0** (완료 조건 4)
- 단일 사용: 같은 challenge 두 번 → 둘째는 `invalid`
- 실물: §14-1·§14-2

---

## T4 — `EntityCard` + 초대 개편 · 커밋 4

**아트보드**: `#1b`(초대) · `#1c`(카드 삽입) · 마지막 절(`EntityCard` 규격 표).

- [ ] `components/ui/entity-card.tsx` — 프리미티브 **16 → 17**
- [ ] `components/ui/avatar.tsx` — `size` union에 `40` 추가
- [ ] `messages/en.tsx` — `invite.invitedTo` → `invite.title` + `invite.target`
      (⚠️ **관사 금지 주석이 `target`으로 따라간다**)
- [ ] `app/invite/[token]/page.tsx` — 로그인 상태 다섯 줄 · 비로그인은 카드 없음
- [ ] `app/signin/link/[challenge]/page.tsx` — `EntityCard kind="user"` 삽입
- [ ] `components/onboarding/new-project-flow.tsx` — ③의 손으로 짠 행을 `EntityCard size={40}`로
      ⚠️ **git status에 이 파일이 이미 수정돼 있다**(page-patterns 작업) — 충돌 확인

**검증**
- `pnpm test` green
- `focus-ring.test.ts` green — 새 프리미티브의 포커스 링을 **여는 태그에 리터럴로**
- 프리미티브 수를 세는 자리(CLAUDE.md·DESIGN)와 실제 파일 수가 **17로 일치**
- `client-graph.test.ts` green — `EntityCard`가 `LocaleFlag`를 쓰므로 `lib/keys/flag.ts`(잎)까지만
- 초대 화면 렌더 테스트: 비로그인에 **카드가 없다** · 로그인에 `h1`이 있다
- ⚠️ 실패 여섯의 표면이 **그대로**인지(Layer A 인라인 / Layer B 토스트)

---

## T5 — `/account` 로그인 수단 카드 · 커밋 5

- [ ] `lib/routes.ts` — `account({ link })` 추가. ⚠️ **`withQuery`를 지난다**
- [ ] `components/account/login-methods.tsx` — 행 둘 · [Connect]/[Disconnect] · 마지막은 **비활성**
- [ ] `app/(edit)/account/page.tsx` — 프로필 아래, GitHub App 연결 **위**
- [ ] `app/(edit)/account/actions.ts` — `startLoginLink` · `unlinkLoginMethod`
      (⚠️ `where`에 `userId`를 함께 건다)
- [ ] `?link=` 결과를 **읽는 자리**를 같은 커밋에

**검증**
- `pnpm test` green
- `entry-points.test.ts`: `?link=`의 생산자·수신자가 짝이다 · 두 Action이 `USER_SCOPED_ACTIONS`에
- 마지막 수단 해제: 순수 함수와 Action **양쪽**에서 거부
- ⚠️ **GitHub App 연결 카드와 구별되는지 눈으로** — 같은 화면에 "GitHub"이 두 번 나온다.
  로그인 수단과 리포 쓰기 권한은 다른 축이고 그 구별이 화면에서 보여야 한다

---

## T6 — 세션 회수 복구 · 커밋 6

- [ ] `beginRevocation` · `startSessionRevocation` — `accounts.length !== 1` → `pickLoginAccount`

**검증**
- `pnpm test` green + **`pnpm test:credentials:postgres` green**
- 수단이 **둘인** 계정에서 회수 성공 (지금은 불가능하다)
- 수단이 하나일 때 동작 불변 · `finishRevocation`의 `wrong-account` 갈래 유지

---

## T7 — 실물 왕복 검증 (dev)

⚠️ **preview가 아니라 dev(로컬)** — preview는 Vercel SSO 뒤라 OAuth 자동화가 `sso-api` 302를 받는다.

- [ ] 시나리오 1: GitHub 가입 → Google 시도 → 병합 화면 → 확인 → `/projects`
- [ ] 시나리오 2: **초대 링크 → Google 로그인 → 병합 → `/invite/[token]` 복귀 → 수락** ★ 핵심
- [ ] 시나리오 3: 역방향 (Google 가입 → GitHub 시도)
- [ ] 시나리오 4: 다른 GitHub으로 확인 → Alert + 행 증가 0 + **세션 없음**
- [ ] 시나리오 5: challenge 만료 10분 뒤 → `/signin`
- [ ] 시나리오 6: 수단 둘인 계정에서 전체 세션 회수
- [ ] 시나리오 7: 마지막 수단 해제 시도 → 비활성
- [ ] 시나리오 8: 확인 도중 provider 화면에서 취소 → 갇히지 않는다
- [ ] 시나리오 9: 1440×900 · 1280px에서 세 화면 목측 (Canvas 대조)

**검증**: 각 시나리오의 결과와 **DB 행 증감**을 기록한다. ⚠️ 이 기록은 `tasks.md`가 닫혀도
남긴다 — `github-connect` T5·`project-onboarding` T8과 같은 부류다.

---

## T8 — 문서 · 커밋 7 (문서별 분리)

- [ ] `docs/SAAS.md` §5.5 — 비범위 선언을 이 설계로 대체. **"자동으로 하지 않는다"는 그대로
      참이다** — 바뀌는 것은 "명시적 병합도 안 한다"뿐이다. prefix `docs(SAAS): ...`
- [ ] `docs/ARCHITECTURE.md` §6 — `signIn` 콜백의 갈래 둘과 challenge의 수명.
      ⚠️ **`linkAccount` 게이트는 안 바뀌었다고 명시**한다(다음 사람이 열지 않게)
- [ ] `docs/DESIGN.md` — `EntityCard` 규격 · 프리미티브 17 · 셸 밖 화면이 **셋**
- [ ] `CLAUDE.md` — 디렉터리 구조(`lib/account-link/`·`app/signin/link/`·`components/account/`) ·
      프리미티브 수 · 코어 모듈 목록(`.claude/commands/push.md` 4단계 트리거와 **같아야 한다**)
- [ ] `docs/features/README.md` — 표에 한 줄
- [ ] `docs/POSTMORTEM.md` — T3에서 무언가 잡혔으면 `/postmortem`

**검증**: `/doc-check`이 green.

---

## 배포

- 마이그레이션 **없음** → `/db` 불필요
- 새 환경변수 **없음** → `.env.example` 변경 없음
- `/push`(dev·preview) → 실물 재확인 → `/merge`(프로덕션)
