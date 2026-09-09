# sync-runs — 설계

## 0. 영향 받는 흐름

**pull 하나에 보관 판정이 얹힌다.** push(`/api/push`)는 보관 409 한 갈래만 얻고, 편집 UI의 저장은 보관 거부만 얻는다.

```
편집 UI [Send changes] ─┐
                        ├─→ 진입점 (인가 → readiness) ─→ runSync ─┬─ planSyncStart (게이트, 순수)
Vercel Cron /api/pull ──┘                                         ├─ 잠금 tx: stale 닫기 + RUNNING 행
                                                                  ├─ triggerPull → runPull  (판정층 불변)
                                                                  └─ planSyncFinish → 행 닫기
```

⚠️ **`runPull`의 판정 로직은 한 줄도 안 바꾼다.** 1층 스킵(`shouldSkipPull`)·2층 blob 비교·
`captured = maxUpdatedAt`이 전부 그대로다. 새로 생기는 것은 **그 바깥의 껍데기**다 —
"돌려도 되는가"와 "무엇으로 끝났는가"만 더한다. **허용하는 유일한 변경은 오류 코드 태깅이다**(§1.3) —
`throw fail(...)` 자리에 `code`를 하나 더 넘기는 것이고 분기·순서·값은 안 움직인다.

### 0.1 리뷰 결정 (2026-09-10 `/feature-review`)

| # | 결정 | 근거 |
|---|---|---|
| 1 | 보관은 **`ProjectAccess`의 `archived` 갈래**로 거부한다. 목록에서 숨기지 않고 배지 | 숨기면 unarchive에 도달할 링크가 없다. 인가 union에 두면 페이지·Action 전부가 한 자리에서 거부되고 `entry-points`가 센다 |
| 2 | 오류 코드는 **`AppError`의 선택 `code`**로 던지는 자리가 든다. 문자열 매칭 금지 | pull 실패는 전부 메시지만 다른 `AppError`라 매칭은 문구 하나에 무너진다 |
| 3 | `MEMBER_LIMIT = 10`을 **`createInvitation`의 잠금 안에서 강제**한다 | 소비자 0인 상수는 두지 않는다 |
| 4 | **`type` 컬럼 없음** | `idempotencyKey`를 뺀 규칙과 같다 |
| 5 | 게이트 거부는 **`{status:"failed", error:<gate code>}`** 토큰 + Alert tone `info` | `header.tsx`의 refresh 분기(`status !== "failed"`)가 그대로 맞는다. `danger`는 `role="alert"`라 과하다 |
| 6 | **행은 시작한 실행에만.** 게이트 거부는 행 없음. stale은 `FAILED`/`stale`로 **닫는다** | 규칙 하나. 영구 RUNNING이 안 남는다 |
| 7 | `too-soon`은 **직전 SUCCEEDED·SKIPPED의 `finishedAt`** 기준, FAILED는 안 센다 | 제한의 목적은 "리포에 두 번 쓰기" 방지이지 재시도 억제가 아니다 |
| 8 | `requestedBy`에 **FK `onDelete: SetNull`** | `updatedBy`가 FK를 못 가진 사정(옛 핸들 혼재)이 새 테이블엔 없다 |
| 9 | 보관 중 **CI push는 409** | 보관의 뜻이 "멈춘다"이고 리포가 계속 덮으면 보관 중 번역이 조용히 바뀐다 |
| 10 | 보관은 **`PROJECT_LIMIT` 슬롯을 비운다** | `project-onboarding/spec.md`가 그 이유로 이 단계에 넘겼다 |
| 11 | cron 아사는 **정렬**로, `needs_configuration`은 **비목표** | spec 비목표 |
| 12 | 보관은 **Dialog 확인** + 열린 PR은 서버가 한 번 조회해 링크로 | 전 멤버 편집 중단이라 확인이 맞고 §7.9가 그 자리에서 알리라 한다 |
| 13 | 모듈은 **`lib/sync/plan.ts` 하나** (+ `query.ts`·`run.ts`·`view.ts`) | 이 리포는 상수를 소비자 옆에 두고 모음 파일이 없다 |
| 14 | 페이지네이션은 **서버 `?cursor=` + "Older"**, 사이드바는 **"Logs" + `History`** | 클라이언트 상태 0 |

