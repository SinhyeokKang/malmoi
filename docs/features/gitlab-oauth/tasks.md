# GitLab sign-in — 태스크

작성: 2026-10-13 · 상태: **착수 가능**(v1.4.0 main `456e0e1f` · GitLab 앱 등록·`.env.local` 투입 완료 — T0 실측부터). 짝: [spec.md](spec.md) · [design.md](design.md) · `/feature-review` 반영(2026-10-13)

검증 줄 표기: **[자동]** 명령 결과로 판정 · **[수동]** 스킬·절차로 사람이 판정. 커밋마다 `pnpm gate` green — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30). `lib/credentials/`·`lib/login-link/`·`lib/session-revocation/`·`lib/account-connect/`를 건드리는 커밋은 `pnpm gate`가 `test:credentials:postgres`를 스스로 붙인다(`scripts/gate-plan.ts:89`). 이번 배치는 `origin/dev...HEAD` 누적 diff라 `auth.ts`·`lib/auth/`만 바꾼 커밋도 결국 붙지만, 트리거 자체는 커밋 A에서 넓힌다(아래).

**배치 경계**: 커밋 A~E는 **같은 `/push` 한 배치**로 나간다 — A·B만 나가면 Auth.js에 GitLab이 들어가는데 화면·방침이 둘인 창이 생기고, 방침이 코드보다 늦으면 방침이 거짓이다(design §7). hosted에서 실제로 켜지는 것은 env를 넣는 순간(§8)이라 dev 배포만으로는 아무 사용자에게도 버튼이 서지 않는다.

**T0가 막히면**: A·C는 T0와 무관하게 진행한다. B는 T0 ①(D1 — `confirmed_at`)·②(J2 — PKCE)·③(D4 — `prompt`) 결과를 기다린다. ①이 부재로 나오면 D1을 다시 열고 B를 멈춘다.

**design-brief 없음** — `/feature-review` CPO·CDO 판정(design §5). 시안 없는 표현 층은 §4 실물이 받는다.

## 0. 결정·실측 — 코드 전

- [x] design §4 D1~D5를 사용자가 닫는다.
  - 검증: [수동] design §4 표의 각 행에 결정·날짜가 적혀 있다. → 완료(2026-10-13).
- [x] GitLab OAuth 앱 등록 · `.env.local`에 `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET` 투입 — 사용자(2026-10-13). 에이전트는 `.env.local`을 읽지 않는다.
- [ ] **T0 실측** — 등록된 앱(앱 하나 — dev용 앱을 따로 두지 않는다, design §8)으로 테스트 계정 `ox501501`(ego 브라우저, gitlab.com에 "Sign in with GitHub" 가입, **앱 소유 그룹의 멤버가 아님**)이 로컬 왕복을 밟는다. 먼저 앱 설정을 GitLab 화면에서 대조한다: 그룹 소유 · 이름 `Malmoi` · Confidential · 스코프 `read_user` 하나 · redirect URI 셋(localhost · `dev.mal-moi.com` · `mal-moi.com`). 재는 것:
  - ① `read_user` 토큰의 `GET /api/v4/user`에 `email`·`confirmed_at`이 실리나(design §2 — 없으면 D1을 다시 연다)
  - ② authorize URL에 `code_challenge_method=S256`이 나가고 교환이 통과하나(J2)
  - ③ `prompt=select_account`를 붙인 authorize가 오류 없이 지나는지·무시되는지(D4 — 무시되면 코드를 만들지 않는다)
  - ④ `avatar_url` 호스트(D3)
  - ⑤ 이미 인가한 앱으로 다시 왕복할 때 GitLab 인가 화면이 다시 뜨는지. **판정 기준**: 화면 없이 바로 돌아오면 전체 세션 회수의 재인증은 "브라우저에 살아 있는 GitLab 세션"만 증명한다 — GitHub OAuth App이 이미 인가한 앱에서 화면을 생략하는 것과 같은 강도면 수용하고, 그보다 약하면(예: 계정 전환 길이 없다) ARCHITECTURE 회수 절에 한계로 적는다
  - ⑥ 앱 소유 그룹의 비멤버(`ox501501`)로 인가되는지(게시 단계 부재, design §8)
  - 검증: [수동] design §2·§4에 실측 결과(필드 유무·응답 코드·호스트·⑤ 판정)가 적히고 "실측 전" 표기가 0이다. 토큰·secret 원문은 어디에도 적지 않는다. 실측용 코드는 `.scratch/`에만 둔다.

