# design — account-connect

## 영향 받는 흐름

push·편집 UI·pull **어디도 아니다.** 닿는 것은 **인증 경계 하나**(ARCHITECTURE §6)이고,
이 기능의 위험은 전부 거기에 모여 있다.

## ⚠️ 가장 큰 위험 — callback 가로채기가 **셋**이 된다

지금 OAuth callback을 가로채는 것이 둘이다(ARCHITECTURE §6.2):

> **두 가로채기의 배타성은 구조가 아니라 순서와 쿠키 정리가 만든다.** `withRevocation`이 **바깥**,
> `withLoginLink`가 **안쪽**이고, 각자 state 쿠키를 **다른 이름·salt**로 쓰며, **시작하는 쪽이
> 상대의 쿠키를 먼저 지운다**(양방향). intent 판정이 각자 쿠키 셋의 OR이라 암호적 결합이 없어서다.

**셋이 되면 지워야 할 자리가 는다.** 하나를 빠뜨리면 "중단한 왕복이 다음 왕복의 callback을 먹고
Location을 덮는" 부류가 돌아온다(POSTMORTEM 2026-09-10 계보).

### 지금 지우는 자리는 **여섯**이다 (실측 — 문서가 "둘"이라 적었던 것은 틀렸다)

| 함수 | 호출처 |
|---|---|
| `clearLinkCookies` | `app/signin/page.tsx:109` · `app/invite/[token]/page.tsx:205` · `app/(edit)/account/actions.ts:26` |
| `clearRevocationCookies` | `app/signin/page.tsx:108` · `app/invite/[token]/page.tsx:204` · `app/signin/link/[challenge]/page.tsx:134` |

⚠️ **`app/(edit)/account/actions.ts`는 병합 시작점이 아니라 회수 시작점이다.** 진짜 병합
시작점(`app/signin/link/[challenge]/page.tsx`)이 부르는 것은 `clearRevocationCookies`다 — 자기
쿠키를 지우면 안 되므로 당연하다. **그중 둘(`/signin`·`/invite/[token]`)은 POSTMORTEM 2026-09-10의
계약을 지고 있는 일반 로그인 진입점이다.**

### 대응 — **인자 없는** `clearAuthRoundtripCookies()`

✅ **`except` 인자를 두지 않는다**(결정 2026-09-13, 사용자). 인자가 있으면 오타·복붙으로 잘못된
값을 넘겼을 때 **타입은 통과하고 쿠키만 안 지워진다** — 조용한 미삭제다.

**지금 코드가 이미 더 나은 형을 쓴다: 지우기와 세우기가 시간순으로 갈려 있다.**
`app/(edit)/account/actions.ts:26`이 `clearLinkCookies()`를 부르고 `:45`에서 자기 쿠키를 세우며,
`app/signin/link/[challenge]/page.tsx:134`가 회수를 지운 뒤 `:139`에서 자기 것을 세운다. 그래서
**`clearAuthRoundtripCookies()`가 셋을 전부 지우고 시작점이 다음 줄에서 자기 것을 세운다** —
"빠뜨린 쌍"이라는 실패 모드 자체가 사라진다.

**소스 스캐너가 "왕복 시작점이 전부 그 함수를 지나는가"를 센다.** 순서 단언은
`lib/login-link/__tests__/exclusive.test.ts:15-24`가 이미 쓰는 **소스 인덱스 비교**(`clear…` <
`set…`)를 그대로 쓴다.

⚠️ **이것이 이 기능에서 제일 먼저 서야 하는 것이다** — 버튼보다 앞이다.

## ⚠️ state 쿠키 이름·salt 분리 — **이 기능의 유일한 암호적 분리**

POSTMORTEM 2026-09-10의 **실제 수정이 이것이다**: *"최종 구현은 Auth.js state 쿠키 이름과 암호화
salt를 일반 로그인과 분리한다. state를 제거하거나 일반 이름으로 바꿔도 로그인 쓰기 전에 검증이
실패한다."* 코드가 두 벌로 구현해 뒀다:

