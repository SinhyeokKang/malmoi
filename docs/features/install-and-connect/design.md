# design — install-and-connect

## 전제: GitHub 동작 (2026-09-18 프로덕션 실측, "Request user authorization (OAuth) during installation" 켬)

| 경우 | GitHub 버튼 | callback 쿼리 |
|---|---|---|
| 새 설치(개인·관리자) | Install & Authorize | `code` · `installation_id` · `setup_action=install` · `state` |
| 비관리자 조직 요청 | Authorize & Request | `code` · `setup_action=request` · `state` (`installation_id` 없음) |
| 이미 설치된 대상 | "Configure" 링크 | **안 돌아온다** — state 없이 GitHub 설정 화면 |
| 리포 선택 변경 Save | — | callback, **state 없음** (쿼리 값은 미관측 — 도착 URL `/projects?e=state-mismatch`만 봤다) |

`installations/new?state=X`의 `X`는 대상 선택 → 권한 화면 → callback까지 그대로 실린다. 이 옵션을 켜면 Setup URL은 쓰이지 않는다(GitHub이 callback으로 보낸다). 관리자의 요청 승인 복귀는 미관측이다 — state가 없을 것이므로 아래 "state 없는 복귀" 규칙이 받는다.

## 사용자 흐름 (① 상태)

```
A 연결 없음 / B 연결됨·설치 0 (대기 없음) ─ 같은 블록: [Install GitHub App] (Server Action → 같은 탭)
   A에만 보조 링크 "Already installed on your organization? Connect your account" (Authorize)
C 설치 있음·리포 0 (대기 없음) ─ "Add a repository" + [Choose repositories] (GitHub 설치 설정, 같은 탭)
D 대기 · (설치 0 또는 리포 0) ─ "Waiting for approval" + [Check again] + 보조 링크 "Install on a different account"
E 리포 있음 ─ 목록. 대기면 목록 위 info 한 줄
reauthorize (토큰 폐기) ─ "Reconnect GitHub" + [Reauthorize GitHub App] (Authorize, 지금 그대로)
```

**대기** = `Account(github-app).installRequestedAt`가 있고, 그 시각 이후에 생긴 설치가 사용자 설치 목록에 없다.

### 화면 문구 (2026-09-18 사용자 확정)

| | A/B 설치 전 | C 리포 없음 | D 승인 대기 | reauthorize |
|---|---|---|---|---|
| 아이콘 | `Link2` | `FolderGit2` | `Clock` | `GithubIcon` |
| 제목 | Connect your repositories | Add a repository | Waiting for approval | Reconnect GitHub |
| 설명 | Install the malmoi GitHub App on your account or organization to choose repositories. | Choose which repositories the malmoi GitHub App can access. | An organization owner has to approve your request to install the malmoi GitHub App. | Authorize the malmoi GitHub App again to see your repositories. |
| 버튼 | Install GitHub App | Choose repositories | Check again | Reauthorize GitHub App |
| 보조 링크 | (A만) Already installed on your organization? Connect your account | — | Install on a different account | — |

- E의 info 한 줄: "An organization owner still has to approve your install request." (D 설명과 같은 사실, 목록이 있으므로 한 줄).
- [Check again] 결과 알림(live region): 승인 전 "Still waiting for approval.", 승인 후는 목록 등장.
- 설명은 전부 한 문장(DESIGN §6.4). 제목은 마침표 없는 짧은 구.
- **`GITHUB_APP_SLUG` 없음**: A는 주 버튼이 [Authorize GitHub App](기존)이고 설명 자리에 `noLink`("Ask your administrator…"). B·C는 버튼 없이 `noLink`. D는 보조 링크 없음. 설치 버튼이 `unavailable`로 항상 실패하는 화면을 만들지 않는다 — 서버가 이미 안다(`new-project-modal.tsx`의 `installUrl()`).
- 옛 사전 키 퇴장: `connect.title`("Connect GitHub repositories")·`connect.description`·`noInstallations`·`noRepos`·`afterInstall`·`addRepos`·`install`·`requested`. 소비자가 0이 되는 것만 지운다(`rg`로 확인). 판정층 `connect["not-connected"]`("…use Authorize GitHub App below.")가 온보딩에 닿으면 새 버튼 이름으로 고친다.

