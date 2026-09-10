# github-connect — 설계

`spec.md`가 무엇을, 이 문서가 어떻게. 정본은 `docs/SAAS.md` §5.4·§8 4단계다.

> 2026-09-06 `/feature-review` 반영. 바뀐 결정: **리포 고정**(셀렉트 없음, §3.2) · **connect는 Server Action,
> Route Handler는 callback 하나**(§3.1) · **probe 근거는 `GET /repos/{o}/{r}/installation`**(§3.3) ·
> Account 쓰기는 `create` + P2002(§3.1) · 토큰 refresh는 유지하되 저장·경합·실패 규칙을 명시(§2.4) ·
> 연결 해제 추가(§3.4) · 디렉터리는 `lib/github-connect/`(§4).

## 1. 영향 받는 흐름

**셋 중 어디에도 붙지 않는다 — 넷째 축이다.**

| 흐름 | 영향 |
|---|---|
| push | 없음. `/api/push`의 인증·라우팅은 5단계(`pushTokenHash`)가 손댄다 |
| 편집 UI | **새 화면 하나** — `/projects/:slug/settings`. 번역 화면은 툴바에 링크 한 줄만 (UI 동결, MVP §8.3) |
| pull | 없음. 다만 `Project.installationId`가 이제 **사람 손이 아니라 검증된 경로로** 채워진다 |

⚠️ **`lib/pull/`·`lib/adapters/`를 한 줄도 건드리지 않는다.** 어댑터 재측정 트리거(`/push` 4d)가
걸리지 않는다는 뜻이고, 그게 이 단계를 작게 유지하는 판정 기준이다. `lib/github.ts`에는 읽기 함수
`probeRepo` 하나가 는다 — `lib/pull/__tests__/trigger.test.ts:14`가 그 모듈을 factory로 통째 mock하므로
`trigger.ts`가 `probeRepo`를 쓰게 되면 그 mock도 손본다(지금은 쓰지 않는다).

## 2. 핵심 결정 — 사용자 토큰을 어디서 얻나

### 2.1 문제

SAAS §5.4의 3중 검증은 이렇다.

```
User에 GitHub Account가 연결됨
  AND 로그인 사용자가 그 installation에 접근 가능
  AND installation이 선택한 repository에 접근 가능
```

셋째는 App 토큰으로 쉽다. **둘째가 어렵다** — "이 사람이 이 설치에 접근 가능한가"를 권위 있게
답하는 것은 GitHub뿐이고, 그 답을 주는 엔드포인트는 둘이다.

```
GET /user/installations                        → 이 사용자가 접근 가능한 설치
GET /user/installations/{id}/repositories      → 그 설치 안에서 이 사용자가 접근 가능한 리포
```

⚠️ **이 둘은 GitHub **App**이 발급한 user-to-server 토큰을 요구한다.** 우리의 로그인은 별도
**OAuth App** 셋(프로덕션·preview·로컬)이고, 그 토큰으로는 부른다 해도 우리 App의 설치 목록이
나오지 않는다. 즉 **지금 가진 자격증명 어느 것으로도 둘째 조건을 물을 수 없다.**

⚠️ **둘 다 페이지네이션이다** (기본 30, 최대 100). 첫 페이지만 보면 31번째 리포가 `repo-forbidden`으로
**거짓 거부**된다. `octokit.paginate`로 전 페이지를 읽는다 — 표시용이 아니라 **인가 판정용**이라 잘라서는
안 된다.

기각한 대안 둘:

- **OAuth App에 `repo` 스코프를 더해 `GET /repos/{o}/{r}`로 사용자 접근을 확인** — GitHub OAuth App에는
  "비공개 리포 읽기 전용" 스코프가 없다. 로그인 화면이 **모든 비공개 리포 읽기·쓰기**를 요구하게 되고,
  비개발자 동료를 초대하는 것이 Google provider를 넣은 이유 전부인데(SAAS §8 2단계) 그 사람들에게까지
  그 동의 화면이 뜬다.
- **App 토큰만으로 우회** — 설치 계정이 org면 사용자의 org 멤버십을 봐야 하고, 그것도 정답이 아니다
  (설치가 selected repositories면 org 멤버여도 그 리포를 못 볼 수 있다). **근사치로 인가를 판정하지 않는다.**

### 2.2 결정 — 로그인은 그대로 두고, **연결 전용 GitHub App 인가**를 추가한다

**GitHub App의 user-to-server OAuth를 우리 코드로 직접 태운다** — 나가는 쪽은 Server Action, 돌아오는 쪽은
Route Handler 하나(§3.1). Auth.js provider로 넣지 않는다.

기각한 대안 1: **로그인 provider 자체를 GitHub App으로 교체**하는 것. 매력적이다 — 자격증명이 하나로
줄고, GitHub App은 **callback URL을 10개까지** 받으므로 OAuth App 셋을 쓰는 지금의 아픔(CLAUDE.md
"GitHub OAuth 앱이 셋인데 `.env.local`이 갖는 건 하나뿐")이 사라진다. 그런데도 기각한다:

> **프로덕션 로그인을 방금 세웠고, 그것이 실물로 처음 성공한 것이 2026-09-06이다.** 그 전까지
> `AUTH_GITHUB_ID`에 client_id 대신 레코드 번호가 들어가 있어 **프로덕션 GitHub 로그인은 한 번도
> 성공한 적이 없었고, 허용 목록이 로그인을 막고 있어 그 사실이 드러날 경로가 없었다** (SAAS §8 2단계).
> 이 기능이 실패해도 로그인은 살아 있어야 한다.

2차 후보로 남긴다 — 조건은 "연결 화면의 두 번째 인가 클릭이 실제로 이탈을 만들 때"다.

기각한 대안 2: **Auth.js에 두 번째 GitHub provider(`id: "github-app"`)를 등록하고 로그인 상태에서
`signIn("github-app")`으로 링크.** 실물 확인(`@auth/core@0.41.3` `lib/actions/callback/handle-login.js:201-213`)
결과 이 경로는 **동작한다** — 세션이 있고 `userByAccount`가 없으면 `allowDangerousEmailAccountLinking`을 보지
않고 현재 세션 User에 `linkAccount`하고, 다른 User 소유면 `OAuthAccountNotLinked`를 던진다(= `taken-by-other`).
그럼에도 기각하는 이유 둘:

- **비로그인 상태에서 그 provider가 새 User를 만드는 로그인 경로로도 열린다.** `signIn` 콜백은
  `{ user, account, profile }`만 받고 **세션을 전혀 못 본다**(`callback/index.js:55-70`) — 콜백으로는 링크와
  신규를 가를 수 없다. 피해는 `ProjectMember` 없는 고아 User와 그 GitHub 계정이 `taken`이 되는 것이고 권한
  상승은 아니지만, 막을 수단이 라이브러리 안에 없다.
- **거부가 `pages.error = "/"`로 가고 로그인 상태면 `/projects`로 튕겨 문구가 유실된다** — POSTMORTEM
  2026-09-06 "거부가 통째로 무음" 부류다.

*(2026-09-06 정정: 이전 서술 "signIn 콜백이 링크/신규를 갈라야 하는데 내부 흐름에 묶인다"는 틀렸다 —
갈라야 하는 것이 아니라 **가를 정보가 콜백에 오지 않는다**.)*

### 2.3 토큰은 `Account` 행에 둔다 — **스키마 변경 없음**

SAAS §5.5가 이미 그렇게 적었다("같은 User에 **Account를 추가**한다"). `Account`는
`@@id([provider, providerAccountId])`이므로 `provider: "github-app"` 행이 로그인용
`provider: "github"` 행과 **충돌 없이 공존**한다. `access_token`·`refresh_token`·`expires_at` 컬럼이
이미 있다 (`prisma/schema.prisma:270-290`) — 어댑터가 OAuth 응답을 통째로 받기 위해 만든 컬럼들이고,
용도가 정확히 같다.

⚠️ **GitHub으로 로그인한 사람은 GitHub Account 행을 둘 갖게 된다** (`github` + `github-app`).
같은 GitHub 사용자를 가리키므로 `providerAccountId`가 같고, 이상해 보이지만 **의미가 다른 두 인가**다:
하나는 "이 사람이 누구인가", 하나는 "이 사람이 우리 App의 어느 설치를 볼 수 있는가".
**유일성 판정도 `github-app` 안에서만 한다** — 로그인 `github` 행이 다른 User 것이어도 연결을 막지 않는다
(2026-09-06 결정. 교차 거부는 로그인 경로의 소유권 정책까지 얽힌다).

**User당 App 연결은 하나다.** 다른 GitHub 계정으로 다시 인가하면 기존 `github-app` 행을 지우고 새 행을
만든다(교체, 한 트랜잭션). `planAccountLink`의 `replace` 갈래다.

⚠️ **어댑터와의 공존은 실물로 성립한다.** `@auth/prisma-adapter`의 `getUserByAccount`·`unlinkAccount`는
`where: { provider_providerAccountId }`로만 조회하므로(`prisma/__tests__/schema-contract.test.ts:101-104`가
이미 그 계약을 대조한다) `github-app` 행은 로그인 경로에 닿지 않는다. **새 테스트를 더하지 않는다** —
그 테스트는 정적 텍스트 대조라 "다른 provider 행이 걸리지 않는다"는 런타임 명제를 표현할 수 없고,
근거 자체는 이미 통과 중이다.

**어댑터의 `linkAccount`는 `create`만 한다 — 우리도 그 성질을 따른다.** `upsert`는 두 요청이 동시에
`existing: null`을 받았을 때 둘째의 update 분기가 첫째의 `userId`를 덮어쓰는 경합을 연다(§3.1).

### 2.4 토큰 만료 — refresh를 유지하고, 저장·경합·실패 규칙을 적는다

GitHub App user 토큰은 기본 8시간이고 refresh 토큰은 6개월이다. App 설정에서 만료를 끌 수 있지만
**끄지 않는다** — 만료 없는 토큰을 DB에 눕혀 두는 것이 순수 함수 하나보다 비싸다 (2026-09-06 재확인).

**refresh는 유지한다** (검수에서 "항상 reauthorize"가 대안으로 나왔고 기각 — 설정 화면을 8시간마다
GitHub으로 튕기는 것보다 갱신 규칙을 적는 쪽을 택했다). 그 대신 GitHub의 계약을 그대로 감당한다:

- **refresh 토큰은 1회용이다.** 갱신에 성공하면 이전 access/refresh 둘 다 무효다. 그래서 갱신 결과를
  **즉시 `Account`에 쓴다** — 안 쓰면 다음 요청이 반드시 `reauthorize`다 (POSTMORTEM 2026-09-05
  "검증한 값을 저장하지 않아"). `access_token`·`refresh_token`·`expires_at` 셋을 함께 갱신한다.
  `refresh_token_expires_in`은 컬럼이 없어 **버린다**(스키마를 늘리지 않는다) — refresh 토큰 만료는
  판정할 수 없고, **갱신 호출 실패가 곧 만료 신호**다.
- **경합**: 설정 탭 둘이 같은 만료 토큰을 읽어 둘 다 refresh하면 둘째가 `bad_refresh_token`을 받는다.
  쓰기는 `updateMany({ where: { provider, providerAccountId, refresh_token: <읽었던 값> }, data })`로
  **조건부**다 — count 0이면 다른 요청이 이미 회전시킨 것이므로 행을 **다시 읽어 그 토큰을 쓴다**.
  갱신 호출 자체가 실패해도 같은 재조회를 한 번 한다.
- **실패는 두 갈래다**: 재조회 뒤에도 안 되면(refresh 만료·인가 철회) `reauthorize`, 네트워크·5xx면
  `unavailable`. 접지 않는다 (POSTMORTEM 2026-09-03 부류).
- **사용자 토큰 GET이 401이면 `reauthorize`다** — 사용자가 GitHub 설정에서 우리 App 인가를 철회한
  경우이고 `expires_at`으로는 볼 수 없다.
