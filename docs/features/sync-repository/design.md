# Sync repository — design

`spec.md` §7(결정 넷 + 구현 판단 셋)·§8(게이트 순서)·§9(Action 계약)을 전제로 한다.

## 1. 영향 받는 흐름

**push / 편집 UI / pull 중 push다** — 방향이 리포 → 앱이라 `lib/push/`의 적용 층을 그대로 지난다.

| 흐름 | 이번 변경 |
|---|---|
| push (`/api/push` → `applyPush`) | **새 호출부가 하나 는다.** `applyPush` 자체는 안 바뀐다 |
| 편집 UI | Server Action 둘 신규 + Home 머리의 버튼 배선(project-home T6이 그 자리를 만든다) |
| pull (`runSync`) | **없음.** `SyncRun`에 행이 안 생긴다 |
| 온보딩 | ⚠️ **`runFirstIngest`의 본문이 공용 헬퍼로 빠진다** (§3) — 판정은 한 줄도 안 바뀐다 |

## 2. ⚠️ 가장 큰 발견 — 적재 경로가 이미 전부 있고, 새로 쓸 것은 게이트와 문구뿐이다

`runFirstIngest`(`app/(edit)/projects/actions.ts:1057`)가 이 기능의 **거울상**이다. 그 함수가 하는 일:

```
인가(project:settings) → 행 조회 → readiness 판정(awaiting_first_sync만) → 포맷 셋 유효성
  → markImportStarted
  → openRepoReader → snapshot(baseBranch)
  → templatePaths(저장된 어댑터·템플릿, 트리 경로)        ← "시도한 목록"
  → readFiles (예산·순차)
  → planConfirmedFormat (저장된 포맷을 파일로 재검증)
  → ingestTargets ∪ attempted → 못 받은 것만 한 번 더 readFiles
  → ingestFirstSnapshot → prepareFirstSnapshot → applyPush
  → finally: revalidatePath 셋
```

**재적재가 다른 것은 셋뿐이다:**

| 축 | `runFirstIngest` | 재적재 |
|---|---|---|
| readiness | `awaiting_first_sync`**만** | `ready`**만** |
| 대상 표면 | `defaultSurface` 하나 | **활성 표면 전부** (표면마다 별도 트랜잭션) |
| `previousBaseLocale` | `null` (첫 적재다) | ⚠️ **저장된 `surface.baseLocale`** (§3.2) |

**그래서 본문을 복제하지 않는다** — 공용 헬퍼로 뺀다.

### 2.1 ⚠️ 복제가 특히 위험한 이유 — 그 본문의 주석이 과거 결함 셋을 문서화하고 있다

1. **`attempted`는 `templatePaths`에서 나온다, `ingestTargets`가 아니다** (2026-09-07 리뷰 🔴2) —
   후자는 `confirmed.format.locales`를 도는데 그 locales는 **성공한 blob에서 나온 값**이라, 못 받은
   로케일이 목록에서 함께 사라져 `missing`이 0이 된다.
2. **둘의 합집합을 `targets`로 넘긴다** — 한쪽에만 있는 경로도 실패로 세야 한다.
3. **이미 받은 것은 다시 안 받는다** — 남는 것은 첫 시도가 실패한 파일이고, 한 번 더 받아 본다.

⚠️ **복제하면 한쪽만 고쳐지고 다른 쪽이 조용히 낡는다.** 이 리포가 그 부류를 여러 번 밟았다
(`selectLocaleFiles`를 새로 짠 2026-09-02 · 워크플로 step 생산자가 둘이던 2026-09-14).

## 3. 공용 헬퍼 추출 — `lib/import/surface.ts` (신규, `server-only`)

```ts
export type SurfaceImportInput = {
  projectId: string;
  projectSlug: string;
  surface: { id: string; slug: string; adapterName: string; pathTemplate: string; baseLocale: string };
  /** 이 적재 **전**의 base 로케일. 첫 적재는 null, 재적재는 저장된 값이다 (§3.2). */
  previousBaseLocale: string | null;
  startedAt: Date;
  snapshot: { headSha: string; headCommittedAt: string; paths: readonly string[] };
};

export async function importSurfaceFromRepo(
  prisma: PrismaClient,
  reader: RepoReader,
  input: SurfaceImportInput,
): Promise<FirstIngestResult>;
```

