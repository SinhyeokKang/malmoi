# GitLab sign-in — 설계

작성: 2026-10-13 · 짝: [spec.md](spec.md) · [tasks.md](tasks.md)

## 1. 영향 받는 흐름

push·pull·편집 UI의 데이터 경로는 **건드리지 않는다**. 붙는 곳은 인증 경계 하나다 — Auth.js 공급자 목록과, 그 목록을 우주(universe)로 쓰는 판정들(검증된 이메일 · 계정 병합 challenge · `/account` 수단 연결·해제 · 전체 세션 회수 · 켜진 공급자 · preflight)과, 그 판정을 그리는 화면 셋(`/signin`·`/invite/[token]`·`/oauth/authorize`) + `/account` + `/signin/link/[challenge]`.

| 표면 | 바뀌는 것 |
|---|---|
| `auth.ts` | `GitLab(...)` provider 추가 — `checks: ["pkce", "state"]`, `profile()`이 검증 판정(§2) |
| `lib/auth/login-providers.ts` | `LOGIN_PROVIDER_ENV.gitlab`, `loginProviderStates`·`enabledLoginProviders`에 리터럴 `optionalEnv("AUTH_GITLAB_ID")`·`optionalEnv("AUTH_GITLAB_SECRET")` (SH-15 AST 게이트가 리터럴을 뽑는다 — `:52` 주석) |
| `lib/login-link/policy.ts` | `LoginProvider = "github" \| "gitlab" \| "google"`, `LOGIN_PROVIDERS = ["github", "gitlab", "google"]`(§4 D2) |
| `lib/auth/email.ts` | `EmailProof`에 `{ provider: "gitlab"; email; confirmedAt }`, `freshVerifiedEmail`의 gitlab 갈래 |
| 우주 하드코딩 사본 | §3 — 전부 `LOGIN_PROVIDERS` 파생으로 바꾼다 |
| `lib/deployment/preflight.ts` | `SELF_HOSTED_ENV`에 `AUTH_GITLAB_*` 둘 `"optional"` — 쌍 판정 로직은 `LOGIN_PROVIDERS` 순회라 그대로 |
| `lib/security-headers.ts` | `form-action`에 `https://gitlab.com` (`img-src`는 무변경 — §4 D3) |
| 화면 | 2갈래 삼항(`github ? … : google`) 일곱 자리를 공급자 → 글리프·라벨 대응 하나로(§5) |
| `app/(edit)/account/actions.ts:180·:261` | `signIn(provider, …, { prompt: "select_account" })` — GitLab에 넘길 인자는 실측 T0 뒤 확정(§4 D4) |
| 사전 en·ko·es | `signIn.gitlab` · `link.providers.gitlab` 새 키, 방침 본문 |
| env 문서 | `.env.example` · `deploy/.env.example` · `deploy/compose.yaml`(`${AUTH_GITLAB_ID:-}` 꼴) |

**바뀌지 않는 것**: `lib/github-connect/origin.ts`의 `ALLOWED_HOSTS` — Auth.js callback은 그 판정을 지나지 않고(`AUTH_URL`/`AUTH_TRUST_HOST`가 든다), 그 함수는 공급자 중립인 쿠키 `secure` 판정·GitHub App callback·MCP Origin에만 쓰인다. 새 호스트가 없으니 늘릴 것도 없다. `lib/oauth-server/`(MCP OAuth AS)·`lib/auth/invitation.ts`·MCP 도구는 공급자를 참조하지 않는다 — `/oauth/authorize`·초대 화면은 버튼 목록(`signInButtons`)만 공유한다. **스키마 변경 없음** — `Account.provider`는 문자열이고 `"gitlab"`은 어디서도 쓰이지 않았다(`Account.provider` 리터럴은 `github`·`google`·`github-app` 셋 — `Project.repoHost`의 `"gitlab"`은 다른 테이블이다).

## 2. 검증된 이메일 — GitLab의 근거

