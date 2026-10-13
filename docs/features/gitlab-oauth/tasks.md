# GitLab sign-in — 태스크

작성: 2026-10-13 · 상태: **착수 대기**(v1.4.0 `/merge` 뒤). 짝: [spec.md](spec.md) · [design.md](design.md)

검증 줄 표기: **[자동]** 명령 결과로 판정 · **[수동]** 스킬·절차로 사람이 판정. 커밋마다 `pnpm gate` green — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30). `lib/credentials/`·`lib/login-link/`·`lib/session-revocation/`·`lib/account-connect/`를 건드리는 커밋은 `pnpm gate`가 `test:credentials:postgres`를 스스로 붙인다(`scripts/gate-plan.ts:89`).

**배치 경계**: 커밋 A~E는 **같은 `/push` 한 배치**로 나간다 — A·B만 나가면 Auth.js에 GitLab이 들어가는데 화면·방침이 둘인 창이 생기고, 방침이 코드보다 늦으면 방침이 거짓이다(design §7). hosted에서 실제로 켜지는 것은 env를 넣는 순간(§7)이라 dev 배포만으로는 아무 사용자에게도 버튼이 서지 않는다.

**design-brief 없음** — 새 표면이 없다(design §5).

## 0. 결정·실측 — 코드 전

- [ ] design §4 "확인 필요" D1~D5를 사용자가 닫는다.
  - 검증: [수동] design §4 표의 각 행에 결정·날짜가 적혀 있다.
- [ ] **T0 실측** — dev용 GitLab 애플리케이션을 등록하고(⚠️ 외부 등록 — 사용자 확인 뒤. 그룹 소유 여부는 D5) 테스트 계정 `ox501501`(ego 브라우저, gitlab.com에 "Sign in with GitHub")로 로컬 왕복을 밟는다. 재는 것: ① `read_user` 토큰의 `GET /api/v4/user`에 `email`·`confirmed_at`이 실리나(design §2 — 없으면 D1을 다시 연다) ② authorize URL에 `code_challenge_method=S256`이 나가고 교환이 통과하나(J2) ③ `prompt=select_account`를 붙인 authorize가 오류 없이 지나는지·무시되는지(D4) ④ `avatar_url` 호스트(D3) ⑤ 이미 인가한 앱으로 다시 왕복할 때 GitLab 인가 화면이 다시 뜨는지(회수 왕복의 체감) ⑥ 등록 직후 앱 소유 계정이 아닌 계정으로 인가되는지(게시 단계 부재, design §8).
  - 검증: [수동] design §2·§4에 실측 결과(필드 유무·응답 코드·호스트)가 적히고 "실측 전" 표기가 0이다. 토큰·secret 원문은 어디에도 적지 않는다. 실측용 코드는 `.scratch/`에만 둔다.

## 1. 공급자 우주·env — 커밋 A (`feat(auth): add GitLab to the login provider universe`)

순수 함수 먼저(`/tdd interface`).

- [ ] `LoginProvider`·`LOGIN_PROVIDERS`에 `gitlab`(순서 D2), `LOGIN_PROVIDER_ENV.gitlab`, `loginProviderStates`·`enabledLoginProviders`의 리터럴 `optionalEnv("AUTH_GITLAB_*")` 둘. 테스트: `lib/auth/__tests__/login-providers.test.ts`(`:18-26`·`:35-37`·`:47`·`:58`), `lib/login-link/__tests__/policy.test.ts`(`pickLoginAccount`·`loginMethodRows` 총수·`signInButtons` primary·`canUnlink` — 연결 `[github, gitlab]`·켜짐 `[gitlab]`에서 GitLab 해제 거부 사례 포함).
  - 검증: [자동] red 관측 뒤 구현, `pnpm test` green.
- [ ] preflight — `SELF_HOSTED_ENV`에 `AUTH_GITLAB_ID`·`AUTH_GITLAB_SECRET` `"optional"`. 테스트: `preflight.test.ts:199-249` 행렬을 공급자 셋으로(`pair(prefix)` 인자형 확장, `NONE` 세 이름), `:274-275`, `scripts/__tests__/preflight-entry.test.ts:85-93`의 stderr 세 줄.
  - 검증: [자동] `pnpm test` green — 반쪽 GitLab이 `incomplete-pair AUTH_GITLAB_SECRET`, 전부 없음이 세 ID 이름의 `no-login-provider`.
