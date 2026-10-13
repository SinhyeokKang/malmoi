# GitLab sign-in — 스펙

작성: 2026-10-13 · 상태: **착수 가능** — v1.4.0은 main에 나갔다(`456e0e1f`). GitLab OAuth 앱은 사용자가 등록하고 `.env.local`에 넣었다(2026-10-13). 남은 선행은 T0 실측이다. `/feature-review` 반영(2026-10-13).

slug는 `gitlab-oauth`지만 **범위는 로그인 공급자 하나**다 — 리포 연결(PAT)을 OAuth로 바꾸는 것은 범위 밖이다(§5).

## 1. 목적과 사용자

GitLab.com 계정으로 말모이에 로그인할 수 있게 한다. Auth.js에 셋째 로그인 공급자 `gitlab`을 더하고, 기존 두 공급자(GitHub·Google)가 지나는 모든 판정 — 검증된 이메일 · 초대 대조 · 같은 주소의 두 번째 수단 연결(challenge) · `/account` 수단 연결·해제 · 전체 세션 회수 · 켜진 공급자 판정(optional-login-providers) — 을 똑같이 지난다.

**1순위 사용자는 개발자**다 — GitLab 리포를 연결하러 온 개발자(2026-10-12 gitlab-repositories)가 지금은 GitHub이나 Google 계정을 따로 써야 로그인할 수 있다. **번역 편집자**에게는 로그인 버튼 하나가 는다(GitLab 계정이 있는 비개발자는 드물다 — 편집자를 위한 기능이 아니다). **대가 하나**: 순서가 `github → gitlab → google`(design §4 D2)이라 hosted `/signin`·초대·`/oauth/authorize`에서 편집자가 주로 쓰는 **Google 버튼이 둘째에서 셋째로 내려간다.** 개발자 동선을 앞에 둔 의도한 상충이다(사용자 결정 2026-10-13 — 유지).

**로그인이 아무것도 열지 않는다는 원칙은 그대로다** — GitLab으로 로그인해도 권한은 `ProjectMember`만 정한다(ARCHITECTURE 불변식 7). **GitLab 로그인은 GitLab PAT 연결을 만들거나 대신하지 않는다** — 리포 쓰기 신원은 여전히 붙여 넣은 PAT다(§3 "경계").

## 2. 관측된 문제

- **(1순위 — 코드로 관측되는 구조 결함)** 셀프 호스팅 GitLab 전용 설치(2026-10-12 D4 — `GITHUB_APP_*` 없이 기동)는 리포 연결에 GitHub이 필요 없는데도 **로그인을 위해 GitHub OAuth App이나 Google OAuth 클라이언트를 등록해야** 기동한다(`guide/en/self-hosting/install.md:19` "at least one GitHub or Google sign-in provider is still required").
- **(hosted — 잠재 수요)** 로그인 공급자는 GitHub OAuth App·Google 둘이다(`auth.ts:107` `withEnabled([github, google], enabled)`). GitLab 리포 지원(v1.4.0)이 들어온 뒤로 GitLab만 쓰는 개발자는 **로그인용으로 GitHub·Google 계정을 하나 더** 갖고 있어야 한다. 그런 사용자·이탈 수는 관측하지 않았다 — 근거는 사용자 결정(2026-10-13)이다. hosted에서 켜는 결정(design §4 D5)은 이 잠재 수요에 서고, 구조 결함은 self-hosted에서만 닫힌다. GitLab 로그인이 없다는 사실이 PRODUCT §4.2 "GitLab 지원의 확장"에 비범위로 적혀 있다(`docs/PRODUCT.md:485`).

## 3. 범위 게이트

**PRODUCT §4.2 "GitLab 지원의 확장"의 "GitLab 로그인"(`:485`)을 범위로 옮긴다 — 사용자 결정(2026-10-13)이다.** 원래 뺀 근거는 gitlab-repositories의 범위 절제였다(spec §5 "GitLab 로그인, SSO, …" — 리포 지원에 로그인 변경을 선행 조건으로 걸지 않았다). 그 근거는 리포 지원이 선 지금 사라졌다. PRODUCT 반영은 tasks §6 항목이다(지금 고치지 않는다).

