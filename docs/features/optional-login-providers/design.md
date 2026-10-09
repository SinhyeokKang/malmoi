# Optional login providers — 기술 설계

작성: 2026-10-09 · 근거 코드는 이 날짜의 `dev`(`572cfec7`)에서 읽었다.

## 1. 영향 받는 흐름

push·pull·편집 데이터 흐름은 건드리지 않는다. 바뀌는 것은 **로그인 진입과 계정 수단 판정**, 그리고 self-hosted 기동 판정이다.

| 층 | 자리 | 지금 | 바뀐 뒤 |
|---|---|---|---|
| 기동 판정 | `lib/deployment/preflight.ts` `SELF_HOSTED_ENV` | 네 값 `required` | 네 값 `optional` + 쌍 규칙(§2.2) |
| Auth.js | `auth.ts` `providers: [github, google]` | 고정 | config 함수 안에서 `withEnabled([github, google], enabled)`(§2.1) |
| 로그인 버튼 | `app/signin/page.tsx` · `app/invite/[token]/page.tsx` · `app/oauth/authorize/page.tsx` | 둘 고정, GitHub primary | 켜진 것만, 첫째 primary(§2.3 `signInButtons`) |
| 수단 카드 | `app/(edit)/account/page.tsx` → `components/account/login-methods.tsx` | 행 언제나 둘 | 켜진 공급자 행만 |
| 해제 | `unlinkLoginMethod` (`app/(edit)/account/actions.ts`) | `canUnlink(연결 행)` | `canUnlink(연결 행, provider, enabled)` |
| 연결 시작 | `startLoginMethodConnect` | `isLoginProvider`만 | + 켜진 집합 밖이면 `?connect=failed` |
| 전체 로그아웃 | `startSessionRevocation`(같은 파일) → `beginRevocation`(`lib/session-revocation/store.ts`) | `pickLoginAccount(연결 행)` | `pickLoginAccount(연결 행, enabled)` — Action과 store가 같은 enabled를 쓴다 |
| 병합 안내 | `auth.ts` signIn 콜백 → `loadLinkOffer` → `planLinkOffer` | `have` = 연결 행 중 github 우선 | `have` = **켜진** 연결 행 중 github 우선. 연결 행은 있는데 켜진 게 없으면 새 kind `method-unavailable` → 콜백이 `routes.signIn({ error: "MethodUnavailable" })` |
| 병합 확인 화면 | `app/signin/link/[challenge]/page.tsx` → `loadChallengeView` | 같음 | 같은 규칙, 없으면 `null`(→ `/signin`) |
| 거부 문구 | `app/signin/page.tsx` `signInErrorMessage` · `messages/{en,ko,es}.tsx` | `OAuthAccountNotLinked` 등 | + `MethodUnavailable` 한 키 |
| 전체 로그아웃 트리거 | `components/account/sessions-section.tsx` | `confirmProvider === null`이어도 활성 | `null`이면 `aria-disabled` + 사유(새 키 1) |
| 배치 | `deploy/compose.yaml` web env | `"${AUTH_GITHUB_ID}"` | `"${AUTH_GITHUB_ID:-}"` (넷) |

변경 없는 자리(확인함):
- `lib/credentials/access.ts:48` — 이메일 갱신의 `loginMethods`가 **꺼진 행까지** 센다(우주 `["github","google"]`). 꺼진 GitHub 행이 남은 사용자는 Google로 로그인해도 주소를 옮기지 않는다(`keep`) — 다시 켜면 그대로 돌아온다는 보존 원칙과 같은 방향이라 의도다. 결함으로 오진하지 않는다.
- `lib/auth/safe-adapter.ts:52·58` — `linkAccount`의 우주 검사·"추가 연결 금지"는 우주 기준이 맞다(꺼진 행이 있어도 일반 로그인으로 두 번째 행을 만들지 않는다).
- `lib/account-connect/*` — challenge 형·`isLoginProvider` 검사는 그대로. 연결 callback은 켜진 공급자로만 돌아올 수 있다(Auth.js `providers`에 없으면 callback이 성립하지 않는다).
- `finishRevocation`·`finishLink`·`checkChallenge` — 확인 callback이 켜진 공급자로만 오므로 추가 판정이 없다. 시작 시점과 확인 시점 사이에 운영자가 공급자를 끄면 callback이 Auth.js에서 실패하고 challenge는 TTL(5·10분)로 사라진다.
- `/oauth/authorize`의 `Signed in with {provider}` 줄(`loadConsent`) — 세션은 어느 수단으로 들어왔는지 기록하지 않는다. 연결 행 기준(하나면 그것, 둘이면 줄 없음)을 그대로 둔다. 켜진 집합으로 거르면 "꺼진 GitHub로 들어온 세션"에 `Google`을 단언하게 된다.
- 세션(`Session`)에 공급자 컬럼이 없다 — 공급자를 꺼도 살아 있는 세션은 끊기지 않고 `maxAge` 24h(마지막 활동 기준) 뒤 재로그인에서 막힌다.

