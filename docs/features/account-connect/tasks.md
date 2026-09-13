# tasks — account-connect

⚠️ **1번이 버튼보다 앞이다.** 가로채기 셋의 배타성이 서기 전에 세 번째 왕복을 열면, 그 순간부터
"중단한 왕복이 남의 callback을 먹는" 부류가 실재한다.

⚠️ **순서가 "순수 함수 → 껍데기 → UI"의 예외다.** 1번이 만드는 `clearAuthRoundtripCookies()`는
`server-only` + `next/headers`를 드는 **껍데기**이지 순수 함수가 아니다. 그럼에도 2번(판정 순수
함수)보다 앞인 것은 **위험이 층 순서를 이기기 때문**이다 — 세 번째 왕복을 열기 전에 배타성이 서야
한다.

---

## 1. 왕복 쿠키 정리를 한 자리로 접는다 — `/tdd interface`

인자 없는 `clearAuthRoundtripCookies()` 하나가 회수·병합·연결 셋의 쿠키를 **전부** 지우고,
시작점은 그 다음 줄에서 자기 쿠키를 세운다(`except` 인자를 두지 않는 이유는 design §대응).

⚠️ **접을 자리는 둘이 아니라 여섯이다** (실측):

| 함수 | 호출처 |
|---|---|
| `clearLinkCookies` | `app/signin/page.tsx:109` · `app/invite/[token]/page.tsx:205` · `app/(edit)/account/actions.ts:26` |
| `clearRevocationCookies` | `app/signin/page.tsx:108` · `app/invite/[token]/page.tsx:204` · `app/signin/link/[challenge]/page.tsx:134` |

⚠️ **`app/(edit)/account/actions.ts`는 회수 시작점이지 병합 시작점이 아니다.** 병합 시작점
(`app/signin/link/[challenge]/page.tsx`)이 부르는 것은 `clearRevocationCookies`다. **`/signin`과
`/invite/[token]` 둘을 빠뜨리면 이 태스크가 막겠다는 바로 그 버그를 만든다** — 그 둘은 POSTMORTEM
2026-09-10 #5의 계약을 지고 있는 일반 로그인 진입점이다.

**그리고 소스 스캐너가 "왕복 시작점이 전부 그 함수를 지나는가"를 센다.** 순서 단언은
`lib/login-link/__tests__/exclusive.test.ts:15-24`가 이미 쓰는 소스 인덱스 비교(`clear…` < `set…`)를
그대로 쓴다.

⚠️ **이 시점에 연결 쿠키 팩토리는 아직 없다.** 여기서 접는 것은 **둘**이고 스캐너도 둘을 센다.
**셋째 쌍을 목록에 더하고 스캐너를 셋으로 넓히는 것은 4번의 일이다** — 그 사실을 양쪽에 적어야
4번에서 쿠키 추가를 빠뜨려도 green인 상태가 안 생긴다.

⚠️ **스캐너를 만들었으면 일부러 깨뜨려 red를 확인한다** — 매칭이 0인 스캐너는 장식이다.

**검증**:
- `pnpm test` green + 시작점 하나에서 호출을 지우면 red.
- ⚠️ **`lib/session-revocation/__tests__/normal-login.test.tsx`의 `cleared` 테이블이 그대로
  통과해야 한다.** 리포에서 **유일하게 쿠키 삭제를 행동으로 단언**하는 파일이다(`maxAge: 0` 단언이
  전 리포에 `:62` 하나뿐). 진입점 3 × 쿠키 이름 8개가 `REVOCATION`/`LINK` 테이블로 박혀 있고 `set`이
  `signIn`보다 먼저 불린 것을 `invocationCallOrder`로 잰다.
- ⚠️ **`pnpm test:credentials:postgres`를 손으로 돈다.** `pnpm test`의 include 밖이다.
  `lib/credentials/__tests__/postgres.integration.ts`가 무는 것: `malmoi-link-state=` /
  `malmoi-login-link=` 쿠키 이름(607·701·714행) · **회수 중단 직후 병합이 자기 callback을 받는지**
  (726–736행 — 이 태스크가 바꾸는 바로 그 배타성) · `/account?sessionRevocation=` 착지 둘(485·489행).
  POSTMORTEM 2026-09-10 #6의 규칙이 *"트리거는 어느 디렉터리를 건드렸나가 아니라 **무엇을
  단언하나**로 쓴다"*이고, 이 배송이 그것을 정면으로 밟는다.

