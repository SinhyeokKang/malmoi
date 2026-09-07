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

- [x] `app/api/push/route.ts` — bearer → `hashPushToken` → `Project.findUnique({pushTokenHash})` → slug 대조 → 역행 검사
  - 401(토큰 무효·미발급) / 409(오배송) / 409(역행) / 404 제거 — 프로젝트 존재를 노출하지 않는다
  - `requireEnv("ACTIVE_PROJECT_SLUG")`·`PUSH_TOKEN` 읽기 제거 (`checkBearer`는 `/api/pull`의 `CRON_SECRET`용으로 남는다)
  - ⚠️ 인증·JSON·스키마 실패는 **try 밖에 그대로 둔다** (감싸면 400이 500으로 접힌다 —
    `route-diagnostics.test.ts`가 그것을 센다)
- [x] `app/api/__tests__/route-diagnostics.test.ts` — push 쪽: `ACTIVE_PROJECT_SLUG` 500 케이스(`:107`)를
      **토큰 미발급 401**로. mock prisma에 `findUnique({pushTokenHash})` 분기
- [x] `lib/push/guard.ts` 주석 갱신 — 대조 대상이 "서버 env"에서 "토큰의 프로젝트"로 바뀐 이유. `lib/push/plan.ts:63` 주석도
- [x] `scripts/push-local.ts:68` · `scripts/smoke-github.ts:36` — `?? requireEnv("ACTIVE_PROJECT_SLUG")` 폴백 제거,
      **인자 필수**(없으면 usage + exit 2). `push-local`의 `PUSH_TOKEN`은 "그 프로젝트의 토큰 원문"이 된다
  - 검증: `pnpm push:local <dir>`(--project 없이) exit 2 · `lib/cli/__tests__` 인자 파싱 테스트 갱신

검증: `pnpm test` green · 새 테스트 4건(무헤더 401 / 잘못된 토큰 401 / 미발급 프로젝트 401 /
오배송 409)이 각자 다른 응답을 낸다 · ~~`grep -n ACTIVE_PROJECT_SLUG app/ scripts/ lib/` 0건~~ →
**`app/api/push`·`scripts/`에서 0건** (전역 0건은 T3 단독으로 불가능하다 — `/api/pull`이 T4까지,
`lib/__tests__/failure.test.ts`의 예시 변수명이 T8까지 남는다. code-review 2026-09-07이 잡았다)

✅ 2026-09-07 — `f44e4a1`(test) → `47fb4de`(feat) → `3a3d5e8`(refactor: code-review 🟡1·2·3) + 문서 7커밋.
test 1630 green · typecheck · build green.

**실물 검증** (로컬 dev 서버 + dev DB, `order-check`에 토큰을 임시 발급했다가 회수):
헤더 없음 401 / 빈 `Bearer ` 401(DB 왕복 없음) / 틀린 토큰 401 / 미발급 프로젝트 401 / 오배송 409
(`expected/got`) / 역행 409 (`commitAt/lastCommitAt`) / 정상 200. `push:local`이 새 인증 경로로 실제
리포를 적재해 200(`updated 23`)을 받았고, 두 CLI의 인자 누락은 exit 2 + usage였다.
⚠️ 그 과정에서 dev DB의 `order-check`에 스모크 키 하나(`smoke.t3`)가 orphaned로 남았다 — 되돌릴 수
있는 상태이고 export에는 안 나간다.

**code-review가 바꾼 것 셋**: ① 인증이 JSON 파싱·스키마 검증보다 **앞으로** 갔다 — `maxDuration=60`
공개 엔드포인트에서 무효 토큰 하나로 대용량 페이로드를 파싱시키고 zod `issues`까지 받아 가는 면적을
막는다(둘 다 `return`이라 400이 500으로 접히지 않는다). ② 빈 `Bearer `를 조회 전에 거른다(전엔 헤더
트림이라는 우연에 기대고 있었다). ③ 라우트 테스트의 기본 stub이 `null`(fail-closed)이 됐고, "미발급
401"은 **NULL 행이 실재하는** 하네스로 검사한다 — 전엔 "틀린 토큰"과 바이트 단위로 같았다.

—— `feat(push): per-project token auth replaces the shared secret`

## T4. `/api/pull` 전 프로젝트 순회

- [x] `lib/pull/targets.ts` — `selectPullTargets(projects)` (순수: `installationId != null AND
      lastCommitSha != null`, `slug` 오름차순)
- [x] `app/api/pull/route.ts` — 순회 + **프로젝트별 try/catch** + 결과 **배열**. `requireEnv("ACTIVE_PROJECT_SLUG")` 제거.
      `:16` 주석의 옛 matcher(`/keys/:path*`)도 고친다
  - ⚠️ 실패 전문은 응답에 싣지 않는다 — `ref`만 내고 서버 로그로 (`classifyFailure`, ARCHITECTURE §6.0)
- [x] `app/api/__tests__/route-diagnostics.test.ts` — **pull 케이스 4개 전부 재작성** (`:65-98`): 500 케이스 →
      대상 0개 `[]` 200 / `triggerPull` throw → 200 + 그 항목만 `{status:"failed", ref}`, 전문은 `console.error`에만 /
      AppError → 같은 형 / 정상 경로 → 배열. mock prisma에 `project.findMany` (없으면 라우트가 TypeError)
- [x] `lib/pull/__tests__/targets.test.ts` — 준비 안 된 프로젝트(`installationId` null·`lastCommitSha` null·
      `skillflo-web` 모양)는 대상에서 빠진다 / 순서가 결정적이다 / `triggerPull`이 실패 **값**을 돌려주는
      경우와 throw 둘 다 배열에 남는다

검증: `pnpm test` green

✅ 2026-09-07 — `802833f`(test) → `597b545`(feat) → `089e139`(refactor: code-review 🔴1). test 1649 green ·
typecheck · build green. **`ACTIVE_PROJECT_SLUG`를 읽는 코드가 남지 않았다** — T3가 심어둔 "pull은 아직
읽는다" 단언이 이 구현으로 red가 되어 완료를 알렸고, 그 자리를 "코드에 소비자가 없다"로 바꿨다.