## 1. 순수 함수로 분리 가능한 부분 (= `/tdd` 대상) — `lib/sync/plan.ts`

**여기가 이 설계의 무게중심이다.** 아래 셋은 I/O가 없고 한 파일에 있다. 상수 셋도 여기다.

```ts
export const PUBLISH_MIN_INTERVAL_SECONDS = 30
export const STALE_AFTER_SECONDS = 300   // 60(maxDuration)의 5배 — §1.4
export const SYNC_LOG_PAGE_SIZE = 20
```

`PROJECT_LIMIT`은 `lib/onboarding/create-plan.ts`에, `MEMBER_LIMIT`은 `lib/auth/invitation.ts`에 —
**소비자 옆**이다. 여기 주석으로 상호 참조만 건다.

### 1.1 `planSyncStart` — 실행해도 되는가

```ts
planSyncStart(input: {
  now: Date
  running: { startedAt: Date } | null              // status RUNNING인 최신 행
  lastSettled: { finishedAt: Date } | null          // status ∈ {SUCCEEDED, SKIPPED}인 최신 행 — FAILED는 안 준다
  trigger: "manual" | "cron"
}):
  | { status: "ok"; staleToClose: boolean }
  | { status: "already-running" }
  | { status: "too-soon"; retryAfterSeconds: number }
```

- **`archived`는 여기 없다** — 인가가 먼저 거른다(§4). 게이트는 인가를 지난 요청만 받는다.
- **`already-running`은 `stale` 판정을 낀다.** `running.startedAt`이 `now - STALE_AFTER_SECONDS`보다
  오래됐으면 실행 중으로 치지 않고 `ok` + `staleToClose: true`를 낸다 — 껍데기가 그 행을 닫는다(완료 조건 3).
- **`too-soon`은 `trigger === "manual"`에만 건다.** cron은 하루 1회라 최소 간격이 의미가 없고,
  거기에 걸면 **야간 실행이 조용히 안 도는** 경로가 생긴다.
- **기준은 `lastSettled.finishedAt`** — 직전 실행이 FAILED면 호출부가 `null`을 준다(결정 7). 30초는
  "리포에 쓴 뒤 쉬는 간격"이지 "시작 간격"이 아니다.
- `retryAfterSeconds`를 값으로 돌려준다 — 화면이 "N초 뒤에 다시"를 말하려면 그 수가 필요하고,
  문구가 상수를 따로 들면 둘이 갈린다. **`pullMessage`는 결정성 테스트 아래라 `Date.now()`를 못 본다** —
  그래서 이 수가 outcome에 실려야 한다(§6.1).

### 1.2 `planSyncFinish` — 결과를 행으로

```ts
planSyncFinish(result: PullResult | { thrown: unknown }): {
  status: "SUCCEEDED" | "SKIPPED" | "FAILED"
  errorCode: SyncErrorCode | null
  retryable: boolean | null
  prUrl: string | null           // committed에만
  changed: number | null         // committed는 changed.length, skipped는 0, failed는 null
  warnings: number               // skipped에도 센다 — 어댑터 경고는 skipped로 끝날 수 있다
}
```

⚠️ **`PullResult`는 `committed` | `skipped` 둘이다 — `failed`가 없다.** `runPull`은 실패하면 **던진다**
(`lib/pull/run.ts`), 그래서 `{ thrown }` 갈래가 실패의 **유일한** 입구다. 지금 `failed` 모양은
`/api/pull`·`triggerPullAction`·`pullMessage` 세 곳이 각자 만든다 — `runSync`가 그것을 한 곳으로 모은다(§5).