| 왕복 | state 쿠키 | 주입 | 읽는 곳 |
|---|---|---|---|
| 병합 | `__Secure-malmoi-link-state` (`lib/login-link/policy.ts:214`) | `withLinkStart` (`lib/login-link/http.ts:26`) | `auth.ts:92` |
| 회수 | `__Secure-malmoi-revocation-state` (`lib/session-revocation/policy.ts:69`) | `withRevocationStart` (`lib/session-revocation/http.ts:13`) | `auth.ts:92` |

**세 번째도 자기 이름·salt를 갖는다**: `connectStateCookie` · `withConnectStart` ·
`connectAuthCookies()`. 그리고 **`auth.ts:92`의 `cookies: revocationAuthCookies() ?? linkAuthCookies()`가
`??` 3단이 된다** — 거기를 빠뜨리면 Auth.js가 연결 왕복의 state를 **일반 이름**으로 쓰고, 그 순간
분리가 통째로 무너진다(그 줄의 주석이 *"둘은 배타적이라 `??`로 충분하다"*라고 적혀 있다).

intent 판정은 여전히 쿠키 OR이라 암호적 결합이 없다 — **분리를 만드는 것은 이름·salt 하나뿐이다.**

## 가로채기 자리 — **가운데**다

✅ `withRevocation( withConnect( withLoginLink(…) ) )`. 근거 셋:

1. **`withLoginLink`만 `run(request)`로 요청을 다시 넘긴다**(`lib/login-link/http.ts:97`,
   `withoutSessionCookie`는 `:77`). 세션 쿠키를 떼어낸 복사본을 NextAuth에 주는 것이 그 래퍼의 존재
   이유라 **안쪽 자리는 이미 임자가 있다.**
2. **연결 왕복은 세션이 살아 있어야 한다** — 그 복사본 아래로 들어가면 안 된다.
3. **연결은 회수처럼 언제나 왕복을 멈춘다**(`Account`를 우리가 직접 쓰고 303으로 `/account`에
   착지). 통과시키는 `withLoginLink`보다 앞에서 갈라져야 한다.

⚠️ **이 변경은 `lib/auth/__tests__/provider-config.test.ts`를 즉시 red로 만든다** — `:86-87`이 중첩
순서를 정규식으로, `:100`이 `/revocationAuthCookies\(\)\s*\?\?\s*linkAuthCookies\(\)/`를 고정한다.

## challenge — `lib/login-link`를 **재사용하지 않는다**

**같은 관용구를 쓰되 다른 접두다.** `VerificationToken`을 목적 접두로 나눠 쓰는 것이 이 리포의
관용구이고(`session-revocation`·`login-link` 둘이 이미 그렇다), 접두가 갈려 있어 **두 목적의
요청이 서로를 소비하지 않는다.** 여기는 세 번째 접두다. `challengePrefix`가
`JSON.stringify([...]).slice(0,-1) + ","`로 **닫는 괄호를 떼고 쉼표를 붙여** `startsWith` 조회의
접두 충돌을 막으므로 세 번째 목적 문자열이 안전하게 공존한다.

⚠️ **`lib/login-link`의 challenge를 그대로 들고 오지 않는 이유**: 그쪽은 세션이 **없는** 흐름이고,
challenge가 담는 것이 다르다 — 거기는 *"누구를 인증시킬 것인가"*(아직 로그인 안 된 사람에게 기존
계정을 증명시킨다)이고 여기는 *"누구에게 붙일 것인가"*(이미 로그인된 `userId`가 주어져 있다).
같은 타입에 두 의미를 담으면 어느 쪽 불변식인지가 흐려진다.

### ⚠️ 형은 `login-link`가 아니라 **`session-revocation`을 따른다**

`lib/login-link/policy.ts:5-9`가 이 판단을 이미 적어 뒀다:

> *"`lib/session-revocation/policy.ts`와 형은 같지만 증명이 다르다. **그쪽은 살아 있는 세션이
> 인가를 대신하므로 `sessionDigest`·`stateDigest`를 challenge에 담아 왕복을 묶어야 한다.** 여기는
> 세션이 없다."*

account-connect는 **세션이 있는 쪽**이다(spec 완료 조건 2). 따라서 담는 것:

`userId` · 붙일 `provider` · 현재 세션의 `emailLookup` · **`sessionDigest`** · **`stateDigest`** ·
만료. **원문 이메일은 안 담는다** — 대조는 HMAC 조회값으로 한다(`lib/credentials/storage.ts`의
`lookupEmail(email)`, scope `"user"`. 하부는 `lib/credentials/crypto.ts:58`의 `emailLookup`).

구현 참조는 `app/(edit)/account/actions.ts:40-43` — signIn URL에서 `state`를 뽑아 `beginRevocation`에
넘긴다.

### ⚠️ ARCHITECTURE §6.4(HMAC state)를 쓰지 않는 이유

§6.4가 **정확히 같은 모양**(로그인된 사용자 → 남의 사이트 왕복 → 복귀)을 `AUTH_SECRET` HMAC + 용도
라벨 + nonce 대조 + 10분으로 이미 풀어 뒀다. 그럼에도 DB 행을 쓰는 이유는 **단일 사용의
원자성** 하나다 — 서명 payload만으로는 리플레이를 10분 창 안에서 막을 수 없고, 기존 두 왕복이
전부 DB를 쓰는 것도 같은 이유다. 소비는 `finishLink`의 관용구를 따른다: **조건부 `deleteMany`의
count로 강제하고 성공만 소비한다.**

### 동시 시작 — 마지막 것만 산다

시작 시 `deleteMany({ identifier: { startsWith: challengePrefix(userId) } })`로 **그 사용자의 이전
연결 challenge를 지운다**(기존 두 store의 관용구 그대로). ✅ **의도된 동작이다**(결정 2026-09-13,
사용자) — 세 왕복이 한 규칙을 공유하는 쪽이 낫다. **대가**: 두 탭에서 시작하면 첫 탭이 돌아왔을 때
`expired`를 보는데 사용자는 만료시킨 적이 없다. 그래서 **그 문구가 "다시 시도"를 안내한다.**

## `Account` 쓰기 — Auth.js를 지나지 않는다

⚠️ **`linkAccount`의 거부를 완화하지 않는다.** 그 게이트는 `lib/auth/safe-adapter.ts:57-68`이고 둘을
거부한다(비로그인 provider · 기존 로그인 Account 존재). Auth.js 콜백을 지나는 **모든** 로그인에 걸린
방어선이라 예외 구멍을 뚫으면 sec-audit-2 #31이 막은 모양이 그대로 돌아온다. `finishLink`가 이미
같은 방식으로 옆문을 낸 선례다.

대신 셋을 다 통과한 뒤 **우리 코드가 직접 쓴다**:

- `User` 행을 **잠근 뒤** 판정하고 쓴다. ⚠️ **`lockUser`가 둘이다** — export된 것은
  `lib/login-link/store.ts:40` 하나이고 `lib/session-revocation/store.ts:8`은 비export 사본이다.
  **이 기능은 세 번째 사본을 뜬다** — `lib/login-link`에서 import하면 "재사용하지 않는다"는 위
  절과 어긋나고, 공통 모듈로 올리는 것은 이 기능이 요청받지 않은 리팩터다.
- 쓰는 것은 **식별자 네 필드뿐**이다 — OAuth 토큰을 남기지 않는 것은 기존 경로와 같다.
- `upsert`가 아니라 `create` + P2002 재조회다. ⚠️ **`upsert`는 동시 요청이 `userId`를 덮어써
  소유권이 이동할 수 있다**(ARCHITECTURE §6.2.1). **어떤 update도 `userId`를 인자에 넣지 않는다.**
