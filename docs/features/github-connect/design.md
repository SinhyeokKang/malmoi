# github-connect — 설계

`spec.md`가 무엇을, 이 문서가 어떻게. 정본은 `docs/SAAS.md` §5.4·§8 4단계다.

## 1. 영향 받는 흐름

**셋 중 어디에도 붙지 않는다 — 넷째 축이다.**

| 흐름 | 영향 |
|---|---|
| push | 없음. `/api/push`의 인증·라우팅은 5단계(`pushTokenHash`)가 손댄다 |
| 편집 UI | **새 화면 하나** — `/projects/:slug/settings`. 번역 화면은 손대지 않는다 (UI 동결, MVP §8.3) |
| pull | 없음. 다만 `Project.installationId`가 이제 **사람 손이 아니라 검증된 경로로** 채워진다 |

⚠️ **`lib/pull/`·`lib/adapters/`를 한 줄도 건드리지 않는다.** 어댑터 재측정 트리거(`/push` 4d)가
걸리지 않는다는 뜻이고, 그게 이 단계를 작게 유지하는 판정 기준이다.

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

기각한 대안 둘:

- **OAuth App에 `repo` 스코프를 더해 `GET /repos/{o}/{r}`로 사용자 접근을 확인** — GitHub OAuth App에는
  "비공개 리포 읽기 전용" 스코프가 없다. 로그인 화면이 **모든 비공개 리포 읽기·쓰기**를 요구하게 되고,
  비개발자 동료를 초대하는 것이 Google provider를 넣은 이유 전부인데(SAAS §8 2단계) 그 사람들에게까지
  그 동의 화면이 뜬다.
- **App 토큰만으로 우회** — 설치 계정이 org면 사용자의 org 멤버십을 봐야 하고, 그것도 정답이 아니다
  (설치가 selected repositories면 org 멤버여도 그 리포를 못 볼 수 있다). **근사치로 인가를 판정하지 않는다.**

### 2.2 결정 — 로그인은 그대로 두고, **연결 전용 GitHub App 인가**를 추가한다

**GitHub App의 user-to-server OAuth를 우리 라우트 둘로 직접 태운다.** Auth.js provider로 넣지 않는다.

기각한 대안: **로그인 provider 자체를 GitHub App으로 교체**하는 것. 매력적이다 — 자격증명이 하나로
줄고, GitHub App은 **callback URL을 10개까지** 받으므로 OAuth App 셋을 쓰는 지금의 아픔(CLAUDE.md
"GitHub OAuth 앱이 셋인데 `.env.local`이 갖는 건 하나뿐")이 사라진다. 그런데도 기각한다:

> **프로덕션 로그인을 방금 세웠고, 그것이 실물로 처음 성공한 것이 2026-09-06이다.** 그 전까지
> `AUTH_GITHUB_ID`에 client_id 대신 레코드 번호가 들어가 있어 **프로덕션 GitHub 로그인은 한 번도
> 성공한 적이 없었고, 허용 목록이 로그인을 막고 있어 그 사실이 드러날 경로가 없었다** (SAAS §8 2단계).
> 이 기능이 실패해도 로그인은 살아 있어야 한다.

2차 후보로 남긴다 — 조건은 "연결 화면의 두 번째 인가 클릭이 실제로 이탈을 만들 때"다.

**Auth.js provider로 넣지 않는 이유도 하나다.** 두 번째 GitHub provider를 등록하면
`/api/auth/signin/<id>`가 **새 사용자를 만드는 로그인 경로**로도 열린다. 그 경로를 막으려면
`signIn` 콜백이 "링크 중인지 신규인지"를 갈라야 하는데, 그 판정은 `@auth/core`의 내부 흐름
(`handle-login.js`)에 묶인다 — `next-auth`가 beta라 마이너에서 움직인다는 것이 이 리포의 전제다
(CLAUDE.md 스택). **~120줄의 우리 코드가 라이브러리 내부 계약보다 싸다.**

### 2.3 토큰은 `Account` 행에 둔다 — **스키마 변경 없음**