⚠️ **`skipped`를 `SUCCEEDED`로 접지 않는다.** `lastPublishedAt`은 **`skipped`에서 안 움직인다**
("마지막으로 **보낸**" 것이지 시도한 것이 아니다 — `lib/pull/load.ts`). 그 구별이 행에도 남아야
`logs`가 "어제 밤엔 보낼 게 없었다"와 "어제 밤에 보냈다"를 가른다.

### 1.3 `classifySyncError` — 안정적 오류 코드

```ts
export type SyncErrorCode =
  | "base-unreadable"        // run.ts "cannot read the base branch" — 브랜치 없음·App 접근 상실을 코드가 못 가른다, 한 코드
  | "not-installed"          // run.ts / trigger.ts — installationId 없음
  | "glob-matched-nothing"   // plan.ts — pathTemplate이 파일 0개
  | "github-error"           // octokit RequestError (status를 detail에)
  | "db-unavailable"         // Prisma 오류 클래스
  | "stale"                  // 껍데기가 닫은 옛 RUNNING — 생산자는 §3
  | "unknown"

classifySyncError(error: unknown): { code: SyncErrorCode; retryable: boolean; safeMessage: string | null }
```

- **`AppError`에 선택 `code?: SyncErrorCode`를 더한다**(`lib/failure.ts`). `fail(message, code)` 자리 셋에만
  코드를 박는다 — `run.ts`의 base 읽기 실패·`plan.ts`의 glob 0건·`run.ts`/`trigger.ts`의 not-installed.
  **`classifyFailure`는 `name`만 보므로 영향이 없다** — 그 함수는 "이 메시지를 응답 본문에 실어도 되는가"를
  답하고 이쪽은 "무엇이 실패했고 다시 해도 되는가"를 답한다. 축이 다르므로 새 함수이고 `safeMessage`는
  `classifyFailure`를 그대로 부른다.
- **없앤 코드와 이유**: `adapter-write-failed`(어댑터 오류는 `warnings`로 접혀 실패가 아니다 — `run.ts`·`render.ts`) ·
  `app-uninstalled`/`base-branch-missing`(같은 한 문장에서 나와 가를 수 없다 → `base-unreadable` 하나) ·
  `repo-unreachable`(status 판독 없이 못 만든다 → `github-error`). **생산자 없는 코드는 두지 않는다.**
- `not-ready`·`archived`·`already-running`·`too-soon`은 **sync 오류가 아니라 게이트 거부**다 —
  `SyncGateCode`로 따로 두고 행에 안 남는다(결정 6).
- `retryable`: `github-error`·`db-unavailable`·`stale`·`unknown` = true / `base-unreadable`·`not-installed`·
  `glob-matched-nothing` = false(사람이 설정을 고쳐야 한다).

### 1.4 `STALE_AFTER`와 `maxDuration`

⚠️ **`STALE_AFTER`는 `maxDuration`(60초)보다 넉넉해야 한다.** 같거나 작으면 정상 실행이 스스로를
stale로 보고 두 번째 실행을 허용한다. **그 전제가 수동 경로에서 성립하려면 `translations/page.tsx`에
`export const maxDuration = 60`이 있어야 한다** — Server Action은 부른 페이지 세그먼트의 값을 쓰는데
지금 그 페이지에 선언이 없다(선언은 `settings`·`projects/new`·`api/pull`·`api/push` 넷뿐). 없으면 프로젝트
기본값(300)이라 `STALE_AFTER`와 같아져 이 경고에 스스로 걸린다. ship 2가 넣는다.

### 1.5 `planInvitationCreate` — 멤버 제한 (`lib/auth/invitation.ts`)

```ts
export const MEMBER_LIMIT = 10
planInvitationCreate(input: { memberCount: number }): { status: "ok" } | { status: "member-limit"; limit: number }
```

대기 초대는 안 센다(가장 단순). `createInvitation`이 **이미 `Project` 행을 잠그므로** 그 트랜잭션 안에서
`projectMember.count`를 세어 넘긴다. `InviteError`에 `member-limit`을 더하고 문구는 `limit`을 읽는다.

## 2. 스키마 변경 — **additive만**