- **`reauthorize`는 자동 redirect가 아니라 버튼이다** — 렌더 중 `redirect("/api/...")`로 자동 튕기면
  callback 실패 시 루프다. "GitHub 다시 연결" 버튼(= §3.1 시작 Action)으로 보인다. **이미 인가한 App이면
  GitHub이 화면 없이 즉시 되돌려보낸다.**

순수 판정은 `planTokenUse({ expiresAt, now, hasRefreshToken })` → `use | refresh | reauthorize`
(만료 60초 전을 만료로 본다 — 왕복 중 만료 방지)이고, 위의 저장·재조회·분류는 껍데기
`ensureUserToken(prisma, userId, now)`가 든다(§4).

## 3. 흐름

### 3.1 계정 연결

```
[설정 화면] "GitHub 연결" (또는 "GitHub 다시 연결")
  → Server Action startGithubConnect({ slug })
      getProjectAccess(project:settings) → 서명된 state 쿠키(userId·nonce·slug·exp 10분)
      → redirect("https://github.com/login/oauth/authorize?client_id=…&state=<nonce>")
  → GitHub (이미 인가했으면 화면 없이 통과)
  → GET /api/github/callback?code&state        ← Route Handler는 이것 하나
      requireUser() → verifyState(쿠키 ↔ 쿼리, userId 일치) → code 교환(user token)
      → GET /user (github user id·login)
      → planAccountLink → Account create / update(토큰만) / replace
      → state 쿠키 삭제 → 302 /projects/<slug>/settings[?e=<status>]
```

**나가는 쪽이 Server Action인 이유**: 외부로 302 나가는 것은 `cookies().set(...)` + `redirect(절대 URL)`로
Server Action이 할 수 있다. Route Handler가 필요한 것은 **GitHub이 브라우저를 되돌리는 callback**뿐이다 —
CLAUDE.md "내부 쓰기에 Route Handler 금지"와의 관계도 이렇게 정확해진다: callback은 호출자가 GitHub이라
그 규칙의 반대편이고, connect는 우리 UI가 부르므로 Action이다. *(2026-09-06 — 이전 설계의
`/api/github/connect` 라우트를 지웠다.)*

⚠️ **`state`는 쿠키와 쿼리 양쪽에 있어야 한다** — 쿼리만 보면 CSRF, 쿠키만 보면 GitHub이
돌려주는 값과 대조할 것이 없다. `userId`를 서명 대상에 넣어 **세션이 바뀐 채 돌아온 callback을
거부**한다(같은 브라우저에서 계정을 갈아탄 경우). 쿠키가 없으면 `state-mismatch`로 접는다.

⚠️ **목적지는 `next` 경로가 아니라 `slug`다.** 설정 화면 하나가 유일한 목적지이므로 state에 slug만 싣고
callback이 `/projects/<slug>/settings`를 조립한다 — open redirect 판정(`safeNext`)이 통째로 사라진다.
**state 검증에 실패하면 slug도 믿을 수 없다** → `/projects?e=<status>`로 간다(§3.5).

⚠️ **state 쿠키 속성**: `HttpOnly` · `SameSite=Lax` · `Path=/` · `Max-Age=600`. **`Secure`와 `__Host-` 접두는
https에서만** 붙인다 — `__Host-`는 `Secure`를 요구하고 Safari는 `http://localhost`에서 Secure 쿠키를 저장하지
않아 로컬 callback이 항상 `state-mismatch`가 된다. `lib/auth/cookie.ts`가 `__Secure-` 접두 유무를 프로토콜로
가르는 것과 같은 방식이다.

⚠️ **읽는 쪽은 두 이름을 다 본다** (`stateCookieNames`, 2026-09-06 `/code-review`). 쿠키를 심는 Action은
`x-forwarded-proto`를, callback은 요청 URL을 보는데 **둘은 다른 신호라 갈릴 수 있다** — 갈리면 쓴 이름과
찾는 이름이 달라져 연결이 100% `state-mismatch`가 되고, 증상이 바로 위 Safari 함정과 바이트 단위로 같아
서명·nonce를 의심하게 만든다. 쓰는 쪽만 정확하면 되고, 어느 이름으로 왔든 서명 검증은 따로 한다.
지울 때도 둘 다 지운다 — `__Host-` 쿠키는 `Secure` 없이 보내면 접두 규칙 위반으로 **무시돼 안 지워진다**.

⚠️ **callback의 엣지 셋**:
- `?error=access_denied`(사용자가 GitHub에서 취소) — `code`가 없다. state가 유효하면 설정 화면으로
  `?e=denied`, 아니면 `/projects?e=denied`.
- **code 재사용·만료 — GitHub 토큰 엔드포인트는 HTTP 200에 body `error: "bad_verification_code"`를 준다.**
  `res.ok`만 보면 `undefined` 토큰을 성공으로 읽는다. **`@octokit/oauth-app`의** `OAuthApp`(`clientType:
  "github-app"`, `createToken`·`refreshToken`·`getWebFlowAuthorizationUrl`)이 그 오류를 던져 주므로 손으로
  토큰 엔드포인트를 파싱하지 않는다. → `exchange-failed`.
  ⚠️ **`octokit`이 재수출하는 `OAuthApp`으로는 안 된다** (2026-09-06 실측): `defaults({ clientType:
  "oauth-app" })`로 고정된 클래스라 github-app 모드가 타입상 `never`로 접히고 `defaults`로도 못 되돌린다.
  이미 전이 의존성이던 `8.0.4`를 **직접 의존성으로 승격**했다 — pnpm strict에서는 명시해야 import된다.
- 세션이 왕복 중 만료 — `requireUser()`가 `/`로 보낸다. `code`는 잃지만 재시도로 복구되고, 로그인 화면이
  맞는 목적지다.

**Account 쓰기 규칙** (`planAccountLink`의 4갈래 → 껍데기):

| 판정 | 쓰기 |
|---|---|
| `link` (그 GitHub 계정 행 없음, 내 행도 없음) | `create`. **P2002면 다른 요청이 먼저 만든 것** → 행을 다시 읽어 내 것이면 `already-linked`, 아니면 `taken-by-other` |
| `already-linked` (그 행이 내 것) | `update` — **토큰 컬럼만**. `userId`는 update 데이터에 넣지 않는다 |
| `replace` (그 행 없음, 내 행은 다른 GitHub 계정) | 트랜잭션 — 내 옛 행 `delete` + `create` |
| `taken-by-other` (그 행이 다른 User 것) | **쓰지 않는다.** 토큰도 갱신하지 않는다 |

