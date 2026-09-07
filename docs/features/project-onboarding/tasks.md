# project-onboarding — 태스크

규칙은 `docs/TASKS.md`와 같다: **검증 조건이 실제로 통과했을 때만** 체크한다. `——`가 커밋 경계다.
`[manual]`은 `pnpm dev`로 눈으로 보는 검증이다 — 이 리포엔 e2e가 없다.

순서의 근거: **순수 판정 → 껍데기 → UI**, 그리고 **push 토큰 전환을 온보딩 UI보다 먼저** 끝낸다 —
`/api/push`가 프로젝트별 토큰을 받기 전에는 새로 만든 프로젝트에 CI를 붙일 수 없어서 온보딩의
마지막 화면(워크플로 + 토큰)이 거짓말이 된다.

⚠️ **T3 이후 첫 `/merge`는 T7·T8 준비가 끝난 뒤 한 번이다.** T3가 프로덕션에 가는 순간 기존 프로젝트
넷의 CI가 401인데 토큰을 발급할 UI는 T7(설정 화면)이다 — 그 사이에 머지하면 발급 수단이 SQL뿐이다.
`/push`(dev·preview)는 T마다 해도 된다 — `action.yml`의 `api-url` 기본값이 프로덕션이라 CI가 preview를
치지 않는다.

> 2026-09-07 `/feature-review` 반영 — QA가 잡은 사실 오류(T2 하네스·T4 pull 케이스·T5 `ProbeResult` 위치·
> 스크립트 인자 필수화 누락·T8 문서 목록)와 design 🔴 둘(§3.1·§3.4)의 파급을 넣었다.

---

## T1. 순수 판정층 — 온보딩

- [x] `/tdd interface`로 테스트 먼저 박는다 (아래 함수 전부)
- [x] `lib/pull/trigger.ts` — `REF_SAFE_SLUG` **export** (판정 불변, 공유만)
- [x] `lib/onboarding/slug.ts` — `normalizeProjectSlug` · `planSlug`
  - ⚠️ 형식 규칙은 `REF_SAFE_SLUG`를 import한다. 복사하면 갈리고, 갈리면 온보딩이 만든 slug가
    pull에서 `fail()`로 죽는다 (design §5)
  - 검증: `..`·후행 `.`·빈 문자열·`/` 포함·대문자·리포명 그대로·**예약어 `new`** 가 각각 기대한 판정을 낸다
- [x] `lib/adapters/code-dict.ts` — `detectCandidates` 앞부분을 `codeDictCandidatePaths(paths)`로 분리·export
  - ⚠️ **판정 불변** — `detectCandidates`가 그 함수를 그대로 부른다. `lib/adapters/**` 변경이지만
    재측정 트리거가 아니고, 커밋 메시지에 그 이유를 적는다 (design §3.1)
  - 검증: `detect-candidates.test.ts`·`key-order-golden` 그대로 green / 새 테스트: 분리한 함수가
    `detectCandidates(paths, probe)`의 후보 dir 집합의 상위집합을 낸다
- [x] `lib/onboarding/detect.ts` — `probeTargets` · `makeProbe` · `formatLabel` · `summarizeCandidates` · `ingestTargets`
  - 검증: 내려받을 경로가 **`sampleOrder(locales)`와 같은 파일**이다(다른 3개를 받으면 후보가 미검증
    탈락 — design §3.1) / JSON류 상위 5 × 3 + code-dict 상위 2 × 3 = 21 상한 / 키 수가 read 결과에서
    온다 / read 실패가 후보를 떨어뜨리지 않고 `key-count-failed`다 / 기준 언어 기본값이
    `pickBaseLocale`과 같다 / `ingestTargets`가 per-locale은 `{locale}` 치환·multi-locale은
    `matchGlobPaths`로 로케일 파일 **전부**를 낸다
- [x] `lib/onboarding/confirm.ts` — `templatePaths` · `planConfirmedFormat`
  - 검증: 템플릿이 가리키는 파일이 0개면 `manual-no-match` / `detectFormatWith` 반환이 없으면 거부 /
    반환된 `pathTemplate`이 입력과 다르면 거부 / `baseLocale`이 **반환된** `locales`에 없으면 거부 /
    **통과 시 반환값이 `detectFormatWith` 결과 그 자체다**(클라이언트 입력이 아니다 — POSTMORTEM 2026-09-05) /
    `ts-dict` 인라인 픽스처(디렉터리 `.ts` 4개)로 수동 지정이 통과한다 (design §3.4·§3.5)
