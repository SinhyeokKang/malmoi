# translation-ui — 태스크

> 순서는 **순수 함수 → 껍데기 → UI**다. 커밋 경계는 `——`. 각 태스크에 검증 한 줄. 🔒는 착수 전 사용자 결정(design §11).
> `/tdd interface`가 T1·T2·T4·T4b의 "검증:" 줄을 테스트로 먹고, `/implement`가 나머지를 받는다. **어댑터는 T4b(오류 코드화)만 건드리고
> 출력 바이트는 불변이다** — 그래도 `lib/adapters/**` 변경이라 `/push` 4d의 재측정 판정이 걸린다.

## T0. 결정 — 닫혔다 (2026-09-07, design §11)

- [x] base branch·기준 로케일 변경 필드 — **둘 다 넣는다** (추천과 달랐다 → T2·T8에 항목이 생겼다)
- [x] 어댑터 오류 문구 — **코드로 리팩터** (추천과 달랐다 → T4b가 생겼다, 재측정 포함)
- [x] 멤버 화면 이메일 — 전원 마스킹
- [x] `sonner`·`tw-animate-css`·`components.json` — 마지막 chore에서 사용 0이면 제거
- [x] 모노 폰트 — 시스템 스택 유지

⚠️ 워킹트리에 `lib/push/guard.ts`의 `checkFormat`(다른 창구 작업분, 미커밋)이 있다. T8의 기준 로케일 변경은 그 판정 **위에** 선다 —
그쪽이 먼저 커밋돼야 하고, 이 기능은 그 파일을 건드리지 않는다.

## T1. i18n 기반 — 사전과 함수 셋 (순수)

- [ ] `messages/en.json` 골격 — 화면별 최상위 키(`common`·`signIn`·`projects`·`newProject`·`translations`·`members`·`settings`·`account`·`invite`·`errors`)
      검증: `import en from "@/messages/en.json"`이 typecheck를 지난다
- [ ] `lib/i18n/index.ts` — `export const m = en`, `Messages` 타입. **`@/lib/**` import 0**
      검증: `client-graph.test.ts` green (잎 모듈)
- [ ] `lib/i18n/format.ts` `fmt` — `{name}` 치환, 없는 변수는 토큰 그대로
      검증: `lib/i18n/__tests__/format.test.ts` — 치환·중복 토큰·없는 변수·`{` 리터럴
- [ ] `lib/i18n/plural.ts` `plural` — `one`/`other` + `{count}`
      검증: `plural.test.ts` — 0·1·2
- [ ] `lib/i18n/rich.tsx` `rich` — 문자열/노드 교차 배열
      검증: `rich.test.ts` — 토큰이 처음·끝·연속·없음일 때 빈 문자열 0개, 노드 참조 동일성
- [ ] `lib/i18n/__tests__/no-korean-ui.test.ts` — 주석 벗기기 셋 + 스캔 + **메타 테스트**(각 주석 종류·코드 안 한글 리터럴을 실제로 잡는지)
      검증: 현재 코드베이스에서 **red**다(한글이 아직 있다) — T4~T8이 닫으면서 green으로. 그 전까지 `it.todo`가 아니라 **`it.fails`로 박아** 방향을 고정한다

—— `feat(i18n): add en dictionary and pure helpers`

## T2. 판정 함수 — 번역 화면·Publish·상태 (순수)

- [ ] `lib/keys/view.ts` — `defaultNamespace`·`resolveNamespace`(`"*"`=all, 없는 이름→default)·`filterRows`·`isUnpublished`
      검증: `lib/keys/__tests__/view.test.ts` 확장 — 빈 목록·`*`·낡은 이름·대소문자·상태 필터·`lastPulledAt null`
- [ ] `lib/pull/run.ts` — `PullResult.committed`에 `pr: "created" | "updated"`. 판정은 `findOpenPrUrl` 결과 유무
      검증: `lib/pull/__tests__/run*.test.ts`가 두 갈래를 각자 단언 (기존 PR mock 있음/없음)
- [ ] `lib/pull/message.ts` — 다섯 갈래 · tone `info|success|warning|danger` · 문구는 `m`에서
      검증: `message.test.ts` — 다섯 갈래 tone이 서로 다르다 · warnings ≥1이 `warning` · `skipped`+warnings가 경고를 덧붙인다 · exhaustive