## 1. 공급자 우주·env — 커밋 A (`feat(auth): add GitLab to the login provider universe`)

순수 함수 먼저(`/tdd interface`). **이 커밋 단독으로 typecheck·test green이어야 한다** — 우주에 gitlab이 들어가는 순간 `m.link.providers[provider]`(`lib/login-link/message.ts:19`)가 TS7053이므로 그 사전 키를 여기로 당긴다. 테스트 기본 env(`vitest.setup.ts`)는 D에서 넣는다.

- [ ] `LoginProvider`·`LOGIN_PROVIDERS`에 `gitlab` — 순서 `github → gitlab → google`(D2), `LOGIN_PROVIDER_ENV.gitlab`, `loginProviderStates` 객체(`login-providers.ts:38`)에 gitlab, `enabledLoginProviders`(`:56-59`)의 리터럴 `optionalEnv("AUTH_GITLAB_*")` 둘, `:50` 주석. 테스트: `lib/auth/__tests__/login-providers.test.ts`(`:16-27`·`:35-38`·`:47`·`:58`), `lib/login-link/__tests__/policy.test.ts`(`pickLoginAccount` — `[gitlab, google]`이면 gitlab · 기존 `[github, google]`이면 github 그대로 · `loginMethodRows` 총수 · `signInButtons` primary — GitLab 단독이면 GitLab primary · `canUnlink` — 연결 `[github, gitlab]`·켜짐 `[gitlab]`에서 GitLab 해제 거부 사례 포함).
  - 검증: [자동] red 관측 뒤 구현, `pnpm test` green.
- [ ] 사전 `link.providers.gitlab`(`GitLab`) en·ko·es + `dictionary-consistency.test.ts:94-96`·`:144` 허용 목록 등재. `lib/login-link/__tests__/store.test.ts:159`·`view.test.ts:46`(`findMany`가 `in: ["github","google"]`로 불렸는지 단언)을 우주 파생 기대로.
  - 검증: [자동] `pnpm typecheck` green(TS7053 0) · `dictionary-consistency` green.
- [ ] preflight — `SELF_HOSTED_ENV`에 `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET` `"optional"`. 테스트: `preflight.test.ts:199-249` 행렬을 공급자 셋으로(`pair(prefix)` 인자형 확장, `NONE` 세 이름, **GitLab 쌍만 있는 설정 → 통과** — spec §4-12), `:274-275`, `scripts/__tests__/preflight-entry.test.ts:85-93`의 stderr 세 줄.
  - 검증: [자동] `pnpm test` green — 반쪽 GitLab이 `incomplete-pair AUTH_GITLAB_SECRET`, 전부 없음이 세 ID 이름의 `no-login-provider`, GitLab 단독이 통과.
- [ ] **callback 판정** — `lib/auth/roundtrip.ts:9` `OAUTH_CALLBACK`을 `LOGIN_PROVIDERS` 파생으로(design §3 첫 행). `lib/__tests__/oauth-callback-contract.test.ts`에 `/api/auth/callback/gitlab` 사례(세 가로채기가 잡는다) · `/api/auth/callback/github-app` 같은 비공급자는 여전히 안 잡는 사례.
  - 검증: [자동] red(gitlab 사례) → green.
- [ ] 우주 사본 하나로 모으기(design §3 표 전 행) + 게이트 `lib/auth/__tests__/provider-universe.test.ts`(신규 — `google` 토큰 판정, design §3 "게이트"). `components/__tests__/home-vocabulary.test.ts:220-221`의 면제 사유 "LOGIN_PROVIDERS 길이 = 2" 갱신.
  - 검증: [자동] 게이트를 먼저 써서 red(현재 사본 자리가 찍힘) → 치환 뒤 green. **뮤테이션**: 허용 밖 파일에 셋 배열 · `!== "google"` · 유니온 `"github" | "google"` · 정규식 `(github|google)`을 하나씩 되넣어 각각 red 관측(커밋하지 않는다 — 되돌릴 때 `git checkout -- <디렉터리>` 금지, 파일 단위로, POSTMORTEM 2026-09-16). `pnpm gate`(격리 PG 포함) green.