- [x] `lib/onboarding/create-plan.ts` — `planProjectCreate`
  - 검증: `installation-forbidden`·`repo-forbidden`·`repo-not-installed`가 그대로 흘러나온다 /
    **`unavailable`은 `unavailable`로 그대로** (거부 갈래로 접지 않는다 — POSTMORTEM 2026-09-03) /
    OWNER 3개면 `limit-reached`(EDITOR 멤버십은 세지 않는다) / slug 중복이면 `slug-taken`
- [x] `lib/onboarding/readiness.ts` — `planProjectReadiness`
  - 검증: `lastCommitSha`가 있어야만 `ready`다 — **설정만 저장된 프로젝트는 `ready`가 아니다**
    (SAAS 불변식 8) / `installationId` null이면 `setup`
- [x] `lib/onboarding/message.ts` — `OnboardError` union(design §3.12 목록) · `isOnboardError` ·
      `onboardErrorMessage` · `ingestHeadline`
  - 검증: `never` 검사로 갈래 누락이 컴파일 에러다 (`pullMessage`·`accessErrorMessage`와 같은 형) /
    `ingestHeadline(n, 0)`은 성공 문구, `ingestHeadline(n, m>0)`은 "읽지 못했어요"가 들어간다 (불변식 9)
- [x] `lib/onboarding/workflow.ts` — `renderWorkflowYaml`
  - 검증: slug가 박힌다 / 수동 지정이면 `adapter:`·`base-locale:`이 붙고 아니면 안 붙는다 /
    `wrapper`는 없다 / 출력이 `docs/ACTIONS.md`의 예시와 같은 모양이다

검증(커밋 전): `pnpm test` green · `pnpm typecheck` green
✅ 2026-09-07 — `3caeb2e`(test) → `17a84be`(refactor(adapters)) → `77c8ddb`(feat) → `c473b60`(refactor: code-review 🟡2 반영). test 1591 green(신규 99+2) · typecheck · build green. 코드 리뷰가 더한 것: `isRefSafeSlug`(trigger.ts)가 `syncBranchFor`·`planSlug`의 **단일 판정**이 됐고 `.lock` 접미를 막는다 — 정규식만 공유하고 조건을 복사했을 때 양쪽에서 빠져 있던 구멍이다. `renderWorkflowYaml`은 `baseBranch`를 받는다(design §5·§7 갱신 — `main` 고정이면 base가 `develop`인 리포에서 CI가 안 돈다). `codeDictCandidatePaths`는 `{ pathTemplate, locales }`를 낸다(design §3.1·§5 갱신).

—— `test: onboarding decision functions` + `feat(onboarding): pure planners` + `refactor(adapters): export code-dict path grouping`

## T2. push 토큰 — 스키마 + 순수 판정 + 하네스

- [x] `prisma/schema.prisma` — `Project.pushTokenHash String? @unique` (주석에 fail-closed 근거)
- [x] `/db` — `pnpm db:migrate --create-only` → SQL 확인 → 적용. `_add_project_push_token` (**additive** —
      nullable + unique, Postgres는 NULL 여럿을 허용하므로 기존 5행에 무해)
- [x] `lib/push/token.ts` — `generatePushToken()` · `hashPushToken(raw)`
  - ⚠️ 해시 규칙을 `lib/auth/invitation.ts`의 `hashInviteToken`과 **같은 sha256 hex**로 둔다.
    두 곳이 갈리면 "해시 저장 규칙이 한 곳에 모인다"(SAAS §7.8)가 거짓이 된다
  - 검증: 같은 입력 → 같은 해시 / 원문이 어디에도 저장되지 않는다(반환만 한다) / 32바이트 난수
- [x] `app/(edit)/__tests__/harness.ts` — **`project`에 지금 `findUnique(slug|id)`·`update`만 있다.** 새로 만든다:
  - `project.create` — `slug`·`pushTokenHash` 중복에 P2002 / `findUnique`에 `where.pushTokenHash` 분기 /
    `project.findMany`(T4 순회·목록용) / `projectMember.count`에 `userId`·`role` 조건 /
    `lastCommitAt`·`pushTokenHash` 컬럼 / `$transaction` 스냅샷에 반영
  - ⚠️ 없으면 slug 충돌·토큰 조회 경로를 **재현할 수조차 없다** (POSTMORTEM 2026-09-05). 배열형
    `$transaction`은 넣지 않는다 — `applyPush`는 T6이 mock한다
  - 검증: 중복 slug로 `create`하면 던진다 / `findUnique({ where: { pushTokenHash } })`가 행을 돌려준다 /
    기존 테스트 전부 green