- **`runFirstIngest`가 이 함수의 첫 소비자가 된다** — 판정은 한 줄도 안 바뀌고 자리만 옮긴다.
- ⚠️ **`readFiles`·`snapshotError`가 지금 `actions.ts`의 모듈 사설 함수다** — 함께 옮긴다
  (`lib/import/read.ts`). 옮기는 것은 자리뿐이고 로직은 그대로다.
- ⚠️ **`lib/onboarding/`으로 넣지 않는다.** 그 디렉터리의 경계가 *"GitHub을 모른다 — 스냅샷과 blob을
  값으로 받는다"*이고(`credential-separation.test.ts`가 소스에서 상시로 센다), 이 헬퍼는 `RepoReader`를
  **직접 든다.** 넣으면 그 검사가 red가 되고, red를 피하려 인자를 값으로 펴면 다운로드 순서 로직이
  호출부로 새어 나가 §2.1의 함정 셋이 다시 복제된다.

### 3.1 ⚠️ 이 추출이 "외과적 변경" 규칙과 충돌하지 않는 이유

CLAUDE.md는 *"요청과 직접 관련 없는 인접 코드 개선·리팩터 금지"*다. **이것은 인접 개선이 아니라
이 기능의 유일한 비복제 구현 수단이다** — 대안이 §2.1의 100줄을 두 벌로 만드는 것뿐이고, 그 100줄의
주석이 과거 결함 셋을 진다. **별도 커밋으로 분리하고 테스트를 먼저 박는다** (`tasks.md` T2).

### 3.2 ⚠️ `previousBaseLocale`을 `null`로 넘기면 안 된다

`ingestFirstSnapshot`이 **`null`을 리터럴로 박고 있다**. `isBaseLocaleChange(payloadBase, null)`은
언제나 `false`이므로(`lib/push/guard.ts:119`), 재적재에서 그대로 쓰면 **리포에서 base 로케일이 바뀌어도
전 키의 `needsReview`가 안 선다** — 원문이 바뀐 것을 아무도 모른다.

⚠️ **`ApplyOptions`의 주석이 이미 그 축을 경고한다**: *"optional로 두지 않는다. 껍데기가 빼먹으면
base 교체 push가 조용히 … 그 결함은 지표로도 안 보인다 (POSTMORTEM 2026-09-02)."*
**재적재는 저장된 `surface.baseLocale`을 넘긴다.**

### 3.3 `checkCommitOrder`를 부르지 않는다

그 가드는 `/api/push`가 **외부가 보낸 커밋**을 받을 때 역행을 막는 것이다. 재적재는 **base head를
직접 읽으므로** 그 시점의 진실이고 비교 대상이 없다. ⚠️ **base가 force-push로 뒤로 갔다면 그것이
리포의 현재 상태**이고, 불변식 1에 따라 리포가 이긴다.

## 4. 순수 함수로 분리 — `/tdd` 진입점

**I/O가 0인 판정 셋이다.** Action은 조회 → 이 셋 호출 → 표면 루프로 얇아진다.

### 4.1 `planRepositoryImport` — `lib/import/plan.ts`

```ts
export const IMPORT_STALE_AFTER_SECONDS = 300;

export type ImportStart =
  | { status: "ok"; surfaces: readonly PlannedSurface[] }
  | { status: "not-ready" }
  | { status: "not-connected" }
  | { status: "repo-replaced" }
  | { status: "already-running" }
  | { status: "no-surfaces" };

export function planRepositoryImport(input: {
  now: Date;
  readiness: ProjectReadiness;
  /** 저장값 ↔ GitHub이 준 값의 대조 결과. 호출부가 이미 조회했다. */
  identity: "ok" | "not-connected" | "repo-replaced";
  surfaces: readonly { id: string; slug: string; adapterName: string | null; pathTemplate: string | null;
                       baseLocale: string | null; archivedAt: Date | null; lastImportStartedAt: Date | null }[];
}): ImportStart;
```

**판정 넷이 여기 든다:**