**판정: `/api/v4/user`의 `email`이 있고 `confirmed_at`이 null이 아닐 때만 통과한다.** 자리는 provider `profile()`이다(ARCHITECTURE §6.2 — 저장되는 값을 만드는 자리, POSTMORTEM 2026-09-05).

- **Auth.js 기본형** (`@auth/core@0.41.3` `providers/gitlab.js`): `authorization: …/oauth/authorize?scope=read_user` · `userinfo: …/api/v4/user` · `profile()` = `{ id: sub ?? id, name: name ?? username, email: profile.email, image: avatar_url }`. **검증을 하지 않는다** — `email`을 그대로 넘긴다. 그래서 GitHub처럼 **기본 `profile()`을 대체한다.**
- **`email` = 주 이메일**: GitLab Users API — "The `email` field is the user's primary email address"(<https://docs.gitlab.com/api/users/>). `GET /user`(자기 자신)의 일반 사용자 응답 예시에 `email`·`public_email`·`confirmed_at`이 있다. `public_email`은 쓰지 않는다 — 사용자가 고르는 공개 표시값이고 비어 있을 수 있다.
- **`confirmed_at`을 보는 이유**: GitLab은 Devise reconfirmable이라 주 이메일을 **바꾸면** 새 주소가 `unconfirmed_email`에 머물다가 확인 뒤에야 `email`로 옮겨진다(gitlab-org/gitlab#505444). 그래서 `email`이 미확인 주소가 되는 길은 **계정 자체가 미확인인 경우**(soft email confirmation 시절 가입자 — 같은 이슈가 GitLab.com에 그런 계정 1,437개를 보고했다)뿐이고, 그것을 `confirmed_at`이 가른다. GitHub의 "primary이면서 verified"와 같은 판정이다 — 보조 이메일로 넘어가지 않는다(spec §5).
- **OIDC(`openid email`) + `email_verified`를 쓰지 않는다**(§4 D1): GitLab OIDC 문서는 `email`·`email_verified` 클레임이 "email 스코프와 사용자의 공개 이메일이 있을 때만" 실린다고 적어(<https://docs.gitlab.com/integration/openid_connect_provider/>) 공개 이메일이 없는 사용자에게서 주소가 빠질 수 있고, `email_verified`가 무엇을 기준으로 참인지 문서가 말하지 않는다.
- **실측으로 닫을 것(T0)**: 테스트 계정 `ox501501`(gitlab.com에 "Sign in with GitHub"로 가입한 계정)로 `read_user` 토큰의 `/api/v4/user` 응답에 `email`·`confirmed_at`이 실리는지, PKCE(`code_challenge_method=S256`)가 통과하는지, `avatar_url` 호스트 형태(gitlab.com 업로드 · gravatar). **실측 전에는 `confirmed_at` 가정이 문서 근거뿐**이다 — 응답에 그 필드가 없으면 판정을 다시 연다(fail-closed로 두면 전원 거부가 된다).

**순수 함수** — `gitlabProfile(raw: unknown): { id: string; name: string | null; email: string; image: string | null }`:
- `id`가 숫자·문자열이 아니면 **던진다**(POSTMORTEM 2026-09-03 재발 — `profile.id.toString()`이 `Configuration`으로 접힌 계열. `githubUserinfo`와 같은 형).
- `email` = `verifiedEmailFrom({ provider: "gitlab", email: raw.email, confirmedAt: raw.confirmed_at }) ?? ""` — 실패는 빈 문자열이고 `signIn`이 거부한다(기존 계약).
- `name` = `name ?? username`(Auth.js 기본과 같다).
- `image` = `null` — 아바타를 받지 않는다(§4 D3).

`freshVerifiedEmail(provider, profile)`의 gitlab 갈래는 **raw 응답**을 받는다(Google 갈래와 같다 — `profile` 인자는 `userinfo` 원본이다). 이 갈래가 없으면 `null`이 돌아와 [Connect]가 `authorizeConnect`의 이메일 대조에서 실패하고 `planEmailRefresh`가 영영 `keep`이다.

## 3. 우주 하드코딩 사본 — 이번에 하나로 모은다

ARCHITECTURE "켜진 로그인 공급자"(`:2795`)가 **일부러 안 바꾼** 사본들이 있다 — 근거는 "한 곳만 켜진 집합으로 바꾸면 사본 간 정합이 깨진다"였다. 셋째 공급자는 **모든** 사본을 바꿔야 하므로, 손으로 셋을 다시 적지 않고 `LOGIN_PROVIDERS`(우주) 파생으로 바꾼다. 실재하는 사본의 중복 제거라 확장성 선반영이 아니다.

| 자리 | 지금 | 바꾸는 꼴 |
|---|---|---|
| `lib/auth/safe-adapter.ts:52·:58` | `provider !== "github" && !== "google"` · `in: ["github", "google"]` | `isLoginProvider` · `in: [...LOGIN_PROVIDERS]` |
| `lib/credentials/access.ts:48` | `in: ["github", "google"]` (`loginMethods` 수) | `in: [...LOGIN_PROVIDERS]` |
| `lib/session-revocation/policy.ts:9·:27` | `"github" \| "google"` 타입 · 파싱 리터럴 | `LoginProvider` · `isLoginProvider` |
| `lib/session-revocation/store.ts:17·:25` | 같은 검사 · `in: ["github", "google"]` (`:14` 주석이 사본을 일부러 남겼다고 적는다 — 주석도 고친다) | 같은 치환 |
| `beginRevocation`의 `["github", "google"]` | 리터럴 | `LOGIN_PROVIDERS` |
| `lib/credentials/migration.ts:16` | `row.provider === "github" \|\| "google"` → 비밀 null | `isLoginProvider(row.provider)` — 빠지면 GitLab 행이 비밀을 가질 일은 없어도 분류가 `CredentialError` 갈래를 탄다 |
| `lib/credentials/conversion.ts:64` | `loginAccounts` 수 | 같은 치환 |
| `lib/auth/email.ts:114` 주석 | "github·google 행만 센다" | 주석 갱신 |

**import 그래프 제약**: `lib/login-link/policy.ts`는 클라이언트 그래프다(`client-graph.test.ts:150`) — env를 import하지 않는다(POSTMORTEM 2026-09-07). 위 소비자들이 policy를 import하는 방향은 문제가 없다(policy가 서버 모듈을 끌어오지 않는다).

**게이트**: 소스(`app`·`lib`·`components`·`auth.ts`, 테스트 제외)에서 `"github",\s*"google"` 꼴과 `=== "google"` 비교가 `lib/auth/email.ts`(공급자별 증명 갈래)·`login-providers.ts`(env 리터럴)·`auth.ts` 밖에서 0인지 세는 테스트를 하나 둔다 — 다음 공급자 때 같은 사본이 다시 숨지 않게. 위치는 `lib/auth/__tests__/provider-universe.test.ts`(신규).

## 4. 결정 — 판단과 사용자 결정

### 판단 — 정본·코드가 답한다

| # | 판단 | 근거 |
|---|---|---|
| J1 | env 이름은 `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET`, 선택 쌍 | Auth.js가 `AUTH_${ID.toUpperCase()}_{ID,SECRET}`를 추론한다(`@auth/core/lib/utils/env.js:47`). optional-login-providers의 형 그대로 — `self-hosted-gates.test.ts:362`가 `next-auth/providers/<id>` import에서 공급자를 뽑아 `LOGIN_PROVIDER_ENV`·`optional`·compose `${X:-}`를 요구한다 |
| J2 | `checks: ["pkce", "state"]` | ARCHITECTURE §6.2 "두 provider에 건다"를 셋으로. GitLab은 PKCE를 문서로 지원한다 — 실물 왕복(T0)에서 `code_challenge_method=S256`이 나가고 교환이 통과하는지 확인한다 |
| J3 | 스코프는 Auth.js 기본 `read_user` 그대로 | 이메일·`confirmed_at`을 주는 최소 REST 스코프다. 토큰은 저장하지 않으므로(J4) 넓이의 노출 창은 콜백 한 번이다 |
| J4 | 토큰을 저장하지 않는다 | 세 쓰기 경로(`safe-adapter.ts:60`·`login-link/store.ts:151-158`·`account-connect/store.ts:65`)가 이미 식별자 네 필드만 쓴다 — 공급자 중립이라 코드 변경 없음, 테스트에 gitlab 사례만 더한다 |
| J5 | `ALLOWED_HOSTS` 무변경 | §1 |
| J6 | GitLab 로그인 OAuth 토큰을 **다섯째 자격증명**으로 CLAUDE.md "섞지 않는다"에 올린다 | 같은 gitlab.com에 PAT(넷째)가 이미 있다 — 둘이 같은 호스트·같은 사람일 수 있어 "로그인했으니 연결된 것"이라는 지름길이 생기기 쉽다. 경계: 로그인 토큰은 콜백 안에서만 살고 리포 API를 부르지 않는다. GitHub 셋 표의 OAuth App 토큰 행과 같은 지위다 — 표 밑 GitLab 단락에 한 문장으로 붙인다(tasks §6) |
| J7 | Self-Managed 로그인 없음, 발급자 고정 | spec §3 |
| J8 | `/account`에서 "GitLab"(로그인 수단 행)과 "GitLab PAT"(연결 카드)가 나란히 선다 — 라벨을 바꾸지 않는다 | 카드 제목이 이미 `GitLab PAT`(`m.account.gitlab`)라 갈린다. 수단 행의 해제 라벨은 `Disconnect GitLab as a sign-in method`(`link.methods.disconnectLabel`)이고 PAT 카드는 `Disconnect GitLab` — 실물(T6)에서 혼동이 보이면 그때 문구를 고친다 |

### 사용자 결정 (2026-10-13 — D1~D5 닫음)

| # | 질문 | 결정 | 근거·귀결 |
|---|---|---|---|
| D1 | 이메일 근거 — REST(`read_user` + `confirmed_at`) vs OIDC(`openid email` + `email_verified`) | **REST** (추천 채택) | OIDC 클레임은 공개 이메일이 없는 사용자에게서 빠질 수 있고 `email_verified`의 기준을 문서가 말하지 않는다(§2). ⚠️ 실측 T0이 `confirmed_at` 부재를 보이면 이 결정을 다시 연다 |
| D2 | `LOGIN_PROVIDERS` 순서 — 버튼 순서·primary·확인 상대 우선순위 | **`github` → `gitlab` → `google`** (추천 `github → google → gitlab`을 **뒤집었다** — Git 호스트 둘을 앞에 묶는다) | hosted primary는 여전히 GitHub. 바뀌는 것 둘: ① hosted `/signin`·초대·`/oauth/authorize` 버튼 순서가 GitHub · GitLab · Google이 된다 ② 확인 상대 우선순위(`pickLoginAccount` — 전체 세션 회수·병합 확인·병합 안내)가 `github` → `gitlab` → `google`이라, **GitLab과 Google을 둘 다 연결하고 GitHub이 없는 사용자**는 확인 상대가 GitLab이다(지금 그런 사용자는 0 — GitLab 수단이 아직 없다). 기존 `[github, google]` 사용자의 확인 상대는 그대로 GitHub. 테스트 기대(`normal-login.test.tsx:101` 등)는 세 번째 행 삽입 위치가 가운데다 |
| D3 | GitLab 아바타(`avatar_url`) → `User.image` | **받지 않는다**(`image: null`) (추천 채택) | `avatar_url`은 gitlab.com 업로드이거나 gravatar(GitLab 기본 폴백)라, 받으면 보는 사람의 브라우저가 새 제3자 호스트에 붙고 CSP `img-src`·방침 전송처가 는다. 사진은 `/account` 업로드로 올린다 — GitLab으로 처음 가입한 사람만 이니셜로 시작한다. 그래서 **`img-src` 무변경, 방침 아바타 줄(`:814`·`:888`)은 GitHub·Google 그대로** |
| D4 | 회수·[Connect] 왕복의 `prompt: "select_account"`를 GitLab에도 | **T0 실측 뒤 확정 — 기본은 넘기지 않는다** (추천 채택) | 문서 근거가 없고, 오류를 내면 회수·연결 왕복이 GitLab에서만 죽는다. 공급자별 인자는 순수 함수 `reauthParams(provider)` 하나로 두 Action이 공유한다 |
| D5 | hosted에서 켤까 · 앱 소유 | **켠다 · 그룹 소유 앱** (추천 채택) | `/merge` 뒤 Production env 투입. GitLab 그룹 Settings → Applications에 앱 하나, redirect URI 셋(prod · `dev.mal-moi.com` · localhost) — 등록자가 떠나도 앱이 남는다(불변식 6 근거와 같은 결). 방침 개정이 env 투입보다 먼저거나 같은 배포여야 한다(§7) |

## 5. 화면

**design-brief 없음** — 새 표면이 없다. 로그인 버튼은 켜진 공급자만 그리는 기존 `ProviderSubmit` 줄(DESIGN §6.62 "버튼이 하나여도 화면이 읽힌다")이 하나 늘 뿐이고, `/account` 수단 카드도 행이 하나 는다(DESIGN §6.67 "행 = 켜진 공급자"). 글리프는 이미 있는 `GitlabIcon`(`components/signin/brand-icons.tsx:52`, 단색 `currentColor` — gitlab-repositories D10, `gitlab-glyph.test.ts`)을 쓴다.

**손 사본 정리**: 공급자 → 글리프 2갈래 삼항이 다섯 자리다 — `app/signin/page.tsx:132` · `app/invite/[token]/page.tsx:240` · `app/oauth/authorize/page.tsx:288` · `app/signin/link/[challenge]/page.tsx:103` · `components/account/login-methods.tsx:101`. 라벨 삼항이 셋(`app/signin/page.tsx:75` · `invite:238` · `authorize:286`). 셋째 갈래를 다섯 번 더 쓰지 않고 `brand-icons.tsx`에 `ProviderIcon({ provider })`(공급자 → 글리프 `Record<LoginProvider, …>`)를 두고 이관한다 — 실재하는 사본의 이관이다(CLAUDE.md 작업 원칙). 라벨은 `m.signIn[provider]`로 인덱싱한다. `provider-progress.test.tsx:56`의 `toHaveLength(2)`는 진입 페이지 수(호출부)를 세는 단언이라 공급자와 무관한지 확인하고 고친다.

**새 사전 키**(en → ko·es 같은 커밋, `/translate` 모드 ①):
- `signIn.gitlab`: `Continue with GitLab`
- `link.providers.gitlab`: `GitLab`

`AccessDenied` 문구("email may not be verified")는 공급자 중립이라 그대로다.

## 6. 경계 — 로그인 ≠ 인가, 로그인 ≠ 연결

- **불변식 7**: GitLab 로그인은 `ProjectMember`를 만들지 않는다. GitLab 그룹·프로젝트 멤버십을 읽지 않는다(스코프 `read_user`로는 읽을 수도 없다).
- **불변식 6 · CLAUDE.md 자격증명 절**: GitLab 쓰기는 `Project.gitlabConnectionId`의 PAT만 쓴다(그대로). 로그인 `Account(provider = "gitlab")`는 그 판정의 입력이 아니다.
- **테스트** — `lib/github-connect/__tests__/credential-separation.test.ts`에 둘을 더한다:
  1. 로그인 경로(`auth.ts`·`lib/auth/**`·`lib/login-link/**`·`lib/account-connect/**`·`lib/session-revocation/**`)가 `@/lib/gitlab/`·`@/lib/gitlab-connect/`를 import하지 않는다.
  2. GitLab 쓰기·연결 경로(`lib/gitlab/**`·`lib/gitlab-connect/**`·`lib/repo-host/**`)가 `account` 모델(`prisma.account`·`tx.account`)을 읽지 않는다.
- **해제 독립**: `unlinkLoginMethod("gitlab")`은 `GitLabConnection`을 건드리지 않고 `disconnectGitLab`은 `Account`를 건드리지 않는다 — 격리 PG 시나리오 하나(spec §4-6).

## 7. 개인정보 방침

gitlab.com은 이미 전송처다(`messages/en.tsx:880` — PAT 연결). 새 **전송처는 없고 새 목적이 있다**(로그인) — `/push` 4단계 사람 판정 넷 중 "새 목적"에 걸린다.

- 본문 en(`messages/en.tsx:706-968`)·ko(`messages/ko-privacy.tsx`): "GitHub or Google"로 로그인을 말하는 자리 전부(`:742`·`:751-753`·`:768`·`:814`·`:881`·`:888`·`:912`·`:924`·`:941` — ko 대응 `:35`·`:44-46`·`:61`·`:107`·`:174`·`:181`·`:204`·`:216`·`:226`)를 셋으로. GitLab 전송처 줄(`:880`)에 "signing you in, if you choose GitLab" 목적을 더한다. 아바타 줄(`:814`·`:888`)은 GitHub·Google 그대로 둔다(D3 — 받지 않는다) — 거짓 문장을 만들지 않는다(POSTMORTEM 2026-09-19).
- `lib/privacy/collected.ts` — `Account`를 재사용하므로 **새 필드가 없다**(typecheck가 요구하지 않는다). `:150-154` 주석의 "GitHub·Google 연결"만 고친다.
- `lib/privacy/__tests__/policy-gate.test.tsx` — `REVISIONS`에 새 행(시행일·digest·koDigest), en·ko `effectiveDate`·`changes`. ⚠️ **`:310`이 `body.effectiveDate`를 리터럴 `"2026-10-12"`로 고정한다** — 같이 고친다(에이전트 조사로 확인).
- 셀프 호스팅 운영자 재료(가이드 `self-hosting/troubleshooting.md` 저장 필드·전송처 표, en·ko·es): Account 행 "GitHub or Google" → 셋, GitLab 전송처 행에 로그인 목적.
- **시행 순서**: 방침 개정이 hosted에서 GitLab 로그인을 켜는 것(D5)보다 먼저거나 같은 배포여야 한다 — 코드가 방침보다 앞서면 방침이 거짓이다.

## 8. 환경변수·운영

**새 환경변수**: `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET` (선택 쌍). `.env.example`·`deploy/.env.example`·`deploy/compose.yaml`·preflight 표·가이드 설치 표(en·ko·es) — SELF-HOSTING §3 체크리스트 4·8·9를 지난다.

- **callback**: `<origin>/api/auth/callback/gitlab`. hosted는 GitLab 앱 하나에 redirect URI 셋(`https://mal-moi.com/…` · `https://dev.mal-moi.com/…` · `http://localhost:3000/…`) — GitLab 애플리케이션은 redirect URI를 줄마다 하나씩 여러 개 받는다. GitHub OAuth App·Google 클라이언트와 같은 "세 환경 같은 값" 모델이다(OPERATIONS "새 머신 셋업" `:100-102`).
- **앱 설정**: Confidential 켬 · 스코프 `read_user` 하나 · 그룹 소유(D5). GitLab에는 Google의 "게시(In production)"·도메인 소유권 검증 같은 게시 단계가 **없다** — 등록 즉시 모든 gitlab.com 사용자가 쓸 수 있다(실물 T0에서 다른 계정으로 확인). 사용자는 첫 로그인에서 GitLab의 인가 화면(앱 이름·스코프)을 한 번 본다 — 앱 이름을 `Malmoi`로 한다.
- **Vercel env**: Production·Preview 환경별 변수로 넣는다(CLAUDE.md — 한 변수로 묶으면 `vercel env rm … preview`가 Production까지 지운다). Sensitive라 `vercel env pull`로 못 가져오고 `.env.local`은 사람이 채운다(에이전트 편집 금지).
- **OPERATIONS**: "GitLab 로그인 앱" 절 — 등록 위치(그룹 Applications)·redirect URI 셋·secret 회전(GitLab은 "Renew secret" — 회전 순간 진행 중인 로그인만 깨진다)·preview는 `dev.mal-moi.com`에서만 로그인된다는 기존 함정.
- **self-hosted**: 설치 가이드 표에 GitLab 행(`<ORIGIN>/api/auth/callback/gitlab` · `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET`), `install.md:18`의 "at least one GitHub or Google sign-in provider is still required … there are no GitLab environment variables" 문장 교체(GitLab 전용 설치는 이제 GitLab 로그인 하나로 기동한다). `troubleshooting.md:12-13`의 `no-login-provider`가 세 이름을 찍는다. `operate.md` "Turn a sign-in provider off". SELF-HOSTING §7 "로그인 공급자 단독 구성" 행(미실행)에 GitLab 단독을 더한다.

## 9. 불변식 영향

- **export 결정성·blob SHA**: 없음.
- **인증 경계(ARCHITECTURE §6)**: 로그인 공급자가 하나 는다. 보존 방법 — 검증된 이메일 판정을 provider `profile()`에 두고(§2), `allowDangerousEmailAccountLinking`을 켜지 않으며(`provider-config.test.ts:27`), `linkAccount` 거부(sec-audit-2 #31)를 우주 파생으로 넓히고(§3), 토큰을 저장하지 않는다(J4). 켜진 공급자만 Auth.js에 들어가는 방어선(`withEnabled`)은 그대로다.
- **불변식 6·7**: §6.

## 10. POSTMORTEM 소환

| 날짜 | 함정 | 이 기능에서 |
|---|---|---|
| 2026-08-31 · 🔁 | env를 모듈 최상위에서 읽어 CI·빌드가 죽었다 | `GitLab(...)`은 env를 읽지 않는 객체로 최상위에 두고, 켜진 집합은 config 함수 안 `enabledLoginProviders()`가 요청마다 읽는다(기존 형) |
| 2026-09-03 🔁 | userinfo 실패를 `null`로 접어 `profile.id.toString()`이 `Configuration`으로 터졌다 | `gitlabProfile`이 id 부재에서 명시적으로 던진다(§2) |
| 2026-09-05 | 검증한 값과 저장한 값이 갈렸다 | 판정을 `profile()`에 둔다 — `signIn` 콜백에서 검사만 하지 않는다 |
| 2026-09-07 | 클라이언트 번들 7.2MB | `LOGIN_PROVIDERS`를 넓혀도 `login-link/policy.ts`가 env·서버 모듈을 import하지 않는다(`client-graph.test.ts`) |
| 2026-09-10 · 2026-09-12 | 버려진 왕복이 다음 callback을 먹었다 · 오류 착지가 초대 복귀점을 잃었다 | 새 왕복 종류가 아니라 공급자만 는다 — 기존 `clearAuthRoundtripCookies`·`destFromCallbackUrl` 경로를 그대로 탄다. 실물 T6에서 초대 링크 → GitLab 로그인 → 거부(미확인 이메일) → 초대 복귀를 한 번 밟는다 |
| 2026-09-18 | 가드가 호출이 아니라 이름을 셌다 | `provider-config.test.ts:73`의 `withEnabled([github, google], enabled)` 정규식을 셋으로 고치되, 방어선은 `withEnabled` 행동 테스트가 진다 |
| 2026-09-19 | 방침이 green인 채 거짓 세 문장 | §7 — 아바타 줄을 D3과 맞춘다. 방침 문장은 사람 판정 |