검증: `pnpm db:status`가 적용을 보인다 · `pnpm test` green
✅ 2026-09-07 — `9d7634d`(test) → `c35e940`(feat(push): token.ts + 하네스) → `480ea1b`(feat(db): 스키마 + 마이그레이션 `20260907011650_add_project_push_token`, dev 적용·`db:status` 11개 up to date). test 1612 green · typecheck · build green. ⚠️ `migrate dev --create-only`가 additive인데도 비대화형을 거부해 `migrate diff` 우회 경로로 만들었다 — 그 레시피의 "적용은 `db:deploy`"가 prod를 겨누는 문장이어서 `/db` 4c를 고쳤다(`d18307b`). 하네스 검증 파일은 `app/(edit)/__tests__/harness.test.ts`(14건 — code-review 🟡1 반영 `2554df2`: create가 id를 채우고, null 해시 조회·미지원 where 연산자는 던진다). **prod 미적용** — `/merge` 1단계.

—— `feat(db): add Project.pushTokenHash` (스키마 + 마이그레이션 + 토큰 순수 함수 + 하네스)

## T3. `/api/push` 인증 전환 + 스크립트 인자 필수화

- [ ] `app/api/push/route.ts` — bearer → `hashPushToken` → `Project.findUnique({pushTokenHash})` → slug 대조 → 역행 검사
  - 401(토큰 무효·미발급) / 409(오배송) / 409(역행) / 404 제거 — 프로젝트 존재를 노출하지 않는다
  - `requireEnv("ACTIVE_PROJECT_SLUG")`·`PUSH_TOKEN` 읽기 제거 (`checkBearer`는 `/api/pull`의 `CRON_SECRET`용으로 남는다)
  - ⚠️ 인증·JSON·스키마 실패는 **try 밖에 그대로 둔다** (감싸면 400이 500으로 접힌다 —
    `route-diagnostics.test.ts`가 그것을 센다)
- [ ] `app/api/__tests__/route-diagnostics.test.ts` — push 쪽: `ACTIVE_PROJECT_SLUG` 500 케이스(`:107`)를
      **토큰 미발급 401**로. mock prisma에 `findUnique({pushTokenHash})` 분기
- [ ] `lib/push/guard.ts` 주석 갱신 — 대조 대상이 "서버 env"에서 "토큰의 프로젝트"로 바뀐 이유. `lib/push/plan.ts:63` 주석도
- [ ] `scripts/push-local.ts:68` · `scripts/smoke-github.ts:36` — `?? requireEnv("ACTIVE_PROJECT_SLUG")` 폴백 제거,
      **인자 필수**(없으면 usage + exit 2). `push-local`의 `PUSH_TOKEN`은 "그 프로젝트의 토큰 원문"이 된다
  - 검증: `pnpm push:local <dir>`(--project 없이) exit 2 · `lib/cli/__tests__` 인자 파싱 테스트 갱신

검증: `pnpm test` green · 새 테스트 4건(무헤더 401 / 잘못된 토큰 401 / 미발급 프로젝트 401 /
오배송 409)이 각자 다른 응답을 낸다 · `grep -n ACTIVE_PROJECT_SLUG app/ scripts/ lib/` 0건

—— `feat(push): per-project token auth replaces the shared secret`

## T4. `/api/pull` 전 프로젝트 순회

- [ ] `lib/pull/targets.ts` — `selectPullTargets(projects)` (순수: `installationId != null AND
      lastCommitSha != null`, `slug` 오름차순)
- [ ] `app/api/pull/route.ts` — 순회 + **프로젝트별 try/catch** + 결과 **배열**. `requireEnv("ACTIVE_PROJECT_SLUG")` 제거.
      `:16` 주석의 옛 matcher(`/keys/:path*`)도 고친다
  - ⚠️ 실패 전문은 응답에 싣지 않는다 — `ref`만 내고 서버 로그로 (`classifyFailure`, ARCHITECTURE §6.0)