**실물 검증** (로컬 dev 서버 + dev DB, 검증용 `Project` 행을 만들었다 지웠다):
준비된 둘 순회(`order-check`는 2층까지 가서 `no-changes` — 바이트 고정점 유지, probe는 1층 `no-edits`) /
미준비 행 제외 / probe에 편집을 심어 GitHub을 부르게 하니 **그 항목만 `failed`이고 나머지는 정상 결과** /
인증 실패 401은 순회 전 / 대상 0개 `[]` 200.

⚠️ **code-review가 🔴을 하나 잡았고 그것이 실물 검증의 구멍이기도 했다.** 안전한 실패(`AppError`)가
로그를 안 남겨서, 응답이 항상 200 배열인 이 라우트에서 **전 프로젝트가 매일 밤 실패해도 성공과 관측값이
같았다**(POSTMORTEM 2026-09-06의 형태). 내가 실물로 본 `base 브랜치를 읽을 수 없다`가 정확히 그 갈래였는데
서버 로그 grep이 비어 있는 것을 그냥 넘겼다. 지금은 두 갈래 모두 `[pull:<slug>]`로 남고 순회 끝에
`[pull] targets=N failed=M` 한 줄이 붙는다 — 재검증에서 그 두 줄을 실물로 확인했다.

⚠️ **design §3.9의 "넘치면 나머지가 다음 밤에 돈다"가 거짓이라 문서를 고쳤다.** 순서가 `slug` 고정이라
선두가 예산을 독점하면 뒤쪽은 결정적으로 아사한다. 정렬 변경은 이 단계가 요청받지 않은 동작이라
제약을 명시하고 7단계 `SyncRun`에 넘겼다.

—— `feat(pull): cron iterates every ready project`

## T5. GitHub 읽기 — `lib/github.ts`가 든다

- [x] `lib/github-connect/health.ts:16` — `ProbeResult.ok`에 `defaultBranch` (`GET /repos` 응답에 이미 있다)
  - ⚠️ 필수 필드라 **리터럴 14곳**이 typecheck red다: `lib/github-connect/__tests__/connect-plan.test.ts:24,99,125` ·
    `health.test.ts:18,63,90,99,108,117,132` · `app/(edit)/__tests__/github-connect.test.ts:62,262,272,292`
  - 검증: `pnpm typecheck` green(14곳 갱신 포함) · `health.test.ts` **판정** 불변
- [x] `lib/github.ts` — `readRepoSnapshot(owner, repo, installationId, baseBranch)` · `readBlob(...)`
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
- [x] `lib/github-connect/__tests__/credential-separation.test.ts` — **`lib/onboarding` 루트 추가**: `APP_CREDENTIAL`
      패턴 금지 + `github-connect/user|token-store` import 금지 + **`@/lib/github` import 금지**(두 토큰은 Server Action
      하나에서만 만난다 — design §3.10)
  - 검증: 일부러 `lib/onboarding/`에 `import "@/lib/github"`를 넣어 red 확인 후 되돌린다 (github-connect T2 전례)
- [x] `lib/push/assemble.ts` — `assemblePushInput({ paths, probe, format, baseLocale? })` (`scripts/push-local.ts:76-110`의
      select→read→base 판정을 **이동**) + `push-local`이 그 함수를 부른다
  - 검증: `lib/push/__tests__/assemble.test.ts` — 같은 인메모리 트리(`lib/adapters/__tests__` 픽스처 재사용)를
    fs probe와 `makeProbe(map)`로 각각 먹여 `commitSha·commitAt·refs` 제외 페이로드 deep-equal /
    `grep -n assemblePushInput scripts/push-local.ts lib/onboarding/ingest.ts` 둘 다 1건 이상 ("만든 것이 호출되는가")
- [x] `lib/onboarding/ingest.ts` — 스냅샷·blob(값으로 받는다) → `assemblePushInput` → `buildPushPayload`(`scanRefs: []`,
      `commitAt: headCommittedAt`) → `applyPush`
  - ⚠️ 세 함수를 **우회하지 않는다** (design §4 · POSTMORTEM 2026-08-31·2026-09-02). GitHub을 import하지 않는다
  - 검증: `lib/onboarding/__tests__/ingest.test.ts` — `lib/push/__tests__/flow.test.ts:45-80`의 `stubPrisma`(배열형 tx
    지원)로: `commitAt === headCommittedAt` / refs 0건 / base 키 N개가 `$executeRaw`에 실린다 / `read.errors`·
    `duplicateKeys`가 반환값에 실린다
- [x] `scripts/smoke-github.ts`에 스냅샷 읽기 + **2패스 탐지를 진입점(`detectCandidatesAcross`)으로** 한 줄 (실 API라 `pnpm test` 밖)
  - 검증: `pnpm smoke:github <slug>`가 bugshot-2에서 `_locales` 후보 + 키 수 4를, code-dict 리포(`i18n-format-check`
    또는 코퍼스 하나)에서 code-dict 후보를 찍는다 — 어댑터 API가 아니라 진입점이다 (POSTMORTEM 2026-09-02 순위 픽스)

검증: `pnpm typecheck` green · `pnpm test` green · `pnpm smoke:github` 위 두 리포

✅ 2026-09-07 — `3ca20c3`(test) → `b17b3d0`(snapshot) → `61b0c5c`(assemble) → `b3879e3`(ingest) →
`3dc1be9`(refactor: code-review 🔴 2건 + 🟡 5건). test 1674 green · typecheck · build green.

**실물 검증** (실 GitHub API, dev DB에 검증용 행을 만들었다 지웠다):
`order-check` 23키 · **`bugshot-2`에서 `_locales` 후보 + 키 수 4** · **`i18n-format-check`에서 code-dict 후보**
(YAML 카탈로그와 함께 2후보). `base-branch-missing`도 실제로 밟았다(그 리포의 default branch가 `dev`인데
`main`으로 조회했다). 자격증명 스캐너는 일부러 `lib/onboarding/`에 `import "@/lib/github"`를 넣어 red를
확인하고 되돌렸다.

