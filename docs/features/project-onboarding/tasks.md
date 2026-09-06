# project-onboarding — 태스크

규칙은 `docs/TASKS.md`와 같다: **검증 조건이 실제로 통과했을 때만** 체크한다. `——`가 커밋 경계다.

순서의 근거: **순수 판정 → 껍데기 → UI**, 그리고 **push 토큰 전환을 온보딩 UI보다 먼저** 끝낸다 —
`/api/push`가 프로젝트별 토큰을 받기 전에는 새로 만든 프로젝트에 CI를 붙일 수 없어서 온보딩의
마지막 화면(워크플로 + 토큰)이 거짓말이 된다.

---

## T1. 순수 판정층 — 온보딩

- [ ] `/tdd interface`로 테스트 먼저 박는다 (아래 함수 전부)
- [ ] `lib/onboarding/slug.ts` — `normalizeProjectSlug` · `planSlug`
  - ⚠️ 형식 규칙은 `lib/pull/trigger.ts`의 `REF_SAFE_SLUG`를 **export해 공유**한다. 복사하면
    갈리고, 갈리면 온보딩이 만든 slug가 pull에서 `fail()`로 죽는다 (design §5)
  - 검증: `..`·후행 `.`·빈 문자열·`/` 포함·대문자·리포명 그대로가 각각 기대한 판정을 낸다
- [ ] `lib/onboarding/detect.ts` — `probeTargets` · `makeProbe` · `formatLabel` · `summarizeCandidates`
  - 검증: 후보 상위 5개 × 파일 3개 상한이 지켜진다 / 키 수가 read 결과에서 온다 / read 실패가
    후보를 떨어뜨리지 않는다 (design §3.2)
- [ ] `lib/onboarding/confirm.ts` — `planConfirmedFormat`
  - 검증: 후보에 없는 `pathTemplate`을 거부한다 / 후보에 없는 `baseLocale`을 거부한다 /
    수동 지정은 `detectFormatWith` 매치가 있을 때만 통과한다 (design §3.4·§3.5)
- [ ] `lib/onboarding/create-plan.ts` — `planProjectCreate`
  - 검증: `installation-forbidden`·`repo-forbidden`·`repo-not-installed`가 그대로 흘러나온다 /
    프로젝트 3개면 `limit-reached` / slug 중복이면 `slug-taken`
- [ ] `lib/onboarding/readiness.ts` — `planProjectReadiness`
  - 검증: `lastCommitSha`가 있어야만 `ready`다 — **설정만 저장된 프로젝트는 `ready`가 아니다**
    (SAAS 불변식 8)
- [ ] `lib/onboarding/message.ts` — `OnboardError` union · `isOnboardError` · `onboardErrorMessage`
  - 검증: `never` 검사로 갈래 누락이 컴파일 에러다 (`pullMessage`·`accessErrorMessage`와 같은 형)
- [ ] `lib/onboarding/workflow.ts` — `renderWorkflowYaml`
  - 검증: slug가 박힌다 / 수동 지정이면 `adapter:`·`base-locale:`이 붙고 아니면 안 붙는다 /
    출력이 `docs/ACTIONS.md`의 예시와 같은 모양이다

검증(커밋 전): `pnpm test` green · `pnpm typecheck` green

—— `test: onboarding decision functions` + `feat(onboarding): pure planners`

## T2. push 토큰 — 스키마 + 순수 판정

- [ ] `prisma/schema.prisma` — `Project.pushTokenHash String? @unique` (주석에 fail-closed 근거)
- [ ] `pnpm db:migrate` → `_add_project_push_token` (**additive**)
- [ ] `lib/push/token.ts` — `generatePushToken()` · `hashPushToken(raw)`
  - ⚠️ 해시 규칙을 `lib/auth/invitation.ts`의 `hashInviteToken`과 **같은 sha256 hex**로 둔다.
    두 곳이 갈리면 "해시 저장 규칙이 한 곳에 모인다"(SAAS §7.8)가 거짓이 된다
  - 검증: 같은 입력 → 같은 해시 / 원문이 어디에도 저장되지 않는다(반환만 한다)