## 2. 순수 함수 — `/tdd` 진입점

### 2.1 공급자 상태 — 새 잎 모듈 `lib/auth/login-providers.ts`

```ts
type LoginProviderState = "enabled" | "absent" | "partial";
/** 순수 — env 맵을 받는다. 공백만 있는 값은 빈 값이다(preflight `present`와 같은 규칙). */
function loginProviderStates(env: Record<string, string | undefined>): Record<LoginProvider, LoginProviderState>;
/** 순수 — Auth.js provider 목록을 켜진 집합으로 거른다. `auth.ts`가 이것을 부른다(행동 테스트가 붙는 자리). */
function withEnabled<T extends { id: string }>(all: readonly T[], enabled: readonly LoginProvider[]): T[];
/** 껍데기 — 호출 시점의 켜진 집합(상태가 `enabled`인 것, 순서는 `LOGIN_PROVIDERS` 그대로). `optionalEnv("AUTH_GITHUB_ID")` 등 **이름 리터럴 넷**으로 읽는다. 상태 → 집합 filter는 인라인이다(별도 함수를 두지 않는다). */
function enabledLoginProviders(): LoginProvider[];
/** env 이름 표 — preflight와 SH-15 ②-c 게이트가 같은 표를 본다. */
const LOGIN_PROVIDER_ENV: Record<LoginProvider, { id: string; secret: string }>;
```

- ⚠️ **모듈 최상위에서 env를 읽지 않는다**(POSTMORTEM 2026-08-31 + 🔁 2건). 켜진 집합은 요청마다 함수 호출로 얻는다.
- ⚠️ **`import "server-only"`를 붙이지 않는다** — `scripts/preflight.ts`가 tsx로 이 모듈을 문다(`server-only`는 react-server 조건 밖에서 던진다). 단 `lib/deployment/mode.ts`(import 0인 잎 — Edge middleware가 쓴다)와 달리 이 모듈은 `lib/env` → `lib/failure` → `node:crypto`를 끈다 — **`middleware.ts`가 이 모듈을 import하지 않는다.**
- ⚠️ **`lib/login-link/policy.ts`가 이 모듈을 import하지 않는다** — policy는 `/account` 수단 카드(클라이언트)의 그래프다. 이 모듈이 `lib/env` → `lib/failure` → `node:crypto`를 끌고 오므로 `client-graph.test.ts`가 red를 낸다(POSTMORTEM 2026-09-07 번들 사고와 같은 축). 켜진 집합은 **서버에서 구해 인자·props로** 내려간다.
- `optionalEnv`를 이름 리터럴로 부르는 이유: SH-15 ②가 `requireEnv`·`optionalEnv` 인자를 AST로 뽑아 preflight 표와 대조한다. 템플릿(`AUTH_${p}_ID`)은 `unresolved`로 red다.
- `optionalEnv`는 빈 문자열만 `undefined`로 접고 공백은 통과시킨다 — **트림 규칙은 순수 함수가 든다.** 그 규칙은 preflight의 `present`(`lib/deployment/preflight.ts:86`) **하나를 공유한다** — `loginProviderStates`가 새로 쓰지 않는다(두 벌이 되면 preflight와 런타임이 갈린다). 어느 모듈이 export할지는 import 방향(preflight가 이 모듈을 import한다)으로 구현에서 정한다.

