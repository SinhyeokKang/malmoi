# account-linking — 태스크

순수 함수 → 껍데기 → 화면 순서. 각 **커밋 경계**는 `pnpm typecheck && pnpm test` green이어야 한다.

⚠️ **T3·T5·T6은 `pnpm test:credentials:postgres`를 반드시 돌린다.** 그 스위트는 `pnpm test`의
include 밖이라 `/push` 게이트도 PR CI도 **원리적으로 못 본다**. 디렉터리 기반 트리거
(`lib/credentials/**`)는 이 배송을 안 밟으므로 **여기 명시로 적는다** (POSTMORTEM 2026-09-10 —
*"트리거는 디렉터리가 아니라 단언 대상으로 쓴다"*).

**무엇을 단언하는가 — 앱 전역 값 여섯**: `"http://localhost"` **셋**(로그인 성공 착지) ·
`/signin?sessions=revoked` · `/account?sessionRevocation=invalid` · `=wrong-account`.

| 태스크 | 왜 걸리나 |
|---|---|
| **T3** | `withLoginLink`가 **같은 callback 정규식**(`/api/auth/callback/(github\|google)`)을 가로채므로 **로그인 착지 셋이 직격**이다. 그리고 *"`authjs.state=`가 있고 `malmoi-revocation-state=`가 없다"* 단언은 **쿠키 스코프가 셋이 되는 순간**의 것이다 |
| **T5** | `/account` 쿼리를 실제로 늘리는 자리다 (`?link=`) |
| **T6** | `revocationFixture`가 계정을 **정확히 하나** 붙인다 — 수단 둘 픽스처가 리포에 없다 |

⚠️ **그 스위트가 green인 것이 무죄의 근거가 아니다** — `postgres.integration.ts`의 `fakeAuth`는
프로덕션 `auth.ts`를 import하지 않고 **`signIn` 콜백을 손으로 다시 적는다**(회수만 미러링).
**T3이 그 사본을 같은 커밋에 갱신하지 않으면 병합 갈래를 한 줄도 안 돈다.**

⚠️ **시각 초안은 근거이고 정본이 아니다** (design §9.0) — 치수의 정본은 **design §7의 표**,
토큰은 `app/globals.css`, 시각 규칙은 `docs/DESIGN.md`다. **그 도구가 없는 세션에서도
T2·T3·T4는 §5.5·§6·§7만으로 착수할 수 있어야 한다.** 읽을 수 있으면 읽는다(문구·정보구조가
더 구체적이다). 위치·읽는 법·아트보드 매핑은 전부 **design.md §9**에 있다. 요약:

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
| 마지막 절 | `EntityCard` 규격 | **T4**. ⚠️ **시안의 `kind="project"`는 안 만든다** (design ⑩) |

값의 정본은 `app/globals.css`이고 초안의 raw hex·CDN·`support.js`·`assets/`는 쓰지 않는다.

---

## T1 — 순수 판정 (`/tdd` 진입점) · 커밋 1

⚠️ **디렉터리는 `lib/login-link/`이고 파일은 여섯이다** (design ⑫) — `lib/github-connect/account-link.ts`
(GitHub App 연결 소유권)와 이름으로 갈려야 한다.

- [ ] `lib/login-link/policy.ts` — `Challenge` 조립·파싱 · 쿠키 이름 둘 · `checkChallenge` ·
      `outcomeUrl(dest)` · `CHALLENGE_TTL_MINUTES`(10) · `loginMethodRows` · `canUnlink`
- [ ] `lib/login-link/plan.ts` — `planLinkOffer` 3갈래 + `planLinkConfirm` 5갈래
- [ ] `lib/login-link/message.ts` — 결과 → 문구. ⚠️ **사전 절이 둘이다**: 화면 문구는
      `messages/en.tsx`의 **`link`**, 오류 문구는 **`errors.link`**
- [ ] `lib/session-revocation/policy.ts` — `pickLoginAccount` 추가
- [ ] `lib/auth/email.ts` — `planEmailRefresh`가 **로그인 `Account` 수가 둘 이상이면 `keep`**
      (design ⑦ — 이것이 없으면 병합 뒤 `User.email`이 로그인마다 뒤집힌다)