⚠️ **code-review가 🔴 2건을 잡았고 둘 다 실물 검증이 못 본 부류다** — 작은 리포에서 전부 성공하는 경로만
밟았기 때문이다:
① **내려받지 못한 로케일 파일이 실패로 안 잡혔다.** "다운로드 실패"와 "리포에 없음"을 같게 접어서, 로케일
12개 중 3개가 5xx면 DB엔 9개만 들어가는데 화면은 "N개 키를 적재했어요"를 쓴다. base 파일이 빠지면
`count: 0 / failed: 0`이라 "0개 적재"가 성공으로 읽힌다. 이제 `targets`를 함께 받아 `blobs`에 없는 것을
실패로 센다.
② **blob 하나마다 설치 토큰을 새로 발급했다.** 토큰 캐시가 App 인스턴스에 붙어 있어서 호출이 2배였다 —
design §3.1의 예산이 실제로는 42회, §4의 50로케일 첫 적재는 100회라 `maxDuration=60`에서 잘린다. 같은
수정으로 contents API의 1MB 상한도 사라졌다(스냅샷이 `sha`를 들고 git blobs API를 쓴다).

**남긴 것**: `buildPushPayload`의 `duplicateKeys`가 base 키 중복을 키·번역 두 번 센다(🟡1). 한 소스 줄이
두 테이블에서 접히는 것이라 이중 계수로 단정하기 어렵고, CI 로그에 쓰이는 공유 함수라 이 단계에서
바꾸지 않았다. 화면 판정은 0 vs 0 아님이라 영향이 없다.

—— `feat(github): repo snapshot reads with the installation token` + `refactor(push): share payload assembly with the CLI` + `feat(onboarding): server-side first ingest`

## T6. Server Action — 연결·탐지·생성·적재

- [x] `lib/github-connect/state.ts` — `StatePayload.slug` → `dest: { kind:"settings", slug } | { kind:"new" }`,
      `parsePayload` 필드 검사, `StateCheck.ok`가 `dest`를 돌려준다
  - ⚠️ **쿼리로 빼지 않는다** — 서명 안에 있어야 open redirect 판정이 필요 없다 (design §3.6)
  - 기존 셋 갱신: `lib/github-connect/__tests__/state.test.ts` · `app/api/__tests__/github-callback.test.ts` ·
    `github-connect.test.ts:364`. `settings/actions.ts`의 `startGithubConnect`가 `{kind:"settings"}`로 서명
  - 검증: 옛 모양(`{slug}`)의 state가 `state-mismatch`로 거부된다(배포 직후 10분의 창을 의도한다)
- [x] `app/api/github/callback/route.ts` — `dest`에 따라 `/projects/new` 또는 설정 화면으로. 실패는
      `/projects/new?e=<ConnectError>` (state 무효면 지금처럼 `/projects?e=`)
- [x] `app/(edit)/projects/new/page.tsx` 자리에 `export const maxDuration = 60` (Action은 페이지 세그먼트 config를 쓴다 — design §2).
      `[slug]/settings/page.tsx`도
- [x] `app/(edit)/projects/actions.ts`
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
- [x] `app/(edit)/actions.ts` — `saveTranslation`·`triggerPullAction`에 `planProjectReadiness` → `not-ready` 거부
- [x] `app/__tests__/entry-points.test.ts:161` — 링크 검사 정규식을 **다중 세그먼트 정적 경로**까지 넓힌다
      (`/projects/new` 가 검사에 들어온다). 템플릿 리터럴은 여전히 밖 — T7 `[manual]`
- [x] `app/(edit)/__tests__/onboarding.test.ts` — **별도 파일 + mock 목록 명시** (`github-connect.test.ts`·
      `publish-failure.test.ts` 전례): `vi.mock("@/lib/onboarding/ingest")`, `@/lib/github`(`probeRepo`·`readRepoSnapshot`·
      `readBlob`), `@/lib/github-connect/user`
  - 케이스: 비로그인 거부 / 3중 검증 거부 3갈래 + `unavailable` 통과 / OWNER 3개 제한 초과(EDITOR 3개는 통과) /
    slug 충돌(선조회) / slug 경합(P2002 → `slug-taken`) / 클라이언트가 보낸 `pathTemplate`이 재검증에 실패하면 거부 /
    저장된 포맷이 **`detectFormatWith` 반환값**이다 / `createProject`가 토큰 원문을 반환하고 DB엔 해시만 /
    ingest가 던져도 `Project`·`ProjectMember(OWNER)` 행은 남고 `lastCommitSha === null` → 번역 Action `not-ready` /
    `runFirstIngest`를 `ready`에 부르면 `not-awaiting` / `duplicateKeys > 0`이면 반환에 `failed > 0` /
    `rotatePushToken`: EDITOR forbidden · 회전 후 옛 해시 `findUnique` null · 반환은 원문 한 번

검증: `pnpm test` green · `entry-points.test.ts` green · `credential-separation.test.ts` green

✅ 2026-09-07 — `fe65ab2`(test) → `b1fed55`(actions) → `032644e`(refactor: code-review 🟡 4건).
test 1743 green · typecheck · build green. 실물 검증은 T7의 `[manual]`이 받는다 (화면이 없다).

**T6이 더한 것 하나** — `OnboardError`에 **`not-ready`**. design §3.7이 두 번역 Action의 거부를 그
이름으로 적었는데 T1의 17갈래에 없었고, 문구가 없으면 번역자 화면에 `저장 실패: not-ready`가 뜬다
(POSTMORTEM 2026-09-06과 같은 형태). `pullMessage`·`translation-input`이 `isOnboardError`를 함께 읽는다.