```prisma
model SyncRun {
  id          String      @id @default(cuid())
  projectId   String
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Restrict)
  status      SyncStatus  // RUNNING | SUCCEEDED | SKIPPED | FAILED
  trigger     SyncTrigger // MANUAL | CRON
  requestedBy String?
  requester   User?       @relation(fields: [requestedBy], references: [id], onDelete: SetNull)
  startedAt   DateTime    @default(now())
  finishedAt  DateTime?
  errorCode   String?     // SyncErrorCode — 앱 층 어휘라 enum이 아니다
  prUrl       String?
  changed     Int?
  warnings    Int         @default(0)

  @@index([projectId, startedAt])   // 역방향으로 탄다 — Translation의 [projectId, updatedAt]과 같은 형, sort 없음
}

// Project에 additive 둘 / User에 관계 하나
archivedAt  DateTime?
syncRuns    SyncRun[]
```

- **전부 additive다** — 새 테이블 하나 + `Project`에 nullable 컬럼 하나 + enum 둘. 2단계 배포가 필요 없다.
- **`type` 컬럼 없음, `idempotencyKey` 없음.** SAAS §8이 두 이름을 적어 뒀지만 지금 두 진입점 중
  **키를 만들 주체가 없다** — cron은 하루 한 번이고 UI는 클릭이다. 동시성은 §3의 **행 잠금**이 막고,
  둘 다 **push를 이 테이블에 넣을 때** 의미가 생긴다(같은 커밋의 Re-run이 그 키다). 그날 additive로 붙인다 —
  "확장성을 위한 선반영은 그 자체가 결함이다"(CLAUDE.md).
- **`requestedBy`는 FK다**(결정 8). `logs`가 조인으로 이름을 얻고 삭제된 사용자는 저자만 빈다.
  `onDelete: Restrict`가 `Project` 관계의 기존 관용구다.
- ⚠️ **`archived`를 enum 상태 컬럼으로 만들지 않는다.** SAAS §7.5가 "별도 상태 컬럼을 즉시 만들지
  않는다"고 이미 정했다. `archivedAt`은 **되돌릴 수 있는 사실 하나**다(`orphaned`와 같은 형).

## 3. 동시 실행 차단 — 행 잠금이지 유니크 인덱스가 아니다

**`SELECT … FOR UPDATE`로 `Project` 행을 잠그고 트랜잭션 안에서 판정·stale 닫기·행 생성을 한다.**

```
$transaction(tx):
  tx.$executeRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
  running     = tx.syncRun.findFirst({ where: { projectId, status: RUNNING }, orderBy: { startedAt: desc } })
  lastSettled = tx.syncRun.findFirst({ where: { projectId, status: { in: [SUCCEEDED, SKIPPED] } }, orderBy: { startedAt: desc } })
  gate = planSyncStart(...)                     → 거부면 값으로 반환(행 없음)
  if gate.staleToClose:
    tx.syncRun.updateMany({ where: { projectId, status: RUNNING, startedAt: { lt: cutoff } },
                            data: { status: FAILED, errorCode: "stale", finishedAt: now } })
  return tx.syncRun.create({ status: RUNNING, trigger, requestedBy, projectId })
```

- ⚠️ **부분 유니크 인덱스(`WHERE status='RUNNING'`)를 쓰지 않는다.** Prisma가 그 문법을 못 내서
  마이그레이션에 raw SQL을 손으로 넣어야 하고, `prisma/schema.prisma`와 실제 DB가 갈리는 자리가 하나 는다.
- ⚠️ **CAS 컬럼(`Project.runningSyncId` + `updateMany` 가드)도 쓰지 않는다.** 트랜잭션은 없애지만 `Project`에
  상태 사본이 생기고 crash 정리 로직이 어차피 필요하다.