1. **거부 순서** — readiness → identity → already-running → no-surfaces (`spec.md` §8).
2. ⚠️ **stale 회수** — `lastImportStartedAt`이 `IMPORT_STALE_AFTER_SECONDS`보다 오래됐으면 **죽은
   프로세스**로 보고 무시한다. 지금 `failing()`·`meterSlot`은 `null` 여부로만 보므로 **그 기준이 여기서
   처음 선다.** 안 두면 중단된 적재 하나가 Sync를 영구히 막는다.
   ⚠️ **`maxDuration`(60)보다 넉넉해야 한다** — 같거나 작으면 정상 실행이 스스로를 stale로 본다
   (`STALE_AFTER_SECONDS`가 같은 이유로 300이다).
   ⚠️ **경계 정각은 아직 stale이 아니다** — `planSyncStart`와 같은 부등호를 쓴다.
3. **포맷 셋이 빠진 표면을 뺀다** — `adapterName`·`pathTemplate`·`baseLocale` 중 하나라도 `null`이면
   온보딩 밖에서 만들어진 행이라 적재할 근거가 없다. **전체를 거부하지 않고 그 표면만 뺀다.**
4. **보관된 표면을 뺀다** (`archivedAt !== null`).

### 4.2 `planImportConfirmation` — `lib/import/confirm.ts`

```ts
export type ImportConfirmation = {
  /** 미발송 줄을 세울지와 그 수. */
  unsent: number;
  /** 열린 PR 경고. `null` = 없음, `undefined` = **확인하지 못했다** (둘을 접지 않는다). */
  openPr: { number: number } | null | undefined;
  /** `Send changes first` 링크를 세울지. */
  recommendSend: boolean;
  /** 되돌릴 수 없는 결과가 실재하는가 — Dialog의 tone이 여기서 갈린다. */
  atRisk: boolean;
};

export function planImportConfirmation(input: {
  unsent: number;
  openPr: { number: number; url: string } | null | undefined;
}): ImportConfirmation;
```

⚠️ **이 함수 하나가 `spec.md` §6.2의 함정을 진다.** 단언 셋:

- `unsent > 0` → `recommendSend: true` · `atRisk: true`
- **`unsent === 0 ∧ openPr !== null` → `atRisk: true`** ← 부분집합 함정이 여기서 잡힌다
- `openPr === undefined` → 전용 문장 (`null`로 접지 않는다)

⚠️ **`atRisk: false`여도 Dialog를 건너뛰지 않는다.** 되돌릴 수 없는 동작이라는 사실이 수와 무관하고,
`unsent`는 **조회 시점의 값**이라 Dialog를 보는 동안 번역자가 저장하면 이미 낡는다.

### 4.3 `summarizeImport` — `lib/import/result.ts`

```ts
export type ImportSummary = {
  tone: "success" | "warning" | "danger";
  keys: number;                            // 적재한 키 합
  imported: number;                        // 성공한 표면 수
  partial: number;                         // 들어갔지만 일부가 빠진 표면 수
  /** 못 읽은 표면. **수가 아니라 slug 목록이다** — 아래 참조. */
  unreadable: readonly string[];
};

export function summarizeImport(surfaces: readonly SurfaceImportResult[]): ImportSummary;
```

⚠️ **불변식 9가 여기 산다** — `unreadable.length > 0 ∨ partial > 0`이면 tone이 `success`가 아니다.
표면 셋 중 하나가 빠졌는데 `Synced 903 keys`만 쓰면 그 사실이 화면에서 사라진다.

⚠️ **`unreadable`을 수가 아니라 slug 목록으로 든다** (2026-09-15). 결과 문장이 표면 이름을 댈지는
**시안이 정하는데**(`spec.md` §11.3), 타입이 수면 그 결정이 순수 함수의 시그니처를 바꾼다 —
목록이면 화면이 `length`를 쓰든 이름을 쓰든 **타입이 안 움직인다.** 그래서 **T3·T4가 T1을
기다리지 않는다.**

### 4.4 재사용하는 것 (새로 안 만든다)

