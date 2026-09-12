# account-linking — 설계

## 0. 결정 기록

**2026-09-12 1차** (다섯 물음, 사용자 확인) → **같은 날 2차에서 ①이 뒤집혔다.**
Claude Design 핸드오프(`design_handoff_signin_invite_link_account/README.md`)를 읽고 **초안 쪽으로 갔다.**

| # | 물음 | 결정 | 근거 |
|---|---|---|---|
| ① | 첫 OAuth 증명을 왕복 너머로 들고 가나 | ~~아니다(재왕복)~~ → **그렇다 — `challenge` 단기 토큰** | **초대 흐름이 끊기지 않는 유일한 형태다** — §2 |
| ② | 거부된 사람을 어디로 | **`/signin/link/[challenge]` 전용 화면** | 경로 토큰이라 "표시 전용 힌트"라는 애매한 층이 없다 |
| ③ | 수단 둘일 때 세션 회수의 확인 상대 | **`github` 우선 고정** | 둘 다 동등한 소유 증명이라 필요한 것은 결정성 하나다 — §8 |
| ④ | 검증 이메일이 다르면 | **거부** (challenge를 안 만든다) | `planEmailRefresh`가 로그인마다 `User.email`을 덮고 초대 대조가 그 위에 선다 |
| ⑤ | 연결 알림 메일 부재 | **`/account` 수단 목록 + 해제로 갚는다** | 완화이지 대체가 아니다 (spec §6) |
| ⑥ | 초대 화면 개편을 묶나 | **묶는다** | 병합의 복귀 지점이고, `EntityCard`를 둘이 공유한다 |

⚠️ **①을 뒤집은 이유를 남긴다** — 처음엔 "저장된 증명은 양도 가능하다"로 재왕복을 골랐다. 그런데
이 구조의 challenge는 **자동으로 붙이지 않는다**: 화면에서 [Confirm]을 눌러 **기존 provider의
OAuth를 새로 통과**해야 하므로 증명은 여전히 둘이고, 저장되는 것은 "대기 중인 계정이 무엇인가"
뿐이다. 훔친 URL로 할 수 있는 일은 **그 Google 계정을** 붙이는 것뿐인데, 그 계정을 만들려면
이미 피해자 주소를 Google에서 검증했어야 한다.

**2026-09-12 3차** — `/feature-review`(CPO·CDO·CTO·QA) 뒤 확정.

| # | 물음 | 결정 | 근거 |
|---|---|---|---|
| ⑦ | 병합 뒤 이메일 정본 | **로그인 `Account`가 둘 이상이면 `planEmailRefresh`가 언제나 `keep`** | "언제나 keep"은 **병합 시점에만** 참이었다 — spec §0 ⚠️ |
| ⑧ | 확인 실패가 challenge를 소비하나 | **아니다 — 성공만 소비한다** | 소비하면 훔친 URL 하나로 남의 병합을 태운다. 상한은 10분 TTL이 든다 |
| ⑨ | `/account`에 [Connect]를 두나 | **두지 않는다 — 목록 + 해제만** | `finishLink`가 여는 옆문에 인가 조건을 적을 수 없다. 같은 주소 연결은 흐름 ①이 이미 잡는다 |
| ⑩ | `EntityCard`의 `kind` | **없앤다 — user 전용, 소비자 하나** | `/projects/new` ③은 형이 다르고(라디오·3줄·컨테이너 모델), `kind="project"`는 `Avatar`에 **DESIGN §6.4가 거부한** 글리프 폴백을 요구한다 |
| ⑪ | §14의 "실물로 확인" 셋 | **둘을 설계 계약으로 올린다** | 배타성과 `redirectTo`는 설계 단계에서 답이 난다 — §3 불변식 8·9 |
| ⑫ | 디렉터리 이름·파일 수 | **`lib/login-link/` · 여섯** | `lib/github-connect/account-link.ts`와 이름으로 안 갈렸다. `detect`+`plan`을 합치고 `methods`는 `policy`로 |

## 1. 흐름

```
① Google 로그인 시도 (기존 GitHub 계정과 같은 주소)
   auth.ts signIn 콜백: google Account 없음 + 같은 emailLookup User 있음
   → challenge 생성 (10분·단일 사용, 해시만 저장)
   → return /signin/link/<token>            ← User·Account 안 만들어진다
②
   /signin/link/[challenge]
     로고 48
     h1  "This email already has an account"
     p   "You just signed in with Google, but this address was created with GitHub."
     EntityCard              ← 마스킹 이메일 · GitHub · joined Sep 2026
     [ Confirm with GitHub ]  ← 채움, 유일한 길
     각주 "…Your projects and translations stay where they are."
     ────────────────────────
     [ Sign in with another account ]   ← m.invite.otherAccount 재사용
③ GitHub OAuth
   signIn 콜백: challenge 소비 + userId 대조
     일치  → google Account 생성 → true(로그인 진행) → redirectTo
     불일치 → 문자열 반환(세션 안 만듦) → 같은 화면 + Alert
              ⚠️ challenge는 **살아 있다** — 소비는 일치에서만 (⑧)
④ 착지: challenge의 redirectTo (초대에서 왔으면 /invite/[token], 아니면 /projects)
```

⚠️ **③의 불일치 갈래가 이 설계의 급소다.** 대조를 `signIn` 콜백에서 하는 이유는 거기가
`handleLoginOrRegister`보다 **앞**이라서다 — 뒤에서 하면 **남의 GitHub으로 로그인된 세션이
이미 만들어진 채** 병합 화면을 보게 된다. `authorizeRevocation`이 문자열을 반환해 멈추는 것과
같은 관용구다.

⚠️ **그 대조에 `user.id`를 쓰지 않는다.** `signIn`이 받는 `user.id`는 그 Account가 처음 보는
것일 때 `crypto.randomUUID()`로 갓 만들어진 값이라(`@auth/core`의 `oauth/callback.js`) DB의
어떤 행과도 안 맞는다 — `auth.ts`가 이미 같은 이유로 그 값을 못 믿는다고 적어 뒀다.
**`(provider, providerAccountId)`로 조회한 `userId`**를 `planLinkConfirm`에 넘긴다. 그것이
없으면(= 정말 처음 보는 GitHub) 그 자체로 `wrong-account`다.