**설계와 다르게 한 것 하나** — 프로젝트가 없는 Action 넷(`startGithubConnectForUser`·
`listConnectableRepos`·`detectRepoFormats`·`createProject`)의 세션 만료는 **값이 아니라 `/`로의
redirect**다. design §3.6이 그 넷의 인가를 `requireUser`로 지정했고 그 함수가 redirect를 던진다 —
중간 상태 무저장(§3.4)이라 "처음부터"가 정확한 안내이고, blur 저장처럼 잃을 입력이 없다.
`OnboardError.unauthorized`는 `?e=`로 오는 경로에 남는다.

**하네스 기본값이 바뀌었다** — 시드 프로젝트의 `lastCommitSha`가 "적재 완료"다. `planProjectReadiness`
게이트가 붙으면서 `null` 시드로는 편집 흐름 테스트 28건이 전부 `not-ready`로 거부됐다. `project.create`는
그대로 `null`을 낸다(스키마 기본값과 같다) — 그래서 온보딩이 만든 행은 `awaiting_first_sync`로 태어난다.

⚠️ **code-review가 잡은 🟡 4건을 반영했고 1건은 남겼다.** 남긴 것은 **multi-locale 확정의 blob 예산**:
`templatePaths`가 `matchGlobPaths`라 `ts-dict` 리포의 네임스페이스 파일 전부를 확정 클릭 한 번에
내려받는다(탐지의 ≤21과 달리 상한이 없다). 상한을 두면 `detectFormatWith`가 보는 파일이 줄어
`format.locales`가 불완전해질 수 있고, 그러면 기준 로케일 검사와 첫 적재가 조용히 로케일을 잃는다 —
`ts-dict`는 수동 지정 전용이고 실측 리포의 네임스페이스가 10개대라 여기서 바꾸지 않았다.

—— `feat(onboarding): server actions for connect, detect, create and ingest`

## T7. UI

- [x] `app/(edit)/projects/new/page.tsx` — 최상단 `requireUser`. 조건부 렌더 금지. `?e=`를 **`isConnectError`·
      `isOnboardError` 둘로** 읽는다 (POSTMORTEM 2026-09-06 · design §3.6) — 같은 커밋에
- [x] `components/onboarding/*` — 리포 선택(텍스트 필터) · 후보 목록(형식·경로·언어·**키 수** + "더 있을 수 있어요") ·
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
- [x] `app/(edit)/projects/page.tsx` — "새 프로젝트" 진입(빈 상태에도 primary 버튼, "-요" 문체) + 상태 텍스트
      (`awaiting_first_sync`→"첫 적재 대기", `setup`→"준비 중", `ready`→없음)
- [x] `app/(edit)/projects/[slug]/translations/page.tsx` — `requireProjectAccess` **뒤** `planProjectReadiness`:
      OWNER → `redirect(/projects/<slug>/settings)`, 그 외 → 한 줄 "소유자가 설정을 마치는 중이에요"
- [x] `app/(edit)/projects/[slug]/settings/page.tsx` — **상태 섹션**("첫 적재 대기" + [다시 시도] 인라인 결과 + YAML) +
      push 토큰 섹션(상시 캡션 "재발급하면 기존 토큰은 즉시 무효…" + [재발급] → invite-form 형 인라인)
  - ⚠️ 섹션이 독립적으로 실패한다 — 기존 둘(건강성·계정)과 같은 판단
- [x] `middleware.ts` — `matcher`는 이미 `/projects/:path*`라 `new`가 덮인다. **테스트로 고정한다**
      (`lib/auth/__tests__/cookie*.test.ts` 또는 `middleware` 매처 테스트에 `/projects/new` 케이스)

검증: `pnpm build` green (RSC 경계는 `tsc`가 못 본다) · `pnpm test` green · **`[manual]` — `/bugshot-qa`로**:
`/projects` 빈 상태 + [새 프로젝트] / 계정 미연결 → [GitHub 연결] → 왕복 후 `/projects/new` 복귀 / 설치 0개 → 설치
링크(`GITHUB_APP_SLUG` 없는 상태도 한 번) / 후보 목록의 키 수·"더 있을 수 있어요" / `no-candidates`면 수동 지정 펼침 /
결과 화면 토큰 "복사됨"·YAML·"지금 편집 가능" / 중복 키 픽스처 리포에서 헤드라인이 "읽지 못했어요" / `/projects` 상태
텍스트 / `ready` 아닌 slug의 `translations` → OWNER는 설정, EDITOR는 한 줄 / 설정 [다시 시도] → `not-awaiting` 문구 /
세션 만료 뒤 Action → `?e=` 문구 / **결과 화면 링크 클릭 → 번역 화면 200**(템플릿 리터럴은 자동 검사 밖) / 탭으로
전체 흐름 통과(포커스 링)


✅ 2026-09-07 — `67d6746`(test) → `3195e9e`(UI) → `6717672`(refactor: code-review 🟡 4건) →
`43b74d6`(fix: 실물 검증이 잡은 것) → `docs(DESIGN)`. test 1755 green · typecheck · build green.
최종 청크 최대 229KB(아래 🔴 참조).

**실물 검증** (로컬 dev + dev DB, `t7-verify` 프로젝트를 만들었다 지웠다 — ego-browser):
로그인 → `/projects` 빈 목록 아님·[새 프로젝트] → `/projects/new`가 **not-connected 빈 상태 + [GitHub 연결]** →
왕복(`redirect_uri`가 localhost로 나갔다 — malmoi#7 픽스 생존) → **착지가 `/projects/new`**(`dest:{kind:"new"}`가
실제로 동작한다) → 리포 4개(설치 목록과 일치) → `bugshot-2` 탐지: **크롬 확장 메시지 ·
`public/_locales/{locale}/messages.json` · 언어 3(en,fr,ko) · 키 4개**(T5 실물값과 일치) + "더 있을 수 있어요" +
기준 언어 라디오(기본 en) + 수동 지정 접힘 → 확정(`t7-verify`) → **토큰 원문 + YAML(`branches: [main]`) +
"적재하는 중…" → "4개 키를 적재했어요"** → [번역 시작하기] → 번역 화면 200(4키, CMD 1·EXT 3) →
설정 5섹션(리포 연결·상태·push 토큰·워크플로·GitHub 계정) → **토큰 재발급**(원문 + 경고 + [복사]→"복사됨") →
`lastCommitSha`를 null로 되돌려: `/projects`가 "첫 적재 대기 · 소유자", **번역 화면이 OWNER를 설정으로 redirect**,
설정 상태 섹션이 "첫 적재 대기 — …" + [다시 시도] → 재적재 성공.

