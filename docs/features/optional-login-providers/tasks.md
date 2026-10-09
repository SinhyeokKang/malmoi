# Optional login providers — 태스크

상태: 미착수. 검증 표기: **[자동]** 명령으로 판정 · **[수동]** 사람이 실물로 판정.

**배치 경계**: 커밋 A(판정 + 소비자)·B(preflight·게이트·배치)·C(문서)는 **같은 `/push` 배치**로 나간다. B(preflight 완화)가 A(화면·판정) 없이 나가면 반쪽 설치가 기동해 꺼진 버튼이 누르면 실패하는 채로 선다. **판정과 소비자를 한 커밋에 둔다** — `enabled` 인자에 기본값이 없으므로(design §2.3) 시그니처만 바꾼 커밋은 호출부(`plan.ts`·`view.ts`·`store.ts`·`session-revocation/store.ts`·`account/actions.ts`·`page.tsx`·`login-methods.tsx`, 테스트 호출부 포함)에서 typecheck가 red다. 같은 이유로 T3(`optional` 전환)과 T7(②-c 단언 갱신 — `self-hosted-gates.test.ts:353`이 `required`를 단언한다)이 한 커밋이다. 커밋마다 `pnpm gate` green — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30). 격리 PG 스위트는 `scripts/gate-plan.ts:70-71`의 `lib/login-link/`·`lib/session-revocation/` 트리거로 붙는다 — `lib/credentials/__tests__/postgres.integration.ts`의 실제 파급은 `loadLinkOffer`(`:250`)·`beginRevocation`(`:466~812`)이다(`pickLoginAccount`는 `:461` 주석뿐). `pnpm gate` 출력에서 붙었는지 확인한다.

## 0. 착수 전

- [x] spec §6 Q1~Q4를 사용자가 닫는다 (2026-10-09 — 넷 모두 추천안).
  - 검증: [수동] spec §6 표가 "결정" 열이고 미결 0행.
- [x] `/feature-review` 반영 (2026-10-09 — spec §6 Q5~Q7, 커밋 재구획, 테스트 env 기본값, compose 정적 단언).
  - 검증: [수동] spec §6 Q5~Q7 행이 결정 열을 가진다.

## 1. 판정 + 소비자 — 커밋 A (`/tdd interface` → `/implement`)

- [ ] T1 `lib/auth/login-providers.ts` — `LOGIN_PROVIDER_ENV`·`loginProviderStates`·`withEnabled`·`enabledLoginProviders` (design §2.1 — 상태 → 집합 filter는 `enabledLoginProviders` 안에 인라인). 공백 판정은 preflight `present` 하나를 공유한다(새로 쓰지 않는다). `vitest.setup.ts`에 `AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`·`AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` 더미 넷을 PII 키처럼 넣는다 — 테스트 기본 = hosted(두 쌍), 단독 케이스는 `vi.stubEnv("AUTH_GITHUB_ID", "")`로 끈다. ⚠️ preflight 단위·entry 테스트가 `process.env`를 그대로 넘기는 자리가 있으면 더미가 결과를 바꾸지 않는지 함께 본다. 테스트 먼저: 상태 표(각 공급자 enabled/absent/partial × 공백만 있는 값 = 빈 값), 순서 고정, `withEnabled`가 켜진 것만·순서 보존, `enabledLoginProviders`가 호출 시점의 env를 읽는다(모듈 import만으로 env를 읽지 않는다).
  - 검증: [자동] `pnpm exec vitest run lib/auth/__tests__/login-providers.test.ts` green.
- [ ] T2 `lib/login-link/policy.ts` — `pickLoginAccount`·`loginMethodRows`·`canUnlink`에 `enabled` 인자(기본값 없음), `signInButtons` 신설(`{ provider, variant }`만 — `autoFocus` 없음). `plan.ts` `planLinkOffer`에 `enabled` + 새 kind `method-unavailable`. 테스트 먼저(기존 `lib/login-link/__tests__/policy.test.ts`·`plan.test.ts` 갱신 — 호출부 policy 17곳·plan 11곳):
  - 두 공급자 켜짐 = 지금 결과와 같다(회귀 고정)
  - `canUnlink([github, google], "google", [google])` → false · `canUnlink([google, github], "github", [google])` → false(꺼진 공급자) · `canUnlink(…, …, [])` → false
  - `pickLoginAccount([github, google], [google])` → google · `([github], [google])` → null · `([google, github], [github, google])` → github(**`LOGIN_PROVIDERS` 순서로 결정적** — 입력 배열 순서가 아니다)
  - `loginMethodRows([github], [google])` → `[{ google, connected: false }]` · `([github, google], [google])` → 행 1개, `methodCounts` 1 of 1
  - `signInButtons([google])` → `[{ google, primary }]` · `([github, google])` → github primary, google default · `([])` → `[]`
  - `planLinkOffer` — 기존 사용자의 연결이 꺼진 공급자뿐이면 `method-unavailable` · 연결 0이거나 같은 공급자면 지금처럼 `sign-in`
  - 검증: [자동] `pnpm exec vitest run lib/login-link` green. `components/__tests__/client-graph.test.ts` green(policy가 새 모듈을 import하지 않는다).