### 2.2 preflight 쌍 규칙 — `lib/deployment/preflight.ts`

- `SELF_HOSTED_ENV`의 네 값: `required` → `optional`. 새 분류(kind)를 만들지 않는다 — `optional`이 "단독으로는 없어도 기동한다"이고 compose·`.env.example` 대조 필터(`required || optional`)가 그대로 맞는다. 쌍 제약은 아래 규칙이 든다.
- `preflight()`에 `loginProviderStates(env)` 판정을 더한다:
  - `partial` → 빠진 쪽 이름으로 `{ name, reason: "incomplete-pair" }`
  - `enabled` 0개(`partial`도 0개) → `{ name: "AUTH_GITHUB_ID", reason: "no-login-provider" }`, `{ name: "AUTH_GOOGLE_ID", reason: "no-login-provider" }` 두 줄
  - `partial`과 `enabled` 0개가 함께면(예: GitHub ID만) `incomplete-pair`만 낸다 — 고칠 자리 하나를 가리킨다
- `PreflightReason`에 `"incomplete-pair" | "no-login-provider"`를 더한다. 이름과 사유만 찍는 계약은 그대로다.

표(9칸) — `g`=GitHub 상태, `o`=Google 상태:

| g \ o | enabled | absent | partial |
|---|---|---|---|
| enabled | ok | ok | `incomplete-pair`(Google 빠진 쪽) |
| absent | ok | `no-login-provider`×2 | `incomplete-pair` |
| partial | `incomplete-pair` | `incomplete-pair` | `incomplete-pair`×2 |

### 2.3 수단 판정 — `lib/login-link/policy.ts` (클라이언트 안전 유지)

`LOGIN_PROVIDERS`·`LoginProvider`·`isLoginProvider`는 **우주(universe)** 로 남는다 — DB 조회(`provider in LOGIN_PROVIDERS`)·challenge 파싱은 꺼진 공급자의 행도 읽어야 판정이 "숨김"을 결정할 수 있다. 바뀌는 것은 판정 넷과 새 하나다.

| 함수 | 바뀐 시그니처 | 규칙 |
|---|---|---|
| `pickLoginAccount` | `(accounts, enabled)` | `enabled` 순서대로 첫 연결 행. 없으면 `null` |
| `loginMethodRows` | `(accounts, enabled)` | `enabled`의 공급자마다 한 행, 순서 고정 |
| `canUnlink` | `(methods, provider, enabled)` | `provider ∈ enabled` ∧ 연결됨 ∧ **해제 뒤 켜진 연결 수단 ≥ 1** |
| `methodCounts` | 그대로 | 행에서 센다 → 분모가 자동으로 켜진 수 |
| `signInButtons` (새) | `(enabled) → { provider, variant }[]` | 첫째 `primary`, 나머지 `default`. **`autoFocus`는 반환하지 않는다** — `/oauth/authorize`가 지금 조건(`sign-in` ∧ `notice === "switch"`)을 그대로 두고 index 0에 붙인다(화면 상태를 공용 판정에 넣지 않는다) |
| `planLinkOffer` (`plan.ts`) | `input.enabled` 추가 | `have` = `pickLoginAccount(methods, enabled)`; `null`이면 새 kind **`method-unavailable`**(연결 행은 있는데 켜진 게 없다). `methods.length === 0`·같은 공급자는 지금처럼 `sign-in` |

- `enabled` 인자에 **기본값을 두지 않는다** — 호출부가 빠뜨리면 typecheck가 잡는다(`DateStyle`과 같은 관용구). 기본값이 `LOGIN_PROVIDERS`면 새 호출부가 꺼진 공급자를 조용히 통과시킨다.
- `canUnlink`의 반례가 이 기능의 보안 요지다: 연결 `[github, google]`, 켜짐 `[google]` → `canUnlink(…, "google", …)`는 **false**. 지금 코드는 true다.
- 수단 카드(클라이언트)는 `canUnlink(connected, row.provider, rows.map(r => r.provider))`로 부른다 — 행이 곧 켜진 집합이라 새 prop이 필요 없다.
- `signInButtons`를 세 페이지가 공유한다 — primary 판정의 손 사본은 둘(`invite/[token]/page.tsx:235`·`oauth/authorize/page.tsx:279`의 삼항식)이고 `app/signin/page.tsx:70-71`은 호출부 `variant="primary"` 리터럴이다. ⚠️ **`ProviderButton` 함수 이름은 그대로 둔다**(`normal-login.test.tsx`가 이름으로 찾는다 — POSTMORTEM 2026-09-10의 방어선).

