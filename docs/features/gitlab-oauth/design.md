# GitLab sign-in — 설계

작성: 2026-10-13 · 짝: [spec.md](spec.md) · [tasks.md](tasks.md) · `/feature-review` 반영(2026-10-13)

## 1. 영향 받는 흐름

push·pull·편집 UI의 데이터 경로는 **건드리지 않는다**. 붙는 곳은 인증 경계 하나다 — Auth.js 공급자 목록과, 그 목록을 우주(universe)로 쓰는 판정들(검증된 이메일 · 계정 병합 challenge · `/account` 수단 연결·해제 · 전체 세션 회수 · callback 가로채기 · 켜진 공급자 · preflight)과, 그 판정을 그리는 화면 셋(`/signin`·`/invite/[token]`·`/oauth/authorize`) + `/account` + `/signin/link/[challenge]`.

| 표면 | 바뀌는 것 |
|---|---|
| `auth.ts` | `GitLab(...)` provider 추가 — `checks: ["pkce", "state"]`, `profile()`이 검증 판정(§2). `withEnabled([github, gitlab, google], enabled)` — 인자 순서를 D2와 맞춘다(화면 순서는 `LOGIN_PROVIDERS`가 정하므로 동작은 같다) |
| `lib/auth/login-providers.ts` | `LOGIN_PROVIDER_ENV.gitlab`, `loginProviderStates`의 객체 리터럴(`:38` `{ github: state("github"), google: state("google") }`)에 gitlab, `enabledLoginProviders`(`:56-59`)에 리터럴 `optionalEnv("AUTH_GITLAB_ID")`·`optionalEnv("AUTH_GITLAB_SECRET")` (SH-15 AST 게이트가 리터럴을 뽑는다 — `:52` 주석), `:50` 주석 "(github → google)" 갱신 |
| `lib/login-link/policy.ts` | `LoginProvider = "github" \| "gitlab" \| "google"`, `LOGIN_PROVIDERS = ["github", "gitlab", "google"]`(§4 D2). `isLoginProvider`(`:33`)는 이미 있다 |
| `lib/auth/email.ts` | `EmailProof`에 `{ provider: "gitlab"; email; confirmedAt }`, `freshVerifiedEmail`의 gitlab 갈래 |
| 우주 하드코딩 사본 | §3 — 전부 `LOGIN_PROVIDERS` 파생으로 바꾼다(callback 정규식 `lib/auth/roundtrip.ts:9` 포함) |
| `lib/deployment/preflight.ts` | `SELF_HOSTED_ENV`에 `AUTH_GITLAB_*` 둘 `"optional"` — 쌍 판정 로직은 `LOGIN_PROVIDERS` 순회라 그대로 |
| `lib/security-headers.ts` | `form-action`에 `https://gitlab.com` (`img-src`·`connect-src`는 무변경 — 토큰 교환·userinfo는 서버에서 하고, 아바타는 받지 않는다 §4 D3) |
| 화면 | 2갈래 삼항(`github ? … : google`) **여덟 자리**(글리프 5 + 라벨 3)를 공급자 → 글리프·라벨 대응 하나로(§5) |
| `app/(edit)/account/actions.ts:180·:261` | `signIn(provider, …, { prompt: "select_account" })` — GitLab이 그 인자를 오류 없이 무시하면 **그대로 둔다**. 오류를 낼 때만 공급자별 인자 상수를 둔다(§4 D4) |
| 사전 en·ko·es | `signIn.gitlab` · `link.providers.gitlab` 새 키 · GitLab PAT 카드 문구 변경(§4 J8) · 초대 안내(`en.tsx:3594` "for GitHub, their primary email")에 GitLab · 방침 본문 |
| env 문서 | `.env.example`(`:80-81` "hosted는 둘 다 넣는다" · `:236` 포함) · `deploy/.env.example` · `deploy/compose.yaml`(`${AUTH_GITLAB_ID:-}` 꼴) |
| 테스트 기본 env | `vitest.setup.ts:13`에 `AUTH_GITLAB_*` 쌍 — hosted(D5 켬)와 테스트 기본값을 맞춘다. 넣는 순간 공급자 수에 기대는 단언 약 12곳이 바뀌므로 화면 커밋(D)에서 함께 넣는다(tasks §4) |
| `prisma/schema.prisma:637` | `GitLabConnection`의 `///` 주석 "GitLab은 로그인 공급자가 아니고"가 거짓이 된다 — 주석만 고친다(마이그레이션 0) |
| `scripts/gate-plan.ts` | 격리 PG 트리거에 `auth.ts`·`lib/auth/`(safe-adapter·roundtrip)를 더한다 — `postgres.integration.ts`가 그 동작을 단언하는데 지금은 그 경로만 바꾼 커밋에서 스위트가 안 붙는다(POSTMORTEM 2026-09-10) |

**바뀌지 않는 것**: `lib/github-connect/origin.ts`의 `ALLOWED_HOSTS` — Auth.js callback은 그 판정을 지나지 않고(`AUTH_URL`/`AUTH_TRUST_HOST`가 든다, `auth.ts`·`app/api/auth`는 `origin.ts`를 import하지 않는다), 그 함수는 공급자 중립인 쿠키 `secure` 판정·GitHub App callback·MCP Origin에만 쓰인다. 새 호스트가 없으니 늘릴 것도 없다. `lib/oauth-server/`(MCP OAuth AS)·`lib/auth/invitation.ts`·MCP 도구는 공급자를 참조하지 않는다 — `/oauth/authorize`·초대 화면은 버튼 목록(`signInButtons`)만 공유한다. **마이그레이션 없음** — `Account.provider`는 문자열이고 `"gitlab"`은 어디서도 쓰이지 않았다(`Account.provider` 리터럴은 `github`·`google`·`github-app` 셋 — `Project.repoHost`의 `"gitlab"`은 다른 테이블이다). `Account`에 `id_token` 칸도 없다. 스키마 파일은 위 주석 한 줄만 바뀐다.