- [ ] `app/api/__tests__/route-diagnostics.test.ts` — **pull 케이스 4개 전부 재작성** (`:65-98`): 500 케이스 →
      대상 0개 `[]` 200 / `triggerPull` throw → 200 + 그 항목만 `{status:"failed", ref}`, 전문은 `console.error`에만 /
      AppError → 같은 형 / 정상 경로 → 배열. mock prisma에 `project.findMany` (없으면 라우트가 TypeError)
- [ ] `lib/pull/__tests__/targets.test.ts` — 준비 안 된 프로젝트(`installationId` null·`lastCommitSha` null·
      `skillflo-web` 모양)는 대상에서 빠진다 / 순서가 결정적이다 / `triggerPull`이 실패 **값**을 돌려주는
      경우와 throw 둘 다 배열에 남는다

검증: `pnpm test` green

—— `feat(pull): cron iterates every ready project`

## T5. GitHub 읽기 — `lib/github.ts`가 든다

- [ ] `lib/github-connect/health.ts:16` — `ProbeResult.ok`에 `defaultBranch` (`GET /repos` 응답에 이미 있다)
  - ⚠️ 필수 필드라 **리터럴 14곳**이 typecheck red다: `lib/github-connect/__tests__/connect-plan.test.ts:24,99,125` ·
    `health.test.ts:18,63,90,99,108,117,132` · `app/(edit)/__tests__/github-connect.test.ts:62,262,272,292`
  - 검증: `pnpm typecheck` green(14곳 갱신 포함) · `health.test.ts` **판정** 불변
- [ ] `lib/github.ts` — `readRepoSnapshot(owner, repo, installationId, baseBranch)` · `readBlob(...)`
  - `{ status: "ok", headSha, headCommittedAt, paths } | { status: "truncated" } |
    { status: "base-branch-missing" } | { status: "unavailable" }`
  - ⚠️ **트리 잘림을 값으로 준다.** `GitClient.getTree` 구현이 이 함수를 감싸 `truncated`면 던진다 —
    `lib/pull/client.ts`의 계약은 손대지 않는다 (design §3.10)
  - ⚠️ **base 브랜치 ref가 `null`이면 "브랜치 없음"으로 읽지 않는다** — 권한 없음일 수도 있다
    (`client.ts` 주석, POSTMORTEM 2026-09-03). `base-branch-missing`은 `probeRepo` 200 뒤의 404에만
  - ⚠️ `createApp()`은 **try 밖** — 환경변수 누락은 던진다 (값으로 접으면 설정 오류가 영원히
    "잠시 뒤 다시"가 된다 — `probeRepo`와 같은 판단)
  - ⚠️ `headCommittedAt`은 `GET /git/commits/{sha}` 1회 — `new Date()`면 CI 첫 push가 409다
  - 검증: `lib/__tests__/github*.test.ts`(있으면) green · `pull/__tests__`의 `getTree` throw 계약 그대로 green
- [ ] `lib/github-connect/__tests__/credential-separation.test.ts` — **`lib/onboarding` 루트 추가**: `APP_CREDENTIAL`
      패턴 금지 + `github-connect/user|token-store` import 금지 + **`@/lib/github` import 금지**(두 토큰은 Server Action
      하나에서만 만난다 — design §3.10)
  - 검증: 일부러 `lib/onboarding/`에 `import "@/lib/github"`를 넣어 red 확인 후 되돌린다 (github-connect T2 전례)
- [ ] `lib/push/assemble.ts` — `assemblePushInput({ paths, probe, format, baseLocale? })` (`scripts/push-local.ts:76-110`의
      select→read→base 판정을 **이동**) + `push-local`이 그 함수를 부른다
  - 검증: `lib/push/__tests__/assemble.test.ts` — 같은 인메모리 트리(`lib/adapters/__tests__` 픽스처 재사용)를
    fs probe와 `makeProbe(map)`로 각각 먹여 `commitSha·commitAt·refs` 제외 페이로드 deep-equal /
    `grep -n assemblePushInput scripts/push-local.ts lib/onboarding/ingest.ts` 둘 다 1건 이상 ("만든 것이 호출되는가")
- [ ] `lib/onboarding/ingest.ts` — 스냅샷·blob(값으로 받는다) → `assemblePushInput` → `buildPushPayload`(`scanRefs: []`,
      `commitAt: headCommittedAt`) → `applyPush`
  - ⚠️ 세 함수를 **우회하지 않는다** (design §4 · POSTMORTEM 2026-08-31·2026-09-02). GitHub을 import하지 않는다
  - 검증: `lib/onboarding/__tests__/ingest.test.ts` — `lib/push/__tests__/flow.test.ts:45-80`의 `stubPrisma`(배열형 tx
    지원)로: `commitAt === headCommittedAt` / refs 0건 / base 키 N개가 `$executeRaw`에 실린다 / `read.errors`·
    `duplicateKeys`가 반환값에 실린다