- [ ] 격리 PG 트리거 — `scripts/gate-plan.ts` 트리거에 `auth.ts`·`lib/auth/safe-adapter.ts`·`lib/auth/roundtrip.ts`(design §1).
  - 검증: [자동] `scripts/__tests__/gate-plan.test.ts`에 그 경로 → 격리 PG 사례, green.
- [ ] `prisma/schema.prisma:637` `GitLabConnection` `///` 주석 갱신("GitLab은 로그인 공급자가 아니고" → 로그인 `Account(gitlab)`와 별개라는 뜻으로).
  - 검증: [자동] `git diff --stat prisma/migrations` 0 · `pnpm db:generate` green.
- [ ] `.env.example`(GitLab 블록 — 앱 하나·redirect 셋·스코프 `read_user`·그룹 소유·Confidential · `:80-81` "hosted는 둘 다 넣는다" · `:236`) · `deploy/.env.example`(`:27` callback 목록 `{github,gitlab,google}` · 쌍 규칙 · 키 둘) · `deploy/compose.yaml`(`AUTH_GITLAB_ID: "${AUTH_GITLAB_ID:-}"` 둘).
  - 검증: [자동] `self-hosted-gates.test.ts`(`:217+` optionalEnv 리터럴 등재 · `:362-385` provider ↔ env ↔ compose) green.

## 2. provider·검증된 이메일 — 커밋 B (`feat(auth): sign in with GitLab`) — T0 ①②③ 뒤

- [ ] `verifiedEmailFrom`의 gitlab 갈래(`email` 정규화 + `confirmed_at` 비어 있지 않은 문자열) · `freshVerifiedEmail` gitlab 갈래(raw 응답) · 순수 `gitlabProfile(raw)`(id 부재에서 던짐, `image: null` — D3). 위치: `lib/auth/email.ts` · `lib/auth/profile.ts`. 테스트: `lib/auth/__tests__/email.test.ts`(`confirmed_at` null·없음·빈 문자열 → 거부, `email` 없음·빈 문자열 → 거부, 대소문자·공백 정규화, `"apple"` → null 유지), `profile.test.ts`(id 숫자/문자열/부재 · `name` 없으면 `username` · `image` 항상 null).
  - 검증: [자동] red 뒤 green.
- [ ] `auth.ts` — `GitLab({ checks: ["pkce", "state"], profile: gitlabProfile })`, `withEnabled([github, gitlab, google], enabled)`(D2 순서). `provider-config.test.ts:59-62`(이름)·`:73`(정규식) 갱신, `:27`(`allowDangerousEmailAccountLinking` 부재) 유지. `lib/credentials/__tests__/sign-in.test.ts` — **GitLab env를 stub하고 `config.providers`에 `gitlab`이 있음을 먼저 단언한 뒤** `checks`를 고정한다(지금 `:21`은 켜진 provider만 순회해 꺼진 GitLab에 대해 공허하게 통과한다 — POSTMORTEM 2026-09-07).
  - 검증: [자동] `pnpm test` green. `withEnabled` 행동 테스트에 "gitlab 꺼짐 → providers에 없음" 사례.
- [ ] (T0 ③이 **오류**를 보일 때만) 회수·[Connect] Action의 재인증 인자 — `Record<LoginProvider, Record<string, string>>` 상수 하나를 `app/(edit)/account/actions.ts:180·:261`이 공유(D4). 무시되면 이 항목을 지우고 design D4에 결과만 적는다. 테스트: `lib/session-revocation/__tests__/action.test.ts:24`·`lib/account-connect/__tests__/action.test.ts:27`에 gitlab 사례.
  - 검증: [자동] green. [수동] T0 ③ 결과가 design D4에 적혀 있다.