⚠️ **못 밟은 것 둘**: ① `not-awaiting` 문구 — 재적재가 성공하면 `revalidatePath`가 [다시 시도]를 없애므로
UI로는 도달할 수 없다(그것이 설계다 — 버튼이 사라지는 것이 답이고, URL 직접 호출만 그 갈래를 본다).
② `no-candidates`·`no-installations`·`tree-truncated` 빈 상태 — 그 상태를 만들 리포가 없다(설치 넷이 전부
로케일 파일을 갖는다). `GITHUB_APP_SLUG` 없는 대체 문구도 같은 이유로 밟지 않았다.

🔴 **실물 검증이 잡은 결함 둘** (둘 다 단위 테스트가 원리적으로 못 보는 층):
① **클라이언트 번들에 7.2MB 청크.** T6이 `not-ready` 문구를 화면에 닿게 하려고 클라이언트에서
`lib/onboarding/message`를 import했고, 그 그래프가 `slug` → `pull/trigger` → `lib/adapters` → `ts-dict` →
**ts-morph(TypeScript 컴파일러)** 로 이어졌다. **T6의 확인이 `@octokit`만 grep해서 "트리 셰이킹이 떼어냈다"는
틀린 결론을 주석으로 남겼다.** 판정을 잎 모듈 `lib/pull/ref-slug.ts`로 내리고
`components/__tests__/client-graph.test.ts`가 상시로 센다 (POSTMORTEM 2026-09-07).
② **[다시 시도] 성공이 자기 결과 문구를 지웠다.** `revalidatePath` → readiness가 `ready`로 → 그 분기 안의
컴포넌트가 언마운트 → 방금 받은 `ingestHeadline`이 사라진다. 부분 적재면 "M건을 읽지 못했어요"(불변식 9)가
아무에게도 닿지 않는다. 컴포넌트를 분기 밖으로 내고 `canRun`으로 버튼만 감췄다 (POSTMORTEM 2026-09-07).

**code-review가 바꾼 것 넷**: `no-candidates`에서 같은 문구가 두 번 뜨던 것 · 목록 전체 버튼이 동시에
"탐지하는 중…"이 되던 것 · `error as OnboardError` 단언 · 적재 오류 목록의 중복 key. 그리고 `tree-truncated`
주석이 "수동 지정은 된다"고 적혀 있었는데 **거짓이다** — 확정의 재검증이 같은 스냅샷을 읽어 같은 갈래를 낸다.

**설계에 없던 판단 하나**: 포커스 링 셋을 공유 상수에 넣지 않고 컨트롤 11곳에 리터럴로 적었다 —
`focus-ring.test.ts`가 여는 태그의 **소스**를 읽으므로 상수에 숨기면 그 방어선이 이 파일을 못 본다.
DESIGN §7에 그 사실을 등재했다.

—— `feat(onboarding): the /projects/new flow` + `docs(DESIGN): code block surface and colorless status axis`

## T8. 전환·실물 검증·문서

**프로덕션 배포 순서 — 이 태스크가 전환 절차 자체다** (design §6 · spec §5 "전환 다운타임"):