- **선례가 셋이다** — `createInvitation`·`changeMember`·`createProject`가 정확히 이 형이다
  (`app/(edit)/projects/actions.ts`, `$transaction(async tx => tx.$executeRaw\`… FOR UPDATE\`)` + 재집계).
  ⚠️ **pooler(6543)에서 대화형 트랜잭션은 안전하다** — ARCHITECTURE 2026-09-06 정정이 확정했고 위 셋이
  프로덕션에서 돈다. `lib/push/apply.ts` 상단 주석("문장마다 다른 백엔드로 갈 수 있다")은 **트랜잭션 밖
  개별 문장**에 대한 것이라 충돌이 아니다(그 주석의 표현은 이 기능 밖이다).
- ⚠️ **잠금은 `Project` 행이지 `SyncRun`이 아니다** — 막으려는 것이 "이 프로젝트에 대한 두 번째 실행"이고,
  아직 존재하지 않는 행은 잠글 수 없다.
- ⚠️ **잠금 트랜잭션 안에서 GitHub을 부르지 않는다.** 트랜잭션은 `RUNNING` 행을 만드는 데까지이고
  (수 ms), 실제 pull은 그 밖에서 돈다. 안 그러면 GitHub 지연이 곧 DB 커넥션 점유다 — pooler에서 그건
  전 테넌트에 번진다.
- **트랜잭션 밖 선조회는 없다.** 거부될 요청도 GitHub은 안 읽으므로(게이트가 tx 안이고 GitHub은 그 뒤)
  `createProject`의 "선조회 = 최적화, 재집계 = 방어선" 구분이 여기선 필요 없다.

## 4. 보관 — 인가 union에 갈래 하나 (결정 1)

```ts
// lib/auth/access.ts
export type ProjectAccess =
  | { status: "not-found" } | { status: "forbidden" }
  | { status: "archived"; projectId: string; role: Role }     // 신설
  | { status: "ok"; projectId: string; role: Role }

planProjectAccess(member, permission, archivedAt: Date | null)
```

- `getProjectAccess`가 `archivedAt`을 `select`에 더한다. **`project:settings`를 제외한 모든 permission이
  `archived`로 떨어진다** — `saveTranslation`·`triggerPullAction`·페이지 전부가 **한 자리**에서 거부된다.
  `entry-points.test.ts`가 진입점 전수를 세므로 새 갈래를 빠뜨린 화면이 없다.
- `requireProjectAccess`는 `archived`를 **`not-found`처럼 redirect하지 않는다** — 페이지가 `ProjectArchived`를
  그린다(`components/project-archived.tsx`, `project-not-ready.tsx`와 같은 형: **정책과 문구를 한 곳이 든다**.
  OWNER는 설정으로 안내, 나머지는 `EmptyState` 한 줄). `ACCESS_ERRORS`에 `archived` 문구.
- **목록·스위처는 숨기지 않는다.** `loadMemberships`가 `archivedAt`을 함께 내고 행에 "Archived" 배지(`muted`).
  OWNER의 settings 링크는 그대로 산다 — 그것이 되돌리는 길이다.
- **`/api/push`는 409** — `lib/push/guard.ts`에 `"archived"` 갈래 하나, 응답 본문 `{ error: "archived" }`.
  대상 리포 CI가 red가 되는 것은 의도된 신호다(워크플로를 떼라는 뜻).
- **`PROJECT_LIMIT` 분자에서 제외** — `createProject`의 OWNER 재집계에 `project: { archivedAt: null }`.
- `selectPullTargets`가 `archivedAt !== null`을 거른다 — **순회 대상에서 빠지므로 게이트까지 가지도 않는다.**
- `archiveProject`·`unarchiveProject`는 `project:settings` Server Action. **`revalidatePath("/", "layout")`** —
  보관은 목록·사이드바·Home·번역 화면을 다 바꾼다(POSTMORTEM 2026-09-09, `disconnectGithub` 선례).
  ⚠️ **열린 PR을 닫지 않는다**(SAAS §7.9) — 설정 페이지 서버가 `findOpenPrUrl`을 한 번 물어 Dialog 본문에
  링크로 싣는다. 조회 실패는 "확인하지 못했다" 한 줄이지 "없다"가 아니다(POSTMORTEM 2026-09-03).