*커밋 경계* — `refactor(auth): fold roundtrip cookie clearing into one gate`

---

## 2. 판정 순수 함수 — `/tdd interface`

`lib/account-connect/plan.ts`에 `planLoginMethodLink` · `connectChallengeIdentifier` ·
`connectOutcome` · **`isUnlinkOutcome`**.

⚠️ **파일이 `policy.ts`가 아니라 `plan.ts`다** — `lib/login-link/`가 이미 그렇게 가른다. 그리고
**`policy.ts`에 해시를 넣지 않는다**(`login-methods.tsx`가 `"use client"`라 `node:crypto`가 번들에
끌려와 `client-graph.test.ts`가 red다). 해시는 3번의 `store.ts`다.

⚠️ **`LinkOutcome`에 더하지 않는다.** 그 union의 유일한 소비자 `failureUrl`이 새 멤버를
`/signin/link/<challenge>?e=`로 보내고, 그것이 spec 완료 조건 3이 금지한 착지다.
**`?connect=` 새 union이다** (멤버 아홉 — design §착지 어휘).

⚠️ **시그니처가 판정을 전부 덮어야 한다**:
`planLoginMethodLink({ challenge, sessionUserId, providerLookup, existing, state, sessionToken, now })`.
`expired`는 `now`가 있어야 나오고, `already-connected`와 `taken-by-other`의 **차이가 정확히
`sessionUserId`와의 비교**다. `providerLookup`은 `string | null`이고 `null`이면 `unverified`다.

⚠️ **이메일 원문을 안 받는다** — HMAC 조회값 둘이다
(`lib/credentials/storage.ts`의 `lookupEmail(email)`, scope `"user"`).

⚠️ **`isUnlinkOutcome`도 여기서 만든다** — 기존 `?link=`에 화이트리스트 게이트가 **없다**.
실측으로 `/account?link=wrong-account`가 해제 흐름에서 나올 수 없는 **병합 문구**를 띄운다.
`isConnectError`(Set 멤버십)가 이 리포 자신의 선례다.

**검증**: `pnpm test` green. 사유 아홉이 각각 red → green. `isUnlinkOutcome`은 `"nope"`·
`"wrong-account"`·`"__proto__"`가 전부 거부되는 것을 센다(`ui.test.tsx`의 관용구).

*커밋 경계* — `test: pin the login-method link predicates`

---

## 3. challenge 껍데기

`lib/account-connect/store.ts` — `VerificationToken`의 **세 번째 접두**.

⚠️ **담는 것이 여섯이다**: `userId` · `provider` · `emailLookup` · **`sessionDigest`** ·
**`stateDigest`** · 만료. `lib/login-link/policy.ts:5-9`가 이 판단을 이미 적어 뒀다 — *"세션이 인가를
대신하는 쪽은 `sessionDigest`·`stateDigest`를 challenge에 담아 왕복을 묶어야 한다"*. 구현 참조는
`app/(edit)/account/actions.ts:40-43`(signIn URL에서 `state`를 뽑아 넘긴다).

⚠️ **`lockUser`는 세 번째 사본을 뜬다.** export된 것은 `lib/login-link/store.ts:40` 하나이고
`lib/session-revocation/store.ts:8`이 이미 비export 사본이다 — 그 관용구를 따른다.

⚠️ **모든 조회·삭제에 `userId`를 건다.**

⚠️ **소비는 조건부 `deleteMany`의 count로 강제하고 성공만 소비한다**(`finishLink`의 관용구).

⚠️ **시작 시 그 사용자의 이전 연결 challenge를 지운다** — 두 탭 동시 시작에서 마지막 것만 산다
(design §동시 시작. 의도된 동작이고 첫 탭은 `expired`를 본다).

**검증**: `pnpm test` green — ① 접두가 다른 두 목적의 토큰을 서로 소비하지 않는다 ② 같은 접두의
challenge를 두 번 소비하면 두 번째가 실패한다 ③ 시작이 이전 것을 지운다.

*커밋 경계* — `feat(account-connect): the third challenge prefix`

---

## 4. 왕복 — 시작과 callback

시작은 Server Action(`startLoginMethodConnect`), 착지는 **세 번째 가로채기**.

### 4a. 가로채기 자리는 **가운데**다