- [ ] `app/(edit)/__tests__/harness.ts`에 `Project.slug`·`pushTokenHash`의 unique 제약을 흉내낸다
  - ⚠️ 없으면 slug 충돌·토큰 충돌 경로를 **재현할 수조차 없다** (POSTMORTEM 2026-09-05)
  - 검증: 중복 slug로 create하면 하네스가 던진다

검증: `pnpm db:status`가 적용을 보인다 · `pnpm test` green

—— `feat(db): add Project.pushTokenHash` (스키마 + 마이그레이션 + 토큰 순수 함수)

## T3. `/api/push` 인증 전환

- [ ] `app/api/push/route.ts` — bearer → `hashPushToken` → `Project` 조회 → slug 대조 → 역행 검사
  - 401(토큰 무효) / 409(오배송) / 409(역행) / 404 제거 — 프로젝트 존재를 노출하지 않는다
  - `requireEnv("ACTIVE_PROJECT_SLUG")` 제거
  - ⚠️ 인증·JSON·스키마 실패는 **try 밖에 그대로 둔다** (감싸면 400이 500으로 접힌다 —
    `route-diagnostics.test.ts`가 그것을 센다)
- [ ] `app/api/__tests__/route-diagnostics.test.ts` 갱신 — `ACTIVE_PROJECT_SLUG` 500 케이스를
      **토큰 미발급(`pushTokenHash === null`) 401**로 바꾼다
- [ ] `lib/push/guard.ts` 주석 갱신 — 대조 대상이 "서버 env"에서 "토큰의 프로젝트"로 바뀐 이유

검증: `pnpm test` green · 새 테스트 4건(무헤더 401 / 잘못된 토큰 401 / 미발급 프로젝트 401 /
오배송 409)이 각자 다른 응답을 낸다

—— `feat(push): per-project token auth replaces the shared secret`

## T4. `/api/pull` 전 프로젝트 순회

- [ ] `lib/pull/targets.ts` — `selectPullTargets(projects)` (순수: `installationId != null AND
      lastCommitSha != null`, `slug` 오름차순)
- [ ] `app/api/pull/route.ts` — 순회 + **프로젝트별 try/catch** + 결과 배열. `requireEnv("ACTIVE_PROJECT_SLUG")` 제거
  - ⚠️ 실패 전문은 응답에 싣지 않는다 — `ref`만 내고 서버 로그로 (`classifyFailure`, ARCHITECTURE §6.0)
- [ ] 테스트: 한 프로젝트가 던져도 나머지가 돈다 / 준비 안 된 프로젝트는 대상에서 빠진다 /
      순서가 결정적이다

검증: `pnpm test` green

—— `feat(pull): cron iterates every ready project`

## T5. GitHub 읽기 껍데기

- [ ] `lib/github.ts` — `ProbeResult.ok`에 `defaultBranch` 추가 (`GET /repos` 응답에 이미 있다)
  - 검증: `planConnectionHealth` 테스트가 그대로 green (그 함수는 이 필드를 안 본다)
- [ ] `lib/onboarding/snapshot.ts` — `readRepoSnapshot(owner, repo, installationId, baseBranch)`
  - `{ status: "ok", headSha, headCommittedAt, paths, blobText } | { status: "truncated" } |
    { status: "base-branch-missing" } | { status: "unavailable" }`
  - ⚠️ **트리 잘림을 던지지 않고 값으로 준다** — `lib/pull/client.ts`의 계약은 손대지 않는다
    (design §3.10)
  - ⚠️ **base 브랜치 ref가 `null`이면 "브랜치 없음"으로 읽지 않는다** — 권한 없음일 수도 있다
    (`client.ts` 주석, POSTMORTEM 2026-09-03)
  - ⚠️ `createApp()` 계열의 환경변수 누락은 **던진다** (값으로 접으면 설정 오류가 영원히
    "잠시 뒤 다시"가 된다 — `probeRepo`와 같은 판단)