- [ ] T4 `auth.ts` — config 함수 안에서 `withEnabled([github, google], enabledLoginProviders())`로 `providers`를 구성하고, 한 번 읽은 `enabled`를 `loadLinkOffer`에 넘긴다. `method-unavailable` → `routes.signIn({ error: "MethodUnavailable" })`. `lib/login-link/store.ts` `loadLinkOffer`·`lib/login-link/view.ts` `loadChallengeView`·`lib/session-revocation/store.ts` `beginRevocation`이 `enabled`를 받는다. 호출부 `app/signin/link/[challenge]/page.tsx:58`도 넘긴다. **`beginRevocation`의 우주 하드코딩 `["github","google"]`은 바꾸지 않는다**(design §2.4 — 외과적 변경).
  - 검증: [자동] `lib/session-revocation/__tests__/store.test.ts`·`lib/login-link/__tests__/store.test.ts`에 "꺼진 공급자만 연결 → invalid / `method-unavailable`" 케이스 green. **`loadChallengeView` 행동 테스트 새 파일**(`lib/login-link/__tests__/view.test.ts` — fake prisma, 지금은 `view-contract.test.ts` 텍스트 대조뿐)에 "꺼진 공급자만 연결 → `null`" green. `lib/auth/__tests__/provider-config.test.ts`에 주석을 벗긴 `auth.ts`에서 `withEnabled(` **호출형** 단언 — 호출을 지우는 뮤테이션 1회로 red 확인(POSTMORTEM 2026-09-18). `postgres.integration.ts`의 `loadLinkOffer`·`beginRevocation` 호출부에 `enabled` 추가 + 꺼진 공급자 케이스 하나.
- [ ] T5 로그인 진입점 셋 — `app/signin/page.tsx`·`app/invite/[token]/page.tsx`·`app/oauth/authorize/page.tsx`가 `signInButtons(enabledLoginProviders())`로 그린다. `ProviderButton` 이름 유지, `variant`는 `signInButtons` 결과에서. `/oauth/authorize`의 `autoFocus`는 **조건(`view.kind === "sign-in" && view.notice === "switch"`) 그대로 index 0에** 붙인다. `/signin`의 `signInErrorMessage`에 `MethodUnavailable` 갈래, 사전 키 1개를 en·ko·es 같은 커밋에(`/translate` 모드 ①, design §2.5).
  - 검증: [자동] `lib/session-revocation/__tests__/normal-login.test.tsx` — 기존 `ENTRIES`(setup 기본 = 두 쌍) green + Google 단독 stub에서 세 진입점의 버튼 수 1·`google` primary 케이스. `components/__tests__/provider-progress.test.tsx`(진입점 × 공급자, `toHaveLength(2)`)·`app/oauth/authorize/__tests__/page.test.tsx`(`Continue with Google`) green + `switch`에서 `autoFocus`가 첫 버튼에 붙는 단언(Google 단독 포함). `MethodUnavailable` 문구 렌더 단언. `lib/i18n` 사전 일관성 테스트 green.
- [ ] T6 `/account` — `page.tsx`가 `loginMethodRows(methods, enabled)`·`pickLoginAccount(methods, enabled)`, `login-methods.tsx`가 `canUnlink(connected, provider, rows.map(...))`. `sessions-section.tsx`: `confirmProvider === null`이면 트리거 `aria-disabled` + 사유(새 키 1개, en·ko·es — design §2.5, 기존 비활성 형). `actions.ts`: `unlinkLoginMethod`(꺼진 공급자 → `unavailable`, 판정은 켜진 연결 수단으로), `startLoginMethodConnect`(꺼진 공급자 → `?connect=failed`, OAuth·쿠키·challenge 0), `startSessionRevocation`(한 번 읽은 `enabled`를 pick과 `beginRevocation` 둘에). 행 고정 수를 단언하던 주석("행이 언제나 둘")을 고친다.
  - 검증: [자동] `components/__tests__/login-methods.test.ts`·`app/(edit)/account/__tests__/structure.test.tsx`(행 `[2,1,2]`·`count(…,2)` — setup 기본으로 green 유지) green + Google 단독 stub에서 행 1·`1 of 1`. Action 테스트는 기존 하네스에:
    - `lib/session-revocation/__tests__/action.test.ts` — 꺼진 GitHub 행 + 켜진 Google 하나에서 Google 해제 `last-method` · 꺼진 GitHub 직접 해제 `unavailable` · 켜진 연결 0인 사용자의 `startSessionRevocation` `unavailable`
    - `lib/account-connect/__tests__/action.test.ts` — 꺼진 공급자로 연결 시작 → `signIn`·challenge `begin`·쿠키 `set` 0회, `?connect=failed`
    - `sessions-section` 렌더 — `confirmProvider === null`에서 `aria-disabled` + 사유 문구
  - 검증: [자동] `pnpm test:credentials:postgres` green(`pnpm gate`가 붙인다).