| 무엇 | 어디 |
|---|---|
| 적재 전체 | `prepareFirstSnapshot` → `applyPush` (`lib/onboarding/ingest.ts` · `lib/push/apply.ts`) |
| 저장된 포맷의 재검증 | `planConfirmedFormat` (`lib/onboarding/confirm.ts`) |
| 경로 목록 | `templatePaths` · `ingestTargets` |
| 예산 | `checkDownloadBudget` · `checkContentBudget` |
| 진행·결과 표시 | `markImportStarted` · `finishImportRun` · `importOutcomeFields` |
| 실패 문장 | `importFailureMessage` (`ImportFailureCode` 6종) |
| 미발송 수 | **`countUnpublished`** (`lib/keys/query.ts:178`) — ⚠️ **넷째 벌을 만들지 않는다** |
| 열린 PR | `loadOpenPrUrl`(설정 페이지 사설) → **`lib/projects/open-pr.ts`로 올린다** (§5.2) |
| readiness | `planProjectReadiness` |
| 정체성 대조 | `checkRepoAccess` + `repositoryId`·`installationId` 비교 (Add surface와 같은 배선) |

## 5. 껍데기 — Server Action 둘

### 5.1 `runRepositoryImport` — `app/(edit)/projects/actions.ts`

⚠️ **새 파일을 만들지 않는다** — `readFiles`·`snapshotError`·`openRepoReader` 배선이 이미 그 파일에
있고, CLAUDE.md의 경로 표가 온보딩·프로젝트 동작을 그 파일로 정해 뒀다.

```
세션 → 인가(project:settings) → 행 조회(projectId로 좁힌다)
  → checkRepoAccess → identity 판정
  → planRepositoryImport(now, readiness, identity, surfaces)   ← 순수
  → 거부면 값으로 반환 (행을 만들지 않는다)
  → openRepoReader 한 번 · snapshot 한 번                      ← ⚠️ 표면마다 다시 열지 않는다
  → for (표면) {
        markImportStarted
        try   importSurfaceFromRepo  → 결과 수집
        catch finishImportRun(code)  → 그 표면만 실패로 기록하고 **루프를 계속한다**
     }
  → finally revalidatePath('/projects/${slug}', "layout") · '/projects'
```

- ⚠️ **리더는 한 번만 연다** (`openRepoReader`). 표면마다 `createApp()`을 부르면 설치 토큰 발급이
  호출마다 하나씩 붙어 예산이 배가 된다 (ARCHITECTURE §3.1, 2026-09-07 code-review 🔴).
- ⚠️ **스냅샷도 한 번이다** — 표면마다 트리를 다시 읽으면 같은 이유로 비용이 N배이고, 더 중요하게는
  **표면마다 다른 head를 볼 수 있다**(그 사이 push가 들어오면). 한 스냅샷이 곧 한 시점이다.
- ⚠️ **표면 루프 안에서 던지지 않는다** — 하나의 실패가 나머지를 막지 않는 것이 결정 2다.
  예산 초과(`IngestBudgetError`)도 그 표면만 실패다.
- ⚠️ **`revalidatePath`가 `finally`다** (POSTMORTEM 2026-09-13 — 실패 경로의 무효화가 빠져 있었다).
- ⚠️ **`markImportStarted`를 인가·게이트 **뒤**에 둔다** — 앞에 두면 거부된 호출까지 목록이
  "적재 중"으로 그린다.

### 5.2 `checkOpenPullRequest` — 읽기 전용 Action

Dialog가 열릴 때 부른다. `loadOpenPrUrl`(설정 페이지 사설 함수)을 `lib/projects/open-pr.ts`로 올려
**두 소비자가 같은 함수를 쓴다**.

- 반환은 **삼상태**다 — `{number,url}` / `null`(없음) / `undefined`(확인 실패).
- ⚠️ **Home 렌더에서 부르지 않는다** — Home의 조회가 이미 늘어나고(project-home design §9.4 —
  병목이 행 수가 아니라 함수 리전이었다), 이 값은 **Dialog를 연 사람만** 쓴다.
- 인가는 `project:settings`다 — 버튼과 같은 permission이어야 EDITOR가 PR 존재를 탐색할 수 없다.