SAAS §5.5가 이미 그렇게 적었다("같은 User에 **Account를 추가**한다"). `Account`는
`@@id([provider, providerAccountId])`이므로 `provider: "github-app"` 행이 로그인용
`provider: "github"` 행과 **충돌 없이 공존**한다. `access_token`·`refresh_token`·`expires_at` 컬럼이
이미 있다 — 어댑터가 OAuth 응답을 통째로 받기 위해 만든 컬럼들이고, 용도가 정확히 같다.

⚠️ **GitHub으로 로그인한 사람은 GitHub Account 행을 둘 갖게 된다** (`github` + `github-app`).
같은 GitHub 사용자를 가리키므로 `providerAccountId`가 같고, 이상해 보이지만 **의미가 다른 두 인가**다:
하나는 "이 사람이 누구인가", 하나는 "이 사람이 우리 App의 어느 설치를 볼 수 있는가".

⚠️ **어댑터의 델리게이트를 우리가 쓰는 것이므로 `prisma/__tests__/schema-contract.test.ts`가
계속 진실이어야 한다.** 우리 쓰기는 `provider`가 다른 별개 행이라 어댑터 조회(`getUserByAccount`)에
걸리지 않는다 — 이 성질을 테스트로 고정한다(T2).

**토큰 만료는 `planTokenUse`가 판정한다.** GitHub App user 토큰은 기본 8시간이고 refresh 토큰이 6개월이다.
App 설정에서 만료를 끌 수 있지만 **끄지 않는다** — 만료 없는 토큰을 DB에 눕혀 두는 것이,
`use | refresh | reauthorize` 세 갈래 순수 함수 하나보다 비싸다. `reauthorize`는 authorize로 다시
튕기는 것이고, **이미 인가한 App이면 GitHub이 화면 없이 즉시 되돌려보낸다.**

## 3. 흐름

### 3.1 계정 연결

```
[설정 화면] "GitHub 연결"
  → GET /api/github/connect?next=/projects/<slug>/settings
      requireUser() → 서명된 state 쿠키(userId·nonce·next·exp 10분) → 302 github.com/login/oauth/authorize
  → GitHub (이미 인가했으면 화면 없이 통과)
  → GET /api/github/callback?code&state
      requireUser() → verifyState(쿠키 ↔ 쿼리, userId 일치) → code 교환(user token)
      → GET /user (github user id)
      → planAccountLink → Account upsert
      → 302 state.next
```

⚠️ **`state`는 쿠키와 쿼리 **양쪽**에 있어야 한다** — 쿼리만 보면 CSRF, 쿠키만 보면 GitHub이
돌려주는 값과 대조할 것이 없다. `userId`를 서명 대상에 넣어 **세션이 바뀐 채 돌아온 callback을
거부**한다(같은 브라우저에서 계정을 갈아탄 경우).

⚠️ **`next`는 우리 사이트 내부 절대경로만 허용한다** (`/`로 시작하고 `//`가 아닌 것).
open redirect가 되면 로그인된 사용자를 남의 사이트로 보낸다. 판정은 `safeNext`가 한다.

### 3.2 리포 연결 (3중 검증)

```
[설정 화면] 렌더
  → requireProjectAccess({ slug, permission: "project:settings" })
  → Account(github-app) 없음  → "GitHub 연결" 버튼만 보이고 끝
  → 있음 → planTokenUse → (필요하면 refresh) → GET /user/installations
                                              → GET /user/installations/{id}/repositories
  → 설치·리포 목록을 셀렉트로 (설치가 0개면 "App 설치하기" 링크 — GITHUB_APP_SLUG)

[제출] Server Action connectRepository({ slug, installationId, repoOwner, repoName })
  → getProjectAccess(project:settings)            ① 프로젝트 인가
  → Account(github-app) 조회 + 토큰 확보           ② 계정 연결 여부
  → GET /user/installations                        ③ 사용자 ↔ 설치  (다시 부른다)
  → GET /user/installations/{id}/repositories      ④ 설치 ↔ 리포   (다시 부른다)
  → planRepoConnect(...)  → ok 면 project.update({ installationId, repoOwner, repoName })
```

⚠️ **제출 시점에 목록을 다시 부른다.** 렌더 때 검증한 목록을 폼에 실어 보내고 그걸 믿으면,
클라이언트가 보낸 값을 인가 근거로 쓰는 것이 된다 — SAAS §5.2가 정면으로 금지한 형태다.
"화면에 보였으니 권한이 있겠지"는 "middleware가 로그인을 확인했으니 프로젝트 접근도 됐겠지"(§5.1)와
같은 실수다.

