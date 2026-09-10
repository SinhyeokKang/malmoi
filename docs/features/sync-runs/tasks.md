# sync-runs — 태스크 (ship 단위)

규칙은 `docs/TASKS.md`와 같다: **검증 조건이 실제로 통과했을 때만** 체크한다. `——`가 커밋 경계다.
`[manual]`은 눈·명령으로 하는 검증이다. 🔒 결정은 2026-09-10 리뷰에서 전부 닫혔다(design §0.1).

**번호가 실행 순서다.** 근거: ship 1이 순수 판정을 세우고(전부 I/O 0), ship 2가 그 위에 스키마와 껍데기를
얹고, ship 3이 화면을 낸다. **역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.**

⚠️ **ship 2가 유일하게 마이그레이션을 든다** — `/db`가 그 자리에 있고 `/merge` 1단계의
`pnpm db:deploy`가 따라온다. ship 1·3은 스키마 0줄이다.

---

## ship 1 — 순수 판정 (스키마·I/O 0줄)

- [x] **T1** `/tdd interface` — `lib/sync/plan.ts` + `lib/auth/invitation.ts` + `lib/failure.ts`
  - `planSyncStart`: `already-running` → `too-soon` 순서 · **stale**(`startedAt < now - 300s`)은 실행 중으로 안 치고
    `ok` + `staleToClose: true` · **`too-soon`은 `trigger: "cron"`에 안 걸린다** · `lastSettled: null`(직전이 FAILED)이면
    안 걸린다 · `retryAfterSeconds`가 `PUBLISH_MIN_INTERVAL_SECONDS - 경과`로 나온다
  - `planSyncFinish`: `committed`/`skipped`/`{thrown}` 셋이 `SUCCEEDED`/`SKIPPED`/`FAILED` · **`skipped`가
    `SUCCEEDED`로 접히지 않는다** · `warnings`가 `skipped`에도 센다 · `prUrl`은 committed에만 · `changed`는 failed에서 null
  - `classifySyncError`: `AppError`의 `code`가 그대로 나온다 · `code` 없는 `AppError`는 `unknown` · octokit
    `RequestError` → `github-error` · Prisma 오류 → `db-unavailable` · `retryable`이 갈린다(`not-installed` false,
    `db-unavailable` true) · `safeMessage`가 `classifyFailure`의 판정과 같다
  - `planInvitationCreate`: 9 → ok, 10 → `member-limit`(`limit: 10`)
  - **`lib/pull` throw 자리 전수가 `code`를 든다** — `run.ts`·`plan.ts`·`trigger.ts`의 `fail(` 호출을 소스로 센다.
    ⚠️ **"코드 없는 것이 0"으로는 못 만든다** — design §1.3이 union을 일곱으로 묶고 "생산자 없는 코드는
    두지 않는다"고 못박아서, 불변식 위반(`unreachable:`)과 readiness가 이미 막는 설정 부재 열하나에는
    줄 이름이 없다. 그래서 **양쪽을 고정한다**: 코드를 드는 자리 넷 + 안 드는 자리 열하나를 이름으로 박고,
    어느 목록에도 없는 `fail(`이 0. 새 자리는 둘 중 하나를 골라야 red를 벗는다 (`entry-points.test.ts` 형)
  - `STALE_AFTER_SECONDS > 60`
  - 검증: `pnpm test` red(모듈 부재 2 + 단언 실패 6) — `cabf8e3`
- [x] **T2** `lib/sync/plan.ts`(판정 셋 + 상수 셋) · `lib/auth/invitation.ts`(`MEMBER_LIMIT` + `planInvitationCreate`) ·
      `lib/failure.ts`(`AppError`에 `code?`, `fail`에 둘째 인자) · `lib/pull/{run,plan,trigger}.ts`의 `fail(` 셋에 코드
  - ⚠️ **`classifyFailure`를 고치지 않는다** — 축이 다르다(design §1.3). 새 함수가 그것을 **부른다**
  - ⚠️ **`runPull`의 분기·순서·값은 그대로다** — 바뀌는 것은 `fail(...)`의 둘째 인자뿐. `run.test.ts` 전부 green이 그 증거
  - ⚠️ `PROJECT_LIMIT`을 옮기지 않는다 — 상호 참조 주석만
  - 검증: T1 green + `run.test.ts` 변경 0줄로 green — `d47c371`