- [ ] `scripts/smoke-github.ts`에 스냅샷 읽기 + **2패스 탐지를 진입점(`detectCandidatesAcross`)으로** 한 줄 (실 API라 `pnpm test` 밖)
  - 검증: `pnpm smoke:github <slug>`가 bugshot-2에서 `_locales` 후보 + 키 수 4를, code-dict 리포(`i18n-format-check`
    또는 코퍼스 하나)에서 code-dict 후보를 찍는다 — 어댑터 API가 아니라 진입점이다 (POSTMORTEM 2026-09-02 순위 픽스)

검증: `pnpm typecheck` green · `pnpm test` green · `pnpm smoke:github` 위 두 리포

—— `feat(github): repo snapshot reads with the installation token` + `refactor(push): share payload assembly with the CLI` + `feat(onboarding): server-side first ingest`

## T6. Server Action — 연결·탐지·생성·적재

- [ ] `lib/github-connect/state.ts` — `StatePayload.slug` → `dest: { kind:"settings", slug } | { kind:"new" }`,
      `parsePayload` 필드 검사, `StateCheck.ok`가 `dest`를 돌려준다
  - ⚠️ **쿼리로 빼지 않는다** — 서명 안에 있어야 open redirect 판정이 필요 없다 (design §3.6)
  - 기존 셋 갱신: `lib/github-connect/__tests__/state.test.ts` · `app/api/__tests__/github-callback.test.ts` ·
    `github-connect.test.ts:364`. `settings/actions.ts`의 `startGithubConnect`가 `{kind:"settings"}`로 서명
  - 검증: 옛 모양(`{slug}`)의 state가 `state-mismatch`로 거부된다(배포 직후 10분의 창을 의도한다)
- [ ] `app/api/github/callback/route.ts` — `dest`에 따라 `/projects/new` 또는 설정 화면으로. 실패는
      `/projects/new?e=<ConnectError>` (state 무효면 지금처럼 `/projects?e=`)
- [ ] `app/(edit)/projects/new/page.tsx` 자리에 `export const maxDuration = 60` (Action은 페이지 세그먼트 config를 쓴다 — design §2).
      `[slug]/settings/page.tsx`도
- [ ] `app/(edit)/projects/actions.ts`
  - `startGithubConnectForUser()` — 인가는 `requireUser`뿐 (design §3.6)
  - `listConnectableRepos()` — 사용자 토큰으로 설치·리포 목록 (**전 페이지**, `paginate`). 0개면 `no-installations`/`no-repos`
  - `detectRepoFormats({ owner, repo })` — 3중 검증 → `readRepoSnapshot` → 2패스(design §3.1) → `summarizeCandidates`
  - `createProject({ owner, repo, adapter, pathTemplate, baseLocale, slug, name })` — `templatePaths` → blob →
    `planConfirmedFormat` → `planProjectCreate` → `Project`(+ `baseBranch = defaultBranch`) + `ProjectMember(OWNER)` +
    `pushTokenHash`를 **한 트랜잭션** → **토큰 원문 반환**. P2002는 `slug-taken`
  - `runFirstIngest({ slug })` — `project:settings` · `planProjectReadiness !== "awaiting_first_sync"`면 `not-awaiting` ·
    `ingestTargets` → blob → `ingest.ts` → `{ count, failed }` (설정 화면 [다시 시도]와 **같은 Action**)
  - `rotatePushToken({ slug })` — `project:settings`
  - ⚠️ 모든 export가 스스로 인가를 부른다 (`entry-points.test.ts`가 export 단위로 센다)
  - ⚠️ **인가가 GitHub 조회보다 먼저다** (거부될 요청이 남의 레이트 리밋을 태우지 않는다)
- [ ] `app/(edit)/actions.ts` — `saveTranslation`·`triggerPullAction`에 `planProjectReadiness` → `not-ready` 거부
- [ ] `app/__tests__/entry-points.test.ts:161` — 링크 검사 정규식을 **다중 세그먼트 정적 경로**까지 넓힌다
      (`/projects/new` 가 검사에 들어온다). 템플릿 리터럴은 여전히 밖 — T7 `[manual]`