- [ ] 격리 PG — `lib/credentials/__tests__/postgres.integration.ts`:
  - `["github","google"]` 루프(`:178`·`:224`·`:273`·`:457-466`·`:551`·`:958`·`:967`)와 타입 유니온(`:533`·`:874`·`:942`)을 `LOGIN_PROVIDERS`·`LoginProvider`로.
  - **fakeAuth `:238`** `withEnabled([fake("github"), fake("google")], enabled)`에 gitlab — 빠지면 GitLab 시나리오가 가짜 Auth.js에서 돌지 않는다(POSTMORTEM 2026-09-05 "가짜가 관대").
  - **"반대편 공급자" 삼항 `:463`·`:875`**(`provider === "github" ? "google" : "github"`)는 셋에서 정의되지 않는다 — 단순 치환이 아니라 **순서쌍 전부**를 돌거나 고정 짝 표를 명시하도록 다시 설계한다.
  - 신규 시나리오: GitLab 첫 로그인 → 같은 이메일 GitHub User가 있으면 challenge(행 0) · 확인 뒤 `Account(gitlab)` 토큰 null · 미확인 이메일(`confirmed_at` null) → User/Account/Session 0 · `/api/auth/callback/gitlab`이 세 가로채기에 잡힌다.
  - 검증: [자동] `pnpm test:credentials:postgres` green(`pnpm gate`가 붙인다).
- [ ] CSP — `lib/security-headers.ts` `form-action`에 `https://gitlab.com`(`img-src` 무변경 — D3). `lib/__tests__/security-headers.test.ts:109`(`form-action`) — `:94·:106`(`img-src`)은 그대로인지 확인.
  - 검증: [자동] green.

## 3. 경계 테스트 — 커밋 C (`test(credentials): keep GitLab sign-in apart from the GitLab PAT`)

- [ ] `credential-separation.test.ts`에 design §6의 두 규칙 — ① 로그인 경로(**루트 `auth.ts`를 명시적으로 읽어 넣는다** — `BOUNDARY_SOURCES` `:309` 밖) → `@/lib/gitlab/`·`@/lib/gitlab-connect/`(**하위 모듈 전부** — 기존 정규식 `:361`은 `connection`만 잡는다) import 0 ② GitLab 쓰기 경로(`lib/gitlab/**`·`lib/gitlab-connect/**`·`lib/repo-host/**`) → `account` 모델 접근 0. 격리 PG 시나리오: GitLab 로그인 수단 해제 → `GitLabConnection` 유지 · `disconnectGitLab` → `Account(gitlab)` 유지.
  - 검증: [자동] 뮤테이션 둘 — `auth.ts`에 `@/lib/gitlab-connect/errors` import · `lib/repo-host/`에 `tx.account` 접근 — 각각 red 관측(커밋하지 않는다) → green. `pnpm gate` green.

## 4. 화면 — 커밋 D (`feat(signin): show the GitLab sign-in button`)

- [ ] `brand-icons.tsx`에 `ProviderIcon({ provider })`(공급자 → 글리프 `Record<LoginProvider, …>`, `LoginProvider`는 `import type`) — 다섯 글리프 삼항 자리(design §5)를 이관, 라벨 삼항 셋은 `m.signIn[provider]`. ⚠️ **`ProviderButton` 함수 이름을 바꾸지 않는다**(`normal-login.test.tsx`가 `type.name`으로 찾는다 — POSTMORTEM 2026-09-10). `gitlab-glyph.test.ts`(경로는 이 파일에만·색 리터럴 0) 유지.
  - 검증: [자동] `rg -n 'github" \? ' app components` 0.
- [ ] **브랜드 글리프 (D6)** — design §5 "브랜드 글리프" 표대로 바꾼다.
  - `brand-icons.tsx`에 공식 3색 `GitlabBrandIcon`을 둔다. path는 GitLab 공식 press kit에서 가져오고, 출처·라이선스·고정 버전/SHA를 파일 머리에 적는다. 단색 `GitlabIcon`은 인라인 자리용으로 남긴다.
  - `ProviderIcon`의 gitlab → `GitlabBrandIcon`.
  - 카드 행 브랜드 조각(예: `BrandGlyph({ host })` — GitHub는 `text-foreground`)을 둔다. 다섯 자리를 이 조각으로 이관한다: `login-methods.tsx:101` · `github-section.tsx:72` · `gitlab-section.tsx:89` · `repository-card.tsx:138`·`:198`. `/signin/link` 배지(`[challenge]/page.tsx:103`)도 같은 형이다.
  - 인라인 다섯 자리(`project-list.tsx:288` · `sources-screen.tsx:94` · `meta-column.tsx:132` · `new-project.tsx:619` · `steps/repo.tsx`)는 건드리지 않는다.
  - 검증: [자동]
    - `gitlab-glyph.test.ts`를 두 글리프로 나눈다 — `GitlabIcon`은 `currentColor`와 색 리터럴 0, `GitlabBrandIcon`은 색 리터럴 집합이 `#E24329`·`#FC6D26`·`#FCA326`과 **정확히** 같다. tanuki path는 `brand-icons.tsx`에만 있다.
    - DOM — 위 다섯 카드 자리에서 `tone="warning"`·`"danger"` 칸이어도 브랜드 글리프가 `text-*` 상태 색을 상속하지 않는다(GitHub는 `text-foreground`, GitLab·Google은 path `fill` hex).
    - `visual-system.test.ts` green.
    - 뮤테이션: `GitlabBrandIcon`에 `currentColor`를 되넣으면 red이고, 카드 조각에서 `text-foreground`를 빼면 red다.