- [x] **T3** `pnpm typecheck && pnpm test` — 2,309 passed
- [x] `——` `test:` → `feat:` 두 커밋 (+ `/code-review` 🟡 하나로 `refactor:` `6c43d15` — 스캐너가 주석을 벗긴다)
- [x] **T4** `/push` — `f0db7f4`, CI green

---

## ship 2 — 테이블과 껍데기 (⚠️ 마이그레이션)

⚠️ **순서가 T1(스키마)·T2(`/db`)가 앞이다** — 하네스가 `PrismaClient` 타입을 `@/generated/prisma/client`에서
가져오므로 `syncRun` 델리게이트는 `db:generate` 뒤에야 typecheck를 지난다. vitest는 타입을 벗겨 red는 되지만
`pnpm typecheck`는 생성 뒤에 본다.

- [x] **T1** `prisma/schema.prisma` — `SyncRun` + `SyncStatus`·`SyncTrigger` enum + `Project.archivedAt` +
      `User.syncRuns`(FK `SetNull`). **전부 additive, `type` 컬럼 없음**
  - 검증: `migration.sql`에 `DROP`·`ALTER COLUMN` 0건 — `fcf93f1`
- [x] **T2** `/db` — `20260910012114_add_sync_run`, dev 적용. `anon`·`authenticated` 권한 **dev 0 / prod 0** 실측
  - ⚠️ **새 테이블이므로 `anon`·`authenticated` 권한 0을 확인한다** (`/db` 5단계 — `supabase_admin`
    default ACL이 남아 있어 **대시보드 경로로 만든 테이블은 열린 채 태어난다**. Prisma가 만드는 것은
    안 열리지만 그 검사가 이 경로의 유일한 방어선이다, sec-audit 발견 8)
- [x] **T3** `/tdd interface` — 하네스로 배선을 박는다
  - **하네스 보강**: `syncRun` 델리게이트(create·findFirst·findMany·update·updateMany — **`where.projectId`를 실제로
    본다**, 안 보면 "다른 프로젝트의 실행이 내 것을 막지 않는다"가 무엇을 넣어도 통과한다) + `$transaction` 스냅샷
    목록에 `syncRun` 배열(없으면 롤백 테스트가 공허하다) + 시드 프로젝트에 `lastPublishedAt`·`lastPrUrl` 값(없으면
    "안 움직인다"가 `undefined === undefined`) + `harness.test.ts`에 `syncRun` 자기검사(projectId 좁힘·롤백).
    ⚠️ `$transaction`·`$executeRaw`는 **이미 있다** — 더하는 것은 위 넷뿐
  - `runSync`: 게이트 통과 → `RUNNING` 행 → `triggerPull` → 행 닫기가 **한 번씩** · `finishedAt`이 세 terminal 전부에 선다
  - **동시성 — `Promise.all`로 재지 않는다**(하네스 `$transaction`은 직렬화가 없다, POSTMORTEM 2026-09-05):
    (a) `triggerPull` mock을 deferred로 두고 첫 호출이 `RUNNING` 행을 만든 뒤 두 번째 호출 → `{status:"failed",
    error:"already-running"}`, deferred 해소 → `triggerPull` 호출 **1회** (b) `spies.executeRaw`의 SQL이
    `/"Project"[\s\S]*FOR UPDATE/`이고 `invocationCallOrder`가 `syncRun.create`보다 앞 (c) `$transaction` 콜백
    안에서 `triggerPull`이 **안 불린다**(잠금 안 GitHub 금지)
  - **stale 복구**: `startedAt`이 301초 전인 `RUNNING` 행 → 그 행이 `FAILED`/`errorCode:"stale"`/`finishedAt`으로 닫히고
    새 행이 `RUNNING`. 299초 전이면 `already-running`
  - **다른 프로젝트의 `RUNNING`이 내 것을 막지 않는다**
  - **행 insert가 던지면** 행도 잠금도 없고 `triggerPull` 0회
  - **실패해도 `lastPulledAt`·`lastPublishedAt`·`lastPrUrl`이 안 움직인다** — `spies.updateProject` 호출 인자에 세 키가
    없음을 단언(완료 조건 2 — `run.test.ts`의 단언을 껍데기 층에서 다시 건다. `triggerPull`을 mock하는 이상 이 단언이
    보는 것은 "껍데기가 `Project`를 안 쓴다"까지다)
  - `too-soon`: 직전 `SUCCEEDED` 행이 10초 전 → `retryAfterSeconds: 20` / 직전이 `FAILED` → 통과 / cron → 통과
  - `selectPullTargets`: `archivedAt !== null`을 **거른다** · **마지막 `SyncRun.startedAt`이 오래된 것부터**(없으면 맨 앞,
    동점 slug) · `limit` 뒤 `unprocessed` 그대로
  - **보관**: `planProjectAccess(member, permission, archivedAt)`가 `project:settings` 외 전부를 `archived`로 ·
    `saveTranslation`·`triggerPullAction`이 `archived`로 거부 · `archiveProject`/`unarchiveProject`가
    `getProjectAccess(` + `revalidatePath("/", "layout")` 인자 단언(`onboarding.test.ts` 선례) · `createProject`의
    OWNER 재집계가 보관 프로젝트를 안 센다 · `checkArchived`(`lib/push/guard.ts`) → 409
  - **멤버 제한**: `createInvitation`이 멤버 10명에서 `member-limit` 거부, 잠금 안(`executeRaw`가 `count`보다 앞)
  - `publish-failure.test.ts`의 `{status:"failed", error}` **두 필드**(`toEqual`)와 `route-diagnostics`의
    `{results, unprocessed}`가 그대로 green
    ⚠️ **응답 계약은 그대로지만 `route-diagnostics`의 mock 대상은 옮겼다** — 라우트가 `triggerPull`이 아니라
    `runSync`를 부르므로 그 파일이 `@/lib/sync/run`을 mock한다. 안 옮기면 그 테스트가 게이트·행까지
    흉내내야 하고, 그것은 `sync-run.test.ts`가 실제 하네스로 이미 재는 것의 두 번째 벌이 된다.
    같은 이유로 push 픽스처에 `archivedAt: null`을 더했다(빼면 가짜가 실제보다 **엄격**해 정상 push가 409다)
  - 검증: `pnpm test` red(19건) — `1881b68`