**검증**
- `pnpm test` green — **갈래마다 케이스**. ⚠️ 심볼이 열둘이므로 아래 이름들을 개별로 짚는다:
  `checkChallenge` · `outcomeUrl` · `planLinkOffer`(3) · `planLinkConfirm`(5) · `loginMethodRows` ·
  `canUnlink` · `pickLoginAccount` · `planEmailRefresh`(새 갈래) · 조립/파싱 · 쿠키 이름 둘
- `planLinkConfirm`: **`expired`가 `wrong-account`보다 앞**인 것을 단언한다
  (만료된 challenge가 누구 것이었는지 말하지 않는다 — `verifyState`와 같은 축)
- `planLinkConfirm`: **`consume`이 `ok`에서만 `true`**다 (design ⑧ — 실패는 소비하지 않는다)
- `planLinkConfirm`: **만료 직전/직후 경계** (`policy.test.ts`의 `checkChallenge` 매트릭스와 같은 형)
- `outcomeUrl`: **`dest`가 문자열이 아니라 갈래**(`{kind:"invite",token}` | `{kind:"projects"}`)이고
  임의 URL을 **받는 오버로드가 없다**는 것을 타입·런타임 양쪽으로 (design 불변식 9 — open redirect)
- `canUnlink`: 수단 하나일 때 `false`
- `pickLoginAccount`: 수단 하나일 때 현재 동작과 같고, 둘일 때 결정적(`github` 우선)
- `planEmailRefresh`: **수단 둘 + 주소가 갈릴 때 `keep`**, 수단 하나일 때 **동작 불변**
- **모듈 그래프를 센다** — ⚠️ "import 0"이 아니다: `policy.ts`는 `outcomeUrl` 때문에
  `lib/routes.ts`를, 해시 때문에 `node:crypto`를 문다. 기준은 **"`lib/routes.ts`·`node:crypto`까지"**다
- `lib/__tests__/routes.test.ts`에 `signInLink(challenge, { e })` 케이스

---

## T2 — 거부를 안내로 · 커밋 2

- [ ] `lib/routes.ts` — **`signInLink(challenge, { e })`** 추가. ⚠️ **쿼리를 받는다** — 확인
      실패가 `Alert` 문구를 화면에 전달해야 하고, `withQuery`를 지나야 `entry-points.test.ts`의
      "쿼리 수신자" 검사에 걸린다(문자열 연결은 그 검사를 회피한다)
- [ ] `lib/login-link/store.ts` — `beginLink` (해시는 `hashInviteToken` **그 함수**).
      ⚠️ **자기 접두로 좁혀 지운다** — 같은 사용자가 두 번 시도하면 행이 둘이 되고, 넓게 지우면
      `session-revocation`의 목적을 소비한다
- [ ] `lib/login-link/view.ts` — `loadChallengeView` (마스킹 이메일·provider·가입 월 **셋만**)
- [ ] `auth.ts` `signIn` 콜백 — `planLinkOffer`가 `offer`면 challenge를 굽고 문자열 반환
- [ ] `app/signin/link/[challenge]/page.tsx` — `AuthLayout` · 320 컬럼 (카드는 T4에서 오므로
      이 단계에선 평문 두 줄로 둔다). **아트보드 `#1c`**
- [ ] `app/__tests__/entry-points.test.ts` — `EXEMPT`에 추가 **+ `PUBLIC` 배열에
      `/signin/link/sample`**. ⚠️ **뒤엣것이 없으면 아래 부정 단언의 대상이 아예 없다** —
      그 배열은 하드코딩이고 `PROTECTED`는 `(edit)/` 아래에서만 만들어진다 (POSTMORTEM 2026-09-07)
- [ ] 서버 반환 타입에 원문 `email`이 없는지 재는 **소스 스캔을 새로 쓴다**
      (`members-screen.test.ts`와 같은 형 — 검증이 아니라 작성 대상이다)
- [ ] `lib/session-revocation/__tests__/normal-login.test.tsx`의 `it.each(["root","invite"])`에
      **`"link"`를 더한다** — "일반 로그인 목록이 셋이 된다"를 **참으로 만드는 편집**이다

**검증**
- `pnpm test` green
- `entry-points.test.ts`: 이 라우트가 `EXEMPT`에 있고 **`PROTECTED`에는 없다**(부정 단언).
  ⚠️ `PUBLIC` 등재가 선행 조건이다