## 2. 왜 challenge인가 — 초대가 근거다

핸드오프 README:

> 초대 링크에서 들어온 경우: `challenge`가 `redirectTo`를 들고 다녀 병합 뒤 `/invite/[token]`으로
> 돌아온다. **병합이 없으면 이 사람은 자기 주소인데도 `email-mismatch`를 만나 수락할 길이 없다.**

`/account`에서 연결하게 하는 형태는 이 경로가 **끊긴다** — 초대 토큰이 사라지고 사용자는 메일함에서
링크를 다시 찾아야 한다. 그런데 **초대받고 다른 provider로 들어오는 사람이 이 기능의 주 사용자다**
(spec §1). 왕복 하나를 아끼는 것보다 이쪽이 크다.

## 3. 불변식

1. **이메일이 같을 때만 병합한다.** challenge 생성 조건이 그것이다.
   ⚠️ 근거는 UX가 아니라 `planEmailRefresh`다 — 재로그인마다 `User.email`을 그 provider의 현재
   검증 주소로 갱신하므로, 주소가 다른 두 수단이 붙으면 **로그인할 때마다 값이 뒤집히고** 초대
   대조(SAAS §5.6)가 그 위에 서 있다.
   ⚠️ **그런데 "같은 주소면 언제나 `keep`"은 병합 시점에만 참이다** — 그 뒤 한쪽 provider에서
   주소를 바꾸면 같은 뒤집힘이 도착한다. 그래서 불변식이 **지속 조건**이어야 한다:
   **로그인 `Account`가 둘 이상인 User는 `planEmailRefresh`가 언제나 `keep`이다** (⑦).
   대가는 spec §0 ⚠️에 적었다 — 병합한 사용자의 이메일은 provider를 안 따라간다.
2. **`safePrismaAdapter.linkAccount`의 현재 거부를 한 줄도 약하게 하지 않는다** — §5.3.
3. **병합 왕복은 일반 로그인으로 변신할 수 없다.** Auth.js state 쿠키를 **다른 이름·salt**로
   분리한다 — `session-revocation`이 POSTMORTEM 2026-09-10 뒤에 도달한 구조 그대로.
4. **challenge는 원문을 저장하지 않는다.** URL 경로에 실리므로 초대 토큰과 같은 관용구다
   (`hashInviteToken` **그 함수**를 쓴다 — 해시 규칙이 한 곳이다).
5. **성공은 단일 사용 + 10분 만료.** 소비는 조건부 `deleteMany`의 count로 강제한다.
   ⚠️ **실패(`wrong-account`)는 소비하지 않는다** (⑧) — 소비하면 훔친 URL 한 번으로 피해자의
   병합을 태울 수 있고, 안 해도 상한은 TTL이 든다. 그래서 `planLinkConfirm`의 반환에
   **"이 갈래가 소비를 요구하는가"가 붙어 있어야 하고**, `store.ts`가 그것을 읽는다.
6. **마지막 로그인 수단은 해제할 수 없다.**
7. **`allowDangerousEmailAccountLinking`은 계속 어느 provider에도 없다.**
   ⚠️ 그것을 **실제로 강제하는 자리**는 `lib/auth/__tests__/provider-config.test.ts`의
   `not.toMatch(/allowDangerousEmailAccountLinking\s*:/)` 하나다 — 회귀 목록에 이름으로 넣는다.
8. **두 가로채기는 배타적이어야 하고, 그 배타성은 구조가 아니라 쿠키 정리가 만든다** (⑪) — §14-2가
   있던 자리다. 계약 셋: (a) **래핑 순서는 `withRevocation`이 바깥**이고 병합이 안쪽이다 —
   회수가 먼저 판정하고 자기 것이 아니면 통과시킨다. (b) **`signIn` 안에서 `authorizeRevocation`이
   계속 첫 줄**이다(`sign-in.test.ts`가 "회수 콜백은 `refreshVerifiedEmail`에 도달하지 않는다"를
   단언하므로 **삽입 위치가 계약**이다). (c) **양방향 쿠키 정리** — 병합 시작이
   `clearRevocationCookies()`를, 회수 시작이 병합 쿠키를 먼저 부른다.
   ⚠️ **왜 구조로는 안 되는가**: `session-revocation/http.ts`의 intent 판정이 쿠키 셋의 **OR**이라
   암호적 결합이 없다. 회수를 중단한 사용자(쿠키 15분 생존)가 곧바로 병합을 시작하면 회수가 그
   callback을 먹고 Location을 `/account?sessionRevocation=invalid`로 **덮어쓴다** — 사용자에겐
   병합 버튼이 엉뚱한 화면을 낸 것으로 보인다.
9. **`redirectTo`는 임의 URL이 아니라 갈래 이름이다** (⑪) — §14-3이 있던 자리다.
   `{ kind: "invite", token } | { kind: "projects" }`로 저장하고 복원은 `routes.*`가 만든다.
   ⚠️ **`lib/github-connect/state.ts`의 `StateDest`와 같은 관용구**이고 이유도 같다: 저장된
   문자열을 그대로 리다이렉트에 쓰면 open redirect 판정이 생기고, 그 판정을 잊는 것이 조용하다.
   `signIn`의 문자열 반환은 지금 Auth.js 기본 `redirect` 콜백이 origin으로 클램프하지만
   **`auth.ts`에 그 콜백을 정의하는 순간 보호가 조용히 사라진다** — 그것에 기대지 않는다.

## 4. 영향 받는 흐름

**push·편집 UI·pull 중 어느 것도 아니다.** 인증 경계(ARCHITECTURE §6)와 셸 밖 화면 셋에만 붙는다.
번역 값·소스 키·export 결정성·blob SHA는 한 줄도 건드리지 않는다.

## 5. 모듈

### 5.1 새로 만드는 것 — `lib/login-link/`

`lib/session-revocation/`과 **같은 형**이다(순수 policy + DB store + callback 가로채기).
참고 구현으로 삼되 **합치지 않는다** — 목적이 반대다(하나는 왕복을 멈추고, 하나는 진행시킨다).