- [ ] 우주 사본 하나로 모으기(design §3 표 전 행) + 게이트 `lib/auth/__tests__/provider-universe.test.ts`(신규 — 리터럴 쌍·`=== "google"` 비교가 허용 파일 밖 0).
  - 검증: [자동] 게이트를 먼저 써서 red(현재 사본 개수가 찍힘) → 치환 뒤 green. `rg -n '"github",\s*"google"' app lib components auth.ts -g '!**/__tests__/**'` 결과가 허용 파일뿐. `pnpm gate`(격리 PG 포함) green.
- [ ] `.env.example`(GitLab 블록 — redirect 셋·스코프 `read_user`·그룹 소유·Confidential) · `deploy/.env.example`(`:26` callback 목록 `{github,google,gitlab}` · 쌍 규칙 · 키 둘) · `deploy/compose.yaml`(`AUTH_GITLAB_ID: "${AUTH_GITLAB_ID:-}"` 둘).
  - 검증: [자동] `self-hosted-gates.test.ts`(`:217+` optionalEnv 리터럴 등재 · `:362-385` provider ↔ env ↔ compose) green.

## 2. provider·검증된 이메일 — 커밋 B (`feat(auth): sign in with GitLab`)

- [ ] `verifiedEmailFrom`의 gitlab 갈래(`email` 정규화 + `confirmed_at` 비어 있지 않은 문자열) · `freshVerifiedEmail` gitlab 갈래(raw 응답) · 순수 `gitlabProfile(raw)`(id 부재에서 던짐, 아바타 D3). 위치: `lib/auth/email.ts` · `lib/auth/profile.ts`. 테스트: `lib/auth/__tests__/email.test.ts`(`confirmed_at` null·없음·빈 문자열 → 거부, 대소문자·공백 정규화, `"apple"` → null 유지), `profile.test.ts`(id 숫자/문자열/부재).
  - 검증: [자동] red 뒤 green.
- [ ] `auth.ts` — `GitLab({ checks: ["pkce", "state"], profile: gitlabProfile })`, `withEnabled([github, google, gitlab], enabled)`. `provider-config.test.ts:59-62`(이름)·`:73`(정규식) 갱신, `:27`(`allowDangerousEmailAccountLinking` 부재) 유지. `lib/credentials/__tests__/sign-in.test.ts`가 gitlab의 `checks`도 고정한다.
  - 검증: [자동] `pnpm test` green. `withEnabled` 행동 테스트에 "gitlab 꺼짐 → providers에 없음" 사례.
- [ ] 회수·[Connect] Action의 재인증 인자 — 순수 `reauthParams(provider)`(D4 결과대로), `app/(edit)/account/actions.ts:180·:261`이 공유. 테스트: `lib/session-revocation/__tests__/action.test.ts:24`·`lib/account-connect/__tests__/action.test.ts:27`에 gitlab 사례.
  - 검증: [자동] green.
- [ ] 격리 PG — `lib/credentials/__tests__/postgres.integration.ts`의 `["github","google"]` 루프(`:178`·`:224`·`:273`·`:457-466`·`:533`·`:551`·`:874`·`:942`·`:958`·`:967`)를 `LOGIN_PROVIDERS`로. 신규 시나리오: GitLab 첫 로그인 → 같은 이메일 GitHub User가 있으면 challenge(행 0) · 확인 뒤 `Account(gitlab)` 토큰 null · 미확인 이메일 → User/Account/Session 0.
  - 검증: [자동] `pnpm test:credentials:postgres` green(`pnpm gate`가 붙인다).
- [ ] CSP — `lib/security-headers.ts` `form-action`에 `https://gitlab.com`(+ D3이 받으면 `img-src`). `lib/__tests__/security-headers.test.ts:94·:106`.
  - 검증: [자동] green.