- [x] **T4** `lib/sync/run.ts` — `runSync(prisma, { projectId, slug, trigger, requestedBy }): Promise<PullOutcome>`
  - ⚠️ **던지지 않는다** — 실패도 게이트 거부도 `PullOutcome`(design §5)
  - ⚠️ **잠금 트랜잭션 안에서 GitHub을 부르지 않는다** (design §3) — 트랜잭션은 stale 닫기 + 행 생성까지
  - `server-only` 없음(하네스가 직접 부른다)
  - 검증: T3의 `runSync` 케이스 green(18/18)
- [x] **T5** 진입점 둘을 `runSync`로 — `triggerPullAction`(`manual`, `requestedBy` 있음) · `/api/pull`(`cron`, null)
  - `/api/pull`의 `select`에 `archivedAt` + 최근 `syncRuns`(`take: 1`, `select: startedAt`) — `selectPullTargets` 입력 확장
  - `app/(edit)/projects/[slug]/translations/page.tsx`에 **`export const maxDuration = 60`**(design §1.4 —
    없으면 `STALE_AFTER` 전제가 수동 경로에서 거짓)
  - `lib/pull/message.ts`에 `isSyncGateError` + `pullMessage` 갈래(tone `info`, `retryAfterSeconds` 보간) —
    `message.test.ts`의 "문구·tone" 개수 단언 갱신
  - ⚠️ **`/api/pull` 응답에 `unprocessed`가 그대로 남는다**(sec-audit 발견 26)
  - 검증: T3 green + `route-diagnostics`·`publish-failure`·`message.test.ts` green
- [x] **T6** 보관 — `lib/auth/access.ts`에 `archived` 갈래 · `getProjectAccess`의 `select`에 `archivedAt` ·
      `ACCESS_ERRORS`에 `archived` · `archiveProject`·`unarchiveProject` Server Action(`project:settings`) ·
      `lib/push/guard.ts` `checkArchived` + `/api/push` 409 · `createProject` 분자에서 archived 제외 ·
      `loadMemberships`가 `archivedAt`을 낸다
  - 검증: T3의 보관 케이스 green + `entry-points.test.ts` green(새 Action 둘이 `getProjectAccess(`를 든다)
- [x] **T7** 멤버 제한 — `createInvitation` 잠금 안 `projectMember.count` → `planInvitationCreate` · `InviteError`에
      `member-limit` · `messages/en.tsx` 문구(`limit` 보간)
  - 검증: T3의 멤버 제한 케이스 green