⚠️ **이름이 `account-link`가 아닌 이유** (⑫) — `lib/github-connect/account-link.ts`가 이미 있고
그쪽은 **GitHub App 연결의 소유권**(`planAccountLink`)이다. 축이 다른 둘이 이름으로 안 갈리면
다음 사람이 매번 대조한다. `login-link`는 "로그인 수단"이라는 축을 이름이 말한다.

| 파일 | 무엇 | 순수? |
|---|---|---|
| `policy.ts` | `Challenge` 조립·파싱 · 쿠키 이름 둘 · `checkChallenge` · `outcomeUrl` · `CHALLENGE_TTL_MINUTES` · **`loginMethodRows`·`canUnlink`** | ✅ |
| `plan.ts` | **`planLinkOffer` 3갈래 + `planLinkConfirm` 5갈래** | ✅ |
| `message.ts` | 결과 → 문구 | ✅ |
| `store.ts` | `beginLink`·`finishLink` — `VerificationToken` 재사용, User 행 잠금 | ❌ server-only |
| `http.ts` | `withLoginLink`·`authorizeLoginLink`·`withLinkStart` | ❌ server-only |
| `view.ts` | `loadChallengeView` — 화면이 보일 값만 (마스킹 이메일·provider·가입 월) | ❌ server-only |

⚠️ **파일이 여섯이다** (⑫, 선례는 넷) — 판정 둘을 `detect.ts`/`plan.ts`로 가를 이유가 없고
(`signIn` 콜백 하나가 둘 다 부른다), `methods.ts`는 `policy.ts` 크기다.

⚠️ **`planLinkOffer`가 받는 `existingUser`는 새 조회가 아니다.** `refreshVerifiedEmail`이 이미
`account.findUnique`로 "이 Account가 새 것인가"를 알고 있으므로(`lib/credentials/access.ts`),
**그 값이 "없다"일 때만** `emailLookup` 조회 하나를 더한다 — 재방문 로그인(대부분)에는 비용이
0이다. 조회의 주인은 그 자리이고 `lib/login-link/`는 조회를 모른다.

⚠️ **`VerificationToken`을 목적 접두로 재사용한다** — 이메일 provider를 안 써서 비어 있고
`session-revocation`이 이미 그 관용구다. `PURPOSE = "malmoi/login-link"`라 두 목적의 요청이
서로를 소비하지 않는다. ⚠️ **`beginLink`도 `beginRevocation`처럼 자기 접두로 좁혀 지운다** —
같은 사용자가 Google을 두 번 시도하면 행이 둘이 되고, 넓게 지우면 남의 목적을 소비한다.

### 5.2 순수 함수 — `/tdd` 진입점

```
planLinkOffer({ provider, providerAccountId, verifiedEmail, existingUser })
  → { kind: "sign-in" }                        평범한 로그인·가입
  | { kind: "offer", have: "github"|"google" }  같은 주소가 다른 수단으로 등록돼 있다
  | { kind: "reject" }                          검증 이메일이 없다 (현재 동작 유지)

planLinkConfirm({ challenge, confirmedUserId, provider, providerAccountId, expires, now })
  → { kind: "ok" | "expired" | "wrong-account" | "already-linked" | "invalid",
      consume: boolean }                        ⚠️ ok만 true (⑧)

canUnlink(methods, provider) → boolean
loginMethodRows(accounts) → { provider, connected, label? }[]      순서 고정
pickLoginAccount(accounts) → Account | null                        §8
checkChallenge(...)  parseChallengeIdentifier(...)  outcomeUrl(dest)

⚠️ **`confirmedUserId`이지 `signedInUserId`가 아니다** — 그 시점에 세션은 없다. 값은
`(provider, providerAccountId)`로 조회한 `Account.userId`이고, **없으면 그 자체로
`wrong-account`**다 (§1 ⚠️).
⚠️ **`outcomeUrl`이 받는 `dest`는 문자열이 아니라 갈래**다 — §3 불변식 9.
```

⚠️ **`planLinkConfirm`의 `expired`가 `wrong-account`보다 앞이다** — `verifyState`가
`state-expired`를 `wrong-user`보다 앞에 둔 것과 같은 축이다: **만료된 challenge가 누구 것이었는지
말하지 않는다.**

### 5.3 ⚠️ `safePrismaAdapter.linkAccount`를 건드리지 않는다

**확인 왕복에서 Auth.js의 `linkAccount`는 불리지 않는다.** 그 왕복은 **기존 GitHub 계정으로 하는
평범한 로그인**이고 그 `Account` 행은 이미 있다. 붙여야 하는 것은 **Google** 행이고, 그것은
우리가 `finishLink` 안에서 직접 쓴다.

⚠️ **근거를 정확히 적는다 — 라이브러리 소스로 확인했다.** `@auth/core`의 `handle-login.js`는
`getUserByAccount`가 행을 주고 세션이 없으면 **거기서 반환**하므로 `linkAccount` 호출 셋 중
어느 것에도 도달하지 않는다. 그리고 **불일치 갈래도 안전한 이유는 다르다**: `signIn`이 문자열을
내면 `callback/index.js`가 `handleLoginOrRegister`를 **통째로 건너뛴다** — `createUser`·
`linkAccount`·`createSession` 전부 0회다.

그래서 **발견 31의 방어선(만료 세션 토큰을 수동 Cookie로 보내 남의 User에 붙이기)이 그대로 닫혀
있다.** 1차 설계는 그 게이트를 조건부로 열어야 했는데, 이 구조는 **열지 않는다.** 뒤집은 결정의
부수 이득이고, 재작성에서 **가장 중요한 차이**다.

⚠️ **그 게이트가 유일한 경로는 아니게 된다.** `safe-adapter.ts`가 문서화한 정책은 *"로그인 수단은
User당 하나"*인데 `finishLink`가 둘째 행을 직접 쓴다. **게이트는 안 약해지고 옆에 문이 하나 난다** —
그래서 그 문의 인가 조건이 명확해야 하고(이메일 동등 + 두 provider 소유 증명 + 단일 사용
challenge), **그 조건을 못 적는 진입점은 만들지 않는다**(⑨ — `/account` [Connect]를 뺀 이유).
`safe-adapter.ts`의 주석도 "유일한 경로"에서 "Auth.js 경유의 유일한 경로"로 갱신한다(T8).

### 5.4 고치는 것