- 소스 스캔: `loadChallengeView`의 반환 타입에 원문 `email`이 **없다**
- 만료된 challenge → `/signin` (이 화면을 다시 그리지 않는다)
- `normal-login.test.tsx`: 세 진입점 전부 `clearRevocationCookies()`를 **먼저** 부른다
- 실물: 같은 주소의 Google 로그인 → 이 화면 착지 · `User`·`Account` 행 증가 **0**

---

## T3 — 확인 왕복 · 커밋 3 ⚠️ 가장 위험한 배송

**아트보드**: `#1c` 아래 "병합의 나머지 상태 둘" — 확인 대기(스피너만, 라벨 유지) · 확인 실패(`Alert` 한 장만 추가, 레이아웃 불변).

- [ ] **먼저 design §14의 "닫힌 둘" 중 `linkAccount` 항목을 실물로 밟는다** — 라이브러리 소스로는
      안 불리는 것이 확인됐지만(`handle-login.js`), 버전이 올라가면 조용히 바뀌는 부류다.
      불리면 설계 전제가 깨지므로 여기서 멈추고 재설계한다
- [ ] `lib/login-link/store.ts` — `finishLink` (User 행 `FOR UPDATE` · 조건부 삭제 count로
      단일 사용 · `Account` 생성이 같은 트랜잭션).
      ⚠️ **모든 조회·삭제에 `userId`를 함께 건다** — `Account` PK가 `(provider, providerAccountId)`라
      그 둘만으로 남의 행에 닿는다 (POSTMORTEM 2026-09-06)
- [ ] `lib/login-link/http.ts` — `withLoginLink`·`authorizeLoginLink`·`withLinkStart`
- [ ] `auth.ts` — `handlers`를 `withLoginLink`로도 감싸고(⚠️ **`withRevocation`이 바깥, 병합이
      안쪽** — design 불변식 8a) `cookies`가 두 스코프를 본다.
      `signIn` 콜백의 확인 갈래: 일치 → `true`, 불일치 → **문자열**(세션 안 만듦).
      ⚠️ **`authorizeRevocation`이 계속 첫 줄이다** (불변식 8b — `sign-in.test.ts`가 그것을 단언한다)
- [ ] `lib/session-revocation/*` — 회수 시작이 병합 쿠키를 지운다 (배타성, 양방향)
- [ ] challenge의 `dest` 복원 → 초대에서 왔으면 `/invite/[token]`.
      ⚠️ **임의 URL이 아니라 갈래다** (불변식 9 — `{kind:"invite",token}` | `{kind:"projects"}`)
- [ ] **`lib/credentials/__tests__/postgres.integration.ts`의 `fakeAuth`를 같은 커밋에 갱신한다** —
      그 파일은 `signIn` 콜백을 **손으로 다시 적는다**. 안 고치면 아래 회귀 ②③④가
      **옛 콜백을 검사한다**(머리말 ⚠️)

**검증**
- `pnpm test` green + **`pnpm test:credentials:postgres` green**
- 회귀 ①: `safePrismaAdapter.linkAccount`의 기존 거부가 **한 줄도 안 바뀌었다**(기존 테스트 그대로 green)
- 회귀 ②: 목적 쿠키·DB 행을 지우고 유효 state/PKCE로 callback → `User`·`Account`·`Session` 증가 0
- 회귀 ③: state 쿠키를 일반 이름으로 바꿔도 로그인 쓰기 전에 실패
- 회귀 ④: **회수를 중단한 직후 병합을 시작한다** — 회수 쿠키가 살아 있어도 병합이 자기 callback을
  받고, Location이 `/account?sessionRevocation=invalid`로 덮이지 않는다 (design 불변식 8 · §14-1)
- 회귀 ⑤: `sign-in.test.ts`의 *"회수 콜백은 `refreshVerifiedEmail`에 도달하지 않는다"*가 그대로 green
  (= 삽입 위치가 계약이다)
- 회귀 ⑥: `provider-config.test.ts`의 `allowDangerousEmailAccountLinking` 부재 단언이 그대로 green
- **`wrong-account`: 다른 GitHub으로 확인 → `Account` 증가 0 + `Session` 증가 0** (완료 조건 4)
  **+ challenge가 살아 있어 같은 URL로 재시도가 된다** (design ⑧)
