# Optional login providers — 태스크

상태: 미착수. 검증 표기: **[자동]** 명령으로 판정 · **[수동]** 사람이 실물로 판정.

**배치 경계**: 커밋 A·B·C·D는 **같은 `/push` 배치**로 나간다. A만 먼저 나가면 소비자 없는 시그니처가 남고, C(preflight 완화)가 B(화면·판정) 없이 나가면 반쪽 설치가 기동해 꺼진 버튼이 `Configuration` 오류로 떨어진다. 커밋마다 `pnpm gate` green — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30). `lib/credentials/__tests__/postgres.integration.ts`가 `pickLoginAccount`를 쓰므로 `pnpm gate`가 격리 PG 스위트를 붙이는지 출력에서 확인한다.

## 0. 착수 전

- [x] spec §6 Q1~Q4를 사용자가 닫는다 (2026-10-09 — 넷 모두 추천안).
  - 검증: [수동] spec §6 표가 "결정" 열이고 미결 0행.

## 1. 순수 판정 — 커밋 A (`/tdd interface` → `/implement`)

- [ ] T1 `lib/auth/login-providers.ts` — `LOGIN_PROVIDER_ENV`·`loginProviderStates`·`enabledFrom`·`enabledLoginProviders` (design §2.1). 테스트 먼저: 상태 표(각 공급자 enabled/absent/partial × 공백만 있는 값 = 빈 값), 순서 고정, `enabledLoginProviders`가 호출 시점의 env를 읽는다(모듈 import만으로 env를 읽지 않는다).
  - 검증: [자동] `pnpm exec vitest run lib/auth/__tests__/login-providers.test.ts` green.
- [ ] T2 `lib/login-link/policy.ts` — `pickLoginAccount`·`loginMethodRows`·`canUnlink`에 `enabled` 인자(기본값 없음), `signInButtons` 신설. `plan.ts` `planLinkOffer`에 `enabled`. 테스트 먼저(기존 `lib/login-link/__tests__/policy.test.ts`·plan 테스트 갱신):
  - 두 공급자 켜짐 = 지금 결과와 같다(회귀 고정)
  - `canUnlink([github, google], "google", [google])` → false · `canUnlink([google, github], "github", [google])` → false(꺼진 공급자)
  - `pickLoginAccount([github, google], [google])` → google · `([github], [google])` → null
  - `loginMethodRows([github], [google])` → `[{ google, connected: false }]`
  - `signInButtons([google])` → `[{ google, primary }]` · `([github, google])` → github primary, google default
  - `planLinkOffer` — 기존 사용자의 연결이 꺼진 공급자뿐이면 `sign-in`
  - 검증: [자동] `pnpm exec vitest run lib/login-link` green. `components/__tests__/client-graph.test.ts` green(policy가 새 모듈을 import하지 않는다).
- [ ] T3 `lib/deployment/preflight.ts` — 네 값 `optional` + 쌍 규칙 + 사유 둘 (design §2.2). 테스트 먼저: `preflight.test.ts`에 9칸 표 전부, 값이 결과에 실리지 않는다, 기존 케이스 유지.
  - 검증: [자동] `pnpm exec vitest run lib/deployment scripts/__tests__/preflight-entry.test.ts` green.

## 2. 껍데기·화면 — 커밋 B

- [ ] T4 `auth.ts` — config 함수 안에서 `enabledLoginProviders()`로 `providers`를 거르고, `loadLinkOffer`에 `enabled`를 넘긴다. `lib/login-link/store.ts` `loadLinkOffer`·`lib/login-link/view.ts` `loadChallengeView`·`lib/session-revocation/store.ts` `beginRevocation`이 `enabled`를 받는다(하드코딩 `["github","google"]` 제거).
  - 검증: [자동] `lib/session-revocation/__tests__/store.test.ts`·login-link store/view 테스트에 "꺼진 공급자만 연결 → invalid/null/sign-in" 케이스 green. `lib/auth/__tests__/provider-config.test.ts`에 "providers가 고정 배열 리터럴이 아니고 config 함수 안에서 거른다" 텍스트 단언 추가.
- [ ] T5 로그인 진입점 셋 — `app/signin/page.tsx`·`app/invite/[token]/page.tsx`·`app/oauth/authorize/page.tsx`가 `signInButtons(enabledLoginProviders())`로 그린다. `ProviderButton` 이름 유지, `variant`·`autoFocus`는 `signInButtons` 결과에서.
  - 검증: [자동] `normal-login.test.tsx` — env 픽스처를 두 공급자로 고정한 기존 `ENTRIES` green + Google 단독 픽스처에서 세 진입점의 버튼 수 1·`google` primary 케이스 추가. oauth `autoFocus`가 첫 버튼에 붙는 단언.