| 파일 | 무엇 |
|---|---|
| `auth.ts` | `signIn` 콜백에 `planLinkOffer`·`planLinkConfirm` 분기 (⚠️ **`authorizeRevocation` 뒤**, §3-8b) · `handlers`를 `withLoginLink`로도 감싼다 (⚠️ **안쪽**) · `cookies` 옵션이 두 스코프를 본다 |
| `lib/session-revocation/store.ts`·`app/(edit)/account/actions.ts` | `accounts.length !== 1` → `pickLoginAccount` (§8). ⚠️ **두 벌이고 화면에서 먼저 걸리는 것은 뒤엣것**이다 |
| `lib/routes.ts` | `signInLink(challenge, { e })` · `account({ link })` 추가 — ⚠️ **둘 다 `withQuery`를 지난다** |
| `lib/auth/email.ts` | `planEmailRefresh`가 로그인 `Account` 수를 보고 둘 이상이면 `keep` (⑦) |
| `lib/auth/safe-adapter.ts` | **코드는 한 줄도 안 바꾸고 주석만** — "Auth.js 경유의 유일한 경로"로 (§5.3) |
| `middleware.ts` | **건드리지 않는다** — `/signin/link/…`는 비로그인이 봐야 한다 |
| `app/__tests__/entry-points.test.ts` | `EXEMPT`에 `signin/link/[challenge]/page.tsx` 추가 **+ `PUBLIC` 배열에 `/signin/link/sample`**. ⚠️ **뒤엣것이 없으면 "matcher에 없다"를 재는 대상이 아예 없다** — 그 배열은 하드코딩이다 |
| `messages/en.tsx` | `link` 절 신설 · `invite.invitedTo` → `invite.title` + `invite.target` |
| `app/invite/[token]/page.tsx` | §6 |
| `components/ui/entity-card.tsx` | §7 — 프리미티브 **16 → 17**. ⚠️ `Avatar`는 **안 건드린다** |
| `app/invite/[token]/page.tsx`의 "실패 여섯" 주석 | **일곱**이다 (넷 + 셋) |

### 5.5 화면

| 라우트 | 무엇 | 인가 |
|---|---|---|
| `/signin/link/[challenge]` (신설) | `AuthLayout` · 320 컬럼 다섯 줄 + 구분선 아래 outlined 버튼 | **없다** — challenge가 대신한다 |
| `/invite/[token]` (개편) | §6 | 없다 (기존 그대로) |
| `/account` (수정) | `Sign-in methods` 카드 신설 — **목록 + 해제만** | `requireUser` |

⚠️ **[Connect]를 두지 않는다** (⑨). 이유 둘: ① 로그인된 세션을 근거로 `Account`를 붙이는 경로는
**sec-audit-2 #31이 막은 바로 그 자리**이고, 그 문의 인가 조건을 `/account`에서는 못 적는다.
② 비목표가 "이메일이 다른 병합"을 뺐으므로 이 버튼이 할 수 있는 일은 **같은 주소 연결뿐**인데,
그건 로그아웃 후 그 provider로 로그인하면 **흐름 ①이 이미 잡는다.** 카드가 하는 일은
"지금 무엇으로 들어올 수 있나"를 보이고 **되돌릴 수단**(해제)을 주는 것이다 — spec §6.

⚠️ **마지막 수단은 비활성 + 행 옆 인라인 사유**다. 사유 없는 disabled는 이 리포가 반복해 밟은
부류이고(POSTMORTEM 2026-09-06), 관용구는 멤버 화면(`components/members/member-list.tsx`)의
행 옆 인라인이다.

⚠️ **해제에는 확인 `Dialog`가 있다.** `DisconnectGithubButton`이 확인 없이 한 번 클릭인 것은
그쪽이 **다시 누르면 복구되는** GitHub App 연결이어서다. 로그인 수단 해제는 되돌리려면 OAuth
왕복 전체가 필요하고, spec §6이 그것을 알림 부재의 보상으로 든다 — 멤버 제거와 같은 무게다.

⚠️ **`/signin/link/…`를 matcher에 넣지 않는다** — 넣으면 비로그인이 `/signin`으로 튕겨 이 화면이
존재할 이유가 사라진다. `/invite/[token]`과 같은 판단이다.

⚠️ **노출 최소화**: 비로그인에게 보이는 것은 **마스킹한 이메일 · provider 이름 · 가입 월**뿐이다.
이름·아바타 이미지·프로젝트 수는 싣지 않는다 — 그 이메일을 아는 사람이 남의 계정을 열람하는 길이
된다. 서버가 `loadChallengeView`로 **보일 값만** 만들어 내려준다(`loadMembers`가 원문 이메일을
안 돌려주는 것과 같은 규칙 — 클라이언트에서 가리면 원문이 이미 RSC 페이로드에 있다).

⚠️ **만료를 이 화면으로 말하지 않는다** — `/signin`으로 되돌린다. 다시 그리면 그 상태가 또 하나의
표면이 된다(핸드오프 README).

#### 상태 둘
- **확인 대기** — 채움 버튼 `loading`. ⚠️ **스피너만 세우고 라벨은 그대로**(`Button`에
  `loadingLabel`이 없는 이유). 아래 버튼은 `disabled`.
- **확인 실패** — ⚠️ **기본 상태 + `Alert variant="danger"` 한 장이 전부다.** 부제·각주·구분선·
  버튼 라벨이 그대로다 — 실패에서 레이아웃을 갈아치우면 사용자가 같은 화면으로 돌아온 것을
  못 알아본다. 자리는 설명 **아래**, 카드 **위**. 라벨을 "Try again"으로 바꾸지 않는다
  (`Alert`이 이미 그것을 말한다).
  ⚠️ **규약 8의 Layer A는 아니다 — 의도적 예외다.** 그 규약의 Layer A는 *"빼면 화면이 빈다"*인데
  이 화면은 실패해도 카드와 버튼이 남고, 같은 사건의 기존 사례(초대 `email-mismatch`)는
  **토스트**다. 그래도 인라인으로 두는 이유는 **메시지와 조치가 한 자리에 있어야** 해서다 —
  다시 누를 버튼이 바로 아래에 있고, 토스트는 그 둘을 화면의 반대 끝으로 가른다.
  ⚠️ challenge가 **살아 있다**(⑧)는 것이 이 상태의 전제다 — 소비했으면 여기 세울 것이 없다.