- [ ] 테스트 기본 env — `vitest.setup.ts:13`에 `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET`(hosted D5와 맞춘다). 함께 바뀌는 기대:
  - `lib/credentials/__tests__/sign-in.test.ts:20`(`toHaveLength(2)` → 3)
  - `components/__tests__/provider-progress.test.tsx` `:50`(루프) · `:56`(`toHaveLength` — **페이지당 `ProviderButton` 수 = 공급자 수**, 3) · `:64`(라벨 삼항)
  - `app/(edit)/account/__tests__/structure.test.tsx` `:286`·`:290`·`:331`·`:673`(공급자 수 의존 — `:193-203`의 `:203`은 Sessions 카드라 무관)
  - `lib/auth/__tests__/login-providers.test.ts` `:58`·`:64`·`:68`·`:73`
  - `lib/session-revocation/__tests__/normal-login.test.tsx` `:101`(`[github primary, gitlab default, google default]`)·`:107`·`:116` — node 환경·Children 순회 테스트다(DOM 아님)
  - `app/oauth/authorize/__tests__/page.test.tsx:179` · `components/__tests__/action-throws.test.tsx:153`
  - 검증: [자동] 위 파일 green · `pnpm test` green.
- [ ] 사전 — `signIn.gitlab` · GitLab PAT 카드 문구(J8 — 미연결 행 이름·`disconnectLabel`·`confirmDisconnect`·`disconnectConfirm`, `en.tsx:2106`·`:2117-2122`, 주석 갱신) · 초대 안내 `en.tsx:3594`에 GitLab(주 이메일) — en·ko·es 같은 커밋(`/translate` 모드 ①). J8 DOM: `account/__tests__/structure.test.tsx`에 "GitLab 로그인 수단 행과 PAT 카드의 접근 이름·확인 제목이 겹치지 않는다" 사례.
  - 검증: [자동] `dictionary-consistency`·`banned-terms`·`no-korean-ui`·`structure.test.tsx` green.
- [ ] 실물 — `/runtime-test`(로컬, 등록된 앱):
  - `/signin`·`/invite/[token]`·`/oauth/authorize` 세 버튼 — **375폭 · 라이트 · 다크** 각각(시안이 없으므로 표현 층은 여기서 본다)
  - GitLab 로그인 왕복 · 초대 링크 → GitLab 로그인 → 수락
  - `/account` — GitLab 로그인 행 × PAT 카드 **네 상태**(둘 다 미연결 · 로그인만 · PAT만 · 둘 다): 이름·해제 확인 제목이 겹치지 않는가(J8) · [Connect]·해제·`Continue to GitLab` 회수
  - **브랜드 글리프 체크리스트 (D6)** — 라이트·다크 각각:
    - [ ] `/signin` — GitHub 버튼이 primary 채움 위 흰색이다. GitLab 버튼은 3색 tanuki, Google 버튼은 4색 G다.
    - [ ] `/invite/[token]`·`/oauth/authorize` — 위와 같다.
    - [ ] (self-hosted GitLab 단독 구성) GitLab이 primary 채움 위에서도 3색이고 대비가 유지된다.
    - [ ] `/signin/link/<challenge>` 배지 — 브랜드 색이다.
    - [ ] `/account` 로그인 수단 카드 — GitHub 칸은 회색이 아니라 잉크(라이트 검정 / 다크 흰색)다. GitLab은 3색, Google은 4색이다.
    - [ ] `/account` GitHub App 카드 · GitLab PAT 카드 — 연결 상태에서 브랜드 색이다. GitLab PAT 만료 임박(경고 칸)에서 칸 면만 호박색이고 tanuki는 3색 그대로다.
    - [ ] 설정 리포 카드(GitHub·GitLab 프로젝트 각각) — 정상 상태와 경고·실패 상태 모두에서 글리프가 브랜드 색이다. 연결이 끊긴 상태는 `Unplug`가 상태 색을 받는다.
    - [ ] 인라인 자리(프로젝트 목록 · 소스 화면 · 홈 메타 · 새 프로젝트 GitLab 탭)는 단색 그대로다.
  - 미확인 이메일 거부는 실물로 재현할 수 없다(gitlab.com은 가입 시 확인 강제) — 격리 PG(§2)가 맡고, 초대 복귀 경로는 공급자 중립이라 생략한다
  - 검증: [수동] 시나리오별 통과/결함 이슈. 결함은 BugShot으로.