## 6. 새 컴포넌트

### 6.1 `components/projects/sync-button.tsx` — `"use client"`

`ArchiveCard`가 가장 가까운 선례다 (`Dialog` + `DialogTrigger` + `DialogClose` + `useTransition`).

- **`components/ui/dialog.tsx`를 고치지 않는다** — 그 프리미티브를 건드리면 초대·확인·아카이브·
  로그인수단 모달 넷이 함께 움직인다 (DESIGN §6.7).
- ⚠️ **결과 Alert는 이 컴포넌트가 그리지 않는다.** `PublishButton`/`PublishResult`와 같은 형 —
  **상태는 머리가 들고** Alert는 머리 아래 고정 자리다. 여기 두면 `revalidatePath`가 다시 그리면서
  방금 받은 결과가 언마운트된다 (POSTMORTEM 2026-09-07 — `FirstIngestRetry`가 정확히 그 함정이었다).
- ⚠️ **Dialog가 열릴 때 `checkOpenPullRequest`를 부른다** — 조회 중에는 PR 줄 자리에 스켈레톤이 아니라
  **아무것도 안 둔다**(수가 흔들리는 자리가 아니다). 응답이 늦으면 `undefined` 문장으로 떨어진다.
- ⚠️ **연타를 막는다** — `loading={pending}`. 두 실행이 병렬이면 같은 표면에 `markImportStarted`가
  두 번 걸린다.
- ⚠️ **EDITOR에게는 렌더하지 않는다** — 부재이지 비활성이 아니다 (`ProjectArchived`의 선례, DESIGN §6.69).
  **차단은 Action이 든다.**

### 6.2 `components/projects/sync-result.tsx`

`PublishResult`와 같은 형: `ImportSummary` → `Alert` variant. ⚠️ **tone을 variant로 그대로 넘긴다** —
매핑 표를 또 들면 두 벌이 갈린다.

## 7. 스키마 변경 — **없다**

| 후보 | 왜 안 넣나 |
|---|---|
| `SyncRun`에 `import` trigger | `SyncRun`은 Publish 전용이고 `trigger`·`status` enum이 그 가정 위에 선다 (ARCHITECTURE §5.6 · project-home design §6.3이 같은 이유로 표면 추가 사건을 거절했다) |
| `TranslationSurface.lastImportBy` | 실행자를 안 적는다 — 보관 실행자를 안 적는 것과 같은 근거(OWNER만 할 수 있고 멤버 상한이 10이다, project-home §9.4) |
| 적재 이력 테이블 | PRODUCT §4.1이 임포트 결과를 *"마지막 하나만 남기는 것이고 이력이 아니다"*로 이미 닫았다 |
| stale 기준 컬럼 | 상수다 (`IMPORT_STALE_AFTER_SECONDS`) |

⚠️ **project-home이 더하는 `TranslationSurface.lastImportFailedAt`은 이 기능이 공짜로 얻는다** —
실패 기록이 `finishImportRun` 한 자리를 지나므로, 그쪽 T2·T4가 그 함수에 필드를 더하면 이 경로도
같이 채운다. **순서 의존은 없다** (어느 쪽이 먼저 들어가도 된다).

## 8. 새 환경변수

**없다.** `.env.example` 갱신 불필요.

## 9. 불변식 영향

| 불변식 | 영향 |
|---|---|
| §0-1 소스 키는 코드가 진실 | **강화한다** |
| **§0-2 병합 없음** | ⚠️ **새 push 시점을 만든다.** 병합 코드는 0으로 유지한다 — 되돌리기·"내 편집 지키기"·값 비교가 전부 금지다 (`spec.md` §6.1) |
| §0-3 삭제 없음 | 없음 — `applyPush`가 `orphaned`만 세운다 |
| §0-4 export 결정성 | 없음 |
| §0-5 `projectId` 좁힘 | ⚠️ 인가가 준 `projectId`·`surfaceId`만. `slug`는 판정 입력이다 |
| §0-6 자격증명 셋 | ⚠️ 읽기는 installation 토큰(`openRepoReader`), 정체성 대조는 user-to-server(`checkRepoAccess`) — Add surface와 같은 배선이고 `credential-separation.test.ts`가 센다 |
| §0-8 readiness | ⚠️ **바꾸지 않는다.** 실패해도 `lastCommitSha`가 남아 `ready`가 유지된다 |
| §0-9 버린 값 | ⚠️ `summarizeImport`가 진다 (§4.3) |
| §0-11 리포 정체성 | ⚠️ **읽기 전에 대조한다** — `runFirstIngest`에는 없는 검사다 (`spec.md` §7 구현 판단 3) |
| **인증 경계 (§6)** | ⚠️ 두 Action 다 `project:settings`. 버튼 감춤은 편의 |

