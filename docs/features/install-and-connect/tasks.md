# tasks — install-and-connect

순수 함수 → 스키마 → 껍데기 → UI. 각 태스크는 red 먼저, 고친 뒤 지키는 코드를 지워 red(뮤테이션 — 리포에 남는 단언으로 끝낸다).

## 커밋 1 — 순수 판정

- [ ] T1 `installWithStateUrl(appSlug, nonce)` — `lib/github-connect/installation-url.ts`에. slug 있음 → `…/installations/new?state=<nonce>` · 없음/빈 문자열 → `null` · nonce URL 인코딩(쿼리 키가 `state` 하나). 인라인 조립 두 곳(`new-project-modal.tsx` `installUrl()` · `settings/page.tsx`)을 `installationSettingsUrl`로 모은다.
  - 검증: `pnpm test lib/github-connect` · `rg -n "installations/new" app components lib --glob '!**/__tests__/**'` → `installation-url.ts`만
- [ ] T2 `planCallback` — 표: 서명 state ok + (없음·install·request·update·모르는 값) → link(keep·clear·set·keep·keep) · state 쿼리 없음 + install/update/request → land-only · state 쿼리 없음 + 없음/모르는 값 → reject(state-mismatch) · state 무효(mismatch·expired·wrong-user) → reject(사유, dest null) · 취소 → denied(state ok면 dest, 아니면 null) · code 없음/빈 문자열 → exchange-failed.
  - 검증: 갈래별 단언. land-only 대조군 "state 쿼리가 있으면 서명 검증을 지난다"
- [ ] T3 `planPending({ listResult, requestedAt, installations })` — 기록 없음 → pending false · 기록 뒤 생긴 설치 있음 → clearRequest + pending false · 기록 앞 설치만 → pending true(no-installations/no-repos/목록 세 결과 각각) · 장애 결과는 그대로 · 같은 시각(`createdAt == requestedAt`)은 승인 아님.
  - 검증: `pnpm test lib/github-connect`

## 커밋 2 — 스키마 (`/db`)

- [ ] T4 `Account.installRequestedAt DateTime?` 마이그레이션(`--create-only` 후 SQL 확인 → dev 적용). anon 권한 0 확인(`/db` 5단계).
  - 검증: `pnpm db:status` · `pnpm db:generate` · typecheck · **`pnpm test:projects:postgres` · `pnpm test:credentials:postgres`**(둘 다 `prisma/migrations` 전체를 적용한다 — `pnpm test` 밖이라 손으로)

## 커밋 3 — 껍데기

- [ ] T5 `startGithubConnectForUser(dest, back, via)` — `via=install`이면 `installWithStateUrl`로 redirect, 쿠키·서명 dest는 같음. 슬러그 없음 → `unavailable`, 쿠키 0. 모르는 `via` → `invalid input`, 쿠키 0.
  - 검증: `app/(edit)/__tests__/onboarding.test.ts` — install이면 redirect가 설치 URL이고 URL의 `state` = 쿠키 payload의 nonce · authorize 기존 단언 전부 유지
- [ ] T6 callback이 `planCallback`을 지난다 + 요청 기록 쓰기(`linkAccountLocked` 안, 성공일 때만). **기존 `app/api/__tests__/github-callback.test.ts`(30건+)를 확장한다** — 이 파일은 `harness.ts`가 아니라 `getPrisma`를 `{ account, $transaction }`로 직접 mock한다: tx 인자의 `account.create`/`update`에 `installRequestedAt`이 실리는지 본다. land-only는 `exchangeCode`·`account.*`·쿠키 소거 0회. `taken-by-other`면 기록 0. 기존 30여 건은 회귀 대상.
  - 검증: `pnpm test app/api` · `lib/login-link/__tests__/exclusive.test.ts` green(쓰기가 route에 남는다)
- [ ] T7 `listConnectableRepos` → `listUserInstallations`가 `{ id, createdAt }` · `planPending` · `clearRequest`면 `account.updateMany` 1회 · 기록 조회 실패 → `unavailable`. 결과에 `pending`.
  - 검증: `onboarding.test.ts` — 기록 있음·설치 0 → `no-installations` + pending · 기록 뒤 설치 생김 → 목록 + `updateMany` 1회 · 기록 없음 → pending false · 하네스 `account.updateMany`가 `installRequestedAt` 조건을 본다(하네스 `$transaction` 스냅샷은 `users`를 되돌리지 않는다 — 이 태스크는 트랜잭션 밖 쓰기라 무관)

## 커밋 4 — UI (사전·판정·화면을 한 커밋)

- [ ] T8 사전 — design "화면 문구" 표 그대로 + E info + Check again 알림 + `noLink` 재사용. 소비자 0이 된 옛 키 삭제. `connect["not-connected"]`가 온보딩에 닿으면 새 버튼 이름으로.
  - 검증: `lib/i18n/__tests__/no-korean-ui` · `brand-spelling` green · `rg -n "afterInstall|noInstallations|addRepos" app components lib messages` → 0