### 3.2 리포 재연결 (3중 검증) — **리포는 고정, 셀렉트 없음**

**Project의 `repoOwner/repoName`은 바꾸지 않는다** (spec §4 — 다른 리포는 다른 프로젝트). 그러면 화면에서
고를 것이 없어진다: 우리 App은 한 계정에 한 번만 설치되고 리포는 한 계정에 속하므로, **주어진 리포를
덮는 설치는 0개 또는 1개**다. 그 하나를 서버가 GitHub에 물어 얻는다.

```
[설정 화면] 렌더
  → requireProjectAccess({ slug, permission: "project:settings" })
  → probeRepo(project)                      ← App 쪽 (§3.3) — Account와 무관하게 항상
  → Account(github-app) 조회 → 있으면 ensureUserToken → GET /user (login 표시·401 감지)

[제출] Server Action connectRepository({ slug })          ← 클라이언트가 보내는 것은 slug뿐
  → getProjectAccess(project:settings)            ① 프로젝트 인가 → projectId·repoOwner·repoName
  → Account(github-app) + ensureUserToken          ② 계정 연결 여부 (없으면 not-connected / reauthorize)
  → probeRepo(project)                             App JWT: 이 리포를 덮는 installation id + 현재 full_name
  → GET /user/installations                        ③ 사용자 ↔ 설치  (전 페이지)
  → GET /user/installations/{id}/repositories      ④ 설치 ↔ 리포   (전 페이지)
  → planRepoConnect({ probe, userInstallationIds, userRepoFullNames })
      → ok { installationId, repoOwner, repoName }  → project.update (where: { id: projectId })
      → repo-not-installed | installation-forbidden | repo-forbidden | unavailable
```

⚠️ **`installationId`는 클라이언트에서 오지 않는다.** SAAS §5.4가 걱정한 "브라우저가 보낸 값을 그대로
저장"의 표면이 없다. 그래도 ③·④를 **제출 시점에 부른다** — 렌더 때 확인한 것을 믿으면 클라이언트가
보낸 값을 인가 근거로 쓰는 것과 같다(SAAS §5.2). "화면에 보였으니 권한이 있겠지"는 "middleware가
로그인을 확인했으니 프로젝트 접근도 됐겠지"(§5.1)와 같은 실수다.

**`repoOwner`·`repoName`이 바뀌는 유일한 경우는 `repo-moved`다** — probe가 돌려준 현재 `full_name`이
저장값과 다르면 `ok`의 인자로 새 이름이 실린다. 소유자 이전(다른 org로)도 같은 경로다 — **사람이
"다시 연결"을 눌러 확인한 뒤에만** 갱신되고, 자동으로 따라가지 않는다(§3.3).

⚠️ **같은 리포를 가리키는 Project 둘은 허용된다** (`lib/pull/trigger.ts:32-38`의 `syncBranchFor`가
slug별 브랜치를 쓰는 이유 — SAAS §7.1). `planRepoConnect`는 중복을 거부하지 않는다.

### 3.3 연결 건강성

**컬럼을 만들지 않는다** — SAAS §7.5가 "별도 상태 컬럼을 즉시 만들지 않는다"고 정했고, 이 판정은
**App 쪽 조회로 계산**된다. 설정 화면에서만 계산하고 목록에서는 계산하지 않는다. **OWNER 개인의 GitHub
계정 연결과 무관하게 항상 표시한다** — 계정을 아직 연결하지 않은 다른 OWNER도 "왜 pull이 안 되나"를
이 화면에서 봐야 한다.

```
probeRepo(owner, repo)                          ← lib/github.ts, App 쪽 두 호출
  1. App JWT   GET /repos/{owner}/{repo}/installation   → { id }        (404 · 403 → not-installed)
  2. 설치 토큰 GET /repos/{owner}/{repo}                 → { full_name } (리네임이면 301을 따라간 뒤의 이름)
```

**1을 근거로 쓰는 이유**: 설치 토큰으로 `GET /repos`만 보면 **public 리포는 접근을 철회한 뒤에도 200**이라
`ok`로 오판한다. `/installation`은 "이 리포에 우리 App이 설치돼 있는가"를 결정적으로 답한다. 2는 이름
감지용이고 1이 200일 때만 부른다(그때는 토큰 발급이 성공한다).

⚠️ **1의 실패 지점은 `GET /repos`가 아니라 토큰 발급일 수 있다** — 설치가 삭제되면
`getInstallationOctokit`의 `POST /app/installations/{id}/access_tokens`가 404를 던진다. **try가 클라이언트
생성까지 감싼다.** 오류 분류는 순수 `probeFromError(status)`(**404 → `not-installed`**, **401 → `error`**(JWT 무효 — 2026-09-06
실측 정정), **403 → `not-installed`**
(설치 suspended — 영구 상태를 `unknown`으로 두면 "잠시 뒤"가 영원히 뜬다), 그 외 → `error`)가 하고
`probeRepo`는 그것을 부른다. **예외를 삼켜 `not-installed`로 접지 않는다.** `lib/github.ts:41-43`의
`isNotFound`는 비공개라 export한다.

⚠️ **301 추종은 실측한다** — `@octokit/request`의 fetch 래퍼가 `redirect`를 넘기지 않아 기본값 follow로
동작할 것이지만, "문서가 아니라 실측"(POSTMORTEM 2026-09-01). tasks T5의 리네임 시나리오가 그 자리다.