- ⚠️ **`taken-by-other` 판정이 쓰기보다 앞이다.**

⚠️ **`account.create` 호출자가 셋에서 넷이 된다.** `lib/login-link/__tests__/exclusive.test.ts:46`이
`["lib/login-link/store.ts", "lib/auth/safe-adapter.ts", "app/api/github/callback/route.ts"]`를 소스
스캔으로 단언하고, `:40-45` 주석이 *"넷째가 생기면 '로그인 수단은 User당 하나'의 예외가 **문서
없이** 하나 더 생긴 것이다"*라고 못 박았다. **그 목록에 넷째를 등재하는 것이 이 기능의 산출물이고,
근거를 ARCHITECTURE §6.2에 적는다.**

## 순수 함수로 분리 가능한 부분 → `/tdd` 진입점

⚠️ **파일은 `lib/account-connect/plan.ts`다.** `lib/login-link/`가 `policy.ts`(상수·URL·쿠키)와
`plan.ts`(판정)를 이미 갈라 쓴다. 그리고 **`policy.ts`에 해시를 넣지 않는다** —
`components/account/login-methods.tsx:1`이 `"use client"`라 `node:crypto`가 번들에 끌려와
`client-graph.test.ts`가 red다(`lib/login-link/policy.ts:11-14`에 그 실측이 기록돼 있다). 해시는
`store.ts`다.

| 함수 | 무엇을 판정하나 |
|---|---|
| `planLoginMethodLink({ challenge, sessionUserId, providerLookup, existing, state, sessionToken, now })` | 붙일지 거부할지 |
| `connectChallengeIdentifier({ userId, provider, emailLookup, sessionDigest, stateDigest })` | 세 번째 접두의 식별자를 만든다 (기존 둘처럼 전 필드를 실어 직렬화한다) |
| `connectOutcome(...)` → `?connect=` 값 | 착지 갈래. **새 union이다** |
| `isUnlinkOutcome(raw)` | 기존 `?link=`의 화이트리스트 게이트 (아래 §) |
| `clearAuthRoundtripCookies()` | 위 §가장 큰 위험의 대응. 지워야 할 자리를 한 곳에 모은다 |

⚠️ **이름이 `planConnect`가 아니다** — 이 리포에서 "connect"는 이미 GitHub App 연결을 뜻하고
`planConnectRepo`·`planConnectionHealth`가 그 축에 있다.

⚠️ **이메일 원문을 받지 않는다** — 받으면 그 값이 로그·에러에 섞여 나갈 자리가 생긴다. 받는 것은
HMAC 조회값 둘이다. `lib/login-link/__tests__/view-contract.test.ts`가 같은 축(`ChallengeView`에
원문 이메일 부재)을 이미 소스 스캐너로 세고 있어 고정할 자리가 준비돼 있다.

⚠️ **인자가 판정을 전부 덮어야 한다**: `expired`는 `now`와 challenge의 만료가 있어야 나오고,
`already-connected`(= `existing.userId`가 내 것)와 `taken-by-other`(= 남의 것)의 **차이가 정확히
`sessionUserId`와의 비교**다. 비교 대상: `lib/session-revocation/policy.ts:43`의
`checkChallenge(c, { provider, providerAccountId, sessionToken, state, expires, now })`.

## 착지 어휘 — `?connect=` 새 키

✅ **`?link=`를 재사용하지 않고 `LinkOutcome`에도 더하지 않는다**(결정 2026-09-13, 사용자).

- `LinkOutcome`(`lib/login-link/policy.ts:150`, 7멤버)의 유일한 소비자는 `failureUrl`(`:171-182`)이고
  그 함수는 `expired`/`invalid`/`linked`/토큰없음을 `/signin?error=LinkExpired`로, **나머지 전부를
  `/signin/link/<challenge>?e=`로** 보낸다. 새 멤버는 그 기본 갈래로 떨어져 spec §3이 금지한 병합
  화면에 착지한다. 게다가 `expired`는 **이미 있고 뜻이 다르다**(병합 challenge 만료 vs 연결
  challenge 만료).