- [ ] `lib/github-connect/state.ts` — `StateDest`에 `{kind:"account"}` + `landing` 갈래
      검증: `state.test.ts` — `account`→`/account`, 옛 `{slug}` 모양은 여전히 `state-mismatch`
- [ ] `lib/routes.ts` — `routes.projects()`·`.newProject()`·`.account()`·`.translations(slug, {ns,focus,q,state})`·`.members(slug)`·`.settings(slug)`·`.invite(token)`. **잎**
      검증: `lib/__tests__/routes.test.ts` — 쿼리 undefined 제거·`*` 인코딩. `entry-points.test.ts` "죽은 라우트 링크"가 이 파일도 읽는다(스캔 대상 추가 + 그 추가를 고정하는 단언)
- [ ] `lib/pull/branch-name.ts` `isValidBranchName` — 잎. git check-ref-format 부분집합
      검증: `branch-name.test.ts` — `main`·`release/1.2`·`Dev` 통과 · 공백·`..`·`~^:?*[`·끝 `/`·`.lock`·빈 문자열 거부
- [ ] `lib/onboarding/base-locale.ts` `planBaseLocaleChange(current, next, locales)` — `noop`·`ok`·`unknown-locale`·`orphaned-locale`
      검증: `base-locale.test.ts` 네 갈래

—— `feat(pull): distinguish created vs updated PR in PullResult` · `feat(keys): namespace landing, row filter, unpublished predicate` · `feat(routes): single source for route links`

## T3. 스키마 — additive 둘 + push `updatedBy`

- [ ] `prisma/schema.prisma` — `Project.lastPublishedAt DateTime?`·`lastPrUrl String?` (주석은 design §5 문장)
      검증: `/db`가 `--create-only`로 SQL 생성 → 눈으로 확인 → dev 적용 → `pnpm db:status` up to date
- [ ] `lib/pull/load.ts` `markPulled` — `committed`일 때 둘을 함께 쓴다, `skipped`는 안 쓴다
      검증: `load.test.ts` — Prisma mock의 `update` 인자 캡처
- [ ] `lib/push/apply.ts` — 번역 upsert `ON CONFLICT … DO UPDATE SET … "updatedBy" = NULL`
      검증: `lib/push/__tests__/flow.test.ts`(SQL 캡처)가 그 문자열을 고정. `authorization.test.ts:223`은 그대로 green
- [ ] `lib/keys/query.ts` — `countUnpublished(prisma, projectId, lastPulledAt)` + `loadMembers` + `loadPendingInvitations` (전부 `projectId`로 좁힌다)
      검증: 하네스(`app/__tests__/harness.ts`)로 세 조회가 다른 프로젝트 행을 내지 않는다

—— `feat(db): record last publish on Project; push clears updatedBy` (스키마+마이그레이션+load+apply 한 커밋 — `/db` 규칙)

## T4. 문구 모듈·진단 문구 — 사전 읽기로 전환

- [ ] `lib/auth/message.ts`·`lib/github-connect/message.ts`·`lib/onboarding/message.ts`(+`ingestHeadline`)·`lib/onboarding/readiness.ts`(`readinessLabel`)·`lib/onboarding/detect.ts`(`formatLabel`) — `satisfies Record<Union,string>`
      검증: 기존 테스트가 문구 상수만 바꿔 green · 갈래 하나를 JSON에서 지우면 typecheck red(한 번 확인하고 되돌린다)
- [ ] 진단 문구 영어화 — `lib/pull/**`·`lib/push/**`·`lib/github.ts`·`lib/auth/profile.ts`·`lib/env.ts`·`lib/github-connect/state.ts`의 `fail()`/`throw` (사전 밖, design §3.1.4)
      검증: `lib/__tests__/failure.test.ts`가 `safe` 메시지 예시를 영어로 갱신 · `no-korean-ui` 스캔 범위에서 이 디렉터리들이 0자
- [ ] `lib/onboarding/workflow.ts` YAML 주석 영어화 + `docs/ACTIONS.md` 같은 커밋
      검증: `workflow*.test.ts`(ACTIONS.md 줄 대조) green