### 컴포넌트 형

- **주 버튼·보조 링크가 한 블록에서 pending을 공유한다.** 각자 `useTransition`이면 둘 다 눌려 state 쿠키가 덮이고 먼저 떠난 왕복이 `state-mismatch`가 된다. 블록 하나가 transition 하나와 오류 Alert 하나를 든다. `ConnectGithubButton`에 `via`(`authorize`|`install`)와 모양(`primary`|`link`)을 연다.
- **보조 링크**는 Server Action을 부르므로 `<a>`가 아니라 `Button variant="link"`다. 자리는 `InstallHint` 형 — EmptyState **아래** `Centered` 안 `gap-3`, `text-xs text-muted-foreground` 한 줄(EmptyState action 래퍼는 가로 flex라 그 안에 넣지 않는다).
- **C의 [Choose repositories]와 목록 아래 힌트**는 외부 href라 `<a className={buttonClass(...)}>`(같은 탭). `ButtonLink`는 Next `<Link>`라 외부 URL에 맞지 않는다. DESIGN §6.3의 "리포 밖으로 나가는 링크는 `target=_blank`"에 **예외**를 적는다: GitHub 설치·설정 왕복은 같은 탭(돌아오는 착지가 있으므로).
- **[Check again]**: `useTransition` + `router.refresh()` + `loading`. `router.refresh()`는 Suspense fallback을 다시 띄우지 않아 로딩 표시가 없으면 반응이 안 보인다. 승인 전이면 live region 알림, 승인 후면 목록이 서고 포커스를 검색 필드로 옮긴다(버튼 언마운트로 `body`에 떨어지지 않게).
- land-only 착지는 목록 상태(`?q=`)를 복원하지 못한다(state가 없다) — 대가로 받는다.

## 영향 받는 흐름

편집 UI(새 프로젝트 ①)와 GitHub 연결 왕복(ARCHITECTURE §6.4). push·pull·export 무관.

## 구성

1. **설치 URL** — `lib/github-connect/installation-url.ts`에 `installWithStateUrl(appSlug, nonce)`(순수)를 더한다: `https://github.com/apps/<slug>/installations/new?state=<nonce>`. 슬러그 없음·빈 문자열 → `null`. 기존 `installationSettingsUrl`과 같은 주소 규칙이고, 인라인 조립 두 곳(`new-project-modal.tsx` `installUrl()` · `settings/page.tsx`)도 이 모듈로 모은다. 이름을 `installUrl`로 하지 않는 이유: `NewProject`·`RepoStep`의 prop `installUrl`(설치 **설정** 주소)과 겹친다.
2. **시작 Action** — `startGithubConnectForUser(dest, back, via)`에 `via: "authorize" | "install"`(zod enum, 기본 `authorize`)을 더한다. state 쿠키·서명 `dest`는 **그대로** 공유하고 redirect 대상만 갈린다. 새 export를 만들지 않는 이유: `entry-points.test.ts`의 `USER_SCOPED_ACTIONS`와 쿠키 규약이 한 자리에 남는다. 슬러그 없음 + `install` → `unavailable`(화면은 그 버튼을 애초에 안 세운다 — 방어선).
3. **callback 판정** — 순수 `planCallback({ setupAction, stateParam, state, denied, code })`(`lib/github-connect/callback-plan.ts`) → `reject({ dest, error })` | `land-only` | `link({ dest, code, request })`:
   - `stateParam === null` **이고** `setupAction ∈ {install, update, request}` → `land-only`(`/projects/new`). **쓰기 0, code 교환 0, state 쿠키도 안 지운다**(다른 탭에서 진행 중인 왕복의 쿠키다). `installation_id`는 여전히 안 읽는다.
   - `stateParam === null`이고 `setupAction`이 없거나 모르는 값 → 지금처럼 `reject(state-mismatch)`(Authorize 복귀에는 항상 state가 있다).
   - 그 외: 지금 규칙(취소 → denied · state 검증 → code 없으면 exchange-failed → link).
   - `link`의 `request`: `setup_action=request` → `set`, `install` → `clear`, 그 외(없음·update·모르는 값) → `keep`.
   - **쓰기는 route에 남긴다** — `lib/login-link/__tests__/exclusive.test.ts`가 `account.create`의 자리를 callback route로 고정한다. 순수 판정만 lib로 뺀다.