## 5. `runSync` — 껍데기 (`lib/sync/run.ts`)

```ts
runSync(prisma, { projectId, slug, trigger, requestedBy }): Promise<PullOutcome>
```

- **던지지 않는다.** `PullOutcome`(`lib/pull/message.ts` — `PullResult | { status: "failed"; error }`)을 돌려준다.
  안 그러면 catch가 `runSync`와 두 진입점에 세 벌 생기고 행 닫기가 그 사이 어딘가로 빠진다. 게이트 거부도
  같은 모양이다 — `{ status: "failed", error: "already-running" | "too-soon", retryAfterSeconds? }`.
- `projectId`를 받는다 — 잠금과 행에 필요하고 두 호출부 모두 이미 갖거나 얻는다(`triggerPull(prisma, slug)`가
  slug로 다시 읽는 것은 그대로 둔다).
- 순서: §3 트랜잭션 → `triggerPull` → `planSyncFinish` → `syncRun.update`. **`Project` 컬럼은 이 함수가 건드리지
  않는다**(§5.1).
- `server-only` **없음** — 하네스 테스트가 직접 부른다(`lib/pull/trigger.ts`·`lib/auth/query.ts`와 같은 이유).

### 5.1 실패해도 마지막 성공을 안 덮는다 (완료 조건 2)

**이미 성립하는 것을 감싸면서 잃지 않는 것이 이 절의 전부다.**

- `saveLastPulledAt`은 **실패 경로에서는 안 불린다**(`lib/pull/run.ts` — `committed`와 `no-changes` 스킵에서만).
- `lastPublishedAt`·`lastPrUrl`은 `skipped`에서 안 움직인다(`lib/pull/load.ts`).
- 새 껍데기는 그 호출부를 **감싸기만** 한다 — `SyncRun` 행을 `FAILED`로 닫는 것은 `Project` 컬럼과
  **다른 문장**이고, 그래서 실패가 성공 상태를 건드릴 경로가 생기지 않는다.

⚠️ **회귀 테스트가 이 절의 산출물이다** — `lib/pull/__tests__/run.test.ts`에 이미 있는 "실패가
`lastPulledAt`을 전진시키지 않는다"를 **껍데기 층에서 다시 한 번** 건다. `triggerPull`을 mock하는 이상 그
단언이 보는 것은 "껍데기가 `Project`를 안 쓴다"까지다 — 하네스 시드에 `lastPublishedAt`·`lastPrUrl` 값을
넣어야 `undefined === undefined`가 아니다.

### 5.2 `/api/pull`의 순회와 행

- 프로젝트마다 `try/catch`가 이미 있다(한 실패가 나머지를 안 막는다). 그 안이 `runSync` 한 줄이 된다.
  응답 `{ results, unprocessed }`는 그대로다(sec-audit 발견 26 — 두 축이 다르다).
- route의 `select`가 `archivedAt`과 **마지막 `SyncRun.startedAt`**을 함께 읽고 `selectPullTargets`가
  그 둘을 받는다 — 보관 제외 + **가장 오래 안 돈 프로젝트부터**(없으면 맨 앞, 동점 slug). 순수 함수 한 곳이다.
- **게이트에서 거부된 프로젝트는 행이 없다**(결정 6). `already-running`도 마찬가지 — 첫 실행의 `RUNNING` 행이
  그 사건의 증거다. cron이 사람과 겹친 것을 알고 싶으면 그 행의 `trigger`를 본다.

## 6. `logs` 화면 (`/projects/:slug/logs`)

- 인가: `requireProjectAccess`, 권한은 **`translation:write`**(EDITOR 이상). OWNER 전용으로 하지
  않는다 — 번역자가 "내가 보낸 게 갔나"를 보는 화면이다.