⚠️ **`baseBranch`는 이 화면에서 바꾸지 않는다.** 리포가 바뀌면 옛 base branch가 존재하지 않을 수
있지만, 그 검증(브랜치 존재 확인)은 5단계 온보딩이 base head를 읽을 때 자연스럽게 붙는다. 여기서
미리 넣으면 쓰이지 않는 축이 하나 늘어난다.

### 3.3 연결 건강성 (`needs_reconnect`)

**컬럼을 만들지 않는다** — SAAS §7.5가 "별도 상태 컬럼을 즉시 만들지 않는다"고 정했고, 이 판정은
**App 토큰 조회 한 번으로 계산**된다. 설정 화면에서만 계산하고 목록에서는 계산하지 않는다.

```
probeRepo(project)  ← App 토큰 (installation octokit)
  GET /repos/{owner}/{repo}   → full_name, (리네임이면 GitHub이 301로 새 이름을 준다)
```

| probe 결과 | `planConnectionHealth` | 화면 |
|---|---|---|
| `installationId`가 null | `not-connected` | "아직 리포가 연결되지 않았습니다" |
| 401/404 (설치 없음) | `app-uninstalled` | "App이 제거됐거나 이 리포 접근이 철회됐습니다" + 설치 링크 |
| 200이지만 `full_name` 불일치 | `repo-moved` | "리포가 `a/b`로 이동했습니다" + 재연결 버튼 |
| 200이고 일치 | `ok` | 초록 배지 |
| **그 외 오류(네트워크·5xx)** | **`unknown`** | "확인할 수 없습니다 — 잠시 뒤 다시" |

⚠️ **마지막 줄이 이 표의 요지다.** 조회 실패를 `app-uninstalled`로 접으면 **장애가 "제거됨"으로
읽힌다** — POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어 경고가 존재하지 않는 것과 구별되지
않았다")과 2026-09-06("리다이렉트 횟수로 검증해서 전면 장애를 '정상'으로 읽었다")이 같은 부류다.
`readSession`이 `none`과 `unavailable`을 가른 것과 **정확히 같은 축**이다.

⚠️ **`repo-moved`를 자동으로 따라가지 않는다.** 리포 이름이 바뀌면 `repoOwner`·`repoName`을 조용히
갱신하고 싶어지지만, 그건 소유자 이전(다른 org로)까지 같은 코드로 삼키는 것이고 SAAS §7.9가
"App 제거해도 프로젝트를 지우지 않고 `needs_reconnect`로 두고 **재설치로 되돌린다**"고 정한 것과
같은 판단이다 — **사람이 확인한다.** 그래서 `repoId` 컬럼도 두지 않는다(§5).

## 4. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

**I/O는 전부 `lib/github/user.ts`(사용자 토큰 호출)와 `lib/github.ts`(App 호출)에 몰고, 판정은 전부
아래로 뺀다.** 이 목록이 비면 설계를 다시 본다.

| 함수 | 파일 | 입력 → 출력 |
|---|---|---|
| `planAccountLink({ sessionUserId, existing })` | `lib/github/account-link.ts` | `existing`은 `providerAccountId`로 찾은 `Account` 행 또는 null → `link` / `already-linked` / `taken-by-other`. **SAAS §5.5의 방어선** — 다른 User가 이미 그 GitHub 계정을 연결했으면 병합하지 않고 거부 |
| `signState` / `verifyState({ cookie, query, userId, now })` | `lib/github/state.ts` | HMAC-SHA256(`AUTH_SECRET`) over `{userId, nonce, next, exp}` → `ok(next)` / `mismatch` / `expired` / `wrong-user`. 결정적이라 순수 취급 |
| `safeNext(raw)` | `lib/github/state.ts` | `/`로 시작하고 `//`·`\\`가 아닌 내부 경로만 통과, 그 외 `/projects` |
| `normalizeRepoRef(owner, name)` | `lib/github/repo-ref.ts` | 슬래시·공백·빈 값·`.`/`..`을 거른 `{owner, name}` 또는 null. **API를 부르기 전에** 건다 |
| `planRepoConnect({ installations, repos, chosen })` | `lib/github/connect-plan.ts` | **3중 검증의 판정 자리** → `ok` / `installation-forbidden` / `repo-forbidden` |
| `planConnectionHealth({ project, probe })` | `lib/github/health.ts` | §3.3 표 그대로 5갈래. `probe`는 `{ status: "ok", fullName } \| { status: "not-found" } \| { status: "error" }` |
| `planTokenUse({ expiresAt, now, hasRefreshToken })` | `lib/github/token.ts` | `use` / `refresh` / `reauthorize`. 만료 60초 전을 만료로 본다(왕복 중 만료 방지) |
| `connectErrorMessage(status)` | `lib/github/message.ts` | 위 union 전부 → 한국어 한 줄. **`never` 검사**로 갈래를 늘리면 컴파일 에러 (`pullMessage`·`accessErrorMessage`와 같은 형) |