- `/account?link=`가 실제로 무는 값은 `disconnected`·`last-method`·`unavailable` 셋이고 **union
  타입이 없다** — `lib/routes.ts:110-113`. 즉 design이 말한 "기존 `?link=` 계약"은 **연결이 아니라
  해제의 계약**이었다.

union 멤버 (판정 넷 + 왕복 실패 + 성공):

| 값 | 무엇 |
|---|---|
| `connected` | 성공 |
| `email-mismatch` | 세션 이메일과 새 provider의 검증 이메일이 다르다 |
| `already-connected` | 그 provider가 이미 내 것으로 붙어 있다 |
| `taken-by-other` | 그 provider 계정이 다른 `User`의 것이다 |
| `expired` | challenge가 만료됐거나 다른 창이 대체했다 |
| `cancelled` | provider 화면에서 취소했다 (`?error=access_denied`를 접는다) |
| `unverified` | provider가 검증된 이메일을 주지 않았다 (GitHub private email 포함) |
| `wrong-user` | 왕복 도중 세션이 다른 사용자로 바뀌었다 |
| `failed` | state 불일치·토큰 교환 실패 등 나머지 |

문구는 `m.errors.connectMethod` **별도 절**이다. 공유 중인 `m.errors.link`에 더하면
`already-connected`↔`already-linked`, `expired`↔`invalid`가 같은 사전에 나란히 서고,
`taken-by-other`는 `lib/github-connect/message.ts:16`의 `ConnectError`에 **이미 있어** 같은 화면이
`?e=`로 읽는다.

### ⚠️ 문구 원칙 — 신원 0 + 다음 행동 1

`planLoginMethodLink`에 이메일 원문을 안 넘기는 이유가 "로그·에러에 섞여 나갈 자리"인데, **같은
규칙이 화면 문구에도 선다**:

- `taken-by-other` — **누구인지(이메일·이름·마스킹값·아바타)를 절대 싣지 않는다.** 요청자는 OAuth로
  그 provider 계정 소유를 증명한 뒤이므로 "내 계정이 다른 말모이 계정에 붙어 있다"는 사실상 자기
  정보이고 이메일 열거 공격이 되지 않는다 — 하지만 상대의 신원은 다른 축이다.
- `email-mismatch` — **양쪽 주소를 화면에 찍지 않는다.**
- 사유마다 **출구가 하나** 있다. 초대 화면의 `wrong-account`가 그 기준선이다(DESIGN §초대 수락).

### 기존 `?link=`의 화이트리스트 게이트도 같이 세운다

✅ 결정 2026-09-13(사용자). design이 *"`?link=`는 판정 함수로 거른다. 모르는 값은 무시한다"*라고
적었던 것은 **현재 상태의 서술이 아니라 아직 안 된 일이다.** `app/(edit)/account/page.tsx:49`의
가드는 `link === undefined || link === "disconnected"` 둘뿐이고 `linkErrorMessage`
(`lib/login-link/message.ts:13`)는 사전에 없는 값에 fallback 문구를 낸다. 실측:

| URL | 지금 화면 |
|---|---|
| `/account?link=nope` | danger Alert (fallback) |
| `/account?link=wrong-account` | danger Alert **"That's a different account…"** — 해제 흐름에서 절대 못 나오는 **병합 흐름 문구** |

이웃 슬롯 둘은 게이트가 있다 — `?e=`는 `isConnectError`의 Set 멤버십, `?sessionRevocation=`은 닫힌
삼항 체인 + `ui.test.tsx`가 `"revoked"`·`"__proto__"`로 고정. **`isConnectError`가 이 리포 자신의
선례다.** 새 슬롯을 옆에 파면서 옆 슬롯이 뚫린 채로 두면 다음 사람이 그것을 선례로 본다.

## 화면