- **표는 `Card` 밖**(`locales/page.tsx` 실측 — 이중 padding). 열: 시각 · 트리거 · 결과 · 변경 수 · PR · 사유.
  - **시각**: `<time dateTime>`에 절대 시각, 상대 시각은 보조 — 이력에서 "2 days ago"는 어느 밤인지 못 가른다.
    `now`는 서버가 한 번 만들어 내린다(`lib/relative-time.ts`, 잎).
  - **트리거**: `requester.name`(FK 조인) / cron이면 "Nightly" / 삭제된 사용자는 "Removed user".
  - **결과 배지** — `Badge` variant는 `muted`·`warning`·`danger` 셋뿐이고 새 raw 색은 금지(DESIGN §6.2):
    SUCCEEDED·SKIPPED = `muted`(라벨로 구별 — 성공은 조용하다) / FAILED = `danger` / RUNNING = `muted` + "Running…"
    (§10 줄임표는 진행 중에만). `lib/sync/view.ts`의 tone 타입을 `Badge` variant union과 **같은 이름**으로 둔다(`PublishTone` 선례).
  - **RUNNING 행은 스냅샷이다** — 자동 갱신 없음(리포에 0건이고 넣으면 2026-09-07 규칙과 충돌). 갱신은 재방문.
  - **PR**: 기존 `publish.viewLink` + `ExternalLink` 12 재사용.
  - **사유**: `errorCode` → 문장은 `messages/en.tsx`의 **`logs.reasons` 사전** — 과거 시제("Another run was in
    progress")로, Publish Alert의 현재 시제와 갈라 둔다. 소비자가 `satisfies Record<SyncErrorCode | "fallback", string>`
    (`lib/i18n/adapter-errors.ts` 선례). `skipped` 행의 라벨은 "Nothing to send"(base 대비 0건 — POSTMORTEM 2026-09-09)이지
    "branch equals base"가 아니다.
- **페이지네이션 — 서버 렌더 `?cursor=` + `ButtonLink` "Older" 하나**(결정 14). `routes.logs(slug, { cursor })`를
  `lib/routes.ts`에, `entry-points.test.ts`가 쿼리 키를 대조. cursor는 `startedAt`+`id`를 인코딩한 주소창 값이라
  **무효면 첫 페이지**(500이 아니다 — `pick` 폴백 선례). 인코딩·검증은 `lib/sync/view.ts`의 순수 판정.
  ⚠️ `view.ts`는 `@/generated/prisma/client`를 **타입으로만** 가져온다 — 값이면 `client-graph`가 red.
- ⚠️ **"없음"을 낼 때 조회 성공임이 드러나야 한다** (POSTMORTEM 2026-09-03). 빈 상태는 `EmptyState`를 표
  **대신** 반환("No syncs yet" — 멤버 대기 초대 선례). 조회 실패는 RSC throw라 Next 오류 화면이니 "오류와 다른
  모양"은 catch를 안 쓰는 한 자동 성립한다 — 소스 스캔이 `try`가 없음을 센다.
- ⚠️ **패널(8단계)과 경계를 긋는다** — SAAS §8 8단계 🔒는 **제안**이고 이 단계가 그것을 채택한다:
  **`logs` = 과거 이력**, 패널 = 지금 상태 + 행동. `logs`에 [Send changes]를 두지 않는다.
- 사이드바: `projectSections`에 `logs` — 라벨 "Logs", 아이콘 `History`, `exact: true`(하위 라우트 없음),
  `canPerform` 뒤가 아니다(EDITOR도 본다). `nav.test.ts`의 키 배열(OWNER 5·EDITOR 4)이 red가 된다 — 갱신이 태스크다.

### 6.1 Publish의 게이트 거부 표시

- `triggerPullAction`이 `runSync`의 `PullOutcome`을 그대로 돌려준다. `pullMessage`(`lib/pull/message.ts`)에
  **`isSyncGateError` 갈래**를 더한다 — `not-ready`가 `isOnboardError`로 들어오는 선례. 문구는 `retryAfterSeconds`를
  보간한다("Already sending — try again in 30 seconds"). **정적 문장이다** — 카운트다운 없음(`setInterval` 0건,
  `translations-screen.test.ts`가 헤더에 `aria-live`를 금지한다).
- tone은 **`info`** — 고장이 아니라 "방금 보냈다"다. `danger`는 `role="alert"`라 스크린리더가 끊고 읽는다.
  `message.test.ts`의 "문구 다섯·tone 넷" 단언이 그만큼 는다.
- 표시는 기존 `PublishResult` 슬롯(`components/translations/header.tsx`) 그대로 — 조건부 Alert를 끼우면
  `base-locale-screens.test.ts`가 red다. `status === "failed"`이므로 `router.refresh()`가 안 불린다(2026-09-08 규칙).

### 6.2 설정의 보관 카드

- settings-block **여섯째**, 맨 아래. [Archive project] → `Dialog` "Archive {name}?" 본문: 멤버 편집·야간 sync·CI push가
  멈춘다 + "열린 PR은 닫지 않는다" + 열린 PR 링크(서버가 조회). 확인 버튼 `danger` "Archive project"(§10 —
  무엇을 멈추는지 라벨에). 보관 상태면 같은 자리가 [Restore project](`secondary`, 무확인).
- **인라인 결과 Alert 없음** — 카드 상태 전환이 피드백이다(`reconnect-button` 선례). 결과 문구를 두면 정확히
  2026-09-07 함정(revalidate가 언마운트)이다. 카드는 readiness 분기 **밖**의 형제.

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| export 결정성 (§1.1) | **없음** — writer를 안 건드린다 |
| blob SHA 2층 비교 (§2·§3) | **없음** — `runPull` 판정층 그대로(코드 태깅만) |
| 인증 경계 (§6.1) | `logs`는 `/projects/:path*` matcher가 **이미 덮는다**(`members`·`locales`와 같다). matcher 변경 0, `entry-points.test.ts`가 그 커버리지를 센다 |
| SAAS §9-9 "버린 값을 성공으로 숨기지 않는다" | **강화된다** — `warnings` 수가 행에 남는다 |
| 쿼리는 `projectId`로 좁힌다 | `SyncRun` 조회 전부 `projectId` 선두. 인덱스도 그 모양 |
| 인가 판정의 주인은 하나 (SAAS §5.2) | **강화된다** — 보관 거부가 `planProjectAccess` 한 자리다 |

## 8. 과거 함정 (POSTMORTEM 인용)

- **2026-09-05 (하네스가 실제보다 관대했다)**: 하네스의 `$transaction`은 직렬화가 없고 `$executeRaw`는 no-op이다.
  → "동시 두 번 → 한 번"을 `Promise.all`로 재지 않는다(tasks ship 2 T1의 모양). 진짜 동시성은 `[manual]`의 몫이다.
- **2026-09-06 / 2026-09-07 (`changeMember`·`disconnectGithub`)**: *목록으로 판정한 뒤 지우면 그 사이에
  행이 사라져 P2025로 던진다.* → 판정·stale 닫기·행 생성이 **한 트랜잭션** 안이다(§3).
- **2026-09-07 (`revalidatePath`가 재시도 컴포넌트를 언마운트했다)**: → 보관 카드에 인라인 결과 문구를 두지 않는다(§6.2).
- **2026-09-08 (실패한 Publish 뒤 `router.refresh()`)**: 실패에는 refresh를 부르지 않는다. 게이트 거부가
  `status: "failed"`인 이유의 절반이 이것이다(§6.1).
- **2026-09-09 (sync 브랜치가 직전 스냅샷을 든다)**: *"변경 0건"은 base 대비 0건이다.* → `skipped` 행의
  라벨은 "Nothing to send"이지 "branch equals base"가 아니다(§6).
- **2026-09-09 (화면을 옮겼는데 무효화가 안 따라갔다)**: → 보관 Action은 `revalidatePath("/", "layout")`(§4).
- **2026-09-03 (실패한 조회를 "없음"으로 읽었다)**: → 열린 PR 조회 실패는 "확인 못 함"이고, `logs` 빈 상태는
  조회 성공에서만 나온다(§4·§6).

## 9. 새 환경변수

**없다.** 제한은 전부 코드 상수다(`.env.example` 변경 없음).