⚠️ **`connectErrorMessage`가 목록에 있는 것이 우연이 아니다.** 이 리포에서 두 번 밟은 지뢰가
"거부는 옳게 판정됐는데 화면에 닿지 않아 사용자에겐 버튼이 안 눌린 것으로 보였다"이다
(POSTMORTEM 2026-09-06, tenant-auth 실물 검증에서만 잡힌 결함 넷 중 하나). **판정 union을 만드는
커밋과 문구를 만드는 커밋을 나누지 않는다.**

## 5. 스키마 변경 — **없다**

| 필요해 보이는 것 | 왜 안 만드나 |
|---|---|
| `GithubConnection` 테이블 | `Account`가 정확히 그 모양이고 SAAS §5.5가 이미 "Account를 추가한다"고 적었다 |
| `Project.connectionStatus` | §7.5 — 계산 가능하다. `SyncRun`(7단계)이 서기 전에 상태 컬럼을 만들면 그때 두 벌이 된다 |
| `Project.repoId` (숫자 id) | 리네임·이전을 자동 추적하려면 필요하지만 **자동 추적을 안 한다**(§3.3). `full_name` 비교로 감지하고 사람이 재연결한다 |
| state 저장 테이블 | 서명 쿠키로 충분하다. 서버가 상태를 안 들면 정리 작업도 없다 |

**마이그레이션이 없다 = `/db`를 부르지 않는다 = `/push`·`/merge`의 DB 순서 판정이 걸리지 않는다.**

## 6. 새 환경변수 셋

| 이름 | 무엇 | 어디에 |
|---|---|---|
| `GITHUB_APP_CLIENT_ID` | App의 **OAuth client id** (`Iv23li…`). ⚠️ `GITHUB_APP_ID`(숫자)와 **다른 값**이다 | `.env.local` · Vercel Production · Preview |
| `GITHUB_APP_CLIENT_SECRET` | 위의 secret | 같음 |
| `GITHUB_APP_SLUG` | 설치 링크 `https://github.com/apps/<slug>/installations/new` 조립용 | 같음 |

⚠️ **`GITHUB_APP_ID`와 `GITHUB_APP_CLIENT_ID`를 혼동하면 authorize가 404가 된다.** 프로덕션
`AUTH_GITHUB_ID`에 client_id 대신 **설정 페이지의 레코드 번호**를 넣어 로그인이 404였던 것과
글자 그대로 같은 실수다 (SAAS §8 2단계). `.env.example` 주석에 그 구별을 적는다.

✅ **세 환경이 같은 값을 쓴다** — GitHub App은 callback URL을 여러 개 등록할 수 있어서
`http://localhost:3000/...` · dev 고정 preview URL · `https://mal-moi.com/...` 셋을 한 App에 넣는다.
OAuth App 셋을 굴리는 지금과 반대이고, 그래서 재발급 순서(CLAUDE.md)가 늘어나지 않는다.