- **사유·성공 Alert는 Sign-in methods 카드 안의 in-block이다**(spec 완료 조건 3·6). `Alert
  variant="danger"` / 성공은 그 짝을 쓴다. **새 raw 색도 새 토큰도 없다** — `Alert`가
  `border-destructive/40 bg-background text-destructive` + `CircleX`를 이미 든다. `dark:` 0곳,
  mono 표면 무관이라 **DESIGN §6.2 등재 불필요**. `role="alert"`도 `Alert` 프리미티브가 `danger`에
  자동 부여한다.
- ⚠️ **pending은 행별로 가른다.** `LoginMethods`의 `useTransition`은 **목록 전체가 하나를
  공유한다** — 지금은 해제가 한 번에 하나라 안 보이지만, 두 행이 다 눌릴 수 있게 되면 GitHub을
  눌렀을 때 Google 행 스피너까지 돈다.
- 버튼은 `<a>`가 아니라 `<button>`이다(OAuth 시작이 `redirect()`를 던지는 Server Action). ⚠️
  **`useTransition`으로 감싸지 않는다** — `components/github-account.tsx`의 `ConnectForm` 주석이
  *"`useTransition`으로 감싸면 응답이 돌아오지 않는다"*는 실측을 남겨 뒀다. `<form action>`이다.
- **시각 형은 임시로 같은 행 [Disconnect]와 같다**(`Button variant="ghost"`, size 기본).
  `account-settings`의 4번(리스트 재편)에서 함께 옮긴다. ⚠️ **그 핸드오프의 예외 아트보드에 연결
  거부 갈래가 없다** — 시안이 이 갈래를 안 그렸다.

## 스키마 변경

**없다.** `VerificationToken`은 `@@unique([identifier, token])`만 있고 이미 두 목적을 접두로
멀티플렉싱한다(`prisma/schema.prisma:444-450`). `Account`도 그대로 쓴다 —
`@@id([provider, providerAccountId])`, 별도 `id` 컬럼 없음(`:427`). **마이그레이션 순서 판정
(`/db`·`db:deploy`) 해당 없음.**

## 새 환경변수

**없다.** 같은 OAuth App 자격증명을 쓴다(`AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`이 `.env.example:72-73`에
이미 있다. `.env.example` 갱신 불필요). ⚠️ **GitHub 자격증명 셋의 경계를 넘지 않는다**: 이 경로가
쓰는 것은 **로그인용 OAuth App 토큰**이고, 연결용 GitHub App도 설치 토큰도 아니다.

⚠️ **`lib/github-connect/__tests__/credential-separation.test.ts`가 이것을 자동으로 세지 않는다.**
그 테스트의 스캔 루트는 `lib/github-connect/` · `lib/github.ts` · `lib/onboarding/` 셋이고(`:75-84`),
같은 파일 `:77-81` 주석이 *"여기에 루트를 더하지 않으면 이 방어선이 새 디렉터리를 자동으로 덮지
않는다"*고 경고한다. **`lib/account-connect/`를 스캔 루트에 더한다.**

## 불변식 영향

- **§0 불변식 7**(로그인 provider가 아니라 `ProjectMember`가 권한을 결정한다) — **강화된다.**
  수단이 하나 늘어도 열리는 것은 없다.
- **인증 경계(§6)** — 직접 건드린다. 위의 네 절이 그 계약이다.
- **§0 불변식 5**(`projectId`로 좁힌다) — 해당 없다. 이 축은 `userId`다.
  ⚠️ 단 **`Account` PK가 `(provider, providerAccountId)`라 그 둘만으로 남의 행에 닿는다** —
  모든 조회·삭제에 `userId`를 함께 건다(POSTMORTEM 2026-09-06). **예외는 `taken-by-other` 판정
  하나**이고, 그 회고가 그 예외를 이미 인정한다.
- **§0 불변식 9** — 완료 조건 6의 ⚠️(`revalidatePath`가 결과 Alert를 언마운트).

## 엣지 케이스 — 설계가 답을 갖는 것들