## 6. `/invite/[token]` 개편

지금 이 화면은 **320 컬럼의 제목 칸이 비어 있는 유일한 화면**이다.

**로그인 상태 — 다섯 줄, 전부 `gap-4`**
1. 로고 48
2. `h1 text-2xl font-medium` — `invite.title` **"You're invited"**
3. `text-sm text-muted-foreground` 중앙 — `sentTo(maskedEmail)`.
   ⚠️ **각주에서 설명으로 올라왔다** — 누구의 초대인지는 수락 버튼 뒤의 단서가 아니라 읽는 순서의 둘째다.
   ⚠️ **둘째 문장을 뗀다.** 지금 값은 *"This invitation was sent to {email}. **Signing in with a
   different account won't accept it.**"*인데 **뒤 문장이 이 기능으로 거짓이 된다** — 병합하면
   다른 수단으로 들어와도 수락된다. 그리고 설명 자리로 올라오면 **올바른 계정으로 온 사람이
   경고부터 읽는다.** 남기는 것은 앞 문장 하나이고, 실제 거부는 `email-mismatch` 갈래가 말한다.
4. **프로젝트 카드** — 이름 · 내가 받을 역할 · 우측 언어 국기.
   ⚠️ **`components/ui/`의 프리미티브가 아니라 `components/`의 화면 조각이다** (⑩) — §7.
5. `SubmitButton variant="primary" size="lg" w-full` — `accept`

**비로그인 상태**: 1–3은 같고 **카드가 없다.** 그 자리에 `signInHint` 한 줄 + provider 버튼 둘
(**둘 다 `default`** — 어느 쪽으로 가입했는지 화면이 모르므로 primary가 없다).
⚠️ **노출을 단계로 가르는 것이 요지다**: 이 화면은 matcher 밖이라 링크를 가진 누구에게나 열리고,
그때 고를 것은 "로그인할까"뿐이라 프로젝트 상세가 필요 없다.

**사전이 한 항목 갈린다**
```
invite.invitedTo(project, role)  →  invite.title              "You're invited"
                                    invite.target(project, role)
```
- `"Welcome to malmoi"`를 쓰지 않는다 — 이미 멤버인 사람이 두 번째 프로젝트에 초대되는 경우가
  있고 그때 거짓이다.
- 역할 이름은 계속 `projects.role`에서 온다.
- ⚠️ **`invitedTo`의 관사 금지 주석이 `target`으로 따라간다** — 2026-09-08에 "as a Editor"가 나왔다.

**실패 여섯의 표면은 그대로다.** Layer A 넷은 인라인 `Alert`(그것이 페이지 콘텐츠 전부다),
Layer B 셋은 `?e=` → 토스트. `email-mismatch`일 때만 [Sign in with another account]가 선다.

## 7. 새 프리미티브 `EntityCard` — **user 전용**

"지금 다루는 대상 하나"를 보이는 자리. ⚠️ **`kind`가 없다** (⑩) — 이 배송의 소비자는 병합
화면 하나다.

```
props: name, secondary, meta     // meta = 우측 슬롯. size 고정 32
```

⚠️ **`kind="project"`를 안 만든 이유가 셋이다.**
1. **`Avatar`가 그것을 못 그린다.** 폴백이 **이니셜**이고 요구는 **흰 `Box` 글리프**인데,
   `docs/DESIGN.md`가 프로젝트 목록 행에 대해 **이미 같은 판정을 내려 뒀다** —
   *"`Avatar` 프리미티브가 아니다 — 그쪽 폴백은 이니셜이고 여기 요구는 글리프다."*
   그리고 `shape="square"`는 radius가 **단일 값**이라 size별 8/10을 못 낸다. 즉 붙는 변경이
   `size` 하나가 아니라 **셋**(글리프 폴백 축 · size별 radius · size 40)이고, 그중 첫째는
   DESIGN이 명시적으로 거부한 것이다. **`Avatar`는 한 줄도 안 건드린다.**
2. **소비자 셋 중 실물로 있는 하나가 형이 다르다.** `/projects/new` ③은 **라디오**이고
   (아바타 없음 · 본문 3줄 · 우측 슬롯 없음 · `<ul>`이 border·divide·radius를 든다),
   `Radio`가 자기 `<label>`을 들어 카드로 감싸면 클릭 대상이 둘로 갈린다 — 그 파일의 주석이
   이미 경고한다. **대체가 아니라 재설계**이므로 이 배송에서 뺀다(외과적 변경 원칙).
3. **소비자가 둘뿐이면 프리미티브가 아니다.** 초대의 프로젝트 카드는 `components/`의 화면
   조각으로 두고, **둘이 진짜 같아지는 순간** 올린다. 선례가 `LocaleFlag`다 — 두 표면이 같은
   것을 쓸 때 **합성 컴포넌트가 아니라 가장 작은 조각만** 뽑았다.

⚠️ **초대의 프로젝트 카드는 `EntityCard`의 박스 규격을 그대로 따른다** — 같은 화면 언어여야
하므로 아래 치수 표를 공유하고, 다른 것은 아바타·2행·우측 슬롯의 내용뿐이다.

공통 박스: `flex items-center gap-3 rounded-lg border border-border p-3 w-full`
본문: `flex min-w-0 flex-1 flex-col gap-px` · 1행 `text-sm truncate` · 2행 `text-xs text-muted-foreground`

**치수의 정본은 아래 표다** (⚠️ **초안이 아니다** — §9.0). 초안의
`EntityCard.dc.html`은 이 표의 **근거**이고 README 표보다 구체적이라 값을 여기서 받았다:

| | 값 |
|---|---|
| 박스 | radius **12** · padding **12** · gap **12** · `1px` border |
| 본문 | 1행 **14px** · 2행 **13px**(= 올라간 `--text-xs`) · 줄 사이 **1px** |
| 아바타 radius | user **999px**(원) · 프로젝트 카드 **8px** |
| 프로젝트 글리프 | `Box` **16** |
| 우측 슬롯 | gap **4** · 국기 **16×11** radius **2** |