| probe 결과 | `planConnectionHealth` | 화면 |
|---|---|---|
| `installationId`가 null | `not-connected` | "아직 설치가 연결되지 않았어요" · muted |
| `not-installed` (404·403) | `app-uninstalled` | "App이 제거·일시중지됐거나 이 리포 접근이 철회됐어요" · `text-destructive` 글자만 + 설치 링크 |
| 200이지만 `id` ≠ 저장값 | `installation-changed` | "App이 다시 설치됐어요 — 다시 연결하세요" · `text-destructive` 글자만 |
| 200, id 일치, `full_name` 불일치 | `repo-moved` | "리포가 `a/b`로 이동했어요 — 다시 연결하세요" · amber 칩 |
| 200, 둘 다 일치 | `ok` | "연결됨" · **무색** `text-muted-foreground` |
| **그 외 오류(네트워크·5xx)** | **`unknown`** | "확인할 수 없어요 — 잠시 뒤 다시" · muted |

⚠️ **마지막 줄이 이 표의 요지다.** 조회 실패를 `app-uninstalled`로 접으면 **장애가 "제거됨"으로
읽힌다** — POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어 경고가 존재하지 않는 것과 구별되지
않았다")과 2026-09-06("리다이렉트 횟수로 검증해서 전면 장애를 '정상'으로 읽었다")이 같은 부류다.
`readSession`이 `none`과 `unavailable`을 가른 것과 **정확히 같은 축**이다.

⚠️ **`repo-moved`·`installation-changed`를 자동으로 따라가지 않는다.** 조용히 갱신하고 싶어지지만,
그건 소유자 이전(다른 org로)까지 같은 코드로 삼키는 것이고 SAAS §7.9가 "App 제거해도 프로젝트를 지우지
않고 `needs_reconnect`로 두고 **재설치로 되돌린다**"고 정한 것과 같은 판단이다 — **사람이 확인한다.**
그래서 `repoId` 컬럼도 두지 않는다(§5). 재연결(§3.2)이 그 확인이다.

**`ok` 배지가 무색인 이유**: DESIGN §6.2에 초록이 없고 "가장 흔한 상태가 가장 조용해야 한다"(§6.1).
`pull-button`의 success도 muted다. **§6.2 밖의 raw 색을 늘리지 않는다** — amber(`repo-moved`)와
destructive(`app-uninstalled`·`installation-changed`)는 등재된 둘이다.

### 3.4 연결 해제

Server Action `disconnectGithub({ slug })` — `getProjectAccess(project:settings)`를 지나(진입점 GUARD) 세션
User의 `github-app` 행을 `delete`한다. **Project·번역 데이터는 건드리지 않는다** — 건강성은 App 토큰으로
계산되므로 해제 뒤에도 그대로 보인다. `taken-by-other`가 영구 잠금이 되지 않게 하는 경로다 — 이것이
없으면 잘못된 GitHub 계정으로 한 번 연결한 동료의 복구가 `db:studio`뿐이다.

⚠️ **한계 (2026-09-07 code-review 🟡3, 6단계로 이관):** 이 경로가 사는 화면이 `project:settings`라
**OWNER에서 강등된 사람은 자기 연결을 풀 수 없다** — 그 계정으로 연결하려는 다른 User는 위의 영구
잠금에 그대로 걸린다. Action의 인가만 낮추는 것으로는 안 된다(버튼이 있는 화면이 같은 게이트다).
`Account` 행은 사용자 소유이므로 섹션이 사용자 수준 화면으로 가야 한다 — SAAS §8 6단계.

### 3.5 거부가 화면에 닿는 경로 — 두 착지점

| 어디서 실패 | 착지 | 누가 읽나 |
|---|---|---|
| callback — state **유효** (slug 있음) | `/projects/<slug>/settings?e=<status>` | 설정 페이지가 `searchParams.e`를 `isConnectError`로 걸러 `connectErrorMessage` 한 줄 (`text-destructive text-sm`, `/projects` 형) |
| callback — state **무효** (`state-mismatch`·`state-expired`·`wrong-user`, 또는 `denied`인데 state 없음) | `/projects?e=<status>` | **`/projects/page.tsx`에 `isConnectError` 분기를 더한다** — 지금은 `isAccessError` 6개만 그린다(`:21`) |
| Server Action (`connectRepository`·`disconnectGithub`) | redirect 없음 — `{ ok } \| { error }` 반환 | 클라이언트 컴포넌트가 인라인 `text-destructive text-xs` (`invite-form.tsx` 형) |

⚠️ **둘째 줄이 이 표의 요지다.** `?e=`를 조립해 놓고 읽는 쪽을 안 만들면 거부가 무음이다(POSTMORTEM
2026-09-06). `entry-points.test.ts`의 "쿼리 파라미터 수신자" 검사는 대상 페이지가 `searchParams`를 **읽는지만**
보므로 `/projects`는 이미 읽고 있어 **이 회귀를 green으로 통과시킨다** — 그래서 `lib/github-connect/
__tests__/message.test.ts`가 union 전체를 값 배열로 들고, 두 착지 페이지의 소스에 `isConnectError`가 있는지
한 줄 스캔한다.

`ConnectError` union:

```
callback:  state-mismatch | state-expired | wrong-user | denied | exchange-failed | taken-by-other | unavailable
action:    not-connected | reauthorize | repo-not-installed | installation-forbidden | repo-forbidden | unavailable
```

Action은 `AccessError`(`forbidden`·`not-found`)도 돌려줄 수 있다 — 클라이언트는 `isAccessError`면
`accessErrorMessage`, 아니면 `connectErrorMessage`. `connectErrorMessage`는 **`inviteErrorMessage` 형**(`satisfies
never` + 폴백)이다 — `?e=`는 주소창 입력이라 던지는 `never`(`accessErrorMessage` 형)면 임의 문자열에 런타임
예외다.

## 4. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

**I/O는 전부 `lib/github-connect/user.ts`(사용자 토큰 호출)·`lib/github-connect/token-store.ts`(Account
읽기·쓰기)·`lib/github.ts`(App 호출)에 몰고, 판정은 전부 아래로 뺀다.** 이 목록이 비면 설계를 다시 본다.

디렉터리가 `lib/github/`가 아니라 **`lib/github-connect/`** 인 이유: `lib/github.ts` 파일과 `lib/github/`
디렉터리가 공존하면 번들러 해석은 파일이 이기지만, 자격증명 분리 테스트가 "같은 이름 안팎"을 가르는
형태가 된다. 기능 slug와 같은 이름으로 둔다.