### 2.4 껍데기가 켜진 집합을 얻는 자리

`enabledLoginProviders()`를 부르는 곳은 **진입점뿐**이고 `lib/` store는 인자로 받는다(store를 순수하게 테스트하려고).

| 진입점 | 넘기는 곳 |
|---|---|
| `auth.ts` config 함수 | `withEnabled(…)`로 `providers` 구성 · `loadLinkOffer(prisma, { …, enabled })` · `method-unavailable` → `routes.signIn({ error: "MethodUnavailable" })` |
| `app/signin/page.tsx` · `app/invite/[token]/page.tsx` · `app/oauth/authorize/page.tsx` | `signInButtons(enabled)` |
| `app/(edit)/account/page.tsx` | `loginMethodRows` · `pickLoginAccount`(확인 상대 이름 — `null`이면 `SessionsSection` 트리거가 `aria-disabled` + 사유) |
| `app/(edit)/account/actions.ts` — 해제·연결 시작·전체 로그아웃 시작 | `canUnlink` · 거부 판정 · `pickLoginAccount` → `beginRevocation(prisma, { …, enabled })` |
| `app/signin/link/[challenge]/page.tsx` | `loadChallengeView(prisma, token, now, enabled)` |

- `beginRevocation`은 지금 Action이 고른 계정이 store가 다시 고른 계정과 같은지 대조한다(`chosen.provider !== provider` → `invalid`). **둘이 같은 `enabled`를 받아야** 대조가 성립한다 — 한 요청 안에서 한 번 읽어 둘에 넘긴다.
- `beginRevocation`의 하드코딩 `["github", "google"]`·`input.provider !== "github" && …`는 **이 기능에서 바꾸지 않는다**(외과적 변경) — 같은 우주 사본이 `lib/session-revocation/policy.ts:9·27`·`lib/auth/safe-adapter.ts:52·58`·`lib/auth/email.ts`·`lib/credentials/*`에도 있어 한 곳만 바꾸면 사본 간 정합만 깨진다. 언급만 한다.
- `unlinkLoginMethod`: 꺼진 공급자 요청은 `last-method`가 아니라 `unavailable`이다 — "마지막 수단"이 사실이 아니다. 화면에는 그 행이 없으므로 직접 Action 호출에서만 닿는다.

### 2.5 사전 키 (새 2 × en·ko·es)

| 키 | 자리 | 문구(en 초안) |
|---|---|---|
| `signIn` 거부 코드 `MethodUnavailable` | `/signin` 토스트(`signInErrorMessage`) | "Your sign-in method isn't available here. Ask your administrator." |
| 전체 로그아웃 비활성 사유 | `/account` Sessions 트리거 | "Connect a sign-in method first." |

`/translate` 모드 ①로 세 사전에 같은 커밋에서 넣는다. 기존 `OAuthAccountNotLinked` 문구는 그대로다(같은 공급자의 다른 계정 — hosted 포함).

## 3. 스키마 변경

없음. `Account` 행은 지우지 않는다 — 꺼진 공급자의 행은 숨겨질 뿐이고 다시 켜면 돌아온다(PRODUCT의 "키는 삭제하지 않는다"와 같은 방향의 보존).

## 4. 새 환경변수

없음. 기존 넷의 **분류와 의미**가 바뀐다(`required` → `optional` + 쌍 규칙). 같은 배치에서:
- `.env.example`(루트) — 주석: "로그인 공급자는 완전한 쌍 하나 이상. hosted는 둘 다"
- `deploy/.env.example` — 주석: "하나 이상의 완전한 쌍, 반쪽은 기동 거부"
- `deploy/compose.yaml` — `${AUTH_GITHUB_ID:-}` 꼴 넷(미설정 경고 제거, 값 없으면 빈 문자열 = absent)