- [x] `pnpm db:deploy` → `pnpm db:status:prod`로 `_add_project_push_token` 적용 확인 ✅ 2026-09-07 (11개 up to date)
- [x] `/merge` ✅ 2026-09-07 — PR [#9](https://github.com/SinhyeokKang/malmoi/pull/9) squash `f595cc3` (93파일 +7959/-336). PR CI `verify` green, Vercel 프로덕션 배포 success
- [x] ~~넷~~ **`order-check` 하나** 토큰 발급 → 대상 리포 secret 교체 → CI green ✅ 2026-09-07
  - ⚠️ **이 항목의 전제가 둘 틀렸다** (실측):
    ① **l10n 워크플로가 붙은 리포는 `i18n-order-check` 하나다.** `bugshot-2`·`bugshot-i18n-test`의
    `ci.yml`은 그 리포들의 자체 CI이고 `l10n-push` 스텝이 없으며, `i18n-format-check`는 워크플로가
    0개다 (TASKS §5의 "CI 워크플로는 이 리포에 안 붙였다"가 그 이유다). **쓰는 곳이 없는 토큰은
    발급하지 않았다** — `pushTokenHash`가 `null`인 상태가 fail-closed의 올바른 기본값이고, 발급하면
    관리할 자격증명만 늘어난다.
    ② **prod `Project` 행은 여섯이고 `i18n-format-check` 하나에 프로젝트가 둘이다**
    (`format-check-code`·`format-check-yaml` — SAAS §7.1의 "한 리포에 표면이 둘"이 실제로 있다).
    ⚠️ **그 리포는 `PUSH_TOKEN` secret 하나로 두 프로젝트를 먹일 수 없다** — 토큰이 프로젝트를
    정하므로 워크플로에 스텝 둘 + secret 둘이 필요하다. 워크플로를 붙일 때 결정할 자리다
  - 실측: `updated: 23 / translationsFilled: 69 / orphaned: 0`,
    [run 34100271260](https://github.com/SinhyeokKang/i18n-order-check/actions/runs/34100271260).
    ⚠️ **토큰 원문을 화면에 찍지 않았다** — 스크립트가 해시를 prod에 쓰고 원문을 `gh secret set`의
    stdin으로 바로 넘겼다(`--body`는 `ps`에 노출된다). 해시를 **먼저** 쓰고 secret을 나중에 넣는다:
    순서가 반대면 옛 해시로 도는 창이 생긴다
- [x] ~~dev DB 넷 토큰 → `.env.local`~~ → **안 한다** (2026-09-07 결정). 그 값의 소비자는 `pnpm push:local`
      하나이고 지금 그것을 돌릴 일이 없다. 필요해지면 로컬 dev 서버의 설정 화면에서 **그 dev 프로젝트의**
      토큰을 발급해 사람이 채운다 — prod 토큰을 넣으면 401이다(로컬 `DATABASE_URL`이 dev를 가리킨다)
- [x] Vercel에서 `ACTIVE_PROJECT_SLUG`·`PUSH_TOKEN` 삭제 ✅ 2026-09-07 (리뷰 ⚪16)
  - ⚠️ **"세 스코프"가 전제였고 틀렸다** — 둘 다 **Production+Preview** 두 스코프만 갖고 있었고
    Development에는 없었다(그 스코프는 `vercel env pull`을 안 쓰므로 애초에 읽는 곳이 없다).
  - 보류 사유("T3 이전 배포로 롤백하면 그 값을 요구한다")는 **`main`에 #9 위로 #10이 얹히면서
    사실상 닫혀 있었다** — 그 지점으로 롤백하는 것은 배포 둘을 건너뛰는 일이다.
  - `vercel env ls`의 목록으로 확인했다 — 삭제 명령의 성공 메시지가 근거가 아니다 (CLAUDE.md)
- [x] 실물 왕복 — 폐기용 리포 하나를 **처음부터** 온보딩으로 붙인다 ✅ 2026-09-07 (`/bugshot-qa`, 로컬)
  - ⚠️ **야간 pull 순회는 프로덕션 cron이 스스로 확인한다** (KST 03:00). `CRON_SECRET`은 Vercel 스코프에만
    있어 손으로 부를 수 없고, 부르면 대상 리포에 PR이 열린다
  - 시나리오: 계정 미연결 상태에서 시작 / 설치 선택 목록에 없는 리포 → `repo-not-installed` / 후보 둘 이상인 리포 /
    `ts-dict` 리포(수동 지정 → 903키) / code-dict 리포 자동 후보 / 남의 리포 owner/repo 직접 전송 → 거부 /
    첫 적재 실패 후 "다시 시도" / `ready`에서 "다시 시도" → `not-awaiting` / 워크플로 붙인 뒤 CI push 200 /
    야간 pull 순회(응답 배열에 둘 이상)
  - ⚠️ **preview가 아니라 로컬·프로덕션이다** — preview는 Vercel SSO 뒤라 자동화가 302를 받는다
  - **로컬로 돈다** (2026-09-07 결정). prod에서 하면 **프로젝트 삭제 UI가 비범위라 검증용 행이 영구히
    쌓이고 OWNER 3개 제한을 먹는다** — 로컬은 dev DB라 만들었다 지울 수 있다. prod가 답해야 했던
    축(마이그레이션·머지·토큰 인증)은 `order-check` push 200으로 이미 닫혔다. `/bugshot-qa`도 같은
    이유로 로컬을 쓴다
**실물 검증 기록** (2026-09-07, 로컬 + dev DB. 검증용 프로젝트 둘을 만들었다 지웠다):

| 시나리오 | 결과 |
|---|---|
| 리포 텍스트 필터 | ✅ `format` → 1건으로 좁혀진다 |
| **후보 둘 이상** (`i18n-format-check`) | ✅ YAML 카탈로그 `locales/{locale}.yml` 9키 + **코드 딕셔너리** `src/i18n/{locale}.ts` 9키 — code-dict 자동 후보도 여기서 닫힌다 |
| 2번째 후보 선택 | ✅ 선택 행이 `bg-muted`로 옮겨가고 기준 언어가 그 후보 것으로 갱신된다 |
| **저장값이 고른 후보다** | ✅ `adapterName: code-dict`(1순위 YAML이 아니다) · `pathTemplate: src/i18n/{locale}.ts` · keys 9 · `en*,ja,ko` |
| **`baseBranch`가 default branch다** | ✅ 그 리포가 `dev`라 YAML이 `branches: [dev]`로 나왔다 — `main` 고정이면 CI가 영영 안 돈다 |
| **`ts-dict` 수동 지정 → 903키** | ✅ 셀렉트 5갈래 중 "코드 딕셔너리 (여러 언어가 한 파일)" + `src/i18n/namespaces/*.ts` + `en` → **903개 키를 적재했어요**. 후보 선택이 자동 해제됐다(`onFocus`) |
| 수동 지정 YAML 고정 | ✅ 결과 화면과 **설정 화면 둘 다** `adapter: ts-dict`·`base-locale: en`을 싣는다. 자동 후보(`qa-code`)는 `project:`만 — 규칙이 두 코드 경로에서 같다 |
| **OWNER 3개 제한** | ✅ 네 번째 생성이 "프로젝트는 3개까지 만들 수 있어요."로 거부된다 |
| `/projects` 상태 텍스트 | ✅ ready 셋이 "소유자"만 (표시 없음) |
| 설정 5섹션 | ✅ 리포 연결·상태·push 토큰·워크플로·GitHub 계정 |
| 계정 미연결 → [GitHub 연결] → 왕복 | ✅ **T7이 관측했다** (같은 코드). 이 라운드는 이미 연결된 상태라 재현하지 않았다 |
| 첫 적재 실패 후 [다시 시도] | ✅ **T7이 관측했다** (`lastCommitSha`를 null로 되돌려 재적재) |
| `ready`에서 [다시 시도] → `not-awaiting` | ⏭ **UI로 도달 불가** — 성공하면 `revalidatePath`가 버튼을 없앤다. 그것이 설계다 |
| 설치 목록 밖 리포 → `repo-not-installed` | ⏭ **UI로 도달 불가** — 목록이 설치된 리포만 보인다. `onboarding.test.ts`의 "3중 검증 거부 셋"이 덮는다 |
| 남의 리포 owner/repo 직접 전송 → 거부 | ⏭ 같은 이유(Server Action id가 필요하다). 같은 테스트가 덮는다 |
| 워크플로 붙인 뒤 CI push 200 | ✅ **프로덕션에서** `order-check` 200 (`updated: 23`) |
| 야간 pull 순회 | ⏳ 프로덕션 cron (KST 03:00) — `CRON_SECRET`이 Vercel에만 있다 |

⚠️ **결함 0건.** 관측 하나는 남긴다: **903키 프로젝트의 번역 화면이 12.7초**(903행 · input 2711개 ·
네임스페이스 52개)다. CLAUDE.md "키 리스트는 가상화하지 않는다"가 요구한 **관측 조건이 여기서
충족됐다** — 다만 그 화면은 동결분이고 SAAS §8 6단계가 재작성하므로 지금 가상화를 넣지 않는다
(인라인 편집 + 가상 스크롤의 스크롤 튐·포커스 유실을 동결된 화면에 얹으면 버려진다).

⚠️ **`/bugshot-qa`의 이슈 제출은 하지 않았다** — 결함이 없었고, 사용자 지시가 "문제가 있으면
`/refactor` 후 `/push`"였다.

- [x] `/l10n-roundtrip` 재검증 ✅ 2026-09-07 — **스킬 문서는 이미 새 절차로 갱신돼 있었다**(토큰=프로젝트,
      배열 응답, `--project` 필수, `smoke:github <slug>`). 대상은 `order-check`(json-catalog — 재생성 경로이고
      표현 5축이 섞여 있다), dev DB + 로컬 dev 서버.
  - **0 발급**: dev DB의 `order-check`는 `pushTokenHash`가 `null`이었다(T8 판정대로). `generatePushToken`+
    `hashPushToken`으로 발급하고 원문은 셸 env로만 넘겼다 — **`.env.local`은 건드리지 않았다**(dotenv가
    이미 export된 값을 덮지 않는다). 검증 뒤 `null`로 회수했다
  - **1 push**: `200` / `updated: 23` · `translationsFilled: 69` · `orphaned: 0` — **Bearer가 프로젝트를 정하는
    경로가 실물에서 닫혔다**(서버 env 없이)
  - **2 바이트 고정점**: 응답이 **배열**이고 `{"slug":"order-check","status":"skipped","reason":"no-changes"}` —
    2층 blob 비교까지 가서 전 파일 동일. 재생성 writer가 표현 5축을 바이트로 재현한다는 증거다
  - **3 편집 3건 → PR**: 파일 3개 × 네임스페이스 3개, 취약점을 일부러 겨눴다 — `en/buttons.retry`(한 줄
    컨테이너 + `\/` + 값에 `"`·`\`) · `ja/alerts.unsavedChanges`(탭 + 비ASCII 리터럴) ·
    `ko/menu.exportImage`(전 비ASCII `\uXXXX`). 결과: `+1 -1` × 3파일, **hunk 3 = 편집 키 3**, 파일별 규칙이
    각자 지켜졌다(같은 `ko` 파일의 `saveAs`는 `/`가 이스케이프 없이 유지 — en과 규칙이 다르다).
    **PR은 새로 만들지 않고 기존 #4를 재사용**했고 브랜치는 `l10n/sync-order-check`다. orphaned 키
    `smoke.t3`은 export에서 빠졌다
  - **4 머지 → 수렴**: main head가 `[skip-l10n]`을 들고, `l10n/sync-order-check`가 삭제되고, 재pull이
    `no-edits`(1층 스킵 — `lastPulledAt == max(updatedAt)`)
  - **5 CI**: 머지 커밋 `e22d9c84`의 run이 **skipped** — `[skip-l10n]`이 무한 루프를 막는다
  - ⚠️ **부수 확인**: 편집의 `updatedBy`를 일부러 cuid가 아닌 값으로 넣었더니 같은 날 고친 `actorLabel`이
    원문 그대로 냈다 — malmoi#3의 폴백 갈래가 실물에서 밟혔다
  - ⚠️ **같은 리포를 prod `Project`도 가리킨다** — 야간 cron이 prod DB 상태로 그 브랜치를 다시 만들 수
    있다. 폐기용 리포라 무해하지만 검증 대상을 고를 때 알고 있어야 한다
- [x] 문서 (각자 별도 커밋) ✅ 2026-09-07
  - [x] `docs/SAAS.md` — §8 5단계 체크 · **§7.8 조회 방향**(해시가 프로젝트를 정한다) · §5.4.1(`StateDest`) ·
    §7.3("키 수가 큰 쪽을 추천" → "키 수를 보인다, 기준 로케일은 사용자가 고른다") · §8 5단계 "Actions 링크"는
    6단계 이후로 · §8 6단계에 "GitHub 계정 연결 — 연결은 5단계에서 사용자 수준으로 갔다" · §8 7단계 고정 제한에
    "3개 제한은 5단계에서" · §10 "Workflows 권한" 결정(미실측 표기 유지) · §5.7 미종결 둘 종결 · `:122,473,483,545,667`의
    `ACTIVE_PROJECT_SLUG`
  - [x] `CLAUDE.md`·`AGENTS.md`(`pnpm sync:agents`) — 테넌시 행의 `ACTIVE_PROJECT_SLUG` 경고 제거 · 디렉터리 구조에
    `lib/onboarding/`·`lib/push/token.ts`·`lib/push/assemble.ts`·`lib/pull/targets.ts`·`/projects/new` 추가 · 명령어 표의
    `push:local`·`smoke:github` 인자 필수화 · **재발급 절차**의 "세 곳이 같은 값을 들어야 하는 것은 `PUSH_TOKEN` 하나"
    → "대상 리포 secret ↔ 그 프로젝트의 `pushTokenHash`" · `:106`·`:273` · 아키텍처 원칙 코어 모듈 목록에 `onboarding`
  - [x] `.claude/commands/push.md:68` — ARCHITECTURE 트리거 목록에 `lib/onboarding/` — **T5가 이미 넣었다**
  - [x] `docs/ACTIONS.md` — `project` input 설명(409의 기준) · `:13` "`PUSH_TOKEN`은 Vercel env와 같은 값" → "프로젝트
    설정 화면에서 발급" · `:104` 500 `server misconfigured` 진단 줄 제거 · "배포 하나가 프로젝트 하나만 받는다" 경고 제거 ·
    404 진단 줄 제거 · `.github/actions/l10n-push/action.yml:20` input 설명
  - [x] `docs/ARCHITECTURE.md` — §5.5.5(오배송 판정 근거 — 토큰이 프로젝트를 정한다) · 첫 적재 경로(§4) · §6.3에
    `/projects/new`의 이중 `?e=` 읽기 · `:560,565` · 2패스 탐지의 probe 역할 표(§3.1)
  - [x] `docs/ADAPTER-COVERAGE.md` — §19가 그 한 줄이다 (T1이 넣었다)
  - [x] `docs/TASKS.md` — §0에 "T1~T7 dev / T8 남음"을 적었다(**"5단계 완료"라고 쓰지 않았다** — 전환이 남았다) ·
        전역 미결 항목 해소
  - [x] `docs/MVP.md` §7 — "`ACTIVE_PROJECT_SLUG`가 남은 곳은 둘뿐"·"서버가 받는 프로젝트는 여전히 하나" 두 문장을 과거형으로
    (닫힌 스펙이지만 github-connect가 고친 선례)
  - [x] `.env.example` — 블록 제거 · `PUSH_TOKEN` 설명을 "push:local이 보낼 그 프로젝트의 토큰
    원문(로컬 전용)"으로
  - [x] `lib/__tests__/failure.test.ts:21,27,53` — 예시 변수명 교체 (`EXAMPLE_MISSING_VAR`)
  - [x] `.claude/commands/l10n-roundtrip.md` + `.agents/skills/` 미러 — `ACTIVE_PROJECT_SLUG` 절차 제거 · pull 응답 배열
    (`pnpm sync:agents`, 게이트 `pnpm sync:agents:check`)
  - [x] `docs/features/README.md` — 표에 한 줄 · `:43` "결정 셋이 여기에만 있다"를 SAAS로 올렸다고 · 백로그 3·4행 이월 사유
  - `docs/POSTMORTEM.md`는 건드리지 않는다 (append-only). ⚠️ 단 T7이 항목 둘을 **추가**했다 —
        7.2MB 클라이언트 청크와 revalidate가 지운 결과 문구. 그건 `/postmortem`이 한 것이고 이 목록 밖이다
  - [x] `prisma/schema.prisma:14` — 목록에 없었지만 **"두 라우트만 아직 그 값을 본다"가 거짓이 돼 있었다**

검증: `grep -rn ACTIVE_PROJECT_SLUG --exclude-dir=features --exclude=POSTMORTEM.md --exclude=MVP.md .`가
**방어선 테스트 셋만** 남긴다 (`docs/TASKS.md`는 `# 완료 기록` 아래만) · `docs/features/*`·MVP의 언급이 과거형 ·
대상 리포 CI 4개가 전부 green · 야간 pull 응답에 프로젝트가 여럿 나온다 · `pnpm sync:agents:check` green

⚠️ **"0건"을 못 쓴다** (2026-09-07 정정 — T3가 같은 것을 이미 한 번 겪었다). 그 이름을 **들고 있어야 하는**
테스트가 셋이다: `app/__tests__/entry-points.test.ts`(편집 경로가 그것을 안 읽는지) ·
`scripts/__tests__/required-args.test.ts`(CLI·라우트·targets에 소비자가 없는지) ·
`app/api/__tests__/route-diagnostics.test.ts`(그 값이 없어도 두 라우트가 도는지). **지우면 방어선이 함께
사라진다** — 죽은 이름을 검사하는 것이 이 테스트들의 일이다. `lib/__tests__/failure.test.ts`의 예시 이름만
바꿨다(`EXAMPLE_MISSING_VAR` — 아무 이름이든 되는 자리라 grep이 그것을 살아 있는 참조로 세지 않게).

🔨 **2026-09-07 — 문서·설정 정리는 끝났고 전환이 남았다.** 위 문서 블록(체크된 항목)과 `.env.example`·
`prisma/schema.prisma`·`lib/__tests__/failure.test.ts`를 문서별 커밋으로 넣었다. **T8의 앞 여섯 항목과
`/l10n-roundtrip`은 밟지 않았다** — `/ship`이 구조적으로 못 하는 일이다:

| 남은 것 | 왜 파이프라인 밖인가 |
|---|---|
| `pnpm db:deploy` + `db:status:prod` | 프로덕션 DB를 바꾼다 (`/ship` 금지, `/merge` 1단계) |
| `/merge` | 프로덕션 배포 — 브랜치를 나눈 목적이 그 앞에 사람 판단을 두는 것이다 |
| 프로덕션 넷 토큰 발급 + 대상 리포 secret 교체 + CI 트리거 | 외부 리포의 상태를 바꾼다. **전환 중 넷의 CI가 401**이라 한 세션에 붙어 있어야 한다 |
| dev DB 넷 토큰 → `.env.local` | 에이전트가 그 파일을 편집하지 않는다 (CLAUDE.md — 하네스가 전문을 컨텍스트에 넣는다) |
| Vercel 세 스코프 env 삭제 | 프로덕션 설정. 코드가 안 읽으므로 남아 있어도 무해하지만 다음 사람을 오도한다 |
| 실물 왕복 10시나리오 | 프로덕션이 필요하다(preview는 Vercel SSO 뒤다). ⚠️ T7이 **로컬로 그 절반을 이미 밟았다** — 남은 것은 설치 목록 밖 리포·`ts-dict` 수동 지정 903키·남의 리포 직접 전송 거부·CI push 200·야간 pull 순회다 |
| `/l10n-roundtrip` | 폐기용 리포에 실제 PR을 낸다 |

—— `docs(...): ...` (문서별)