- [ ] `lib/onboarding/ingest.ts` — 스냅샷 → `selectLocaleFiles` → `adapter.read` →
      `buildPushPayload`(`scanRefs: []`) → `applyPush`
  - ⚠️ 세 함수를 **우회하지 않는다** (design §4 · POSTMORTEM 2026-08-31·2026-09-02)
  - ⚠️ `commitAt`은 `headCommittedAt`이다 — `new Date()`면 CI 첫 push가 409다
- [ ] `scripts/smoke-github.ts`에 스냅샷 읽기 한 줄 추가 (실 API라 `pnpm test` 밖)

검증: `pnpm typecheck` green · `pnpm smoke:github <slug>`가 트리·blob을 읽어 후보를 찍는다

—— `feat(onboarding): read the repo snapshot with the installation token`

## T6. Server Action — 연결·탐지·생성

- [ ] `lib/github-connect/state.ts` — 서명 payload에 착지 지점(`{kind:"settings",slug} | {kind:"new"}`)
  - ⚠️ **쿼리로 빼지 않는다** — 서명 안에 있어야 open redirect 판정이 필요 없다 (design §3.6)
  - 검증: 옛 모양의 state가 `state-mismatch`로 거부된다(배포 직후 10분의 창을 의도한다)
- [ ] `app/api/github/callback/route.ts` — 착지 지점에 따라 `/projects/new` 또는 설정 화면으로
- [ ] `app/(edit)/projects/actions.ts`
  - `startGithubConnectForUser()` — 인가는 `requireUser`뿐 (design §3.6)
  - `listConnectableRepos()` — 사용자 토큰으로 설치·리포 목록 (**전 페이지**, `paginate`)
  - `detectRepoFormats({ owner, repo })` — 3중 검증 → 스냅샷 → 2패스 탐지 → 후보 요약
  - `createProject({ owner, repo, adapter, pathTemplate, baseLocale, slug, name })` —
    재탐지 대조 → `planProjectCreate` → `Project` + `ProjectMember(OWNER)` + `pushTokenHash`를
    **한 트랜잭션** → 첫 적재 → 결과
  - `retryFirstIngest({ slug })` — `awaiting_first_sync` 복구용
  - `rotatePushToken({ slug })` — 설정 화면용 (`project:settings`)
  - ⚠️ 모든 export가 스스로 인가를 부른다 (`entry-points.test.ts`가 export 단위로 센다)
  - ⚠️ **인가가 GitHub 조회보다 먼저다** (거부될 요청이 남의 레이트 리밋을 태우지 않는다)
- [ ] `app/(edit)/__tests__/onboarding.test.ts` — 비로그인 거부 / 3중 검증 거부 3갈래 /
      제한 초과 / slug 충돌 / 클라이언트가 보낸 `pathTemplate`이 후보에 없으면 거부 /
      첫 적재 실패 시 `awaiting_first_sync`로 남고 번역 화면에 못 들어간다

검증: `pnpm test` green · `entry-points.test.ts` green

—— `feat(onboarding): server actions for connect, detect and create`

## T7. UI

- [ ] `app/(edit)/projects/new/page.tsx` — 최상단 `requireUser`. 조건부 렌더 금지
- [ ] `components/onboarding/*` — 리포 선택 · 후보 목록(형식·경로·언어·**키 수**) · 수동 지정 ·
      확정 폼 · 결과 화면(토큰 원문 + YAML + "지금 편집 가능")
  - ⚠️ 어댑터 내부 이름을 화면에 쓰지 않는다 (design §3.3)
  - ⚠️ 포커스 링 셋을 단다 (`components/__tests__/focus-ring`가 소스로 센다 — 눈으로 두 번 놓쳤다)
  - ⚠️ raw 색을 늘리면 `docs/DESIGN.md` §6.2에 등재한다