- [ ] `app/layout.tsx` — `lang="en"`, `metadata` 영어

—— `refactor(i18n): message modules read the dictionary; diagnostics in English` · `docs(ACTIONS): workflow comments in English`

## T4b. 어댑터 오류 코드화 + survey 분류기 + 재측정

- [ ] `lib/adapters/types.ts` — `AdapterErrorCode` union(파싱 실패·최상위가 객체 아님·값이 문자열 아님·중복 키·chrome 금지 키·비리터럴·
      shorthand·비프로퍼티·default export 없음·message 필드 없음 … 현재 39곳의 문구를 묶어 **12개 안팎**) + `AdapterError = { path, code, detail? }`
      검증: `pnpm typecheck`가 39곳을 전부 red로 낸다(누락 방지) → 하나씩 코드로
- [ ] 다섯 어댑터 + `json-style.ts` — `message` → `code`(+ 파서 원문은 `detail`)
      검증: `lib/adapters/__tests__/*`의 `errors` 단언을 `code`로 · **출력 바이트 단언은 한 줄도 안 바뀐다** · `contract`·`write-contract`·`key-order-golden` green
- [ ] `lib/i18n/adapter-errors.ts` — `adapterErrorMessage(code)` `satisfies Record<AdapterErrorCode,string>`, 문장은 `messages/en.json`의 `adapterErrors`
- [ ] `lib/survey/one.ts` `classify(code)` — 문구 부분 문자열 → 코드 매핑
      검증: `lib/survey/__tests__` 기존 픽스처의 `ReadErrorKind` 결과 **동일**
- [ ] 온보딩 부분 실패 목록·Publish warnings가 `adapterErrorMessage`를 쓴다(`detail`은 `<details>`)
- [ ] **재측정** — `pnpm adapter-survey docs/features/adapter-generality/repos.txt` + `repos-heldout.txt` (각 `--verdicts`) → ADAPTER-COVERAGE **§20**(14차)
      검증: 전 지표가 13차(§18)와 같다. 다르면 코드화가 판정을 바꿨다는 뜻이라 **머지하지 않는다**

—— `refactor(adapters): error codes instead of free-form messages` · `docs(ADAPTER-COVERAGE): round 14 after error-code refactor`

## T5. 프리미티브 — `components/ui/`

- [ ] shadcn 생성물 4개 삭제 → `Button`(cva: `default`·`confirm`·`danger`·`tertiary`·`link` × `sm`·`md`, `loading`)·`Input`·`Textarea`·`Select`·`Checkbox`·`Radio`·`FormGroup`·`Badge`·`Alert`·`Card`·`Table`·`Breadcrumb`·`Avatar`·`EmptyState`·`DropdownMenu`·`Dialog`·`Tooltip`·`Skeleton` — 치수·색은 DESIGN §6.4
      검증: `pnpm typecheck` · 각 파일의 네 태그가 포커스 링 셋 + `ring-offset-1`을 든다
- [ ] `app/globals.css` — **토큰 값 변경 없음** (색·radius·mono 그대로). 프리미티브가 기존 토큰만 쓴다
      검증: `git diff app/globals.css`가 비어 있다 · `globals-css.test.ts` green
- [ ] `components/__tests__/focus-ring.test.ts` — `ui/` 제외 해제 + "밖의 raw 태그 0개" 단언 + 메타 테스트 갱신
      검증: 이 시점엔 **red**(옛 화면이 raw 태그를 쓴다) — T6~T8이 닫는다. `it.fails`로 박아 둔다
- [ ] `lib/utils.ts` — twMerge 등록 유지 확인(변경 없음)

—— `feat(ui): owned primitives on existing tokens` (ui/ + focus-ring 테스트)

## T6. 셸·전역 화면 — 로그인 · 목록 · 계정

- [ ] `app/(edit)/layout.tsx` — 멤버십 한 번 조회 → `<Sidebar memberships>` + top bar. `redirect()` 둘 유지(2차 방어)
- [ ] `components/shell/sidebar.tsx`(client — `usePathname`·프로젝트 컨텍스트·역할별 항목·collapse `localStorage`) · `top-bar.tsx` · `user-menu.tsx`
      검증: `client-graph.test.ts` green · EDITOR 세션으로 Members·Settings가 렌더되지 않는다(실물)