✅ `withRevocation( withConnect( withLoginLink(…) ) )`. 근거는 design §가로채기 자리 — `withLoginLink`만
`run(request)`로 세션 쿠키를 뗀 복사본을 넘기는데 연결 왕복은 세션이 살아 있어야 하고, 연결은
회수처럼 언제나 왕복을 멈춘다.

⚠️ **`lib/auth/__tests__/provider-config.test.ts`가 즉시 red다** — `:86-87`이 중첩 순서를
정규식으로, `:100`이 `/revocationAuthCookies\(\)\s*\?\?\s*linkAuthCookies\(\)/`를 고정한다. **그
갱신이 이 태스크의 산출물이다.**

### 4b. state 쿠키 이름·salt를 분리한다

`connectStateCookie` · `withConnectStart` · `connectAuthCookies()`. 그리고 **`auth.ts:92`의
`cookies:` 체인이 `??` 3단이 된다** — 빠뜨리면 Auth.js가 연결 왕복의 state를 **일반 이름**으로 쓰고
분리가 통째로 무너진다. POSTMORTEM 2026-09-10의 **실제 수정이 이것**이다.

⚠️ **목적 표식이 사라진 callback은 신규 가입도 병합 제안도 만들지 않는다**(spec 완료 조건 8).
state를 제거하거나 일반 이름으로 바꿔도 로그인 쓰기 전에 검증이 실패해야 한다.

### 4c. 쿠키 정리 셋째 쌍

1번의 `clearAuthRoundtripCookies()`에 **연결 쿠키 쌍을 더하고 스캐너를 셋으로 넓힌다.**
`normal-login.test.tsx`의 `cleared` 테이블도 **8 → 12개**로 넓힌다 — 안 넓히면 "새 쿠키를 안 지워도
green"이다.

### 4d. 쓰기와 착지

⚠️ **`Account` 쓰기는 `create` + P2002 재조회다.** `upsert` 금지, 어떤 update에도 `userId` 금지.
**`taken-by-other` 판정이 쓰기보다 앞이다.**

⚠️ **이미 연결된 provider는 시작 시점에 거부한다** — 버튼은 안 보여도 Server Action은 직접 호출
가능하다. 사용자를 provider로 내보냈다가 돌아와서 거부하지 않는다.

⚠️ **연결 왕복은 `authjs.callback-url` 폴백을 두지 않는다** — 회수 intent가 그 폴백을 포함해 세
갈래라(`lib/session-revocation/http.ts:36-45`), 쿠키를 다 지워도 그 값이 남아 있으면 회수가 켜진다.

✅ **거부·성공 모두 착지가 `/account`다** — `routes.account({ connect })`가 주소를 만든다.
⚠️ **문자열 연결로 만들지 않는다.**

**검증**:
- `pnpm test` green.
- ⚠️ **`app/__tests__/entry-points.test.ts`의 `USER_SCOPED_ACTIONS`(`:75-90`)에 
  `startLoginMethodConnect`를 등재한다.** 안 넣으면 `:185`의 전수 검사가 red다(`:212`가 면제 목록의
  실재도 역검사한다). 그 Set은 `hasUserGuard`(정확한 `requireUser(` 또는 `readSession()` 3종 세트)만
  인정하므로 **새 Action의 가드 형태도 그 모양이어야 한다.**
  ⚠️ **`app/(edit)/__tests__/authorization.test.ts`가 아니다** — 그 파일은
  `app/(edit)/actions.ts`(번역 축)만 import하고 검사 축이 전부 프로젝트 스코프 교차 테넌트다.
  기존 사용자 축 Action(`unlinkLoginMethod`·`startSessionRevocation`)도 거기 없다.
- `pnpm test:credentials:postgres`를 다시 손으로 돈다 (쿠키 쌍이 늘었다).

*커밋 경계* — `feat(account): add a second sign-in method from settings` (6번과 **같은 커밋**이다 —
design이 POSTMORTEM 2026-09-06을 근거로 *"읽는 쪽을 같은 커밋에"*를 못 박았다)

---

## 5. `account.create` 허용 목록을 넷으로 넓힌다

⚠️ **새 스캐너를 만들지 않는다 — 이미 있고, 이 기능이 그것을 red로 만든다.**
`lib/login-link/__tests__/exclusive.test.ts:46`이 `account.create` 호출자를 **정확히 셋**으로
단언하고(`lib/login-link/store.ts` · `lib/auth/safe-adapter.ts` · `app/api/github/callback/route.ts`),
`:40-45` 주석이 *"넷째가 생기면 '로그인 수단은 User당 하나'의 예외가 **문서 없이** 하나 더 생긴
것이다"*라고 적어 뒀다. `lib/account-connect/store.ts`가 그 넷째다.