- [ ] `app/(edit)/projects/page.tsx` — "새 프로젝트" 진입 + 상태 배지(`ready`가 아닌 프로젝트 표시)
- [ ] `app/(edit)/projects/[slug]/translations/page.tsx` — `ready`가 아니면 온보딩 결과 화면으로
- [ ] `app/(edit)/projects/[slug]/settings/page.tsx` — push 토큰 재발급 섹션
- [ ] `middleware.ts` — `matcher`는 이미 `/projects/:path*`라 `new`가 덮인다. **확인만 하고 넘어가지
      말고 테스트로 고정한다**
- [ ] `?e=` 사유를 **읽는 쪽을 같은 커밋에** 만든다 (POSTMORTEM 2026-09-06)

검증: `pnpm build` green (RSC 경계는 `tsc`가 못 본다) · `pnpm test` green

—— `feat(onboarding): the /projects/new flow`

## T8. 전환·실물 검증·문서

**T3가 배포되는 순간 기존 프로젝트 넷의 CI가 401이 된다** — 이 태스크가 같은 세션에 끝나야 한다.

- [ ] 프로젝트 넷(`order-check` 등)에 토큰 발급 → **대상 리포 Actions secret `PUSH_TOKEN` 교체**
- [ ] 실물 왕복 — 폐기용 리포 하나를 **처음부터** 온보딩으로 붙인다
  - 시나리오: 계정 미연결 상태에서 시작 / 후보 둘 이상인 리포 / `ts-dict` 리포(수동 지정) /
    남의 리포 owner/repo 직접 전송 → 거부 / 첫 적재 실패 후 "다시 시도" / 워크플로 붙인 뒤 CI push
    200 / 야간 pull 순회
  - ⚠️ **preview가 아니라 로컬·프로덕션이다** — preview는 Vercel SSO 뒤라 자동화가 302를 받는다
- [ ] `/l10n-roundtrip` 재검증 (push 인증 경로가 바뀌었다)
- [ ] 문서 (각자 별도 커밋)
  - `docs/SAAS.md` — §8 5단계 체크 · §10의 "Workflows 권한" 결정 반영 · §5.7 미종결 둘 종결
  - `CLAUDE.md`·`AGENTS.md` — 테넌시 행의 `ACTIVE_PROJECT_SLUG` 경고 제거 · 디렉터리 구조에
    `lib/onboarding/`·`/projects/new` 추가 · 명령어 표의 `push:local`·`smoke:github` 인자 필수화
  - `docs/ACTIONS.md` — `project` input 설명(409의 기준) · "배포 하나가 프로젝트 하나만 받는다"
    경고 제거 · 404 진단 줄 제거
  - `docs/ARCHITECTURE.md` — §5.5.5(오배송 판정 근거) · 첫 적재 경로
  - `docs/TASKS.md` — 전역 미결의 `ACTIVE_PROJECT_SLUG` 항목 해소
  - `.env.example` — `ACTIVE_PROJECT_SLUG` 블록 제거
  - `.claude/commands/l10n-roundtrip.md` + `.agents/skills/` 미러 — `ACTIVE_PROJECT_SLUG` 절차 제거
    (`pnpm sync:agents`)
  - `docs/features/README.md` — 표에 한 줄
- [ ] Vercel 세 스코프에서 `ACTIVE_PROJECT_SLUG` 삭제 (코드가 안 읽는 것을 확인한 뒤)

검증: `grep -rn ACTIVE_PROJECT_SLUG` 0건(POSTMORTEM 제외 — append-only) ·
대상 리포 CI 4개가 전부 green · 야간 pull 응답에 프로젝트가 여럿 나온다

—— `docs(...): ...` (문서별)