- [ ] `app/(edit)/__tests__/onboarding.test.ts` — **별도 파일 + mock 목록 명시** (`github-connect.test.ts`·
      `publish-failure.test.ts` 전례): `vi.mock("@/lib/onboarding/ingest")`, `@/lib/github`(`probeRepo`·`readRepoSnapshot`·
      `readBlob`), `@/lib/github-connect/user`
  - 케이스: 비로그인 거부 / 3중 검증 거부 3갈래 + `unavailable` 통과 / OWNER 3개 제한 초과(EDITOR 3개는 통과) /
    slug 충돌(선조회) / slug 경합(P2002 → `slug-taken`) / 클라이언트가 보낸 `pathTemplate`이 재검증에 실패하면 거부 /
    저장된 포맷이 **`detectFormatWith` 반환값**이다 / `createProject`가 토큰 원문을 반환하고 DB엔 해시만 /
    ingest가 던져도 `Project`·`ProjectMember(OWNER)` 행은 남고 `lastCommitSha === null` → 번역 Action `not-ready` /
    `runFirstIngest`를 `ready`에 부르면 `not-awaiting` / `duplicateKeys > 0`이면 반환에 `failed > 0` /
    `rotatePushToken`: EDITOR forbidden · 회전 후 옛 해시 `findUnique` null · 반환은 원문 한 번

검증: `pnpm test` green · `entry-points.test.ts` green · `credential-separation.test.ts` green

—— `feat(onboarding): server actions for connect, detect, create and ingest`

## T7. UI

- [ ] `app/(edit)/projects/new/page.tsx` — 최상단 `requireUser`. 조건부 렌더 금지. `?e=`를 **`isConnectError`·
      `isOnboardError` 둘로** 읽는다 (POSTMORTEM 2026-09-06 · design §3.6) — 같은 커밋에
- [ ] `components/onboarding/*` — 리포 선택(텍스트 필터) · 후보 목록(형식·경로·언어·**키 수** + "더 있을 수 있어요") ·
      기준 로케일 라디오(기본 `pickBaseLocale`) · 수동 지정(`<details>`, `no-candidates`면 펼침 + 이유 문구) ·
      확정 폼(slug 미리보기 `mal-moi.com/projects/<slug>` · 브랜치 `l10n/sync-<slug>` · "나중에 바꿀 수 없어요") ·
      결과(토큰 칩 + "복사됨" 라벨 + "잃어버리면 설정에서 재발급" 캡션 + YAML `<pre>` 코드 블록 + [복사] +
      적재 진행 → `ingestHeadline` + "코드 참조는 CI 첫 push 뒤" + "지금 편집 가능")
  - ⚠️ 어댑터 내부 이름을 화면에 쓰지 않는다 (design §3.3). 빈 상태 둘(`no-installations`·`no-repos`)에
    설치 링크 — `GITHUB_APP_SLUG` 없으면 대체 문구
  - ⚠️ 후보·로케일 라디오는 `<fieldset>`+`<legend>`, 각 `<input type="radio">`에 포커스 링 셋(`focus-ring.test.ts`가
    input을 센다), 선택 행 `bg-muted font-medium`, `cn()`. 대기는 버튼 라벨 교체 + disabled
  - ⚠️ 포커스 링 셋을 단다 (`components/__tests__/focus-ring`가 소스로 센다 — 눈으로 두 번 놓쳤다)
  - ⚠️ raw 색을 늘리지 않는다 — 상태 표시는 `text-muted-foreground`. `docs/DESIGN.md` §6.4에 **"코드 블록"
    `<pre>` 패턴 등재**, §6.2에 "상태 축 셋 — 색 없음" 표 등재 (`docs(DESIGN)` 별도 커밋)
- [ ] `app/(edit)/projects/page.tsx` — "새 프로젝트" 진입(빈 상태에도 primary 버튼, "-요" 문체) + 상태 텍스트
      (`awaiting_first_sync`→"첫 적재 대기", `setup`→"준비 중", `ready`→없음)
- [ ] `app/(edit)/projects/[slug]/translations/page.tsx` — `requireProjectAccess` **뒤** `planProjectReadiness`:
      OWNER → `redirect(/projects/<slug>/settings)`, 그 외 → 한 줄 "소유자가 설정을 마치는 중이에요"