4. **요청 기록** — `Account.installRequestedAt DateTime?` (additive, nullable). **`github-app` 행에만** 쓴다. User가 아닌 이유: 연결 해제(`disconnectGithub`)·다른 GitHub 계정으로 교체(`replace`)가 행 삭제로 기록을 같이 치운다 — User에 두면 새 계정에 거짓 대기가 뜬다. 쓰기는 `linkAccountLocked` 안, **연결 성공(`null`)일 때만**, 같은 트랜잭션(User 행 `FOR UPDATE`)에서. `taken-by-other`·예외면 안 쓴다. 쿠키가 아닌 이유: 완료 조건이 "다른 기기에서도"다.
5. **목록 판정** — `listUserInstallations`가 `{ id, createdAt }`를 돌려준다(같은 응답의 `created_at` — 추가 호출 0). 순수 `planPending({ listResult, requestedAt, installations })`(`lib/github-connect/pending.ts`):
   - `requestedAt` 없음 → 원래 결과, `pending: false`.
   - `requestedAt` 이후 `createdAt`인 설치가 있음 → **승인됨**: 원래 결과, `pending: false`, `clearRequest: true`.
   - 그 외 → `pending: true`: 결과가 `no-installations`·`no-repos`면 D, 리포 목록이면 E + info.
   - 장애(`unavailable`·토큰 상태)는 기록과 무관하게 그대로.
   - `listConnectableRepos`는 `clearRequest`일 때만 `account.updateMany({ where: { userId, provider: "github-app", installRequestedAt: { not: null } } })`로 지운다. RSC 로더 안의 조건부 쓰기이고 전례가 있다(`ensureUserToken`의 토큰 회전 `token-store.ts`). 기록 조회가 던지면 `unavailable`로 접는다.
   - **결과 모양**: `ConnectableReposResult`에 `pending: boolean`을 싣는다(`ok: true`·`no-installations`·`no-repos` 갈래). **`OnboardError` union에 넣지 않는다** — 넣으면 `ONBOARD_ERRORS`를 지나 `?e=install-pending`이 ① danger 배너 후보가 되고(옛 `setup.ts`가 union에 안 넣은 이유와 같다), `satisfies` 사전 맵이 union·문구를 한 커밋에 묶는다(POSTMORTEM 2026-09-06).
6. **화면** — 위 "화면 문구"·"컴포넌트 형". `Blocked`(repo.tsx)는 `not-connected`·`no-installations`(대기 아님) → A/B 블록, `no-repos`(대기 아님) → C, 대기 → D, `reauthorize` → 분리된 reauthorize 블록.
7. **삭제(이 세션이 만든 고아)** — `app/api/github/setup/`, `lib/github-connect/setup.ts`·테스트, `INSTALL_REQUESTED`·`installRequested` 상태·목록 위 info(E의 info로 대체), `requested` 사전 키, client-graph 허용 목록 줄, entry-points `RETURNS`의 setup.

## 순수 함수 (`/tdd` 대상)

- `installWithStateUrl(appSlug, nonce)`
- `planCallback(input)` — 갈래 표 전체
- `planPending(input)` — 대기·승인 판정 + `clearRequest`