**바로 윗줄(`:484`)의 "GitLab OAuth 앱 연결"은 비범위로 남는다.** 둘은 같은 GitLab OAuth 앱 등록을 쓰더라도 다른 일이다 — 로그인은 "이 사람이 누구인가"를 묻고 토큰을 콜백 안에서 버리며, 연결은 리포 쓰기 신원이다. 연결을 OAuth로 바꾸지 않는 근거(연결자 명의라 PAT와 쓰기 신원이 같고 callback·origin 경계만 는다)는 그대로다. 정본 문장이 둘을 섞어 읽히지 않게 고친다(tasks §6).

**PRODUCT §4.3 ①의 "1차 로그인은 GitHub OAuth + Google OAuth 둘뿐이다"(`:519`)** — 이메일 매직링크를 빼는 판정이 본문이고 이 문장은 그 시점의 공급자 목록이다. 매직링크 판정은 건드리지 않고 목록만 셋으로 고친다.

**PRODUCT §4.3 ③(로그인을 GitHub App으로 교체 → 뺀다)의 근거 "연결 기능의 실패가 로그인 실패가 되면 안 된다"를 GitLab에도 적용한다** — GitLab 로그인 OAuth 앱은 PAT 연결과 아무것도 공유하지 않는다(env·토큰·코드 경로). 그래서 GitLab 장애·PAT 만료가 로그인을 막지 않고, 로그인 앱 장애가 연결을 막지 않는다.

**ARCHITECTURE §0과 충돌하지 않는다** — 값 병합·충돌 해소가 없고 스키마(마이그레이션)가 바뀌지 않는다. 불변식 6(쓰기 신원 분리)·7(로그인 ≠ 인가)을 지키는 방법은 design §6.

**셀프 호스팅**: GitLab Self-Managed를 **로그인 공급자로도** 받지 않는다 — 리포 호스트가 GitLab.com 하나인 것(PRODUCT §4.2)과 같은 판정이다. 발급자는 `https://gitlab.com` 고정이고 `AUTH_GITLAB_URL`·`baseUrl` 같은 설정을 두지 않는다.

## 4. 완료 조건 — 수락 기준