- **`already-linked`**: 양쪽 `Account`가 이미 있는 User로 확인 → 쓰기 0 · 그 갈래의 문구
- 단일 사용: 성공 뒤 같은 challenge 두 번째 → `invalid`
- **동시 소비(레이스)**: 같은 challenge로 두 요청을 동시에 → **정확히 하나만** 성공.
  ⚠️ 순차만 재면 조건부 삭제의 count가 하는 일을 안 본 것이다. 실 DB가 있는
  `postgres.integration.ts`가 회수에 대해 이미 그 형을 갖고 있다
- **두 challenge 동시 존재**: 같은 사용자가 Google을 두 번 시도 → 행이 자기 접두 안에서만 정리되고
  `session-revocation`·`email-verification` 행은 **안 지워진다**(그 스위트의 기존 테스트를 넓힌다)
- **세션이 살아 있는 채 병합 시작**: 로그인된 상태로 다른 provider 로그인을 시도하면 어느
  갈래인가 — `planLinkOffer`가 세션을 안 보므로 **그 동작을 명시하고 케이스로 고정한다**
- **`dest`에 외부 URL을 물린 challenge** → `/projects`로 떨어진다 (불변식 9)
- 실물: design §14-1

---

## T4 — `EntityCard` + 초대 개편 · 커밋 4

**아트보드**: `#1b`(초대) · `#1c`(카드 삽입) · 마지막 절(`EntityCard` 규격 표).

- [ ] `components/ui/entity-card.tsx` — 프리미티브 **16 → 17**. ⚠️ **`kind`·`size` prop이 없다**
      (design ⑩) · 박스는 **`rounded-lg`**(12)다 — `rounded-xl`은 16이다
- [ ] ~~`components/ui/avatar.tsx`~~ — **건드리지 않는다.** 40을 요구하던 소비자를 뺐다 (design ⑩)
- [ ] `messages/en.tsx` — `invite.invitedTo` → `invite.title` + `invite.target`
      (⚠️ **관사 금지 주석이 `target`으로 따라간다**).
      ⚠️ **`invite.sentTo`의 둘째 문장을 뗀다** — *"Signing in with a different account won't
      accept it."*이 이 기능으로 **거짓이 된다**(design §6)
- [ ] `app/invite/[token]/page.tsx` — 로그인 상태 다섯 줄 · 비로그인은 카드 없음.
      ⚠️ **프로젝트 카드는 `components/`의 화면 조각이다** — `components/ui/`가 아니다 (design §7).
      ⚠️ 파일 주석의 "실패 여섯"을 **일곱**으로 (넷 + 셋)
- [ ] `app/signin/link/[challenge]/page.tsx` — `EntityCard` 삽입
- [ ] ~~`components/onboarding/new-project-flow.tsx`~~ — **이 배송에서 뺀다** (design ⑩ 이유 2).
      ③은 라디오이고 아바타·우측 슬롯이 없고 본문이 3줄이며 `<ul>`이 border를 든다 — 대체가
      아니라 **재설계**이고, 외과적 변경 원칙에 걸린다

**검증**
- `pnpm test` green
- `focus-ring.test.ts` green — ⚠️ **`EntityCard`에 대해서는 공회전이다**(그 검사는 `button`·`input`·
  `select`·`textarea`만 보고 카드는 포커스 가능한 컨트롤이 아니다). 재는 것은 **회귀뿐**이다
- 프리미티브 수를 세는 자리(CLAUDE.md·DESIGN)와 실제 파일 수가 **17로 일치**
- `client-graph.test.ts` green. ⚠️ **`EntityCard`는 `LocaleFlag`를 물지 않는다** — 국기는
  `components/`의 화면 조각이 든다(`ui/`가 기능 디렉터리를 import하면 잎 성질이 깨진다)
- 초대 화면 렌더 테스트: 비로그인에 **카드가 없다** · 로그인에 `h1`이 있다
- ⚠️ 실패 **일곱**의 표면이 **그대로**인지(Layer A 넷 인라인 / Layer B 셋 토스트)
- ⚠️ `invite.target`의 **소비자가 있는지** — §6의 다섯 줄에 그 문자열을 쓰는 자리가 없으면
  사전 항목을 만들지 않는다