| 함수 | 파일 | 입력 → 출력 |
|---|---|---|
| `planAccountLink({ sessionUserId, existing, current })` | `lib/github-connect/account-link.ts` | `existing`은 `providerAccountId`로 찾은 행 또는 null, `current`는 세션 User의 기존 `github-app` 행 또는 null → `link` / `already-linked` / `replace` / `taken-by-other`. **SAAS §5.5의 방어선** — 다른 User가 이미 그 GitHub 계정을 연결했으면 병합하지 않고 거부 |
| `signState` / `verifyState({ cookie, query, userId, now, secret })` | `lib/github-connect/state.ts` | HMAC-SHA256(`secret`) over `{userId, nonce, slug, exp}` → `{ ok, slug }` / `state-mismatch` / `state-expired` / `wrong-user`. **`secret`도 인자다** — 함수 안에서 `requireEnv`를 부르면 순수가 아니고 테스트가 env를 요구한다. Node `crypto`의 `createHmac`, 비교는 `timingSafeEqual`(길이 선검사 — `lib/push/auth.ts:16-21` 형), 키 도메인 라벨 `"malmoi-github-state"` |
| `planRepoConnect({ probe, userInstallationIds, userRepoFullNames })` | `lib/github-connect/connect-plan.ts` | **3중 검증의 판정 자리** → `ok { installationId, repoOwner, repoName }` / `repo-not-installed` / `installation-forbidden` / `repo-forbidden` / `unavailable`. **5단계 생성 경로가 그대로 재사용한다** (spec §2) |
| `planConnectionHealth({ project, probe })` | `lib/github-connect/health.ts` | §3.3 표 그대로 6갈래. `probe`는 `{ status: "ok", installationId, fullName } \| { status: "not-installed" } \| { status: "error" }` |
| `probeFromError(status)` | `lib/github-connect/health.ts` | HTTP status → `not-installed`(**403·404**) / `error`. ⚠️ **401은 `error`다** — 설치 부재가 아니라 App JWT가 무효라는 뜻이고, `not-installed`로 접으면 사용자가 헛되게 재설치한다 (2026-09-06 실측) |
| `planTokenUse({ expiresAt, now, hasRefreshToken })` | `lib/github-connect/token.ts` | `use` / `refresh` / `reauthorize`. 만료 60초 전을 만료로 본다 |
| `refreshFailure(status)` | `lib/github-connect/token.ts` | 갱신 호출의 실패 → `reauthorize` / `unavailable`. `Account`에 `refresh_token_expires_in`이 없어 **이 실패가 refresh 만료의 유일한 신호**다. ⚠️ **429는 4xx인데 `unavailable`이다** — 속도 제한은 거부가 아니다 |
| `stateCookieName(secure)` · `stateCookieNames()` | `lib/github-connect/state.ts` | 쓰는 쪽은 하나를 고르고 **읽는 쪽은 둘 다 본다** (§3.1) |
| `connectErrorMessage(status)` · `isConnectError(v)` | `lib/github-connect/message.ts` | §3.5 union 전부 → 한국어 한 줄("-요"). **`satisfies never` + 폴백**으로 갈래를 늘리면 컴파일 에러 (`inviteErrorMessage`와 같은 형) |

**DB 제약 하나**: `Account`를 `userId`로 `findUnique`할 수 없다 — unique가 `@@id([provider,
providerAccountId])` 하나뿐이라 `readAccount`와 "내 행 조회"는 **`findFirst`**다. "User당 App 연결 하나"는
우리 정책이지 DB가 강제하는 것이 아니다.

**타입 경계 하나**: `Project.installationId`는 **String**(`schema.prisma:29`)이고 GitHub API는 number다.
껍데기가 API 응답을 `String(id)`로 좁혀 `{ userInstallationIds: string[], userRepoFullNames: string[] }`로
넘긴다 — `lib/github.ts:54`가 `Number()`로 바꾸는 것과 대칭이다. 순수 함수는 문자열만 본다.

⚠️ **`connectErrorMessage`가 목록에 있는 것이 우연이 아니다.** 이 리포에서 두 번 밟은 지뢰가
"거부는 옳게 판정됐는데 화면에 닿지 않아 사용자에겐 버튼이 안 눌린 것으로 보였다"이다
(POSTMORTEM 2026-09-06, tenant-auth 실물 검증에서만 잡힌 결함 넷 중 하나). **판정 union을 만드는
커밋과 문구를 만드는 커밋을 나누지 않는다.**

*(2026-09-06 삭제: `safeNext` — 목적지가 slug라 필요 없다. `normalizeRepoRef` — 클라이언트가 리포를 보내지
않는다.)*

## 5. 스키마 변경 — **없다**

| 필요해 보이는 것 | 왜 안 만드나 |
|---|---|
| `GithubConnection` 테이블 | `Account`가 정확히 그 모양이고 SAAS §5.5가 이미 "Account를 추가한다"고 적었다 |
| `Project.connectionStatus` | §7.5 — 계산 가능하다. `SyncRun`(7단계)이 서기 전에 상태 컬럼을 만들면 그때 두 벌이 된다 |
| `Project.repoId` (숫자 id) | 리네임·이전을 자동 추적하려면 필요하지만 **자동 추적을 안 한다**(§3.3). `full_name` 비교로 감지하고 사람이 재연결한다 |
| `Account.refresh_token_expires_at` | refresh 만료는 갱신 실패로 안다(§2.4). 컬럼 하나를 위해 마이그레이션·배포 순서를 여는 값이 없다 |
| state 저장 테이블 | 서명 쿠키로 충분하다. 서버가 상태를 안 들면 정리 작업도 없다 |

**마이그레이션이 없다 = `/db`를 부르지 않는다 = `/push`·`/merge`의 DB 순서 판정이 걸리지 않는다.**

## 6. 새 환경변수 셋