## 10. POSTMORTEM에서 소환한 것

```
grep -n "확인 Dialog\|임포트\|lastImportStartedAt\|revalidatePath\|applyPush" docs/POSTMORTEM.md
```

### 10.1 2026-09-14 — 확인 Dialog의 유일한 논거가 반대 방향으로 거짓이었다

> **거짓이 비싼 이유는 자리 때문이다** — 되돌릴 수 없는 동작의 확인 화면은 사용자가 **그 문장만 읽고**
> 판단하는 자리이고 … **집계를 근거로 세울 때 "그 수가 세는 것"과 "그 동작이 바꾸는 것"이 같은
> 집합인지 먼저 센다.**

⚠️ **이 기능이 정확히 그 축이고 방향이 반대다** — `countUnpublished`가 **부분집합**이다
(`spec.md` §6.2). 재발 방지 둘을 그대로 적용한다:

1. **결과를 단언하는 문구는 그 결과를 내는 코드를 지목한다** — 사전 주석에 `lib/push/apply.ts`의
   `"updatedBy" = NULL`을 심볼로 적는다.
2. **전수 grep을 다시 돌린다**: `grep -nE "will be replaced|won't be able|will stop|no longer" messages/en.tsx`
   → 새로 더한 문장이 참인지 코드로 되짚는다.

### 10.2 2026-09-13 — 임포트 종료의 소유권과 실패 캐시 무효화가 빠졌다

> A 적재 시작 → B 시작 → A 성공에서 B의 진행 시각이 null이 됐고 … 캐시 무효화는 성공 반환 앞에만 있었다.

⚠️ **이 기능이 그 경로의 새 소비자다.** 지켜야 할 셋:
- `finishImportRun`은 **자기 `startedAt`을 대조한다** — 이미 그렇게 구현돼 있고 우회하지 않는다.
- **적재 전체를 `try`로 감싼다** — 리더 생성 예외도 표시를 남기고 던지면 안 된다.
- **무효화는 `finally`다.**
- 재발 방지 grep을 다시 돈다:
  `rg -n 'lastImportStartedAt|markImportStarted|finishImportRun|revalidatePath' lib app | rg -v __tests__`

### 10.3 2026-09-07 — `revalidatePath`가 결과 Alert를 언마운트했다 (§0 불변식 9의 확장)

> 판정은 옳았고 전달이 사라졌다.

⚠️ **결과 Alert를 `revalidatePath`가 바꾸는 조건부 분기 안에 두지 않는다** — 상태는 머리가 든다 (§6.1).

### 10.4 2026-09-14 — 거부 문구가 화면에 없는 버튼 이름을 가리켰다

⚠️ Dialog의 `Send changes first`가 **그 화면의 실제 버튼 이름**과 같아야 한다
(`m.translations.publish.button` = `Send changes`). **`Publish`라고 쓰지 않는다.**

### 10.5 2026-09-14 — TransactionClient를 런타임 속성으로 구별해 첫 적재가 자기 잠금을 기다렸다

⚠️ **표면 루프에서 `applyPush`(배열형)를 쓴다, `applyPushInTransaction`이 아니다** — 바깥에 열린
트랜잭션이 없기 때문이다. **어느 모양인지는 호출부가 안다** (`lib/push/apply.ts`의 주석).

### 10.6 2026-09-02 — base 교체 push가 조용히 전 키에 검토 표시를 붙였다

⚠️ **`previousBaseLocale`을 `null`로 넘기지 않는다** (§3.2). 재적재는 저장된 값을 넘긴다.