## 2. preflight·게이트·배치 — 커밋 B

- [ ] T3 `lib/deployment/preflight.ts` — 네 값 `optional` + 쌍 규칙 + 사유 둘 (design §2.2). 테스트 먼저: `preflight.test.ts`에 9칸 표 전부, 값이 결과에 실리지 않는다, 기존 케이스 유지.
  - 검증: [자동] `pnpm exec vitest run lib/deployment scripts/__tests__/preflight-entry.test.ts` green.
- [ ] T7 `lib/deployment/__tests__/self-hosted-gates.test.ts` ②-c — "provider마다 ID·SECRET이 required" → "auth.ts의 provider마다 `LOGIN_PROVIDER_ENV`에 등재되고 그 이름이 `optional`" + **로그인 넷이 `deploy/compose.yaml`에서 `${X:-}` 꼴이라는 정적 단언**(기존 `composeProblems`는 `${}` 문법 종류를 보지 않는다). `deploy/compose.yaml` 네 값 `:-` 기본값. `.env.example`·`deploy/.env.example` 주석. `scripts/__tests__/preflight-entry.test.ts` 픽스처 유지·한 공급자 케이스 추가. SELF-HOSTING §3 체크리스트(env 의미 변경·compose)를 지나고 그 결과를 커밋 본문에 한 줄 남긴다.
  - 검증: [자동] `pnpm exec vitest run lib/deployment` green(compose `:-` 단언 포함). [수동] SELF-HOSTING §3 체크리스트 항목별 통과.

## 3. 문서 — 커밋 C (문서별 커밋)

- [ ] T8 정본 — PRODUCT §4.1 셀프 호스팅 · ARCHITECTURE(계정 병합 절에 켜진 집합·`canUnlink`·숨김 보존·`MethodUnavailable`·`access.ts:48`, 인증 경계 표 `:2290`) · **DESIGN `:1167`·`:1173`·`:1983`**(켜진 공급자만·첫째 primary·행 = 켜진 공급자 + 전체 로그아웃 비활성 사유) · SELF-HOSTING §4 게이트 지도 ②-c **행 추가** · §7 다음 실습 항목. 문서별 `docs(<DOC>): …` 커밋.
  - 검증: [수동] design §8 표의 정본 행이 전부 반영(DESIGN 세 줄 포함). [자동] `pnpm sync:agents:check` green.
- [ ] T9 가이드 `self-hosting/` install·troubleshooting·README·operate — `/guide`로 en 원문 + ko·es 같은 커밋. install 외부 서비스 표에 "번역자에게 GitHub 계정이 없으면 Google을 켠다" 한 줄 포함.
  - 검증: [자동] `pnpm test` green(가이드 게이트). [수동] design §8 가이드 행 전부 반영(install `:18`·`:31`·`:49` 포함). [수동] `incomplete-pair`·`no-login-provider`가 troubleshooting 표 **en·ko·es 세 벌** 모두에 있다(사유 코드 ↔ 표 대조 테스트가 없다).
- [ ] T9a 가이드 스크린샷 — `pnpm guide:check`가 `account.webp`·`accept-invitation.webp`를 stale 후보로 내면 hosted 화면이 같으므로 **재촬영 없이** `guide/SHOOTING.md` 매핑의 SHA만 갱신한다.
  - 검증: [자동] `pnpm guide:check` 출력에 두 컷이 stale로 남지 않는다.

## 4. 실물 — `/push` 전후

- [ ] T10 로컬 단일 공급자 기동 — `.env.local`은 에이전트가 편집하지 않는다(사용자가 GitHub 쌍을 비운 셸 env로 `pnpm dev`, 또는 사용자가 직접 편집). Google 단독에서:
  - `/signin`·`/invite/<token>`·`/oauth/authorize`의 버튼 하나·primary, `/account` 행 하나·`1 of 1`, 마지막 수단 해제 거부
  - `/api/auth/signin/github` 직접 GET → 로그인 불성립(spec §4.3)
  - 기존 세션으로 `/account` [Connect] Google 실행(spec §4.10)
  - 꺼진 공급자 버튼을 누르면 무엇이 떴는지(지금 동작 — spec §2의 미실측 주장) 기록
  - 두 공급자로 되돌려 hosted 화면이 그대로인지 본다
  - 검증: [수동] `/runtime-test` 리포트에 화면별 결과. 미실행이면 "미실행"으로 남긴다.
- [ ] T11 self-hosted 실기동 — 이미지로 GitHub 단독·Google 단독·반쪽·0개 네 구성을 기동해 preflight 로그(`incomplete-pair`·`no-login-provider`)와 실제 OAuth 왕복을 본다. **릴리스 검증 배치(SELF-HOSTING §7)가 맡는다** — 이 기능 배치의 완료 조건이 아니다.
  - 검증: [수동] SELF-HOSTING §7 표에 날짜·digest·구성별 결과 행.

## 5. 정리

- [ ] 결론이 정본에 올라간 뒤 `docs/features/optional-login-providers/`를 지운다.
  - 검증: [자동] `test ! -d docs/features/optional-login-providers`.