`AUTH_SECRET`은 state 서명에 **재사용**한다 — 새 시크릿을 늘리면 재발급 대상이 하나 더 는다.
⚠️ 로컬과 프로덕션의 `AUTH_SECRET`이 다른 것은 이미 허용된 성질이고(세션이 갈릴 뿐), state는
같은 배포 안에서만 왕복하므로 영향이 없다.

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| SAAS §9-6 **OAuth와 installation token의 역할을 섞지 않는다** | **가장 크게 닿는다 — 그리고 강화한다.** 사용자 토큰은 `lib/github/user.ts`에서만 살고 **GET만 부른다**. App 개인키는 `lib/github.ts`에서만 산다. `lib/github/__tests__/credential-separation.test.ts`가 두 모듈의 교차 import를 소스에서 0으로 고정한다 — `entry-points.test.ts`와 같은 성질의 상시 방어선이다 |
| SAAS §5.5 **자동 계정 병합 금지** | `planAccountLink`의 `taken-by-other`가 방어선. **`allowDangerousEmailAccountLinking`은 계속 어디에도 없다** (`provider-config.test.ts`가 이미 검사한다) |
| SAAS §9-5 **모든 쿼리를 인가된 `projectId`로** | `connectRepository`가 `getProjectAccess`가 **돌려준** `projectId`로 update한다. 클라이언트가 보낸 slug는 판정 입력일 뿐 |
| CLAUDE.md **차단은 두 층** | 새 페이지는 최상단에서 `requireProjectAccess`를 **던진다**. 조건부 렌더 금지 (POSTMORTEM 2026-08-31, 1.3MB 노출) |
| export 결정성 · blob SHA 비교 | **닿지 않는다.** `lib/adapters/`·`lib/pull/`을 건드리지 않는다 |
| CLAUDE.md **환경변수를 모듈 최상위에서 평가하지 않는다** | 새 라우트 둘이 `requireEnv`를 **핸들러 안에서** 부른다. `createApp()`이 이미 그 형태다 (POSTMORTEM 2026-08-31 + 🔁 재발 2건) |

### 7.1 라우트 핸들러 둘 — 컨벤션 위반이 아니다

CLAUDE.md는 "내부 쓰기에 Route Handler를 새로 만들지 않는다"고 한다. `/api/github/connect`·
`/api/github/callback`은 **예외가 아니라 그 규칙의 반대편**이다 — 부르는 쪽이 우리 UI가 아니라
**GitHub이 브라우저를 보내는 전체 페이지 내비게이션**이다. Server Action은 302로 외부에 나갔다가
돌아오는 왕복을 표현할 수 없다.

**둘 다 `middleware.ts`의 `matcher`에 넣지 않는다.** 근거는 `/invite/[token]`을 넣지 않은 것과 같다 —
**URL이 값을 들고 있다.** callback이 `/`로 302되면 `code`가 사라지고, 사용자에게는 "연결을 눌렀는데
로그인 화면으로 돌아왔다"로 보인다. 대신 두 라우트가 스스로 `readSession`을 지나고,
`entry-points.test.ts`의 `GUARDS`가 그것을 센다 — **예외 목록(`EXEMPT`)에 이름을 더하지 않는다.**

## 8. 화면 — `/projects/:slug/settings`

DESIGN.md §9(Supabase 레퍼런스)의 일곱 축으로 판정한다. 이 화면에서 실제로 걸리는 것은 셋이다.

- **빈 상태에 다음 행동** — 연결 없음 → "GitHub 연결" 버튼, 설치 0개 → "App 설치하기" 링크.
- **식별자는 mono** — `owner/repo`, `installationId`, slug (§4.1 mono 표면 불변식).
- **상태는 작은 배지** — §3.3의 다섯 상태. ⚠️ **§6.2에 없는 raw 색을 늘리지 않는다**; `unknown`은
  중성(회색)이다 — 회색이 "모른다"를 말하고, 빨강은 "제거됨"에만 쓴다.

⚠️ **EDITOR에게는 이 링크가 보이지 않는다.** 조건부 렌더는 차단이 아니므로(위 §7) 링크를 숨기는
것은 UI 예의일 뿐이고, 직접 URL을 쳐도 페이지 최상단이 `/projects?e=forbidden`으로 돌린다.

⚠️ **사이드바·헤더에 링크를 실제로 단다.** 라우트를 만들고 링크를 안 달면 죽은 화면이고, 반대로
옛 경로를 하드코딩하면 전부 404다 — 둘 다 이 리포에서 밟았다 (POSTMORTEM 2026-09-05, 사이드바
전부 404). `entry-points.test.ts`의 "죽은 라우트 링크" 검사가 이미 그 축을 든다.