⚠️ **박스 radius 12는 `rounded-lg`다 — `rounded-xl`이 아니다.** 이 리포에서 `--radius-lg` = 12,
`--radius-xl` = `calc(--radius + 4px)` = **16**이다(`app/globals.css`, `docs/DESIGN.md`). 즉
**시안의 12를 내는 클래스가 `rounded-lg`이고 핸드오프 README 표가 옳았다.**
⚠️ 반대 선례(`ui-rework/README.md`가 `AuthLayout` 패널에 한해 시안 12 → `rounded-xl`을 허용)는
**948px 패널**이라 4px이 안 보이는 자리다. 이 카드는 320 컬럼 안의 ~56px 박스이고, 같은 화면의
`Card`·`Alert`·`Dialog`가 전부 12라 **작은 카드 하나만 더 둥글어진다.**

⚠️ **프로젝트 카드의 우측 국기는 복수다.** 시안이 `us,kr,jp` 셋을 기본으로 그린다 — README의
"언어 국기"가 단수로 읽혀서 오해하기 쉽다. 프로젝트의 로케일이 여럿이므로 목록을 받고,
`LocaleFlag`는 매핑이 없으면 `null`을 내므로 **빈 슬롯 처리**가 필요하다.

⚠️ **아바타 색 8색은 `lib/tone.ts`와 같은 축이다.** 시안이 해시를 재현해 뒀지만 **판정은 리포가
든다** — `toneFill(name)`을 그대로 쓰고 시안의 hex 배열을 옮기지 않는다.

| | `EntityCard` (프리미티브) | 초대의 프로젝트 카드 (화면 조각) |
|---|---|---|
| 아바타 | 원 · 이니셜 · `toneFill(name)` | 라운드 사각 · `Box` 글리프 16 흰색 · `toneFill(name)` |
| 1행 | **마스킹한 이메일** (남의 계정이다) | 프로젝트 이름 |
| 2행 | provider + 가입 월 | **내가 받을 역할** |
| 우측 | provider 마크 16 · `text-foreground` | 언어 국기 (`LocaleFlag` 16×11) |

⚠️ **`LocaleFlag`가 `components/ui/`로 들어오지 않는다** — 그것은 `components/translations/`의
export이고, 프리미티브가 기능 디렉터리를 import하면 `ui/`가 잎에 가깝다는 성질이 깨진다
(`client-graph.test.ts`는 무거운 모듈만 보므로 **그것을 막지 않는다**). 국기를 쓰는 쪽이
`components/`의 화면 조각으로 남는 것이 이 경계를 지키는 값싼 방법이다.

⚠️ **provider 마크는 `text-muted-foreground`가 아니다** — 브랜드 마크는 무채색 위계의 대상이
아니라 `--foreground`를 그대로 받는다(로그인 버튼에서도 버튼 색을 상속한다).

⚠️ **숫자를 싣지 않는다** — 키 수·멤버 수는 수락 여부를 바꾸지 않고 프로젝트 규모만 새게 한다.
국기는 번역자가 **자기 언어가 있는지** 보는 값이라 남긴다.

⚠️ **`Avatar`의 `size` union은 `16|24|32` 그대로다** — 40을 요구하던 소비자(`/projects/new` ③)를
뺐으므로 넓힐 이유가 사라졌다 (⑩).

**소비자**: 병합 화면 **하나**(프리미티브) + 초대 로그인 분기 하나(화면 조각).
⚠️ **`/projects/new` ③은 건드리지 않는다** — 위 이유 2.

## 8. 세션 회수 — 지금 깨지는 자리

`beginRevocation`이 `accounts.length !== 1`을 **명시적으로 요구한다.** 로그인 수단이 둘이 되는
순간 **전체 세션 회수가 항상 `invalid`로 실패한다** — 약해지는 게 아니라 **멈춘다.** 같은 조건이
`startSessionRevocation`에도 한 벌 더 있다.

**결정: `pickLoginAccount`가 결정적으로 하나를 고른다 — `github` 우선, 없으면 `google`.**
두 수단 모두 소유 증명이라 확인 상대로 동등하고, 필요한 것은 결정성 하나다. 클라이언트가 고르게
하면 공격자가 확인 상대를 고르게 된다.

⚠️ **"가장 먼저 등록한 수단"으로 하지 않는다** — `Account`에 `createdAt`이 없고, 추가하면 기존
행이 전부 null이라 폴백 규칙이 또 필요하다.

⚠️ **`finishRevocation`은 `challenge.provider`로 대조하므로 그대로 둔다** — 시작할 때 고른
provider가 요청에 박혀 있고 끝낼 때 다르면 `wrong-account`다. 수단이 둘이어도 그 대조는 옳다.

## 9. 시각 초안 — 어디에 있고 어떻게 읽나

### 9.0 ⚠️ 초안은 근거이고 정본이 아니다

**치수의 정본은 §7의 표이고, 토큰의 정본은 `app/globals.css`, 시각 규칙의 정본은
`docs/DESIGN.md`다.** 초안은 그 값들이 **어디서 왔는지**의 근거로 남는다.

이유 둘:
- **도구가 모든 세션에 있지 않다.** `/design-login`·`DesignSync`는 Claude Code의 특정 세션에만
  있고 Codex 미러·다른 머신에는 없다. 정본이 거기 있으면 **T4가 착수 불가**가 된다.
- **이 리포는 정본이 트리 안에 있어야 한다는 규칙을 이미 쓴다** — 8-2·8-3이 Figma 시안에 대해
  한 것과 같다. 결론은 문서로 올라오고 초안은 근거다.

초안을 읽을 수 있으면 읽는다(문구·정보구조가 더 구체적이다). 못 읽어도 **T2·T3·T4는
§5.5·§6·§7만으로 착수할 수 있어야 한다.**

### 9.1 위치

| | |
|---|---|
| 도구 | **Claude Design** (claude.ai/design) |
| 프로젝트 | `Mal-moi 로그인 디자인` · `b99d54cd-3034-44f1-8446-0a864da9d767` |
| 핸드오프 문서 | `design_handoff_signin_invite_link_account/README.md` — **먼저 읽는다** |
| 아트보드 | `design_handoff_signin_invite_link_account/Signin Invite LinkAccount.dc.html` |
| 프리미티브 시안 | 루트의 **`EntityCard.dc.html`** — 치수의 **근거**다. 정본은 §7 표 (§9.0) |