## 5. 불변식 영향

- **export 결정성·blob SHA**: 무관.
- **자격증명 분리(CLAUDE.md "GitHub 자격증명이 셋")**: 유지. 로그인 OAuth App(`AUTH_GITHUB_*`)이 꺼져도 GitHub App(`GITHUB_APP_*`)은 preflight `required`로 남는다. Google만 켠 설치의 OWNER는 리포 연결 때 GitHub App user-to-server 인가를 받는다 — 지금도 로그인과 별도 왕복이다. `credential-separation.test.ts`는 손대지 않는다.
- **자동 병합 금지(ARCHITECTURE §6.2.1)**: 유지. 꺼진 공급자로만 연결된 사용자가 켜진 공급자로 로그인하면 `loadLinkOffer`가 `sign-in`을 내고 Auth.js가 `OAuthAccountNotLinked`로 거부한다 — 이메일 일치로 붙이지 않는다. `allowDangerousEmailAccountLinking`은 그대로 0곳.
- **인증 경계**: 꺼진 공급자는 Auth.js `providers`에 없으므로 `/api/auth/signin/<p>`·callback이 성립하지 않는다 — 화면 숨김이 유일한 방어선이 아니다. 연결 시작 Action은 Auth.js에 닿기 전에 따로 거부한다(쿠키·challenge 행을 만들지 않으려고).
- **계정 잠김**: `canUnlink`가 켜진 집합을 보게 되는 것이 이 기능의 유일한 새 보안 판정이다(spec §2의 반례).

## 6. 과거 함정 (POSTMORTEM)