- [ ] T9 `Blocked` 재구성 + `ConnectGithubButton`(`via`·모양) + 블록 단위 pending 공유 + C·힌트 같은 탭 `<a buttonClass>` + D의 [Check again] + reauthorize 블록 분리 + `GITHUB_APP_SLUG` 없음 폴백.
  - 검증(DOM, `components/__tests__/new-project.test.tsx`):
    - A에 보조 링크 1 · B에 0 · D에 "Connect your repositories" 0, A/B엔 1(대조가 실제로 red를 내는지 뮤테이션)
    - C·힌트 링크 `target="_blank"` 0 · "Refresh this page" 전 갈래 0
    - A에서 주 버튼 pending 중 보조 링크 `aria-disabled`, 오류 Alert 1개
    - D [Check again] → `router.refresh` 1회 + `loading` + 승인 전 알림 문구
    - reauthorize → "Reauthorize GitHub App" + GitHub 아이콘 + via=authorize
    - 슬러그 없음: A는 Authorize + `noLink`, B·C는 버튼 0
    - E: pending이면 info 1, 아니면 0
    - 기존 단언 갱신: `:535` "Connect GitHub repositories" · `:718-750`의 install-requested 3건 → D·E 테스트로 교체
  - 검증(수동, gate 밖): 인터셉트 모달(`@modal/(.)new`)에서 [Check again]이 `RepoLoader`를 다시 도는지 — jsdom이 못 본다. 로컬 dev DB에 기록을 심어 `/bugshot-qa`로 merge 전에 D·E-info를 본다.
- [ ] T10 고아 삭제: setup 라우트·`setup.ts`·테스트·`INSTALL_REQUESTED`·`installRequested`·옛 info·`requested` 키·client-graph 줄·entry-points `RETURNS`의 setup.
  - 검증: `rg -n "install-requested|INSTALL_REQUESTED|setupLanding|api/github/setup" app lib components messages` → `app/__tests__/entry-points.test.ts`의 POSTMORTEM 인용 주석 1건만(역사 기록 — 지우지 않는다) · typecheck · test · build

## 커밋 5 — 문서 (문서별 커밋)

- [ ] T11
  - ARCHITECTURE §6.4(Setup URL 절 → install 복귀·state 없는 복귀 착지 규칙·요청 기록) · §6.1 matcher 절(`:1518` setup 언급 삭제)
  - OPERATIONS 콘솔 절: 옵션 **켬**, **Setup URL 비움**, 로컬 한계, L2.10에서 dev App에도 같은 옵션
  - DESIGN §6.7 ① 행(`:1210` 통째로) · §6.3 새 탭 규칙 예외 · §6.3의 "App 설치 링크 셋" 개수
  - DIRECTORY(`:83` setup 라우트 · `:319` setup 모듈 삭제, callback-plan·pending 추가)
  - CLAUDE.md 데이터 경로 표(setup 행 삭제) · `GITHUB_APP_SLUG` 서술 · `/bugshot-qa` 로컬 한계 → **`pnpm sync:agents` + `sync:agents:check`**(AGENTS 미러 — 빠지면 CI `verify` red)
  - `.env.example` `GITHUB_APP_SLUG` 주석
  - launch-readiness: L0.2(반전) · L2.4 · 결정 기록 표의 L2.4 행("켜져 있으면 끈다" → 켠다)
  - 검증: `pnpm sync:agents:check` · 문서별 커밋

## 배포

- [ ] T12 사전 조건 → 배포 → 프로덕션 실측.
  - 사전: `malmoi-test-org` 설치 0(현재 0) · `test-sinhyeok` 개인 설치 0 · `test-sinhyeok`의 malmoi 연결 해제(`/account` Disconnect)와 GitHub Authorized Apps revoke · 배포 전 남은 옛 요청은 기록 컬럼 이전이라 D를 못 띄운다 — 배포 뒤 새로 요청
  - 배포: `/push` → prod `db:deploy` → `/merge`(옵션은 이미 켜져 있다)
  - 실측 순서(상태가 서로를 오염시키지 않게):
    1. `test-sinhyeok` A → [Install GitHub App] → **org에 요청** → D · 모달 닫고 다시 열어도 D · 다른 브라우저에서도 D
    2. 오너가 org에서 승인 → 오너가 어디에 착지하는지 기록(state 없는 복귀 → `/projects/new` 기대) · `test-sinhyeok` [Check again] → 목록 · 기록 지워짐
    3. C: org 설치의 리포 선택을 비운 상태에서 ① → C → [Choose repositories] → Save → 같은 탭 ① → 목록
    4. A 신규 1클릭: 연결 해제 + 개인 설치(리포 있는 계정) → ① A → Install & Authorize → 목록
    5. A 보조 링크: 연결만 해제한 상태에서 "Connect your account" → 목록
  - 뒷정리: org 재설치로 `installationId`가 바뀐 org 리포의 prod 프로젝트는 [Reconnect](malmoi#52)

## 확인 (2026-09-18)

- 문구·아이콘: design "화면 문구" 표(사용자 확정, feature-review 반영 — A/B 제목 "Connect your repositories", 설명 한 문장).
- state 없는 설치 계열 복귀: 쓰기 없이 착지(feature-review).
- 대기 해제: 요청 시각 이후 생긴 설치가 보이면(feature-review).
- 기록 위치: `Account(github-app)`(feature-review).
- 두 번째 개발자: 보조 링크로 감수, 비목표에 기록(feature-review).
- 콘솔: 옵션 켜 둔 채 배포까지. Setup URL은 비운다(OPERATIONS).