- [ ] T6 `/account` — `page.tsx`가 `loginMethodRows(methods, enabled)`·`pickLoginAccount(methods, enabled)`, `login-methods.tsx`가 `canUnlink(connected, provider, rows.map(...))`. `actions.ts`: `unlinkLoginMethod`(꺼진 공급자 → `unavailable`, 판정은 켜진 연결 수단으로), `startLoginMethodConnect`(꺼진 공급자 → `?connect=failed`, OAuth·쿠키·challenge 0), `startSessionRevocation`(한 번 읽은 `enabled`를 pick과 `beginRevocation` 둘에). 행 고정 수를 단언하던 주석("행이 언제나 둘")을 고친다.
  - 검증: [자동] `components/__tests__/login-methods.test.ts`·`app/(edit)/account/__tests__/structure.test.tsx` green + Action 테스트: 꺼진 GitHub 행 + 켜진 Google 하나에서 Google 해제가 `last-method`, 꺼진 GitHub 연결 시작이 `signIn` 0회·`?connect=failed`. 
  - 검증: [자동] `pnpm test:credentials:postgres` green(`pnpm gate`가 붙인다).

## 3. 배치·게이트 — 커밋 C

- [ ] T7 `lib/deployment/__tests__/self-hosted-gates.test.ts` ②-c — "provider마다 ID·SECRET이 required" → "auth.ts의 provider마다 `LOGIN_PROVIDER_ENV`에 등재되고 그 이름이 `optional`". `deploy/compose.yaml` 네 값 `:-` 기본값. `.env.example`·`deploy/.env.example` 주석. `scripts/__tests__/preflight-entry.test.ts` 픽스처 유지·한 공급자 케이스 추가.
  - 검증: [자동] `pnpm exec vitest run lib/deployment` green. `docker compose -f deploy/compose.yaml config -q`가 네 값 없는 `.env`에서 경고 없이 통과.

## 4. 문서 — 커밋 D (문서별 커밋)

- [ ] T8 정본 — PRODUCT §4.1 셀프 호스팅 · ARCHITECTURE(계정 병합 절에 켜진 집합·`canUnlink`·숨김 보존) · SELF-HOSTING §4 게이트 지도 행 · §7 다음 실습 항목. 문서별 `docs(<DOC>): …` 커밋.
  - 검증: [수동] design §8 표의 정본 행이 전부 반영. [자동] `pnpm sync:agents:check` green.
- [ ] T9 가이드 `self-hosting/` install·troubleshooting·README·operate — `/guide`로 en 원문 + ko·es 같은 커밋.
  - 검증: [자동] `pnpm test` green(가이드 게이트). [수동] design §8 가이드 행 전부 반영, preflight 사유 코드 두 개가 troubleshooting 표에 있다.

## 5. 실물 — `/push` 전후

- [ ] T10 로컬 단일 공급자 기동 — `.env.local`은 에이전트가 편집하지 않는다(사용자가 GitHub 쌍을 비운 셸 env로 `pnpm dev`, 또는 사용자가 직접 편집). Google 단독에서 `/signin`·`/invite/<token>`·`/oauth/authorize`의 버튼 하나·primary, `/account` 행 하나·`x of 1`, 마지막 수단 해제 거부를 본다. 두 공급자로 되돌려 hosted 화면이 그대로인지 본다.
  - 검증: [수동] `/runtime-test` 리포트에 화면별 결과. 미실행이면 "미실행"으로 남긴다.
- [ ] T11 self-hosted 실기동 — 이미지로 GitHub 단독·Google 단독·반쪽·0개 네 구성을 기동해 preflight 로그(`incomplete-pair`·`no-login-provider`)와 실제 OAuth 왕복을 본다. **릴리스 검증 배치(SELF-HOSTING §7)가 맡는다** — 이 기능 배치의 완료 조건이 아니다.
  - 검증: [수동] SELF-HOSTING §7 표에 날짜·digest·구성별 결과 행.

## 6. 정리

- [ ] 결론이 정본에 올라간 뒤 `docs/features/optional-login-providers/`를 지운다.
  - 검증: [자동] `test ! -d docs/features/optional-login-providers`.