- [x] **T8** `pnpm typecheck && pnpm test && pnpm build` — 2,373 passed
- [x] `——` `chore(db):` `fcf93f1` → `test:` `1881b68` → `feat:` `8ff8d28` (+ `/code-review` 🟡 셋으로 `refactor:` `7e8fd67`)
- [x] **T9** `/push` — `5171e25`, CI green. ⚠️ **`/merge`는 남았고 1단계의 `pnpm db:deploy`가 필수다**

---

## ship 3 — 화면 (`logs` + 보관 상태 + 보관 카드)

- [x] **T1** `/tdd interface`
  - `lib/sync/view.ts`(⚠️ `@/generated/prisma/client`는 **`import type`만** — `client-graph`가 센다. 상대 시각은
    `lib/relative-time.ts` 재사용): 행 → `{ tone, label, triggerLabel, reasonKey }` — tone 타입이 `Badge` variant union과
    같은 이름 · SUCCEEDED·SKIPPED·RUNNING = `muted`, FAILED = `danger` · `skipped` 라벨이 "Nothing to send" ·
    cron → "Nightly", `requester: null`(삭제됨) → "Removed user" · `encodeCursor`/`decodeCursor`(`startedAt`+`id`,
    **무효 입력 → null**, 500 아님)
  - `lib/shell/__tests__/nav.test.ts` 갱신(**red-before**): 키 배열 OWNER 6·EDITOR 5, `exact` 루프에 `logs: true`,
    href `/projects/<slug>/logs`, 아이콘 `History`
  - `lib/__tests__/routes.test.ts`: `routes.logs(slug, { cursor })` — 페이지와 **같은 커밋**
  - `components/__tests__/logs-screen.test.ts`(소스 스캔): 빈 상태가 `EmptyState`를 표 **대신** 반환 · 페이지에
    `try`가 없다(조회 실패는 throw — "없음"과 다른 모양, POSTMORTEM 2026-09-03) · `logs`에 [Send changes]·
    `PublishButton` import가 없다(8단계 경계) · "Older" 링크가 `routes.logs`를 지난다 · `<time dateTime` 이 있다 ·
    `logs.reasons`가 `satisfies Record<SyncErrorCode | "fallback", string>`
  - `components/__tests__/home-screen.test.ts`의 `SITES`에 `logs/page.tsx` 추가(안 넣으면 조용히 미검사)
  - `components/__tests__/translations-screen.test.ts`: 보관 카드가 readiness 분기 **밖**의 형제 · 카드에 결과
    `Alert` 없음 · Dialog 확인 버튼이 `danger`
  - 검증: `pnpm test` red(16건) — `b8fe1c7`
- [x] **T2** `lib/routes.ts`에 `logs(slug, { cursor? })` + `app/(edit)/projects/[slug]/logs/page.tsx` +
      `lib/sync/query.ts`(server-only — `loadSyncRuns(projectId, cursor, take: SYNC_LOG_PAGE_SIZE + 1)`, `requester` 조인)
  - 인가 `translation:write` (design §6 — OWNER 전용이 아니다). **matcher 변경 0** — `/projects/:path*`가 이미 덮는다
  - 검증: T1의 routes·logs-screen green + `entry-points.test.ts` green(쿼리 키 `cursor` 대조)
- [x] **T3** 사이드바 — `lib/shell/nav.ts` `projectSections`에 `logs`("Logs", `History`, `exact: true`, `canPerform` 뒤 아님) +
      `messages/en.tsx` nav 라벨 + `nav.ts` 주석("Logs는 없다") 삭제
  - 검증: T1의 nav.test.ts green
- [x] **T4** `components/project-archived.tsx`(`project-not-ready.tsx` 형 — OWNER는 설정 안내, 나머지 `EmptyState` 한 줄) +
      Home·translations·locales·members·logs 페이지가 `archived`에서 그것을 반환 · `/projects` 목록·스위처에 "Archived" 배지
  - 검증: `app/__tests__/screens.test.ts`가 다섯 화면을 **소스로** 센다 — `ProjectArchived`를 반환하는지와
    **그 분기가 프로젝트 조회보다 앞인지**(뒤면 그 데이터가 이미 RSC 페이로드에 실린다). 설정 화면엔
    그 분기가 **없어야** 한다는 것도 함께 본다(`project:settings`가 되돌리는 길이다).
    ⚠️ **`[manual]` 눈 검증은 T10에 남아 있다** — 값 반환이라 호출부가 빠뜨리면 화면이 **정상 렌더**되고,
    스캔이 그것을 막지만 문구·링크가 실제로 맞는지는 눈이 봐야 한다