## 3. 경계 테스트 — 커밋 C (`test(credentials): keep GitLab sign-in apart from the GitLab PAT`)

- [ ] `credential-separation.test.ts`에 design §6의 두 규칙(로그인 경로 → `@/lib/gitlab*` import 0 · GitLab 쓰기 경로 → `account` 모델 접근 0). 격리 PG 시나리오: GitLab 로그인 수단 해제 → `GitLabConnection` 유지 · `disconnectGitLab` → `Account(gitlab)` 유지.
  - 검증: [자동] 규칙을 일부러 어긴 임시 import로 red 관측(커밋하지 않는다) → green. `pnpm gate` green.

## 4. 화면 — 커밋 D (`feat(signin): show the GitLab sign-in button`)

- [ ] `brand-icons.tsx`에 `ProviderIcon({ provider })`(공급자 → 글리프 `Record<LoginProvider, …>`) — 다섯 삼항 자리(design §5)를 이관, 라벨 삼항 셋은 `m.signIn[provider]`. `gitlab-glyph.test.ts`(경로는 이 파일에만·색 리터럴 0) 유지.
  - 검증: [자동] `rg -n 'github" \? ' app components` 0. DOM 테스트 — `normal-login.test.tsx:101`(`[github primary, google default, gitlab default]`) · `provider-progress.test.tsx`(`:50`·`:56`·`:64`) · `account/__tests__/structure.test.tsx`(`:193-203` rows 셋) · `oauth/authorize/__tests__/page.test.tsx`(`:179`) · `action-throws.test.tsx:153` 갱신 green.
- [ ] 사전 — `signIn.gitlab` · `link.providers.gitlab` en·ko·es 같은 커밋(`/translate` 모드 ①).
  - 검증: [자동] `dictionary-consistency`·`banned-terms`·`no-korean-ui` green.
- [ ] 실물 — `/runtime-test`(로컬, T0 앱) : `/signin` 세 버튼(라이트·다크·375폭) · GitLab 로그인 왕복 · 초대 링크 → GitLab 로그인 → 수락 · 초대 링크 → 미확인 이메일 거부 → 초대 복귀(POSTMORTEM 2026-09-12) · `/account` GitLab 행 [Connect]·해제·`Continue to GitLab` 회수 · GitLab PAT 카드와 나란히 선 모습(J8) · `/oauth/authorize` 버튼.
  - 검증: [수동] 시나리오별 통과/결함 이슈. 결함은 BugShot으로.

## 5. 개인정보 방침 — 커밋 E (`docs(privacy): add GitLab as a sign-in provider`)

- [ ] en·ko 본문(design §7 줄 목록) · `REVISIONS` 새 행 · en·ko `effectiveDate`·`changes` · `policy-gate.test.tsx:310` 리터럴 날짜 · `collected.ts:150-154` 주석.
  - 검증: [자동] `policy-gate.test.tsx` green. [수동] `/push` 4단계 — 새 목적(로그인) 판정, 아바타 줄이 D3과 맞는지(거짓 문장 0).

## 6. 정본 문서 — 문서별 커밋(`docs(<scope>): …`)