| 이름 | 무엇 | 어디에 |
|---|---|---|
| `GITHUB_APP_CLIENT_ID` | App의 **OAuth client id** (`Iv23li…`). ⚠️ `GITHUB_APP_ID`(숫자)와 **다른 값**이다 | `.env.local` · Vercel Production · Preview |
| `GITHUB_APP_CLIENT_SECRET` | 위의 secret | 같음 |
| `GITHUB_APP_SLUG` | 설치 링크 `https://github.com/apps/<slug>/installations/new` 조립용. `GET /app`으로 얻을 수도 있지만 렌더당 호출이 하나 늘어 env로 둔다 | 같음 |

⚠️ **`GITHUB_APP_ID`와 `GITHUB_APP_CLIENT_ID`를 혼동하면 authorize가 404가 된다.** 프로덕션
`AUTH_GITHUB_ID`에 client_id 대신 **설정 페이지의 레코드 번호**를 넣어 로그인이 404였던 것과
글자 그대로 같은 실수다 (SAAS §8 2단계). `.env.example` 주석에 그 구별을 적는다.

✅ **세 환경이 같은 값을 쓴다** — GitHub App은 callback URL을 여러 개 등록할 수 있어서
`http://localhost:3000/...` · dev 고정 preview URL · `https://mal-moi.com/...` 셋을 한 App에 넣는다.
OAuth App 셋을 굴리는 지금과 반대이고, 그래서 재발급 순서(CLAUDE.md)가 늘어나지 않는다.

`AUTH_SECRET`은 state 서명에 **재사용**한다 — 새 시크릿을 늘리면 재발급 대상이 하나 더 는다.
`requireEnv("AUTH_SECRET")`은 리포에 아직 없다(Auth.js가 암묵적으로 읽는다) — Action·callback이
**함수 안에서** 부른다. ⚠️ 로컬과 프로덕션의 `AUTH_SECRET`이 다른 것은 이미 허용된 성질이고(세션이
갈릴 뿐), state는 같은 배포 안에서만 왕복하므로 영향이 없다.

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| SAAS §9-6 **OAuth와 installation token의 역할을 섞지 않는다** | **가장 크게 닿는다 — 그리고 강화한다.** 사용자 토큰은 `lib/github-connect/user.ts`에서만 살고 **GET만 부른다**(교환·갱신 제외). App 개인키는 `lib/github.ts`에서만 산다. `lib/github-connect/__tests__/credential-separation.test.ts`가 두 모듈의 교차 import를 소스에서 0으로 고정한다 — `entry-points.test.ts`와 같은 성질의 상시 방어선이다 |
| SAAS §5.5 **자동 계정 병합 금지** | `planAccountLink`의 `taken-by-other`가 방어선이고 쓰기는 `create`라 경합에서도 `userId`가 덮이지 않는다(§3.1). **`allowDangerousEmailAccountLinking`은 계속 어디에도 없다** (`provider-config.test.ts`가 이미 검사한다) |
| SAAS §9-5 **모든 쿼리를 인가된 `projectId`로** | `connectRepository`가 `getProjectAccess`가 **돌려준** `projectId`로 update한다. 클라이언트가 보낸 slug는 판정 입력일 뿐이고 `installationId`는 클라이언트에서 오지 않는다 |
| CLAUDE.md **차단은 두 층** | 새 페이지는 최상단에서 `requireProjectAccess`를 **던진다**. 조건부 렌더 금지 (POSTMORTEM 2026-08-31, 1.3MB 노출) |
| export 결정성 · blob SHA 비교 | **닿지 않는다.** `lib/adapters/`·`lib/pull/`을 건드리지 않는다 |
| CLAUDE.md **환경변수를 모듈 최상위에서 평가하지 않는다** | Action·callback·`user.ts`가 `requireEnv`를 **함수 안에서** 부른다. `createApp()`이 이미 그 형태다(`lib/github.ts:31-38`, POSTMORTEM 2026-08-31 + 🔁 재발 2건) |

### 7.1 Route Handler 하나 — 컨벤션 위반이 아니다

CLAUDE.md는 "내부 쓰기에 Route Handler를 새로 만들지 않는다"고 한다. `/api/github/callback`은
**예외가 아니라 그 규칙의 반대편**이다 — 부르는 쪽이 우리 UI가 아니라 **GitHub이 브라우저를 보내는
전체 페이지 내비게이션**이다. Server Action은 돌아오는 쪽을 받을 수 없다. (나가는 쪽은 Action이다 — §3.1.)

**`middleware.ts`의 `matcher`에 넣지 않는다.** 근거는 `/invite/[token]`을 넣지 않은 것과 같다 —
**URL이 값을 들고 있다.** callback이 `/`로 302되면 `code`가 사라지고, 사용자에게는 "연결을 눌렀는데
로그인 화면으로 돌아왔다"로 보인다. 대신 라우트가 스스로 **`requireUser()`** 를 지난다 —
`entry-points.test.ts:37`의 `GUARDS`는 `requireProjectAccess`·`getProjectAccess`·`requireUser` 셋이고
**`readSession`은 의도적으로 제외돼 있다**(`:231` "인증이지 프로젝트 인가가 아니다"). `requireUser`가
내부에서 `readSession`을 부르므로 장애/비로그인 구별도 그대로다. **예외 목록(`EXEMPT`)에 이름을 더하지
않는다.** *(2026-09-06 정정: 이전 서술의 `readSession` 직접 호출은 그대로 만들면 T3가 red였다.)*

## 8. 화면 — `/projects/:slug/settings`

DESIGN.md §9(Supabase 레퍼런스)의 일곱 축으로 판정한다. 이 화면에서 실제로 걸리는 것은 셋이다.
**셸은 목록 셸(`mx-auto max-w-2xl space-y-4 p-8`, DESIGN §5)** 이고, 좌측 사이드바(§9.1 첫 축)는 6단계에
아직 없는 것이므로 이 화면이 그 축을 만족한다고 쓰지 않는다.

**섹션 둘** — 둘은 **독립적으로 실패**한다(한쪽 API가 죽어도 다른 쪽은 그린다):