| 항목 | 이 기능에서 |
|---|---|
| 2026-08-31 모듈 로드 시점 env + 🔁 2건 | `enabledLoginProviders()`는 함수. `auth.ts`의 `github`·`google` 객체는 지금처럼 최상위에 두되 env를 읽지 않는다(Auth.js가 요청 때 `AUTH_<P>_*`를 채운다). 거르는 것은 config 함수 안 |
| 2026-09-07 클라이언트 번들 7.2MB | policy.ts가 login-providers.ts를 import하지 않는다(§2.1). `client-graph.test.ts`가 지킨다 |
| 2026-09-10 재인증 목적이 사라진 callback이 일반 가입 | 로그인 진입점 **넷**(`normal-login.test.tsx` `ENTRIES` — 그중 버튼 소비자는 `/signin`·`/invite`·`/oauth/authorize` 셋, 넷째는 `app/signin/link/[challenge]/page.tsx:130-156`)의 `clearAuthRoundtripCookies()` → `signIn()` 순서를 그대로 둔다. `normal-login.test.tsx`가 버튼 **수**를 `ENTRIES`의 `buttons`로 단언하므로 env 픽스처를 두 공급자로 고정하고, 한 공급자 케이스를 더한다 |
| 사유 없는 `disabled` 금지(POSTMORTEM 항목이 아니라 `components/account/login-methods.tsx:84·116` 주석 · audit #37) | 마지막 켜진 수단 행은 기존 `lastMethod` 사유 + `aria-disabled` 형을 그대로 쓴다. 꺼진 공급자 행은 그리지 않는다. 전체 로그아웃 트리거의 새 비활성도 같은 형(사유 동반)이다 |
| 2026-09-15 비활성 primary 형 | primary를 호출부가 고르지 않고 `signInButtons`가 정한다 |
| 2026-09-18 인가 방어선이 호출이 아니라 이름을 셌다 | `auth.ts`의 거르기는 텍스트 단언이 아니라 `withEnabled` 행동 테스트가 진다. `auth.ts`에는 주석을 벗긴 뒤 **호출형**(`withEnabled(`)만 세고, 호출을 지우는 뮤테이션으로 red를 확인한다 |

## 7. UI

**design-brief 없음.** 새 표면이 아니고 레이아웃·정보 구조가 바뀌지 않는다 — 기존 버튼·행의 **개수**가 줄고, 기존 비활성 형(사유 동반)이 전체 로그아웃 트리거 한 곳에 더 붙는다. 사전 키는 §2.5의 둘이 새로 들고 나머지는 재사용(`m.link.methods.count`·`lastMethod`·`signIn.github/google`)이다. 화면은 버튼 하나여도 읽힌다 — "or" 구분선이 없고 제목·약관·초대 캡션이 공급자 중립이다. 실물 확인은 tasks T10의 단일 공급자 기동에서 `/signin`·`/invite`·`/oauth/authorize`·`/account`를 본다.

가이드 스크린샷: `account.webp`(소스 `login-methods.tsx`·`account/page.tsx`)·`accept-invitation.webp`(소스 `invite/[token]/page.tsx`)가 `pnpm guide:check` stale 후보로 뜬다. hosted 화면은 같으므로 **재촬영 없이 SHOOTING 매핑의 SHA만 갱신**한다.

## 8. 문서 영향 (구현 배치에서 갱신)

| 문서 | 바뀌는 문장 |
|---|---|
| PRODUCT §4.1 셀프 호스팅 | "그대로인 것: 로그인(GitHub·Google …)" → 운영자가 켠 공급자(최소 하나)로 로그인 |
| ARCHITECTURE "계정 병합" · §6.2.1 근처 | 켜진 집합 정의, `canUnlink`·확인 상대 규칙, 꺼진 공급자 행은 숨김·보존, `MethodUnavailable` 착지, `access.ts:48` 이메일 갱신이 꺼진 행까지 세는 것 |
| ARCHITECTURE 인증 경계 표(`:2290` "편집 UI 로그인" 행) | `AUTH_GITHUB_*`만 적힌 칸 → GitHub·Google 중 켜진 것(`AUTH_GITHUB_*`·`AUTH_GOOGLE_*`, 최소 한 쌍) |
| DESIGN `:1167`(provider 버튼 둘) · `:1173`(초대 GitHub `primary`) · `:1983`(Sign-in methods 행 언제나 둘) | "켜진 공급자만, 첫째가 primary(`signInButtons`)" · "행 = 켜진 공급자, 순서는 `LOGIN_PROVIDERS`" · 전체 로그아웃 트리거의 비활성 사유 |
| SELF-HOSTING §4 게이트 지도 | ②-c 행이 지금 없다 — **행 추가**: "auth.ts의 provider마다 `LOGIN_PROVIDER_ENV`에 등재 + optional, 로그인 넷이 compose에서 `${X:-}` 꼴" |
| SELF-HOSTING §7 | 다음 실습 회차 항목: GitHub 단독·Google 단독 기동과 실제 OAuth 왕복 |
| 가이드 `self-hosting/install.md` (en·ko·es) | 외부 서비스 표 GitHub OAuth·Google 행에 "하나 이상" + "번역자에게 GitHub 계정이 없으면 Google을 켠다" 한 줄, `:18` "Both login providers are required…" 문장 교체, `:31` 설정 표 비고 "Both providers are required" 교체, `:49` 설치 검증 단계 "sign in with GitHub and Google" → 켠 공급자로 |
| 가이드 `self-hosting/troubleshooting.md` (en·ko·es) | `#startup-checks` 표에 `incomplete-pair`·`no-login-provider` 행 · 수신처 표 Google·GitHub 행 "켠 경우에만" · `MethodUnavailable` 문구를 인용해 "그 공급자를 다시 켠다" |
| 가이드 `self-hosting/README.md` (en·ko·es) | hosted 비교표 "Sign-in and email" 행 · 가입 문단의 "GitHub or Google" |
| 가이드 `self-hosting/operate.md` (en·ko·es) | 공급자를 끄기 전 절차(사용자가 남는 수단을 연결 → 끄기 → 재기동, 꺼진 공급자만 가진 사용자는 `MethodUnavailable` 문구를 보고 다시 켜야 복구) |
| CLAUDE.md | 변경 없음(자격증명 표는 그대로 참). `/push` 4단계 신선도에서 다시 본다 |