- [ ] `app/(edit)/projects/[slug]/settings/page.tsx` — **상태 섹션**("첫 적재 대기" + [다시 시도] 인라인 결과 + YAML) +
      push 토큰 섹션(상시 캡션 "재발급하면 기존 토큰은 즉시 무효…" + [재발급] → invite-form 형 인라인)
  - ⚠️ 섹션이 독립적으로 실패한다 — 기존 둘(건강성·계정)과 같은 판단
- [ ] `middleware.ts` — `matcher`는 이미 `/projects/:path*`라 `new`가 덮인다. **테스트로 고정한다**
      (`lib/auth/__tests__/cookie*.test.ts` 또는 `middleware` 매처 테스트에 `/projects/new` 케이스)

검증: `pnpm build` green (RSC 경계는 `tsc`가 못 본다) · `pnpm test` green · **`[manual]` — `/bugshot-qa`로**:
`/projects` 빈 상태 + [새 프로젝트] / 계정 미연결 → [GitHub 연결] → 왕복 후 `/projects/new` 복귀 / 설치 0개 → 설치
링크(`GITHUB_APP_SLUG` 없는 상태도 한 번) / 후보 목록의 키 수·"더 있을 수 있어요" / `no-candidates`면 수동 지정 펼침 /
결과 화면 토큰 "복사됨"·YAML·"지금 편집 가능" / 중복 키 픽스처 리포에서 헤드라인이 "읽지 못했어요" / `/projects` 상태
텍스트 / `ready` 아닌 slug의 `translations` → OWNER는 설정, EDITOR는 한 줄 / 설정 [다시 시도] → `not-awaiting` 문구 /
세션 만료 뒤 Action → `?e=` 문구 / **결과 화면 링크 클릭 → 번역 화면 200**(템플릿 리터럴은 자동 검사 밖) / 탭으로
전체 흐름 통과(포커스 링)

—— `feat(onboarding): the /projects/new flow` + `docs(DESIGN): code block surface and colorless status axis`

## T8. 전환·실물 검증·문서

**프로덕션 배포 순서 — 이 태스크가 전환 절차 자체다** (design §6 · spec §5 "전환 다운타임"):

- [ ] `pnpm db:deploy` → `pnpm db:status:prod`로 `_add_project_push_token` 적용 확인
- [ ] `/merge` (T1~T7이 전부 dev에 있고 CI green인 상태에서 **한 번**)
- [ ] 프로덕션 설정 화면에서 넷(`bugshot-2`·`bugshot-i18n-test`·`i18n-format-check`·`i18n-order-check`) 토큰 발급 →
      **대상 리포 Actions secret `PUSH_TOKEN` 교체** → 넷 CI 수동 트리거 green
- [ ] dev DB 넷 — 로컬 `pnpm dev` 설정 화면에서 발급 → 사람이 `.env.local`의 `PUSH_TOKEN`에 (에이전트는 편집하지 않는다)
- [ ] Vercel 세 스코프에서 `ACTIVE_PROJECT_SLUG`·`PUSH_TOKEN` 삭제 (코드가 안 읽는 것을 grep으로 확인한 뒤.
      `vercel env ls`로 확인 — 성공 메시지가 근거가 아니다)
- [ ] 실물 왕복 — 폐기용 리포 하나를 **처음부터** 온보딩으로 붙인다
  - 시나리오: 계정 미연결 상태에서 시작 / 설치 선택 목록에 없는 리포 → `repo-not-installed` / 후보 둘 이상인 리포 /
    `ts-dict` 리포(수동 지정 → 903키) / code-dict 리포 자동 후보 / 남의 리포 owner/repo 직접 전송 → 거부 /
    첫 적재 실패 후 "다시 시도" / `ready`에서 "다시 시도" → `not-awaiting` / 워크플로 붙인 뒤 CI push 200 /
    야간 pull 순회(응답 배열에 둘 이상)
  - ⚠️ **preview가 아니라 로컬·프로덕션이다** — preview는 Vercel SSO 뒤라 자동화가 302를 받는다
- [ ] `/l10n-roundtrip` 재검증 (push 인증 경로가 바뀌었다 — 스킬 문서의 `PUSH_TOKEN`·`ACTIVE_PROJECT_SLUG` 절차와
      pull 응답 기대(`:54`, 배열)를 먼저 고친다)