## 11. 라우트·URL

**변경 없다.** Home(`routes.project(slug)`)에 `?e=` 슬롯을 만들지 않는다 — 결과는 인라인 Alert다.

## 12. 테스트

### 새로 필요한 것

| 파일 | 무엇을 |
|---|---|
| `lib/import/__tests__/plan.test.ts` | 거부 순서 · **stale 회수**(경계 정각 포함) · 포맷 셋 빠진 표면 제외 · 보관 표면 제외 · `no-surfaces` |
| `lib/import/__tests__/confirm.test.ts` | **`unsent = 0 ∧ openPr ≠ null`에서 경고가 선다** · `undefined`가 `null`로 안 접힌다 · `recommendSend` |
| `lib/import/__tests__/result.test.ts` | `unreadable.length > 0`에서 tone이 `success`가 아니다 (불변식 9) · **slug가 입력 순서대로 나온다**(결정성 — 같은 결과가 같은 문장을 내야 한다) |
| `lib/import/__tests__/surface.test.ts` | ⚠️ **`runFirstIngest`의 기존 단언을 그대로 옮긴다** — 추출이 판정을 안 바꿨다는 증거 |
| `app/(edit)/projects/__tests__/…` | Action의 게이트 순서 · **표면 하나 실패가 나머지를 막지 않는다** · `revalidatePath`가 실패에도 돈다 |
| `components/__tests__/sync-button.test.tsx` | EDITOR에게 버튼이 **없다** · Dialog 문구 세 갈래 · `Send changes first` 링크의 목적지 |
| `pnpm test:projects:postgres` | 재적재 왕복 · 표면 A 성공 / B 실패에서 A의 키가 남는다 (**손으로 돌린다**) |

### 깨질 것

| 파일 | 왜 |
|---|---|
| `app/(edit)/projects/__tests__/…`의 `runFirstIngest` 관련 | 본문이 헬퍼로 빠진다. **판정 단언은 그대로 통과해야 한다** — 통과하지 않으면 추출이 뭔가를 바꾼 것이다 |
| `lib/github-connect/__tests__/credential-separation.test.ts` | 새 모듈이 `RepoReader`를 든다 — 그 검사의 대상 목록이 늘 수 있다 |
| `app/__tests__/entry-points.test.ts` | 진입점 둘이 는다. permission을 이름으로 고정한다 |
| `components/__tests__/client-graph.test.ts` | `sync-button.tsx`가 `"use client"`다 — ⚠️ **그 그래프가 `lib/import/`를 끌어오면 안 된다**. Action만 import하고 판정 모듈은 서버에 남긴다 |

⚠️ **격리 PG 검사가 이 기능의 유일한 진짜 방어선이다** — 하네스의 `$transaction`에는 직렬화가 없고
`$executeRaw`가 no-op이다 (POSTMORTEM 2026-09-05).

## 13. 구현 뒤

1. **`/design-sync sync-repository`** — 시안이 서면 돈다 (`design-prompt.md`가 그 시안을 만든다).
2. **`/l10n-roundtrip`** — ⚠️ **폐기용 리포로만.** `i18n-format-check`에 일부러 깨진 파일을 넣어
   표면 하나 실패 갈래를 실물로 밟는다. 되돌리는 절차를 같이 적는다.
3. ⚠️ **브라우저로 밟기 어려운 갈래**:

| 갈래 | 어떻게 밟나 |
|---|---|
| 기본(미발송 0 · PR 없음) | dev의 `bugshot-i18n-test-qa` ✅ |
| 미발송 N | 셀 하나를 고치고 Sync ✅ |
| 열린 PR 경고 | Publish로 PR을 연 뒤 머지하지 않고 Sync ✅ |
| PR 조회 실패 | ⚠️ **만드는 방법이 정해지지 않았다** — 네트워크 차단 말고는 길이 없다 |
| `already-running` | ⚠️ **레이스라 손으로 못 만든다** — 격리 PG 검사가 그 자리다 |
| stale 회수 | ⚠️ 같은 이유. 단위 테스트 + PG 검사 |
| 표면 부분 실패 | `i18n-format-check`에 깨진 파일 ✅ |