1. `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET`이 **완전한 쌍**이면 `/signin`·`/invite/[token]`·`/oauth/authorize`·`/signin/link/[challenge]`에 GitLab 버튼(`Continue with GitLab` / 수단 라벨 `GitLab`)이 선다. 둘 다 비면 Auth.js `providers`에 `gitlab`이 없다 — 그래서 어느 화면에도 버튼이 없고 `/api/auth/signin/gitlab`·`/api/auth/callback/gitlab`이 GitLab으로 왕복하지 않는다. 반쪽이면 self-hosted preflight가 `incomplete-pair`로 기동을 거부한다. 셋 다 꺼지면 `no-login-provider`가 **세 ID 이름**을 찍는다. [단위 — `login-providers`·`preflight`·`withEnabled` 행동("gitlab 꺼짐 → providers에 없음") · preflight-entry stderr]
2. **GitLab이 확인한 주 이메일만** 로그인을 통과시킨다 — `/api/v4/user`의 `email`이 비었거나 `confirmed_at`이 없으면 그 로그인은 `AccessDenied`이고 `User`·`Account`·`Session` 행이 0이다. 검증은 저장되는 값을 만드는 자리(provider `profile`)에서 한다(ARCHITECTURE §6.2). [단위 — `verifiedEmailFrom`·`gitlabProfile` · 격리 PG · 실측 T0]
3. 로그인 `Account` 행(`provider = "gitlab"`)은 **식별자 네 필드만** 저장한다 — `access_token`·`refresh_token`·`expires_at`이 null이다. GitLab 로그인 토큰은 콜백의 userinfo 조회 한 번 뒤 어디에도 남지 않는다. [단위 — safe-adapter·login-link·account-connect 세 쓰기 경로 · 격리 PG]
4. 같은 검증 이메일의 User가 이미 GitHub·Google 수단을 가졌을 때 GitLab으로 처음 로그인하면 `/signin/link/<challenge>`로 가고, 기존 수단으로 확인해야 GitLab `Account`가 붙는다. 역방향(GitLab 계정이 먼저)도 같다. `allowDangerousEmailAccountLinking`은 어느 공급자에도 없다. [단위 — `planLinkOffer`·`provider-config` · 격리 PG `test:credentials:postgres`]
5. `/account` 로그인 수단 카드에 GitLab 행이 서고(켜졌을 때만), [Connect]·해제·전체 세션 회수(`Continue to GitLab`)가 GitHub·Google과 같은 판정 함수(`canUnlink`·`pickLoginAccount`)를 지난다 — 해제 뒤 켜진 수단이 하나 이상 남아야 하고, 확인 상대 우선순위는 `github → gitlab → google`이다. **기존 `[github, google]` 사용자의 확인 상대는 GitHub 그대로다.** [단위 — `canUnlink`·`pickLoginAccount`·`loginMethodRows` · 격리 PG · 실물 T6]
6. **GitLab 로그인과 GitLab PAT 연결은 서로를 만들거나 지우지 않는다** — GitLab 로그인 수단을 해제해도 `GitLabConnection`이 남고, PAT 연결을 해제해도 GitLab `Account`가 남는다. 로그인 코드(루트 `auth.ts` 포함)는 `lib/gitlab/*`·`lib/gitlab-connect/*`(하위 모듈 전부)를 import하지 않고 GitLab 쓰기 코드는 `Account` 행을 읽지 않는다. [`credential-separation.test.ts` 확장 · 격리 PG]
7. CSP가 GitLab 로그인 왕복을 막지 않는다 — `form-action`에 `https://gitlab.com`. [단위 — `security-headers`] GitLab 아바타는 받지 않는다 — `Account(gitlab)`로 가입한 `User.image`는 null이고 `img-src`는 그대로다(design §4 D3).
8. 우주(universe) 하드코딩 사본이 소스에 0이고 전부 `LOGIN_PROVIDERS`에서 파생된다 — 판정은 **공급자 id `google`이 단독 토큰(문자열 리터럴 값 · 정규식 교대 항)으로 허용 파일 밖에 0**이다(design §3 게이트). 셋 배열·`!==`·유니온·정규식 모양을 하나씩 되넣으면 각각 red다. [게이트 `provider-universe.test.ts` + 뮤테이션 관측]
9. 개인정보 방침(en·ko)이 GitLab을 로그인 목적의 전송처로 말하고, **GitLab에서 받는 것은 이름(없으면 username)·이메일·GitLab 계정 id이며 프로필 사진은 받지 않는다**고 말한다 — 수집 표의 "name, email and profile picture ← GitHub or Google" 행은 사진 출처를 갈라 적어 GitLab이 사진 출처로 읽히지 않는다. 개정 이력·시행일이 움직인다. 셀프 호스팅 운영자 개인정보 재료(가이드 en·ko·es)도 같다. [`policy-gate.test.tsx` · `/push` 4단계 사람 판정]
10. 세 사전(en·ko·es)에 새 키가 같은 커밋에 있고, 가이드·README·정본 문서의 "GitHub or Google" 로그인 목록이 셋으로 갱신된다. [`dictionary-consistency` · `pnpm test` 가이드 게이트 · `/doc-check` 대상]
11. hosted: **GitLab OAuth 앱 하나**(그룹 소유)가 로컬·preview(`dev.mal-moi.com`)·프로덕션 세 redirect URI를 갖고 세 환경이 같은 ID·secret을 쓴다. 프로덕션에서 GitLab 로그인 왕복이 실물로 성공한다. [실물 — `/merge` 뒤]
12. **GitLab 단독 self-hosted**: `AUTH_GITLAB_*` 쌍만 있고 GitHub·Google 쌍이 없는 설정이 preflight를 통과하고, `/signin`에 GitLab 버튼 하나만 primary로 선다. [단위 — `preflight` 행렬 · `signInButtons`]
13. **callback 가로채기 셋(병합 확인·세션 회수·수단 연결)이 `/api/auth/callback/gitlab`도 잡는다** — `lib/auth/roundtrip.ts`의 callback 판정이 `LOGIN_PROVIDERS`에서 파생된다. 빠지면 GitLab callback이 세 가로채기를 우회해 평범한 로그인으로 흐른다. [단위 — `oauth-callback-contract.test.ts` `/callback/gitlab` 사례 · 격리 PG]
14. **`/account`에서 GitLab 로그인 수단 행과 GitLab PAT 카드가 이름으로 갈린다** — PAT 카드의 해제 접근 이름·확인 제목·미연결 행 이름이 "토큰"을 든다(design §4 J8). 네 상태(둘 다 미연결 · 로그인만 · PAT만 · 둘 다)에서 같은 이름·같은 확인 제목이 두 번 서지 않는다. [DOM — `account/__tests__/structure.test.tsx` · 실물 T6]
15. **브랜드 글리프가 브랜드 색으로 선다**(design §4 D6 · §5 "브랜드 글리프")
    - 대상 자리: 로그인 버튼 세 화면, `/signin/link` 배지, 카드 행 `IconTile` 다섯 자리(`/account`의 로그인 수단 · GitHub App · GitLab PAT, 설정 리포 카드 GitHub·GitLab)
    - 형: GitLab은 공식 3색 tanuki, Google은 4색, GitHub는 버튼 안에선 버튼 글자색 상속이고 칸 안에선 `text-foreground`
    - 상태 칸(`tone` 경고·실패)에서도 글리프는 상태 색을 받지 않는다
    - 인라인 작은 글리프(목록·메타·탭)는 단색 그대로
    - 라이트·다크 두 테마에서 대비가 유지된다
    - 검증: [단위 — `gitlab-glyph.test.ts`(두 글리프 분리) · DOM `tone` 비상속 단언 · 실물 T6 체크리스트]