1. **리포 연결** (App 쪽) — `owner/repo`·`installationId` mono 칩(§4.1 mono 표면 불변식) + §3.3 건강성
   배지 + 상태에 따른 다음 행동:
   - `not-connected`·`app-uninstalled`·`installation-changed`·`repo-moved` → **"다시 연결"** 버튼
     (`connectRepository`, 클라이언트 컴포넌트 — pending 라벨 "연결하는 중…", 인라인 오류, 성공 시
     `revalidatePath`로 재렌더). GitHub 계정이 아직 없으면 버튼 대신 "재연결하려면 먼저 아래에서 GitHub
     계정을 연결하세요" 한 줄.
   - `app-uninstalled` → 설치 링크 `https://github.com/apps/<slug>/installations/new` + "설치 뒤 이 화면으로
     돌아와 '다시 연결'을 누르세요" (GitHub 설치 화면은 우리 slug를 모른다 — 돌아오는 길은 사람이다).
   - `ok` → 배지만. 버튼 없음.
2. **GitHub 계정** (사용자 쪽) — 연결됨: `@login` mono + **"연결 해제"**(`disconnectGithub`, pending "해제하는
   중…"). 없음: **"GitHub 연결"**(`startGithubConnect` — `<form action>`, 클라이언트 상태 없음). `GET /user`가
   401이면 "GitHub 인가가 철회됐어요" + **"GitHub 다시 연결"** 버튼(자동 redirect 금지 — §2.4). 조회가
   5xx면 "계정 정보를 가져오지 못했어요 — 잠시 뒤 다시" (`unknown`과 같은 축).

**렌더당 외부 호출 상한 3** (App 2 + 사용자 1). 설치·리포 목록은 제출 시에만 읽는다. `Suspense`·`loading.tsx`는
이 리포에 0개라 **넣지 않는다** — 동기 렌더 지연은 OWNER 전용 화면의 대가로 감수한다.

- **빈 상태에 다음 행동** — 위의 각 상태가 다음 행동을 든다. 문체는 "-요" (DESIGN §6.4).
- **식별자는 mono** — `owner/repo`, `installationId`, `@login`, slug.
- **상태는 작은 배지** — §3.3 표의 색. **§6.2에 없는 raw 색을 늘리지 않는다**.

⚠️ **EDITOR에게는 이 링크가 보이지 않는다.** 조건부 렌더는 차단이 아니므로(위 §7) 링크를 숨기는
것은 UI 예의일 뿐이고, 직접 URL을 쳐도 페이지 최상단이 `/projects?e=forbidden`으로 돌린다.

⚠️ **링크는 번역 화면 툴바에 단다** — `translations/page.tsx:103-118`의 `role === "OWNER"` 블록(InviteForm 옆).
`(edit)/layout.tsx`에는 사이드바도 slug도 없다(`/projects` 목록까지 감싼다). 설정 화면에는 "← 번역"
링크. 경로는 `` `/projects/${slug}/settings` `` 템플릿 리터럴이다 — 이 리포에 공용 route 헬퍼는 없고
POSTMORTEM 2026-09-05의 "링크 생성기"는 번역 페이지 로컬 `qs()`였다. ⚠️ **`entry-points.test.ts`의 "죽은
라우트 링크" 검사는 단일 세그먼트 리터럴만 잡아 이 템플릿 리터럴은 검사 밖이다** — 그래서 T5가 링크
클릭을 수동으로 확인한다.


## 순서 판정 — 인가가 App 자격증명보다 앞이다 (2026-09-09, sec-audit 발견 5)

**온보딩의 `checkRepoAccess`는 사용자 토큰으로 내 설치 목록을 먼저 읽고, 그 목록에 없으면
`probeRepo`를 부르지 않는다.** 전에는 반대였고, `RepoInput`이 `z.string().min(1)` 둘뿐이라
**로그인만 한 사람이 임의 private 리포에 대해 "말모이 App이 설치돼 있는가"를 물을 수 있었다** —
반환 갈래가 `repo-not-installed`와 `installation-forbidden`으로 갈려 그대로 화면 문구가 됐다.

⚠️ **갈래를 합치는 것이 수정의 요지다.** 두 사유를 구별해 주는 것이 곧 오라클이므로, 내 설치에
없는 리포는 **한 갈래**(`repo-not-installed`)로 거부한다.

⚠️ **`repo-forbidden`은 설정 화면의 재연결 경로에 그대로 살아 있다** — 거기서는 리포가 `Project`
행에 고정이라 페이로드가 대상을 고를 수 없고, 따라서 오라클이 아니다. 갈래를 지우지 않은 이유가
그것이다 (POSTMORTEM 2026-09-08 "도달 불가한 오류 갈래를 겨냥한 테스트가 1년치 green이었다" —
지우는 쪽도, 남기는 쪽도 **도달 가능성을 확인하고** 정한다).

⚠️ **3중 검증(`planRepoConnect`)은 약해지지 않았다** — 순서만 바뀌었고 빈 목록을 통과로 읽지 않는
fail-closed가 그대로다. 한 설치의 실패가 나머지를 막지 않는 것도 `listConnectableRepos`와 같다.


## Credential 저장 보호 연결 (2026-09-10 구현, 운영 전환 대기)

callback의 User 잠금·소유자 조건은 유지하며 `github-app` access/refresh를 독립 토큰 키의 AES-256-GCM envelope로 저장한다. AAD는 사용자·provider·providerAccountId·필드를 묶는다. token-store는 GitHub 호출 직전에만 복호화하고, 일회용 refresh 소비 전에 active 쓰기 키를 검증한다. 갱신 CAS는 **조회한 refresh 암호문 원본 + userId + providerAccountId**이며 새 토큰 쌍과 expires_at을 함께 쓴다. CAS 실패는 승자 재조회이며 연결을 다시 생성하지 않는다.

키/인증 복호화 오류는 unavailable이고 자동 평문 fallback·자동 재연결은 없다. 로그에는 ref·단계·HTTP 상태 또는 unavailable만 남긴다. 키 회전은 트래픽과 진행 중 refresh를 차단한 상태에서 수행한다. 현재 로컬 코드·격리 PostgreSQL 검증과 실제 서비스 전환은 별개다. [credential 스펙](../credential-storage/spec.md)·[운영 절차](../credential-storage/operations.md)가 그 경계를 정한다.