⚠️ **파일명이 2026-09-12에 바뀌었다** (`Canvas.dc.html` → `Signin Invite LinkAccount.dc.html`,
번들도 `…_merge` → `…_link_account`). 옛 이름을 쓴 참조가 보이면 이 절이 정본이다.

⚠️ **옛 번들 `design_handoff_signin_invite_merge/`는 `assets/`만 남은 껍데기다** — README도
아트보드도 없다. 열지 않는다.

⚠️ **README 자체에 낡은 줄이 둘 있다** — `## About the Design Files`와 `## Files`가 아직
`Signin · Invite · Merge.dc.html`이라는 **없는 파일명**을 가리킨다. 내용은 그대로 유효하고
파일명만 옛것이다.

⚠️ **같은 프로젝트의 나머지 다섯은 이 배송이 아니다** — `malmoi Screen Concept.dc.html` ·
`AppShell.dc.html` · `Design System.dc.html` · `Meter.dc.html` · `Stat.dc.html`. 열지 않는다.

### 9.2 읽는 법

```
1. /design-login          ← 세션마다 필요할 수 있다. 안 하면 아래 에러가 난다:
                            "DesignSync needs design-system authorization."
2. DesignSync method=get_file
     projectId=b99d54cd-3034-44f1-8446-0a864da9d767
     path=design_handoff_signin_invite_link_account/README.md
3. 같은 방식으로 path="design_handoff_signin_invite_link_account/Signin Invite LinkAccount.dc.html"
   (경로에 공백이 있다 — 따옴표로 감싼다)
```

⚠️ **아트보드는 54KB라 tool 결과가 컨텍스트에 안 들어오고 파일로 저장된다.** 저장 경로가
결과에 찍히니 거기서 필요한 아트보드만 잘라 읽는다 — 통째로 펼치지 않는다.

⚠️ **루트에도 같은 이름의 아트보드가 있다.** 어느 쪽을 읽어도 되지만 **문서·태스크는 번들
경로를 쓴다** — README와 같은 디렉터리에 있어야 둘이 갈리지 않는다. 경로에 **공백이 있으므로
따옴표로 감싼다.**

⚠️ **`malmoi Screen Concept.dc.html`은 이 배송이 아니다.** 같은 프로젝트에 있는 별개 초안이니
열지 않는다.

### 9.3 아트보드 ↔ 태스크

| 아트보드 | 화면 | 태스크 | 상태 |
|---|---|---|---|
| `#1a` | `/signin` | — | **변경 없음.** 재현 확인용으로만 본다 |
| `#1b` | `/invite/[token]` | T4 | 제목·`EntityCard`가 붙는다 (§6) |
| `#1c` | `/signin/link/[challenge]` | T2 골격 → T4 카드 | **새 화면** (§5.5) |
| `#1c` 아래 상태 둘 | 확인 대기 · 확인 실패 | T3 | 320 컬럼만 갈린다 |
| 마지막 절 | `EntityCard` 규격 | T4 | §7. ⚠️ **시안의 `kind="project"`는 안 만든다** (⑩) |
| (별도 파일) | `EntityCard.dc.html` | T4 | 치수의 **근거** — 정본은 §7 표 (§9.0) |

**각 아트보드 옆 열이 결정과 사유다** — 치수만 베끼고 그 열을 안 읽으면 "왜 카드가 버튼 위인가"
같은 판정이 구현에서 뒤집힌다.

### 9.4 ⚠️ 옮겨 붙이지 않는다

Canvas는 **HTML로 만든 디자인 참조**이고 프로덕션 코드가 아니다. 구체적으로 그대로 쓸 수 없는 것:

- **CDN 로드** — `cdn.jsdelivr.net`의 Pretendard, `unpkg.com`의 lucide UMD. 이 리포는 폰트를
  자사 호스트(`public/fonts/`)에서, 아이콘을 `lucide-react`에서 가져온다.
- **`support.js`** — Claude Design 캔버스 런타임이다. 리포에 들어올 것이 아니다.
- **인라인 `style` 속성과 raw hex** — 값의 정본은 `app/globals.css`의 `@theme`/`:root`다.
  `#e9eaec` 같은 값을 옮기지 말고 `bg-canvas`를 쓴다(§9.5 표).
- **`assets/`** — 프로토타입이 쓰려고 만든 **사본**이다. 리포에 이미 다 있다:
  로고 `public/brand/malmoi-icon-black.svg` · KV `public/brand/malmoi-kv-1..4.png` ·
  국기 `public/flags/<id>.svg`(`lib/keys/flag.ts`의 `flagFor`) ·
  provider 마크 `components/signin/brand-icons.tsx`.

**가져오는 것은 레이아웃·정보구조·치수·문구이고, 색과 컴포넌트는 기존 토큰·프리미티브로 번역한다**
— 8-2·8-3이 Figma 시안에 대해 한 것과 같다.

### 9.5 토큰 대응 (핸드오프 README의 표)

⚠️ **하드코딩하지 말고 기존 토큰을 쓴다.** `tailwind.config.js`는 없다.

| 쓰임 | 유틸 / 토큰 |
|---|---|
| 캔버스(패널 바깥) | `bg-canvas` |
| 흰 패널 | `bg-white` + `border-border-subtle` + `rounded-xl` + `shadow-low` |
| 본문 / 보조 글자 | `text-foreground` / `text-muted-foreground` |
| 선 | `border-border` (연한 쪽 `border-border-subtle`) |
| 채움 버튼 | `bg-primary text-primary-foreground` — ⚠️ `--foreground`가 아니다 |
| 위험 | `text-destructive` / `border-destructive/40` — **배경으로 쓰지 않는다** |
| 장식 그라데이션 | `from-auth-hero-from to-auth-hero-to` |
| 도트 색 | `--signin-dot` — ⚠️ **CSS 변수이고 유틸 클래스가 없다**(`--mono-size`도 같다). `bg-signin-dot`을 쓰려 하면 조용히 무시된다 |

### 9.6 치수