- [ ] `app/page.tsx` — 2열 로그인(DESIGN §9.2·design §3.12), `?error=` Alert, 장애 문구
- [ ] `app/(edit)/projects/page.tsx` — 행 구조 + EmptyState + `?e=` global Alert(두 union)
- [ ] **`app/(edit)/account/page.tsx`**(신설, `requireUser`) — `/projects`의 GitHub 계정 섹션(리뷰 🟡9가 붙인 것)을 여기로 옮긴다. 해제는 **기존** `disconnectGithub()`(`projects/actions.ts`, `requireUser`) 그대로 · `startGithubConnectForUser`에 `dest` 인자
- [ ] `middleware.ts` matcher에 `/account/:path*`
      검증: `entry-points.test.ts` (11)번 matcher 커버 green · 기존 해제 테스트 유지 · `/api/github/callback`이 `account` dest를 `/account`로 착지
- [ ] `components/github-account.tsx` 이관(계정 화면용) · 설정 화면의 계정 섹션은 한 줄 + 링크로

—— `feat(shell): sidebar, top bar, sign-in and project list on the new design` · `feat(account): user-level GitHub connection page`

## T7. 번역 화면 + Publish

- [ ] `app/(edit)/projects/[slug]/translations/page.tsx` — `resolveNamespace` 기본 착지 · 네임스페이스 패널 · 툴바(필터 `?q=`·`?state=`·Last sent 링크) · 표(`Table` + `Textarea`) · 배지 · orphaned 열 배지 · `countUnpublished`
      검증: 실물 903키 프로젝트 첫 착지 **< 2초** (`/bugshot-qa`, 12.7초 대비) · `?ns=*`로 전체
- [ ] `components/translation-input.tsx` — `Textarea` · `role="status"` · 실패 시 `focus()` · "Saved" 1.5초 뒤 소거 · 문구 `m`
      검증: 소스에 `role="status"`·`aria-live` · 실물에서 저장 실패 유발(오프라인) 후 포커스가 셀에 있다
- [ ] `components/publish-button.tsx`(옛 `pull-button` 대체) — `Publish ({n})` · 결과 `Alert` 다섯 갈래 · 성공 후 `router.refresh()` · Alert는 readiness 분기 밖
      검증: `pullMessage` 다섯 갈래가 각자 다른 Alert variant로 매핑되는 표를 소스에서 센다(단위) · 실물에서 연속 두 번 눌러 둘째가 "Nothing to publish"
- [ ] 편집 손실 배너 — `Alert warning`, `sessionStorage` 닫기
      검증: 미배포 0이면 DOM에 없다(실물)
- [ ] `components/invite-form.tsx` 삭제 (T8이 대체 화면을 만든 뒤 같은 커밋에서)

—— `feat(translations): namespace landing, filters, publish states, edit-loss banner`

## T8. 멤버 · 설정 · 새 프로젝트 · 초대 수락

- [ ] **`app/(edit)/projects/[slug]/members/page.tsx`**(신설, `requireProjectAccess(translation:write)`) — 멤버 목록·역할 셀렉트·제거(`Dialog`)·초대 인라인 폼·대기 초대 목록·[Revoke]
- [ ] `app/(edit)/projects/actions.ts` — `revokeInvitation({slug, invitationId})`(`member:manage`, `projectId`로 좁힌 `deleteMany`)
      검증: `membership.test.ts` — 다른 프로젝트의 초대 id를 넘기면 0행 삭제 · EDITOR는 `forbidden` · 마지막 OWNER 강등 문구가 반환값에 있다
- [ ] `app/(edit)/projects/[slug]/settings/page.tsx` — settings-block 넷 + 계정 한 줄. `FirstIngestRetry`는 분기 밖 유지
- [ ] Repository 블록의 **base branch·기준 로케일 폼** + `updateRepositorySettings({slug, baseBranch, baseLocale})`(`project:settings`,
      `Locale.isBase` 스왑 한 트랜잭션, 결과에 재생성 YAML) + 블록 안 `Alert warning`("Update the workflow — CI pushes are rejected until then")
      검증: 하네스 — 저장 뒤 `isBase`가 정확히 하나 · orphaned 로케일은 `orphaned-locale` 거부 · EDITOR는 `forbidden` · 실물 — 저장 뒤 Workflow
      블록의 `base-locale:`·`branches:` 줄이 바뀐다 · **폐기용 리포에서 옛 `base-locale`로 CI를 한 번 돌려 409를 눈으로 본다**