## 5. 개인정보 방침 — 커밋 E (`docs(privacy): add GitLab as a sign-in provider`)

- [ ] en·ko 본문(design §7 줄 목록 — 수집 표 `:742`(ko `:35`)는 사진 출처를 갈라 적고, GitLab 전송처 `:880`(ko `:173`)에 로그인 목적, 아바타 줄 `:814`·`:888`은 그대로) · `REVISIONS` 새 행 · en·ko `effectiveDate`·`changes` · `policy-gate.test.tsx:310` 리터럴 날짜 · `collected.ts:125`·`:129` 주석.
  - 검증: [자동] `policy-gate.test.tsx` green. [수동] `/push` 4단계 — 새 목적(로그인) 판정, GitLab이 사진 출처로 읽히는 문장 0(D3 — 거짓 문장 0).

## 6. 정본 문서 — 문서별 커밋(`docs(<scope>): …`)

- [ ] **PRODUCT** — §4.2 "GitLab 로그인"(`:485`) 제거(바로 윗줄 `:484` "GitLab OAuth 앱 연결"은 남기되 "리포 연결용"임을 한 구절로) · §4.1에 로그인 공급자 셋째(GitLab.com만, Self-Managed 없음) · §4.1 셀프 호스팅 "그대로인 것"의 로그인 공급자 목록(`:442`) · §4.3 ① "1차 로그인은 … 둘뿐"(`:519`) · `:228` "로그인 방식이 역할을 정하지 않는다" 예시 · `:231`·`:527`·`:531`.
- [ ] **ARCHITECTURE** — §6 표 로그인 행(`:2361`) · §6.2 GitLab 검증 단락(`confirmed_at` 근거·T0 실측 결과) · `checks` 셋(`:2728`) · 계정 병합 절 `linkAccount` "github/google"(`:2782`) · "켜진 로그인 공급자"(`:2801-2813` — 순서, `:2807` canUnlink 반례, 우주 사본 절 `:2811`을 "하나로 모았다 + `provider-universe.test.ts`(google 토큰 판정)"로 교체, `:2810`) · 토큰 비저장(`:1592`) · `:2838` · `:4240` · CSP `form-action`·"아바타 호스트 둘"(`:4271-4273`) · 회수 절에 T0 ⑤ 판정 · §6.41(GitLab 연결)에 "GitLab 로그인 `Account`와 `GitLabConnection`은 별개 — 서로를 만들거나 지우지 않는다" 한 문장(지금 이 문장의 반대 단언이 `schema.prisma:637` 주석에 있었다 — 커밋 A에서 고친다).
- [ ] **CLAUDE.md** — 스택 표 로그인 행 "GitHub + Google" → 셋 · 자격증명 절 GitLab 단락에 J6 문장(번호 없이: "GitLab 로그인 토큰은 GitHub 표의 OAuth App 토큰 행과 같은 지위다 — 콜백 안에서만 살고 저장하지 않으며 리포 API를 부르지 않는다"). 편집 뒤 `pnpm sync:agents`(훅이 미러를 재생성한다).
- [ ] **DESIGN** — §6.62 "hosted는 둘" → 셋 · §6.8 `:2204` "provider GitHub·Google" · 브랜드 로고 규칙 `:2240` · 브랜드 아이콘 행에 GitLab(`ProviderIcon`) · §6.67 `:2040` "hosted는 언제나 둘"과 본문 예시 · `:2046` 접근 이름 행에 PAT 카드 짝(J8) · **브랜드 글리프(D6)**: §6.8의 "GitLab tanuki는 단색" 문장을 자리별 규칙으로 바꾼다(로그인·카드 칸은 브랜드 색, 인라인은 단색). §6.2 raw 색 예외에 GitLab 공식 hex 셋을 Google과 나란히 등재한다. §6.8 "색은 상속"의 예외에 "칸 안 브랜드 GitHub는 `text-foreground`"를 더한다. §2.4 아이콘 칸 열에는 "상태 칸에서도 브랜드 글리프는 `tone`을 받지 않는다"를 더한다.
- [ ] **OPERATIONS** — "GitLab 로그인 앱" 절(design §8 — Vercel 투입 스크립트 절차 포함) · "새 머신 셋업"에 GitLab 줄 · `:376`.
- [ ] **SELF-HOSTING** — §4 게이트 문장 · `:118` · §7 "로그인 공급자 단독 구성" 행에 GitLab 단독.
- [ ] **README** — `:206` 로그인 목록 · `:219`·`:224` 전송처 목적.
- [ ] **DIRECTORY** — 새 파일(`provider-universe.test.ts`)이 설명이 필요한 자리면.
  - 검증(이 절 전체): [자동] `pnpm sync:agents:check` green. [수동] `/push` 4단계 문서 신선도 — "GitHub or Google"·"github·google" 로그인 목록이 정본에 남지 않음(`rg -n 'GitHub (or|and) Google|GitHub·Google' docs README.md CLAUDE.md`를 보고 로그인 맥락만 판정).