---

## T5 — `/account` 로그인 수단 카드 · 커밋 5

- [ ] `lib/routes.ts` — `account({ link })` 추가. ⚠️ **`withQuery`를 지난다**
- [ ] `components/account/login-methods.tsx` — 행 둘 · **[Disconnect]만** · 마지막은 **비활성 +
      행 옆 인라인 사유**. ⚠️ **[Connect]는 없다** (design ⑨) · 해제에 **확인 `Dialog`**
- [ ] `app/(edit)/account/page.tsx` — 프로필 아래, GitHub App 연결 **위**.
      ⚠️ `searchParams` 타입을 `Raw<"e" | "sessionRevocation" | **"link"**>`로 넓힌다
- [ ] `app/(edit)/account/actions.ts` — `unlinkLoginMethod` (⚠️ `where`에 `userId`를 함께 건다)
- [ ] `?link=` 결과를 **읽는 자리**를 같은 커밋에

**검증**
- `pnpm test` green + **`pnpm test:credentials:postgres` green** (머리말 표 — 이 배송이
  `/account` 쿼리를 늘리는 유일한 자리다)
- ⚠️ **`entry-points.test.ts`의 "쿼리 짝" 단언만으로는 red가 안 난다** — 그 검사는
  `page.source.includes("searchParams")` 한 줄이고 `/account`는 이미 그것을 읽는다.
  재는 문장을 바꾼다: **`Raw<…>`에 `"link"`가 있고 `firstQueryValue` 구조분해에도 있다**
- `entry-points.test.ts`: Action이 `USER_SCOPED_ACTIONS`에
- 마지막 수단 해제: 순수 함수(`canUnlink`)와 Action **양쪽**에서 거부
- ⚠️ **[Connect]가 없는지** 소스로 — `finishLink`를 부르는 자리가 `signIn` 콜백 하나뿐이다
- ⚠️ **GitHub App 연결 카드와 구별되는지 눈으로** — 같은 화면에 "GitHub"이 두 번 나온다.
  로그인 수단과 리포 쓰기 권한은 다른 축이고 그 구별이 화면에서 보여야 한다

---

## T6 — 세션 회수 복구 · 커밋 6

⚠️ **T3~T5 구간에는 병합한 계정의 전체 세션 회수가 죽어 있다** — 그 조건이 `invalid`를 내고,
기존 테스트가 그 거부를 **정답으로** 단언해 커밋마다 green이다. 2026-09-12에 순서를 그대로
두기로 했고(dev에만 나가고 `/merge` 전에 T6이 끝난다), **그 창을 여기 적어 둔다.**
⚠️ spec 완료 조건 9와 §6의 완화책이 그 구간에 한해 거짓이다.

- [ ] `beginRevocation` · `startSessionRevocation` — `accounts.length !== 1` → `pickLoginAccount`.
      ⚠️ **두 벌이고 화면에서 먼저 걸리는 것은 뒤엣것**이다

**검증**
- `pnpm test` green + **`pnpm test:credentials:postgres` green**
- 수단이 **둘인** 계정에서 회수 성공 (지금은 불가능하다).
  ⚠️ **`revocationFixture`가 계정을 정확히 하나만 붙이므로 수단 둘 픽스처를 새로 만든다** —
  안 만들면 그 스위트에서 성공 경로가 **원리적으로 안 밟힌다**
- ⚠️ **바뀌어야 하는 기존 단언 셋을 이름으로 짚는다**: `store.test.ts`의 시작 거부 셋 중
  `multiple-accounts` · `action.test.ts`의 실패 다섯 중 `multiple-accounts` · `revocationFixture`.
  **red가 나는 것이 정상**이고, 안 나면 갈래를 안 걷은 것이다
- ⚠️ 그 갈래가 사라지면 `multiple-accounts` **사전 키가 죽는다** — `message.test.ts`가 죽은 키를 본다
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
- [ ] 시나리오 7: 마지막 수단 해제 시도 → 비활성 **+ 사유가 화면에 보인다**
- [ ] 시나리오 8: 확인 도중 provider 화면에서 취소 → 갇히지 않는다
- [ ] 시나리오 10: **회수를 중단한 직후 병합 시작** → 병합 화면으로 간다
      (`/account?sessionRevocation=invalid`로 새지 않는다 — design 불변식 8)