같은 파일 `:33-60`이 `"additional login accounts are disabled"` 문자열도 이미 센다 — **`linkAccount`
거부가 살아 있음은 그것이 든다.**

할 일: **넷째를 이름으로 등재하고, 그 근거를 `docs/ARCHITECTURE.md` §6.2에 적는다.** 그 등재
자체가 "옆문이 둘이 됐다"는 명시적 기록이다. ⚠️ ARCHITECTURE의 *"옆문은 `finishLink` 하나이고"*
문장도 같이 움직인다.

`lib/github-connect/__tests__/credential-separation.test.ts`의 **스캔 루트에 `lib/account-connect/`를
더한다** — 그 파일 `:77-81` 주석이 *"여기에 루트를 더하지 않으면 이 방어선이 새 디렉터리를 자동으로
덮지 않는다"*고 경고한다.

**검증**: 허용 목록에서 넷째를 빼면 red. 스캔 루트를 되돌리면 그 방어선이 새 디렉터리를 안 덮는
것을 확인.

*커밋 경계* — `test: the fourth account writer is on the record`

---

## 6. 문구와 화면 배선

`messages/en.tsx`에 **`m.errors.connectMethod` 별도 절** — 사유 아홉(성공 포함).
⚠️ **공유 중인 `m.errors.link`에 더하지 않는다**(design §착지 어휘의 이름 충돌 셋).

⚠️ **문구 원칙 — 신원 0 + 다음 행동 1**: `taken-by-other`는 누구인지(이메일·이름·마스킹값·아바타)를
절대 싣지 않고, `email-mismatch`는 양쪽 주소를 안 찍는다. 사유마다 출구가 하나다.

⚠️ **화면 문구는 `messages/en.tsx`를 지난다** — 소스에 한글 UI 리터럴 금지(`no-korean-ui.test.ts`).
⚠️ **제품 이름은 `malmoi`다** — 문장 첫 자리도 소문자(`brand-spelling.test.ts`).

**같이 움직이는 것**:
- ⚠️ **`messages/en.tsx:1213`의 `link.methods.description`이 거짓이 된다** —
  *"Adding one happens when you sign in with it at this same address."*
- **버튼 라벨은 `Connect`가 아니다**(spec §문제의 ⚠️). 같은 화면 셋째 카드가 이미 "Connect GitHub"
  이고 자격증명이 다르다. 로그인 수단 쪽을 `Add` 계열로 가른다. **아래 GitHub App 카드는 안
  건드린다.**
- **Alert는 Sign-in methods 카드 안의 in-block이다**(spec 완료 조건 3·6). 새 raw 색·새 토큰 없음 —
  `Alert variant="danger"` 재사용이라 **DESIGN §6.2 등재 불필요**.
- ⚠️ **pending을 행별로 가른다** — `LoginMethods`의 `useTransition`이 목록 전체 공유라, 두 행이 다
  눌릴 수 있게 되면 GitHub을 눌렀을 때 Google 행 스피너까지 돈다.
- 버튼은 `<form action>`이다. ⚠️ **`useTransition`으로 감싸지 않는다** —
  `components/github-account.tsx`의 `ConnectForm` 주석이 그 실측을 남겨 뒀다.
- ⚠️ **`components/__tests__/login-methods.test.ts`가 red다** —
  `expect(CARD).not.toMatch(/\bConnect\b/)` · `not.toContain("signIn(")` ·
  `not.toContain("startGithubConnectForUser")`를 고정한다.
- **`isUnlinkOutcome`을 `app/(edit)/account/page.tsx:49`에 배선한다**(2번의 산출물).

**검증**: `pnpm test` green.

*커밋 경계* — 4번과 같은 커밋

---

## 7. 실물 왕복을 한 번 밟는다 (수동)

⚠️ **`pnpm test`가 원리적으로 못 보는 층이다.** POSTMORTEM 2026-09-12(`withLoginLink`의 500)가
`pnpm test` 2,862건 + 격리 PostgreSQL 43건 + `pnpm build` 전부 green인 상태에서 **dev 서버 첫
클릭에** 났고, 그 회고가 남긴 문장이 *"인증 경로에 그런 코드를 넣으면 실물 왕복을 한 번 밟기
전에는 green을 믿지 않는다"*다. 이 기능은 인증 경로에 **세 번째 callback 가로채기**를 추가한다.