## 5. 비목표

- **GitLab PAT 연결을 OAuth로 바꾸기** — PRODUCT §4.2 "GitLab OAuth 앱 연결" 그대로(§3).
- **GitLab 로그인으로 PAT 연결을 프리필·자동 생성·자동 추천하기** — 로그인 계정과 연결 계정이 같은 GitLab 사용자인지 대조하지도 않는다. 둘은 다른 자격증명이다(design §6).
- GitLab Self-Managed·Dedicated 로그인, 발급자 설정(§3).
- GitLab 그룹·멤버십을 말모이 역할·프로젝트 멤버십으로 옮기기(불변식 7).
- 이메일이 다른 두 수단의 병합, 양쪽에 `User`가 따로 있는 경우의 병합(PRODUCT §4.3 ④의 비범위 그대로).
- GitLab 보조(secondary) 이메일로 로그인·초대 대조 — 주 이메일 하나만 본다(GitHub의 "primary이면서 verified"와 같은 판정).
- OIDC(`openid` 스코프)·ID 토큰 검증 — Auth.js GitLab provider 기본형(`read_user` + `/api/v4/user`)을 쓴다(design §4 D1).
- 로그인 화면 레이아웃 변경 — 켜진 공급자 버튼이 하나 늘 뿐이다(design-brief 없음 — `/feature-review` CPO·CDO 판정, design §5).

## 6. 사용자 결정 기록

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-13 | PRODUCT §4.2의 "GitLab 로그인"을 범위로 옮긴다. "GitLab OAuth 앱 연결"은 비범위 유지 | 사용자 결정(브리프). 리포 지원이 선 뒤 GitLab 전용 개발자·GitLab 전용 셀프 호스팅 설치가 로그인용 계정을 따로 둬야 한다 |
| 2026-10-13 | 착수는 v1.4.0 `/merge` 뒤 | 사용자 결정(브리프) — 감사 리팩터 런과 겹치지 않게. **충족**(v1.4.0 `456e0e1f`) |
| 2026-10-13 | 설계 결정 D1~D5 — REST `confirmed_at` · 순서 `github → gitlab → google` · 아바타 안 받음 · `prompt` 인자는 T0 뒤 · hosted 켬(그룹 소유 앱) | design §4 "사용자 결정" 표 |
| 2026-10-13 | `/feature-review` 반영 — 우주 게이트는 `google` 토큰 판정 · callback 정규식 파생 · 사전 키 `link.providers.gitlab`은 커밋 A, 테스트 기본 env는 커밋 D · J8은 PAT 카드 문구로 지금 닫는다 · 앱 하나 · D2 유지 + 대가 기록 · T0 ⑥은 `ox501501`(그룹 비멤버)로 잰다 · `reauthParams`는 T0 조건부 · J6 번호 없음 · design-brief 불필요 | `/feature-review` 사용자 답변 |
| 2026-10-13 | 로그인 공급자 자리와 카드 행 `IconTile`의 브랜드 글리프는 브랜드 색 — GitLab 공식 3색 tanuki, Google 4색, GitHub 공식 단색(칸 안에선 `text-foreground`). 인라인 작은 글리프는 단색 유지 | 사용자 결정(착수 직전) — design §4 D6 |

남은 열린 지점은 T0 실측(D1 재개 조건 · D4 확정 · ⑤ 판정)뿐이다.