## 7. 가이드 — `/guide` · `/guide-shots`

- [ ] 원고 en·ko·es 같은 커밋 — `faq.md:11·:71` · `translate/README.md:3` · `translate/join.md:5·:10`(GitLab은 주 이메일로 초대) · `ai-agents/browser.md:9` · `account/profile.md:16-27` · `self-hosting/install.md:12-19·:30-32`(`:12`·`:14` optional 조건, `:18` "GitHub, Google, or both", `:19` "still required … no GitLab environment variables" 교체, GitLab OAuth 앱 행) · `self-hosting/README.md:20·:27` · `self-hosting/operate.md:104-112` · `self-hosting/troubleshooting.md:12-13·:73-77·:117-122`(운영자 개인정보 재료 — SELF-HOSTING §3-8).
  - 검증: [자동] `pnpm test` 가이드 게이트 green. [수동] `/guide` 리포트.
- [ ] 스크린샷 — `/signin`·`/account` 수단 카드·GitLab PAT 카드가 찍힌 컷.
  - 검증: [자동] `pnpm guide:check` stale 0(hosted에 GitLab이 켜진 뒤 촬영 — 그 전엔 컷이 바뀌지 않는다).

## 8. 배포 — `/push` → `/merge` → env

- [ ] `/push` — 위 A~E + 문서. Preview env에 **같은 앱**의 `AUTH_GITLAB_*`를 사용자가 CLI 스크립트로 투입(design §8 — 값을 stdin으로 넘기고 찍지 않는다, Preview 환경별 변수) → `vercel env ls`로 Preview 범위에 둘 다 있음을 확인(성공 메시지를 근거로 삼지 않는다) → 재배포 뒤 `https://dev.mal-moi.com`에서 GitLab 로그인 왕복.
  - 검증: [수동] `vercel env ls` Preview 두 이름 · preview 왕복 성공 · `Account(gitlab)` 토큰 null(dev DB 조회).
- [ ] `/merge` 뒤 프로덕션 env(`AUTH_GITLAB_*` Production) 투입 — 방침 시행일이 이미 지났거나 같은 배포인지 먼저 본다(design §7). 같은 스크립트로 Production 환경별 변수 → `vercel env ls`로 확인.
  - 검증: [수동] `https://mal-moi.com/signin`에 `Continue with GitLab`, 실물 왕복 성공.
- [ ] 이 디렉터리를 지운다 — 결론이 §6 정본에 올라간 뒤.
  - 검증: [자동] `ls docs/features/gitlab-oauth` 없음.