- [ ] 시나리오 11: **병합 뒤 양쪽으로 번갈아 로그인** → `User.email`이 **안 움직인다** (design ⑦)
- [ ] 시나리오 9: 1440×900 · 1280px에서 세 화면 목측 (Canvas 대조).
      ⚠️ **`AuthLayout` 우측 KV의 대비를 이름으로 본다** — 좌측이 "This email already has an
      account"인데 우측은 "Connect your projects"다. KV에 문구가 **구워져 있어** 분기별로 못 바꾼다는
      것이 `auth-layout.tsx`에 이미 기록돼 있다

**검증**: 각 시나리오의 결과와 **DB 행 증감**을 기록한다. ⚠️ 이 기록은 `tasks.md`가 닫혀도
남긴다 — `github-connect` T5·`project-onboarding` T8과 같은 부류다.

---

## T8 — 문서 · 커밋 7 (문서별 분리)

- [ ] `docs/SAAS.md` **§4.3 ④** — **판정 자체가 거기 있다.** 제목·근거·개방 조건·흐름의 모양을
      이 설계로 대체한다. ⚠️ **모양을 뒤집었다는 사실을 적는다**(1차 진입점이 `/account`가 아니다)
      **+ 개방 조건을 충족한 것이 아니라 사용자 재량으로 대체했다는 것도.** prefix `docs(SAAS): ...`
- [ ] `docs/SAAS.md` §5.5 — 방어선 서술을 갱신. **"자동으로 하지 않는다"는 그대로 참이다** —
      바뀌는 것은 "명시적 병합도 안 한다"뿐이다
- [ ] `docs/SAAS.md` **§7.7 IA 라우트 표** — `/signin/link/:challenge` 신설
- [ ] `docs/SAAS.md` — `entry-points.test.ts` 예외 수("여덟" → 아홉)
- [ ] `docs/SAAS.md` 전체 세션 회수 절 — 확인 상대 선택이 `pickLoginAccount`가 되고
      "일반 로그인 **두 화면**"이 **셋**이 된다
- [ ] `docs/ARCHITECTURE.md` §6 — `signIn` 콜백의 갈래 둘과 challenge의 수명.
      ⚠️ **`linkAccount` 게이트는 안 바뀌었다고 명시**한다(다음 사람이 열지 않게).
      ⚠️ 그리고 **"Auth.js 경유의 유일한 경로"**로 뜻이 좁아졌다는 것도 — `finishLink`가 옆문이다
- [ ] `lib/auth/safe-adapter.ts`의 **주석** — 위와 같은 이유 (코드는 한 줄도 안 바꾼다)
- [ ] `docs/DESIGN.md` — `EntityCard` 규격 · 프리미티브 17 · 셸 밖 화면이 **셋** ·
      `Button size="lg"`의 "둘뿐"이 **셋**이 된다 ⚠️ **그 문장이 네 자리에 있다**
      (`button.tsx` 주석 · DESIGN 세 곳)
- [ ] `CLAUDE.md` — 디렉터리 구조(`lib/login-link/`·`app/signin/link/`·`components/account/`) ·
      프리미티브 수 · 코어 모듈 목록(`.claude/commands/push.md` 4단계 트리거와 **같아야 한다**) ·
      ⚠️ **`entry-points.test.ts` 예외가 "6개"로 적혀 있는데 실제는 8이다** — 이 김에 고친다
- [ ] `docs/features/README.md` — 표에 한 줄
- [ ] **`docs/features/ui-rework/README.md` · `docs/features/page-patterns/spec.md`** — 이 배송이
      `/invite`(8-1이 재작성했다)와 `/account`(8-5 미착수)를 건드리므로, 안 적으면 두 문서가
      **조용히 거짓**이 된다
- [ ] `docs/POSTMORTEM.md` — T3에서 무언가 잡혔으면 `/postmortem`

**검증**: `/doc-check`이 green.

---

## 배포

- 마이그레이션 **없음** → `/db` 불필요
- 새 환경변수 **없음** → `.env.example` 변경 없음
- `/push`(dev·preview) → 실물 재확인 → `/merge`(프로덕션)