- [ ] `app/(edit)/projects/new/page.tsx` + `components/onboarding/*` — 상태 기계 그대로, `FormGroup`·`Card`·`Radio`·`EmptyState`로 · 부분 실패 목록 "Could not read {path}" + `<details>` 원문 · `rich`로 쪼개진 문장 다섯 정리
      검증: `client-graph.test.ts` green(어댑터 라벨은 여전히 서버가 내려준다) · 실물 ②~⑥ 한 바퀴(폐기용 리포)
- [ ] `app/invite/[token]/page.tsx` — 셸 밖 카드, 분기별 Alert, provider 버튼은 `Button default`
- [ ] 이 시점에 **T1의 `no-korean-ui`·T5의 `focus-ring`을 `it.fails` → `it`로** 되돌린다
      검증: `pnpm test` 전체 green · `pnpm build` · `.next/static/chunks`에 1MB 넘는 청크 없음

—— `feat(members): members page with invitations` · `feat(settings,onboarding,invite): rebuild on primitives` · `test: promote i18n/focus-ring scanners to green`

## T9. 문서·정리·검증

- [ ] `docs/SAAS.md` §8 6단계 체크 + §3 표의 "화면이 없다" → 설정 Repository 블록 + §10에 ko 미결 한 줄
- [ ] `docs/ARCHITECTURE.md` — §6.35에 `lib/i18n`·`lib/routes` 잎 추가 · 새 절 "UI 문자열 경계"(design §3.1.4) · `updatedBy` 의미(push가 비운다) · §1에 `AdapterError.code` · 기준 로케일 변경과 `checkFormat`의 관계(design §3.13)
- [ ] `docs/features/README.md` — translation-ui 행 추가, `translation-input` a11y 항목·GitHub 해제 항목 닫음
- [ ] `CLAUDE.md` — 디렉터리 구조(`messages/`·`lib/i18n/`·`lib/routes.ts`·`components/ui/` 소유·`components/shell/`·라우트 둘) · 스택 표(팔레트·프리미티브) · "가상화하지 않는다" 절에 착지 결과 실측 추가
- [ ] `README.md` 요약 미러
- [ ] chore — `sonner`·`tw-animate-css` 사용 0이면 제거, `components.json` 판정
- [ ] `/bugshot-qa` 한 바퀴 — user-stories §1~§8 순서 + EDITOR의 members·settings URL 직접 진입(`not-found`) + 저장 실패 포커스 + Publish 다섯 갈래 중 넷(실패는 토큰 회수로 유발)
      검증: 이슈 0건 또는 전부 닫힘
- [ ] `/db` → `/push` → `/merge`(`db:deploy` 1단계)

—— 문서별 커밋(`docs(SAAS): …`·`docs(ARCHITECTURE): …`·`docs(CLAUDE): …`·`docs(feature): …`) · `chore: drop unused ui deps`

## 검증이 원리적으로 못 보는 것 — 실물로만

| 결함 부류 | 어느 게이트도 못 본다 | 실물 확인 |
|---|---|---|
| 첫 착지 시간 | 렌더 시간은 테스트에 없다 | 903키 프로젝트 DevTools Performance |
| 포커스 복귀·`aria-live` 읽힘 | 소스 스캔은 속성 존재만 본다 | 키보드 + VoiceOver 한 번 |
| Alert가 revalidate에 씻기지 않는가 | 언마운트 타이밍 | Publish 뒤 Alert가 남아 있는가 |
| 사이드바 역할별 노출 | 렌더 테스트 없음 | EDITOR 세션 |
| 색 대비 실물 | 토큰은 그대로지만 사이드바가 muted 표면이 되어 §2.2 자리가 늘었다 | 사이드바 비활성 항목·표 헤더·칩 |