- [x] **T5** `components/settings/archive-card.tsx` — settings-block 여섯째(맨 아래). Dialog 본문에 열린 PR 링크(서버가
      `findOpenPrUrl` 한 번, 실패는 "Couldn't check open PRs" 한 줄) · 확인 `danger` "Archive project" · 보관 상태면
      [Restore project] 무확인 · **인라인 결과 Alert 없음**
  - 검증: T1의 translations-screen 케이스 green
- [x] **T6** `messages/en.tsx` — `logs.*`·`archive.*`·`publish.gate.*`·`access.archived`·`invite.memberLimit` 전부.
      ⚠️ **소스에 한글 UI 리터럴 금지**
  - 검증: `no-korean-ui` green
- [x] **T7** `pnpm typecheck && pnpm test && pnpm build` — 2,416 passed
- [x] `——` `test:` `b8fe1c7` → `feat:` `82ffb03` (+ `/code-review` 🟡 셋으로 `refactor:` `086b056`)
- [x] **T8** 문서 — 전부 같은 커밋 묶음
  - `docs/SAAS.md` §8 7단계 체크 + §7.7 라우트 표 `logs` ⬜ → ✅ + **§8:1033·1038·1046-1048 갱신**(`type`·`idempotencyKey`
    후속 / cron 면제 등재 / Home 교체·`needs_configuration` 후속으로) + §7.9 "편집·sync·push 중단"
  - ~~`docs/ARCHITECTURE.md` — 동시 실행 계약(행 잠금·stale 닫기) · 보관 갈래 · 오류 코드 태깅~~ —
    **ship 2가 §5.6으로 썼다**(그 계약이 ship 2에 전부 실렸고 ship 3에서 안 바뀐다). ship 3은 `logs` 화면만 더한다
  - ~~`CLAUDE.md` 디렉터리 구조 `lib/sync/` + `.claude/commands/push.md` 4단계 트리거~~ — **ship 1이 했다**
    (`/push` 4단계의 "`lib/` 하위에 새 디렉터리가 생기면 이 줄에 추가한다"가 그 디렉터리가 생긴 푸시에서
    발화한다. 미루면 ship 2·3이 트리거 목록이 틀린 채 지나간다). ship 3은 `plan.ts` 외 셋을 항목에 더한다
    → `pnpm sync:agents` 커밋
  - `docs/DESIGN.md` — §6.2 배지 표(sync 4종) · §6.6 settings-block 여섯 · §6.8 아이콘 표 `History` · §6.68 logs 화면
  - `docs/features/README.md` 표 행 + "logs 하나만 남았다" 문장 · 루트 `README.md` 현 단계 선언
- [x] `——` 문서 커밋(문서별 — SAAS·DESIGN·CLAUDE·features README·README)
- [ ] **T9** `/push` → `/merge`
- [ ] **T10** `[manual]` 실물 (`i18n-order-check`) — ⚠️ **프로덕션 배포 뒤에만 가능하다**(cron·CI push가 대상이다)
  - **두 탭 Publish 연속 클릭**: `gh pr view --json commits` 개수가 1 늘고 sync 브랜치 head가 한 번만 바뀐다 ·
    `logs`에 SUCCEEDED 1행, FAILED 0행 · 둘째 탭에 `info` Alert "Already sending"
  - **보관 뒤 야간 cron**: 같은 밤 **비보관 대조 프로젝트**에 `CRON` 행이 있고 **동시에** Vercel 로그 `[pull] targets=…`에
    보관 slug가 없다. ⚠️ "logs가 비어 있다"만으로는 cron 미실행과 구별 불가(POSTMORTEM 2026-09-03)
  - **보관 중 CI push**: 대상 리포 Actions가 409 `archived`로 red

---

## 후속으로 남기는 것 (이번 범위 밖 — SAAS §8 갱신에 같이 적는다)

- **`Home`의 최근 활동을 `SyncRun`으로 늘린다** (SAAS §8:1046이 7단계에 뒀던 줄)
- **push를 `SyncRun`에 넣는다** — 그때 `type`·`idempotencyKey`가 의미를 갖는다(같은 커밋의 Re-run)
- **`needs_configuration`** — 로케일 파일 소실 시 자동 재탐지 금지 (SAAS §8:1037)
- **`SyncRun` 보존 기간** — 행이 쌓이는 속도를 한 달 관측한 뒤
- `lib/push/apply.ts` 상단의 pooler 주석 표현 정정(트랜잭션 밖 문장에 대한 것임을 명시) — 이 기능과 무관