- [ ] 문서 (각자 별도 커밋)
  - `docs/SAAS.md` — §8 5단계 체크 · **§7.8 조회 방향**(해시가 프로젝트를 정한다) · §5.4.1(`StateDest`) ·
    §7.3("키 수가 큰 쪽을 추천" → "키 수를 보인다, 기준 로케일은 사용자가 고른다") · §8 5단계 "Actions 링크"는
    6단계 이후로 · §8 6단계에 "GitHub 계정 연결 — 연결은 5단계에서 사용자 수준으로 갔다" · §8 7단계 고정 제한에
    "3개 제한은 5단계에서" · §10 "Workflows 권한" 결정(미실측 표기 유지) · §5.7 미종결 둘 종결 · `:122,473,483,545,667`의
    `ACTIVE_PROJECT_SLUG`
  - `CLAUDE.md`·`AGENTS.md`(`pnpm sync:agents`) — 테넌시 행의 `ACTIVE_PROJECT_SLUG` 경고 제거 · 디렉터리 구조에
    `lib/onboarding/`·`lib/push/token.ts`·`lib/push/assemble.ts`·`lib/pull/targets.ts`·`/projects/new` 추가 · 명령어 표의
    `push:local`·`smoke:github` 인자 필수화 · **재발급 절차**의 "세 곳이 같은 값을 들어야 하는 것은 `PUSH_TOKEN` 하나"
    → "대상 리포 secret ↔ 그 프로젝트의 `pushTokenHash`" · `:106`·`:273` · 아키텍처 원칙 코어 모듈 목록에 `onboarding`
  - `.claude/commands/push.md:68` — ARCHITECTURE 트리거 목록에 `lib/onboarding/` (CLAUDE.md 목록과 같아야 한다)
  - `docs/ACTIONS.md` — `project` input 설명(409의 기준) · `:13` "`PUSH_TOKEN`은 Vercel env와 같은 값" → "프로젝트
    설정 화면에서 발급" · `:104` 500 `server misconfigured` 진단 줄 제거 · "배포 하나가 프로젝트 하나만 받는다" 경고 제거 ·
    404 진단 줄 제거 · `.github/actions/l10n-push/action.yml:20` input 설명
  - `docs/ARCHITECTURE.md` — §5.5.5(오배송 판정 근거 — 토큰이 프로젝트를 정한다) · 첫 적재 경로(§4) · §6.3에
    `/projects/new`의 이중 `?e=` 읽기 · `:560,565` · 2패스 탐지의 probe 역할 표(§3.1)
  - `docs/ADAPTER-COVERAGE.md` — `codeDictCandidatePaths` 분리는 판정 불변이라 회차를 더하지 않는다는 한 줄
  - `docs/TASKS.md` — §0 "지금 어디에 있나"를 5단계 완료로 · 전역 미결의 `ACTIVE_PROJECT_SLUG` 항목 해소
  - `docs/MVP.md` §7 — "`ACTIVE_PROJECT_SLUG`가 남은 곳은 둘뿐"·"서버가 받는 프로젝트는 여전히 하나" 두 문장을 과거형으로
    (닫힌 스펙이지만 github-connect가 고친 선례)
  - `.env.example` — `ACTIVE_PROJECT_SLUG` 블록 제거 · `PUSH_TOKEN` 설명을 "push:local이 보낼 그 프로젝트의 토큰
    원문(로컬 전용)"으로
  - `lib/__tests__/failure.test.ts:21,27,53` — 예시 변수명 교체 (아무 이름이든 된다)
  - `.claude/commands/l10n-roundtrip.md` + `.agents/skills/` 미러 — `ACTIVE_PROJECT_SLUG` 절차 제거 · pull 응답 배열
    (`pnpm sync:agents`, 게이트 `pnpm sync:agents:check`)
  - `docs/features/README.md` — 표에 한 줄 · `:43` "결정 셋이 여기에만 있다"를 SAAS로 올렸다고 · 백로그 3·4행 이월 사유
  - `docs/POSTMORTEM.md`는 건드리지 않는다 (append-only)

검증: `grep -rn ACTIVE_PROJECT_SLUG --exclude-dir=features --exclude=POSTMORTEM.md --exclude=MVP.md .` 0건
(`docs/TASKS.md`는 `# 완료 기록` 아래만) · `docs/features/*`·MVP의 언급이 과거형 · 대상 리포 CI 4개가 전부 green ·
야간 pull 응답에 프로젝트가 여럿 나온다 · `pnpm sync:agents:check` green

—— `docs(...): ...` (문서별)