## 스키마

`Account.installRequestedAt DateTime?` — additive, nullable. 배포 순서: dev `db:migrate` → `/push` → prod `db:deploy` → `/merge`(ARCHITECTURE §7). 테이블 단위 REVOKE가 새 컬럼에도 걸린다 — `/db` 5단계로 anon 권한 0 확인. Account 쓰기는 이 필드를 `create`·`update`의 `data`에만 싣는다(어댑터 `linkAccount`의 `AdapterAccount`에는 없다 — nullable이라 어댑터 경로는 영향 없음).

## 콘솔

옵션 "Request user authorization (OAuth) during installation" **켬**(2026-09-18부터 켜져 있다 — 출시 전이라 배포까지 켜 둔다, 사용자 결정). 그 사이 프로덕션의 설치 복귀는 옛 코드가 state 없이 받아 `state-mismatch`다 — 알려진 공백이고 배포로 닫힌다. **Setup URL 값은 비운다**(OPERATIONS에 적는다) — 옵션이 켜져 있는 동안 쓰이지 않지만, 누가 옵션을 끄는 순간 지운 라우트로 가서 404가 난다. `malmoi-test-org` 설치는 배포 뒤 실측에서 요청 → 승인으로 복구한다.

## 불변식 영향

- **인증 경계(§6.4)**: 서명 state가 있는 복귀만 **쓴다**(code 교환·Account·기록). state 없는 복귀는 설치 계열 `setup_action`일 때 **착지만** 하고, 그 외는 거부한다. `installation_id`는 계속 안 믿는다(목록이 사용자 토큰으로 재조회). 요청 기록은 서명 state 뒤에서만 쓰이므로 CSRF로 심을 수 없다.
- **자격증명 분리**: 설치 URL은 App 슬러그뿐 — 토큰 없음. `credential-separation.test.ts` 대상 아님.
- **`GITHUB_APP_SLUG`의 의미가 커진다** — 지금은 "없으면 그 링크만 조용히 사라진다"(CLAUDE.md·`.env.example`)인데, 이제 ①의 주 경로다. 없으면 관리자 안내로 떨어진다는 서술로 고친다.
- export 결정성·blob SHA 무관.

## 로컬 검증의 한계

설치 URL엔 `redirect_uri`가 없어 로컬·preview에서 시작한 설치는 프로덕션 callback으로 간다(쿠키가 없어 교환 0회로 거부 — 환경을 넘는 연결은 안 생긴다). 그래서:
- 로컬에서 **A → 목록**은 보조 링크(Authorize, `redirect_uri`가 로컬)로 연결하고 GitHub 사이트에서 직접 설치한 뒤 [Check again]으로 본다.
- **D·E-info**는 dev DB의 `Account.installRequestedAt`을 직접 심어 본다(`.scratch/` 스크립트, 커밋하지 않음).
- 설치 왕복 자체(1클릭·요청 복귀·승인 복귀)는 **프로덕션에서만** 실측한다. CLAUDE.md `/bugshot-qa` 항목과 OPERATIONS 콘솔 절에 적는다.

## 과거 함정 (POSTMORTEM)

- 2026-09-06 "실패 사유를 쿼리로 넘겨놓고 읽는 쪽을 안 만들었다" — 대기는 쿼리가 아니라 목록 판정에서 나온다. union에 안 넣어 `?e=` 경로에 서지 않는다.
- 2026-09-10 "재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다" — state 없는 복귀를 받는 갈래는 **어떤 쓰기도 하지 않는다**를 테스트로 고정한다(교환·Account·쿠키 소거 0).
- 2026-09-13 "일회용 연결 요청을 락 전에 읽어" — 기록 쓰기는 `FOR UPDATE` 뒤, 연결 판정과 같은 트랜잭션.
- 2026-09-18 "인가 방어선이 이름을 셌다" — 라우트 삭제 후 entry-points 목록을 같이 줄인다.