## 2. 검증된 이메일 — GitLab의 근거

**판정: `/api/v4/user`의 `email`이 있고 `confirmed_at`이 null이 아닐 때만 통과한다.** 자리는 provider `profile()`이다(ARCHITECTURE §6.2 — 저장되는 값을 만드는 자리, POSTMORTEM 2026-09-05).

- **Auth.js 기본형** (`@auth/core@0.41.3` `providers/gitlab.js`, lockfile과 일치): `authorization: …/oauth/authorize?scope=read_user` · `userinfo: …/api/v4/user` · `profile()` = `{ id: sub ?? id, name: name ?? username, email: profile.email, image: avatar_url }`. **검증을 하지 않는다** — `email`을 그대로 넘긴다. 그래서 GitHub처럼 **기본 `profile()`을 대체한다.** 기본형에는 `checks`가 없어 pkce만 걸린다(`providers.js:52`) — `state`를 명시하는 이유다(J2).
- **`email` = 주 이메일**: GitLab Users API — "The `email` field is the user's primary email address"(<https://docs.gitlab.com/api/users/>). `GET /user`(자기 자신)의 일반 사용자 응답 예시에 `email`·`public_email`·`confirmed_at`이 있다. `public_email`은 쓰지 않는다 — 사용자가 고르는 공개 표시값이고 비어 있을 수 있다.
- **`confirmed_at`을 보는 이유**: GitLab은 Devise reconfirmable이라 주 이메일을 **바꾸면** 새 주소가 `unconfirmed_email`에 머물다가 확인 뒤에야 `email`로 옮겨진다(gitlab-org/gitlab#505444). 그래서 `email`이 미확인 주소가 되는 길은 **계정 자체가 미확인인 경우**(soft email confirmation 시절 가입자 — 같은 이슈가 GitLab.com에 그런 계정 1,437개를 보고했다)뿐이고, 그것을 `confirmed_at`이 가른다. GitHub의 "primary이면서 verified"와 같은 판정이다 — 보조 이메일로 넘어가지 않는다(spec §5).
- **OIDC(`openid email`) + `email_verified`를 쓰지 않는다**(§4 D1): GitLab OIDC 문서는 `email`·`email_verified` 클레임이 "email 스코프와 사용자의 공개 이메일이 있을 때만" 실린다고 적어(<https://docs.gitlab.com/integration/openid_connect_provider/>) 공개 이메일이 없는 사용자에게서 주소가 빠질 수 있고, `email_verified`가 무엇을 기준으로 참인지 문서가 말하지 않는다.
- **실측으로 닫을 것(T0)**: 테스트 계정 `ox501501`(gitlab.com에 "Sign in with GitHub"로 가입한 계정)로 `read_user` 토큰의 `/api/v4/user` 응답에 `email`·`confirmed_at`이 실리는지, PKCE(`code_challenge_method=S256`)가 통과하는지, `avatar_url` 호스트 형태(gitlab.com 업로드 · gravatar). **실측 전에는 `confirmed_at` 가정이 문서 근거뿐**이다 — 응답에 그 필드가 없으면 판정을 다시 연다(fail-closed로 두면 전원 거부가 된다).

**순수 함수** — `gitlabProfile(raw: unknown): { id: string; name: string | null; email: string; image: string | null }`:
- `id`가 숫자·문자열이 아니면 **던진다**(POSTMORTEM 2026-09-03 재발 — `profile.id.toString()`이 `Configuration`으로 접힌 계열. `githubUserinfo`와 같은 형). 던지지 않으면 Auth.js가 `providerAccountId`를 `crypto.randomUUID()`로 채워(`callback.js:232`) 로그인마다 새 `Account`가 생긴다.
- `email` = `verifiedEmailFrom({ provider: "gitlab", email: raw.email, confirmedAt: raw.confirmed_at }) ?? ""` — 실패는 빈 문자열이고 `signIn`이 거부한다(기존 계약).
- `name` = `name ?? username`(Auth.js 기본과 같다).
- `image` = `null` — 아바타를 받지 않는다(§4 D3).

`freshVerifiedEmail(provider, profile)`의 gitlab 갈래는 **raw 응답**을 받는다(Google 갈래와 같다 — `signIn` 콜백의 `profile` 인자는 `userinfo` 원본이다, `callback.js:189-210`). 이 갈래가 없으면 `null`이 돌아와 [Connect]가 `authorizeConnect`의 이메일 대조에서 실패하고 `planEmailRefresh`가 영영 `keep`이다.

## 3. 우주 하드코딩 사본 — 이번에 하나로 모은다

ARCHITECTURE "켜진 로그인 공급자"(`:2801`, 사본을 일부러 남긴 줄 `:2811`)가 **일부러 안 바꾼** 사본들이 있다 — 근거는 "한 곳만 켜진 집합으로 바꾸면 사본 간 정합이 깨진다"였다. 셋째 공급자는 **모든** 사본을 바꿔야 하므로, 손으로 셋을 다시 적지 않고 `LOGIN_PROVIDERS`(우주) 파생으로 바꾼다. 실재하는 사본의 중복 제거라 확장성 선반영이 아니다(optional-login-providers가 "다음 공급자 때"로 명시적으로 미룬 일이다).

| 자리 | 지금 | 바꾸는 꼴 |
|---|---|---|
| `lib/auth/roundtrip.ts:9` ⚠️ | `OAUTH_CALLBACK = /^\/api\/auth\/callback\/(github\|google)$/` — `login-link/http.ts:106`·`session-revocation/http.ts:32`·`account-connect/http.ts:32` 세 가로채기가 이것으로 판정한다 | `LOGIN_PROVIDERS`에서 만든 판정(정규식 조립 또는 경로 파싱 + `isLoginProvider`). **빠지면 GitLab callback이 병합 확인·회수·연결 가로채기를 우회한다 — 보안 경계** |
| `lib/auth/safe-adapter.ts:52·:58` | `provider !== "github" && !== "google"` · `in: ["github", "google"]` | `isLoginProvider` · `in: [...LOGIN_PROVIDERS]` |
| `lib/auth/login-providers.ts:38` | `{ github: state("github"), google: state("google") }` | gitlab 항 추가(`Record<LoginProvider, …>`라 typecheck가 잡는다) |
| `lib/credentials/access.ts:48` | `in: ["github", "google"]` (`loginMethods` 수) | `in: [...LOGIN_PROVIDERS]` |
| `lib/session-revocation/policy.ts:9·:27` | `"github" \| "google"` 타입 · 파싱 리터럴 | `LoginProvider` · `isLoginProvider` |
| `lib/session-revocation/store.ts:17·:25` | `beginRevocation`(`:16`) 안의 같은 검사 · `in: ["github", "google"]` (`:14` 주석이 사본을 일부러 남겼다고 적는다 — 주석도 고친다) | 같은 치환 |
| `lib/credentials/migration.ts:16` | `row.provider === "github" \|\| "google"` → 비밀 null | `isLoginProvider(row.provider)` — 지금도 비밀 없는 gitlab 행은 `:21 row.provider !== "github-app"` → `null`로 같은 결과다. 치환 근거는 **갈래 정합**(로그인 행은 로그인 갈래로 분류) |
| `lib/credentials/conversion.ts:64` | `loginAccounts` 수 | 같은 치환 |
| `lib/auth/email.ts:114` 주석 | "로그인 `Account` 행 수 (`github`·`google`만)" | 주석 갱신 |

**import 그래프 제약**: `lib/login-link/policy.ts`는 클라이언트 그래프다(`client-graph.test.ts:150`) — env를 import하지 않는다(POSTMORTEM 2026-09-07). policy의 import는 `lib/routes` 하나라, 위 서버 소비자들이 policy를 import하는 방향은 문제가 없다.

**게이트 — `lib/auth/__tests__/provider-universe.test.ts`(신규)**: 지울 모양(`"github", "google"`)을 세면 치환 뒤 생길 셋 배열·`!==`·유니온·정규식을 못 잡는다(POSTMORTEM 2026-09-18 — 가드가 엉뚱한 것을 셌다). `"github"`·`"gitlab"`은 `Project.repoHost`가 같은 리터럴을 써서 표지가 될 수 없고, **`google`은 로그인 공급자 뜻으로만 쓰인다** — 모든 우주 사본은 `google`을 이름으로 부르므로 그것이 표지다.
- 판정: 주석을 벗긴 소스(`app`·`lib`·`components`·루트 `auth.ts`·`middleware.ts`, 테스트 제외)에서 **공급자 id `google`이 단독 토큰**(문자열 리터럴 값 전체, 정규식 교대 항)으로 나오는 자리가 허용 파일 밖에 0이다. URL 부분 문자열(`accounts.google.com`)·대문자 표기(`Google`, `GoogleIcon`)·객체 키 식별자(`google:` — `Record<LoginProvider, …>`라 typecheck가 지킨다)는 세지 않는다.
- 허용 파일: `lib/login-link/policy.ts`(우주 정의) · `lib/auth/login-providers.ts`(env 리터럴) · `lib/auth/email.ts`(공급자별 증명 갈래) · `auth.ts`(provider import). 그 밖에 구현이 찾은 정당한 자리는 사유와 함께 목록에 올린다.
- **뮤테이션 검증**: 셋 배열 · `!== "google"` · 유니온 `"github" | "google"` · 정규식 `(github|google)`을 허용 밖 파일에 하나씩 되넣어 각각 red를 관측한다(커밋하지 않는다).

## 4. 결정 — 판단과 사용자 결정

### 판단 — 정본·코드가 답한다

| # | 판단 | 근거 |
|---|---|---|
| J1 | env 이름은 `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET`, 선택 쌍 | Auth.js가 `AUTH_${ID}_ID`·`_SECRET`을 추론한다(`node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/lib/utils/env.js` — `ID` 도출 `:47`, 이름 `:48-49`). optional-login-providers의 형 그대로 — `self-hosted-gates.test.ts:362`가 `next-auth/providers/<id>` import에서 공급자를 뽑아 `LOGIN_PROVIDER_ENV`·`optional`·compose `${X:-}`를 요구한다 |
| J2 | `checks: ["pkce", "state"]` | ARCHITECTURE §6.2 "두 provider에 건다"를 셋으로. GitLab 기본형은 pkce만 건다(§2). 실물 왕복(T0)에서 `code_challenge_method=S256`이 나가고 교환이 통과하는지 확인한다 |
| J3 | 스코프는 Auth.js 기본 `read_user` 그대로 | 이메일·`confirmed_at`을 주는 최소 REST 스코프다. 토큰은 저장하지 않으므로(J4) 넓이의 노출 창은 콜백 한 번이다 |
| J4 | 토큰을 저장하지 않는다 | Auth.js는 토큰을 실은 `account`를 넘기지만 세 쓰기 경로(`safe-adapter.ts:60`·`login-link/store.ts:151-158`·`account-connect/store.ts:70`)가 식별자 네 필드만 고른다 — 공급자 중립이라 코드 변경 없음, 테스트에 gitlab 사례만 더한다 |
| J5 | `ALLOWED_HOSTS` 무변경 | §1 |
| J6 | GitLab 로그인 OAuth 토큰을 CLAUDE.md 자격증명 절에 **번호 없이** 올린다 | 같은 gitlab.com에 PAT가 이미 있다 — 둘이 같은 호스트·같은 사람일 수 있어 "로그인했으니 연결된 것"이라는 지름길이 생기기 쉽다. Google 로그인 토큰은 표에서 세지 않으므로 "다섯째"로 세면 셈이 어긋난다. GitLab 단락에 "GitLab 로그인 토큰은 GitHub 표의 OAuth App 토큰 행과 같은 지위다 — 콜백 안에서만 살고 저장하지 않으며 리포 API를 부르지 않는다" 한 문장으로 붙인다(tasks §6) |
| J7 | Self-Managed 로그인 없음, 발급자 고정 | spec §3 |
| J8 | `/account`의 GitLab 로그인 수단 행과 GitLab PAT 카드를 **PAT 카드 문구로 지금 가른다**(사용자 결정 2026-10-13 — 실물 관찰 뒤로 미루지 않는다) | 지금 문구로는 둘 다 미연결일 때 `GitLab · Not connected · Connect` 행이 두 번 서고(`login-methods.tsx:82·:101·:131-140` · `gitlab-section.tsx:90` · `en.tsx:2106`), PAT 해제 확인 `Disconnect GitLab from Malmoi?`(`:2119`)는 로그인 수단까지 끊는 것처럼 읽힌다. `disconnectLabel: "Disconnect GitLab"`(`:2118`)의 주석 "접근 이름이 축을 든다"(`:2117`)가 GitLab 로그인 수단이 생기면 거짓이 된다. 같은 부류를 2026-09-13에 사전 문구로 닫았다(`en.tsx:4024-4029` `connectLabel` 주석). **PAT 쪽이 "토큰"을 든다** — 후보: 미연결 행 이름 `GitLab token` · 접근 이름 `Disconnect GitLab token` · 확인 제목 `Disconnect this GitLab token?` · 확인 버튼 `Disconnect token`(GitHub App 카드의 `Disconnect GitHub App` 형, DESIGN §6.67 `:2046`). 최종 낱말은 `/translate`·DESIGN §10이 정한다. 로그인 수단 행(`Disconnect GitLab as a sign-in method`)은 그대로 |

### 사용자 결정 (2026-10-13 — D1~D5 닫음)

| # | 질문 | 결정 | 근거·귀결 |
|---|---|---|---|
| D1 | 이메일 근거 — REST(`read_user` + `confirmed_at`) vs OIDC(`openid email` + `email_verified`) | **REST** (추천 채택) | OIDC 클레임은 공개 이메일이 없는 사용자에게서 빠질 수 있고 `email_verified`의 기준을 문서가 말하지 않는다(§2). ⚠️ 실측 T0이 `confirmed_at` 부재를 보이면 이 결정을 다시 연다 |
| D2 | `LOGIN_PROVIDERS` 순서 — 버튼 순서·primary·확인 상대 우선순위 | **`github` → `gitlab` → `google`** (추천 `github → google → gitlab`을 **뒤집었다** — Git 호스트 둘을 앞에 묶는다). `/feature-review`에서 재확인 — **유지**, 대가를 spec §1에 적는다 | hosted primary는 여전히 GitHub. 바뀌는 것 둘: ① hosted `/signin`·초대·`/oauth/authorize` 버튼 순서가 GitHub · GitLab · Google이 된다 — 편집자가 주로 쓰는 Google이 셋째로 내려간다 ② 확인 상대 우선순위(`pickLoginAccount` — 전체 세션 회수·병합 확인·병합 안내)가 `github` → `gitlab` → `google`이라, **GitLab과 Google을 둘 다 연결하고 GitHub이 없는 사용자**는 확인 상대가 GitLab이다(지금 그런 사용자는 0 — GitLab 수단이 아직 없다). 기존 `[github, google]` 사용자의 확인 상대는 그대로 GitHub. 테스트 기대(`normal-login.test.tsx:101` 등)는 세 번째 행 삽입 위치가 가운데다 |
| D3 | GitLab 아바타(`avatar_url`) → `User.image` | **받지 않는다**(`image: null`) (추천 채택) | `avatar_url`은 gitlab.com 업로드이거나 gravatar(GitLab 기본 폴백)라, 받으면 보는 사람의 브라우저가 새 제3자 호스트에 붙고 CSP `img-src`·방침 전송처가 는다. 사진은 `/account` 업로드로 올린다 — GitLab으로 처음 가입한 사람만 이니셜로 시작한다. 그래서 **`img-src` 무변경, 방침 아바타 줄(en `:814`·`:888`)은 GitHub·Google 그대로**이고, 수집 표 `:742`("name, email and profile picture ← GitHub or Google")는 사진 출처를 갈라 적는다(§7) |
| D4 | 회수·[Connect] 왕복의 `prompt: "select_account"`를 GitLab에도 | **T0 실측 뒤 확정 — 오류를 낼 때만 갈린다** (`/feature-review`에서 단순화) | T0 ③에서 GitLab이 그 인자를 오류 없이 무시하면 지금 호출(`actions.ts:180·:261`)을 그대로 두고 아무것도 만들지 않는다. 오류를 낼 때만 `Record<LoginProvider, Record<string, string>>` 상수 하나를 두어 두 Action이 공유한다 — 함수보다 단순하고 공급자를 빠뜨리면 typecheck가 잡는다 |
| D5 | hosted에서 켤까 · 앱 소유 | **켠다 · 그룹 소유 앱 하나** (추천 채택) | `/merge` 뒤 Production env 투입. GitLab 그룹 Settings → Applications에 앱 하나, redirect URI 셋(prod · `dev.mal-moi.com` · localhost) — 등록자가 떠나도 앱이 남는다(불변식 6 근거와 같은 결). 그룹 소유자는 사용자 계정이고 테스트 계정 `ox501501`은 그 그룹의 멤버가 아니다(T0 ⑥의 전제). **앱은 2026-10-13 사용자가 등록했고 ID·secret을 `.env.local`에 넣었다** — 에이전트는 값을 읽지 않는다. 방침 개정이 env 투입보다 먼저거나 같은 배포여야 한다(§7) |
| D6 | 브랜드 글리프의 색 (2026-10-13 착수 직전 추가) | **로그인 공급자 자리와 카드 행 `IconTile` 자리의 브랜드 글리프는 브랜드 색 그대로** — GitLab은 **공식 3색 tanuki**, Google은 지금의 4색, GitHub는 공식 단색(밝은 면엔 검정 · 어두운 면엔 흰색). 인라인 작은 글리프(텍스트 옆 `size-3.5`)는 단색 상속 그대로 | gitlab-repositories D10("GitLab은 단색 `currentColor`")을 **이 두 종류의 자리에 한해** 뒤집는다. 자리와 형은 §5 "브랜드 글리프" |

## 5. 화면

**design-brief 없음** — `/feature-review`(2026-10-13) CPO·CDO가 `.claude/commands/feature.md`의 산출 조건 셋(새 UI 표면의 첫 구현 · 레이아웃·정보 구조 재구현 · 사용자 지시) 어디에도 걸리지 않는다고 판정했다.
- 로그인 버튼은 켜진 공급자만 그리는 기존 `ProviderSubmit` 세로 스택(`flex w-full flex-col gap-2`, 버튼 `w-full size="lg"` — `app/signin/page.tsx:69`·`invite/[token]/page.tsx:135`·`oauth/authorize/page.tsx:125`)에 한 줄 더 쌓인다. primary는 `signInButtons`가 index 0으로 정한다(DESIGN §6.62 "버튼이 하나여도 화면이 읽힌다" — 개수에 중립인 골격).
- `/account` 수단 카드도 행이 하나 는다(DESIGN §6.67 "행 = 켜진 공급자"). GitLab 두 행의 혼동은 레이아웃이 아니라 문구 문제라 J8에서 닫는다.
- 글리프 색은 아래 "브랜드 글리프"(D6)를 따른다. `dark:`는 쓰지 않는다. 새 raw 색은 GitLab 공식 hex 셋뿐이고, DESIGN §6.2·§6.8에 Google과 같은 예외로 등재한다.
- 시안 없이 가는 대가(POSTMORTEM 2026-09-15 — 시안 없이 만든 화면이 네 곳에서 어긋났다)는 실물 T6이 받는다 — `/signin`·`/invite`·`/oauth/authorize`를 375폭·라이트·다크로, `/account`를 GitLab 로그인 행 × PAT 카드 네 상태로 본다(tasks §4).

**손 사본 정리**: 공급자 → 글리프 2갈래 삼항이 다섯 자리다 — `app/signin/page.tsx:132` · `app/invite/[token]/page.tsx:240` · `app/oauth/authorize/page.tsx:288` · `app/signin/link/[challenge]/page.tsx:103` · `components/account/login-methods.tsx:101`. 라벨 삼항이 셋(`app/signin/page.tsx:75` · `invite:238` · `authorize:286`). 셋째 갈래를 여덟 번 더 쓰지 않고 `brand-icons.tsx`(비테스트 소비자 20곳이 공유하는 글리프 자산 모듈 — 프리미티브가 아니라 `components/ui/`로 옮길 이유가 없다)에 `ProviderIcon({ provider })`(공급자 → 글리프 `Record<LoginProvider, …>`, `LoginProvider`는 `import type`)를 두고 이관한다 — 실재하는 사본의 이관이다(CLAUDE.md 작업 원칙). 라벨은 `m.signIn[provider]`로 인덱싱한다.
- ⚠️ **`ProviderButton` 함수 이름을 유지한다** — `app/signin/page.tsx:106`·`app/signin/link/[challenge]/page.tsx:128-131`이 이름을 바꾸지 말라고 경고하고, `normal-login.test.tsx`가 `type.name === "ProviderButton"`으로 찾는다(POSTMORTEM 2026-09-10의 방어선).
- `provider-progress.test.tsx:56`의 `toHaveLength(2)`는 **한 페이지의 `ProviderButton` 개수 = 켜진 공급자 수**다(`:36-44`) — 셋이면 3. `:50`의 `["github","google"]` 루프·`:64` 라벨 삼항도 바뀐다.

**브랜드 글리프 (D6)** — 지금까지 GitHub·GitLab은 단색 `currentColor`라서 `IconTile` 안에서는 칸의 회색(`text-muted-foreground`, `icon-tile.tsx` `TONE.muted`)이나 상태 색(`tone`)을 받았다. 이번에 두 종류의 자리에서 브랜드 색으로 고정한다.

| 자리 | GitHub | GitLab | Google |
|---|---|---|---|
| **로그인 버튼** — `/signin`·`/invite/[token]`·`/oauth/authorize`의 `ProviderButton` | 버튼 글자색을 상속한다(지금 그대로). primary 버튼은 채움이 어두워 흰색이고 default 버튼은 검정이라, GitHub의 "밝은 면엔 검정, 어두운 면엔 흰색" 규칙과 같다 | **공식 3색 tanuki**(`#E24329`·`#FC6D26`·`#FCA326`) — primary 버튼 위에서도 3색 그대로 | 4색 그대로 |
| **카드 행 `IconTile`** — `/account` 로그인 수단 행(`login-methods.tsx:101`) · GitHub App 카드(`github-section.tsx:72`) · GitLab PAT 카드(`gitlab-section.tsx:89`) · 설정 리포 카드(`repository-card.tsx:138`·`:198`) · `/signin/link` 배지(`[challenge]/page.tsx:103`) | **`text-foreground` 잉크** — 칸의 회색 상속을 끊는다. 테마 잉크라 라이트에선 검정, 다크에선 흰색이고 새 raw 색이 아니다 | 3색 tanuki | 4색 |
| **인라인 작은 글리프** — 프로젝트 목록(`project-list.tsx:288`) · 소스 화면(`sources-screen.tsx:94`) · 홈 메타(`meta-column.tsx:132`) · 새 프로젝트 탭(`new-project.tsx:619`) · 온보딩 리포 후보(`steps/repo.tsx`) | 단색 상속 그대로 | 단색 `GitlabIcon` 그대로 | — |

- **상태 칸에서도 글리프 색은 브랜드다.** `tone`(경고·실패)은 **칸의 면**만 칠하고 글리프 색은 덮지 않는다. 연결이 끊긴 상태처럼 글리프 자체가 `Unplug`·`Link2`로 바뀌는 자리는 지금처럼 lucide 아이콘이 상태 색을 받는다.
- **형** — `brand-icons.tsx`에 공식 3색 `GitlabBrandIcon`을 더한다. 기존 단색 `GitlabIcon`은 인라인 자리를 위해 남긴다. path는 GitLab 공식 press kit에서 가져오고 출처·라이선스·고정 버전(또는 SHA)을 파일 머리에 적는다(로고는 상표라 모양을 바꾸지 않는다). `ProviderIcon`은 gitlab → `GitlabBrandIcon`. 카드 행은 브랜드 글리프 하나를 감싸는 작은 조각(예: `BrandGlyph({ host })` — GitHub는 `text-foreground`)으로 다섯 자리가 같은 형을 쓴다. 손으로 다섯 번 `className`을 다는 사본을 만들지 않는다(CLAUDE.md "UI 프리미티브 먼저").
- **게이트** — `gitlab-glyph.test.ts`는 두 글리프로 나눠 센다. `GitlabIcon`은 `currentColor` + 색 리터럴 0을 유지하고, `GitlabBrandIcon`은 색 리터럴이 공식 hex 셋 **정확히**와 같다. tanuki path가 `brand-icons.tsx` 하나에만 있다는 규칙은 그대로다. 브랜드 자리의 글리프가 상태 칸에서 `tone` 색을 상속하지 않는다는 DOM 단언(`login-methods`·`github-section`·`gitlab-section`·`repository-card`)을 추가한다.
- **J8에 주는 영향** — 이제 `/account`의 로그인 수단 행과 PAT 카드가 둘 다 3색 tanuki다. 글리프로는 둘이 갈리지 않으므로 둘을 가르는 일은 문구(J8)만 한다.

**새 사전 키**(en → ko·es 같은 커밋, `/translate` 모드 ①):
- `link.providers.gitlab`: `GitLab` — **커밋 A**(`lib/login-link/message.ts:19`의 `m.link.providers[provider]`가 `{github, google}` 리터럴이라 우주에 gitlab이 들어가는 순간 TS7053이다). `dictionary-consistency.test.ts:94-96`·`:144`의 "en과 같아도 되는 키" 허용 목록에 함께 올린다.
- `signIn.gitlab`: `Continue with GitLab` — 커밋 D.
- GitLab PAT 카드 문구(J8) · 초대 안내 `en.tsx:3594` — 커밋 D.

`AccessDenied`("Its email may not be verified.") · `connectMethod.unverified` · `OAuthAccountNotLinked` 문구는 공급자 이름이 없어 `confirmed_at` 거부에도 참이다(`en.tsx:4231·:4304-4305`) — 그대로다. pending은 `ProviderSubmit` → `SubmitButton` → `Button loading`이라 새 pending 형이 없다.

## 6. 경계 — 로그인 ≠ 인가, 로그인 ≠ 연결

- **불변식 7**: GitLab 로그인은 `ProjectMember`를 만들지 않는다. GitLab 그룹·프로젝트 멤버십을 읽지 않는다(스코프 `read_user`로는 읽을 수도 없다).
- **불변식 6 · CLAUDE.md 자격증명 절**: GitLab 쓰기는 `Project.gitlabConnectionId`의 PAT만 쓴다(그대로). 로그인 `Account(provider = "gitlab")`는 그 판정의 입력이 아니다.
- **테스트** — `lib/github-connect/__tests__/credential-separation.test.ts`에 둘을 더한다:
  1. 로그인 경로(**루트 `auth.ts`**·`lib/auth/**`·`lib/login-link/**`·`lib/account-connect/**`·`lib/session-revocation/**`)가 `@/lib/gitlab/`·`@/lib/gitlab-connect/`(**하위 모듈 전부**)를 import하지 않는다. 실익은 기존 규칙이 못 보는 둘이다 — `BOUNDARY_SOURCES`(`:309`)는 lib·app·components·scripts만 훑어 루트 `auth.ts`를 빼고, 기존 완결성 규칙(`:636-641`, 정규식 `:361`)은 GitLab 클라이언트와 `gitlab-connect/connection`만 잡아 `gitlab-connect/errors` 같은 하위 모듈을 못 본다. 그래서 `auth.ts`를 명시적으로 읽어 넣는다.
  2. GitLab 쓰기·연결 경로(`lib/gitlab/**`·`lib/gitlab-connect/**`·`lib/repo-host/**`)가 `account` 모델(`prisma.account`·`tx.account`)을 읽지 않는다 — 지금 0건이라 넣는 순간부터 회귀를 막는다.
- **해제 독립**: `unlinkLoginMethod("gitlab")`은 `GitLabConnection`을 건드리지 않고 `disconnectGitLab`은 `Account`를 건드리지 않는다 — 격리 PG 시나리오 하나(spec §4-6).

## 7. 개인정보 방침

gitlab.com은 이미 전송처다(`messages/en.tsx:880` — PAT 연결). 새 **전송처는 없고 새 목적이 있다**(로그인) — `/push` 4단계 사람 판정 넷 중 "새 목적"에 걸린다.

- 본문 en(`messages/en.tsx:706-968`)·ko(`messages/ko-privacy.tsx`) — 고칠 후보 줄(구현 때 줄마다 문장을 대조한다):
  - **수집 표 `:742`**(ko `:35`) — "Your name, email address and profile picture ← GitHub or Google, when you sign in". GitLab을 그냥 더하면 GitLab이 사진 출처로 읽힌다(D3과 모순). **행을 나누거나 사진 출처를 따로 적는다** — 이름·이메일 ← GitHub, GitLab 또는 Google / 프로필 사진 ← GitHub 또는 Google.
  - 로그인 공급자 목록 줄 `:751-752` · `:768` · `:924` · `:941`(ko `:44-45` · `:61` · `:216` · `:226`).
  - **GitLab 전송처 줄 `:880`**(ko `:173`)에 로그인 목적을 더한다 — GitHub 줄 `:879`(ko `:172`, "signing you in, and …")의 문형에 맞춘다.
  - **고치지 않는 줄**: 아바타 줄 `:814`·`:888`(ko `:107`·`:181` — D3, 받지 않는다) · `:753`(ko `:46`, 공급자 이름 없는 이어지는 줄) · `:912`(ko `:204`, 이미 "GitHub, Google and GitLab connections") · Google 전송처 줄 `:881`(ko `:174`, 그대로 참). 거짓 문장을 만들지 않는다(POSTMORTEM 2026-09-19).
  - es 방침 본은 없다(en 본을 쓴다, `app/privacy/page.tsx:47`).
- `lib/privacy/collected.ts` — `Account`를 재사용하므로 **새 필드가 없다**(typecheck가 요구하지 않는다). `:125`·`:129`의 "GitHub·Google" 주석만 고친다. (`:150-154`의 "서비스 넷"이 본문 "six services"와 이미 어긋나 있다 — 기존 drift라 언급만 한다.)
- `lib/privacy/__tests__/policy-gate.test.tsx` — `REVISIONS`에 새 행(시행일·digest·koDigest), en·ko `effectiveDate`·`changes`. ⚠️ **`:310`이 `body.effectiveDate`를 리터럴 `"2026-10-12"`로 고정한다** — 같이 고친다.
- 셀프 호스팅 운영자 재료(가이드 `self-hosting/troubleshooting.md` 저장 필드·전송처 표, en·ko·es): Account 행 "GitHub or Google" → 셋, GitLab 전송처 행에 로그인 목적.
- **시행 순서**: 방침 개정이 hosted에서 GitLab 로그인을 켜는 것(D5)보다 먼저거나 같은 배포여야 한다 — 코드가 방침보다 앞서면 방침이 거짓이다.

## 8. 환경변수·운영

**새 환경변수**: `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET` (선택 쌍). `.env.example`·`deploy/.env.example`·`deploy/compose.yaml`·preflight 표·가이드 설치 표(en·ko·es) — SELF-HOSTING §3 체크리스트 4·8·9를 지난다.

- **callback**: `<origin>/api/auth/callback/gitlab`. hosted는 **GitLab 앱 하나**에 redirect URI 셋(`https://mal-moi.com/…` · `https://dev.mal-moi.com/…` · `http://localhost:3000/…`) — GitLab 애플리케이션은 redirect URI를 줄마다 하나씩 여러 개 받는다. GitHub OAuth App·Google 클라이언트와 같은 "세 환경 같은 값" 모델이다(OPERATIONS "새 머신 셋업" `:100-102`). dev용 앱을 따로 두지 않는다.
- **앱 설정**: Confidential 켬 · 스코프 `read_user` 하나 · 그룹 소유(D5) · 이름 `Malmoi`. GitLab에는 Google의 "게시(In production)"·도메인 소유권 검증 같은 게시 단계가 **없다** — 등록 즉시 모든 gitlab.com 사용자가 쓸 수 있다(실물 T0 ⑥에서 그룹 비멤버 `ox501501`로 확인). 사용자는 첫 로그인에서 GitLab의 인가 화면(앱 이름·스코프)을 한 번 본다.
- **Vercel env**: Production·Preview **환경별 변수**로 넣는다(CLAUDE.md — 한 변수로 묶으면 `vercel env rm … preview`가 Production까지 지운다). 투입은 사용자가 `.env.local` 값을 **CLI 스크립트로 밀어 넣는다**(2026-10-13 사용자 — 값을 stdin으로 `vercel env add <NAME> <env>`에 넘기고 화면·트랜스크립트에 찍지 않는다. 에이전트는 `.env.local`을 읽지 않는다). 성공 메시지를 근거로 삼지 않고 `vercel env ls`로 환경별 존재를 확인한다. Sensitive라 `vercel env pull`로 못 가져온다.
- **OPERATIONS**: "GitLab 로그인 앱" 절 — 등록 위치(그룹 Applications)·redirect URI 셋·secret 회전(GitLab은 "Renew secret" — 회전 순간 진행 중인 로그인만 깨진다)·Vercel 투입 스크립트 절차·preview는 `dev.mal-moi.com`에서만 로그인된다는 기존 함정. `:376`도 공급자 목록을 갱신한다.
- **self-hosted**: 설치 가이드 표에 GitLab 행(`<ORIGIN>/api/auth/callback/gitlab` · `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET`). `install.md:12`·`:14`("Google/GitHub이 켜졌을 때 optional") · `:18`("GitHub, Google, or both") · `:19`("at least one GitHub or Google sign-in provider is still required … there are no GitLab environment variables")를 다시 쓴다(GitLab 전용 설치는 이제 GitLab 로그인 하나로 기동한다). `troubleshooting.md:12-13`의 `no-login-provider`가 세 이름을 찍는다. `operate.md` "Turn a sign-in provider off". SELF-HOSTING `:118` · §7 "로그인 공급자 단독 구성" 행(미실행)에 GitLab 단독을 더한다.

## 9. 불변식 영향

- **export 결정성·blob SHA**: 없음.
- **인증 경계(ARCHITECTURE §6)**: 로그인 공급자가 하나 는다. 보존 방법 — 검증된 이메일 판정을 provider `profile()`에 두고(§2), `allowDangerousEmailAccountLinking`을 켜지 않으며(`provider-config.test.ts:27`), `linkAccount` 거부(sec-audit-2 #31)와 **callback 가로채기 판정(`roundtrip.ts`)**을 우주 파생으로 넓히고(§3), 토큰을 저장하지 않는다(J4). 켜진 공급자만 Auth.js에 들어가는 방어선(`withEnabled`)은 그대로다.
- **불변식 6·7**: §6.

## 10. POSTMORTEM 소환

| 날짜 | 함정 | 이 기능에서 |
|---|---|---|
| 2026-08-31 · 🔁 | env를 모듈 최상위에서 읽어 CI·빌드가 죽었다 | `GitLab(...)`은 env를 읽지 않는 객체로 최상위에 두고, 켜진 집합은 config 함수 안 `enabledLoginProviders()`가 요청마다 읽는다(기존 형) |
| 2026-09-03 🔁 | userinfo 실패를 `null`로 접어 `profile.id.toString()`이 `Configuration`으로 터졌다 | `gitlabProfile`이 id 부재에서 명시적으로 던진다(§2) |
| 2026-09-05 | 검증한 값과 저장한 값이 갈렸다 | 판정을 `profile()`에 둔다 — `signIn` 콜백에서 검사만 하지 않는다 |
| 2026-09-05 | 테스트 가짜가 실제 제약보다 관대했다 | `postgres.integration.ts:238` fakeAuth의 `withEnabled([fake("github"), fake("google")])`에 gitlab을 넣지 않으면 GitLab 시나리오가 가짜 Auth.js에서 돌지 않는다. `sign-in.test.ts`의 `checks` 단언은 GitLab env를 stub하고 `providers`에 gitlab이 있음을 먼저 단언한다 |
| 2026-09-07 | 클라이언트 번들 7.2MB | `LOGIN_PROVIDERS`를 넓혀도 `login-link/policy.ts`가 env·서버 모듈을 import하지 않는다(`client-graph.test.ts`) |
| 2026-09-10 · 2026-09-12 | 버려진 왕복이 다음 callback을 먹었다 · 오류 착지가 초대 복귀점을 잃었다 | 새 왕복 종류가 아니라 공급자만 는다 — 기존 `clearAuthRoundtripCookies`·`destFromCallbackUrl` 경로를 그대로 탄다(단 `roundtrip.ts` callback 판정은 우주 파생으로 넓힌다 — §3). **미확인 이메일 실물 재현은 불가하다**(gitlab.com은 가입 시 확인을 강제하고 T0 계정은 확인됐다) — 거부 갈래는 격리 PG가, 초대 복귀는 공급자 중립 경로라 GitHub·Google 검증으로 갈음한다 |
| 2026-09-18 | 가드가 호출이 아니라 이름을 셌다 | `provider-config.test.ts:73`의 `withEnabled(...)` 정규식을 셋으로 고치되, 방어선은 `withEnabled` 행동 테스트가 진다. 우주 게이트는 지울 모양이 아니라 `google` 토큰을 세고 뮤테이션으로 확인한다(§3) |
| 2026-09-19 | 방침이 green인 채 거짓 세 문장 | §7 — 수집 표 사진 출처를 가르고 아바타 줄을 D3과 맞춘다. 방침 문장은 사람 판정 |