- 뷰포트 **1440×900**. `min-w-[1280px]` 그대로, 반응형 분기 **0**.
- 셸 밖 골격: 바깥 padding **8** · 탭 간 gap **8** · `grid-cols-2` (`AuthLayout`이 이미 그렇다).
- 폼 컬럼 **320** · `gap-4`(16)가 컬럼의 유일한 간격. 컨트롤 스택 안만 `gap-2`(8).
- 컨트롤 `size="lg"` → **h-10 rounded-lg px-4** (셸 밖 전용).
- 우측 장식 `p-20`(80) · KV `max-w-[768px]`. (그대로)
- weight는 **400·500 둘뿐**. `text-3xl`은 우측 장식 두 줄에서만.
- `--text-xs` 12 → 13px는 **이미 반영됐다**(`10ce111`). ⚠️ `--mono-size`와 같은 값이 됐고,
  그 판정은 **8-P**에서 한다 — 이 배송이 아니다.

## 10. 스키마

**변경 없음.** `Account`는 이미 한 `User`가 여러 행을 가질 수 있고(`github-app`이 이미 두 번째
행이다), challenge는 `VerificationToken`을 목적 접두로 재사용한다.
→ `/db` 불필요, `db:deploy` 불필요.

## 11. 새 환경변수

**없다.** challenge는 난수 원문을 URL에 싣고 DB엔 `hashInviteToken`의 해시만 둔다 — 서명 키가
필요한 자리가 없다.

## 12. 불변식 영향 (ARCHITECTURE §1·§2·§6)

| 불변식 | 영향 |
|---|---|
| export 결정성 (§1) | 없음 |
| blob SHA 두 층 (§2) | 없음 |
| 인증 경계 (§6) | **있다** — `signIn` 콜백에 갈래 둘이 붙는다. `linkAccount` 게이트는 **그대로다**(§5.3) |
| 인증 차단 2층 | **있다** — 새 라우트가 matcher 밖 + 인가 없음이다. `/invite/[token]`과 같은 부류이고 `EXEMPT`·`PUBLIC` 양쪽에 등재한다 (§5.4) |
| 테넌트 좁힘 | **있다 — 사용자 축이다.** "없음"이 아니다: `Account` PK가 `@@id([provider, providerAccountId])`라 **`userId` 없이 남의 행에 닿는다.** `store.ts`의 모든 조회·삭제·해제에 `userId`를 함께 건다 (§13, POSTMORTEM 2026-09-06) |

## 13. POSTMORTEM 소환

- **2026-09-10 재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다** — 이 기능이 밟는 그
  자리다. state 쿠키 이름·salt 분리 · 목적을 쿠키 하나에만 두지 않기 · **정상 확인을 `signIn`
  콜백 안에서 끝내기**가 전부 여기 적용된다. ⚠️ **병합 시작도 `clearRevocationCookies()`를 먼저
  부른다** — 그 항목의 "일반 로그인 둘" 목록이 **셋**이 된다. 역방향(회수 시작이 병합 쿠키를
  지운다)도 같다.
- **2026-09-10 `pnpm test` 2553 green인데 그 스위트는 안 돌아간다** — `postgres.integration.ts`가
  앱 전역 값 여섯을 단언하고 이 배송이 그중 `/account` 쿼리를 늘린다. **트리거는 디렉터리가
  아니라 단언 대상이다** — T3·T6 검증에 명시.
- **2026-09-06 거부가 화면에 닿지 않으면 버튼이 안 눌린 것으로 보인다** — `?link=`·`?e=`의
  생산자와 수신자를 같은 커밋에. `routes`의 `withQuery`를 지나야 `entry-points.test.ts`의
  "쿼리 수신자" 검사에 걸린다.
- **2026-09-06 인가는 지났는데 조회를 그 사용자로 좁히지 않았다** — `store.ts`의 모든 조회·해제에
  `userId`를 건다. `Account` PK가 `(provider, providerAccountId)`라 **그 둘만으로 남의 행을
  지울 수 있다.**
- **2026-09-10 `pnpm test` 2553 green의 더 깊은 판** — `postgres.integration.ts`의 `fakeAuth`는
  프로덕션 `auth.ts`를 import하지 않고 **`signIn` 콜백을 손으로 다시 적는다**(회수만 미러링).
  T3이 프로덕션 콜백에 갈래 둘을 넣어도 **그 스위트는 한 줄도 안 돈다** — 스위트를 돌리는 것과
  그것이 새 코드를 보는 것은 다른 문제다. T3이 그 사본을 같은 커밋에 갱신한다.
- **2026-09-10 Vite가 SVG를 data URI로 인라인한다** — 새 화면이 로고를 import하면
  `vitest.config.ts`의 stub 정규식에 걸리는지 확인한다(이미 `svg` 포함하도록 고쳐져 있다).

## 14. 확인 필요 (구현 중 실물로)

⚠️ **`/feature-review`에서 셋 중 둘이 닫혔다** (⑪) — 배타성은 §3 불변식 8로, `redirectTo`는
불변식 9로 올라갔다. 남은 것은 **실물로만 알 수 있는 하나**다.

1. **두 가로채기의 계약이 실물에서 성립하는가?** 설계는 §3-8에 있다(래핑 순서 · `signIn` 첫 줄 ·
   양방향 쿠키 정리). 실물로 재는 것은 **회수를 중단한 직후 병합을 시작하는 순서** 하나다 —
   T3 회귀 ④가 그것이다.

**닫힌 둘 (근거를 남긴다)**

- **`signIn` 콜백이 문자열을 반환하면 Auth.js가 상대 경로를 origin에 붙인다** — `callback/index.js`가
  `callbacks.redirect`에 넘기고 기본 구현(`init.js`)이 `/`로 시작하는 경로를 `baseUrl`에 붙인다.
  ⚠️ **빈 문자열은 falsy라 `AccessDenied`가 된다** — 절대 빈 문자열을 내지 않는다.
  ⚠️ **그 클램프에 기대지 않는다** — `auth.ts`에 `redirect` 콜백을 정의하는 순간 사라진다(불변식 9).
- **확인 왕복에서 `linkAccount`는 불리지 않는다** — `handle-login.js`가 `getUserByAccount` 뒤
  반환하고, 불일치 갈래는 `handleLoginOrRegister` 자체를 건너뛴다(§5.3). **그래도 T3에서 가장
  먼저 실물로 밟는다** — 라이브러리 버전이 올라가면 조용히 바뀌는 부류다.