| 갈래 | 답 |
|---|---|
| 왕복 중 다른 사용자로 로그인 | challenge의 `sessionDigest`가 안 맞아 `wrong-user`. 그래서 challenge가 세션에 묶여야 한다 |
| 두 탭 동시 시작 | 마지막 것만 산다 (위 §동시 시작). 첫 탭은 `expired` |
| 이미 연결된 provider에 직접 POST | **시작 시점에 거부한다** — 버튼은 안 보이지만 Server Action은 직접 호출 가능하다. 사용자를 provider로 내보냈다가 돌아와서 거부하지 않는다 |
| 왕복 중 세션 만료·로그아웃 | 착지 `/account`에서 `requireUser`가 `/signin`으로 보내 **결과 문구가 통째로 사라진다**(POSTMORTEM 2026-09-06 "사유를 실어 보내놓고 안 읽으면 무음"). ⚠️ **이 갈래는 안 푼다** — 푸는 비용이 로그인 리다이렉트에 사유를 태우는 배선이고, 세션이 만료된 사용자는 다시 로그인해서 행을 보면 결과를 안다. design의 명시적 지식으로 남긴다 |
| challenge 재사용 | 조건부 `deleteMany`의 count로 강제. 성공만 소비한다 |
| `authjs.callback-url` 폴백 | ⚠️ 회수 가로채기의 intent는 **세 갈래**다(nonce 쿠키 ∨ state 쿠키 ∨ `callback-url`이 `/account?sessionRevocation=expired`와 일치 — `lib/session-revocation/http.ts:36-45`). 쿠키를 다 지워도 `callback-url`이 남아 있으면 회수 intent가 켜진다. **연결 왕복은 `callback-url` 폴백을 두지 않는다** — 쿠키 둘(nonce·state)만 본다 |
| provider가 검증 이메일을 안 줌 | `unverified`. `null` 판정은 `planLoginMethodLink` 앞 층이 아니라 그 함수가 든다(`providerLookup: string \| null`) |

## POSTMORTEM에서 소환한 것

- **2026-09-06 — `userId` 없는 `Account` 조회.** 위 불변식 절.
- **2026-09-06 — 사유를 실어 보내놓고 안 읽으면 무음이다.** 새 `?connect=` 어휘를 더하면서 **읽는
  쪽을 같은 커밋에** 넣는다.
- **2026-09-07 — `revalidatePath`가 결과 Alert를 언마운트한다.** 완료 조건 6.
- **2026-09-08 — 주소창 값을 캐스팅하면 프로토타입 키가 화면을 죽인다.** `?connect=`는 판정
  함수로 거르고, **뚫려 있는 `?link=`도 같이 막는다**(위 §).
- **2026-09-10 — 버려진 왕복이 다음 callback을 먹는다 / 목적 표식이 사라진 callback이 일반 가입을
  실행했다.** 위 §가장 큰 위험 + §state 쿠키 이름·salt 분리. **그 회고가 도달한 대응은 쿠키 정리가
  아니라 이름·salt 분리였다.**
- **2026-09-12 — `withLoginLink`의 500은 실물 왕복만 잡았다.** *"인증 경로에 그런 코드를 넣으면
  실물 왕복을 한 번 밟기 전에는 green을 믿지 않는다."* 태스크 7이 그것이다.

## 알면서 지는 대가

- **연결 성공은 `planEmailRefresh`를 영구히 `keep`으로 만든다** — 그 사용자의 이메일이 provider를
  안 따라간다(PRODUCT §4.3 ④). 지금까지는 병합 흐름을 탄 사람만 그 상태였는데 이 기능은 **버튼
  하나로** 들여보낸다. ✅ **고지도 확인 Dialog도 두지 않는다**(결정 2026-09-13, 사용자).
- **세션이 기존 수단의 소유 증명을 대신한다** — spec 완료 조건 2의 ⚠️.
- **세션 만료 중 왕복의 결과 문구가 사라진다** — 위 엣지 케이스 표.