- [ ] **PRODUCT** — §4.2 "GitLab 지원의 확장"에서 "GitLab 로그인" 제거(같은 줄 "GitLab OAuth 앱 연결"은 남기되 "리포 연결용"임을 한 구절로) · §4.1에 로그인 공급자 셋째(GitLab.com만, Self-Managed 없음) · §4.1 셀프 호스팅 "그대로인 것"의 로그인 공급자 목록(`:442`) · §4.3 ① "1차 로그인은 … 둘뿐" 목록 · `:228` "로그인 방식이 역할을 정하지 않는다" 예시 · §4.3 ④ 병합 서술의 공급자 목록.
- [ ] **ARCHITECTURE** — §6 표 로그인 행(`:2345`) · §6.2 GitLab 검증 단락(`confirmed_at` 근거·실측 결과) · `checks` 셋(`:2712`) · "켜진 로그인 공급자"(`:2785-2797` — 순서, 우주 사본 절을 "하나로 모았다 + `provider-universe.test.ts`"로 교체) · 계정 병합 절의 `linkAccount` "github/google" 표현 · §6.41(GitLab 연결)에 "GitLab 로그인 `Account`와 `GitLabConnection`은 별개 — 서로를 만들거나 지우지 않는다" 한 문장(gitlab-repositories `design.md:379`의 "GitLab은 로그인 공급자가 아니다"는 정본에 올라가지 않았다 — 2026-10-13 grep 0건).
- [ ] **CLAUDE.md** — 스택 표 로그인 행 "GitHub + Google" → 셋 · 자격증명 절 GitLab 단락에 "GitLab 로그인 OAuth 토큰은 다섯째 — 콜백 안에서만 살고 저장하지 않으며 리포 API를 부르지 않는다"(J6). 편집 뒤 `pnpm sync:agents`(훅이 미러를 재생성한다).
- [ ] **DESIGN** — §6.62 "hosted는 둘" → 셋 · 브랜드 아이콘 행에 GitLab(`ProviderIcon`) · §6.67 수단 카드.
- [ ] **OPERATIONS** — "GitLab 로그인 앱" 절(design §8) · "새 머신 셋업"에 GitLab 줄.
- [ ] **SELF-HOSTING** — §4 게이트 문장 · §7 "로그인 공급자 단독 구성" 행에 GitLab 단독.
- [ ] **README** — `:206` 로그인 목록 · `:219`·`:224` 전송처 목적.
- [ ] **DIRECTORY** — 새 파일(`provider-universe.test.ts`)이 설명이 필요한 자리면.
  - 검증(이 절 전체): [자동] `pnpm sync:agents:check` green. [수동] `/push` 4단계 문서 신선도 — "GitHub or Google"·"github·google" 로그인 목록이 정본에 남지 않음(`rg -n 'GitHub (or|and) Google|GitHub·Google' docs README.md CLAUDE.md`를 보고 로그인 맥락만 판정).

## 7. 가이드 — `/guide` · `/guide-shots`

- [ ] 원고 en·ko·es 같은 커밋 — `faq.md:11·:71` · `translate/README.md:3` · `translate/join.md:5·:10`(GitLab은 주 이메일로 초대) · `ai-agents/browser.md:9` · `account/profile.md:16-27` · `self-hosting/install.md:12-19·:30-32`(GitLab OAuth 앱 행, "no GitLab environment variables" 문장 교체) · `self-hosting/README.md:20·:27` · `self-hosting/operate.md:104-112` · `self-hosting/troubleshooting.md:12-13·:73-77·:117-122`(운영자 개인정보 재료 — SELF-HOSTING §3-8).
  - 검증: [자동] `pnpm test` 가이드 게이트 green. [수동] `/guide` 리포트.
- [ ] 스크린샷 — `/signin`·`/account` 수단 카드가 찍힌 컷.
  - 검증: [자동] `pnpm guide:check` stale 0(hosted에 GitLab이 켜진 뒤 촬영 — 그 전엔 컷이 바뀌지 않는다).

## 8. 배포 — `/push` → `/merge` → env

- [ ] `/push` — 위 A~E + 문서. dev(preview)에 dev용 GitLab 앱 env(`dev.mal-moi.com` redirect 포함)를 넣고 `https://dev.mal-moi.com`에서 GitLab 로그인 왕복.
  - 검증: [수동] preview에서 왕복 성공·`Account(gitlab)` 토큰 null(dev DB 조회).
- [ ] `/merge` 뒤 프로덕션 env(`AUTH_GITLAB_*` Production) 투입 — 방침 시행일이 이미 지났거나 같은 배포인지 먼저 본다(design §7). `vercel env ls`로 확인(성공 메시지를 근거로 삼지 않는다).
  - 검증: [수동] `https://mal-moi.com/signin`에 `Continue with GitLab`, 실물 왕복 성공.
- [ ] 이 디렉터리를 지운다 — 결론이 §6 정본에 올라간 뒤.
  - 검증: [자동] `ls docs/features/gitlab-oauth` 없음.