로컬 `pnpm dev`에서 **GitHub·Google 양방향**으로:

1. **성공 연결** — 착지가 `/account`이고 in-block 성공 Alert가 서며 **같은 렌더에서 행이 연결됨으로
   바뀌는지** 눈으로 본다(완료 조건 6 — `revalidatePath`가 Alert를 언마운트하지 않는지).
2. **이메일 불일치 거부** — 사유가 카드 안에 뜨고 **양쪽 주소가 안 찍히는지**.
3. **provider 화면에서 취소** — `cancelled` 문구가 뜨는지. **무음이면 완료 조건 3이 깨진 것이다.**
4. **중단 후 다른 왕복 시작** — 연결을 시작하고 provider 화면에서 뒤로 간 뒤 ① 회수 ② 병합을 각각
   시작해, 중단한 왕복이 남의 callback을 먹지 않는지.
5. **이미 연결된 provider** — 버튼이 안 보이는지.

⚠️ **`/bugshot-qa`로 대신하지 않는다** — 그 스킬은 OAuth 실물 왕복을 못 돈다.

**검증**: 다섯 갈래의 착지 URL과 화면 문구를 눈으로 확인. 어긋나면 그 자리에서 멈춘다.

---

## 8. 정본 반영

⚠️ **이 태스크는 구현이 프로덕션에 선 뒤다** — 앞서 적으면 문서가 코드보다 앞서간다.

| 문서 | 무엇 |
|---|---|
| `docs/PRODUCT.md` | §4.1의 `판정 · 아직 안 만들었다`를 ✅로. §7.7 IA의 `/account` 행과 그 아래 ⚠️ 문단. **§4.3 ④의 "두 provider의 소유 증명" 문장** — 세션이 기존 수단을 대신하게 됐다(spec 완료 조건 2) |
| `docs/ARCHITECTURE.md` | §6.2의 같은 표식. ⚠️ **`:1355`의 `finishLink` 인가 조건 "두 provider의 소유 증명"** · ⚠️ **`:1357`의 *"그 조건을 적을 수 없는 진입점은 만들지 않는다 — `/account`에 [Connect]가 없는 이유다"*가 이미 15줄 뒤 문단과 자기모순이다** · **`:1416`의 "쿼리 슬롯이 둘이다"**(실제 넷이 된다) · **머리의 코어 모듈 목록에 `lib/account-connect/` 추가** |
| `.claude/commands/push.md:77` | ⚠️ **ARCHITECTURE 머리의 코어 모듈 목록과 같아야 한다**고 양쪽에 못 박혀 있다. `lib/account-connect/`를 더한다 |
| `docs/DIRECTORY.md` | `lib/account-connect/`는 **새 디렉터리**다 |
| `docs/DESIGN.md` | **`:746`의 "쿼리 슬롯이 둘"**(실제 넷) · 같은 절 **"카드 넷"**(실제 다섯 — Sign-in methods 카드가 2026-09-12에 붙었다) · §6.67에 연결 거부의 in-block 자리 |
| `docs/OPERATIONS.md` | ⚠️ `push.md:87`이 *"`lib/login-link/**` 변경 → OPERATIONS.md"*를 트리거로 잡고 1번이 그 디렉터리를 건드린다. **해당 없음이면 "확인했고 변경 없음"으로 판정한다** |

**소스 주석·문구도 함께** (문서만 고치면 소스가 거짓말을 한다):
- `lib/login-link/policy.ts:134` — `loginMethodRows` docstring의 "[Connect]는 없다 (design ⑨)"
- `components/account/login-methods.tsx:16`
- `app/(edit)/account/page.tsx:107`
- `lib/routes.ts:111` — 주석이 "갈래는 둘(`disconnected`·`last-method`)"인데 생산자는 `unavailable`
  포함 셋을 낸다

⚠️ **`messages/en.tsx:1220`의 `link.methods.disconnected`는 참조 0건인 죽은 문구다**(해제 성공을
침묵시키며 남은 잔재). **삭제하지 않는다** — CLAUDE.md의 *"기존 dead code는 언급만 하고 삭제하지
않는다"*에 걸린다. 여기 적는 것으로 끝낸다.

*커밋 경계* — 문서별 별도 커밋 (`docs(PRODUCT): ...` 꼴)
